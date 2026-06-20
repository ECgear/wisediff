# wisediff

> 2つの文章の違いを、**ブラウザの中だけ**で見比べるツール。テキストはどこにも送信されません。

[![CI](https://github.com/ECgear/wisediff/actions/workflows/ci.yml/badge.svg)](https://github.com/ECgear/wisediff/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![No upload](https://img.shields.io/badge/privacy-no%20upload-brightgreen.svg)](./docs/PRIVACY.md)

> 🇬🇧 **English version is at the bottom of this page — jump to [English ↓](#english).**

**言語 / Languages:** [日本語](#日本語) · [English](#english)

🔗 すぐ使う / Use it now: **https://make-good-life.com/tools/diff/**

---

## 日本語

### これは何？

**wisediff（ワイズディフ）** は、左右に貼った2つの文章の **違いを色で示す** 無料ツールです。
有名な「[difff《デュフフ》](https://difff.jp/)」と同じ用途ですが、次の点がちがいます。

- **テキストを送信しません。** すべてあなたのブラウザの中だけで計算します（difff はサーバーに送られます）。インターネットが切れていても動きます。
- **改行や空白だけの違いも、はっきり分かります。** 「見た目は同じなのに何かが違う」を取りこぼしません。
- **行・単語・文字** の3段階で細かさを選べます。日本語の文章どうしの細かい比較も得意です。
- **検索・置換・正規表現** が使えます。貼ったあとに文字を直してから比べ直せます。

### 使い方（いちばん簡単な方法）

1. ブラウザで **https://make-good-life.com/tools/diff/** を開きます。
2. 左の枠（原文 A）と右の枠（変更後 B）に、それぞれ文章を貼り付けます。
3. 違いが自動で色分け表示されます。**緑＝追加された部分**、**赤＝削除された部分** です。

それだけです。インストールも会員登録も要りません。

### インターネットなしで使いたいとき（オフライン版）

ネットにつながっていない環境でも使えます。

1. [Releases ページ](https://github.com/ECgear/wisediff/releases) から `index.html`（単一ファイル）をダウンロードします。
2. そのファイルを **ダブルクリック** すると、ブラウザで開いて、そのまま使えます。

このファイルは1枚で完結していて、外部に一切通信しません。社内の機密文書などを比べるときも安心です。

### 改行・空白の違いがちゃんと分かります（このツールの強み）

「`りんご`」と「`りんご `」（末尾に空白）のように **見た目では気づけない違い** も、はっきり強調表示します。

- **空白記号** をオンにすると、空白は `·`、タブは `→`、改行は `¶` で見えるようになります。
- **空白や改行だけの違い** は、記号オフでも自動で強く色づけされます（見落とし防止）。
- **改行コード（LF / CRLF）** や **末尾の改行の有無** が左右で異なる場合は、警告バッジで知らせます。

### 検索・置換・正規表現

`Ctrl`（Mac は `⌘`）+ `F` で検索バーが開きます。

- **検索**: 入力した文字を A・B どちらか、または両方からハイライトします。
- **置換**: 「置換」で1件、「すべて置換」でまとめて置き換え、その場で比較し直します。
- **正規表現**: 「正規表現」をオンにすると、`\d+` のようなパターンや `$1` の後方参照が使えます。書式が誤っているとその場で知らせます。

### よくある質問

- **元の文章が書き換わったりしませんか？** いいえ。ツールはあなたが貼り付けた文字を読むだけで、ファイルや元データには触れません。
- **貼った文章はどこかに保存・送信されますか？** いいえ。送信は技術的に不可能にしてあります（[プライバシーの仕組み](./docs/PRIVACY.md)）。「この端末に保存」を押したときだけ、あなたのブラウザ内にのみ保存されます。
- **どのブラウザで使えますか？** Chrome / Edge / Safari / Firefox の最新版で動作します。
- **ファイルを読み込めますか？** 枠にファイルをドラッグ＆ドロップするか「ファイル読込」から選べます。読み込みもブラウザ内で完結し、アップロードはしません。

技術的な詳細（オプション一覧・仕組み・ライセンス）は [English](#english) セクションの下、または [docs/](./docs/) を参照してください。

---

## English

> 🇯🇵 日本語のガイドはこのページ上部にあります → [日本語 ↑](#日本語)

### What is it?

**wisediff** is a free tool that compares two texts and **highlights the differences**.
It covers the same need as Japan's well-known [difff](https://difff.jp/), but:

- **It never uploads your text.** Everything is computed inside your browser (difff sends text to a server). It works with no internet connection.
- **Newline- and whitespace-only differences are obvious** — you won't miss "looks identical but something changed".
- **Line / word / character** granularity, with high-quality character diffs (good for Japanese).
- **Search, replace, and regular expressions** are built in.

### Quick start

1. Open **https://make-good-life.com/tools/diff/** in your browser.
2. Paste your original into the left box (A) and the changed text into the right box (B).
3. Differences appear automatically — **green = added**, **red = removed**.

No install, no sign-up.

### Use it offline

1. Download the single `index.html` from the [Releases page](https://github.com/ECgear/wisediff/releases).
2. **Double-click** it — it opens in your browser and just works, with zero network access.

### Clear newline & whitespace diffs (the point of this tool)

Differences you can't see — like a trailing space (`apple` vs `apple `) — are strongly highlighted.
Turn on **Show whitespace** to render space as `·`, tab as `→`, newline as `¶`. Whitespace-only
changes are emphasized even with glyphs off, and line-ending (LF/CRLF) or final-newline mismatches
are flagged with badges.

### Search / Replace / Regex

Press `Ctrl`/`⌘`+`F`. Search highlights matches in A, B, or both. Replace does one or all and
re-diffs immediately. Enable **Regex** for patterns like `\d+` and `$1` backreferences; invalid
patterns are reported inline.

### Options

| Option | Description |
|---|---|
| Granularity (Line / Word / Char) | Line aligns whole lines and highlights changed characters within them; Word and Char diff the text as one stream. |
| View (Side-by-side / Inline) | Two columns, or a single unified `+`/`-` column. |
| Show whitespace | Render space/tab/newline as glyphs. |
| Ignore leading/trailing whitespace | Treat lines that differ only by surrounding whitespace as equal. |
| Ignore case | Treat case-only differences as equal. |
| Sync scroll | Scroll both input panes together. |
| Line numbers | Show/hide line numbers in the result. |
| Theme / Colors | Light/Dark, and Default / Green / Mono (print- and color-blind-friendly) schemes. |

### How it works

For line mode, lines are aligned with [jsdiff](https://github.com/kpdecker/jsdiff), then changed
line pairs are diffed character-by-character with
[diff-match-patch](https://github.com/antfu/diff-match-patch-es) (semantic cleanup) for readable,
Japanese-friendly inline highlights. Word and character modes diff the whole text as a stream.
Everything runs client-side; a `connect-src 'none'` Content-Security-Policy makes network requests
impossible. See [docs/PRIVACY.md](./docs/PRIVACY.md).

### Develop

It's a dependency-free, build-free static app (Node.js ≥ 20 only). See
[CONTRIBUTING.md](./CONTRIBUTING.md). Quick commands: `npm run dev`, `npm test`, `npm run build`.

### License & Credits

[MIT](./LICENSE) © 2026 ECgear.

Bundled libraries (see [NOTICE](./NOTICE)): [jsdiff](https://github.com/kpdecker/jsdiff)
(BSD-3-Clause) and [diff-match-patch-es](https://github.com/antfu/diff-match-patch-es) (Apache-2.0,
a port of Google's diff-match-patch). Inspired by [difff](https://difff.jp/).
