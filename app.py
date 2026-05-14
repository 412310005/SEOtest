import hashlib
import json
import html
import random
import re
import time
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


def apply_glossary_nav_from_query_params(chapter_map: dict) -> None:
    """Read ?gc=&gslide=&gterm=&gzh= from URL; sync sidebar chapter + Glossary tab + scroll target."""
    qp = st.query_params
    if "gc" not in qp:
        return
    ckey = str(qp["gc"])
    if ckey not in set(chapter_map.values()):
        for k in list(qp.keys()):
            try:
                del st.query_params[k]
            except Exception:
                pass
        return
    label = next((lab for lab, ky in chapter_map.items() if ky == ckey), None)
    if label is not None:
        st.session_state["sidebar_chapter_select"] = label
    st.session_state["app_main_section"] = GLOSSARY_TAB_LABEL
    gterm = qp.get("gterm")
    gcard = str(qp.get("gcard", "") or "").strip()
    has_term = gterm is not None and str(gterm).strip() != ""
    if has_term or gcard:
        st.session_state["glossary_scroll_target"] = {
            "chapter_key": ckey,
            "slide_title": str(qp.get("gslide", "") or ""),
            "term": str(gterm or "") if has_term else "",
            "zh": str(qp.get("gzh", "") or ""),
            "card_id": gcard,
        }
    else:
        st.session_state.pop("glossary_scroll_target", None)
    for k in ("gc", "gslide", "gterm", "gzh", "gcard"):
        if k in st.query_params:
            try:
                del st.query_params[k]
            except Exception:
                pass


st.set_page_config(page_title="Risk Exam Trainer", layout="wide", page_icon="🛡️")

# When Streamlit's bundled Material Symbols Rounded fails to load, ligature text
# (e.g. "keyboard_arrow_down") would show; scrub those nodes after a delayed probe.
_MATERIAL_SYMBOLS_GUARD_HTML = r"""
<script>
(function () {
  var doc = window.parent && window.parent.document ? window.parent.document : document;
  var rootEl = doc.documentElement;
  function materialFontOk() {
    try {
      return doc.fonts && doc.fonts.check('16px "Material Symbols Rounded"');
    } catch (e) {
      return true;
    }
  }
  function scrubIconLigatures() {
    var root = doc.querySelector('[data-testid="stAppViewContainer"]') || doc.body;
    root.querySelectorAll("span, i").forEach(function (el) {
      if (el.querySelector("*")) return;
      var t = (el.textContent || "").trim();
      if (!/^[a-z][a-z0-9_]{1,39}$/.test(t)) return;
      var ff = (doc.defaultView.getComputedStyle(el).fontFamily || "").toLowerCase();
      if (ff.indexOf("material symbols") === -1 && ff.indexOf("material icons") === -1) return;
      el.style.setProperty("font-size", "0", "important");
      el.style.setProperty("line-height", "0", "important");
      el.style.setProperty("color", "transparent", "important");
      el.style.setProperty("overflow", "hidden", "important");
      el.style.setProperty("display", "inline-block", "important");
      el.style.setProperty("max-width", "1.1em", "important");
      el.style.setProperty("max-height", "1.1em", "important");
      el.style.setProperty("vertical-align", "middle", "important");
    });
  }
  function run() {
    if (!doc.fonts || !doc.fonts.ready) return;
    doc.fonts.ready.then(function () {
      if (materialFontOk()) return;
      setTimeout(function () {
        if (materialFontOk()) return;
        rootEl.classList.add("st-mat-symbols-missing");
        scrubIconLigatures();
        setTimeout(scrubIconLigatures, 1500);
        setTimeout(scrubIconLigatures, 4500);
      }, 2000);
    });
  }
  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
</script>
"""
if "_material_symbols_glyph_guard" not in st.session_state:
    st.session_state._material_symbols_glyph_guard = True
    components.html(_MATERIAL_SYMBOLS_GUARD_HTML, height=0)

NEWS_DATA = {
    "climate_modeling": {
        "title": "Global insurers increase climate-risk modeling investments",
        "title_zh": "全球保險公司加碼氣候風險模型投資",
        "url": "https://www.reuters.com/sustainability/climate-energy/swiss-re-sees-claims-natural-catastrophes-rising-2026-2026-03-19/",
        "summary_points": [
            {
                "en": "Climate analytics improves underwriting accuracy for catastrophe-prone portfolios.",
                "zh": "氣候分析可提升高災害曝險組合的核保精準度。",
            },
            {
                "en": "Better modeling supports fairer pricing and stronger risk selection.",
                "zh": "更好的模型有助於更公平的定價與更嚴謹的風險篩選。",
            },
            {
                "en": "Students should connect this to solvency and long-term insurer resilience.",
                "zh": "保險學生可連結到清償能力與保險公司長期韌性議題。",
            },
        ],
        "vocabulary": [
            {"term": "Catastrophe Modeling", "zh": "巨災模型"},
            {"term": "Underwriting", "zh": "核保"},
            {"term": "Exposure", "zh": "曝險"},
        ],
    },
    "ai_governance": {
        "title": "Enterprise risk teams accelerate AI governance frameworks",
        "title_zh": "企業風險團隊加速導入 AI 治理框架",
        "url": "https://www.insurancejournal.com/news/national/2026/03/10/861186.htm",
        "summary_points": [
            {
                "en": "AI governance helps insurers control model risk and compliance risk.",
                "zh": "AI 治理有助保險業控制模型風險與法遵風險。",
            },
            {
                "en": "Clear accountability structures reduce operational surprises.",
                "zh": "明確責任分工可降低營運意外與管理盲點。",
            },
            {
                "en": "This is useful for understanding modern enterprise risk management (ERM).",
                "zh": "這有助於理解現代企業風險管理（ERM）實務。",
            },
        ],
        "vocabulary": [
            {"term": "Model Risk", "zh": "模型風險"},
            {"term": "Governance", "zh": "治理"},
            {"term": "Compliance", "zh": "法規遵循"},
        ],
    },
    "commercial_pricing": {
        "title": "Commercial lines pricing adjusts to catastrophe exposure trends",
        "title_zh": "商業保險因巨災曝險趨勢調整費率",
        "url": "https://www.insurancejournal.com/news/national/2026/03/23/863060.htm",
        "summary_points": [
            {
                "en": "Commercial premiums move with expected losses and volatility shifts.",
                "zh": "商業險保費會隨預期損失與波動變化而調整。",
            },
            {
                "en": "Catastrophe concentration increases capital pressure on insurers.",
                "zh": "巨災集中風險會提高保險公司的資本壓力。",
            },
            {
                "en": "Students should relate this to rate adequacy and portfolio diversification.",
                "zh": "學生可連結到費率適足性與投保組合分散化。",
            },
        ],
        "vocabulary": [
            {"term": "Rate Adequacy", "zh": "費率適足性"},
            {"term": "Volatility", "zh": "波動性"},
            {"term": "Commercial Lines", "zh": "商業保險"},
        ],
    },
    "cyber_underwriting": {
        "title": "Cyber insurance underwriting tightens amid ransomware severity",
        "title_zh": "勒索軟體風險升高，網路保險核保趨嚴",
        "url": "https://www.insurancejournal.com/news/national/2026/02/10/857525.htm",
        "summary_points": [
            {
                "en": "Higher cyber claim severity pushes stricter underwriting standards.",
                "zh": "網路理賠嚴重度上升，促使核保標準更嚴格。",
            },
            {
                "en": "Insurers increasingly require security controls before binding coverage.",
                "zh": "保險人愈來愈常要求資安控管達標後才承保。",
            },
            {
                "en": "This demonstrates how risk prevention and insurance pricing interact.",
                "zh": "這展現風險預防措施與保險定價的互動關係。",
            },
        ],
        "vocabulary": [
            {"term": "Claim Severity", "zh": "損失嚴重度"},
            {"term": "Ransomware", "zh": "勒索軟體"},
            {"term": "Coverage", "zh": "保障範圍"},
        ],
    },
    "insurtech_analytics": {
        "title": "InsurTech platforms expand real-time claims analytics capabilities",
        "title_zh": "保險科技平台擴大即時理賠分析能力",
        "url": "https://www.insurancejournal.com/news/national/2026/04/02/864338.htm",
        "summary_points": [
            {
                "en": "Real-time analytics can shorten claim cycle time and detect anomalies earlier.",
                "zh": "即時分析可縮短理賠週期並及早偵測異常。",
            },
            {
                "en": "Data-driven workflows may reduce fraud and improve customer experience.",
                "zh": "數據導向流程可降低詐欺並提升客戶體驗。",
            },
            {
                "en": "Students should see this as digital transformation in insurance operations.",
                "zh": "學生可將其視為保險營運流程的數位轉型。",
            },
        ],
        "vocabulary": [
            {"term": "Claims Analytics", "zh": "理賠分析"},
            {"term": "Fraud Detection", "zh": "詐欺偵測"},
            {"term": "InsurTech", "zh": "保險科技"},
        ],
    },
    "reinsurance_pricing": {
        "title": "Reinsurers revise catastrophe pricing ahead of storm season",
        "title_zh": "風暴季前再保險公司調整巨災定價",
        "url": "https://www.reuters.com/business/demand-risks-global-data-centre-insurance-growing-swiss-re-says-2026-03-27/",
        "summary_points": [
            {
                "en": "Reinsurance pricing changes affect primary insurers' cost structure.",
                "zh": "再保險定價變動會影響原保險公司的成本結構。",
            },
            {
                "en": "Higher treaty costs may flow into end-customer premiums.",
                "zh": "再保合約成本上升可能轉嫁至終端保費。",
            },
            {
                "en": "This helps students understand risk transfer layers in insurance markets.",
                "zh": "此議題有助理解保險市場中的風險移轉層級。",
            },
        ],
        "vocabulary": [
            {"term": "Reinsurance", "zh": "再保險"},
            {"term": "Treaty", "zh": "再保合約"},
            {"term": "Risk Transfer", "zh": "風險移轉"},
        ],
    },
    "health_wellness": {
        "title": "Health insurers explore usage-based wellness program incentives",
        "title_zh": "健康保險公司探索使用行為導向的健康激勵方案",
        "url": "https://www.reuters.com/business/equitable-corebridge-merger-talks-create-22-billion-insurer-ft-reports-2026-03-26/",
        "summary_points": [
            {
                "en": "Usage-based programs align insured behavior with preventive health goals.",
                "zh": "使用行為導向方案可讓被保險人行為更符合預防醫學目標。",
            },
            {
                "en": "Incentive design can reduce claim frequency over time.",
                "zh": "激勵機制設計可逐步降低理賠頻率。",
            },
            {
                "en": "Students should link this to moral hazard and loss prevention.",
                "zh": "學生可連結到道德危險與損失預防。",
            },
        ],
        "vocabulary": [
            {"term": "Usage-Based Insurance", "zh": "使用行為導向保險"},
            {"term": "Incentive Design", "zh": "誘因設計"},
            {"term": "Moral Hazard", "zh": "道德危險"},
        ],
    },
    "risk_dashboards": {
        "title": "Boards prioritize enterprise risk dashboards for faster decisions",
        "title_zh": "董事會重視企業風險儀表板以加速決策",
        "url": "https://www.reuters.com/sustainability/boards-policy-regulation/india-plans-sovereign-guarantees-insurers-iran-war-heightens-shipping-risks-2026-04-07/",
        "summary_points": [
            {
                "en": "Risk dashboards increase visibility of emerging threats.",
                "zh": "風險儀表板可提高對新興威脅的可視性。",
            },
            {
                "en": "Faster reporting supports timely underwriting and capital decisions.",
                "zh": "更即時的報告有助核保與資本配置決策。",
            },
            {
                "en": "Students can connect this to governance quality and risk culture.",
                "zh": "學生可將此連結到治理品質與風險文化。",
            },
        ],
        "vocabulary": [
            {"term": "Risk Dashboard", "zh": "風險儀表板"},
            {"term": "Risk Culture", "zh": "風險文化"},
            {"term": "Capital Allocation", "zh": "資本配置"},
        ],
    },
}


