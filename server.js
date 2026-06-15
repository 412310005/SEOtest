require('dotenv').config();
const path = require('path');
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Startup env check ──────────────────────────────────────────────────────
const keyStatus = !process.env.GEMINI_API_KEY
  ? 'MISSING'
  : process.env.GEMINI_API_KEY === 'your_gemini_api_key_here'
    ? 'PLACEHOLDER'
    : `SET (length=${process.env.GEMINI_API_KEY.length}, prefix=${process.env.GEMINI_API_KEY.slice(0, 8)}...)`;

console.log(`[startup] NODE_ENV       = ${process.env.NODE_ENV || 'not set'}`);
console.log(`[startup] GEMINI_API_KEY = ${keyStatus}`);
console.log(`[startup] PORT           = ${process.env.PORT || 3000}`);

if (keyStatus !== 'SET') {
  console.warn('⚠️  GEMINI_API_KEY is not set or is a placeholder. Copy .env.example to .env and add your key.');
}

// ── Gemini error classifier ────────────────────────────────────────────────
function classifyGeminiError(err) {
  const msg = (err.message || '').toLowerCase();
  const status = err.status || err.code || '';

  console.error('[gemini-error] name    :', err.name);
  console.error('[gemini-error] message :', err.message);
  console.error('[gemini-error] status  :', status);

  // API key issues
  if (msg.includes('api_key_invalid') || msg.includes('api key not valid') || msg.includes('invalid api key')) {
    return 'Invalid Gemini API key. Please set a valid GEMINI_API_KEY in your environment variables.';
  }
  // Vercel / server env: key not set at all
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return 'GEMINI_API_KEY is missing from the server environment. Please add it in Vercel → Settings → Environment Variables.';
  }
  // 503 / Service overloaded / high demand
  if (
    status === 503 || status === '503' ||
    msg.includes('503') ||
    msg.includes('service unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('currently unavailable')
  ) {
    return 'Gemini 目前服務忙碌，網站爬取已成功，但 AI 分析暫時無法產生。請稍後再試。';
  }
  // Quota / rate limit
  if (msg.includes('quota_exceeded') || msg.includes('resource_exhausted') || msg.includes('quota') || msg.includes('rate limit')) {
    return 'Gemini API quota exceeded or rate limited. Please try again later or check your quota at aistudio.google.com.';
  }
  // Permission
  if (msg.includes('permission_denied') || msg.includes('403')) {
    return 'Gemini API access denied. Please check your API key has the Generative Language API enabled in Google Cloud Console.';
  }
  // Model not found
  if (msg.includes('model_not_found') || msg.includes('not found') || msg.includes('404')) {
    return 'Gemini model "gemini-2.5-flash" not found. The model name may have changed — check the Google AI docs.';
  }
  // Response format / JSON parse (thrown internally, not from API)
  if (err.message === 'Invalid AI response format') {
    return 'Gemini returned a response that could not be parsed as JSON. This may be a temporary issue — please try again.';
  }
  // Timeout
  if (msg.includes('timeout') || err.code === 'ETIMEDOUT') {
    return 'Gemini API request timed out. Please try again in a moment.';
  }
  // Catch-all with raw message for easier debugging
  return `AI analysis failed: ${err.message || 'Unknown error'}. Check server logs for details.`;
}

