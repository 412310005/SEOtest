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

analyzeBtn.addEventListener('click', analyze);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') analyze(); });
document.getElementById('resetBtn').addEventListener('click', resetAnalysis);

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

    if (!res.ok) {
      showError(data.error || 'Analysis failed. Please try again.');
      return;
    }

    renderResults(data);
  } catch {
    showError('Network error. Please check your connection and try again.');
  } finally {
    setLoading(false);
  }
}

function renderResults({ analytics, aiInsights, geoAnalytics }) {
  const { title, metaDescription, headings, images, links, canonical, robotsMeta, lang, openGraph, responseTimeMs } = analytics;

  analyticsGrid.innerHTML = [
    // Row 1 — content basics
    metric('Word Count', analytics.wordCount.toLocaleString(), wordCountHint(analytics.wordCount)),
    metric(
      'Title Tag',
      `${title.length} chars${statusIcon(title.length, 50, 60)}`,
      escapeHtml(title.content) || '(none)',
      title.length > 0 && title.length < 50 ? 'warn' : title.length > 60 ? 'warn' : 'ok'
    ),
    metric(
      'Meta Description',
      `${metaDescription.length} chars${statusIcon(metaDescription.length, 150, 160)}`,
      escapeHtml(metaDescription.content) || '(none)',
      metaDescription.length >= 150 && metaDescription.length <= 160 ? 'ok' : 'warn'
    ),
    metric(
      'Headings',
      `H1: ${headings.h1} &nbsp;H2: ${headings.h2} &nbsp;H3: ${headings.h3}`,
      headings.h1Text ? `H1: "${escapeHtml(headings.h1Text)}"` : '',
      headings.h1 === 1 ? 'ok' : 'warn'
    ),
    // Row 2 — media & links
    metric(
      'Images',
      `${images.total} total`,
      images.missingAlt > 0 ? `${images.missingAlt} missing alt text` : 'All images have alt text',
      images.missingAlt === 0 ? 'ok' : 'warn'
    ),
    metric(
      'Links',
      `${links.internal} internal &nbsp;/ &nbsp;${links.external} external`,
      ''
    ),
    // Row 3 — technical
    metric(
      'Canonical URL',
      canonical ? badge(true, 'Set') : badge(false, 'Missing'),
      canonical ? escapeHtml(canonical) : 'No canonical tag found'
    ),
    metric(
      'Open Graph',
      [
        badge(!!openGraph.title, 'Title'),
        badge(!!openGraph.description, 'Desc'),
        badge(openGraph.image, 'Image'),
      ].join(' '),
      ''
    ),
    metric(
      'Robots Meta',
      robotsMeta ? escapeHtml(robotsMeta) : badge(false, 'Not set'),
      ''
    ),
    metric(
      'Page Language',
      lang ? badge(true, escapeHtml(lang)) : badge(false, 'Not set'),
      ''
    ),
    metric(
      'Response Time',
      `${responseTimeMs} ms`,
      responseTimeMs < 500 ? 'Fast' : responseTimeMs < 1500 ? 'Moderate' : 'Slow',
      responseTimeMs < 1500 ? 'ok' : 'warn'
    ),
  ].join('');

  // Overall score
  const score = aiInsights.seoScore.score;
  const scoreColorClass = score >= 70 ? 'score-green' : score >= 40 ? 'score-yellow' : 'score-red';

  scoreBox.innerHTML = `
    <div>
      <div class="score-number ${scoreColorClass}">${score}</div>
      <div class="score-label">/ 100</div>
    </div>
    <div class="score-explanation">${escapeHtml(aiInsights.seoScore.explanation)}</div>
  `;

  // Category scores
  const cats = aiInsights.categoryScores;
  if (cats) {
    const catHtml = Object.entries({
      Content: cats.content,
      Technical: cats.technical,
      'On-Page': cats.onPage,
      Accessibility: cats.accessibility,
    }).map(([name, val]) => {
      const cls = val >= 70 ? 'bar-green' : val >= 40 ? 'bar-yellow' : 'bar-red';
      return `
        <div class="cat-row">
          <span class="cat-label">${name}</span>
          <div class="cat-bar-track">
            <div class="cat-bar ${cls}" style="width:${val}%"></div>
          </div>
          <span class="cat-score">${val}</span>
        </div>`;
    }).join('');
    scoreBox.insertAdjacentHTML('afterend', `<div class="category-scores">${catHtml}</div>`);
  }

  suggestionsEl.innerHTML = `
    <p class="section-title">Prioritized Suggestions</p>
    <ol class="suggestions-list">
      ${aiInsights.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
    </ol>
  `;

  blogIdeasEl.innerHTML = `
    <p class="section-title">Blog Post Ideas</p>
    <ul class="blog-list">
      ${aiInsights.blogIdeas.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
    </ul>
  `;

  results.classList.remove('hidden');
  document.getElementById('resetBtn').classList.remove('hidden');

  if (geoAnalytics) renderGeoResults(geoAnalytics, aiInsights.geoScore, aiInsights.geoInsights);
}

