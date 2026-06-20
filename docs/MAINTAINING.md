---
type: Playbook
title: wisediff のメンテナンス手順
description: vendor ライブラリ更新・テスト・ビルド・リリース・make-good-life.com への配備手順
tags: [maintenance, build, release, deploy, vendoring]
timestamp: 2026-06-20
---

# wisediff メンテナンス手順

wisediff は **依存ゼロ・ビルド工程ほぼなし** の静的 Web アプリ。差分ライブラリは `src/vendor/` に
同梱（vendoring）してあり、実行時に npm も外部 CDN も使わない。Node.js ≥ 20 だけで開発・テスト・
ビルドが完結する。

## 日常の開発

```bash
npm run dev    # http://localhost:8173/ で配信（ES モジュールのまま）
npm test       # node:test（純粋ロジック: diffEngine / whitespace / searchReplace）
npm run build  # dist/index.html（オフライン単一ファイル）を生成
npm run preflight  # 機密 / GPL / 非公開漏れ の安全スキャン
```

純粋ロジックは `src/{diffEngine,whitespace,searchReplace}.js` に置きテストする。DOM 配線は
`src/app.js`（ユニットテスト対象外、ブラウザで確認）。

## 同梱ライブラリ（vendor）の更新

`src/vendor/` の2ファイルは jsDelivr の `+esm`（自己完結 ESM・依存をインライン）を取得したもの。

```bash
# 例: jsdiff を更新（バージョンは固定する）
curl -fsSL "https://cdn.jsdelivr.net/npm/diff@<X.Y.Z>/+esm" -o src/vendor/jsdiff.js
curl -fsSL "https://cdn.jsdelivr.net/npm/diff-match-patch-es@<X.Y.Z>/+esm" -o src/vendor/diff-match-patch-es.js
```

更新後は必ず:

1. **帰属ヘッダを先頭に付け直す**（`+esm` はライセンスバナーを削るため）。形式は既存ファイル冒頭の
   `/*! Vendored third-party library — … */` を踏襲し、バージョン・ライセンス・出典 URL を記す。
2. **外部参照が無いことを確認**: `grep -E 'https?:|/npm/' src/vendor/*.js` が `import`/`from` を
   含まないこと（自己完結＝オフライン動作の条件）。
3. **API 互換を確認**: `npm test` が通ること。使っているエクスポート名（jsdiff: `diffLines`,
   `diffWords`, `diffWordsWithSpace`, `diffChars` / dmp: `diffMain`, `diffCleanupSemantic`,
   `DIFF_DELETE`, `DIFF_INSERT`, `DIFF_EQUAL`）が残っているか。
4. **`NOTICE` を更新**: バージョンとライセンスを最新化。
5. **`scripts/build.mjs` のガードに注意**: vendor が `export default …;` を含む場合は wrapVendor が
   除去する。新たな `export` 形式が増えたらビルド時のガード（行頭 `import`/`export` 検出）が落とすので、
   その時は wrapVendor を拡張する。

> ⚠️ ビルドの落とし穴: `dist/index.html` は classic `<script>` にインライン化される。Node 24 の
> `node --check`（`.js`）は ESM 自動判定で `export` 残存を見逃すため、構文確認は **`.cjs` 拡張子**で
> 行うこと（`cp tmp.js tmp.cjs && node --check tmp.cjs`）。build.mjs は行頭 `import`/`export` 残存を
> ガードで弾く。

## リリース

1. `npm test` と `npm run preflight` が green。
2. `package.json` の `version` を SemVer で上げる。
3. `CHANGELOG.md` の Unreleased を新バージョン見出しに移し、日付を入れる。
4. `npm run build` で `dist/index.html` を生成。
5. コミット（Conventional Commits）→ `git tag vX.Y.Z` → push。
6. GitHub Release を作成し、`dist/index.html` を **オフライン版**として添付。

## make-good-life.com（/tools/diff/）への配備

公開サイトは別リポ（KMDRKK アカウント、Astro + Firebase Hosting、git 管理は `site/` のみ）。
**自己完結 HTML を `public/` に置く方式**（既存の `ac` ツールと同じ Pattern A）。

```bash
npm run build   # dist/index.html を生成
cp dist/index.html /Users/xx/Cursor/makegoodlife/site/public/tools/diff/index.html
```

加えて、ツール一覧のカードを「準備中」から公開リンクへ更新する:
`makegoodlife/site/src/pages/tools/index.astro` の「テキスト差分」エントリを `href: null` →
`href: '/tools/diff/'`。

その後（KMDRKK 側のルール）:

- commit は自律実行可。**`git push` はユーザー確認必須**（push → GitHub Actions → Firebase が
  `/tools/diff/` を自動公開）。
- `gh` 操作時は `gh auth switch --user KMDRKK`、remote は KMDRKK の SSH エイリアス。
- `makegoodlife/oss/` は触らない（OSS コードではなく記事下書きの置き場）。
- 内部リンクは絶対パス `/tools/diff/`（サイトは `trailingSlash: 'always'` / `cleanUrls`）。

サイトにヘッダ・フッタ・パンくず・SEO を付けたい場合は Pattern B（`src/pages/tools/diff.astro` で
`BaseLayout` ラップ、既存 `image` ツール方式）に切り替える。

# Citations

1. jsDelivr `+esm` — https://www.jsdelivr.com/documentation#id-esm
2. Keep a Changelog — https://keepachangelog.com/
