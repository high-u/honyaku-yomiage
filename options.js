import { DEFAULT_SETTINGS, loadSettings, saveSettings, normalizeServerUrl } from "./lib/settings.js";

const llamaInput = document.getElementById("llamaUrl");
const speechInput = document.getElementById("speechUrl");
const saveButton = document.getElementById("save");
const statusElement = document.getElementById("status");

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

llamaInput.placeholder = DEFAULT_SETTINGS.llamaUrl;
speechInput.placeholder = DEFAULT_SETTINGS.speechUrl;

try {
  const settings = await loadSettings();
  llamaInput.value = settings.llamaUrl;
  speechInput.value = settings.speechUrl;
} catch (err) {
  console.error("[ERROR] Failed to load settings:", err);
  setStatus(`設定の読み込みに失敗しました: ${err.message}`, true);
}

saveButton.addEventListener("click", async () => {
  try {
    const settings = {
      llamaUrl: normalizeServerUrl("翻訳サーバー", llamaInput.value),
      speechUrl: normalizeServerUrl("音声合成サーバー", speechInput.value),
    };
    await saveSettings(settings);
    llamaInput.value = settings.llamaUrl;
    speechInput.value = settings.speechUrl;
    setStatus("保存しました。次の「開始」から使われます。");
  } catch (err) {
    console.error("[ERROR] Failed to save settings:", err);
    setStatus(err.message, true);
  }
});
