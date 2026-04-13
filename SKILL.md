# crap4js — SKILL

## What It Does

crap4js computes the **CRAP metric** (Change Risk Anti-Patterns) for JavaScript and TypeScript projects. It identifies functions that are both complex and poorly tested — the most dangerous code to change.

Formula: `CRAP(fn) = CC² × (1 - coverage)³ + CC`

## Install

```bash
npm install --save-dev crap4js
```

## Configure

Add to `package.json`:

```json
{
  "scripts": { "crap": "crap4js" },
  "crap": {
    "coverageCommand": "vitest run --coverage",
    "coverageDir": "coverage",
    "sourceGlob": ["src/**/*.{js,mjs,ts,tsx}", "!**/*.test.*"]
  }
}
```

## Run

```bash
npx crap4js                  # all source files
npx crap4js auth ui          # filter to files matching "auth" or "ui"
npm run crap                 # via script
```

## Interpret Output

| Score | Risk     | Meaning |
|-------|----------|---------|
| < 5   | Low      | Safe to change |
| 5–29  | Moderate | Consider adding tests |
| ≥ 30  | High     | Complex and under-tested — refactor or add tests |

Functions with N/A coverage have no coverage data available.

## CI Integration

Exits **1** if any function scores > 30, **0** otherwise. Add to your pipeline:

```yaml
- run: npx crap4js
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No lcov.info | Configure coverage tool to emit LCOV: `--coverage.reporter=lcov` |
| All N/A | Ensure coverage command runs first (default behaviour) |
| Path mismatches | `CRAP4JS_DEBUG_LCOV=1 npx crap4js` for diagnostics |
| TypeScript | Works out of the box — no extra config |
