# PROJECT_STATUS.md

> Last updated: 2026-06-15
> Based on: actual source code audit (server.js, public/*, package.json, vercel.json)
> Note: README.md and CLAUDE.md contain outdated information — this file is the source of truth.

---

## 專案定位

**AI SEO & GEO Analyzer** — 輸入任何網址，自動分析網站的傳統 SEO 健康度與 AI 搜尋引擎可見度（GEO），並透過 Gemini 2.5 Flash 產出評分、優先改善建議與美國市場進入策略。

---

## 技術 Stack（實際）

| 層次 | 技術 | 版本 |
|------|------|------|
| 執行環境 | Node.js | 未鎖定（建議 18+） |
| Web 框架 | Express | ^4.18.2 |
| HTTP 請求 | axios | ^1.6.0 |
| HTML 解析 | cheerio | ^1.0.0-rc.12 |
| AI SDK | @google/generative-ai | ^0.21.0 |
| AI 模型 | **gemini-2.5-flash** | （非 1.5 Pro，文件有誤） |
| 環境變數 | dotenv | ^16.3.1 |
| 前端 | 原生 HTML + CSS + Vanilla JS | 無框架 |
| 字體 | Google Fonts (Syne, DM Sans) | CDN |
| 開發工具 | nodemon | ^3.0.2 |
| 測試 | @playwright/test | ^1.60.0（已安裝，**零測試檔**） |
| 部署 | Vercel + @vercel/node | vercel.json 已設定 |

---

## 環境變數

| 變數名稱 | 必填 | 說明 |
|---------|------|------|
| `GEMINI_API_KEY` | 是 | Google AI Studio 取得，伺服器啟動時會驗證 |
| `PORT` | 否 | 預設 3000，Vercel 會自動設定 |

---

## 檔案結構（實際）

```
SEOtest/
├── server.js              ← 後端唯一入口（296 行）
├── public/
│   ├── index.html         ← 前端 HTML 骨架（64 行）
│   ├── style.css          ← 淺色 purple/teal 主題（553 行）
│   └── script.js          ← 前端互動邏輯（347 行）
├── vercel.json            ← Vercel serverless 部署設定
├── package.json
├── package-lock.json
├── .env                   ← 本地環境變數（gitignored）
├── .env.example
├── .gitignore
├── CLAUDE.md              ← ⚠️ 部分資訊過時（見下方差異表）
├── README.md              ← ⚠️ 部分資訊過時（見下方差異表）
└── PROJECT_STATUS.md      ← 此檔案（最新）
```

---

## MVP Flow

```
1. 使用者在瀏覽器輸入網址
         ↓
2. [前端] 驗證 URL 格式，自動補 https://
         ↓
3. [前端] POST /analyze { url }，啟動 loading 計時器
         ↓
4. [後端] axios.get(url)，10 秒 timeout，記錄回應時間
         ↓
5. [後端] cheerio 解析 HTML
         ├── extractAnalytics()  → 11 項 SEO 指標
         └── extractGeoAnalytics() → 5 項 GEO 指標
         ↓
6. [後端] 組合 prompt（注入指標數據 + 平台競爭語境）
         ↓
7. [後端] Gemini 2.5 Flash → 回傳 JSON 文字
         ↓
8. [後端] regex 抓取 JSON → JSON.parse()
         ↓
9. [後端] res.json({ analytics, aiInsights, geoAnalytics })
         ↓
10. [前端] renderResults() → SEO 分析區塊
    [前端] renderGeoResults() → 2026 Global Growth Dashboard
```

---

## 已完成功能

### SEO 分析

| 功能 | 狀態 | 說明 |
|------|------|------|
| 字數統計 | ✅ | `body` 文字去除 script/style 後計算 |
| Title tag 分析 | ✅ | 長度 + 內容，ideal range 50–60 字元 |
| Meta description 分析 | ✅ | 長度 + 內容，ideal range 150–160 字元 |
| Heading 結構 | ✅ | H1 / H2 / H3 數量，擷取第一個 H1 文字 |
| 圖片 alt 缺漏 | ✅ | 計算無 alt 屬性的 `<img>` 數量 |
| 內外部連結統計 | ✅ | 依 hostname 判斷 internal / external |
| Canonical URL | ✅ | 偵測是否設定 |
| Robots meta | ✅ | 讀取 content 值 |
| 頁面語言 | ✅ | `<html lang>` 屬性 |
| Open Graph | ✅ | title / description / image 三項 |
| 伺服器回應時間 | ✅ | axios 請求計時（ms） |

### AI 分析（Gemini）

| 功能 | 狀態 | 說明 |
|------|------|------|
| SEO 總分 | ✅ | 0–100 分 + 2–3 句說明 |
| 四維分類評分 | ✅ | content / technical / onPage / accessibility，各 0–100 |
| 優先改善建議 | ✅ | 5 條可執行建議，有序排列 |
| Blog 文章 idea | ✅ | 2 個基於頁面主題的 blog 標題建議 |
| GEO 總分 | ✅ | 0–100 分 + 全球可見度說明 |
| Vibe Readiness Score | ✅ | AI 搜尋引擎準備度 0–100（有數字動畫） |

### GEO 分析（自主擴展）

| 功能 | 狀態 | 說明 |
|------|------|------|
| Hreflang 偵測 | ✅ | 標籤數量、語言清單、是否含 en-US |
| JSON-LD schema 解析 | ✅ | 抓取所有 `@type`，判斷是否含 LocalBusiness |
| 語意段落分塊分析 | ✅ | 統計 40–150 字的理想段落比例（對應 AI RAG 索引邏輯） |
| 品牌實體偵測（NAP） | ✅ | address tag / tel link / email link / LocalBusiness schema |
| OG 與 title 一致性 | ✅ | 品牌名稱跨 tag 一致性檢查 |
| 平台偵測 | ✅ | portaly / eatq / generic 三類 |

### 2026 Global Growth Dashboard（自主擴展）

| 功能 | 狀態 | 說明 |
|------|------|------|
| Global i18n Check | ✅ | hreflang 覆蓋、en-US 目標、品牌名稱一致性 |
| GEO Signals 面板 | ✅ | Schema markup / Semantic chunking / Brand entity 三項 |
| US Market Sentiment Score | ✅ | 0–100 分，衡量美國市場語氣與定位準備度 |
| US Tone Assessment | ✅ | AI 評估內容語氣 vs 北美受眾期望 |
| Founder Strategic Brief | ✅ | 2–3 句創辦人層級的美國市場策略建議 |
| Ideal US Persona | ✅ | 一句話描述理想的北美目標客戶 |
| GEO Action Items | ✅ | 3 條高影響力 GEO 改善建議 |

### 系統與 DevOps

| 功能 | 狀態 | 說明 |
|------|------|------|
| Startup env check | ✅ | 啟動時印出 key 狀態（長度+前8碼，不洩漏完整 key） |
| 完整錯誤分類 | ✅ | API key 無效 / quota / permission / model not found / JSON parse failure / timeout |
| 請求逐步 debug log | ✅ | Step 1~4 各自 console.log，Vercel logs 可追蹤 |
| Vercel serverless 部署 | ✅ | vercel.json 設定完整 |

---

## 唯一 API Endpoint

```
POST /analyze
Content-Type: application/json
Body: { "url": "https://example.com" }

Success 200: { analytics, aiInsights, geoAnalytics }
Error 400:   { error: "..." }  ← URL 無法連線 / HTTP 錯誤 / timeout
Error 500:   { error: "..." }  ← Gemini API 錯誤
```

---

## 資料庫結構

**此專案無資料庫。**

- 完全無狀態（stateless）
- 每次請求獨立處理，無歷史紀錄
- 無 cache，每次分析都重新爬蟲 + 呼叫 Gemini
- 資料只存在 HTTP response 與瀏覽器 DOM 中

---

## 已知限制

| 限制 | 說明 |
|------|------|
| 無 JavaScript 渲染 | axios 無法執行 JS，SPA 網站（React/Vue）可能爬不到內容 |
| 無 rate limiting | POST /analyze 無請求限制，API key 可能被打爆 |
| JSON 解析脆弱 | 用 regex 抓 Gemini 回應中第一個 JSON，格式不符時會失敗 |
| 無快取 | 同一 URL 每次都重新分析，耗費 Gemini quota |
| 無認證 | API endpoint 完全公開 |
| 零測試 | `@playwright/test` 已安裝但無任何測試檔案 |

---

## 文件差異記錄（⚠️ 以下文件內容過時）

| 文件 | 過時內容 | 實際狀態 |
|------|---------|---------|
| README.md | Gemini **1.5 Pro** | 實際使用 **gemini-2.5-flash** |
| README.md | 深色主題 `#1A1A1A` / `#007BFF` | 實際為淺色 `#E8E8F0` / `#6B3FA0` 紫+teal 主題 |
| README.md | Features 列表無 GEO 功能 | GEO 模組、US Market、Dashboard 全部已實作 |
| README.md | 無 categoryScores 說明 | content/technical/onPage/accessibility 四維已實作 |
| README.md | 無 Vercel 部署說明 | vercel.json 已設定 |
| CLAUDE.md | Gemini **1.5 Pro** | 實際使用 **gemini-2.5-flash** |
| CLAUDE.md | dark-mode styles `#1A1A1A / #007BFF` | 淺色 purple/teal 主題 |
| CLAUDE.md | server.js 無 GEO 函式說明 | `extractGeoAnalytics()` 已存在（72 行） |
| CLAUDE.md | 無 `classifyGeminiError` 說明 | 函式已存在（32 行） |
| CLAUDE.md | 無 startup env check 說明 | L17–29 已實作 |
| package.json | description: Gemini 1.5 Pro | 實際使用 gemini-2.5-flash |

---

## 如何啟動

```bash
# 安裝依賴
npm install

# 設定環境變數
cp .env.example .env
# 編輯 .env，填入 GEMINI_API_KEY

# 開發模式（存檔自動重啟）
npm run dev

# 正式啟動
npm start
```

開啟 http://localhost:3000

---

## 如何 Deploy（Vercel）

```bash
npm install -g vercel
vercel        # 預覽環境
vercel --prod # 正式環境
```

Vercel 控制台需設定：`Settings → Environment Variables → GEMINI_API_KEY`
新增或修改環境變數後需 Redeploy 才生效。
