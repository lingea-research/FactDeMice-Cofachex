# FactDeMice — COmment FAct CHecker EXtension (Chrome extension)

Select a comment on a discussion site (e.g. lide.cz, social media), and the
extension sends it to the [FactDeMice API](https://pcknot9.fit.vutbr.cz:9999/docs)
and shows the list of verifiable claims it extracted.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder.
4. Click the extension icon in the toolbar and paste your **API key**, then Save.

## Use

- Select a comment's text on any page → a **🔍 Fact-check** bubble appears under
  the selection → click it.
- Or right-click the selection → **Fact-check this comment**.
- A panel shows whether the comment is check-worthy and lists the extracted
  claims with their properties (temporal, common fact, needs reasoning, …).

On `lide.cz/diskuze/...` pages the linked article's URL is decoded from the page
URL and sent along as article context.

## Files

- `manifest.json` — Manifest V3 config
- `background.js` — service worker; owns the API call (`X-API-Key` auth)
- `content.js` — selection bubble + results panel (rendered in a closed shadow DOM)
- `popup.html` / `popup.js` — settings (API key, target number of claims)
