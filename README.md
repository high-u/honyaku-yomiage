# honyaku-yomiage

Web ページで選択した英文を、国産の生成 AI で日本語に翻訳して読み上げる Chrome 拡張です。

- 翻訳: [PLaMo 3 Translate](https://huggingface.co/pfnet/plamo-3-translate-2b-GGUF)（[llama.cpp](https://github.com/ggml-org/llama.cpp) の `llama-server`）
- 音声合成: [Irodori-TTS](https://huggingface.co/Aratako/Irodori-TTS-v4.1-Small)（[speech.cpp](https://github.com/nyosegawa/speech.cpp) の `speech serve`）

サーバーはどちらも手元の PC で動かします。Chrome は同じ PC でも、Tailscale などで繋がった別の PC でも使えます。

## 仕組み

1. 選択した英文を改行ごとに段落に分ける
2. 段落ごとに翻訳し、訳文をサイドパネルに表示する
3. 訳文を文ごとに分けて音声合成する
4. 順番に再生し、読み上げ中の文をハイライトする

翻訳・音声合成・再生はキューでつないで非同期に並行して進めます。フォールバックはしません。
エラーが起きたら、その時点で全部止めてエラーを表示します。

## 1. サーバーを用意する

### speech.cpp のビルド（Linux / Vulkan）

```bash
sudo apt install libvulkan-dev glslc spirv-headers

git clone --recurse-submodules https://github.com/nyosegawa/speech.cpp.git
cd speech.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=ON
cmake --build build --config Release -j$(nproc)
```

### 翻訳サーバー（ポート 8000）

```bash
llama-server -hf pfnet/plamo-3-translate-2b-GGUF:Q4_K_M \
  -c 16384 --port 8000 --alias plamo-3-translate --jinja --no-prefill-assistant
```

`--alias` は `plamo-3-translate` にしてください。拡張はこの名前でモデルを指定します。

### 音声合成サーバー（ポート 8080）

```bash
./speech.cpp/build/speech serve irodori-tts:q8_0 \
      --port 8080 \
      --cors-origin chrome-extension://<拡張ID> \
      --add-voice heroine=heroine.voice.gguf \
      --voice heroine \
      --seed 42 \
      --steps 40 \
      --truncation-factor 0.7
```

- `--cors-origin` には、拡張を読み込んだときの拡張 ID を指定します（「2. 拡張機能を読み込む」）。
  指定がないと、拡張からのリクエストは 403 `origin_not_allowed` で拒否されます。
- 拡張はリクエストで `voice` などを送らないため、ここで指定した値がそのまま使われます。
  変更したらサーバーを起動し直してください。
- GPU を選ぶ場合は `--device`（例: `--device Vulkan1`）を付けます。`speech devices` で一覧できます。
- ボイスファイル（`heroine.voice.gguf`）の作り方は「ボイスファイル」を参照してください。
  ボイスファイルなしで試すなら、`--add-voice` を外して `--voice none` にします。

### ボイスファイル

`--voice none` は参照音声なしでモデルが声を決めるため、文ごとに声が少し変わることがあります。
気に入った声の WAV からボイスファイルを作って渡すと、声が安定します。

1. `--voice none` のサーバーに、声を言葉で説明する `instructions` と `seed` を変えながら1文ずつ合成させ、
   気に入った WAV を選ぶ

   ```bash
   curl -o candidate.wav -H 'Content-Type: application/json' \
     -d '{"input":"今日も世界の最新テクノロジーニュースを、わかりやすく楽しくお届けしていきますね。","response_format":"wav","steps":40,"seed":1,"instructions":"アニメのヒロインのような透明感のある声の、大人びた若い女性。明るく、少し落ち着いて話している。"}' \
     http://127.0.0.1:8080/v1/audio/speech
   ```

2. その WAV からボイスファイルを作る

   ```bash
   ./speech.cpp/build/speech voice irodori-tts:q8_0 candidate.wav heroine.voice.gguf
   ```

参照用の WAV は1文にしてください。複数の文を渡すと `speech serve` が文ごとに分けて合成するため、
1つの WAV の中で声が変わることがあります。

## 2. 拡張機能を読み込む

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」を押し、このリポジトリのフォルダを選ぶ
4. 表示された拡張 ID を `speech serve` の `--cors-origin` に指定する

拡張 ID は読み込んだフォルダの場所で決まります。フォルダを移動したり、別の PC で読み込んだりすると変わります。

コードを変更したら、`chrome://extensions` で拡張の再読み込みボタンを押してください。

## 3. 接続先を設定する

サーバーを同じ PC で既定のポートのまま動かす場合は、設定は不要です。

1. ツールバーの拡張アイコンを右クリックして「オプション」を開く
2. 各サーバーの URL をポートまで含めて入力し、「保存」を押す

| 項目 | 既定値 |
|---|---|
| 翻訳サーバー（llama-server） | `http://127.0.0.1:8000` |
| 音声合成サーバー（speech serve） | `http://127.0.0.1:8080` |

- 設定はその PC の Chrome（`chrome.storage.local`）に保存されます。
- 保存した値は、次に「開始」を押したときから使われます。
- URL として正しくない値や、`http://`・`https://` で始まらない値は保存せず、エラーを表示します。

## 4. 使う

1. ツールバーの拡張アイコンを押してサイドパネルを開く
2. ページ上で読み上げたい英文を選択する
3. 「開始」を押す

「停止」を押すと、翻訳・音声合成・再生をすべて中断します。

選択範囲は改行ごとに段落として分けて翻訳します（`<br>` や `<pre>` の改行でも分かれます）。

## 別の PC の Chrome から使う

サーバーはこの PC、Chrome は Tailscale などで繋がった別の PC で使う場合です。

1. 両方のサーバーを `--host 0.0.0.0` で起動する（既定では `127.0.0.1` でしか待ち受けないため）。
   同じネットワークの機器からもアクセスできる状態になります。
2. 別の PC で拡張を読み込み、その拡張 ID も `--cors-origin` に追加する（複数指定できます）。

   ```bash
   --cors-origin chrome-extension://<拡張ID_1> \
   --cors-origin chrome-extension://<拡張ID_2>
   ```

3. 別の PC の拡張のオプションで、接続先をサーバーの PC のアドレスにする
   （例: `http://<サーバーのアドレス>:8000` と `http://<サーバーのアドレス>:8080`）。

`speech serve` は `127.0.0.1` 以外で待ち受けると、`--open` の Web ページが使えなくなります。拡張の動作には影響しません。

## エラーが出たとき

- サイドパネルや設定画面に赤字でエラーが表示されます。
- 詳しいログは、サイドパネルを右クリックして「検証」で開く DevTools のコンソールに出ます。
- 音声合成サーバーのポート 8080 は llama-server の既定のポートと同じです。llama.cpp の Web UI を
  `127.0.0.1:8080` で開いたタブが残っていると、speech.cpp に `GET /props` が繰り返し届いて 404 になります。
  そのタブを閉じてください。

## ファイル構成

| ファイル | 内容 |
|---|---|
| `manifest.json` | 拡張の定義（Manifest V3） |
| `background.js` | アイコンのクリックでサイドパネルを開く |
| `sidepanel.html` / `sidepanel.js` | 開始・停止、訳文の表示、翻訳・音声合成・再生の処理 |
| `options.html` / `options.js` | 接続先の設定画面 |
| `lib/settings.js` | 接続先の既定値、読み込み・保存・検証 |
| `lib/translator.js` | llama-server での翻訳 |
| `lib/tts.js` | speech serve での音声合成 |
| `lib/chunker.js` | 段落・文への分割 |
| `lib/queue.js` | 非同期キュー |

ビルドは不要です。素の JavaScript で書いています。
