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

// ── Render SEO analytics ──────────────────────────────────
function renderResults({ analytics, aiInsights, geoAnalytics }) {
  const { title, metaDescription, headings, images, links, canonical, robotsMeta, lang, openGraph, responseTimeMs } = analytics;

  analyticsGrid.innerHTML = [
    metric('Word Count', analytics.wordCount.toLocaleString(), wordCountHint(analytics.wordCount)),
    metric('Title Tag',
      `${title.length} chars${statusIcon(title.length, 50, 60)}`,
      escapeHtml(title.content) || '(none)',
      title.length >= 50 && title.length <= 60 ? 'ok' : 'warn'),
    metric('Meta Description',
      `${metaDescription.length} chars${statusIcon(metaDescription.length, 150, 160)}`,
      escapeHtml(metaDescription.content) || '(none)',
      metaDescription.length >= 150 && metaDescription.length <= 160 ? 'ok' : 'warn'),
    metric('Headings',
      `H1: ${headings.h1} &nbsp;H2: ${headings.h2} &nbsp;H3: ${headings.h3}`,
      headings.h1Text ? `H1: "${escapeHtml(headings.h1Text)}"` : '',
      headings.h1 === 1 ? 'ok' : 'warn'),
    metric('Images', `${images.total} total`,
      images.missingAlt > 0 ? `${images.missingAlt} missing alt text` : 'All images have alt text',
      images.missingAlt === 0 ? 'ok' : 'warn'),
    metric('Links', `${links.internal} internal &nbsp;/ &nbsp;${links.external} external`, ''),
    metric('Canonical URL',
      canonical ? badge(true, 'Set') : badge(false, 'Missing'),
      canonical ? escapeHtml(canonical) : 'No canonical tag found'),
    metric('Open Graph',
      [badge(!!openGraph.title, 'Title'), badge(!!openGraph.description, 'Desc'), badge(openGraph.image, 'Image')].join(' '), ''),
    metric('Robots Meta', robotsMeta ? escapeHtml(robotsMeta) : badge(false, 'Not set'), ''),
    metric('Page Language', lang ? badge(true, escapeHtml(lang)) : badge(false, 'Not set'), ''),
    metric('Response Time', `${responseTimeMs} ms`,
      responseTimeMs < 500 ? 'Fast' : responseTimeMs < 1500 ? 'Moderate' : 'Slow',
      responseTimeMs < 1500 ? 'ok' : 'warn'),
  ].join('');

  const score = aiInsights.seoScore.score;
  const scClass = score >= 70 ? 'score-green' : score >= 40 ? 'score-yellow' : 'score-red';
  scoreBox.innerHTML = `
    <div>
      <div class="score-number ${scClass}">${score}</div>
      <div class="score-label">/ 100</div>
    </div>
    <div class="score-explanation">${escapeHtml(aiInsights.seoScore.explanation)}</div>
  `;

  const cats = aiInsights.categoryScores;
  if (cats) {
    const catHtml = Object.entries({ Content: cats.content, Technical: cats.technical, 'On-Page': cats.onPage, Accessibility: cats.accessibility })
      .map(([name, val]) => {
        const cls = val >= 70 ? 'bar-green' : val >= 40 ? 'bar-yellow' : 'bar-red';
        return `<div class="cat-row">
          <span class="cat-label">${name}</span>
          <div class="cat-bar-track"><div class="cat-bar ${cls}" style="width:${val}%"></div></div>
          <span class="cat-score">${val}</span>
        </div>`;
      }).join('');
    scoreBox.insertAdjacentHTML('afterend', `<div class="category-scores">${catHtml}</div>`);
  }

  suggestionsEl.innerHTML = `
    <p class="section-title">Prioritized Suggestions</p>
    <ol class="suggestions-list">${aiInsights.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ol>
  `;
  blogIdeasEl.innerHTML = `
    <p class="section-title">Blog Post Ideas</p>
    <ul class="blog-list">${aiInsights.blogIdeas.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
  `;

  results.classList.remove('hidden');
  document.getElementById('resetBtn').classList.remove('hidden');
  if (geoAnalytics) renderGeoResults(geoAnalytics, aiInsights.geoScore, aiInsights.geoInsights);
}

