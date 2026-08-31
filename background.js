const API_BASE = "https://pcknot9.fit.vutbr.cz:9999";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "fdm-factcheck",
    title: "Fact-check this comment",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "fdm-factcheck" || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "fdm-run-from-context-menu",
    text: info.selectionText || "",
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "fdm-fact-check") {
    factCheck(msg)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true; // keep the message channel open for the async response
  }
});

async function factCheck({ text, articleUrl, pageUrl }) {
  const { apiKey, targetClaims, model } = await chrome.storage.sync.get(["apiKey", "targetClaims", "model"]);
  if (!apiKey) {
    throw new Error("No API key set. Click the extension icon and enter your API key.");
  }

  const body = {
    comment: { text },
    options: { language: "auto" },
    metadata: { source_page: pageUrl },
  };
  const claims = parseInt(targetClaims, 10);
  if (claims >= 1 && claims <= 20) body.options.target_number_of_claims = claims;
  if (model) body.options.model = model;
  if (articleUrl) body.article = { url: articleUrl };

  const res = await fetch(`${API_BASE}/v1/fact-checks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail ?? err);
    } catch {
      detail = await res.text().catch(() => "");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Authentication failed (${res.status}). Check your API key. ${detail}`);
    }
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return res.json();
}