def resolve_news_article_url(news_item: dict) -> str:
    """Prefer `url`, then `link`; must open real articles in a new tab."""
    u = (news_item.get("url") or news_item.get("link") or "").strip()
    if u.startswith(("http://", "https://")):
        return u
    return "https://www.reuters.com/business/finance/"


def load_study_data():
    data_path = Path(__file__).with_name("study_data.json")
    try:
        with data_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        st.error("找不到 `study_data.json`，請確認檔案位於 `app.py` 同一資料夾。")
        st.stop()
    except json.JSONDecodeError:
        st.error("`study_data.json` 格式錯誤，請確認是有效 JSON。")
        st.stop()


def normalize_question_type(question):
    q_type = str(question.get("type", "")).strip().lower()
    if q_type in {"multiple_choice", "mcq", "multiple"}:
        return "multiple_choice"
    if q_type in {"qa", "q&a", "short_answer", "short"}:
        return "qa"
    if q_type in {"calculation", "calc", "numeric"}:
        return "calculation"
    if question.get("options"):
        return "multiple_choice"
    if question.get("formula") or question.get("steps"):
        return "calculation"
    return "qa"


def check_answer(user_answer, expected):
    return str(user_answer).strip().lower() == str(expected).strip().lower()


def render_bilingual_question(index, question_text, zh_hint):
    st.markdown(f"#### Q{index}. {question_text}")
    if zh_hint:
        st.caption(f"中文提示：{zh_hint}")


def get_learning_objective_zh_text(item):
    if isinstance(item, str):
        return ""
    zh = str(item.get("explanation_zh", "")).strip()
    if zh:
        return zh
    expl = str(item.get("explanation", ""))
    if "中文：" in expl:
        return expl.split("中文：", 1)[1].strip()
    return ""


def render_local_note_box(storage_key):
    safe_key = json.dumps(storage_key)
    components.html(
        f"""
        <div style="border:1px solid #E5E7EB; border-radius:10px; padding:12px; background:#FAFAFA; margin-top:8px; margin-bottom:8px;">
            <div style="font-weight:700; font-size:15px; margin-bottom:8px; color:#111827;">📝 個人學習筆記</div>
            <textarea id="note_box" placeholder="輸入你的重點整理、記憶口訣、題目陷阱..."
                style="width:100%; min-height:130px; border:1px solid #E5E7EB; border-radius:8px; padding:10px; font-size:14px; line-height:1.5; box-sizing:border-box; resize:vertical; background:#FFFFFF;"></textarea>
        </div>
        <script>
            (function() {{
                const key = "rm_note_" + {safe_key};
                const box = document.getElementById("note_box");
                if (!box) return;
                try {{
                    const saved = window.localStorage.getItem(key);
                    if (saved !== null) box.value = saved;
                    box.addEventListener("input", function() {{
                        window.localStorage.setItem(key, box.value);
                    }});
                }} catch (e) {{
                    console.warn("localStorage not available:", e);
                }}
            }})();
        </script>
        """,
        height=220,
    )


def normalize_options(quiz):
    options = quiz.get("options", [])
    option_zh = quiz.get("option_zh", [])
    normalized = []
    for i, opt in enumerate(options):
        if isinstance(opt, dict):
            en = str(opt.get("en", opt.get("text", ""))).strip()
            zh = str(opt.get("zh", "")).strip()
            label = en if not zh else f"{en}  |  {zh}"
            normalized.append({"label": label, "value": en})
            continue

        en = str(opt).strip()
        zh = ""
        if isinstance(option_zh, list) and i < len(option_zh):
            zh = str(option_zh[i]).strip()
        label = en if not zh else f"{en}  |  {zh}"
        normalized.append({"label": label, "value": en})
    return normalized


def build_term_key(chapter_key, slide_title, term):
    return f"{chapter_key}::{slide_title}::{term}"


def storage_slug_chapter_term(chapter_key, term):
    """Stable slug for localStorage keys, e.g. chapter_1 + 'Pure Risk' -> ch1_pure_risk."""
    ch = str(chapter_key).replace("chapter_", "ch")
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", str(term)).strip("_").lower()
    if len(slug) > 56:
        slug = slug[:56]
    return f"{ch}_{slug}" if slug else f"{ch}_term"


def term_slug_fragment(term):
    """Short slug from term text (no chapter prefix)."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", str(term)).strip("_").lower()
    return (slug[:36] if slug else "item")


def build_glossary_path_term_key(chapter_key, slide_title, path_terms):
    """Unique key for glossary items; path_terms = [ancestor..., current term]."""
    if not path_terms:
        return build_term_key(chapter_key, slide_title, "")
    path_str = " › ".join(str(p) for p in path_terms)
    return f"{chapter_key}::{slide_title}::{path_str}"


def glossary_storage_suffix_from_path(chapter_key, path_terms):
    """localStorage-friendly suffix for nested glossary items."""
    ch = str(chapter_key).replace("chapter_", "ch")
    parts = [term_slug_fragment(t) for t in path_terms]
    base = "_".join(parts) if parts else "root"
    if len(base) > 70:
        base = base[:70]
    return f"{ch}_{base}" if base else f"{ch}_item"


def sync_parent_mastered_if_children_all_mastered(parent_key, child_keys):
    """Optional: when every direct child is Mastered, upgrade parent to Mastered (parent must already have a status row)."""
    if not child_keys:
        return
    tm = st.session_state.get("term_status", {})
    for ck in child_keys:
        if tm.get(ck, {}).get("status") != "Mastered":
            return
    if parent_key not in tm:
        return
    st.session_state["term_status"][parent_key] = {**tm[parent_key], "status": "Mastered"}


def render_editable_explanation_iframe(
    storage_suffix,
    default_en,
    default_zh,
    *,
    title_bar=None,
    summary_html=None,
    prefix_html="",
    suffix_html="",
    height=340,
    compact_summary=False,
):
    """
    Bilingual contenteditable regions; localStorage keys note_{suffix}_en / note_{suffix}_zh store full innerHTML.
    Floating toolbar: yellow/pink backColor, bold, removeFormat (clear); all actions sync-save after execCommand.
    When used inside <details> (default closed), only the summary row shows until the user expands.
    """
    elem_id = "eo_" + re.sub(r"[^a-zA-Z0-9_]", "_", storage_suffix)[:90]
    default_en = default_en or ""
    default_zh = default_zh or ""

    title_block = ""
    if title_bar:
        title_block = f'<div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#111827;">{title_bar}</div>'
    summary_block = summary_html or ""

    # JSON-encode strings for safe embedding in JavaScript
    j_key_en = json.dumps(f"note_{storage_suffix}_en")
    j_key_zh = json.dumps(f"note_{storage_suffix}_zh")
    j_def_en = json.dumps(default_en)
    j_def_zh = json.dumps(default_zh)

    html_page = f"""
