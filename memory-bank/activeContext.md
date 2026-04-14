# crap4js — Active Context

## Current Focus

All prompts (0–14A) implemented. Project is fully functional, dog-fooded, documented, and security-hardened. Ready for publishing.

## Recently Completed

- Prompt 13: Risk column + multi-format output (text/markdown/HTML), `--format` CLI option
- Prompt 13A: Fixed HTML output — full HTML5 document, coverage stdout redirected to stderr for non-text formats
- Prompt 14A: Local security hardening — all 6 items complete:
  - `validateCoverageCmd()`: runner allowlist + shell metacharacter rejection
  - `validateCoverageDir()`: path traversal prevention
  - `escapeHtml()`: single-quote escaping added
  - `eslint-plugin-security` integrated in lint config
  - `SECURITY.md` created with contributor guidelines
  - `npm run audit:security` script added

## Project Files

```
crap4js/
├── src/
│   ├── cli.mjs              # Thin shebang wrapper
│   ├── core.mjs             # CLI orchestrator
│   ├── complexity.mjs       # Babel AST walker, CC computation
│   ├── coverage.mjs         # LCOV parser + HTML fallback
│   ├── crap.mjs             # Formula + table formatter
│   └── env.mjs              # Centralised env var access
├── test/
│   ├── crap.test.mjs        # 27 tests
│   ├── coverage.test.mjs    # 16 tests
│   ├── complexity.test.mjs  # 34 tests
│   └── integration.test.mjs # 10 tests (2 integration + 8 validation)
├── memory-bank/             # Design docs and progress tracking
├── vitest.config.mjs        # Coverage: ['text', 'lcov']
├── eslint.config.mjs        # Flat config, ESM, eslint-plugin-security
├── package.json             # Scripts: test, crap, lint, lint:env, audit:security
├── README.md                # Full setup guide with LCOV config
├── SKILL.md                 # Claude Code integration
├── SECURITY.md              # Contributor security guidelines
├── CHANGELOG.md             # Keep a Changelog format
└── LICENSE                  # MIT
```

## Self-Analysis Results (npm run crap)

- 39 functions analysed across 6 source files
- 0 high risk (CRAP > 30), 11 moderate (CRAP 5–30)
- Highest CRAP: `resolveName` at 26.2 (CC=25, 87.5% coverage)
- All 87 tests passing
- Overall coverage: 92.53%

## Next Steps

1. Prompt 14B: External security (GitHub/CI/Dependabot) — not yet implemented
2. Publish to npm (`npm publish --access public`)
3. Set up CI (GitHub Actions: test + lint + crap check)
4. Future v2: class field initialisers, static blocks, callback name inference

## Architecture Decisions

- `src/cli.mjs` is a thin shebang wrapper that calls `cli()` from `src/core.mjs` — keeps core testable
- Coverage parsing exports internals (`parseLcov`, `normalisePath`, `suffixMatch`) for unit testing
- `run()` function in `core.mjs` is exported separately from CLI for integration testing
- All env var reads go through `src/env.mjs` — enforced by ESLint `no-restricted-syntax` rule
- `vitest.config.mjs` configures LCOV output — required for crap4js to produce real coverage scores
- Coverage commands validated against runner allowlist before `execSync` (security hardening)
- Coverage directory paths checked for traversal attacks
- HTML output uses comprehensive entity escaping including single quotes
