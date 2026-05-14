/**
 * Glossary tree: drag-and-drop (handle only), expand/collapse (<details>),
 * persist tree + notes + status to localStorage, renderGlossary() redraw.
 * Loaded inline inside Streamlit components.html (each slide = separate iframe).
 */
(function () {
  "use strict";

  var state = {
    chapterKey: "",
    slideTitle: "",
    terms: [],
    bootTerms: null,
    draggingGid: null,
  };

  function expandAncestorsOf(cardEl, root) {
    var el = cardEl.parentElement;
    while (el && el !== root) {
      if (el.classList && el.classList.contains("glossary-card")) {
        var det = el.querySelector(
          ":scope > .glossary-card-head details.glossary-details"
        );
        if (det) det.open = true;
      }
      el = el.parentElement;
    }
  }

  function normBlob(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function findCardByTerm(root, wantT, wantZ) {
    var nt = normBlob(wantT);
    var nz = normBlob(wantZ);
    var cards = root.querySelectorAll(".glossary-card");
    var i;
    if (nt) {
      for (i = 0; i < cards.length; i++) {
        var c = cards[i];
        var t = normBlob(c.getAttribute("data-glossary-term"));
        var z = normBlob(c.getAttribute("data-glossary-zh"));
        if (t === nt && (!nz || z === nz)) return c;
      }
      var words = nt.split(/\s+/).filter(function (w) {
        return w.length > 0;
      });
      if (words.length) {
        for (i = 0; i < cards.length; i++) {
          var c2 = cards[i];
          var t2 = normBlob(c2.getAttribute("data-glossary-term"));
          var z2 = normBlob(c2.getAttribute("data-glossary-zh"));
          var blob = t2 + " " + z2;
          var ok = true;
          for (var w = 0; w < words.length; w++) {
            if (blob.indexOf(words[w]) === -1) {
              ok = false;
              break;
            }
          }
          if (ok) return c2;
        }
      }
    }
    return null;
  }

  function applyScrollToTarget(root, boot) {
    var st = boot.scrollTo;
    if (!st || !root) return;
    var targetSlide = (st.targetSlide || "").trim();
    var mySlide = (boot.slideTitle || "").trim();
    var hasCid = (st.cardId || "").trim();
    if (targetSlide && targetSlide !== mySlide && !hasCid) return;

    var el = null;
    var cid = (st.cardId || "").trim();
    if (cid) {
      el = document.getElementById(cid);
      if (!el && root.querySelector) {
        el = root.querySelector(
          '[data-card-id="' + cid.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]'
        );
      }
    }
    if (!el) {
      el = findCardByTerm(root, st.term || "", st.zh || "");
    }
    if (!el) return;

    expandAncestorsOf(el, root);
    var det = el.querySelector(
      ":scope > .glossary-card-head details.glossary-details"
    );
    if (det) det.open = true;

    function bringParentIframeIntoView() {
      try {
        var fe = window.frameElement;
        if (fe && typeof fe.scrollIntoView === "function") {
          fe.scrollIntoView({
            behavior: "auto",
            block: "center",
            inline: "nearest",
          });
        }
      } catch (e) {}
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        try {
          el.scrollIntoView({
            behavior: "auto",
            block: "center",
            inline: "nearest",
          });
        } catch (e) {
          try {
            el.scrollIntoView(true);
          } catch (e2) {}
        }
        bringParentIframeIntoView();
        setTimeout(bringParentIframeIntoView, 80);
        setTimeout(bringParentIframeIntoView, 240);
        el.classList.add("glossary-card-flash");
        setTimeout(function () {
          el.classList.remove("glossary-card-flash");
        }, 2100);
      });
    });
  }

  function storageKeyTree() {
    var s = encodeURIComponent(state.slideTitle || "slide").replace(/%/g, "_");
    if (s.length > 120) s = s.slice(0, 120);
    return "glossary_tree_v2_" + state.chapterKey + "_" + s;
  }

  function normalizeItem(node) {
    if (!node || typeof node !== "object") return {};
    var raw = node.sub_items || node.children || [];
    var next = {};
    for (var k in node) {
      if (k !== "children" && k !== "sub_items") next[k] = node[k];
    }
    next.sub_items = raw.map(normalizeItem);
    return next;
  }

  function ensureGids(node) {
    if (!node._gid) {
      node._gid =
        "g_" +
        Math.random().toString(36).slice(2) +
        "_" +
        Date.now().toString(36);
    }
    if (!node.sub_items) node.sub_items = [];
    node.sub_items.forEach(ensureGids);
  }

  function persistTree() {
    try {
      localStorage.setItem(storageKeyTree(), JSON.stringify(state.terms));
    } catch (e) {}
  }

  function noteKey(gid, field) {
    return "glossary_note_" + state.chapterKey + "_" + gid + "_" + field;
  }

  function statusKey(gid) {
    return "glossary_status_" + state.chapterKey + "_" + gid;
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var STATUS_OPTIONS = ["Normal", "Hard", "Medium", "Key Point", "Mastered"];
  var STATUS_COLORS = {
    Hard: "#8B0000",
    Medium: "#B8860B",
    "Key Point": "#00008B",
    Normal: "#475569",
    Mastered: "#047857",
  };

  function findNodeByGid(nodes, gid) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n._gid === gid) return n;
      var hit = findNodeByGid(n.sub_items || [], gid);
      if (hit) return hit;
    }
    return null;
  }

  function containsGid(node, gid) {
    if (!node) return false;
    if (node._gid === gid) return true;
    var subs = node.sub_items || [];
    for (var i = 0; i < subs.length; i++) {
      if (containsGid(subs[i], gid)) return true;
    }
    return false;
  }

  function extractNode(nodes, gid) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i]._gid === gid) {
        return nodes.splice(i, 1)[0];
      }
      var sub = nodes[i].sub_items;
      if (sub && sub.length) {
        var got = extractNode(sub, gid);
        if (got) return got;
      }
    }
    return null;
  }

  function loadNote(el, key, defVal) {
    try {
      var s = localStorage.getItem(key);
      if (s !== null && s !== "") el.innerHTML = s;
      else el.textContent = defVal || "";
    } catch (e) {
      el.textContent = defVal || "";
    }
  }

  function saveNote(el, key) {
    try {
      localStorage.setItem(key, el.innerHTML);
    } catch (e) {}
  }

  function bindNote(el, key) {
    el.addEventListener("input", function () {
      saveNote(el, key);
    });
  }

  function renderToolbar(hostId) {
    return (
      '<div id="' +
      hostId +
      '_tb" class="eo-float-toolbar" aria-label="Formatting">' +
      '<button type="button" class="eo-tb-hl-y" data-eo-cmd="hl-yellow">A</button>' +
      '<button type="button" class="eo-tb-hl-p" data-eo-cmd="hl-pink">A</button>' +
      '<button type="button" class="eo-tb-bold" data-eo-cmd="bold"><b>B</b></button>' +
      '<button type="button" class="eo-tb-clear" data-eo-cmd="clear">🧹</button>' +
      "</div>"
    );
  }

  function renderCard(node, depth) {
    var gid = node._gid;
    var term = node.term || "—";
    var zh = node.zh || "";
    var defEn = node.def || "";
    var defZh = node.def_zh || "";
    var hostId = "eo_" + gid.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 80);

    var savedStatus = "Normal";
    try {
      var sv = localStorage.getItem(statusKey(gid));
      if (sv && STATUS_OPTIONS.indexOf(sv) >= 0) savedStatus = sv;
    } catch (e) {}

    var headerColor = STATUS_COLORS[savedStatus] || STATUS_COLORS.Normal;

    var card = document.createElement("div");
    card.className =
      "glossary-card" + (depth > 0 ? " glossary-card-nested" : "");
    card.dataset.glossaryId = gid;
    card.setAttribute("data-glossary-term", term);
    card.setAttribute("data-glossary-zh", zh);
    var stableCid = (node.cardId && String(node.cardId).trim()) || "";
    if (stableCid) {
      card.id = stableCid;
      card.setAttribute("data-card-id", stableCid);
    } else {
      var fb = "gloss-fallback-" + gid.replace(/[^a-zA-Z0-9_-]/g, "_");
      card.id = fb;
      card.setAttribute("data-card-id", fb);
    }

    var head = document.createElement("div");
    head.className = "glossary-card-head";

    var handle = document.createElement("span");
    handle.className = "glossary-drag-handle";
    handle.draggable = true;
    handle.dataset.glossaryId = gid;
    handle.title = "Drag to nest under another card";
    handle.textContent = "⋮⋮";
    handle.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });

    var details = document.createElement("details");
    details.className = "glossary-details";

    var summary = document.createElement("summary");
    summary.className = "glossary-summary";
    summary.style.background = headerColor;
    summary.innerHTML =
      "<span class=\"glossary-summary-text\">" +
      escapeHtml(term) +
      "（" +
      escapeHtml(zh) +
      "）</span>";

    var body = document.createElement("div");
    body.className = "glossary-card-body";

    var statusRow = document.createElement("div");
    statusRow.className = "glossary-status-row";
    var sel = document.createElement("select");
    sel.className = "glossary-status";
    sel.dataset.glossaryId = gid;
    STATUS_OPTIONS.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (opt === savedStatus) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      try {
        localStorage.setItem(statusKey(gid), sel.value);
      } catch (e) {}
      summary.style.background =
        STATUS_COLORS[sel.value] || STATUS_COLORS.Normal;
    });
    var statusLbl = document.createElement("span");
    statusLbl.className = "glossary-status-lbl";
    statusLbl.textContent = "Status";
    statusRow.appendChild(statusLbl);
    statusRow.appendChild(sel);

    var wrap = document.createElement("div");
    wrap.innerHTML =
      '<div class="eo-label eo-label-compact">Definition (EN · edit)</div>' +
      '<div id="' +
      hostId +
      '_en" class="eo-editable" contenteditable="true"></div>' +
      '<div class="eo-label eo-label-compact">Definition (ZH · edit)</div>' +
      '<div id="' +
      hostId +
      '_zh" class="eo-editable zh" contenteditable="true"></div>' +
      renderToolbar(hostId);

    body.appendChild(statusRow);
    while (wrap.firstChild) body.appendChild(wrap.firstChild);

    details.appendChild(summary);
    details.appendChild(body);
    head.appendChild(handle);
    head.appendChild(details);
    card.appendChild(head);

    var enEl = body.querySelector("#" + hostId + "_en");
    var zhEl = body.querySelector("#" + hostId + "_zh");
    if (enEl) {
      loadNote(enEl, noteKey(gid, "en"), defEn);
      bindNote(enEl, noteKey(gid, "en"));
    }
    if (zhEl) {
      loadNote(zhEl, noteKey(gid, "zh"), defZh || "");
      bindNote(zhEl, noteKey(gid, "zh"));
    }

    var subsWrap = document.createElement("div");
    subsWrap.className = "glossary-subcards";
    (node.sub_items || []).forEach(function (ch) {
      subsWrap.appendChild(renderCard(ch, depth + 1));
    });
    card.appendChild(subsWrap);

    return card;
  }

  function renderGlossary() {
    var root = document.getElementById("glossary-root");
    if (!root) return;
    root.innerHTML = "";
    state.terms.forEach(function (node) {
      root.appendChild(renderCard(node, 0));
    });
  }

  function onDrop(sourceGid, targetGid) {
    if (!sourceGid || !targetGid || sourceGid === targetGid) return;
    var sourceNode = findNodeByGid(state.terms, sourceGid);
    var targetNode = findNodeByGid(state.terms, targetGid);
    if (!sourceNode || !targetNode) return;
    if (containsGid(sourceNode, targetGid)) return;

    var moved = extractNode(state.terms, sourceGid);
    if (!moved) return;
    if (!targetNode.sub_items) targetNode.sub_items = [];
    targetNode.sub_items.push(moved);
    persistTree();
    renderGlossary();
  }

  function setupDelegation(root) {
    root.addEventListener("dragstart", function (e) {
      var h = e.target.closest(".glossary-drag-handle");
      if (!h) return;
      e.stopPropagation();
      var gid = h.dataset.glossaryId;
      state.draggingGid = gid;
      e.dataTransfer.setData("application/x-glossary-gid", gid);
      e.dataTransfer.setData("text/plain", gid);
      e.dataTransfer.effectAllowed = "move";
      var card = h.closest(".glossary-card");
      if (card) card.classList.add("glossary-dragging");
    });

    root.addEventListener("dragend", function () {
      document
        .querySelectorAll(".glossary-dragging")
        .forEach(function (el) {
          el.classList.remove("glossary-dragging");
        });
      document
        .querySelectorAll(".glossary-drop-target")
        .forEach(function (el) {
          el.classList.remove("glossary-drop-target");
        });
      state.draggingGid = null;
    });

    root.addEventListener("dragover", function (e) {
      var card = e.target.closest(".glossary-card");
      if (!card || !state.draggingGid) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      document
        .querySelectorAll(".glossary-drop-target")
        .forEach(function (el) {
          el.classList.remove("glossary-drop-target");
        });
      card.classList.add("glossary-drop-target");
    });

    root.addEventListener("dragleave", function (e) {
      var card = e.target.closest(".glossary-card");
      if (
        card &&
        e.relatedTarget &&
        !card.contains(e.relatedTarget)
      ) {
        card.classList.remove("glossary-drop-target");
      }
    });

    root.addEventListener("drop", function (e) {
      var card = e.target.closest(".glossary-card");
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      var targetGid = card.dataset.glossaryId;
      var sourceGid =
        e.dataTransfer.getData("application/x-glossary-gid") ||
        state.draggingGid;
      card.classList.remove("glossary-drop-target");
      onDrop(sourceGid, targetGid);
    });

    root.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-eo-cmd]");
      if (!btn) return;
      e.preventDefault();
      var cmd = btn.getAttribute("data-eo-cmd");
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) return;
      var node = sel.anchorNode;
      var n = node && node.nodeType === 3 ? node.parentElement : node;
      var en = e.target.closest(".glossary-card-body");
      if (!en) return;
      var elEn = en.querySelector(".eo-editable:not(.zh)");
      var elZh = en.querySelector(".eo-editable.zh");
      if (!elEn || !elZh) return;
      var host =
        elEn.contains(n) || elEn === n
          ? elEn
          : elZh.contains(n) || elZh === n
            ? elZh
            : null;
      if (!host) return;
      try {
        if (cmd === "hl-yellow") {
          document.execCommand("backColor", false, "#ffff00");
        } else if (cmd === "hl-pink") {
          document.execCommand("backColor", false, "#ffc0cb");
        } else if (cmd === "bold") {
          document.execCommand("bold", false, null);
        } else if (cmd === "clear") {
          document.execCommand("removeFormat", false, null);
        }
      } catch (err) {}
      var gcard = host.closest(".glossary-card");
      if (gcard && gcard.dataset.glossaryId) {
        saveNote(
          host,
          noteKey(
            gcard.dataset.glossaryId,
            host.classList.contains("zh") ? "zh" : "en"
          )
        );
      }
    });

    document.addEventListener("mouseup", function () {
      setTimeout(function () {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          document.querySelectorAll(".eo-float-toolbar").forEach(function (tb) {
            tb.style.display = "none";
          });
          return;
        }
        var host = null;
        document.querySelectorAll(".eo-editable").forEach(function (el) {
          var node = sel.anchorNode;
          var n = node && node.nodeType === 3 ? node.parentElement : node;
          if (el.contains(n) || el === n) host = el;
        });
        if (!host) return;
        var card = host.closest(".glossary-card");
        if (!card) return;
        var hostId = host.id.replace(/_en$|_zh$/, "");
        var tb = document.getElementById(hostId + "_tb");
        if (!tb) return;
        var r = sel.getRangeAt(0).getBoundingClientRect();
        if (r.width < 1 && r.height < 1) {
          tb.style.display = "none";
          return;
        }
        tb.style.display = "flex";
        var tw = tb.offsetWidth || 160;
        var th = tb.offsetHeight || 36;
        var left = r.left + r.width / 2 - tw / 2;
        var top = r.top + window.scrollY - th - 8;
        left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
        if (top < 6) top = r.bottom + window.scrollY + 6;
        tb.style.left = left + "px";
        tb.style.top = top + "px";
      }, 0);
    });
  }

  function injectStyles() {
    var css =
      "html,body{overflow-x:hidden;overflow-y:auto;min-height:100%;height:auto;}" +
      "#glossary-app-root{overflow:visible;min-height:0;}" +
      "@keyframes glossary-flash-red{0%{border-color:#ef4444;box-shadow:0 0 0 0 rgba(239,68,68,.8);}15%{border-color:#dc2626;box-shadow:0 0 0 8px rgba(239,68,68,.35);}100%{border-color:#e2e8f0;box-shadow:0 0 0 0 transparent;}}" +
      ".glossary-card-flash{animation:glossary-flash-red 2s ease-in-out 1;border:5px solid #ef4444!important;border-radius:8px;box-sizing:border-box;}" +
      "#glossary-root{overflow:visible;min-height:0;}" +
      "body{margin:0;padding:6px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:#1e293b;}" +
      ".glossary-toolbar-compact{display:flex;justify-content:flex-end;margin:0 0 4px 0;}" +
      "button.glossary-reset-icon{width:32px;height:32px;padding:0;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#64748b;cursor:pointer;font-size:16px;line-height:1;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(15,23,42,.06);transition:background .15s,border-color .15s;}" +
      "button.glossary-reset-icon:hover{background:#f8fafc;border-color:#cbd5e1;color:#0f172a;}" +
      ".glossary-card{border:1px solid #e2e8f0;border-radius:8px;margin-bottom:4px;background:#fff;scroll-margin-top:24px;scroll-margin-bottom:24px;}" +
      ".glossary-card-nested{background:#f1f5f9;margin-left:8px;border-left:3px solid #94a3b8;}" +
      ".glossary-card-head{display:flex;align-items:flex-start;gap:4px;padding:2px 4px;}" +
      ".glossary-drag-handle{cursor:grab;user-select:none;padding:4px 2px;color:#64748b;font-weight:700;line-height:1.2;flex-shrink:0;font-size:12px;}" +
      ".glossary-drag-handle:active{cursor:grabbing;}" +
      ".glossary-details{flex:1;min-width:0;}" +
      "summary.glossary-summary{list-style:none;padding:6px 10px;border-radius:6px;color:#fff;font-weight:600;cursor:pointer;font-size:13px;}" +
      "summary.glossary-summary::-webkit-details-marker{display:none;}" +
      ".glossary-card-body{padding:6px 8px 8px;border-top:1px solid #e5e7eb;}" +
      ".glossary-status-row{display:flex;align-items:center;gap:6px;margin:0 0 6px 0;flex-wrap:wrap;}" +
      ".glossary-status-lbl{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em;}" +
      ".glossary-status{padding:3px 6px;border-radius:5px;border:1px solid #e2e8f0;font-size:12px;}" +
      ".eo-label-compact{color:#64748b;font-size:11px;font-weight:600;margin:6px 0 2px 0;letter-spacing:.02em;}" +
      ".eo-editable{border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;min-height:52px;line-height:1.5;font-size:13px;background:#fafafa;outline:none;}" +
      ".eo-editable:focus{background:#fff;outline:2px solid rgba(59,130,246,.45);outline-offset:1px;border-color:#93C5FD;}" +
      ".eo-float-toolbar{display:none;position:fixed;z-index:2147483647;align-items:center;gap:2px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:3px 5px;box-shadow:0 4px 14px rgba(15,23,42,.1);}" +
      ".eo-float-toolbar button{border:none;background:transparent;cursor:pointer;border-radius:5px;padding:3px 7px;font-size:12px;}" +
      ".eo-tb-hl-y{background:#fff566!important;}" +
      ".eo-tb-hl-p{background:#ffc0cb!important;}" +
      ".glossary-dragging{opacity:0.55;}" +
      ".glossary-drop-target{box-shadow:0 0 0 2px #2563eb;background:#eff6ff;}" +
      ".glossary-subcards{margin-top:2px;padding-left:2px;}";
    var st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  }

  function init() {
    var bootEl = document.getElementById("glossary-boot");
    if (!bootEl) return;
    var boot;
    try {
      boot = JSON.parse(bootEl.textContent);
    } catch (e) {
      return;
    }
    injectStyles();
    state.chapterKey = boot.chapterKey || "";
    state.slideTitle = boot.slideTitle || "";
    var terms = (boot.terms || []).map(normalizeItem);
    try {
      var saved = localStorage.getItem(storageKeyTree());
      if (saved) {
        var parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) terms = parsed.map(normalizeItem);
      }
    } catch (e2) {}
    terms.forEach(ensureGids);
    state.terms = terms;

    var host = document.getElementById("glossary-app-root");
    if (!host) return;
    host.innerHTML =
      '<div class="glossary-toolbar-compact">' +
      '<button type="button" id="glossary-reset-slide" class="glossary-reset-icon" title="還原本區塊（清除此投影片階層記錄）" aria-label="還原本區塊（清除此投影片階層記錄）">↺</button>' +
      "</div>" +
      '<div id="glossary-root"></div>';

    var root = document.getElementById("glossary-root");
    setupDelegation(root);

    document.getElementById("glossary-reset-slide").addEventListener("click", function () {
      try {
        localStorage.removeItem(storageKeyTree());
      } catch (e) {}
      location.reload();
    });

    renderGlossary();
    applyScrollToTarget(root, boot);
  }

  window.renderGlossary = renderGlossary;
  init();
})();
