/**
 * llama-server (pfnet/plamo-3-translate-2b-GGUF) で英語1段落を日本語に翻訳する。
 * フォールバックは一切行わず、エラー時は即座に例外を投げる。
 */
export async function translateParagraph(englishParagraph, options, signal) {
  const form = options.form ?? "polite";
  const endpoint = `${options.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        {
          role: "system",
          content: `[plamo-translate]\nsource_lang=en\ntarget_lang=ja\nform=${form}`,
        },
        {
          role: "user",
          content: englishParagraph,
        },
      ],
      temperature: 0,
    }),
    signal,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      `Translation API failed (${response.status} ${response.statusText}): ${bodyText}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(
      `Translation API returned empty content: ${JSON.stringify(data)}`
    );
  }

  return content;
}
