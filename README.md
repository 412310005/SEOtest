# SEOtest — On-Page SEO Analyzer

Analyze any webpage's on-page SEO metrics and get AI-powered improvement suggestions, powered by **Google Gemini 1.5 Pro**.

## Features

- Word count, title tag, meta description, heading counts (H1/H2/H3), missing alt text
- AI-generated SEO score (0–100) with explanation
- Prioritized 3–5 improvement suggestions
- Two creative blog post ideas based on the page topic
- Dark-mode UI (#1A1A1A background, #007BFF accent)

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up environment**
   ```bash
   cp .env.example .env
   # Open .env and add your Gemini API key
   ```

3. **Run the server**
   ```bash
   npm run dev   # development (auto-restart)
   npm start     # production
   ```

4. Open `http://localhost:3000`, paste a URL, and click **Analyze**.

## Getting a Gemini API Key

Visit [Google AI Studio](https://aistudio.google.com/app/apikey) to generate a free API key, then add it to `.env`:

```
GEMINI_API_KEY=your_key_here
```

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Backend  | Node.js, Express                  |
| Scraping | axios, cheerio                    |
| AI       | @google/generative-ai (Gemini)    |
| Frontend | HTML, CSS, Vanilla JS             |
