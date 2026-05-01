# Security advisories — known unfixed

## postcss XSS via stringify (GHSA-qx2v-qp2m-jg93)

- **Severity:** Moderate
- **Status:** Unfixed in any stable Next.js 16.x release as of 2026-05-01.
  Fix lands in postcss 8.5.10, currently only bundled in
  next@16.3.0-canary.6.
- **Exploitability in Wobbleboard:** None known. The CVE requires an
  attacker-controlled string to reach postcss's stringify path.
  Wobbleboard does not accept user-submitted CSS, does not server-render
  attacker-controlled CSS, and has no build pipeline that processes
  untrusted CSS input.
- **Plan:** Bump to Next.js 16.3.0 once stable. Recheck `npm audit` after
  every Next.js release until resolved.
- **Last reviewed:** 2026-05-01