function renderGeoResults(geo, geoScore, ins) {
  const geoCard   = document.getElementById('geoCard');
  const sc        = geoScore?.score ?? ins?.vibeReadiness ?? 0;
  const ringClass = sc >= 70 ? 'green-ring' : sc >= 40 ? 'yellow-ring' : 'red-ring';
  const scClass   = sc >= 70 ? 'score-green' : sc >= 40 ? 'score-yellow' : 'score-red';
  const platformLabel = geo.platform === 'generic' ? 'Generic Site' : geo.platform.toUpperCase();

  // 1 — Vibe Readiness Score hero
  document.getElementById('geoVibeHero').innerHTML = `
    <div class="vibe-hero">
      <div class="vibe-hero-score">
        <div class="vibe-score-ring ${ringClass}">
          <span class="vibe-score-num ${scClass}">${sc}</span>
        </div>
        <div class="vibe-score-label">VIBE READINESS<br><span class="vibe-score-sub">/ 100</span></div>
      </div>
      <div class="vibe-hero-info">
        <div class="vibe-platform-badge">${escapeHtml(platformLabel)}</div>
        <p class="vibe-explanation">${escapeHtml(geoScore?.explanation || '')}</p>
      </div>
    </div>
  `;

  // 2 — GEO Signals audit table
  const signals = [
    {
      name: 'Hreflang Tags', icon: '🌐',
      ok: geo.hreflang.hasEnUs,
      status: geo.hreflang.count > 0 ? `${geo.hreflang.count} tag${geo.hreflang.count !== 1 ? 's' : ''}` : 'Missing',
      detail: geo.hreflang.count > 0
        ? geo.hreflang.tags.map(t => escapeHtml(t.lang)).join(', ')
        : 'No hreflang tags found — required for international targeting',
    },
    {
      name: 'Schema Markup', icon: '🗂',
      ok: geo.schema.types.length > 0,
      status: geo.schema.types.length > 0 ? `${geo.schema.types.length} type${geo.schema.types.length !== 1 ? 's' : ''}` : 'Missing',
      detail: geo.schema.types.length > 0
        ? escapeHtml(geo.schema.types.join(', '))
        : ins?.schemaStatus || 'No JSON-LD found — needed for AI &amp; search visibility',
    },
    {
      name: 'Semantic Chunking', icon: '📄',
      ok: geo.semanticChunking.idealParas > 0,
      status: `${geo.semanticChunking.idealParas}/${geo.semanticChunking.totalParas} ideal`,
      detail: ins?.semanticChunkingStatus || 'Paragraphs in 40-150 word range for LLM readability',
    },
    {
      name: 'Brand Entity', icon: '🏢',
      ok: geo.brandEntity.hasAddress || geo.brandEntity.hasLocalBizSchema,
      status: (() => {
        const parts = [
          geo.brandEntity.hasAddress && 'Address',
          geo.brandEntity.hasTel && 'Phone',
          geo.brandEntity.hasEmail && 'Email',
        ].filter(Boolean);
        return parts.length ? parts.join(' + ') : 'Missing';
      })(),
      detail: ins?.brandEntityStatus || 'NAP consistency &amp; schema for AI agent verification',
    },
  ];

  document.getElementById('geoSignalsTable').innerHTML = `
    <p class="section-title">GEO Signals Audit</p>
    <table class="geo-table">
      <thead><tr><th>Signal</th><th>Status</th><th>Detail</th></tr></thead>
      <tbody>
        ${signals.map(s => `
          <tr>
            <td class="geo-signal-name">${s.icon} ${s.name}</td>
            <td><span class="badge badge-${s.ok ? 'ok' : 'warn'}">${escapeHtml(s.status)}</span></td>
            <td class="geo-signal-detail">${s.detail}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;

  // 3 — US Market Sentiment (prominent)
  const sentScore    = ins?.usSentimentScore ?? 0;
  const sentBarClass = sentScore >= 70 ? 'bar-green' : sentScore >= 40 ? 'bar-yellow' : 'bar-red';
  const sentNumClass = sentScore >= 70 ? 'score-green' : sentScore >= 40 ? 'score-yellow' : 'score-red';
  document.getElementById('geoSentiment').innerHTML = `
    <div class="sentiment-card">
      <div class="sentiment-header">
        <span class="sentiment-flag">🇺🇸</span>
        <span class="sentiment-title">US Market Sentiment</span>
        <span class="sentiment-score ${sentNumClass}">${sentScore}<span class="sentiment-score-sub">/100</span></span>
      </div>
      <div class="cat-bar-track" style="margin:0.6rem 0 0.75rem">
        <div class="cat-bar ${sentBarClass}" style="width:${sentScore}%"></div>
      </div>
      <p class="sentiment-text">${escapeHtml(ins?.usToneAssessment || '')}</p>
    </div>
  `;

  // 4 — Founder-level Strategic Brief
  if (ins?.strategicBrief) {
    document.getElementById('geoStrategyBrief').innerHTML = `
      <div class="strategy-brief">
        <p class="section-title">Founder-Level Strategic Brief</p>
        <p class="strategy-text">${escapeHtml(ins.strategicBrief)}</p>
        ${ins.audiencePersona ? `<div class="persona-tag">🎯 Ideal US Persona: <em>${escapeHtml(ins.audiencePersona)}</em></div>` : ''}
      </div>
    `;
  }

  // 5 — GEO Action Items
  if (ins?.geoSuggestions?.length) {
    document.getElementById('geoSuggestions').innerHTML = `
      <p class="section-title" style="margin-top:1.25rem">GEO Action Items</p>
      <ol class="suggestions-list">${ins.geoSuggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
    `;
  }

  geoCard.classList.remove('hidden');
}

function wordCountHint(count) {
  if (count < 300) return 'Too short (aim for 300+)';
  if (count < 600) return 'Acceptable';
  if (count <= 2500) return 'Good length';
  return 'Very long';
}

function metric(label, value, sub = '', status = '') {
  const statusClass = status ? ` metric--${status}` : '';
  return `
    <div class="metric${statusClass}">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      ${sub ? `<div class="metric-sub">${sub}</div>` : ''}
    </div>`;
}

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

function clearResults() {
  results.classList.add('hidden');
  errorBox.classList.add('hidden');
  errorBox.textContent = '';
  document.getElementById('resetBtn').classList.add('hidden');
  document.querySelector('.category-scores')?.remove();
  document.getElementById('geoCard')?.classList.add('hidden');
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
  urlInput.value = '';
  urlInput.focus();
}
