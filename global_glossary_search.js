/**
 * Global glossary search (Streamlit top iframe).
 * - Dropdown: matches chapter + slide + term fields.
 * - Auto-teleport: when query matches at least one glossary TERM title (EN/ZH),
 *   debounced navigate → parent URL → Python switches chapter + Glossary section → iframe scroll + flash.
 */
(function () {
  "use strict";

  var idx = [];
  var root, input, dd;
  var debRender = null;
  var debJump = null;
  var MIN_AUTO_CHARS = 2;
  var DEBOUNCE_MS = 320;

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .trim();
  }

  /** Full-row match (dropdown list, includes chapter titles). */
  function rowMatches(row, qLower) {
    if (!qLower) return false;
    var blob = [
      row.chapterLabel,
      row.chapterTitle,
      row.slideTitle,
      row.term,
      row.zh,
    ]
      .map(norm)
      .join(" ");
    var words = qLower
      .trim()
      .split(/\s+/)
      .filter(function (w) {
        return w.length > 0;
      });
    if (!words.length) return false;
    for (var i = 0; i < words.length; i++) {
      if (blob.indexOf(words[i]) === -1) return false;
    }
    return true;
  }

  /** Term title only (EN + ZH) — used for auto jump. */
  function termTitleMatches(row, qLower) {
    if (row.isChapterRow) return false;
    var words = qLower
      .trim()
      .split(/\s+/)
      .filter(function (w) {
        return w.length > 0;
      });
    if (!words.length) return false;
    var blob = norm(row.term) + " " + norm(row.zh);
    for (var i = 0; i < words.length; i++) {
      if (blob.indexOf(words[i]) === -1) return false;
    }
    return true;
  }

  function collectTermHits(qLower) {
    var out = [];
    if (!qLower || qLower.length < MIN_AUTO_CHARS) return out;
    for (var i = 0; i < idx.length; i++) {
      if (termTitleMatches(idx[i], qLower)) out.push(idx[i]);
    }
    return out;
  }

  function buildNavUrl(r) {
    var u = new URL(window.parent.location.href);
    u.search = "";
    u.hash = "";
    u.searchParams.set("gc", r.chapterKey);
    if (!r.isChapterRow) {
      u.searchParams.set("gslide", r.slideTitle || "");
      u.searchParams.set("gterm", r.term || "");
      if (r.zh) u.searchParams.set("gzh", r.zh);
      if (r.cardId) u.searchParams.set("gcard", r.cardId);
    }
    return u.toString();
  }

  function navigate(r) {
    window.parent.location.href = buildNavUrl(r);
  }

  function renderResults(q) {
    dd.innerHTML = "";
    var trimmed = (q || "").trim();
    if (!trimmed) {
      dd.style.display = "none";
      return;
    }
    var low = trimmed.toLowerCase();
    var hits = [];
    for (var i = 0; i < idx.length; i++) {
      if (rowMatches(idx[i], low)) hits.push(idx[i]);
      if (hits.length >= 28) break;
    }
    if (!hits.length) {
      dd.style.display = "none";
      return;
    }
    dd.style.display = "block";
    for (var j = 0; j < hits.length; j++) {
      (function (r) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gsearch-hit";
        var line;
        if (r.isChapterRow) {
          line =
            "[" + r.chapterLabel + "] " + (r.chapterTitle || "Chapter");
        } else {
          line = "[" + r.chapterLabel + "] " + (r.term || "—");
          if (r.zh) line += " · " + r.zh;
        }
        btn.textContent = line;
        btn.addEventListener("click", function () {
          dd.style.display = "none";
          navigate(r);
        });
        dd.appendChild(btn);
      })(hits[j]);
    }
  }

  function scheduleAutoJump(qRaw) {
    clearTimeout(debJump);
    debJump = setTimeout(function () {
      debJump = null;
      var q = (qRaw || "").trim().toLowerCase();
      if (q.length < MIN_AUTO_CHARS) return;
      var termHits = collectTermHits(q);
      if (!termHits.length) return;
      var dest = buildNavUrl(termHits[0]);
      try {
        if (window.parent.location.href.split("#")[0] === dest) return;
      } catch (e) {}
      window.parent.location.href = dest;
    }, DEBOUNCE_MS);
  }

  function init() {
    var el = document.getElementById("gsearch-index");
    if (!el) return;
    try {
      idx = JSON.parse(el.textContent);
    } catch (e) {
      return;
    }
    root = document.getElementById("gsearch-root");
    input = document.getElementById("gsearch-input");
    dd = document.getElementById("gsearch-dd");
    if (!root || !input || !dd) return;

    input.addEventListener("input", function () {
      var v = input.value;
      clearTimeout(debRender);
      debRender = setTimeout(function () {
        renderResults(v);
      }, 80);
      scheduleAutoJump(v);
    });

    input.addEventListener("focus", function () {
      renderResults(input.value);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        dd.style.display = "none";
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        var q = input.value.trim().toLowerCase();
        var termHits = collectTermHits(q);
        if (termHits.length) {
          navigate(termHits[0]);
          return;
        }
        var low = q;
        for (var i = 0; i < idx.length; i++) {
          if (rowMatches(idx[i], low) && !idx[i].isChapterRow) {
            navigate(idx[i]);
            return;
          }
        }
        for (var j = 0; j < idx.length; j++) {
          if (rowMatches(idx[j], low)) {
            navigate(idx[j]);
            return;
          }
        }
      }
    });

    document.addEventListener("click", function (e) {
      if (root && !root.contains(e.target)) dd.style.display = "none";
    });
  }

  init();
})();
