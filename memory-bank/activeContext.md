# crap4js — Active Context

## Current Focus

Hardening test coverage and preparing for public npm release.

## Recently Completed

- All six original build prompts (0–6) implemented
- Core CRAP metric pipeline fully functional
- CLI, LCOV parsing, AST complexity, report formatting all working

## Recently Implemented (Prompts 7–11)

- ✅ `CRAP4JS_DEBUG_LCOV` env var test (mock via `vi.resetModules` + `vi.doMock`)
- ✅ HTML fallback parser tests (5 cases: span parsing, attribute order, LCOV priority, empty/nonexistent dirs)
- ✅ Hardened `dist/`/`build/` detection (regex matches anywhere in path, not just prefix)
- ✅ npm packaging metadata (`files`, `keywords`, `repository`, `engines`, `bugs`, `homepage`, `LICENSE`)
- ✅ publishing workflow documented in `README.md` and `CHANGELOG.md`

## Next Steps

1. Implement improvement prompts 7–10 (test gaps + packaging)
2. Verify all tests pass after changes
3. Consider npm publish workflow and CI setup
4. Future v2: class field initialisers, static blocks, callback name inference

## Architecture Decisions

- `src/cli.mjs` is a thin shebang wrapper that calls `cli()` from `src/core.mjs` — keeps core testable
- Coverage parsing exports internals (`parseLcov`, `normalisePath`, `suffixMatch`) for unit testing
- `run()` function in `core.mjs` is exported separately from CLI for integration testing
- All env var reads go through `src/env.mjs` — enforced by ESLint `no-restricted-syntax` rule
