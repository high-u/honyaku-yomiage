import { AsyncQueue } from "./lib/queue.js";
import { splitIntoParagraphs, splitIntoJapaneseSentences } from "./lib/chunker.js";
import { translateParagraph } from "./lib/translator.js";
import { synthesizeSentence } from "./lib/tts.js";
import { loadSettings } from "./lib/settings.js";

const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const statusElement = document.getElementById("status");
const outputElement = document.getElementById("output");

/** 実行中のパイプラインを止めるためのコントローラー。実行中でなければ null。 */
let controller = null;

function log(stage, message) {
  const now = new Date().toISOString().slice(11, 23);
  console.log(`[${now}] [${stage}] ${message}`);
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", isError);
}

/**
 * アクティブなタブで選択されているテキストを取得する。
 */
async function getSelectedText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    throw new Error("アクティブなタブが見つかりません");
  }
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString(),
  });
  const text = injection.result;
  if (text.trim().length === 0) {
    throw new Error("ページ上で英文を選択してから「開始」を押してください");
  }
  return text;
}

/**
 * メモリ上の WAV を再生し、再生し終わったら resolve する。停止されたら signal.reason で reject する。
 */
function playWav(wav, signal) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(wav);
    const audio = new Audio(url);
    const finish = () => {
      signal.removeEventListener("abort", onAbort);
      URL.revokeObjectURL(url);
    };
    const onAbort = () => {
      audio.pause();
      finish();
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort);
    audio.addEventListener("ended", () => {
      finish();
      resolve();
    });
    audio.addEventListener("error", () => {
      finish();
      reject(new Error(`音声の再生に失敗しました: ${audio.error?.message}`));
    });
    audio.play().catch((err) => {
      finish();
      reject(err);
    });
  });
}

/**
 * 翻訳した段落を、文ごとの <span> に分けて表示する。再生中の文をハイライトするために要素を返す。
 */
function renderParagraph(sentences) {
  const paragraphElement = document.createElement("p");
  const sentenceElements = sentences.map((sentence) => {
    const span = document.createElement("span");
    span.textContent = sentence;
    paragraphElement.append(span);
    return span;
  });
  outputElement.append(paragraphElement);
  return sentenceElements;
}

async function runPipeline(inputText, settings, signal) {
  const translateOptions = {
    baseUrl: settings.llamaUrl,
    model: "plamo-3-translate",
    form: "polite",
  };
  const ttsOptions = {
    baseUrl: settings.speechUrl,
  };

  const paragraphs = splitIntoParagraphs(inputText);
  log("MAIN", `Input split into ${paragraphs.length} paragraph(s).`);
  log("MAIN", `Translation Server: ${translateOptions.baseUrl} (model: ${translateOptions.model})`);
  log("MAIN", `TTS Server:         ${ttsOptions.baseUrl}`);

  // 翻訳ワーカー → TTSワーカー間の非同期キュー
  const translatedQueue = new AsyncQueue();
  // TTSワーカー → 再生ワーカー間の非同期キュー（メモリ上のWAV）
  const audioQueue = new AsyncQueue();

  // ① 翻訳ワーカー（段落ごとに翻訳して表示し、キューに順番に貯める）
  const translationWorker = (async () => {
    try {
      for (let i = 0; i < paragraphs.length; i++) {
        const english = paragraphs[i];
        log("TRANSLATE", `Paragraph #${i + 1} translating... "${english.slice(0, 50)}..."`);
        const japanese = await translateParagraph(english, translateOptions, signal);
        log("TRANSLATE", `Paragraph #${i + 1} done -> queued: "${japanese}"`);
        const sentences = splitIntoJapaneseSentences(japanese);
        const sentenceElements = renderParagraph(sentences);
        translatedQueue.push({
          paragraphIndex: i + 1,
          sentences,
          sentenceElements,
        });
      }
      translatedQueue.close();
      log("TRANSLATE", "All paragraphs translated and queued.");
    } catch (err) {
      translatedQueue.fail(err);
      throw err;
    }
  })();

  // ② TTSワーカー（翻訳とは非同期にキューから取り出し、1文ずつ音声合成して再生キューへ積む）
  const ttsWorker = (async () => {
    try {
      for await (const item of translatedQueue) {
        log("TTS", `Paragraph #${item.paragraphIndex} dequeued -> ${item.sentences.length} sentence(s).`);

        for (let sIndex = 0; sIndex < item.sentences.length; sIndex++) {
          const sentence = item.sentences[sIndex];
          const tag = `p${String(item.paragraphIndex).padStart(2, "0")}_s${String(sIndex + 1).padStart(2, "0")}`;

          log("TTS", `[${tag}] Synthesizing: "${sentence}"`);
          const wav = await synthesizeSentence(sentence, ttsOptions, signal);
          log("TTS", `[${tag}] Synthesized (${(wav.size / 1024).toFixed(1)} KB) -> queued for speaker`);

          audioQueue.push({
            tag,
            sentence,
            element: item.sentenceElements[sIndex],
            wav,
          });
        }
      }
      audioQueue.close();
      log("TTS", "All sentences synthesized.");
    } catch (err) {
      audioQueue.fail(err);
      throw err;
    }
  })();

  // ③ 再生ワーカー（TTS合成とは非同期に、メモリ上のWAVを順次再生）
  const playerWorker = (async () => {
    for await (const audio of audioQueue) {
      log("PLAY", `[${audio.tag}] Speaking: "${audio.sentence}"`);
      audio.element.classList.add("speaking");
      try {
        await playWav(audio.wav, signal);
      } finally {
        audio.element.classList.remove("speaking");
      }
      log("PLAY", `[${audio.tag}] Finished speaking.`);
    }
  })();

  await Promise.all([translationWorker, ttsWorker, playerWorker]);
  log("MAIN", "Pipeline completed successfully.");
}

startButton.addEventListener("click", async () => {
  controller = new AbortController();
  const { signal } = controller;
  startButton.disabled = true;
  stopButton.disabled = false;
  outputElement.replaceChildren();
  setStatus("読み上げ中…");

  try {
    const settings = await loadSettings();
    const text = await getSelectedText();
    await runPipeline(text, settings, signal);
    setStatus("読み上げが終わりました。");
  } catch (err) {
    if (signal.aborted && err === signal.reason) {
      // 停止ボタンによる中断。エラーではないので停止として表示する。
      log("MAIN", "Stopped by user.");
      setStatus("停止しました。");
    } else {
      // 残りのワーカーの通信と再生を止めてから、エラーを表示する。
      controller.abort(err);
      console.error("[ERROR] Pipeline aborted (no fallback):", err);
      setStatus(`エラー: ${err.message}`, true);
    }
  } finally {
    controller = null;
    startButton.disabled = false;
    stopButton.disabled = true;
  }
});

stopButton.addEventListener("click", () => {
  controller.abort(new DOMException("Stopped by user", "AbortError"));
});
