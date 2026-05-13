const urlInput   = document.getElementById('urlInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const loader     = document.getElementById('loader');
const errorBox   = document.getElementById('error');
const results    = document.getElementById('results');
const analyticsGrid = document.getElementById('analyticsGrid');
const scoreBox   = document.getElementById('scoreBox');
const suggestionsEl = document.getElementById('suggestions');
const blogIdeasEl   = document.getElementById('blogIdeas');

analyzeBtn.addEventListener('click', analyze);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') analyze(); });

async function analyze() {
  const url = urlInput.value.trim();
  if (!url) return;

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
    metric('Word Count', analytics.wordCount),
    metric('Title Tag', `${analytics.title.length} chars`, analytics.title.content || '(none)'),
    metric('Meta Description', `${analytics.metaDescription.length} chars`, analytics.metaDescription.content || '(none)'),
    metric('H1 / H2 / H3', `${analytics.headings.h1} / ${analytics.headings.h2} / ${analytics.headings.h3}`),
    metric('Images Missing Alt', analytics.imagesWithoutAlt),
  ].join('');

  scoreBox.innerHTML = `
    <div>
      <div class="score-number">${aiInsights.seoScore.score}</div>
      <div class="score-label">/ 100</div>
    </div>
    <div class="score-explanation">${aiInsights.seoScore.explanation}</div>
  `;

  suggestionsEl.innerHTML = `
    <p class="section-title">Prioritized Suggestions</p>
    <ol class="suggestions-list">
      ${aiInsights.suggestions.map(s => `<li>${s}</li>`).join('')}
    </ol>
  `;

  blogIdeasEl.innerHTML = `
    <p class="section-title">Blog Post Ideas</p>
    <ul class="blog-list">
      ${aiInsights.blogIdeas.map(i => `<li>${i}</li>`).join('')}
    </ul>
  `;

  results.classList.remove('hidden');
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
}

function clearResults() {
  results.classList.add('hidden');
  errorBox.classList.add('hidden');
  errorBox.textContent = '';
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}
