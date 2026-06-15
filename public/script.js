// ── DOM refs ──────────────────────────────────────────────
const urlInput      = document.getElementById('urlInput');
const analyzeBtn    = document.getElementById('analyzeBtn');
const loader        = document.getElementById('loader');
const errorBox      = document.getElementById('error');
const results       = document.getElementById('results');
const analyticsGrid = document.getElementById('analyticsGrid');
const scoreBox      = document.getElementById('scoreBox');
const suggestionsEl = document.getElementById('suggestions');
const blogIdeasEl   = document.getElementById('blogIdeas');

let timerInterval = null;

// ── Utilities ─────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function badge(ok, label) {
  return `<span class="badge badge-${ok ? 'ok' : 'warn'}">${label}</span>`;
}

function statusIcon(length, min, max) {
  return length >= min && length <= max ? ' ✓' : ' ✗';
}

function metric(label, value, sub = '', status = '') {
  const cls = status ? ` metric--${status}` : '';
  return `
    <div class="metric${cls}">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${sub ? `<div class="metric-sub">${sub}</div>` : ''}
    </div>`;
}

function wordCountHint(n) {
  if (n < 300)  return 'Too short (aim for 300+)';
  if (n < 600)  return 'Acceptable';
  if (n <= 2500) return 'Good length';
  return 'Very long';
}

function animateCount(el, target, duration = 900) {
  const tick = (ts, t0) => {
    const p = Math.min((ts - t0) / duration, 1);
    el.textContent = Math.round(p * target);
    if (p < 1) requestAnimationFrame(ts2 => tick(ts2, t0));
  };
  requestAnimationFrame(ts => tick(ts, ts));
}

// ── Event listeners ───────────────────────────────────────
analyzeBtn.addEventListener('click', analyze);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') analyze(); });
document.getElementById('resetBtn').addEventListener('click', resetAnalysis);

// ── Core analyze flow ─────────────────────────────────────
async function analyze() {
  let url = urlInput.value.trim();
  if (!url) return;

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
    urlInput.value = url;
  }

  try { new URL(url); } catch {
    showError('Please enter a valid URL (e.g. https://example.com).');
    return;
  }

  setLoading(true);
  clearResults();

  try {
    const res = await fetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!res.ok) { showError(data.error || 'Analysis failed. Please try again.'); return; }
    renderResults(data);
  } catch {
    showError('Network error. Please check your connection and try again.');
  } finally {
    setLoading(false);
  }
}

// ── Render Visual Content Insights ────────────────────────
function renderVisualInsights(imageOCR) {
  if (!imageOCR) return;
  const card = document.getElementById('visualInsightsCard');
  const body = document.getElementById('visualInsightsBody');
  if (!card || !body) return;

  const { totalFound = 0, ocrCount = 0, imageTextSummary = '', ocrResults = [], error } = imageOCR;

  if (ocrCount === 0 && !imageTextSummary) {
    // Nothing useful to show — skip the card entirely
    return;
  }

  // Parse OCR text into individual bullets for display
  const bullets = imageTextSummary
    ? imageTextSummary.split('\n').map(l => l.trim()).filter(l => l.length > 2)
    : [];

  // Heuristic classification of OCR bullets
  const metrics    = bullets.filter(l => /\d|%/.test(l));
  const other      = bullets.filter(l => !/\d|%/.test(l));

  body.innerHTML = `
    <div class="vi-stats-row">
      <div class="vi-stat">
        <div class="vi-stat-num">${totalFound}</div>
        <div class="vi-stat-label">Images Found</div>
      </div>
      <div class="vi-stat">
        <div class="vi-stat-num" style="color:var(--ok-color)">${ocrCount}</div>
        <div class="vi-stat-label">OCR Analyzed</div>
      </div>
      <div class="vi-stat">
        <div class="vi-stat-num" style="color:var(--accent)">${metrics.length}</div>
        <div class="vi-stat-label">Data Points</div>
      </div>
    </div>
    ${metrics.length > 0 ? `
      <p class="section-title" style="margin-top:1rem">📊 Key Data & ROI Signals</p>
      <ul class="vi-bullet-list vi-metric">${metrics.map(l =>
        `<li>${escapeHtml(l.replace(/^[・•\-*]\s*/, ''))}</li>`).join('')}
      </ul>` : ''}
    ${other.length > 0 ? `
      <p class="section-title">🏢 Brand & Service Signals</p>
      <ul class="vi-bullet-list">${other.slice(0, 12).map(l =>
        `<li>${escapeHtml(l.replace(/^[・•\-*]\s*/, ''))}</li>`).join('')}
      </ul>` : ''}
    ${error ? `<p class="vi-error">⚠ OCR 分析失敗：${escapeHtml(error)}</p>` : ''}
  `;
  card.classList.remove('hidden');
}