// ── Render 2026 Global Growth Dashboard ──────────────────
function renderGeoResults(geo, geoScore, ins) {
  const geoCard = document.getElementById('geoCard');
  const sc       = geoScore?.score ?? ins?.vibeReadiness ?? 0;
  const scClass  = sc >= 70 ? 'score-green' : sc >= 40 ? 'score-yellow' : 'score-red';
  const platformLabel = geo.platform === 'generic' ? 'Generic' : geo.platform.toUpperCase();

  // ── 🏆 Vibe Readiness Score ───────────────────────────
  document.getElementById('geoVibeHero').innerHTML = `
    <div class="vibe-card">
      <span class="vibe-emoji">🏆</span>
      <div class="vibe-big-num ${scClass}" id="vibeCountUp">0</div>
      <div class="vibe-denom">/ 100</div>
      <div class="vibe-card-label">Vibe Readiness</div>
      <div class="vibe-platform">${escapeHtml(platformLabel)}</div>
    </div>
  `;
  animateCount(document.getElementById('vibeCountUp'), sc);

  // ── 🌐 Global i18n Check ──────────────────────────────
  const hreflangPillsHtml = geo.hreflang.count > 0
    ? `<div class="hreflang-pills">${geo.hreflang.tags.map(t => `<span class="hreflang-pill">${escapeHtml(t.lang)}</span>`).join('')}</div>`
    : '';

  document.getElementById('geoI18n').innerHTML = `
    <div class="i18n-card">
      <div class="dash-card-title">🌐 Global i18n Check</div>
      <div class="i18n-row">
        <span class="i18n-label">Hreflang</span>
        <div class="i18n-val">
          ${geo.hreflang.count > 0 ? badge(true, `${geo.hreflang.count} found`) : badge(false, 'Missing')}
          ${hreflangPillsHtml}
        </div>
      </div>
      <div class="i18n-row">
        <span class="i18n-label">en-US Target</span>
        <div class="i18n-val">${geo.hreflang.hasEnUs ? badge(true, 'Set') : badge(false, 'Not set')}</div>
      </div>
      <div class="i18n-row">
        <span class="i18n-label">Name Match</span>
        <div class="i18n-val">${geo.brandEntity.consistentName ? badge(true, 'Consistent') : badge(false, 'Mismatch')}</div>
      </div>
      <div class="i18n-row">
        <span class="i18n-label">Assessment</span>
        <div class="i18n-val" style="font-size:0.72rem;color:var(--muted)">${escapeHtml(ins?.hreflangStatus || '—')}</div>
      </div>
    </div>
  `;

  // ── 🤖 GEO Signals ────────────────────────────────────
  const entityBadges = [
    geo.brandEntity.hasAddress && badge(true, 'Addr'),
    geo.brandEntity.hasTel     && badge(true, 'Tel'),
    geo.brandEntity.hasEmail   && badge(true, 'Email'),
  ].filter(Boolean);

  document.getElementById('geoSignals').innerHTML = `
    <div class="geo-signals-card">
      <div class="dash-card-title">🤖 GEO Signals</div>
      <div class="geo-sig-row">
        <span class="geo-sig-icon">🗂</span>
        <div class="geo-sig-info">
          <div class="geo-sig-name">Schema Markup</div>
          <div class="geo-sig-detail">${geo.schema.types.length > 0 ? escapeHtml(geo.schema.types.join(', ')) : ins?.schemaStatus || 'No JSON-LD found'}</div>
        </div>
        <span class="geo-sig-status">${geo.schema.types.length > 0 ? badge(true, `${geo.schema.types.length} type${geo.schema.types.length !== 1 ? 's' : ''}`) : badge(false, 'Missing')}</span>
      </div>
      <div class="geo-sig-row">
        <span class="geo-sig-icon">📄</span>
        <div class="geo-sig-info">
          <div class="geo-sig-name">Semantic Chunking</div>
          <div class="geo-sig-detail">${escapeHtml(ins?.semanticChunkingStatus || `${geo.semanticChunking.idealParas}/${geo.semanticChunking.totalParas} paragraphs in ideal range`)}</div>
        </div>
        <span class="geo-sig-status">${badge(geo.semanticChunking.idealParas > 0, `${geo.semanticChunking.idealParas}/${geo.semanticChunking.totalParas}`)}</span>
      </div>
      <div class="geo-sig-row">
        <span class="geo-sig-icon">🏢</span>
        <div class="geo-sig-info">
          <div class="geo-sig-name">Brand Entity</div>
          <div class="geo-sig-detail">${escapeHtml(ins?.brandEntityStatus || 'NAP & schema check')}</div>
        </div>
        <span class="geo-sig-status">${entityBadges.length ? entityBadges.join(' ') : badge(false, 'Missing')}</span>
      </div>
    </div>
  `;

  // ── 📍 North American Growth Strategy ─────────────────
  const sentScore    = ins?.usSentimentScore ?? 0;
  const sentNumClass = sentScore >= 70 ? 'score-green' : sentScore >= 40 ? 'score-yellow' : 'score-red';
  document.getElementById('geoNAStrategy').innerHTML = `
    <div class="na-strategy-card">
      <div class="dash-card-title">📍 North American Growth Strategy</div>
      <div class="na-top">
        <div class="na-sentiment-score">
          <div class="na-score-num ${sentNumClass}">${sentScore}</div>
          <div class="na-score-denom">/100</div>
          <div class="na-score-label">US Sentiment</div>
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
        <div class="na-brief-label">🏆 Founder-Level Strategic Brief</div>
        <p class="na-brief-text">${escapeHtml(ins.strategicBrief)}</p>
        ${ins.audiencePersona ? `
          <div class="na-persona">
            <span>🎯</span>
            <span><strong style="color:var(--accent)">Ideal US Persona:</strong><br><em>${escapeHtml(ins.audiencePersona)}</em></span>
          </div>` : ''}
      ` : ''}
    </div>
  `;

  // ── GEO Action Items ───────────────────────────────────
  if (ins?.geoSuggestions?.length) {
    document.getElementById('geoSuggestions').innerHTML = `
      <div class="geo-actions-card">
        <p class="section-title">GEO Action Items</p>
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
