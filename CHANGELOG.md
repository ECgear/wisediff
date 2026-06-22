# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-22

### Added
- **Character-encoding auto-detection on file load.** Files are decoded by detecting BOM,
  ISO-2022-JP escape sequences, UTF-8 validity, then scoring Shift_JIS / EUC-JP candidates,
  so CSV and text saved in Japanese legacy encodings no longer turn into mojibake. UTF-8,
  UTF-8 (BOM), Shift_JIS, EUC-JP, ISO-2022-JP and UTF-16 LE/BE are handled; falls back to UTF-8.
- **Regex quick reference.** Checking the regex option reveals a cheat sheet of common tokens
  with short descriptions; click a token to insert it into the search box.
- **Large-input safeguard.** Very large inputs (>10,000 lines or >1,000,000 chars) pause
  auto-compare and show a one-click **Compare** plus a note that everything runs in the browser
  (no server) and that splitting into smaller chunks is faster — so huge pastes never freeze the page.
- **Embed mode (`?embed=1`).** Hides the brand and footer and reports content height to the
  parent via `postMessage`, for embedding the tool in a host page (used on make-good-life.com).
- **Jump to differences.** Prev/Next buttons with a counter move between changed blocks,
  scrolling each to the center of the result and highlighting the current one; the result area
  is now an internal scroll pane so navigation works both standalone and embedded.
- **Search & replace always visible.** The find/replace bar is shown by default instead of being
  hidden behind Ctrl/⌘+F (which now just focuses the search field); the toggle/close controls were removed.

### Changed
- "Copy result" is now two buttons — **Copy A** and **Copy B** — each copying only that side's text.
- **Comparison is always live.** The manual "Compare" button and the "Live" toggle were removed;
  diffs update as you type (Ctrl/⌘+Enter still forces a compare). See the large-input safeguard above
  for how very large inputs are handled.

### Removed
- The "Save on this device" / "Clear saved" buttons. Text-persistence code remains but is off by
  default for privacy; **Clear** now also clears any previously saved text.

## [0.1.0] - 2026-06-20

### Added
- First release. A privacy-first, client-side text diff tool — nothing is uploaded;
  all comparison runs in the browser and works offline (`file://`).
- Two-pane comparison with live (debounced) compare and a manual compare button.
- Three diff granularities: line (with inline character highlighting on changed lines),
  word, and character. Character mode uses diff-match-patch semantic cleanup, which reads
  well for Japanese text.
- **Clear newline/whitespace differences**: invisible characters can be shown as glyphs
  (· space, → tab, ¶ newline, ␣ no-break space), whitespace-only changes are always
  strongly highlighted even when glyphs are off, and line-ending (LF/CRLF/CR/mixed) and
  final-newline mismatches are surfaced as badges.
- Search, replace, and regular-expression support (with flags, invalid-pattern detection,
  and `$1` backreferences), scoped to pane A, B, or both, with match highlighting.
- Ignore options (leading/trailing whitespace, case), side-by-side and inline (unified)
  views, light/dark themes, three color schemes (default, green, mono), synchronized
  scrolling, line numbers, diff statistics, swap/clear, copy result, save result as HTML,
  local file loading via drag-and-drop or picker (read in-browser, never uploaded), and
  optional local persistence.
- Japanese (default) and English UI.
- No-network guarantee enforced by a `connect-src 'none'` Content-Security-Policy.
- Offline single-file build (`npm run build` → `dist/index.html`), zero runtime dependencies;
  diff libraries are vendored (jsdiff BSD-3-Clause, diff-match-patch-es Apache-2.0).

[Unreleased]: https://github.com/ECgear/wisediff/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ECgear/wisediff/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ECgear/wisediff/releases/tag/v0.1.0