<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; padding: 8px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }}
  .eo-wrap {{ max-width: 100%; }}
  .eo-label {{ color: #374151; font-size: 12px; margin-bottom: 4px; margin-top: 8px; }}
  .eo-label:first-child {{ margin-top: 0; }}
  .eo-editable {{
    border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px 12px; min-height: 72px;
    line-height: 1.55; font-size: 14px; color: #111827; background: #FFFFFF; outline: none;
  }}
  .eo-editable:focus {{
    outline: 2px solid rgba(59, 130, 246, 0.55) !important;
    outline-offset: 2px;
    border-color: #93C5FD;
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.15);
  }}
  .eo-editable.zh {{ color: #111827; }}
  .eo-float-toolbar {{
    display: none; position: fixed; z-index: 2147483647; align-items: center; gap: 2px;
    background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 4px 6px;
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.12), 0 2px 6px rgba(15, 23, 42, 0.06);
    user-select: none; flex-wrap: nowrap;
  }}
  .eo-float-toolbar button {{
    border: none; background: transparent; cursor: pointer; border-radius: 6px;
    padding: 4px 8px; font-size: 13px; line-height: 1; color: #334155;
    display: inline-flex; align-items: center; justify-content: center; min-width: 28px; min-height: 28px;
  }}
  .eo-float-toolbar button:hover {{ background: #f1f5f9; color: #0f172a; }}
  .eo-float-toolbar button:active {{ background: #e2e8f0; }}
  .eo-tb-hl-y {{ background: #fff566 !important; }}
  .eo-tb-hl-p {{ background: #ffc0cb !important; }}
  .eo-tb-bold {{ font-weight: 800; font-family: inherit; }}
  .eo-tb-clear {{ font-size: 15px; }}
  details.eo-details {{ border: 1px solid #D1D5DB; border-radius: 8px; margin-bottom: 6px; overflow: hidden; }}
  summary.eo-sum {{
    padding: 10px 12px; font-weight: 600; cursor: pointer; list-style: none;
  }}
  summary.eo-sum::-webkit-details-marker {{ display: none; }}
  details.eo-details summary.eo-sum-compact {{ padding: 7px 10px; font-size: 13px; }}
  details.eo-details[open] summary.eo-sum {{ border-bottom: 1px solid #e5e7eb; }}
  .eo-inner-scroll {{
    max-height: min(58vh, 520px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 4px 2px 8px 2px;
  }}
  details.eo-details:not([open]) .eo-inner-scroll {{ display: none; }}
  body.eo-body-compact {{ padding: 4px 6px; }}
</style></head>
<body class="{"eo-body-compact" if compact_summary else ""}">
{summary_block}
{prefix_html}
<div class="eo-inner-scroll">
<div class="eo-wrap">
  {title_block}
  <div class="eo-label">English</div>
  <div id="{elem_id}_en" class="eo-editable" contenteditable="true" data-field="en"></div>
  <div class="eo-label">中文解釋 / 摘要</div>
  <div id="{elem_id}_zh" class="eo-editable zh" contenteditable="true" data-field="zh"></div>
</div>
</div>
{suffix_html}
<div id="{elem_id}_tb" class="eo-float-toolbar" aria-label="Formatting toolbar">
  <button type="button" class="eo-tb-hl-y" data-eo-cmd="hl-yellow" title="螢光筆：黃 / Highlight yellow">A</button>
  <button type="button" class="eo-tb-hl-p" data-eo-cmd="hl-pink" title="螢光筆：粉 / Highlight pink">A</button>
  <button type="button" class="eo-tb-bold" data-eo-cmd="bold" title="加粗 / Bold"><b>B</b></button>
  <button type="button" class="eo-tb-clear" data-eo-cmd="clear" title="清除所選樣式 / Clear format">🧹</button>
</div>
<script>
(function() {{
  const keyEn = {j_key_en};
  const keyZh = {j_key_zh};
  const defEn = {j_def_en};
  const defZh = {j_def_zh};
  const elEn = document.getElementById("{elem_id}_en");
  const elZh = document.getElementById("{elem_id}_zh");
  const tb = document.getElementById("{elem_id}_tb");
  let lastActive = elZh;
  let savedRange = null;
  let savedHost = null;

  function loadOne(el, key, defVal) {{
    try {{
      const s = localStorage.getItem(key);
      if (s !== null && s !== "") {{
        el.innerHTML = s;
      }} else {{
        el.textContent = defVal || "";
      }}
    }} catch (e) {{
      el.textContent = defVal || "";
    }}
  }}
  function saveOne(el, key) {{
    try {{
      localStorage.setItem(key, el.innerHTML);
    }} catch (e) {{}}
  }}
  function keyForHost(host) {{
    return host === elEn ? keyEn : keyZh;
  }}

  loadOne(elEn, keyEn, defEn);
  loadOne(elZh, keyZh, defZh);

  function bind(el, key) {{
    el.addEventListener("input", function() {{ saveOne(el, key); }});
    el.addEventListener("focus", function() {{ lastActive = el; }});
    el.addEventListener("keyup", function() {{ lastActive = el; }});
    el.addEventListener("mouseup", function() {{ lastActive = el; }});
  }}
  bind(elEn, keyEn);
  bind(elZh, keyZh);

  function selectionInsideEditable() {{
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const node = sel.anchorNode;
    if (!node) return null;
    const n = node.nodeType === 3 ? node.parentElement : node;
    if (elEn.contains(n) || elEn === n) return elEn;
    if (elZh.contains(n) || elZh === n) return elZh;
    return null;
  }}

  function hideToolbar() {{
    tb.style.display = "none";
    savedRange = null;
    savedHost = null;
  }}

  function showToolbarForSelection() {{
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {{
      hideToolbar();
      return;
    }}
    const host = selectionInsideEditable();
    if (!host) {{
      hideToolbar();
      return;
    }}
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (r.width < 1 && r.height < 1) {{
      hideToolbar();
      return;
    }}
    savedRange = sel.getRangeAt(0).cloneRange();
    savedHost = host;
    tb.style.display = "flex";
    const tw = tb.offsetWidth || 160;
    const th = tb.offsetHeight || 36;
    let left = r.left + (r.width / 2) - (tw / 2);
    let top = r.top + window.scrollY - th - 8;
    left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
    if (top < 6) top = r.bottom + window.scrollY + 6;
    tb.style.left = left + "px";
    tb.style.top = top + "px";
  }}

  document.addEventListener("mouseup", function() {{
    setTimeout(showToolbarForSelection, 0);
  }});

  tb.querySelectorAll("button[data-eo-cmd]").forEach(function(btn) {{
    btn.addEventListener("mousedown", function(e) {{
      e.preventDefault();
      e.stopPropagation();
    }});
    btn.addEventListener("click", function(e) {{
      e.preventDefault();
      e.stopPropagation();
      const cmd = btn.getAttribute("data-eo-cmd");
      const sel = window.getSelection();
      if (savedRange && savedHost) {{
        sel.removeAllRanges();
        try {{ sel.addRange(savedRange); }} catch (err) {{}}
      }}
      const host = selectionInsideEditable() || savedHost || lastActive;
      if (!host) {{
        hideToolbar();
        return;
      }}
      try {{
        if (cmd === "hl-yellow") {{
          document.execCommand("backColor", false, "#ffff00");
        }} else if (cmd === "hl-pink") {{
          document.execCommand("backColor", false, "#ffc0cb");
        }} else if (cmd === "bold") {{
          document.execCommand("bold", false, null);
        }} else if (cmd === "clear") {{
          document.execCommand("removeFormat", false, null);
        }}
      }} catch (err) {{}}
      saveOne(host, keyForHost(host));
      hideToolbar();
    }});
  }});

  document.addEventListener("click", function(e) {{
    if (tb.contains(e.target)) return;
    setTimeout(function() {{
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) hideToolbar();
    }}, 0);
  }});
}})();
</script>
</body></html>
"""
    components.html(html_page, height=height, scrolling=True)


GLOSSARY_STATUS_OPTIONS = ["Normal", "Hard", "Medium", "Key Point", "Mastered"]
GLOSSARY_STATUS_COLORS = {
    "Hard": "#8B0000",
    "Medium": "#B8860B",
    "Key Point": "#00008B",
    "Normal": "#475569",
    "Mastered": "#047857",
}


def render_glossary_leaf_editor_block(
    chapter_key,
    chapter_label,
    slide_title,
    item,
    path_terms,
    *,
    depth,
):
    """Leaf row: Streamlit expander hides EN/ZH editors, toolbar, and Status until opened."""
    term = (item.get("term") or "").strip() or "—"
    zh = item.get("zh") or ""
    definition = item.get("def") or ""
    definition_zh = item.get("def_zh") or ""
    term_key = build_glossary_path_term_key(chapter_key, slide_title, path_terms)
    current_status = st.session_state["term_status"].get(term_key, {}).get("status", "Normal")
    if current_status not in GLOSSARY_STATUS_OPTIONS:
        current_status = "Normal"
    header_color = GLOSSARY_STATUS_COLORS.get(current_status, "#475569")
    safe_title = html.escape(f"{term} ({zh})")
    storage_suffix = glossary_storage_suffix_from_path(chapter_key, path_terms)
    exp_label = f"📇 {term}（{zh}）" if depth == 0 else f"▸ {term}（{zh}）"
    iframe_h = 268 if depth > 0 else 288
    bar_extra = (
        "border-left:4px solid #64748b;margin-left:2px;padding-left:10px;"
        if depth > 0
        else ""
    )

    with st.expander(exp_label, expanded=False):
        st.markdown(
            f'<div style="background:{header_color};color:#FFFFFF;padding:8px 12px;border-radius:6px;margin-bottom:8px;font-weight:600;{bar_extra}">{safe_title}</div>',
            unsafe_allow_html=True,
        )
        render_editable_explanation_iframe(
            storage_suffix,
            definition,
            definition_zh or "（無中文定義）",
            prefix_html="",
            suffix_html="",
            height=iframe_h,
            compact_summary=True,
        )
        selected_status = st.selectbox(
            "Status",
            GLOSSARY_STATUS_OPTIONS,
            index=GLOSSARY_STATUS_OPTIONS.index(current_status),
            key=f"status_select_{term_key}",
            label_visibility="visible",
        )
    if selected_status == "Normal":
        st.session_state["term_status"].pop(term_key, None)
    else:
        st.session_state["term_status"][term_key] = {
            "chapter_label": chapter_label,
            "chapter_key": chapter_key,
            "slide_title": slide_title,
            "term": term,
            "zh": zh,
            "def": definition,
            "def_zh": definition_zh,
            "status": selected_status,
            "path": path_terms,
        }
    return term_key


def render_glossary_tree_node(chapter_key, chapter_label, slide_title, item, ancestors, depth=0):
    """
    Render glossary entry; if `children` is a non-empty list, show parent expander + nested subtree.
    Returns the Streamlit term_status key for this node (for parent sync).
    """
    term = (item.get("term") or "").strip() or "—"
    zh = item.get("zh") or ""
    subs = item.get("children")
    if not isinstance(subs, list):
        subs = []
    path_here = ancestors + [term]

    if subs:
        parent_key = build_glossary_path_term_key(chapter_key, slide_title, path_here)
        current_status = st.session_state["term_status"].get(parent_key, {}).get("status", "Normal")
        if current_status not in GLOSSARY_STATUS_OPTIONS:
            current_status = "Normal"

        row = st.columns([0.4, 5.2, 2.0])
        with row[0]:
            st.caption("📂" if depth == 0 else "▸")
        with row[1]:
            exp_title = f"**{term}**（{zh}） · {len(subs)} 個子單字"
            if depth > 0:
                exp_title = f"**{term}**（{zh}） · {len(subs)} 子項"
            with st.expander(exp_title, expanded=False):
                child_keys = []
                for sub in subs:
                    guide, body = st.columns([0.045, 0.955])
                    with guide:
                        st.markdown(
                            "<div style='width:3px;min-height:52px;background:linear-gradient(180deg,#64748b 0%,#cbd5e1 100%);border-radius:3px;margin:6px auto 0;'></div>",
                            unsafe_allow_html=True,
                        )
                    with body:
                        ck = render_glossary_tree_node(
                            chapter_key,
                            chapter_label,
                            slide_title,
                            sub,
                            path_here,
                            depth=depth + 1,
                        )
                        child_keys.append(ck)
                sync_parent_mastered_if_children_all_mastered(parent_key, child_keys)
        with row[2]:
            ps = st.selectbox(
                "父層狀態",
                GLOSSARY_STATUS_OPTIONS,
                index=GLOSSARY_STATUS_OPTIONS.index(current_status),
                key=f"status_select_{parent_key}",
                label_visibility="collapsed",
            )
        if ps == "Normal":
            st.session_state["term_status"].pop(parent_key, None)
        else:
            st.session_state["term_status"][parent_key] = {
                "chapter_label": chapter_label,
                "chapter_key": chapter_key,
                "slide_title": slide_title,
                "term": term,
                "zh": zh,
                "def": item.get("def", ""),
                "def_zh": item.get("def_zh", ""),
                "status": ps,
                "path": path_here,
                "is_parent_card": True,
            }
        return parent_key

    return render_glossary_leaf_editor_block(
        chapter_key,
        chapter_label,
        slide_title,
        item,
        path_here,
        depth=depth,
    )


def glossary_normalize_for_embed(item: dict) -> dict:
    """Map study_data `children` / `sub_items` to `sub_items` for the embedded glossary JS."""
    out = {k: v for k, v in item.items() if k not in ("children", "sub_items")}
    kids = item.get("sub_items") if isinstance(item.get("sub_items"), list) else []
    if not kids and isinstance(item.get("children"), list):
        kids = item["children"]
    out["sub_items"] = [glossary_normalize_for_embed(x) for x in kids]
    return out


def stable_glossary_card_id(chapter_key: str, slide_title: str, term: str, zh: str) -> str:
    """Stable DOM id for glossary-card (same for index + embed)."""
    raw = f"{chapter_key}\0{slide_title}\0{term}\0{zh}".encode("utf-8")
    return "gloss-card-" + hashlib.md5(raw).hexdigest()[:18]


def glossary_terms_for_boot(chapter_key: str, items: list, inherited_slide: str = "") -> list:
    """Normalize glossary tree and attach cardId on every node for search / scroll targeting."""
    result = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        slide = (item.get("slide_title") or inherited_slide or "General Concepts").strip()
        term = (item.get("term") or "").strip()
        zh = (item.get("zh") or "").strip()
        kids = item.get("sub_items") if isinstance(item.get("sub_items"), list) else []
        if not kids and isinstance(item.get("children"), list):
            kids = item["children"]
        out = {k: v for k, v in item.items() if k not in ("children", "sub_items")}
        out["sub_items"] = glossary_terms_for_boot(chapter_key, kids, slide)
        out["cardId"] = stable_glossary_card_id(chapter_key, slide, term, zh)
        result.append(out)
    return result


def estimate_glossary_embed_height(terms: list) -> int:
    def count_nodes(items):
        n = 0
        for it in items or []:
            n += 1
            n += count_nodes(it.get("sub_items") or it.get("children") or [])
        return n

    total = count_nodes(terms)
    return min(1500, 140 + total * 86)


def render_interactive_glossary_slide(
    chapter_key: str,
    chapter_label: str,
    slide_title: str,
    terms: list,
    *,
    scroll_to=None,
) -> None:
    """Drag-and-drop glossary inside components.html (loads glossary.js)."""
    script_path = Path(__file__).resolve().parent / "glossary.js"
    if not script_path.is_file():
        st.error("找不到 glossary.js，無法載入互動單字卡。")
        return
    glossary_js = script_path.read_text(encoding="utf-8")
    boot = {
        "chapterKey": chapter_key,
        "chapterLabel": chapter_label,
        "slideTitle": slide_title,
        "terms": glossary_terms_for_boot(chapter_key, terms, slide_title),
    }
    if scroll_to:
        boot["scrollTo"] = {
            "term": scroll_to.get("term") or "",
            "zh": scroll_to.get("zh") or "",
            "targetSlide": scroll_to.get("targetSlide") or "",
            "cardId": scroll_to.get("cardId") or "",
        }
    boot_json = json.dumps(boot, ensure_ascii=False).replace("</script", "<\\/script")
    html_page = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>html,body{{margin:0;overflow-x:hidden;overflow-y:auto;min-height:100%;}}</style></head><body>
<script type="application/json" id="glossary-boot">{boot_json}</script>
<div id="glossary-app-root"></div>
<script>
{glossary_js}
</script>
</body></html>"""
    components.html(
        html_page,
        height=estimate_glossary_embed_height(terms),
        scrolling=True,
    )


def build_global_glossary_search_index(study_data: dict, chapter_map: dict) -> list:
    """Flatten all chapters + glossary terms (nested) for global search."""
    rows = []
    for chapter_label, chapter_key in chapter_map.items():
        ch = study_data.get(chapter_key) or {}
        ch_title = (ch.get("title") or "").strip()
        rows.append(
            {
                "chapterKey": chapter_key,
                "chapterLabel": chapter_label,
                "chapterTitle": ch_title,
                "slideTitle": "",
                "term": "",
                "zh": "",
                "isChapterRow": True,
            }
        )

        def walk_glossary_nodes(nodes, inherited_slide: str) -> None:
            for node in nodes or []:
                if not isinstance(node, dict):
                    continue
                slide = (node.get("slide_title") or inherited_slide or "General Concepts").strip()
                term = (node.get("term") or "").strip()
                zh = (node.get("zh") or "").strip()
                if term or zh:
                    rows.append(
                        {
                            "chapterKey": chapter_key,
                            "chapterLabel": chapter_label,
                            "chapterTitle": ch_title,
                            "slideTitle": slide,
                            "term": term,
                            "zh": zh,
                            "cardId": stable_glossary_card_id(chapter_key, slide, term, zh),
                            "isChapterRow": False,
                        }
                    )
                kids = node.get("children") if isinstance(node.get("children"), list) else []
                if not kids and isinstance(node.get("sub_items"), list):
                    kids = node["sub_items"]
                walk_glossary_nodes(kids, slide)

        walk_glossary_nodes(ch.get("glossary") or [], "")

    return rows


GLOSSARY_TAB_LABEL = "Glossary & Concepts"


def filter_brute_glossary_hits(index_rows: list, query: str) -> list:
    """All non-chapter rows where every whitespace-separated token appears in term or zh (case-insensitive)."""
    q = (query or "").strip().lower()
    if not q:
        return []
    words = [w for w in q.split() if w]
    if not words:
        return []
    hits = []
    for row in index_rows:
        if row.get("isChapterRow"):
            continue
        blob = f"{row.get('term', '')} {row.get('zh', '')}".lower()
        if all(w in blob for w in words):
            hits.append(row)
    return hits


def apply_brute_glossary_jump(row: dict) -> None:
    """Force sidebar chapter + main section + glossary scroll payload, then caller must st.rerun()."""
    if row.get("isChapterRow"):
        st.session_state["sidebar_chapter_select"] = row["chapterLabel"]
        st.session_state["app_main_section"] = GLOSSARY_TAB_LABEL
        st.session_state.pop("glossary_scroll_target", None)
        return
    st.session_state["sidebar_chapter_select"] = row["chapterLabel"]
    st.session_state["app_main_section"] = GLOSSARY_TAB_LABEL
    st.session_state["glossary_scroll_target"] = {
        "chapter_key": row["chapterKey"],
        "slide_title": str(row.get("slideTitle") or ""),
        "term": str(row.get("term") or ""),
        "zh": str(row.get("zh") or ""),
        "card_id": str(row.get("cardId") or ""),
    }


@st.cache_data(ttl=300, show_spinner=False)
def fetch_insurance_news(random_seed=0, focus="insurance"):
    news_pool = list(NEWS_DATA.values())
    if focus == "risk_management":
        news_pool = [
            item
            for item in news_pool
            if any(
                key in str(item.get("title", "")).lower()
                for key in ["risk", "underwriting", "catastrophe", "cyber", "insurtech"]
            )
        ] or news_pool
    seeded_rng = random.Random(int(random_seed) if random_seed else time.time_ns())
    return seeded_rng.sample(news_pool, k=3)


study_data = load_study_data()

chapter_map = {
    "Chapter 1": "chapter_1",
    "Chapter 2": "chapter_2",
    "Chapter 3": "chapter_3",
    "Chapter 6": "chapter_6",
    "Chapter 7": "chapter_7",
}

apply_glossary_nav_from_query_params(chapter_map)

st.markdown(
    '''<h1 style="font-family: Fraunces, serif; color: #001858; font-weight: 700; font-size: 2.4rem; letter-spacing: -0.5px; margin-bottom: 0.2rem;">
    🛡️ Risk Management Exam Prep</h1>''',
    unsafe_allow_html=True,
)
st.markdown(
    """
    <style>
    /* ── FONTS ─────────────────────────────────────────── */
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

    /* ── BASE & BACKGROUND ─────────────────────────────── */
    html, body,
    [data-testid="stAppViewContainer"],
    [data-testid="stMain"],
    .main .block-container {
        background-color: #fef6e4 !important;
        font-family: 'DM Sans', sans-serif !important;
    }
    section[data-testid="stMain"] > div {
        background-color: #fef6e4 !important;
    }

    /* ── HEADINGS ──────────────────────────────────────── */
    h1, h2, h3, h4, h5, h6,
    [data-testid="stHeadingWithActionElements"] h1,
    [data-testid="stHeadingWithActionElements"] h2,
    [data-testid="stHeadingWithActionElements"] h3 {
        font-family: 'Fraunces', serif !important;
        color: #001858 !important;
        font-weight: 700 !important;
        letter-spacing: -0.3px;
    }

    /* ── BODY TEXT ─────────────────────────────────────── */
    p, li,
    .stMarkdown p,
    [data-testid="stMarkdownContainer"] p {
        font-family: 'DM Sans', sans-serif !important;
        color: #172c66 !important;
        line-height: 1.75 !important;
    }

    /* ── SIDEBAR ───────────────────────────────────────── */
    [data-testid="stSidebar"] {
        background-color: #f3d2c1 !important;
        border-right: 2px solid #001858 !important;
    }
    [data-testid="stSidebar"] * {
        color: #001858 !important;
        font-family: 'DM Sans', sans-serif !important;
    }
    [data-testid="stSidebar"] h1,
    [data-testid="stSidebar"] h2,
    [data-testid="stSidebar"] h3,
    [data-testid="stSidebar"] .stSubheader {
        font-family: 'Fraunces', serif !important;
        font-weight: 700 !important;
    }
    [data-testid="stSidebar"] hr {
        border-color: #001858 !important;
        opacity: 0.25 !important;
    }

    /* ── SIDEBAR BUTTONS (force solid, never transparent) ── */
    [data-testid="stSidebar"] .stButton > button {
        background-color: #f582ae !important;
        color: #001858 !important;
        border: 2px solid #001858 !important;
        border-radius: 12px !important;
        font-weight: 700 !important;
        box-shadow: 3px 3px 0px #001858 !important;
    }
    [data-testid="stSidebar"] .stButton > button:hover {
        background-color: #001858 !important;
        color: #fef6e4 !important;
        box-shadow: 4px 4px 0px #f582ae !important;
    }

    /* ── BUTTONS ───────────────────────────────────────── */
    .stButton > button {
        background-color: #f582ae !important;
        color: #001858 !important;
        border: 2px solid #001858 !important;
        border-radius: 12px !important;
        font-family: 'DM Sans', sans-serif !important;
        font-weight: 700 !important;
        font-size: 0.9rem !important;
        letter-spacing: 0.01em !important;
        box-shadow: 3px 3px 0px #001858 !important;
        transition: all 0.15s ease !important;
    }
    .stButton > button:hover {
        background-color: #001858 !important;
        color: #fef6e4 !important;
        transform: translate(-1px, -1px) !important;
        box-shadow: 4px 4px 0px #f582ae !important;
    }
    .stButton > button:active {
        transform: translate(2px, 2px) !important;
        box-shadow: 1px 1px 0px #001858 !important;
    }
    [data-testid="baseButton-primary"] {
        background-color: #001858 !important;
        color: #fef6e4 !important;
        border: 2px solid #001858 !important;
        box-shadow: 3px 3px 0px #f582ae !important;
    }
    [data-testid="baseButton-primary"]:hover {
        background-color: #f582ae !important;
        color: #001858 !important;
        box-shadow: 4px 4px 0px #001858 !important;
    }
    [data-testid="baseButton-secondary"] {
        background-color: #8bd3dd !important;
        color: #001858 !important;
        border: 2px solid #001858 !important;
        box-shadow: 3px 3px 0px #001858 !important;
    }
    [data-testid="baseButton-secondary"]:hover {
        background-color: #001858 !important;
        color: #8bd3dd !important;
    }
    .stLinkButton > a {
        background-color: #8bd3dd !important;
        color: #001858 !important;
        border: 2px solid #001858 !important;
        border-radius: 12px !important;
        font-family: 'DM Sans', sans-serif !important;
        font-weight: 700 !important;
        box-shadow: 3px 3px 0px #001858 !important;
        transition: all 0.15s ease !important;
    }
    .stLinkButton > a:hover {
        background-color: #001858 !important;
        color: #fef6e4 !important;
        transform: translate(-1px, -1px) !important;
    }

    /* ── TEXT INPUTS & SELECTBOX ───────────────────────── */
    .stTextInput input,
    .stTextArea textarea {
        background-color: #fef6e4 !important;
        border: 2px solid #001858 !important;
        border-radius: 10px !important;
        color: #172c66 !important;
        font-family: 'DM Sans', sans-serif !important;
        font-size: 0.95rem !important;
    }
    .stTextInput input:focus,
    .stTextArea textarea:focus {
        border-color: #f582ae !important;
        box-shadow: 0 0 0 3px rgba(245, 130, 174, 0.25) !important;
    }
    /* Trigger box */
    .stSelectbox > div > div,
    .stSelectbox [data-baseweb="select"] > div {
        background-color: #fef6e4 !important;
        border: 2px solid #001858 !important;
        border-radius: 10px !important;
        color: #001858 !important;
        font-family: 'DM Sans', sans-serif !important;
        font-weight: 600 !important;
    }
    /* Displayed selected value text */
    .stSelectbox [data-baseweb="select"] [data-testid="stMarkdownContainer"] p,
    .stSelectbox [data-baseweb="select"] span,
    .stSelectbox [data-baseweb="select"] div {
        color: #001858 !important;
        font-family: 'DM Sans', sans-serif !important;
        font-weight: 600 !important;
    }
    /* Dropdown popup background */
    [data-baseweb="popover"] [data-baseweb="menu"],
    [data-baseweb="popover"] ul,
    ul[data-testid="stSelectboxVirtualDropdown"] {
        background-color: #fef6e4 !important;
        border: 2px solid #001858 !important;
        border-radius: 12px !important;
    }
    /* Individual dropdown options */
    [data-baseweb="popover"] li,
    [data-baseweb="menu"] li,
    ul[data-testid="stSelectboxVirtualDropdown"] li {
        background-color: #fef6e4 !important;
        color: #001858 !important;
        font-family: 'DM Sans', sans-serif !important;
        font-weight: 500 !important;
    }
    /* Hover state */
    [data-baseweb="popover"] li:hover,
    [data-baseweb="menu"] li:hover,
    ul[data-testid="stSelectboxVirtualDropdown"] li:hover {
        background-color: #8bd3dd !important;
        color: #001858 !important;
    }
    /* Selected / active option */
    [data-baseweb="popover"] li[aria-selected="true"],
    ul[data-testid="stSelectboxVirtualDropdown"] li[aria-selected="true"] {
        background-color: #f582ae !important;
        color: #001858 !important;
        font-weight: 700 !important;
    }
    /* Option text spans */
    [data-baseweb="popover"] li span,
    [data-baseweb="menu"] li span {
        color: #001858 !important;
        font-family: 'DM Sans', sans-serif !important;
    }

    /* ── RADIO (section nav) ───────────────────────────── */
    div[role="radiogroup"] label {
        font-family: 'DM Sans', sans-serif !important;
        font-weight: 600 !important;
        color: #172c66 !important;
        border-radius: 10px !important;
        padding: 6px 14px !important;
        transition: background 0.15s !important;
    }
    div[role="radiogroup"] label:hover {
        background-color: rgba(245, 130, 174, 0.12) !important;
    }
    div[role="radiogroup"] [data-testid="stMarkdownContainer"] p {
        font-weight: 600 !important;
    }

    /* ── EXPANDERS ─────────────────────────────────────── */
    [data-testid="stExpander"] {
        border: 2px solid #8bd3dd !important;
        border-radius: 14px !important;
        background-color: rgba(254, 246, 228, 0.6) !important;
        margin-bottom: 10px !important;
        overflow: hidden !important;
    }
    [data-testid="stExpander"] details summary {
        background-color: rgba(139, 211, 221, 0.18) !important;
        font-family: 'DM Sans', sans-serif !important;
        font-weight: 600 !important;
        color: #001858 !important;
        padding: 10px 16px !important;
    }
    [data-testid="stExpander"] details summary:hover {
        background-color: rgba(139, 211, 221, 0.35) !important;
    }
    [data-testid="stExpander"] details summary p {
        font-family: 'DM Sans', sans-serif !important;
        font-weight: 600 !important;
        color: #001858 !important;
    }
    /* overrides for status-coloured terms */
    .hard-term [data-testid="stExpander"] details summary,
    .hard-term .streamlit-expanderHeader {
        background-color: #8B0000 !important;
        color: #fff1f2 !important;
        border-radius: 10px !important;
    }
    .medium-term [data-testid="stExpander"] details summary,
    .medium-term .streamlit-expanderHeader {
        background-color: #6b5a17 !important;
        color: #fffbea !important;
        border-radius: 10px !important;
    }
    .key-term [data-testid="stExpander"] details summary,
    .key-term .streamlit-expanderHeader {
        background-color: #001858 !important;
        color: #fef6e4 !important;
        border-radius: 10px !important;
    }
    .hard-term [data-testid="stExpander"] details summary p,
    .medium-term [data-testid="stExpander"] details summary p,
    .key-term [data-testid="stExpander"] details summary p {
        color: inherit !important;
    }

    /* ── ALERT BOXES ───────────────────────────────────── */
    [data-testid="stAlert"] {
        border-radius: 12px !important;
        font-family: 'DM Sans', sans-serif !important;
        border-left-width: 4px !important;
    }
    [data-testid="stAlert"][data-baseweb="notification"] {
        background-color: rgba(139, 211, 221, 0.18) !important;
        border-left-color: #8bd3dd !important;
    }
    .stSuccess > div {
        background-color: rgba(139, 211, 221, 0.2) !important;
        border-left-color: #8bd3dd !important;
        color: #001858 !important;
    }
    .stError > div {
        background-color: rgba(245, 130, 174, 0.15) !important;
        border-left-color: #f582ae !important;
        color: #001858 !important;
    }
    .stWarning > div {
        background-color: rgba(243, 210, 193, 0.45) !important;
        border-left-color: #f3d2c1 !important;
        color: #001858 !important;
    }
    .stInfo > div {
        background-color: rgba(139, 211, 221, 0.15) !important;
        border-left-color: #8bd3dd !important;
        color: #172c66 !important;
    }

    /* ── CONTAINERS WITH BORDERS ───────────────────────── */
    [data-testid="stVerticalBlockBorderWrapper"] {
        border-radius: 16px !important;
        border: 2px solid #8bd3dd !important;
        background-color: rgba(254, 246, 228, 0.55) !important;
    }

    /* ── CODE BLOCKS ───────────────────────────────────── */
    code, pre {
        background-color: #f3d2c1 !important;
        border: 1px solid #001858 !important;
        border-radius: 8px !important;
        color: #001858 !important;
    }
    code { padding: 2px 7px !important; }

    /* ── CAPTIONS ──────────────────────────────────────── */
    .stCaption,
    [data-testid="stCaptionContainer"] p {
        font-family: 'DM Sans', sans-serif !important;
        color: #172c66 !important;
        opacity: 0.7 !important;
    }

    /* ── DIVIDERS ──────────────────────────────────────── */
    hr {
        border-color: #8bd3dd !important;
        border-width: 1.5px !important;
        opacity: 0.45 !important;
    }

    /* ── DIALOG — complete cream-on-navy override ─ */
    /* Hit every container Streamlit/BaseWeb might render the modal in */
    [data-testid="stDialog"],
    [data-testid="stDialog"] > div,
    [data-testid="stDialog"] > div > div,
    [role="dialog"],
    [role="dialog"] > div,
    [data-baseweb="modal"],
    [data-baseweb="dialog"],
    div[class*="Dialog"],
    div[class*="dialog"],
    div[class*="modal"],
    div[class*="Modal"] {
        background-color: #fef6e4 !important;
        color: #172c66 !important;
    }
    /* The named block wrappers */
    [data-testid="stDialog"] [data-testid="stVerticalBlockBorderWrapper"],
    [role="dialog"] [data-testid="stVerticalBlockBorderWrapper"] {
        background: #fef6e4 !important;
        border: 2px solid #001858 !important;
        border-radius: 20px !important;
        box-shadow: 6px 6px 0px #001858 !important;
    }
    /* Nuclear text override — every node inside any dialog becomes readable */
    [data-testid="stDialog"] *,
    [role="dialog"] * {
        color: #172c66 !important;
    }
    /* Headings & bold → deep navy */
    [data-testid="stDialog"] h1, [role="dialog"] h1,
    [data-testid="stDialog"] h2, [role="dialog"] h2,
    [data-testid="stDialog"] h3, [role="dialog"] h3,
    [data-testid="stDialog"] h4, [role="dialog"] h4,
    [data-testid="stDialog"] h5, [role="dialog"] h5,
    [data-testid="stDialog"] h6, [role="dialog"] h6,
    [data-testid="stDialog"] strong, [role="dialog"] strong,
    [data-testid="stDialog"] b, [role="dialog"] b {
        color: #001858 !important;
        font-family: 'Fraunces', serif !important;
    }
    /* Buttons inside dialog */
    [data-testid="stDialog"] button,
    [role="dialog"] button {
        background-color: #f582ae !important;
        color: #001858 !important;
        border: 2px solid #001858 !important;
        border-radius: 12px !important;
        font-weight: 700 !important;
        box-shadow: 3px 3px 0px #001858 !important;
    }
    [data-testid="stDialog"] button:hover,
    [role="dialog"] button:hover {
        background-color: #001858 !important;
        color: #fef6e4 !important;
    }
    /* Inner st.container(border=True) → white panel for contrast */
    [data-testid="stDialog"] [data-testid="stVerticalBlockBorderWrapper"]
        [data-testid="stVerticalBlockBorderWrapper"],
    [role="dialog"] [data-testid="stVerticalBlockBorderWrapper"]
        [data-testid="stVerticalBlockBorderWrapper"] {
        background-color: rgba(255, 255, 255, 0.88) !important;
        border: 2px solid #8bd3dd !important;
        border-radius: 14px !important;
    }
    /* Caption text */
    [data-testid="stDialog"] [data-testid="stCaptionContainer"] p,
    [role="dialog"] [data-testid="stCaptionContainer"] p {
        color: #172c66 !important;
        opacity: 0.70 !important;
    }

    /* ── LINKS ─────────────────────────────────────────── */
    a.sidebar-news-link {
        color: #001858 !important;
        text-decoration: none;
        font-weight: 700;
        cursor: pointer;
        background-color: rgba(245, 130, 174, 0.12);
        padding: 1px 6px;
        border-radius: 5px;
    }
    a.sidebar-news-link:hover {
        color: #f582ae !important;
        text-decoration: underline;
        background-color: rgba(245, 130, 174, 0.22);
    }
    a.news-article-inline-link {
        color: #001858;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        border-bottom: 2px solid #f582ae;
    }
    a.news-article-inline-link:hover {
        color: #f582ae;
        text-decoration: none;
    }

    /* ── SPINNER ───────────────────────────────────────── */
    [data-testid="stSpinner"] > div {
        border-top-color: #f582ae !important;
    }

    /* ── STREAMLIT CHROME (toolbar / deploy / header strip) ─ */
    [data-testid="stToolbar"],
    [data-testid="stDecoration"],
    [data-testid="stDeployButton"],
    button[data-testid="baseButton-header"],
    [data-testid="collapsedControl"] {
        display: none !important;
    }
    header[data-testid="stHeader"] {
        height: 0 !important;
        min-height: 0 !important;
        padding: 0 !important;
    }

    /* ── METRIC ────────────────────────────────────────── */
    [data-testid="metric-container"] {
        background-color: rgba(139, 211, 221, 0.12) !important;
        border: 2px solid #8bd3dd !important;
        border-radius: 14px !important;
        padding: 12px !important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

_BRUTE_GLOSSARY_INDEX = build_global_glossary_search_index(study_data, chapter_map)
_bq = (st.session_state.get("brute_gsearch_input") or "").strip()
_hits = filter_brute_glossary_hits(_BRUTE_GLOSSARY_INDEX, _bq)
_s1, _s2 = st.columns([8, 1])
with _s1:
    st.text_input(
        "search",
        key="brute_gsearch_input",
        placeholder="Search concepts...",
        label_visibility="collapsed",
    )
with _s2:
    st.markdown('<div style="height:1.75rem"></div>', unsafe_allow_html=True)
    if st.button("Go", type="primary", key="brute_jump_first", use_container_width=True):
        if _hits:
            apply_brute_glossary_jump(_hits[0])
            st.rerun()
if _bq and not _hits:
    st.caption("No matches.")
if _hits:
    with st.expander(f"Results ({len(_hits)})", expanded=len(_hits) <= 8):
        for _i, _row in enumerate(_hits[:40]):
            _lab = f"[{_row['chapterLabel']}] {_row.get('term', '')}（{_row.get('zh', '')}）"
            if st.button(_lab, key=f"brute_hit_{_i}", use_container_width=True):
                apply_brute_glossary_jump(_row)
                st.rerun()

st.sidebar.header("Study Control Panel")
chapter_options = list(chapter_map.keys())
if "sidebar_chapter_select" not in st.session_state:
    st.session_state.sidebar_chapter_select = chapter_options[0]
selected_chapter_label = st.sidebar.selectbox(
    "Select chapter",
    chapter_options,
    key="sidebar_chapter_select",
    help="Chapter 3 loads `chapter_3` from study_data.json (Introduction to Risk Management).",
)
selected_chapter_key = chapter_map[selected_chapter_label]
chapter_data = study_data.get(selected_chapter_key, {})

st.sidebar.markdown("---")
st.sidebar.subheader("Exam Sections")
st.sidebar.write("- Multiple Choice (English)")
st.sidebar.write("- Calculation")
st.sidebar.write("- Short Answer")
st.sidebar.markdown("---")
st.sidebar.subheader("🌐 Live Insurance Insights")
if "news_refresh_token" not in st.session_state:
    st.session_state["news_refresh_token"] = random.randint(1, 10_000_000)
if "news_timestamp" not in st.session_state:
    st.session_state["news_timestamp"] = time.time_ns()
if "live_news" not in st.session_state:
    with st.spinner("Fetching latest insurance insights..."):
        focus_topic = "risk_management" if selected_chapter_key == "chapter_3" else "insurance"
        st.session_state["live_news"] = fetch_insurance_news(st.session_state["news_timestamp"], focus_topic)
if st.sidebar.button("Refresh News", use_container_width=True):
    st.cache_data.clear()
    st.session_state["news_refresh_token"] = random.randint(1, 10_000_000)
    st.session_state["news_timestamp"] = time.time_ns()
    with st.spinner("Fetching latest insurance insights..."):
        focus_topic = "risk_management" if selected_chapter_key == "chapter_3" else "insurance"
        st.session_state["live_news"] = fetch_insurance_news(st.session_state["news_timestamp"], focus_topic)
    st.rerun()
for idx, news_item in enumerate(st.session_state.get("live_news", [])[:3]):
    _nu = resolve_news_article_url(news_item)
    _href = html.escape(_nu, quote=True)
    _nt = html.escape(news_item.get("title", "Insurance trend update"))
    st.sidebar.markdown(
        f'<p style="margin:0 0 4px 0;line-height:1.35;">'
        f'<a class="sidebar-news-link" href="{_href}" target="_blank" rel="noopener noreferrer">'
        f"{idx + 1}. {_nt}</a></p>",
        unsafe_allow_html=True,
    )
    title_zh = news_item.get("title_zh", "")
    if title_zh:
        st.sidebar.caption(f"中文：{title_zh}")

if not chapter_data:
    st.warning(
        f"`{selected_chapter_label}` data is not found in `study_data.json` yet. "
        f"Please add `{selected_chapter_key}` with `glossary` and `quiz`."
    )
    st.stop()

chapter_title = chapter_data.get("title", selected_chapter_label)
learning_objectives = chapter_data.get("learning_objectives", chapter_data.get("objectives", []))
glossary_list = chapter_data.get("glossary", [])
quiz_list = chapter_data.get("quiz", [])

if "weak_terms" not in st.session_state:
    st.session_state["weak_terms"] = {}
if "notes" not in st.session_state:
    st.session_state["notes"] = {}
if "term_status" not in st.session_state:
    st.session_state["term_status"] = {}
    for key, value in st.session_state.get("weak_terms", {}).items():
        seeded = dict(value)
        seeded["status"] = "Hard"
        st.session_state["term_status"][key] = seeded

SECTION_LABELS = [
    "🎯 Learning Objectives",
    GLOSSARY_TAB_LABEL,
    "📝 Focus Area (待加強)",
    "Exam Practice",
    "🌐 Live News Insights",
]
if "app_main_section" not in st.session_state:
    st.session_state.app_main_section = SECTION_LABELS[0]

st.markdown("##### 單元內容")
chosen = st.radio(
    "section_nav",
    SECTION_LABELS,
    horizontal=True,
    key="app_main_section",
    label_visibility="collapsed",
)

if chosen == SECTION_LABELS[0]:
    st.subheader(f"{selected_chapter_label} | Learning Objectives")
    st.write("Objective-driven review in textbook style.")
    if not learning_objectives:
        st.info(
            "No learning objectives found for this chapter. "
            "Add `learning_objectives` in `study_data.json` (e.g., objective + explanation)."
        )
    else:
        for idx, item in enumerate(learning_objectives, start=1):
            if isinstance(item, str):
                objective_text = item
                explanation_text = ""
                explanation_zh_text = ""
            else:
                objective_text = (
                    item.get("objective")
                    or item.get("title")
                    or item.get("question")
                    or f"Objective {idx}"
                )
                explanation_text = (
                    item.get("explanation")
                    or item.get("answer")
                    or item.get("detail")
                    or item.get("content")
                    or ""
                )
                explanation_zh_text = get_learning_objective_zh_text(item)

            st.markdown(f"**{objective_text}**")
            if explanation_text or explanation_zh_text:
                obj_slug = f"{selected_chapter_key.replace('chapter_', 'ch')}_objective_{idx}"
                render_editable_explanation_iframe(
                    obj_slug,
                    explanation_text or "",
                    explanation_zh_text or "",
                    height=400,
                )
            else:
                st.caption("No detailed explanation provided yet.")
            st.markdown("---")

        slide_pages = chapter_data.get("slide_pages", [])
        if slide_pages:
            st.markdown("### 📚 Full Slide Notes")
            st.caption("Detailed per-slide transcript for chapter study (EN/ZH).")
            for page in slide_pages:
                page_no = page.get("page", "")
                page_title = page.get("title", "Slide")
                body = page.get("content", "")
                with st.expander(f"Page {page_no}: {page_title}", expanded=False):
                    st.write(body)

elif chosen == SECTION_LABELS[1]:
    scroll_ctx = st.session_state.pop("glossary_scroll_target", None)
    if scroll_ctx and scroll_ctx.get("chapter_key") != selected_chapter_key:
        scroll_ctx = None

    st.subheader(f"{selected_chapter_label} | {chapter_title}")
    if not glossary_list:
        st.info("No glossary terms available for this chapter.")
    else:
        grouped_glossary = {}
        for item in glossary_list:
            slide_title = item.get("slide_title", "General Concepts")
            grouped_glossary.setdefault(slide_title, []).append(item)

        scroll_payload = None
        if scroll_ctx:
            scroll_payload = {
                "term": scroll_ctx.get("term") or "",
                "zh": scroll_ctx.get("zh") or "",
                "targetSlide": scroll_ctx.get("slide_title") or "",
                "cardId": scroll_ctx.get("card_id") or "",
            }

        for slide_title, terms in grouped_glossary.items():
            st.subheader(slide_title)
            render_interactive_glossary_slide(
                selected_chapter_key,
                selected_chapter_label,
                slide_title,
                terms,
                scroll_to=scroll_payload,
            )
            st.markdown("---")

elif chosen == SECTION_LABELS[2]:
    st.subheader("📝 Focus Area (待加強)")
    st.write("Review your marked weak terms and write personalized bilingual notes.")

    status_terms = st.session_state.get("term_status", {})
    if not status_terms:
        st.info("No focus terms yet. Set `Status` in `Glossary & Concepts`.")
    else:
        chapter_status_terms = [
            (key, value)
            for key, value in status_terms.items()
            if value.get("chapter_key") == selected_chapter_key
        ]

        if not chapter_status_terms:
            st.info(f"No focus terms selected for {selected_chapter_label} yet.")
        else:
            grouped_by_status = {"Hard": [], "Medium": [], "Key Point": [], "Mastered": []}
            for term_key, info in chapter_status_terms:
                status = info.get("status", "Normal")
                if status in grouped_by_status:
                    grouped_by_status[status].append((term_key, info))

            for status in ["Hard", "Medium", "Key Point", "Mastered"]:
                entries = grouped_by_status.get(status, [])
                if not entries:
                    continue

                st.markdown(f"## {status}")
                for term_key, info in entries:
                    st.markdown(f"### {info.get('term', '')} ({info.get('zh', '')})")
                    path_parts = info.get("path")
                    if isinstance(path_parts, list) and len(path_parts) > 1:
                        st.caption("階層：" + " › ".join(str(p) for p in path_parts))
                    st.caption(f"{selected_chapter_label} | {info.get('slide_title', '')}")
                    st.write(info.get("def", ""))
                    if info.get("def_zh"):
                        st.markdown(
                            f"<span style='color:#6B7280; font-style: italic;'>{info.get('def_zh')}</span>",
                            unsafe_allow_html=True,
                        )

                    current_note = st.session_state["notes"].get(term_key, "")
                    updated_note = st.text_area(
                        "Your Notes / 我的筆記",
                        value=current_note,
                        key=f"note_{term_key}",
                        height=120,
                    )
                    st.session_state["notes"][term_key] = updated_note
                    st.markdown("---")

elif chosen == SECTION_LABELS[3]:
    st.subheader(f"{selected_chapter_label} | Exam Practice")
    st.write("Complete section by section, then reveal hints/explanations after answering.")

    if not quiz_list:
        st.info("No quiz questions available for this chapter.")
    else:
        mc_questions = []
        calc_questions = []
        short_questions = []

        for idx, quiz in enumerate(quiz_list, start=1):
            q_type = normalize_question_type(quiz)
            if q_type == "multiple_choice":
                mc_questions.append((idx, quiz))
            elif q_type == "calculation":
                calc_questions.append((idx, quiz))
            else:
                short_questions.append((idx, quiz))

        st.markdown("### Multiple Choice (English)")
        if not mc_questions:
            st.info("No multiple-choice questions in this chapter.")
        for idx, quiz in mc_questions:
            question = quiz.get("question", f"Question {idx}")
            zh_hint = quiz.get("zh_hint", "")
            answer = quiz.get("answer", "")
            explanation = quiz.get("explanation", "")
            hint = quiz.get("hint", "")
            options = normalize_options(quiz)

            render_bilingual_question(idx, question, zh_hint)
            if options:
                option_labels = [item["label"] for item in options]
                label_to_value = {item["label"]: item["value"] for item in options}
                selected = st.radio(
                    "Choose one answer:",
                    option_labels,
                    key=f"{selected_chapter_key}_q_{idx}_mc",
                    label_visibility="collapsed",
                )
                col_hint, col_check = st.columns([1, 1])
                with col_hint:
                    if hint and st.button("Show hint", key=f"{selected_chapter_key}_q_{idx}_mc_hint"):
                        st.warning(hint)
                with col_check:
                    if st.button("Check", key=f"{selected_chapter_key}_q_{idx}_mc_check"):
                        selected_value = label_to_value.get(selected, selected)
                        if check_answer(selected_value, answer):
                            st.success("Correct.")
                        else:
                            st.error(f"Incorrect. Correct answer: {answer}")
                        if explanation:
                            st.info(explanation)
            else:
                st.warning("This MC question has no options.")
            st.markdown("---")

        st.markdown("### Calculation")
        if not calc_questions:
            st.info("No calculation questions in this chapter.")
        for idx, quiz in calc_questions:
            question = quiz.get("question", f"Question {idx}")
            zh_hint = quiz.get("zh_hint", "")
            answer = quiz.get("answer", "")
            explanation = quiz.get("explanation", "")
            hint = quiz.get("hint", "")

            render_bilingual_question(idx, question, zh_hint)
            if quiz.get("formula"):
                st.code(f"Formula: {quiz.get('formula')}")
            user_calc = st.text_input(
                "Enter your result (or key steps):",
                key=f"{selected_chapter_key}_q_{idx}_calc",
            )
            col_hint, col_check = st.columns([1, 1])
            with col_hint:
                if hint and st.button("Show hint", key=f"{selected_chapter_key}_q_{idx}_calc_hint"):
                    st.warning(hint)
            with col_check:
                if st.button("Check", key=f"{selected_chapter_key}_q_{idx}_calc_check"):
                    if check_answer(user_calc, answer):
                        st.success("Correct.")
                    else:
                        st.error(f"Expected answer: {answer}")
                    if explanation:
                        st.info(explanation)
            st.markdown("---")

        st.markdown("### Short Answer")
        if not short_questions:
            st.info("No short-answer questions in this chapter.")
        for idx, quiz in short_questions:
            question = quiz.get("question", f"Question {idx}")
            zh_hint = quiz.get("zh_hint", "")
            answer = quiz.get("answer", "")
            explanation = quiz.get("explanation", "")
            hint = quiz.get("hint", "")

            render_bilingual_question(idx, question, zh_hint)
            user_qa = st.text_area(
                "Write your answer (Chinese answer allowed):",
                key=f"{selected_chapter_key}_q_{idx}_qa",
                height=110,
            )
            col_hint, col_ref = st.columns([1, 1])
            with col_hint:
                if hint and st.button("Show hint", key=f"{selected_chapter_key}_q_{idx}_qa_hint"):
                    st.warning(hint)
            with col_ref:
                if st.button("Show reference answer", key=f"{selected_chapter_key}_q_{idx}_qa_check"):
                    st.info(f"Reference answer: {answer}")
                    if explanation:
                        st.info(explanation)
                    if user_qa.strip():
                        st.caption("Tip: compare your structure and key terms against the reference answer.")
                    st.markdown("---")

elif chosen == SECTION_LABELS[4]:
    st.subheader("🌐 Live News Insights")
    st.caption("與側欄相同來源；點按鈕可在新分頁開啟原文。")
    live = st.session_state.get("live_news") or []
    if not live:
        st.info("請於側欄按 **Refresh News** 載入新聞列表。")
    else:
        for i, news_item in enumerate(live[:3], start=1):
            title = news_item.get("title", "Insurance trend update")
            title_zh = news_item.get("title_zh", "")
            st.markdown(f"**{i}.** {title}")
            if title_zh:
                st.caption(f"中文：{title_zh}")
            article_url = resolve_news_article_url(news_item)
            st.link_button(
                "新分頁開啟原文 ↗",
                article_url,
                key=f"live_insights_article_{i}",
                help="在外部瀏覽器分頁開啟報導全文。",
            )
            st.markdown("---")