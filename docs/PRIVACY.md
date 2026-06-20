---
type: Reference
title: wisediff のプライバシー設計
description: 通信ゼロの保証（CSP connect-src 'none'）・ローカル保存の扱い・検証方法
tags: [privacy, security, csp, offline]
timestamp: 2026-06-20
---

# wisediff のプライバシー設計

wisediff の中心的な約束は **「入力テキストを外部に出さない」** こと。これは運用ポリシーではなく、
技術的に通信を不可能にすることで担保している。

## 通信ゼロの保証（CSP）

`index.html` の先頭に次の Content-Security-Policy を置いている:

```
default-src 'self'; connect-src 'none'; img-src 'self' data:;
style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';
font-src 'self'; base-uri 'none'; form-action 'none'
```

要点:

- **`connect-src 'none'`** — `fetch` / `XMLHttpRequest` / `WebSocket` / `navigator.sendBeacon` を
  すべてブロックする。アプリ自身も、万一注入されたコードも、ネットワークにデータを送れない。
- **外部 CDN・外部フォントを一切読み込まない** — すべて同梱（`'self'`）。だから `file://` で開いても、
  インターネットが切れていても完全に動作する。
- **`form-action 'none'` / `base-uri 'none'`** — フォーム送信や base 改ざんによる持ち出しも防ぐ。

> オフライン単一ファイル版（`dist/index.html`）では CSS と JS が 1 枚に内包されるため
> `script-src`/`style-src` に `'unsafe-inline'` を含むが、**`connect-src 'none'` は変わらず**、
> 外部送信は不可能なまま。

## 保存されるもの・されないもの

- **既定では何も保存しない。** 入力したテキストはメモリ上にあるだけで、リロードで消える。
- **「この端末に保存」を押したときだけ**、テキストはあなたのブラウザの `localStorage`（この端末のみ）
  に保存される。サーバーには送られない。「保存を削除」でいつでも消せる。
- 表示設定（言語・テーマ・粒度など）も `localStorage` に保存されるが、これも端末内のみ。
- **ファイル読み込み**（ドラッグ＆ドロップ／ピッカー）は `FileReader` でブラウザ内で読むだけで、
  アップロードは発生しない。

## 自分で検証する方法

1. ブラウザの開発者ツール → **Network** タブを開く。
2. 文章を貼って比較・検索・置換などを操作する。
3. リクエストが **1件も発生しない** ことを確認できる。
4. さらに、コンソールで `fetch('https://example.com')` を実行すると CSP 違反で拒否される
   （`Refused to connect … connect-src 'none'`）。
5. ネットワークを切断しても、ページはそのまま動く。

## セキュリティ上の関心事

通信を遮断しているため、情報持ち出しの主な経路は塞がれている。報告に値するのは主に、描画される差分内の
XSS、CSP のバイパス、同梱ライブラリのサプライチェーン上の懸念など。報告方法は [SECURITY.md](../SECURITY.md)
を参照。

# Citations

1. MDN — Content-Security-Policy: connect-src — https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/connect-src
