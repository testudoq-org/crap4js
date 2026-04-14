# crap4js — Active Context

## Current Focus

All prompts (0–12) implemented. Project is fully functional, dog-fooded, and documented. Ready for publishing.

## Recently Completed

- All twelve build/improvement prompts implemented and verified
- Prompt 12: Added `vitest.config.mjs` with LCOV reporter — fixed N/A coverage in dog-food report
- Updated all documentation (README, SKILL.md, CHANGELOG, memory-bank) to reflect current state
- README now includes full LCOV setup guide for Vitest, Jest, c8/nyc

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
│   ├── crap.test.mjs        # 15 tests
│   ├── coverage.test.mjs    # 16 tests
│   ├── complexity.test.mjs  # 34 tests
│   └── integration.test.mjs # 2 tests
├── memory-bank/             # Design docs and progress tracking
├── vitest.config.mjs        # Coverage: ['text', 'lcov']
├── eslint.config.mjs        # Flat config, ESM
├── package.json             # Scripts: test, crap, lint, lint:env
├── README.md                # Full setup guide with LCOV config
├── SKILL.md                 # Claude Code integration
├── CHANGELOG.md             # Keep a Changelog format
└── LICENSE                  # MIT
```

## Self-Analysis Results (npm run crap)

- 26 functions analysed across 6 source files
- 0 high risk (CRAP > 30), 10 moderate (CRAP 5–30)
- Highest CRAP: `resolveName` at 26.2 (CC=25, 87.5% coverage)
- All 67 tests passing

## Next Steps

1. Publish to npm (`npm publish --access public`)
2. Set up CI (GitHub Actions: test + lint + crap check)
3. Future v2: class field initialisers, static blocks, callback name inference

## Architecture Decisions

- `src/cli.mjs` is a thin shebang wrapper that calls `cli()` from `src/core.mjs` — keeps core testable
- Coverage parsing exports internals (`parseLcov`, `normalisePath`, `suffixMatch`) for unit testing
- `run()` function in `core.mjs` is exported separately from CLI for integration testing
- All env var reads go through `src/env.mjs` — enforced by ESLint `no-restricted-syntax` rule
- `vitest.config.mjs` configures LCOV output — required for crap4js to produce real coverage scores
