const jaSentenceSegmenter = new Intl.Segmenter("ja", { granularity: "sentence" });

/**
 * 英語原文を段落（パラグラフ）単位に分割する。
 */
export function splitIntoParagraphs(text) {
  return text
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * 翻訳された日本語の段落を1文（句点「。」など）単位に分割する。
 */
export function splitIntoJapaneseSentences(paragraph) {
  const sentences = [];
  for (const { segment } of jaSentenceSegmenter.segment(paragraph)) {
    const trimmed = segment.trim();
    if (trimmed.length > 0) {
      sentences.push(trimmed);
    }
  }
  return sentences;
}
