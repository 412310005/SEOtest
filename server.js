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

function extractGeoAnalytics($, pageUrl) {
  const hreflangTags = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    hreflangTags.push({ lang: $(el).attr('hreflang'), href: $(el).attr('href') });
  });
  const hasEnUs = hreflangTags.some(t => t.lang === 'en-US' || t.lang === 'en');

  const schemaTypes = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html());
      const types = [].concat(Array.isArray(json) ? json.map(j => j['@type']) : json['@type']).filter(Boolean);
      schemaTypes.push(...types);
    } catch {}
  });

  const paraWords = [];
  $('p').each((_, el) => {
    const w = $(el).text().trim().split(/\s+/).filter(Boolean).length;
    if (w > 20) paraWords.push(w);
  });
  const idealParas = paraWords.filter(w => w >= 40 && w <= 150).length;

  const hasAddress = $('address').length > 0;
  const hasTel     = $('a[href^="tel:"]').length > 0;
  const hasEmail   = $('a[href^="mailto:"]').length > 0;
  const hasLocalBizSchema = schemaTypes.some(t =>
    ['LocalBusiness', 'Restaurant', 'FoodEstablishment', 'Organization', 'Person'].includes(t)
  );
  const titleText   = $('title').text().trim().toLowerCase();
  const ogTitleText = ($('meta[property="og:title"]').attr('content') || '').toLowerCase();
  const consistentName = !!(ogTitleText && titleText &&
    (ogTitleText.includes(titleText.split('|')[0].trim()) || titleText.includes(ogTitleText)));

  let platform = 'generic';
  try {
    const h = new URL(pageUrl).hostname;
    if (h.includes('portaly')) platform = 'portaly';
    else if (h.includes('eatq')) platform = 'eatq';
  } catch {}

  return {
    platform,
    hreflang: { tags: hreflangTags, count: hreflangTags.length, hasEnUs },
    schema: { types: schemaTypes, hasLocalBiz: hasLocalBizSchema },
    semanticChunking: { totalParas: paraWords.length, idealParas },
    brandEntity: { hasAddress, hasTel, hasEmail, hasLocalBizSchema, consistentName },
  };
}

function extractAnalytics($, pageUrl, responseTimeMs) {
  const title = $('title').text().trim();
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  const robotsMeta = $('meta[name="robots"]').attr('content') || '';
  const lang = $('html').attr('lang') || '';
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  const ogImage = !!$('meta[property="og:image"]').attr('content');
  const h1Text = $('h1').first().text().trim();
  const totalImages = $('img').length;
  const imagesWithoutAlt = $('img').filter((_, el) => !$(el).attr('alt')).length;

  $('body script, body style').remove();
  const words = $('body').text().trim().split(/\s+/).filter(Boolean);

  let internalLinks = 0;
  let externalLinks = 0;
  try {
    const base = new URL(pageUrl);
    $('a[href]').each((_, el) => {
      try {
        const href = $( el).attr('href');
        const link = new URL(href, pageUrl);
        if (link.hostname === base.hostname) internalLinks++;
        else externalLinks++;
      } catch {}
    });
  } catch {}

  return {
    wordCount: words.length,
    title: { content: title, length: title.length },
    metaDescription: { content: metaDesc, length: metaDesc.length },
    headings: { h1: $('h1').length, h2: $('h2').length, h3: $('h3').length, h1Text },
    images: { total: totalImages, missingAlt: imagesWithoutAlt },
    links: { internal: internalLinks, external: externalLinks },
    canonical,
    robotsMeta,
    lang,
    openGraph: { title: ogTitle, description: ogDesc, image: ogImage },
    responseTimeMs,
  };
}

app.post('/analyze', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const t0 = Date.now();
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOtest/1.0)' },
      timeout: 10000,
    });
    const responseTimeMs = Date.now() - t0;

    const $ = cheerio.load(html);
    const analytics = extractAnalytics($, url, responseTimeMs);
    const geoAnalytics = extractGeoAnalytics($, url);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const { headings, images, links, openGraph } = analytics;
    const prompt = `You are an SEO expert. Analyze the following on-page SEO metrics and provide a detailed audit.

SEO Metrics:
- Word Count: ${analytics.wordCount} words
- Title Tag: "${analytics.title.content}" (${analytics.title.length} chars; ideal: 50–60)
- Meta Description: "${analytics.metaDescription.content}" (${analytics.metaDescription.length} chars; ideal: 150–160)
- H1 Tags: ${headings.h1} found${headings.h1Text ? `; first H1: "${headings.h1Text}"` : ''}
- H2 / H3 Tags: ${headings.h2} / ${headings.h3}
- Images: ${images.total} total, ${images.missingAlt} missing alt text
- Internal Links: ${links.internal} | External Links: ${links.external}
- Canonical URL: ${analytics.canonical || 'not set'}
- Robots Meta: ${analytics.robotsMeta || 'not set'}
- Open Graph: title=${openGraph.title ? `"${openGraph.title}"` : 'missing'}, description=${openGraph.description ? 'set' : 'missing'}, image=${openGraph.image ? 'set' : 'missing'}
- Page Language: ${analytics.lang || 'not set'}
- Server Response Time: ${analytics.responseTimeMs}ms

GEO & 2026 Vibe Metrics:
- Platform detected: ${geoAnalytics.platform}
- Hreflang tags: ${geoAnalytics.hreflang.count} found${geoAnalytics.hreflang.hasEnUs ? ', includes en/en-US' : ', NO en-US tag'}
- Schema Markup types: ${geoAnalytics.schema.types.join(', ') || 'none'}
- Semantic paragraphs in ideal range (40-150 words): ${geoAnalytics.semanticChunking.idealParas}/${geoAnalytics.semanticChunking.totalParas}
- Brand Entity: address tag=${geoAnalytics.brandEntity.hasAddress}, phone=${geoAnalytics.brandEntity.hasTel}, email=${geoAnalytics.brandEntity.hasEmail}, LocalBusiness schema=${geoAnalytics.brandEntity.hasLocalBizSchema}, OG/title consistent=${geoAnalytics.brandEntity.consistentName}

Respond ONLY in valid JSON with this exact structure:
{
  "seoScore": { "score": <number 0-100>, "explanation": "<2-3 sentence summary>" },
  "categoryScores": {
    "content": <0-100>,
    "technical": <0-100>,
    "onPage": <0-100>,
    "accessibility": <0-100>
  },
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>", "<actionable suggestion 3>", "<actionable suggestion 4>", "<actionable suggestion 5>"],
  "blogIdeas": ["<idea1>", "<idea2>"],
  "geoScore": { "score": <number 0-100>, "explanation": "<2-3 sentence global readiness summary>" },
  "geoInsights": {
    "vibeReadiness": <number 0-100>,
    "hreflangStatus": "<brief assessment>",
    "schemaStatus": "<brief assessment>",
    "semanticChunkingStatus": "<brief assessment>",
    "brandEntityStatus": "<brief assessment>",
    "usToneAssessment": "<1-2 sentences on tone fit for North American audience>",
    "geoSuggestions": ["<suggestion1>", "<suggestion2>", "<suggestion3>"]
  }
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');

    const aiInsights = JSON.parse(jsonMatch[0]);
    res.json({ analytics, aiInsights, geoAnalytics });

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
