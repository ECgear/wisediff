#!/usr/bin/env node
// preflight.mjs — pre-publish safety gate. Cross-platform, zero dependencies.
//
// Scans the current working directory for:
//   1) dangerous file names (.env, *.pem, *service-account*.json, ...)
//   2) leaked secrets by real key shape (GitHub PAT, OpenAI, Google, AWS, ...)
//   3) git-tracked private dirs (user/, keezon-lite/) that must never be public
//   4) copyleft (GPL/AGPL) dependencies in node_modules (LGPL is allowed)
//
// Exit 0 = clean, 1 = problems found.
// Usage: node scripts/preflight.mjs [--staged]

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STAGED = process.argv.includes('--staged');

// Match real key shapes (length-bound) so documented patterns like "sk-" or
// "ghp_" in scan examples do NOT false-positive.
const SECRET_PATTERNS = [
  { name: 'GitHub PAT (ghp_)',        re: /ghp_[A-Za-z0-9]{30,}/ },
  { name: 'GitHub OAuth (gho_)',      re: /gho_[A-Za-z0-9]{30,}/ },
  { name: 'GitHub token (ghs/ghu/ghr_)', re: /gh[sur]_[A-Za-z0-9]{30,}/ },
  { name: 'OpenAI key (sk-)',         re: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: 'Google API key (AIza)',    re: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: 'AWS access key (AKIA)',    re: /AKIA[0-9A-Z]{16}/ },
  { name: 'Slack token (xox)',        re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Private key block',        re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
];

const DANGEROUS_NAME = /(?:^\.env(?:\..+)?$|.*\.env$|.*secret.*|.*credential.*|.*token.*|.*service[-_.]?account.*\.json$|.*\.pem$|.*\.p12$|.*\.pfx$|.*\.key$)/i;
const NAME_ALLOW = new Set(['.env.example', 'gitignore.node']); // templates / examples

const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);
// Files that legitimately document secret PATTERNS — skip content scan to avoid self-match.
const SKIP_CONTENT = new Set(['preflight.mjs', 'CLAUDE.md', 'COMPLIANCE.md']);
const PRIVATE_DIRS = ['user', 'keezon-lite'];

const problems = [];

function rel(f) { return path.relative(ROOT, f) || path.basename(f); }

function listFiles() {
  if (STAGED) {
    try {
      const out = execSync('git diff --cached --name-only --diff-filter=ACM', { cwd: ROOT, encoding: 'utf8' });
      return out.split('\n').map(s => s.trim()).filter(Boolean)
        .map(f => path.join(ROOT, f)).filter(existsSync);
    } catch { return []; }
  }
  const acc = [];
  (function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.DS_Store') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!EXCLUDE_DIRS.has(e.name)) walk(full); }
      else if (e.isFile()) acc.push(full);
    }
  })(ROOT);
  return acc;
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

const files = listFiles();

// 1) dangerous file names
for (const f of files) {
  const base = path.basename(f);
  if (NAME_ALLOW.has(base)) continue;
  if (DANGEROUS_NAME.test(base)) problems.push(`dangerous file name: ${rel(f)}`);
}

// 2) secret content (length-bound shapes)
for (const f of files) {
  if (SKIP_CONTENT.has(path.basename(f))) continue;
  let buf;
  try { buf = readFileSync(f); } catch { continue; }
  if (looksBinary(buf)) continue;
  const text = buf.toString('utf8');
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(text)) problems.push(`possible ${name} in ${rel(f)}`);
  }
}

// 3) git-tracked private dirs (must never be published)
for (const d of PRIVATE_DIRS) {
  if (!existsSync(path.join(ROOT, d))) continue;
  try {
    const tracked = execSync(`git ls-files "${d}"`, { cwd: ROOT, encoding: 'utf8' }).trim();
    if (tracked) problems.push(`private dir is git-tracked (would be published): ${d}/`);
  } catch { /* ROOT not a git repo — nothing tracked */ }
}

// 4) copyleft dependencies (GPL/AGPL). LGPL is allowed (dynamic-link/npm dep).
const nm = path.join(ROOT, 'node_modules');
if (existsSync(nm)) {
  const readPkg = p => { try { return JSON.parse(readFileSync(path.join(p, 'package.json'), 'utf8')); } catch { return null; } };
  (function scan(dir) {
    let names;
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      if (name === '.bin') continue;
      const full = path.join(dir, name);
      let st; try { st = statSync(full); } catch { continue; }
      if (!st.isDirectory()) continue;
      if (name.startsWith('@')) { scan(full); continue; }
      const pkg = readPkg(full);
      if (pkg && pkg.name) {
        const lic = String(pkg.license || (pkg.licenses && JSON.stringify(pkg.licenses)) || '');
        if (/(?:^|[^L])GPL|AGPL/i.test(lic)) problems.push(`copyleft dependency: ${pkg.name} (${lic})`);
      }
      scan(path.join(full, 'node_modules'));
    }
  })(nm);
}

// report
if (problems.length) {
  console.error(`\n✖ preflight: ${problems.length} issue(s) found\n`);
  for (const p of problems) console.error('  - ' + p);
  console.error(`\nResolve the above before committing/publishing.`);
  console.error(`(Pattern-documenting files are skipped: ${[...SKIP_CONTENT].join(', ')})\n`);
  process.exit(1);
}
console.log(`✓ preflight: clean (${files.length} file(s) scanned${STAGED ? ', staged only' : ''})`);
process.exit(0);