// ── Overload detection ────────────────────────────────────
function isOverloaded(err) {
  const msg    = (err.message || '').toLowerCase();
  const status = err.status || err.code || '';
  return (
    status === 503 || status === '503' ||
    msg.includes('503') ||
    msg.includes('service unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('currently unavailable')
  );
}

// ── Gemini call with retry + fallback model ────────────────
const PRIMARY_MODEL  = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.0-flash';
const RETRY_DELAYS   = [2000, 4000, 8000]; // ms between retries

async function callGeminiWithRetry(genAI, prompt) {
  // Try primary model up to (1 + RETRY_DELAYS.length) times
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      if (attempt > 0) {
        const wait = RETRY_DELAYS[attempt - 1];
        console.log(`[gemini-retry] Attempt ${attempt + 1}/${RETRY_DELAYS.length + 1} on ${PRIMARY_MODEL} — waiting ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      }
      const model = genAI.getGenerativeModel({ model: PRIMARY_MODEL });
      const result = await model.generateContent(prompt);
      console.log(`[gemini-retry] ${PRIMARY_MODEL} succeeded on attempt ${attempt + 1}`);
      return result.response.text();
    } catch (err) {
      console.warn(`[gemini-retry] ${PRIMARY_MODEL} attempt ${attempt + 1} failed:`, err.message);
      if (!isOverloaded(err) || attempt === RETRY_DELAYS.length) throw err;
    }
  }

  // Fallback to gemini-2.0-flash
  console.log(`[gemini-retry] All ${PRIMARY_MODEL} attempts exhausted — trying fallback ${FALLBACK_MODEL}...`);
  try {
    const fallback = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
    const result   = await fallback.generateContent(prompt);
    console.log(`[gemini-retry] Fallback ${FALLBACK_MODEL} succeeded`);
    return result.response.text();
  } catch (fallbackErr) {
    console.error(`[gemini-retry] Fallback ${FALLBACK_MODEL} also failed:`, fallbackErr.message);
    // Surface a friendly overloaded error regardless of fallback reason
    const friendly = new Error('Gemini 目前服務忙碌，網站爬取已成功，但 AI 分析暫時無法產生。請稍後再試。');
    friendly.isGeminiFriendly = true;
    throw friendly;
  }
}

// ── Internal link extractor ───────────────────────────────────────────────
function extractInternalLinks($, baseUrl, limit = 10) {
  let base;
  try { base = new URL(baseUrl); } catch { return []; }

  const skipExt  = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|mp[34]|avi|mov|ico|woff2?)$/i;
  const skipProto = /^(mailto:|tel:|javascript:|#)/i;
  const seen = new Set();

  // Normalize URL for dedup: strip hash + trailing slash, keep path+search
  function norm(href) {
    try {
      const u = new URL(href, baseUrl);
      if (u.hostname !== base.hostname) return null;
      if (skipProto.test(href))          return null;
      if (skipExt.test(u.pathname))      return null;
      u.hash = '';
      return (u.origin + u.pathname).replace(/\/$/, '') + u.search;
    } catch { return null; }
  }

  const homeNorm = (base.origin + base.pathname).replace(/\/$/, '');
  seen.add(homeNorm);

  const results = [];

  function add(el) {
    if (results.length >= limit) return;
    const href = $(el).attr('href') || '';
    const n = norm(href);
    if (!n || seen.has(n)) return;
    seen.add(n);
    try {
      const u = new URL(href, baseUrl);
      u.hash = '';
      results.push(u.href.replace(/\/$/, ''));
    } catch {}
  }

  // Priority 1: navigation / header links (likely important pages)
  $('nav a[href], [role="navigation"] a[href], header a[href]').each((_, el) => add(el));
  // Priority 2: remaining body links
  $('main a[href], article a[href], a[href]').each((_, el) => add(el));

  return results;
}

// ── Single-page summary fetcher ───────────────────────────────────────────
async function fetchPageSummary(url) {
  const t0 = Date.now();
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOtest/1.0)' },
      timeout: 7000,
    });
    const responseTimeMs = Date.now() - t0;
    const $ = cheerio.load(html);

    const title   = $('title').text().trim();
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const h1      = $('h1').first().text().trim();
    const h2s     = $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 6);

    // Count H tags + images BEFORE removing nav noise
    const h1Count        = $('h1').length;
    const h2Count        = $('h2').length;
    const h3Count        = $('h3').length;
    const imageTotal     = $('img').length;
    const imageMissingAlt = $('img').filter((_, el) => !$(el).attr('alt')).length;

    // Collect content-area image URLs for OCR (before removing noise)
    const pageImages = [];
    const seenImgSrc = new Set();
    $('main img, article img, section img, .content img, [class*="card"] img, [class*="case"] img, [class*="result"] img, img').each((_, el) => {
      const raw = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy') || '';
      if (!raw || raw.startsWith('data:')) return;
      try {
        const absUrl = new URL(raw, url).href;
        if (seenImgSrc.has(absUrl)) return;
        seenImgSrc.add(absUrl);
        pageImages.push({ src: absUrl, alt: $(el).attr('alt') || '', fromPage: url });
      } catch {}
    });

    // Remove nav/header/footer noise before extracting body text
    $('script, style, nav, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    const bodyText  = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 800);
    const wordCount = $('body').text().trim().split(/\s+/).filter(Boolean).length;

    // Extract same-domain links for BFS (before stripping nav/header)
    const $full = cheerio.load(html);
    const discoveredLinks = extractInternalLinks($full, url, 50);

    return {
      url, title, metaDesc, h1, h2s, bodyText, wordCount, responseTimeMs, status: 'ok',
      h1Count, h2Count, h3Count, imageTotal, imageMissingAlt, discoveredLinks, pageImages,
    };
  } catch (e) {
    console.warn(`[crawl] SKIP ${url} — ${e.message}`);
    return { url, status: 'error', error: e.message, discoveredLinks: [] };
  }
}

// ── Image Discovery & OCR ─────────────────────────────────────────────────

const SKIP_IMG_EXT  = /\.(svg|gif|ico|woff2?|ttf|eot|webp)(\?.*)?$/i;
const SKIP_IMG_HOST = /gravatar\.com|googletagmanager|google-analytics|facebook\.com|twitter\.com|linkedin\.com/i;
const SKIP_IMG_PATH = /pixel|tracking|1x1|beacon|analytics|logo|icon|sprite|avatar|placeholder|blank/i;
const MAX_OCR_IMAGES = 6; // per-run cap to control cost & latency
const MAX_IMG_BYTES  = 4 * 1024 * 1024; // 4 MB per image

// Returns the top N candidate images most likely to carry business content
function discoverContentImages(pages) {
  const seen   = new Set();
  const assets = [];

  for (const p of pages) {
    if (p.status !== 'ok' || !p.pageImages) continue;
    for (const img of p.pageImages) {
      const { src } = img;
      if (!src || seen.has(src)) continue;
      if (SKIP_IMG_EXT.test(src)) continue;
      if (SKIP_IMG_HOST.test(src)) continue;
      if (SKIP_IMG_PATH.test(src)) continue;
      seen.add(src);
      // Score: alt text with numbers / business keywords → higher priority
      const altScore = /\d|%|ROI|案例|成本|效益|導入|節省|銷售|訓練|培訓/i.test(img.alt) ? 3 : 0;
      assets.push({ ...img, _score: altScore });
    }
  }

  // Sort by score (data-rich alt first), then take top N
  assets.sort((a, b) => b._score - a._score);
  return assets.slice(0, MAX_OCR_IMAGES).map(({ _score, ...rest }) => rest);
}

// Downloads images and runs a single Gemini Vision call for OCR
async function ocrImagesWithGemini(imageAssets, genAI) {
  const totalFound = imageAssets.length;
  if (totalFound === 0) {
    return { imageTextSummary: '', ocrResults: [], totalFound: 0, ocrCount: 0 };
  }

  // Step 1: Download images → base64
  const imageParts   = [];
  const successUrls  = [];

  for (const asset of imageAssets) {
    try {
      const { data, headers } = await axios.get(asset.src, {
        responseType:     'arraybuffer',
        timeout:          8000,
        maxContentLength: MAX_IMG_BYTES,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOtest/1.0)' },
      });
      const mimeType = (headers['content-type'] || 'image/jpeg').split(';')[0].trim();
      if (!mimeType.startsWith('image/')) continue;
      imageParts.push({ inlineData: { data: Buffer.from(data).toString('base64'), mimeType } });
      successUrls.push(asset.src);
      console.log(`[ocr] Downloaded ${asset.src.slice(-60)} (${Math.round(data.byteLength / 1024)}KB)`);
    } catch (e) {
      console.warn(`[ocr] Skip ${asset.src.slice(-60)} — ${e.message}`);
    }
  }

  if (imageParts.length === 0) {
    return { imageTextSummary: '', ocrResults: [], totalFound, ocrCount: 0 };
  }

  // Step 2: Single Gemini Vision call with all images
  const textPrompt = {
    text: `你是品牌內容分析師。請分析以下 ${imageParts.length} 張網站圖片，提取商業重要資訊。

請找出並條列：
- 數字指標（成本節省、ROI、百分比、客戶數量、使用者數）
- 案例名稱（公司名稱、機構名稱、品牌名稱）
- 產品/服務名稱與功能說明
- 目標客群描述
- 任何清晰可讀的文字標題與說明

每點不超過50字。只條列圖片中確實可見的資訊，不要推測或補充。
用繁體中文回答，以「・」作為條列符號。`,
  };

  try {
    const model = genAI.getGenerativeModel({ model: FALLBACK_MODEL }); // gemini-2.0-flash has good vision
    const result = await model.generateContent([textPrompt, ...imageParts]);
    const imageTextSummary = result.response.text().trim();
    console.log(`[ocr] Vision OK — ${imageParts.length} images, summary length=${imageTextSummary.length}`);
    return {
      imageTextSummary,
      ocrResults: successUrls.map((url, i) => ({ index: i + 1, url })),
      totalFound,
      ocrCount: imageParts.length,
    };
  } catch (e) {
    console.warn(`[ocr] Gemini vision failed — ${e.message}`);
    return { imageTextSummary: '', ocrResults: [], totalFound, ocrCount: 0, error: e.message };
  }
}

// ── Sitemap Discovery ─────────────────────────────────────────────────────
async function fetchSitemapUrls(baseOrigin) {
  const fetchedSitemaps = new Set();
  const pageUrls        = new Set();

  async function parseSitemap(sitemapUrl, depth) {
    if (depth > 2 || fetchedSitemaps.has(sitemapUrl)) return;
    fetchedSitemaps.add(sitemapUrl);
    try {
      const { data } = await axios.get(sitemapUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOtest/1.0)' },
        timeout: 8000,
      });
      // <loc> entries; some are nested sitemap URLs, others are page URLs
      const locs = [...data.matchAll(/<loc[^>]*>\s*(.*?)\s*<\/loc>/g)].map(m => m[1].trim());
      for (const loc of locs) {
        if (/\.xml(\?.*)?$/i.test(loc)) {
          await parseSitemap(loc, depth + 1);
        } else {
          pageUrls.add(loc);
        }
      }
      if (locs.length > 0) console.log(`[sitemap] ${sitemapUrl} → ${locs.length} entries`);
    } catch {}
  }

  // 1. robots.txt Sitemap: directives
  try {
    const { data } = await axios.get(`${baseOrigin}/robots.txt`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOtest/1.0)' },
      timeout: 5000,
    });
    const refs = [...data.matchAll(/^Sitemap:\s*(.+)$/gim)].map(m => m[1].trim());
    for (const r of refs) await parseSitemap(r, 0);
  } catch {}

  // 2. Standard locations (if robots.txt yielded nothing)
  if (pageUrls.size === 0) {
    for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap']) {
      await parseSitemap(`${baseOrigin}${path}`, 0);
      if (pageUrls.size > 0) break;
    }
  }

  console.log(`[sitemap] Total page URLs found: ${pageUrls.size}`);
  return [...pageUrls];
}

// ── BFS Full Site Crawler ─────────────────────────────────────────────────
const MAX_CRAWL_PAGES = 60;

async function crawlFullSite(startUrl) {
  const baseOrigin = new URL(startUrl).origin;

  // Normalise URL for dedup: strip hash, strip trailing slash (except root)
  function normUrl(raw, base) {
    try {
      const u = new URL(raw, base || baseOrigin);
      if (u.origin !== baseOrigin) return null;
      u.hash = '';
      const clean = (u.origin + u.pathname).replace(/\/$/, '') || u.origin;
      return clean + u.search;
    } catch { return null; }
  }

  const skipExt = /\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|mp[34]|avi|mov|ico|woff2?)$/i;
  const visited  = new Set();
  const queue    = [];
  const pages    = [];

  function enqueue(rawUrl) {
    if (skipExt.test(rawUrl)) return;
    const n = normUrl(rawUrl);
    if (!n || visited.has(n)) return;
    visited.add(n);
    queue.push(n);
  }

  // ── Seed from sitemap ──────────────────────────────────
  console.log('[full-crawl] Checking sitemap...');
  const sitemapUrls = await fetchSitemapUrls(baseOrigin);
  sitemapUrls.forEach(u => enqueue(u));

  // Homepage always first
  const homeNorm = normUrl(startUrl) || startUrl;
  if (!visited.has(homeNorm)) {
    visited.add(homeNorm);
    queue.unshift(homeNorm);
  } else {
    const idx = queue.indexOf(homeNorm);
    if (idx > 0) { queue.splice(idx, 1); queue.unshift(homeNorm); }
  }

  console.log(`[full-crawl] BFS start — discovered ${visited.size} (${sitemapUrls.length} from sitemap), queue=${queue.length}`);

  // ── BFS Loop ───────────────────────────────────────────
  while (queue.length > 0 && pages.length < MAX_CRAWL_PAGES) {
    const url = queue.shift();
    console.log(`[full-crawl] [${pages.length + 1}/${MAX_CRAWL_PAGES}] Fetching ${url}`);

    const page = await fetchPageSummary(url);
    pages.push(page);

    // Enqueue links discovered from this page
    for (const link of (page.discoveredLinks || [])) {
      enqueue(link);
    }
  }

  const successPages = pages.filter(p => p.status === 'ok').length;
  const failedPages  = pages.filter(p => p.status === 'error').length;
  const coverage = {
    discoveredPages: visited.size,
    crawledPages:    pages.length,
    successPages,
    failedPages,
    coverageRate:    Math.round((pages.length / Math.max(visited.size, 1)) * 100),
    cappedAt:        pages.length >= MAX_CRAWL_PAGES ? MAX_CRAWL_PAGES : null,
  };

  console.log(`[full-crawl] Done — discovered=${coverage.discoveredPages}, crawled=${coverage.crawledPages}, ok=${successPages}, failed=${failedPages}, rate=${coverage.coverageRate}%`);
  return { pages, coverage };
}

// ── Site-wide analytics aggregator ────────────────────────────────────────
function buildSiteAnalytics(crawledPages) {
  const ok = crawledPages.filter(p => p.status === 'ok');
  if (ok.length === 0) return null;
  const totalWords = ok.reduce((s, p) => s + (p.wordCount || 0), 0);
  return {
    pageCount:      ok.length,
    totalWordCount: totalWords,
    avgWordCount:   Math.round(totalWords / ok.length),
    totalH1:        ok.reduce((s, p) => s + (p.h1Count || 0), 0),
    totalH2:        ok.reduce((s, p) => s + (p.h2Count || 0), 0),
    totalH3:        ok.reduce((s, p) => s + (p.h3Count || 0), 0),
    totalImages:    ok.reduce((s, p) => s + (p.imageTotal || 0), 0),
    missingAlt:     ok.reduce((s, p) => s + (p.imageMissingAlt || 0), 0),
  };
}

// ── Site Entity Extraction ────────────────────────────────────────────────
function extractSiteEntities(pages) {
  const freq = {};
  const skip = new Set([
    // Common English stop words
    'the','and','for','with','our','your','this','that','from','have','more','are',
    'has','its','we','you','be','to','of','in','a','an','is','it','at','by','as',
    'or','but','all','can','will','not','how','what','who','new','get','use','make',
    'see','do','if','on','up','any','may','also','into','than','then','so','about',
    'which','when','their','they','these','been','were','would','each','over','out',
    'one','two','three','like','just','home','page','learn','read','more','menu',
    'contact','about','privacy','terms','cookie',
    // Common Chinese
    '的','是','了','在','和','我','有','就','不','這','您','他','她','與','及','以',
    '為','對','於','等','都','也','但','而','或','由','後','前','中','上','下','到',
  ]);

  for (const p of pages) {
    if (p.status !== 'ok') continue;
    // Titles & headings carry the most entity signal
    const highSignal = [p.title, p.h1, ...(p.h2s || [])].filter(Boolean);
    const lowSignal  = p.bodyText || '';

    function count(text, weight) {
      // Split on common separators
      text.split(/[\|\-–—\/\\,，。、！？\s]+/).forEach(token => {
        const t = token.trim();
        if (t.length < 2 || t.length > 40) return;
        if (skip.has(t.toLowerCase())) return;
        if (/^\d+$/.test(t)) return; // pure numbers
        freq[t] = (freq[t] || 0) + weight;
      });
    }

    highSignal.forEach(t => count(t, 3));
    count(lowSignal, 1);
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([text, count]) => ({ text, count }));
}

// ── Site Knowledge Map ────────────────────────────────────────────────────
function buildSiteKnowledgeMap(pages) {
  const ok   = pages.filter(p => p.status === 'ok');
  const home = ok[0] || {};

  // Brand name: first segment of homepage title before separator
  const brand = (home.title || '').split(/[\|\-–—]/)[0].trim();

  // Products / services: inner page titles (unique, excluding brand name)
  const products = [...new Set(
    ok.slice(1)
      .map(p => (p.title || '').split(/[\|\-–—]/)[0].trim())
      .filter(t => t && t.length > 1 && t !== brand),
  )].slice(0, 12);

  // Industries: keyword scan across all text
  const INDUSTRY_KW = ['銀行','保險','金融','科技','AI','教育','銷售','培訓','訓練','coaching',
    '企業','製造','醫療','零售','SaaS','B2B','HR','人資','保險','電商','法律','地產'];
  const allText = ok.map(p => [p.title, p.h1, ...(p.h2s || []), p.bodyText].filter(Boolean).join(' ')).join(' ');
  const industries = INDUSTRY_KW.filter(k => new RegExp(k, 'i').test(allText));

  // Target audience keywords
  const AUDIENCE_KW = ['企業','客戶','業務','主管','員工','中小企業','大型企業','業務代表',
    '銷售人員','管理者','領導者','學員','團隊','B2B','SME','startup','founders'];
  const audience = AUDIENCE_KW.filter(k => new RegExp(k, 'i').test(allText));

  // Case / success story pages
  const caseCount = ok.filter(p =>
    /case|story|client|success|customer|案例|客戶|成功|實績/.test(p.url + ' ' + p.title)
  ).length;

  // Contact info from homepage body text
  const contacts = [];
  if (home.bodyText) {
    const email = home.bodyText.match(/[\w.+-]+@[\w-]+\.\w+/);
    if (email) contacts.push(email[0]);
    const tel = home.bodyText.match(/[+\d][\d\-\(\)\s]{7,14}/);
    if (tel) contacts.push(tel[0].trim());
  }

  return {
    brand,
    products,
    industries,
    audience,
    caseCount,
    contact: contacts.join('、') || '未在爬取內容中發現',
    totalPages: ok.length,
  };
}

// ── Compressed Site Summary for Gemini ───────────────────────────────────
function buildCompressedSiteSummary(pages, entities, knowledgeMap, coverage, imageTextSummary = '') {
  const ok         = pages.filter(p => p.status === 'ok');
  const totalWords = ok.reduce((s, p) => s + (p.wordCount || 0), 0);

  const pageList = pages.map((p, i) => {
    if (p.status === 'error') return `[${i + 1}] ${p.url} — ⚠ 無法抓取`;
    return [
      `[${i + 1}${i === 0 ? '・首頁' : ''}] ${p.title || p.url}`,
      `  URL: ${p.url}`,
      `  H1: ${p.h1 || '（無）'} | 字數: ${p.wordCount}`,
      p.h2s?.length  ? `  H2: ${p.h2s.slice(0, 4).join(' / ')}` : '',
      p.bodyText     ? `  摘要: ${p.bodyText.slice(0, 300)}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return [
    '=== 全站爬取概況 ===',
    `發現頁面: ${coverage.discoveredPages} | 成功爬取: ${coverage.successPages} | 失敗: ${coverage.failedPages} | 覆蓋率: ${coverage.coverageRate}%`,
    coverage.cappedAt ? `⚠ 已達爬取上限 ${coverage.cappedAt} 頁（網站可能更大）` : '',
    `總字數: ${totalWords} | 平均字數/頁: ${Math.round(totalWords / Math.max(ok.length, 1))}`,
    '',
    '=== 高頻實體（品牌信號）===',
    entities.slice(0, 15).map(e => `${e.text}(${e.count}次)`).join('、'),
    '',
    '=== 品牌知識地圖 ===',
    `品牌: ${knowledgeMap.brand}`,
    `產品/服務: ${knowledgeMap.products.join('、') || '未能識別'}`,
    `相關產業: ${knowledgeMap.industries.join('、') || '未能識別'}`,
    `目標客群: ${knowledgeMap.audience.join('、') || '未能識別'}`,
    `案例頁數: ${knowledgeMap.caseCount}`,
    `聯絡資訊: ${knowledgeMap.contact}`,
    '',
    ...(imageTextSummary ? [
      '',
      '=== 視覺內容 OCR（圖片中擷取的商業資訊）===',
      imageTextSummary,
    ] : []),
    '',
    '=== 各頁面摘要 ===',
    pageList,
  ].filter(l => l !== '').join('\n');
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

  console.log(`\n[analyze] ── New request ──────────────────────────`);
  console.log(`[analyze] URL: ${url}`);
  console.log(`[analyze] GEMINI_API_KEY present: ${!!process.env.GEMINI_API_KEY}`);

  try {
    // ── Step 1: Fetch target URL ─────────────────────────────────────────
    console.log('[analyze] Step 1: Fetching URL...');
    const t0 = Date.now();
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOtest/1.0)' },
      timeout: 10000,
    });
    const responseTimeMs = Date.now() - t0;
    console.log(`[analyze] Step 1: OK — ${responseTimeMs}ms, html length=${html.length}`);

    // ── Step 2: Parse homepage HTML ──────────────────────────────────────
    console.log('[analyze] Step 2: Parsing HTML with cheerio...');
    const $ = cheerio.load(html);
    const analytics    = extractAnalytics($, url, responseTimeMs);
    const geoAnalytics = extractGeoAnalytics($, url);
    console.log(`[analyze] Step 2: OK — wordCount=${analytics.wordCount}, h1=${analytics.headings.h1}, schema=${geoAnalytics.schema.types.join(',') || 'none'}`);

    // ── Step 2.5: Full-site BFS Crawl ────────────────────────────────────
    console.log('[analyze] Step 2.5: Starting full-site BFS crawl (sitemap + BFS)...');
    const { pages: crawledPages, coverage: crawlCoverage } = await crawlFullSite(url);
    const crawlOk     = crawlCoverage.successPages;
    const crawlFailed = crawlCoverage.failedPages;
    console.log(`[analyze] Step 2.5: OK — discovered=${crawlCoverage.discoveredPages}, crawled=${crawledPages.length} (${crawlOk} ok, ${crawlFailed} failed), rate=${crawlCoverage.coverageRate}%`);

    const siteAnalytics   = buildSiteAnalytics(crawledPages);
    const siteEntities    = extractSiteEntities(crawledPages);
    const siteKnowledgeMap = buildSiteKnowledgeMap(crawledPages);
    console.log(`[analyze] Step 2.5: entities=${siteEntities.length}, brand="${siteKnowledgeMap.brand}", industries=${siteKnowledgeMap.industries.join(',')}`);
    console.log(`[analyze] Step 2.5: siteAnalytics — totalWords=${siteAnalytics?.totalWordCount}, pages=${siteAnalytics?.pageCount}`);

    // ── Step 2.6: Visual Content OCR ─────────────────────────────────────
    console.log('[analyze] Step 2.6: Discovering content images for OCR...');
    const imageAssets = discoverContentImages(crawledPages);
    console.log(`[analyze] Step 2.6: ${imageAssets.length} candidate images found`);
    const imageOCR = await ocrImagesWithGemini(imageAssets, genAI);
    console.log(`[analyze] Step 2.6: OCR done — ocrCount=${imageOCR.ocrCount}, summaryLen=${imageOCR.imageTextSummary.length}`);

    // ── Step 3: Call Gemini API ──────────────────────────────────────────
    console.log(`[analyze] Step 3: Initialising Gemini (primary=${PRIMARY_MODEL}, fallback=${FALLBACK_MODEL})...`);

    const { headings, images, links, openGraph } = analytics;

    // Build compressed site summary (includes OCR visual content)
    const siteSummary = buildCompressedSiteSummary(crawledPages, siteEntities, siteKnowledgeMap, crawlCoverage, imageOCR.imageTextSummary);

    const prompt = `你是一位 AI Search Visibility 分析師，專精於評估品牌在 AI 搜尋工具（Perplexity、ChatGPT Search、Google SGE、Gemini）中的可被發現性、可被理解性與可被推薦性。

你的任務是回答以下核心問題：
1. AI 搜尋引擎是否能「看見」這個品牌的網站內容？
2. AI 是否能「理解」這家公司是誰、提供什麼產品或服務、目標客群是誰、商業價值是什麼？
3. 當使用者向 AI 詢問相關推薦時，這個品牌是否有足夠訊號被提及？
4. 哪些內容目前對 AI 不夠好讀（圖片文字、輪播、動畫、互動模組、JS 動態渲染）？
5. 哪些具體行動可以提升 AI 可見度與推薦機率？

【重要語言規定】
- 所有 JSON value 欄位內容必須使用繁體中文
- JSON key 維持英文
- 語氣請像資深顧問，具體、有依據，避免空洞泛論
- 不要輸出英文段落或說明

【特別注意】
- 若網站有完整導覽架構但爬取字數偏低，請判斷為「機器可讀性風險」而非「內容不足」
- 網站內容可能豐富，但部分核心資訊存在於圖片、輪播或互動模組中，HTML crawler 無法完整讀取
- 若符合上述情況，請在 machineReadabilityRisk 和 missingSignals 中明確說明
- 全站摘要中包含「視覺內容 OCR」區塊，這是從圖片中擷取的商業資訊，請納入品牌理解與推薦潛力分析

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
首頁技術指標（結構化數據）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 字數：${analytics.wordCount} 字
- Title Tag：「${analytics.title.content}」（${analytics.title.length} 字元；理想 50–60）
- Meta Description：「${analytics.metaDescription.content}」（${analytics.metaDescription.length} 字元；理想 150–160）
- H1 標籤：共 ${headings.h1} 個${headings.h1Text ? `；首個 H1：「${headings.h1Text}」` : ''}
- H2 / H3 標籤：${headings.h2} / ${headings.h3} 個
- 圖片：共 ${images.total} 張，${images.missingAlt} 張缺少 alt 文字
- 內部連結：${links.internal} 個｜外部連結：${links.external} 個
- Canonical URL：${analytics.canonical || '未設定'}
- Robots Meta：${analytics.robotsMeta || '未設定'}
- Open Graph：標題=${openGraph.title ? `「${openGraph.title}」` : '缺少'}，描述=${openGraph.description ? '已設定' : '缺少'}，圖片=${openGraph.image ? '已設定' : '缺少'}
- 頁面語言：${analytics.lang || '未設定'}
- 伺服器回應時間：${analytics.responseTimeMs}ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GEO 技術指標
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 平台類型：${geoAnalytics.platform}${geoAnalytics.platform === 'portaly' ? '（台灣創作者 link-in-bio 平台，競爭對手：Linktree / Beacons.ai）' : geoAnalytics.platform === 'eatq' ? '（餐廳科技平台，競爭對手：OpenTable / Yelp / Toast）' : ''}
- Hreflang 標籤：${geoAnalytics.hreflang.count} 個${geoAnalytics.hreflang.hasEnUs ? '（含 en/en-US）' : '（無 en-US）'}
- Schema Markup 類型：${geoAnalytics.schema.types.join(', ') || '無'}
- 理想語意段落（40–150 字）：${geoAnalytics.semanticChunking.idealParas}/${geoAnalytics.semanticChunking.totalParas} 個
- 品牌實體：address=${geoAnalytics.brandEntity.hasAddress}，電話=${geoAnalytics.brandEntity.hasTel}，Email=${geoAnalytics.brandEntity.hasEmail}，LocalBusiness schema=${geoAnalytics.brandEntity.hasLocalBizSchema}，OG/title 一致=${geoAnalytics.brandEntity.consistentName}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
全站摘要（發現 ${crawlCoverage.discoveredPages} 頁｜成功爬取 ${crawlOk} 頁｜失敗 ${crawlFailed} 頁｜覆蓋率 ${crawlCoverage.coverageRate}%）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${siteSummary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
評估準則（根據實際爬取到的內容）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. AI 搜尋可見度：爬取到的頁面結構、schema、hreflang 是否讓 AI 能索引這個品牌？
2. AI 理解能力：從爬取內容中，AI 能否判斷公司是誰、做什麼、服務誰、商業價值是什麼？
3. AI 推薦障礙：哪些技術或內容問題會阻礙 AI 在推薦情境中提及這個品牌？
4. 機器可讀性：哪些內容可能藏在圖片、輪播、動畫或 JS 渲染中導致 AI 讀取困難？
5. 改善優先順序：哪三個具體行動對 AI 可見度影響最大？

【重要評估規則】
- 只根據「實際成功爬取到的 ${crawlOk} 個頁面（發現 ${crawlCoverage.discoveredPages} 頁，覆蓋率 ${crawlCoverage.coverageRate}%）」進行評分
- 若有 ${crawlFailed} 頁無法爬取，在 machineReadabilityRisk 說明原因
- 若覆蓋率低於 100%，說明網站可能比爬到的更大，請在評估中反映此不確定性
- 禁止說「內容不足」，改說「此次未能爬取到」或「機器讀取困難」
- 若字數偏低但導覽結構完整，請判斷為機器可讀性風險

只輸出以下格式的合法 JSON，不要加任何說明文字：
{
  "seoScore": { "score": <0-100 的數字>, "explanation": "<2–3 句整站 SEO 技術健康度評估>" },
  "categoryScores": {
    "content": <0-100>,
    "technical": <0-100>,
    "onPage": <0-100>,
    "accessibility": <0-100>
  },
  "suggestions": ["<具體可執行技術改善建議 1>", "<建議 2>", "<建議 3>", "<建議 4>", "<建議 5>"],
  "blogIdeas": ["<適合補充的可機器讀取內容主題 1>", "<主題 2>"],
  "geoScore": { "score": <0-100 的數字>, "explanation": "<2–3 句 GEO AI 可見度評估>" },
  "geoInsights": {
    "vibeReadiness": <0-100>,
    "hreflangStatus": "<Global Search Signals 評估>",
    "schemaStatus": "<Entity / Schema Signals 評估>",
    "semanticChunkingStatus": "<AI Content Chunks 評估>",
    "brandEntityStatus": "<Brand Entity Clarity 評估>",
    "machineReadabilityRisk": "<評估網站機器可讀性風險：說明是否有 JS 渲染問題、圖片文字、輪播或互動模組導致內容難以被 AI 讀取>",
    "usToneAssessment": "<1–2 句：現有內容語氣 vs 北美受眾期望>",
    "usSentimentScore": <0-100>,
    "strategicBrief": "<2–3 句創辦人層級的美國市場 AI 可見度策略建議>",
    "audiencePersona": "<一句話描述理想的北美目標客群>",
    "geoSuggestions": ["<高影響力 GEO 建議 1>", "<建議 2>", "<建議 3>"]
  },
  "aiVisibilityScore": { "score": <0-100 的數字>, "explanation": "<2–3 句 AI 搜尋可見度整體評估，說明 AI 能否發現、理解並推薦此品牌>" },
  "aiUnderstandingSummary": "<3–5 句說明：從爬取到的內容中，AI 對這個品牌的整體理解程度，包括能否判斷公司定位、產品服務、目標客群與商業價值>",
  "understoodSignals": ["<AI 已能理解的訊號 1，例如：品牌名稱明確>", "<訊號 2>", "<訊號 3>"],
  "missingSignals": ["<AI 目前無法讀取到的訊號 1，例如：客戶案例內容在圖片中>", "<訊號 2>", "<訊號 3>"],
  "recommendationBarriers": ["<阻礙 AI 在推薦情境中提及此品牌的障礙 1>", "<障礙 2>", "<障礙 3>"],
  "improvementActions": ["<最高優先度 AI 可見度改善行動 1>", "<行動 2>", "<行動 3>"],
  "queryOpportunities": ["<有機會在 AI 搜尋中被提及的搜尋問題類型 1，例如：企業 AI 銷售教練推薦>", "<問題 2>", "<問題 3>"]
}`;

    console.log('[analyze] Step 3: Sending prompt to Gemini (with retry)...');
    const responseText = await callGeminiWithRetry(genAI, prompt);
    console.log(`[analyze] Step 3: OK — Gemini responded, length=${responseText.length}`);
    console.log(`[analyze] Step 3: Raw response preview: ${responseText.slice(0, 200)}...`);

    // ── Step 4: Parse Gemini JSON response ───────────────────────────────
    console.log('[analyze] Step 4: Extracting JSON from Gemini response...');
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[analyze] Step 4: FAIL — no JSON object found in response');
      console.error('[analyze] Step 4: Full response was:', responseText);
      throw new Error('Invalid AI response format');
    }

    const aiInsights = JSON.parse(jsonMatch[0]);
    console.log(`[analyze] Step 4: OK — seoScore=${aiInsights.seoScore?.score}, geoScore=${aiInsights.geoScore?.score}`);
    console.log('[analyze] ── Request complete ✓ ──────────────────────\n');

    // Return crawledPages summary for frontend display
    const crawledPagesSummary = crawledPages.map(p => ({
      url:            p.url,
      title:          p.title || '',
      wordCount:      p.wordCount || 0,
      responseTimeMs: p.responseTimeMs || 0,
      status:         p.status,
      error:          p.error || null,
    }));

    res.json({
      analytics, siteAnalytics, aiInsights, geoAnalytics,
      crawledPages: crawledPagesSummary,
      crawlStats:       crawlCoverage,
      siteEntities,
      siteKnowledgeMap,
      imageOCR,
    });

  } catch (err) {
    // ── Full error dump for server logs ─────────────────────────────────
    console.error('\n[analyze] ── ERROR ─────────────────────────────────');
    console.error('[analyze] err.name    :', err.name);
    console.error('[analyze] err.message :', err.message);
    console.error('[analyze] err.code    :', err.code);
    console.error('[analyze] err.status  :', err.status);
    console.error('[analyze] err.stack   :', err.stack);
    console.error('[analyze] ────────────────────────────────────────────\n');

    // ── Network errors (fetching target URL) ────────────────────────────
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(400).json({ error: 'Could not reach the provided URL. Please check the URL and try again.' });
    }
    if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
      return res.status(400).json({ error: 'Request to target URL timed out (10s). The site may be too slow or blocking requests.' });
    }
    if (err.response) {
      return res.status(400).json({ error: `The target page returned HTTP ${err.response.status}. It may block scrapers or the URL may be incorrect.` });
    }

    // ── Gemini / AI errors ───────────────────────────────────────────────
    // Friendly errors thrown by callGeminiWithRetry (e.g. all retries + fallback failed)
    if (err.isGeminiFriendly) {
      return res.status(503).json({ error: err.message });
    }
    // Catches: API key invalid, quota, permission, model not found,
    //          JSON parse failure, any other AI-side issue
    return res.status(500).json({ error: classifyGeminiError(err) });
  }
});

app.listen(PORT, () => console.log(`SEOtest running at http://localhost:${PORT}`));
