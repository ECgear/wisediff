# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Instead, report privately via:
- GitHub Security Advisories: <https://github.com/ECgear/wisediff/security/advisories/new> (preferred)

No public email address is published; please use the private advisory link above.

Note: wisediff runs entirely in the browser and makes no network requests (enforced by a
`connect-src 'none'` Content-Security-Policy), so user text never leaves the device. Security
reports most relevant here include XSS in the rendered diff, CSP bypasses, or supply-chain
concerns in the vendored libraries.

Please include steps to reproduce and the affected version. We aim to acknowledge
reports within a few days and will keep you updated on the fix.

## Supported versions

The latest released version receives security fixes.
