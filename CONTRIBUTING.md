# Contributing to wisediff

Thanks for your interest in contributing! 🙌

## Ways to contribute

- 🐛 Report bugs via [Issues](https://github.com/ECgear/wisediff/issues)
- 💡 Propose features (open an issue first to discuss)
- 📖 Improve docs
- 🔧 Submit pull requests

## Development setup

wisediff is a **dependency-free, build-free static web app**. The diff libraries are
vendored in `src/vendor/` (so the tool runs offline and uploads nothing), and tests,
the dev server, and the single-file bundler are all written with zero npm dependencies.
You need only **Node.js ≥ 20**.

```bash
git clone git@github.com-ecgear:ECgear/wisediff.git
cd wisediff
npm install        # no deps to fetch — just installs the git hooks via "prepare"
npm run dev        # serve at http://localhost:8173/ (edit src/*.js, refresh)
npm test           # run the node:test unit suite (pure logic)
npm run build      # produce the offline single file at dist/index.html
npm run preflight  # secrets / GPL / private-leak safety scan
```

### Project layout

- `index.html` / `styles.css` — app shell (loads ES modules in dev).
- `src/diffEngine.js` — diff model (line/word/char + inline char diff). Pure, tested.
- `src/whitespace.js` — invisible-char rendering, line-ending detection. Pure, tested.
- `src/searchReplace.js` — search / replace / regex. Pure, tested.
- `src/i18n.js` — Japanese (default) / English strings.
- `src/app.js` — DOM wiring (not unit-tested; verify in the browser).
- `src/vendor/` — vendored jsdiff (BSD-3) and diff-match-patch-es (Apache-2.0).
- `scripts/build.mjs` — inlines everything into `dist/index.html`.

Keep logic in the pure modules (with tests) and DOM glue in `src/app.js`. When you change
a vendored library, see [docs/MAINTAINING.md](./docs/MAINTAINING.md).

## Pull request guidelines

1. Fork & create a branch from `main` (`feat/...`, `fix/...`).
2. Keep changes focused; add tests when it makes sense.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`...).
4. Ensure `npm test` passes and CI is green.
5. Update `CHANGELOG.md` under "Unreleased".
6. Open the PR with a clear description of what & why.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating you agree to uphold it.
