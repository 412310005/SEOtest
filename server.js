require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
  console.warn('⚠️  GEMINI_API_KEY is not set. Copy .env.example to .env and add your key.');
}

function classifyGeminiError(message) {
  if (message.includes('API_KEY_INVALID') || message.includes('API key not valid')) {
    return 'Invalid Gemini API key. Please set a valid GEMINI_API_KEY in your .env file.';
  }
  if (message.includes('QUOTA_EXCEEDED') || message.includes('quota')) {
    return 'Gemini API quota exceeded. Please try again later or use a different API key.';
  }
  if (message.includes('PERMISSION_DENIED')) {
    return 'Gemini API access denied. Please check your API key has the Generative Language API enabled.';
  }
  return 'AI analysis failed. Please check your API configuration and try again.';
}

function extractAnalytics($) {
  const title = $('title').text().trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  $('body script, body style').remove();
  const words = $('body').text().trim().split(/\s+/).filter(Boolean);
  const imagesWithoutAlt = $('img').filter((_, el) => !$(el).attr('alt')).length;

  return {
    wordCount: words.length,
    title: { content: title, length: title.length },
    metaDescription: { content: metaDesc, length: metaDesc.length },
    headings: { h1: $('h1').length, h2: $('h2').length, h3: $('h3').length },
    imagesWithoutAlt,
  };
}

app.post('/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOtest/1.0)' },
      timeout: 10000,
    });

    const $ = cheerio.load(html);
    const analytics = extractAnalytics($);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an SEO expert. Analyze the following on-page SEO metrics and provide:
1. An overall SEO Score out of 100 with a brief explanation (2-3 sentences).
2. A prioritized checklist of 3-5 specific, actionable improvement suggestions.
3. Two creative blog post ideas based on the page's topic.

SEO Metrics:
- Word Count: ${analytics.wordCount}
- Title Tag: "${analytics.title.content}" (${analytics.title.length} characters)
- Meta Description: "${analytics.metaDescription.content}" (${analytics.metaDescription.length} characters)
- H1 / H2 / H3 Tags: ${analytics.headings.h1} / ${analytics.headings.h2} / ${analytics.headings.h3}
- Images Missing Alt Text: ${analytics.imagesWithoutAlt}

Respond ONLY in valid JSON with this exact structure:
{
  "seoScore": { "score": <number 0-100>, "explanation": "<string>" },
  "suggestions": ["<suggestion1>", "<suggestion2>", "<suggestion3>"],
  "blogIdeas": ["<idea1>", "<idea2>"]
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');

    const aiInsights = JSON.parse(jsonMatch[0]);
    res.json({ analytics, aiInsights });

  } catch (err) {
    console.error(err.message);
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      res.status(400).json({ error: 'Could not reach the provided URL. Please check it and try again.' });
    } else if (err.response) {
      res.status(400).json({ error: `The target page returned HTTP ${err.response.status}. It may block scrapers or the URL may be wrong.` });
    } else if (err.message && err.message.includes('generativelanguage')) {
      res.status(500).json({ error: classifyGeminiError(err.message) });
    } else {
      res.status(500).json({ error: 'Analysis failed. Please try again.' });
    }
  }
});

app.listen(PORT, () => console.log(`SEOtest running at http://localhost:${PORT}`));
