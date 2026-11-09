/**
 * 接続先の設定。chrome.storage.local に保存し、未設定の項目はこの既定値を使う。
 */
export const DEFAULT_SETTINGS = {
  llamaUrl: "http://127.0.0.1:8000",
  speechUrl: "http://127.0.0.1:8080",
};

export async function loadSettings() {
  return chrome.storage.local.get(DEFAULT_SETTINGS);
}

export async function saveSettings(settings) {
  await chrome.storage.local.set(settings);
}

/**
 * 入力された URL を検証して、末尾のスラッシュを除いた形で返す。不正なら例外を投げる。
 */
export function normalizeServerUrl(label, value) {
  const text = value.trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} の URL が正しくありません: "${text}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} の URL は http:// か https:// で始めてください: "${text}"`);
  }
  return text.replace(/\/$/, "");
}
