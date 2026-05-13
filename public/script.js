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

function renderResults({ analytics, aiInsights }) {
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
  // Remove category scores injected by previous render
  document.querySelector('.category-scores')?.remove();
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
  urlInput.value = '';
  urlInput.focus();
}
