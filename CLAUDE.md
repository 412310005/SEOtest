# CLAUDE.md — SEOtest

> **Documentation Version**: 1.0
> **Last Updated**: 2026-05-13
> **Project**: SEOtest
> **Description**: On-Page SEO Analyzer powered by Google Gemini 1.5 Pro
> **Features**: GitHub auto-backup, technical debt prevention

This file provides essential guidance to Claude Code when working with this repository.

## Project Overview

SEOtest analyzes any URL for on-page SEO metrics (title, meta description, headings, word count, missing alt text) and uses the Gemini 1.5 Pro API to generate an SEO score, prioritized suggestions, and blog post ideas.

## Technology Stack

- **Backend**: Node.js + Express (`server.js`)
- **Frontend**: `public/index.html`, `public/style.css`, `public/script.js`
- **AI**: `@google/generative-ai` → Gemini 1.5 Pro
- **Scraping**: `axios` (HTTP) + `cheerio` (HTML parsing)
- **Config**: `dotenv` (`.env` file with `GEMINI_API_KEY`)

## Project Structure

```
SEOtest/
├── CLAUDE.md          ← this file
├── README.md
├── package.json
├── server.js          ← Express server + scraping + Gemini integration
├── .env               ← GEMINI_API_KEY (never commit)
├── .env.example       ← template for env vars
├── .gitignore
└── public/
    ├── index.html     ← single-page UI
    ├── style.css      ← dark-mode styles (#1A1A1A / #007BFF)
    └── script.js      ← fetch calls, DOM rendering
```

## 🚨 CRITICAL RULES

### Absolute Prohibitions
- **NEVER** create files in the root directory beyond what already exists
- **NEVER** commit `.env` (contains the API key)
- **NEVER** use `find`, `grep`, `cat` in Bash — use Read, Grep, Glob tools instead
- **NEVER** use git commands with `-i` flag
- **NEVER** create duplicate files (server_v2.js, style_new.css, etc.) — extend originals

### Mandatory Requirements
- **COMMIT** after every completed task
- **PUSH** to GitHub after every commit: `git push origin main`
- **READ FILES FIRST** before editing — Edit/Write tools fail otherwise
- **SEARCH FIRST** before creating — extend existing code, don't duplicate

### Pre-Task Checklist
Before starting any task verify:
- [ ] Will this create root-level files? → use proper structure instead
- [ ] Does similar code already exist? → extend it
- [ ] Am I about to use grep/cat/find? → use proper tools instead

## Common Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## Environment Setup

```bash
cp .env.example .env
# Edit .env and set your GEMINI_API_KEY
```

## GitHub Backup

```bash
git push origin main
```

## Parallel Task Workflow

Claude Code can spawn background agents via TaskCreate to run independent work simultaneously. Use this when a feature touches multiple isolated layers.

### When to parallelize

| Scenario | Tasks to run in parallel |
|---|---|
| Add a new SEO metric | Task A: `server.js` → Task B: `index.html` + `style.css` → Task C: `script.js` |
| Refactor + smoke test | Task A: refactor `server.js` endpoint → Task B: Playwright test |
| Multi-URL batch feature | Task A: backend endpoint → Task B: frontend UI → Task C: README update |

### Rules
- Each task must own **one file or one clearly bounded concern** — never let two tasks edit the same file simultaneously.
- The spawning agent waits with TaskGet (polling) before the commit+push step, so only one commit is created per feature.
- Every task must still follow the CRITICAL RULES above.

### Commit discipline
After all tasks complete: review all changes → `git add` changed files → one commit → `git push origin main`.

---

*Template by Chang Ho Chien | HC AI 說人話channel | v1.0.0*
