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
  analyticsGrid.innerHTML = [
    metric('Word Count', analytics.wordCount.toLocaleString()),
    metric(
      'Title Tag',
      `${analytics.title.length} chars${statusIcon(analytics.title.length, 50, 60)}`,
      escapeHtml(analytics.title.content) || '(none)'
    ),
    metric(
      'Meta Description',
      `${analytics.metaDescription.length} chars${statusIcon(analytics.metaDescription.length, 150, 160)}`,
      escapeHtml(analytics.metaDescription.content) || '(none)'
    ),
    metric('H1 / H2 / H3', `${analytics.headings.h1} / ${analytics.headings.h2} / ${analytics.headings.h3}`),
    metric('Images Missing Alt', analytics.imagesWithoutAlt),
  ].join('');

  const score = aiInsights.seoScore.score;
  const scoreColorClass = score >= 70 ? 'score-green' : score >= 40 ? 'score-yellow' : 'score-red';

  scoreBox.innerHTML = `
    <div>
      <div class="score-number ${scoreColorClass}">${score}</div>
      <div class="score-label">/ 100</div>
    </div>
    <div class="score-explanation">${escapeHtml(aiInsights.seoScore.explanation)}</div>
  `;

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

function metric(label, value, sub = '') {
  return `
    <div class="metric">
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
  urlInput.value = '';
  urlInput.focus();
}
