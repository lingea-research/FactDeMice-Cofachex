(() => {
  const MIN_SELECTION_LEN = 20;
  const MAX_SELECTION_LEN = 5000; // API limit on comment.text

  let host = null; // <div> hosting the shadow DOM
  let shadow = null;
  let bubble = null;
  let panel = null;

  // ---------- article URL detection ----------

  function detectArticleUrl() {
    // lide.cz discussions embed the article URL in the path:
    // https://www.lide.cz/diskuze/www.novinky.cz%2Fclanek%2F40595235
    const m = location.href.match(/lide\.cz\/diskuze\/([^?#]+)/);
    if (m) {
      const decoded = decodeURIComponent(m[1]);
      return decoded.startsWith("http") ? decoded : "https://" + decoded;
    }
    // generic fallback: a canonical link pointing off-site is sometimes the article
    return null;
  }

  // ---------- shadow DOM setup ----------

  function ensureShadow() {
    if (shadow) return;
    host = document.createElement("div");
    host.id = "fdm-factcheck-host";
    host.style.cssText = "all: initial; position: absolute; top: 0; left: 0; z-index: 2147483647;";
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .bubble {
        position: absolute;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #1a73e8;
        color: #fff;
        font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        padding: 7px 12px;
        border-radius: 999px;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,.25);
        user-select: none;
        white-space: nowrap;
      }
      .bubble:hover { background: #1765cc; }
      .panel {
        position: absolute;
        width: 420px;
        max-width: calc(100vw - 32px);
        max-height: 70vh;
        overflow-y: auto;
        background: #fff;
        color: #1f2328;
        font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        border: 1px solid #d0d7de;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,.25);
        padding: 14px 16px;
      }
      .panel-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 10px;
      }
      .panel-title { font-weight: 700; font-size: 14px; }
      .close-btn {
        border: none; background: transparent; cursor: pointer;
        font-size: 18px; line-height: 1; color: #656d76; padding: 2px 6px;
      }
      .close-btn:hover { color: #1f2328; }
      .quoted {
        border-left: 3px solid #d0d7de;
        padding: 2px 10px;
        color: #656d76;
        font-size: 12.5px;
        margin-bottom: 10px;
        max-height: 72px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .context-row {
        display: flex; align-items: center; gap: 6px;
        font-size: 12px; margin-bottom: 10px;
        padding: 5px 8px; border-radius: 6px;
      }
      .context-row.with-article { background: #ddf4ff; color: #0969da; }
      .context-row.no-article { background: #f6f8fa; color: #8b949e; }
      .context-row .dot { font-size: 13px; }
      .context-row .url {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        direction: rtl; text-align: left;
      }
      .status { color: #656d76; font-size: 13px; padding: 8px 0; }
      .spinner {
        display: inline-block; width: 14px; height: 14px;
        border: 2px solid #d0d7de; border-top-color: #1a73e8;
        border-radius: 50%; animation: fdm-spin .8s linear infinite;
        vertical-align: -2px; margin-right: 8px;
      }
      @keyframes fdm-spin { to { transform: rotate(360deg); } }
      .verdict {
        display: inline-block;
        font-size: 12px; font-weight: 700;
        padding: 3px 10px; border-radius: 999px;
        margin-bottom: 10px;
      }
      .verdict.yes { background: #fff1e5; color: #bc4c00; }
      .verdict.no  { background: #dafbe1; color: #116329; }
      .claim {
        border: 1px solid #d0d7de; border-radius: 8px;
        padding: 10px 12px; margin-bottom: 8px;
      }
      .claim-text { font-size: 13.5px; }
      .tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
      .tag {
        font-size: 11px; font-weight: 600;
        background: #eef1f4; color: #57606a;
        padding: 2px 8px; border-radius: 999px;
      }
      .claim-summary { margin-top: 6px; font-size: 12.5px; color: #57606a; }
      .summary {
        margin-top: 10px; padding-top: 10px; border-top: 1px solid #d0d7de;
        font-size: 13px;
      }
      .summary b { display: block; margin-bottom: 4px; }
      .error { color: #cf222e; font-size: 13px; padding: 6px 0; }
      .footer { margin-top: 10px; font-size: 11px; color: #8b949e; text-align: right; }
    `;
    shadow.appendChild(style);
  }

  function removeBubble() {
    if (bubble) { bubble.remove(); bubble = null; }
  }
  function removePanel() {
    if (panel) { panel.remove(); panel = null; }
  }

  function docPositionForSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return {
      left: rect.left + window.scrollX,
      bottom: rect.bottom + window.scrollY,
    };
  }

  // ---------- selection bubble ----------

  document.addEventListener("mouseup", (e) => {
    // let clicks inside our own UI through
    if (e.target === host) return;
    setTimeout(maybeShowBubble, 10); // wait for the selection to settle
  });

  document.addEventListener("mousedown", (e) => {
    if (e.target !== host) removeBubble();
  });

  function maybeShowBubble() {
    const text = (window.getSelection()?.toString() || "").trim();
    removeBubble();
    if (text.length < MIN_SELECTION_LEN || text.length > MAX_SELECTION_LEN) return;
    const pos = docPositionForSelection();
    if (!pos) return;

    ensureShadow();
    bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = "🔍 Fact-check";
    bubble.style.left = `${pos.left}px`;
    bubble.style.top = `${pos.bottom + 8}px`;
    bubble.addEventListener("mousedown", (e) => e.stopPropagation());
    bubble.addEventListener("click", () => {
      const t = text;
      removeBubble();
      runFactCheck(t, pos);
    });
    shadow.appendChild(bubble);
  }

  // ---------- context menu entry point ----------

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "fdm-run-from-context-menu") return;
    const text = (msg.text || "").trim();
    if (!text) return;
    const pos = docPositionForSelection() || {
      left: window.scrollX + 16,
      bottom: window.scrollY + 16,
    };
    runFactCheck(text.slice(0, MAX_SELECTION_LEN), pos);
  });

  // ---------- fact-check flow ----------

  function runFactCheck(text, pos) {
    ensureShadow();
    removePanel();
    panel = document.createElement("div");
    panel.className = "panel";
    panel.style.left = `${pos.left}px`;
    panel.style.top = `${pos.bottom + 8}px`;
    panel.addEventListener("mousedown", (e) => e.stopPropagation());
    shadow.appendChild(panel);

    const articleUrl = detectArticleUrl();
    renderHeader(text);
    renderArticleContext(articleUrl);
    const status = document.createElement("div");
    status.className = "status";
    status.innerHTML = `<span class="spinner"></span>Checking for verifiable claims…`;
    panel.appendChild(status);

    chrome.runtime.sendMessage(
      {
        type: "fdm-fact-check",
        text,
        articleUrl,
        pageUrl: location.href,
      },
      (resp) => {
        if (!panel) return;
        status.remove();
        if (chrome.runtime.lastError) {
          renderError(chrome.runtime.lastError.message);
        } else if (!resp?.ok) {
          renderError(resp?.error || "Unknown error");
        } else {
          renderResult(resp.data);
        }
      }
    );
  }

  function renderHeader(text) {
    const header = document.createElement("div");
    header.className = "panel-header";
    const title = document.createElement("div");
    title.className = "panel-title";
    title.textContent = "FactDeMice";
    const close = document.createElement("button");
    close.className = "close-btn";
    close.textContent = "✕";
    close.addEventListener("click", removePanel);
    header.append(title, close);
    panel.appendChild(header);

    const quoted = document.createElement("div");
    quoted.className = "quoted";
    quoted.textContent = text.length > 220 ? text.slice(0, 220) + "…" : text;
    panel.appendChild(quoted);
  }

  function renderArticleContext(articleUrl) {
    const row = document.createElement("div");
    row.className = "context-row " + (articleUrl ? "with-article" : "no-article");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.textContent = articleUrl ? "📎" : "○";
    row.appendChild(dot);
    if (articleUrl) {
      const label = document.createElement("span");
      label.textContent = "Article sent:";
      const url = document.createElement("span");
      url.className = "url";
      url.textContent = articleUrl.replace(/^https?:\/\//, "");
      url.title = articleUrl;
      row.append(label, url);
    } else {
      const label = document.createElement("span");
      label.textContent = "No article context — checking the comment on its own";
      row.appendChild(label);
    }
    panel.appendChild(row);
  }

  function renderError(message) {
    const div = document.createElement("div");
    div.className = "error";
    div.textContent = "⚠ " + message;
    panel.appendChild(div);
  }

  const TAG_LABELS = {
    common_fact: "common fact",
    temporal: "temporal",
    contrasting: "contrasting",
    requires_reasoning: "needs reasoning",
    evidence_gap: "evidence gap",
  };

  function renderResult(data) {
    const verdict = document.createElement("span");
    verdict.className = "verdict " + (data.checkworthy ? "yes" : "no");
    verdict.textContent = data.checkworthy
      ? "Contains check-worthy claims"
      : "Nothing check-worthy found";
    panel.appendChild(verdict);

    const claims = Array.isArray(data.claims) ? data.claims : [];
    if (claims.length === 0) {
      const none = document.createElement("div");
      none.className = "status";
      none.textContent = "No verifiable claims were extracted from this comment.";
      panel.appendChild(none);
    }

    for (const claim of claims) {
      const div = document.createElement("div");
      div.className = "claim";
      const t = document.createElement("div");
      t.className = "claim-text";
      t.textContent = claim.text || "";
      div.appendChild(t);

      const tags = document.createElement("div");
      tags.className = "tags";
      for (const [key, label] of Object.entries(TAG_LABELS)) {
        if (claim[key]) {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = label;
          tags.appendChild(tag);
        }
      }
      if (tags.childElementCount > 0) div.appendChild(tags);

      if (claim.fc_summary) {
        const s = document.createElement("div");
        s.className = "claim-summary";
        s.textContent = claim.fc_summary;
        div.appendChild(s);
      }
      panel.appendChild(div);
    }

    if (data.fc_summary) {
      const s = document.createElement("div");
      s.className = "summary";
      s.innerHTML = "<b>Summary</b>";
      const body = document.createElement("span");
      body.textContent = data.fc_summary;
      s.appendChild(body);
      panel.appendChild(s);
    }

    const footer = document.createElement("div");
    footer.className = "footer";
    footer.textContent = data.model ? `model: ${data.model}` : "";
    panel.appendChild(footer);
  }
})();
