# honyaku-yomiage

選択した英文を日本語に翻訳して読み上げる Chrome 拡張。国産生成 AI を使用。

- 翻訳: [PLaMo 3 Translate](https://huggingface.co/pfnet/plamo-3-translate-2b-GGUF)（[llama.cpp](https://github.com/ggml-org/llama.cpp) の `llama-server`）
- 音声合成: [Irodori-TTS](https://huggingface.co/Aratako/Irodori-TTS-v4.1-Small)（[speech.cpp](https://github.com/nyosegawa/speech.cpp) の `speech serve`）

## 仕組み

1. 選択範囲を改行ごとに段落に分割
2. 段落ごとに翻訳、訳文をサイドパネルに表示
3. 訳文を文ごとに分割して音声合成
4. 順に再生、読み上げ中の文をハイライト

- 翻訳・音声合成・再生はキューでつないで非同期に並行
- フォールバックなし。エラー時は全部止めて表示

## サーバー

### speech.cpp のビルド（Linux / Vulkan）

```bash
sudo apt install libvulkan-dev glslc spirv-headers

git clone --recurse-submodules https://github.com/nyosegawa/speech.cpp.git
cd speech.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=ON
cmake --build build --config Release -j$(nproc)
```

### 翻訳サーバー（8000）

```bash
CUDA_VISIBLE_DEVICES=0 \
llama-server -hf pfnet/plamo-3-translate-2b-GGUF:Q4_K_M \
  -c 16384 --port 8000 --alias plamo-3-translate --jinja --no-prefill-assistant \
  --host 0.0.0.0
```

- `--alias` は `plamo-3-translate` 固定（拡張側のモデル名）

### 音声合成サーバー（8080）

```bash
CUDA_VISIBLE_DEVICES=0 \
./speech.cpp/build/speech serve irodori-tts:q8_0 \
      --device Vulkan1 \
      --host 0.0.0.0 \
      --port 8080 \
      --cors-origin chrome-extension://<拡張ID> \
      --add-voice heroine=voices/heroine.voice.gguf \
      --voice heroine \
      --seed 42 \
      --steps 40 \
      --truncation-factor 0.7
```

- `--cors-origin` なしだと拡張からのリクエストは 403 `origin_not_allowed`
- 拡張は `voice` などを送らない。サーバーの指定がそのまま既定値
- `--device` の一覧は `speech devices`
- ボイスファイルなしなら `--add-voice` を外して `--voice none`

### ボイスファイル

- `--voice none` は文ごとに声が少し揺れる → 参照音声で固定

1. `--voice none` のサーバーで `instructions` と `seed` を変えて候補を合成

   ```bash
   curl -o candidate.wav -H 'Content-Type: application/json' \
     -d '{"input":"今日も世界の最新テクノロジーニュースを、わかりやすく楽しくお届けしていきますね。","response_format":"wav","steps":40,"seed":1,"instructions":"アニメのヒロインのような透明感のある声の、大人びた若い女性。明るく、少し落ち着いて話している。"}' \
     http://127.0.0.1:8080/v1/audio/speech
   ```

2. 選んだ WAV からボイスファイルを作成

   ```bash
   ./speech.cpp/build/speech voice irodori-tts:q8_0 candidate.wav voices/heroine.voice.gguf
   ```

- 参照用 WAV は1文。複数文だと `speech serve` が文ごとに合成し、WAV 内で声が変わり得る

## 拡張の読み込み

1. `chrome://extensions` → デベロッパーモード有効
2. 「パッケージ化されていない拡張機能を読み込む」→ このフォルダ
3. 拡張 ID を `--cors-origin` に指定

- 拡張 ID はフォルダの場所で決まる。移動・別 PC で変わる
- コード変更後は拡張を再読み込み

## 接続先の設定

- アイコン右クリック →「オプション」
- URL はポートまで含めて指定

| 項目 | 既定値 |
|---|---|
| 翻訳サーバー（llama-server） | `http://127.0.0.1:8000` |
| 音声合成サーバー（speech serve） | `http://127.0.0.1:8080` |

- 保存先は `chrome.storage.local`（PC ごと）
- 次の「開始」から反映
- 不正な URL、`http://`・`https://` 以外は保存せずエラー

## 使い方

1. アイコンでサイドパネルを開く
2. 英文を選択
3. 「開始」

- 「停止」で翻訳・音声合成・再生をすべて中断
- 改行ごとに段落として翻訳（`<br>`、`<pre>` の改行でも分割）