// ── Render Website Coverage ──────────────────────────────
function renderCoverageStats(crawlStats) {
  if (!crawlStats) return;
  const card = document.getElementById('crawlCoverageCard');
  const body = document.getElementById('crawlCoverageStats');
  if (!card || !body) return;

  const rate = crawlStats.coverageRate ?? Math.round((crawlStats.crawledPages / Math.max(crawlStats.discoveredPages, 1)) * 100);
  const rateClass = rate >= 80 ? 'score-green' : rate >= 50 ? 'score-yellow' : 'score-red';

  body.innerHTML = `
    <div class="coverage-hero">
      <div class="coverage-rate-wrap">
        <div class="coverage-rate-num ${rateClass}">${rate}<span class="coverage-rate-unit">%</span></div>
        <div class="coverage-rate-label">Coverage Rate</div>
      </div>
      <div class="coverage-stats-grid">
        <div class="cov-stat">
          <div class="cov-stat-num">${crawlStats.discoveredPages ?? crawlStats.total ?? '—'}</div>
          <div class="cov-stat-label">Discovered Pages</div>
        </div>
        <div class="cov-stat">
          <div class="cov-stat-num" style="color:var(--ok-color)">${crawlStats.successPages ?? crawlStats.ok ?? '—'}</div>
          <div class="cov-stat-label">Crawled Pages</div>
        </div>
        <div class="cov-stat">
          <div class="cov-stat-num" style="color:${(crawlStats.failedPages ?? crawlStats.failed ?? 0) > 0 ? 'var(--warn-color)' : 'var(--muted)'}">
            ${crawlStats.failedPages ?? crawlStats.failed ?? 0}
          </div>
          <div class="cov-stat-label">Failed Pages</div>
        </div>
      </div>
    </div>
    ${crawlStats.cappedAt ? `<p class="cov-cap-note">⚠ 已達爬取上限 ${crawlStats.cappedAt} 頁，網站實際頁數可能更多</p>` : ''}
  `;
  card.classList.remove('hidden');
}

// ── Render Site Knowledge Map ─────────────────────────────
function renderSiteKnowledgeMap(knowledgeMap, entities) {
  if (!knowledgeMap) return;
  const card = document.getElementById('siteKnowledgeMapCard');
  const body = document.getElementById('siteKnowledgeMapBody');
  if (!card || !body) return;

  function mkRow(label, value) {
    if (!value || (Array.isArray(value) && value.length === 0)) return '';
    const display = Array.isArray(value) ? value.join('、') : escapeHtml(String(value));
    return `<div class="km-row"><span class="km-label">${label}</span><span class="km-value">${display}</span></div>`;
  }

  const entityTags = entities?.length
    ? `<div class="km-entity-wrap">${entities.slice(0, 16).map(e =>
        `<span class="km-entity-tag" title="${e.count}次">${escapeHtml(e.text)}</span>`
      ).join('')}</div>`
    : '';

  body.innerHTML = `
    <div class="km-grid">
      ${mkRow('Brand', knowledgeMap.brand)}
      ${mkRow('Products / Services', knowledgeMap.products)}
      ${mkRow('Industries', knowledgeMap.industries)}
      ${mkRow('Target Audience', knowledgeMap.audience)}
      ${mkRow('Case Studies', knowledgeMap.caseCount > 0 ? `${knowledgeMap.caseCount} pages detected` : '')}
      ${mkRow('Contact', knowledgeMap.contact)}
    </div>
    ${entityTags ? `<p class="section-title" style="margin-top:1.2rem">🏷 High-frequency Entities</p>${entityTags}` : ''}
  `;
  card.classList.remove('hidden');
}

