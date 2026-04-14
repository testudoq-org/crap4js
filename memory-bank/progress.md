# crap4js — Progress

## Prompt Implementation Status

| Prompt | Module | Status | Notes |
|--------|--------|--------|-------|
| 0 — Project scaffold | `package.json`, `.env_schema`, `src/env.mjs`, `.gitignore`, `eslint.config.mjs` | ✅ Complete | `bin` points to `src/cli.mjs` (thin wrapper) instead of `src/core.mjs` — valid design |
| 1 — `crap.mjs` | `src/crap.mjs`, `test/crap.test.mjs` | ✅ Complete | Formula, riskLevel, formatReport all implemented with full test coverage |
| 2 — `coverage.mjs` | `src/coverage.mjs`, `test/coverage.test.mjs` | ✅ Complete | LCOV parsing, suffix matching, dist/ warning, DEBUG_LCOV test, HTML fallback tests all implemented |
| 3 — `complexity.mjs` | `src/complexity.mjs`, `test/complexity.test.mjs` | ✅ Complete | All CC counting rules, naming rules, and isolation tests pass |
| 4 — `core.mjs` | `src/core.mjs`, `src/cli.mjs` | ✅ Complete | CLI orchestrator with Commander, config from package.json, coverage fraction, exit codes |
| 5 — `SKILL.md` | `SKILL.md` | ✅ Complete | Install, configure, run, interpret, CI, troubleshooting |
| 6 — Integration + README | `test/integration.test.mjs`, `README.md` | ✅ Complete | End-to-end temp-dir tests, README with full usage/troubleshooting docs |

## Improvement Prompts Status

| Prompt | Focus | Status |
|--------|-------|--------|
| 7 — DEBUG_LCOV test | `test/coverage.test.mjs` | ✅ Complete | Verified via `vi.resetModules()` + `vi.doMock` |
| 8 — HTML fallback tests | `test/coverage.test.mjs` | ✅ Complete | 5 tests covering span parsing, priority, empty dirs |
| 9 — Harden dist/build detection | `src/coverage.mjs` | ✅ Complete | Regex matches `/dist/` or `/build/` anywhere in path |
| 10 — npm packaging metadata | `package.json` | ✅ Complete | `files`, `keywords`, `repository`, `engines`, `LICENSE` |
| 11 — Dog-food crap4js | `README.md`, `CHANGELOG.md` | ✅ Complete | Dog-food instructions, publishing/dev docs, changelog |
| 12 — Vitest LCOV config | `vitest.config.mjs`, `package.json`, `README.md` | ✅ Complete | Added LCOV reporter so dog-fooding produces real scores |
| 13 — Risk column + multi-format | `src/crap.mjs`, `src/core.mjs`, `test/crap.test.mjs` | ✅ Complete | Risk column (low/moderate/high), `--format text\|markdown\|html` CLI option |
| 13A — Fix HTML output | `src/crap.mjs`, `src/core.mjs`, `test/crap.test.mjs` | ✅ Complete | Full HTML5 document, coverage stdout→stderr for non-text formats |
| 14A — Security hardening (local) | `src/core.mjs`, `src/crap.mjs`, `eslint.config.mjs`, `SECURITY.md` | ✅ Complete | validateCoverageCmd, validateCoverageDir, escapeHtml single-quote, eslint-plugin-security, SECURITY.md, npm audit script |

## What Works

- Full CRAP metric pipeline: parse source → extract functions → compute CC → load coverage → compute CRAP → format report
- CLI with Commander: filters, `--coverage-dir`, `--coverage-cmd`, `--no-delete`
- LCOV parsing with path normalisation, suffix matching, and diagnostic warnings
- Babel AST-based complexity analysis for JS/TS/JSX
- Exit code 1 for CI integration when any function scores > 30
- All 87 tests pass across 4 test files
- Integration tests pass with synthetic temp-dir setup + validation tests
- Dog-fooding works: `npm run crap` runs crap4js against its own `src/` files with real coverage
- `vitest.config.mjs` produces LCOV output for accurate per-function coverage fractions
- Multi-format output: text (default), markdown, HTML (full HTML5 document)
- Security hardening: coverageCmd allowlist, coverageDir traversal prevention, HTML entity escaping
- eslint-plugin-security integrated for static security analysis
- 0 high-risk functions, 11 moderate in self-analysis

## Known Gaps (v1)

- Class field initialisers not reported as implicit functions
- Class static blocks not reported as implicit functions
- Callback names show as `<anonymous:line>` (future: infer from parent call)
- No dedicated CLI-level tests exercising `src/cli.mjs` via `spawnSync`
- No monorepo support for `sourceGlob` root-relative paths
- Prompt 14B (external security — GitHub/CI/Dependabot) not yet implemented
