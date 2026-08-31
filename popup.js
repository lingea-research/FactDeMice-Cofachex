const API_BASE = "https://pcknot9.fit.vutbr.cz:9999";

const apiKeyInput = document.getElementById("apiKey");
const targetClaimsInput = document.getElementById("targetClaims");
const modelSelect = document.getElementById("model");
const modelHint = document.getElementById("modelHint");
const status = document.getElementById("status");

chrome.storage.sync.get(["apiKey", "targetClaims", "model"]).then(({ apiKey, targetClaims, model }) => {
  if (apiKey) apiKeyInput.value = apiKey;
  if (targetClaims) targetClaimsInput.value = targetClaims;
  loadModels(apiKey, model);
});

// refresh the model list as soon as a key is entered/changed
apiKeyInput.addEventListener("change", () => {
  loadModels(apiKeyInput.value.trim(), modelSelect.value);
});

async function loadModels(apiKey, selected) {
  if (!apiKey) {
    modelHint.textContent = "Enter an API key to load the model list.";
    return;
  }
  modelHint.textContent = "Loading models…";
  try {
    const res = await fetch(`${API_BASE}/v1/models`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // rebuild options, keeping the "API default" entry first
    modelSelect.replaceChildren();
    const def = document.createElement("option");
    def.value = "";
    def.textContent = data.default_model
      ? `API default (${data.default_model})`
      : "API default";
    modelSelect.appendChild(def);

    for (const m of data.models || []) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.id + (m.default ? " (default)" : "");
      modelSelect.appendChild(opt);
    }
    // restore the saved choice if it still exists
    if (selected && [...modelSelect.options].some((o) => o.value === selected)) {
      modelSelect.value = selected;
    }
    modelHint.textContent = "";
  } catch (err) {
    modelHint.textContent = `Could not load models (${err.message}). Using API default.`;
  }
}

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiKey: apiKeyInput.value.trim(),
    targetClaims: targetClaimsInput.value.trim(),
    model: modelSelect.value,
  });
  status.textContent = "Saved ✓";
  setTimeout(() => (status.textContent = ""), 1500);
});