// ── Render site-wide analytics ───────────────────────────
function renderSiteAnalytics(sa) {
  if (!sa) return;
  const card = document.getElementById('siteAnalyticsCard');
  const grid = document.getElementById('siteAnalyticsGrid');

  const altStatus = sa.missingAlt === 0 ? 'ok' : 'warn';
  grid.innerHTML = [
    metric('AI-readable Pages', `${sa.pageCount} 頁`, 'AI 可成功讀取的頁面數量'),
    metric('Machine-readable Content', sa.totalWordCount.toLocaleString() + ' 字',
           wordCountHint(sa.totalWordCount)),
    metric('Avg. Content / Page', sa.avgWordCount.toLocaleString() + ' 字',
           wordCountHint(sa.avgWordCount)),
    metric('Content Structure (H1)', `${sa.totalH1} 個`,
           sa.totalH1 >= sa.pageCount ? '每頁至少一個 H1' : `${sa.pageCount - sa.totalH1} 頁缺少 H1`,
           sa.totalH1 >= sa.pageCount ? 'ok' : 'warn'),
    metric('Content Structure (H2/H3)', `${sa.totalH2} / ${sa.totalH3}`, ''),
    metric('Hidden Content Risk', `${sa.totalImages} 張圖片`,
           sa.missingAlt > 0 ? `${sa.missingAlt} 張無 alt — AI 無法讀取圖片文字` : '所有圖片皆有 alt',
           altStatus),
  ].join('');

  card.classList.remove('hidden');
}

// ── Render crawled pages list ─────────────────────────────
function renderCrawledPages(pages, crawlStats) {
  if (!pages || pages.length === 0) return;
  const card = document.getElementById('crawledPagesCard');
  const list = document.getElementById('crawledPagesList');

  const okCount     = crawlStats ? crawlStats.ok     : pages.filter(p => p.status === 'ok').length;
  const failedCount = crawlStats ? crawlStats.failed  : pages.filter(p => p.status === 'error').length;

  // Summary bar at the top
  const summaryHtml = `
    <div class="crawl-summary">
      <span class="crawl-stat crawl-stat-ok">✓ 成功 ${okCount} 頁</span>
      ${failedCount > 0
        ? `<span class="crawl-stat crawl-stat-fail">✗ 失敗 ${failedCount} 頁</span>`
        : ''}
      <span class="crawl-stat crawl-stat-total">共嘗試 ${pages.length} 頁</span>
    </div>`;

  const rows = pages.map((p, i) => {
    const isHome    = i === 0;
    const ok        = p.status === 'ok';
    const timeClass = p.responseTimeMs < 500 ? 'score-green' : p.responseTimeMs < 1500 ? 'score-yellow' : 'score-red';
    return `
      <div class="crawled-row${ok ? '' : ' crawled-row-failed'}">
        <span class="crawled-index">${i + 1}</span>
        <div class="crawled-info">
          <div class="crawled-title">
            ${isHome ? '<span class="crawled-home-badge">首頁</span>' : ''}
            ${ok ? '' : '<span class="crawled-fail-badge">失敗</span>'}
            ${escapeHtml(p.title || p.url)}
          </div>
          <div class="crawled-url">${escapeHtml(p.url)}</div>
          ${!ok && p.error ? `<div class="crawled-error">${escapeHtml(p.error)}</div>` : ''}
        </div>
        <div class="crawled-meta">
          ${ok
            ? `<span class="crawled-words">${p.wordCount.toLocaleString()} 字</span>
               <span class="crawled-time ${timeClass}">${p.responseTimeMs}ms</span>`
            : `<span class="badge badge-warn">無法抓取</span>`
          }
        </div>
      </div>`;
  }).join('');

  list.innerHTML = summaryHtml + rows;
  card.classList.remove('hidden');
}

