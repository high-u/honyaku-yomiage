/**
 * speech.cpp (`speech serve irodori-tts`) で日本語の1文を WAV 音声に変換する。
 * voice や instructions などはサーバー起動時の既定値を使う。
 * フォールバックは一切行わず、エラー時は即座に例外を投げる。
 */
export async function synthesizeSentence(japaneseSentence, options, signal) {
  const endpoint = `${options.baseUrl.replace(/\/$/, "")}/v1/audio/speech`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: japaneseSentence,
      response_format: "wav",
    }),
    signal,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      `TTS API failed (${response.status} ${response.statusText}): ${bodyText}`
    );
  }

  const wav = await response.blob();
  if (wav.size === 0) {
    throw new Error("TTS API returned empty audio data");
  }

  return wav;
}