// ── Render SEO analytics ──────────────────────────────────
function renderResults({ analytics, siteAnalytics, aiInsights, geoAnalytics, crawledPages, crawlStats, siteEntities, siteKnowledgeMap, imageOCR }) {
  const { title, metaDescription, headings, images, links, canonical, robotsMeta, lang, openGraph, responseTimeMs } = analytics;

  analyticsGrid.innerHTML = [
    metric('Machine-readable Words', analytics.wordCount.toLocaleString(), wordCountHint(analytics.wordCount)),
    metric('Title Signal',
      `${title.length} chars${statusIcon(title.length, 50, 60)}`,
      escapeHtml(title.content) || '(none)',
      title.length >= 50 && title.length <= 60 ? 'ok' : 'warn'),
    metric('Description Signal',
      `${metaDescription.length} chars${statusIcon(metaDescription.length, 150, 160)}`,
      escapeHtml(metaDescription.content) || '(none)',
      metaDescription.length >= 150 && metaDescription.length <= 160 ? 'ok' : 'warn'),
    metric('Content Structure',
      `H1: ${headings.h1} &nbsp;H2: ${headings.h2} &nbsp;H3: ${headings.h3}`,
      headings.h1Text ? `H1: "${escapeHtml(headings.h1Text)}"` : '',
      headings.h1 === 1 ? 'ok' : 'warn'),
    metric('Hidden Content Risk', `${images.total} images`,
      images.missingAlt > 0 ? `${images.missingAlt} 張無 alt — AI 無法讀取` : 'All images have alt text',
      images.missingAlt === 0 ? 'ok' : 'warn'),
    metric('Link Discoverability', `${links.internal} internal &nbsp;/ &nbsp;${links.external} external`, ''),
    metric('Canonical Signal',
      canonical ? badge(true, 'Set') : badge(false, 'Missing'),
      canonical ? escapeHtml(canonical) : 'No canonical tag found'),
    metric('Social Signals',
      [badge(!!openGraph.title, 'Title'), badge(!!openGraph.description, 'Desc'), badge(openGraph.image, 'Image')].join(' '), ''),
    metric('Crawl Directive', robotsMeta ? escapeHtml(robotsMeta) : badge(false, 'Not set'), ''),
    metric('Language Signal', lang ? badge(true, escapeHtml(lang)) : badge(false, 'Not set'), ''),
    metric('Server Response', `${responseTimeMs} ms`,
      responseTimeMs < 500 ? 'Fast' : responseTimeMs < 1500 ? 'Moderate' : 'Slow',
      responseTimeMs < 1500 ? 'ok' : 'warn'),
  ].join('');

  // AI Visibility Score (new field, fallback to seoScore)
  const av     = aiInsights.aiVisibilityScore || aiInsights.seoScore;
  const score  = av.score;
  const scClass = score >= 70 ? 'score-green' : score >= 40 ? 'score-yellow' : 'score-red';
  scoreBox.innerHTML = `
    <div>
      <div class="score-number ${scClass}">${score}</div>
      <div class="score-label">/ 100</div>
    </div>
    <div class="score-explanation">${escapeHtml(av.explanation)}</div>
  `;

  const cats = aiInsights.categoryScores;
  if (cats) {
    const catHtml = Object.entries({
      'Readability':      cats.content,
      'Crawlability':     cats.technical,
      'Entity Signals':   cats.onPage,
      'Hidden Content':   cats.accessibility,
    }).map(([name, val]) => {
      const cls = val >= 70 ? 'bar-green' : val >= 40 ? 'bar-yellow' : 'bar-red';
      return `<div class="cat-row">
        <span class="cat-label">${name}</span>
        <div class="cat-bar-track"><div class="cat-bar ${cls}" style="width:${val}%"></div></div>
        <span class="cat-score">${val}</span>
      </div>`;
    }).join('');
    scoreBox.insertAdjacentHTML('afterend', `<div class="category-scores">${catHtml}</div>`);
  }

  // ── AI Understanding body (new fields) ───────────────────
  const aiBody = document.getElementById('aiUnderstandingBody');
  if (aiBody && aiInsights.aiUnderstandingSummary) {
    const mkSignalList = (arr, icon, cssClass) =>
      arr?.length
        ? `<ul class="ai-signal-list ai-signal-${cssClass}">${arr.map(s => `<li>${icon} ${escapeHtml(s)}</li>`).join('')}</ul>`
        : '';

    aiBody.innerHTML = `
      <div class="ai-understanding-summary">${escapeHtml(aiInsights.aiUnderstandingSummary)}</div>
      ${aiInsights.understoodSignals?.length ? `
        <p class="section-title">✅ AI 已能理解的訊號</p>
        ${mkSignalList(aiInsights.understoodSignals, '✓', 'ok')}` : ''}
      ${aiInsights.missingSignals?.length ? `
        <p class="section-title">⚠️ AI 目前無法讀取的訊號</p>
        ${mkSignalList(aiInsights.missingSignals, '✗', 'warn')}` : ''}
      ${aiInsights.recommendationBarriers?.length ? `
        <p class="section-title">🚧 AI 推薦障礙</p>
        ${mkSignalList(aiInsights.recommendationBarriers, '›', 'barrier')}` : ''}
    `;
  }

  suggestionsEl.innerHTML = aiInsights.improvementActions?.length
    ? `<p class="section-title">🎯 AI 可見度改善行動</p>
       <ol class="suggestions-list">${aiInsights.improvementActions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
    : `<p class="section-title">改善建議</p>
       <ol class="suggestions-list">${(aiInsights.suggestions || []).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;

  blogIdeasEl.innerHTML = aiInsights.queryOpportunities?.length
    ? `<p class="section-title">🔍 AI 搜尋推薦機會</p>
       <ul class="blog-list">${aiInsights.queryOpportunities.map(q => `<li>${escapeHtml(q)}</li>`).join('')}</ul>`
    : aiInsights.blogIdeas?.length
      ? `<p class="section-title">內容補充方向</p>
         <ul class="blog-list">${aiInsights.blogIdeas.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
      : '';

  results.classList.remove('hidden');
  document.getElementById('resetBtn').classList.remove('hidden');
  renderCoverageStats(crawlStats);
  if (siteKnowledgeMap) renderSiteKnowledgeMap(siteKnowledgeMap, siteEntities);
  if (imageOCR)         renderVisualInsights(imageOCR);
  if (siteAnalytics) renderSiteAnalytics(siteAnalytics);
  if (crawledPages)  renderCrawledPages(crawledPages, crawlStats);
  if (geoAnalytics)  renderGeoResults(geoAnalytics, aiInsights.geoScore, aiInsights.geoInsights);
}

// ── Render AI Recommendation Potential ───────────────────
function renderGeoResults(geo, geoScore, ins) {
  const geoCard = document.getElementById('geoCard');
  const sc       = geoScore?.score ?? ins?.vibeReadiness ?? 0;
  const scClass  = sc >= 70 ? 'score-green' : sc >= 40 ? 'score-yellow' : 'score-red';
  const platformLabel = geo.platform === 'generic' ? 'Generic' : geo.platform.toUpperCase();

  // ── 🏆 AI Recommendation Score ────────────────────────
  document.getElementById('geoVibeHero').innerHTML = `
    <div class="vibe-card">
      <span class="vibe-emoji">🏆</span>
      <div class="vibe-big-num ${scClass}" id="vibeCountUp">0</div>
      <div class="vibe-denom">/ 100</div>
      <div class="vibe-card-label">AI Recommendation Score</div>
      <div class="vibe-platform">${escapeHtml(platformLabel)}</div>
    </div>
  `;
  animateCount(document.getElementById('vibeCountUp'), sc);

  // ── 🌐 Global Search Signals ──────────────────────────
  const hreflangPillsHtml = geo.hreflang.count > 0
    ? `<div class="hreflang-pills">${geo.hreflang.tags.map(t => `<span class="hreflang-pill">${escapeHtml(t.lang)}</span>`).join('')}</div>`
    : '';

  document.getElementById('geoI18n').innerHTML = `
    <div class="i18n-card">
      <div class="dash-card-title">🌐 Global Search Signals</div>
      <div class="i18n-row">
        <span class="i18n-label">Global Search Signals</span>
        <div class="i18n-val">
          ${geo.hreflang.count > 0 ? badge(true, `${geo.hreflang.count} found`) : badge(false, 'Missing')}
          ${hreflangPillsHtml}
        </div>
      </div>
      <div class="i18n-row">
        <span class="i18n-label">US Market Signal</span>
        <div class="i18n-val">${geo.hreflang.hasEnUs ? badge(true, 'Set') : badge(false, 'Not set')}</div>
      </div>
      <div class="i18n-row">
        <span class="i18n-label">Brand Name Match</span>
        <div class="i18n-val">${geo.brandEntity.consistentName ? badge(true, 'Consistent') : badge(false, 'Mismatch')}</div>
      </div>
      <div class="i18n-row">
        <span class="i18n-label">Assessment</span>
        <div class="i18n-val" style="font-size:0.72rem;color:var(--muted)">${escapeHtml(ins?.hreflangStatus || '—')}</div>
      </div>
    </div>
  `;

  // ── 📡 Entity / Schema Signals ────────────────────────
  const entityBadges = [
    geo.brandEntity.hasAddress && badge(true, 'Addr'),
    geo.brandEntity.hasTel     && badge(true, 'Tel'),
    geo.brandEntity.hasEmail   && badge(true, 'Email'),
  ].filter(Boolean);

  document.getElementById('geoSignals').innerHTML = `
    <div class="geo-signals-card">
      <div class="dash-card-title">📡 Entity / Schema Signals</div>
      <div class="geo-sig-row">
        <span class="geo-sig-icon">🗂</span>
        <div class="geo-sig-info">
          <div class="geo-sig-name">Entity / Schema Signals</div>
          <div class="geo-sig-detail">${geo.schema.types.length > 0 ? escapeHtml(geo.schema.types.join(', ')) : ins?.schemaStatus || 'No JSON-LD found'}</div>
        </div>
        <span class="geo-sig-status">${geo.schema.types.length > 0 ? badge(true, `${geo.schema.types.length} type${geo.schema.types.length !== 1 ? 's' : ''}`) : badge(false, 'Missing')}</span>
      </div>
      <div class="geo-sig-row">
        <span class="geo-sig-icon">📄</span>
        <div class="geo-sig-info">
          <div class="geo-sig-name">AI Content Chunks</div>
          <div class="geo-sig-detail">${escapeHtml(ins?.semanticChunkingStatus || `${geo.semanticChunking.idealParas}/${geo.semanticChunking.totalParas} paragraphs in ideal range`)}</div>
        </div>
        <span class="geo-sig-status">${badge(geo.semanticChunking.idealParas > 0, `${geo.semanticChunking.idealParas}/${geo.semanticChunking.totalParas}`)}</span>
      </div>
      <div class="geo-sig-row">
        <span class="geo-sig-icon">🏢</span>
        <div class="geo-sig-info">
          <div class="geo-sig-name">Brand Entity Clarity</div>
          <div class="geo-sig-detail">${escapeHtml(ins?.brandEntityStatus || 'NAP & schema check')}</div>
        </div>
        <span class="geo-sig-status">${entityBadges.length ? entityBadges.join(' ') : badge(false, 'Missing')}</span>
      </div>
      ${ins?.machineReadabilityRisk ? `
      <div class="geo-sig-row">
        <span class="geo-sig-icon">⚠️</span>
        <div class="geo-sig-info">
          <div class="geo-sig-name">Machine-readable Content Risk</div>
          <div class="geo-sig-detail">${escapeHtml(ins.machineReadabilityRisk)}</div>
        </div>
        <span class="geo-sig-status">${badge(
          !ins.machineReadabilityRisk.includes('風險') && !ins.machineReadabilityRisk.includes('困難') && !ins.machineReadabilityRisk.includes('問題'),
          ins.machineReadabilityRisk.includes('風險') || ins.machineReadabilityRisk.includes('困難') ? 'Risk' : 'OK'
        )}</span>
      </div>` : ''}
    </div>
  `;

  // ── 🎯 AI Recommendation Context ──────────────────────
  const sentScore    = ins?.usSentimentScore ?? 0;
  const sentNumClass = sentScore >= 70 ? 'score-green' : sentScore >= 40 ? 'score-yellow' : 'score-red';
  document.getElementById('geoNAStrategy').innerHTML = `
    <div class="na-strategy-card">
      <div class="dash-card-title">🎯 AI Recommendation Context</div>
      <div class="na-market-context">
        <strong>🔍 How AI Recommendation Potential Is Scored</strong>
        This analyzer reads AI discoverability signals — hreflang coverage, JSON-LD entity schema, semantic content density, and brand entity consistency — to score how likely this brand is to be surfaced by AI search tools (Perplexity, ChatGPT Search, Google SGE) when users ask for recommendations.
      </div>
      <div class="na-top">
        <div class="na-sentiment-score">
          <div class="na-score-num ${sentNumClass}">${sentScore}</div>
          <div class="na-score-denom">/100</div>
          <div class="na-score-label">AI Readiness</div>
        </div>
        <div>
          <div class="na-bar-track">
            <div class="na-bar-fill" style="width:${sentScore}%"></div>
          </div>
          <p class="na-tone-text">${escapeHtml(ins?.usToneAssessment || '')}</p>
        </div>
      </div>
      ${ins?.strategicBrief ? `
        <hr class="na-divider">
        <div class="na-brief-label">🏆 AI Recommendation Strategy</div>
        <p class="na-brief-text">${escapeHtml(ins.strategicBrief)}</p>
        ${ins.audiencePersona ? `
          <div class="na-persona">
            <span>🎯</span>
            <span><strong style="color:var(--accent)">Target Query Persona:</strong><br><em>${escapeHtml(ins.audiencePersona)}</em></span>
          </div>` : ''}
      ` : ''}
    </div>
  `;

  // ── AI Visibility Actions ──────────────────────────────
  if (ins?.geoSuggestions?.length) {
    document.getElementById('geoSuggestions').innerHTML = `
      <div class="geo-actions-card">
        <p class="section-title">AI Visibility Actions</p>
        <ol class="suggestions-list">${ins.geoSuggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
      </div>
    `;
  }

  geoCard.classList.remove('hidden');
}

// ── Loading state ─────────────────────────────────────────
function setLoading(on) {
  analyzeBtn.disabled = on;
  loader.classList.toggle('hidden', !on);
  if (on) {
    let seconds = 0;
    const loaderText = document.getElementById('loaderText');
    loaderText.textContent = 'Analyzing… (0s)';
    timerInterval = setInterval(() => {
      seconds++;
      loaderText.textContent = `Analyzing… (${seconds}s)`;
    }, 1000);
  } else {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ── Clear / Reset ─────────────────────────────────────────
function clearResults() {
  results.classList.add('hidden');
  errorBox.classList.add('hidden');
  errorBox.textContent = '';
  document.getElementById('resetBtn').classList.add('hidden');
  document.querySelector('.category-scores')?.remove();
  document.getElementById('geoCard')?.classList.add('hidden');
  document.getElementById('crawledPagesCard')?.classList.add('hidden');
  document.getElementById('siteAnalyticsCard')?.classList.add('hidden');
  document.getElementById('crawlCoverageCard')?.classList.add('hidden');
  document.getElementById('siteKnowledgeMapCard')?.classList.add('hidden');
  document.getElementById('visualInsightsCard')?.classList.add('hidden');
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}

function resetAnalysis() {
  results.classList.add('hidden');
  errorBox.classList.add('hidden');
  errorBox.textContent = '';
  document.getElementById('resetBtn').classList.add('hidden');
  document.querySelector('.category-scores')?.remove();
  document.getElementById('geoCard')?.classList.add('hidden');
  document.getElementById('crawledPagesCard')?.classList.add('hidden');
  document.getElementById('siteAnalyticsCard')?.classList.add('hidden');
  document.getElementById('crawlCoverageCard')?.classList.add('hidden');
  document.getElementById('siteKnowledgeMapCard')?.classList.add('hidden');
  document.getElementById('visualInsightsCard')?.classList.add('hidden');
  urlInput.value = '';
  urlInput.focus();
}
