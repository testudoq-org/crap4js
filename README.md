# crap4js

A JavaScript/TypeScript port of the [CRAP metric](https://github.com/unclebob/crap4clj) — **C**hange **R**isk **A**nalysis and **P**redictions. Identifies functions that are both complex and poorly tested, the most dangerous code to change. Based on Uncle Bob's formula: `CRAP(fn) = CC² × (1 - coverage)³ + CC`.

## Quick Start

```bash
npm install --save-dev crap4js @vitest/coverage-v8
```

Add a `crap` script and config block to `package.json`:

```json
{
  "scripts": {
    "crap": "crap4js"
  },
  "crap": {
    "coverageCommand": "vitest run --coverage",
    "coverageDir": "coverage",
    "sourceGlob": ["src/**/*.{js,mjs,ts,tsx}", "!**/*.test.*", "!**/node_modules/**"]
  }
}
```

Run:

```bash
npx crap4js
# or
npm run crap
# or filter by path fragments:
npx crap4js auth ui
```

## Setup — Coverage Configuration (Important)

crap4js reads coverage data from an **LCOV file** (`coverage/lcov.info`). Most test runners do not produce LCOV output by default — you must configure them to do so.

### Why LCOV?

LCOV is the standard line-level coverage format. It maps every instrumented line to a hit count, which crap4js uses to compute per-function coverage fractions. Without it, every function shows `N/A` for both coverage and CRAP score.

### Vitest

Install the coverage provider and create `vitest.config.mjs`:

```bash
npm install --save-dev @vitest/coverage-v8
```

```js
// vitest.config.mjs
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});
```

`'text'` gives you console output; `'lcov'` writes the `coverage/lcov.info` that crap4js needs. The `reportsDirectory` must match the `coverageDir` in your `package.json` `crap` config block (default: `"coverage"`).

### Jest

```js
// jest.config.js
module.exports = {
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
};
```

### c8 / nyc (Istanbul)

```bash
c8 --reporter=lcov --reporter=text node your-test-runner.js
# or
nyc --reporter=lcov --reporter=text your-test-runner
```

### Other test runners

Any tool that produces a standard `lcov.info` file will work. Set `coverageDir` in your `package.json` `crap` config to the directory containing the file.

## Output

```
CRAP Report
===========
Function                       File                                 CC   Cov%     CRAP
--------------------------------------------------------------------------------------
complexFn                      src/auth/validator.mjs               12   45.0%    36.0
<anonymous:47>                 src/auth/validator.mjs                4    0.0%    20.0
simpleFn                       src/auth/validator.mjs                1  100.0%     1.0
unknownFn                      src/util/helpers.mjs                  3    N/A      N/A

1 functions at high risk, 1 at moderate.
```

## Risk Thresholds

| CRAP Score | Risk    |
|-----------|---------|
| < 5       | Low     |
| 5–29      | Moderate|
| ≥ 30      | High    |

## Decision-Point Taxonomy

### Counted (+1 each)

| Construct | AST Node |
|---|---|
| `if` / `else if` | `IfStatement` |
| Ternary `? :` | `ConditionalExpression` |
| `&&` | `LogicalExpression` |
| `\|\|` | `LogicalExpression` |
| `??` | `LogicalExpression` |
| `\|\|=`, `&&=`, `??=` | `AssignmentExpression` |
| `for`, `for...of`, `for...in` | `ForStatement` / `ForOfStatement` / `ForInStatement` |
| `while`, `do...while` | `WhileStatement` / `DoWhileStatement` |
| `switch case` (not default) | `SwitchCase` |
| `catch` | `CatchClause` |

### Not Counted (diverges from ESLint)

| Construct | Reason |
|---|---|
| `?.` optional chaining | Not a testable branch — always returns undefined or value |
| Default parameters `f(x = 0)` | Caller-side decision, not internal branching |
| Destructuring defaults `{ x = 0 }` | Same as default parameters |

## CI Integration

crap4js exits with code **1** if any function scores > 30, and **0** otherwise. Use in CI:

```yaml
# GitHub Actions
- name: CRAP check
  run: npx crap4js
```

## CLI Options

```
crap4js [filters...]          Filter by file path fragment (OR logic)
  --coverage-dir <dir>        Coverage directory (default: "coverage")
  --coverage-cmd <cmd>        Coverage command (default: from package.json)
  --no-delete                 Skip deleting coverage dir before run
  --help                      Show help
```

## Troubleshooting

- **All scores show N/A**: Your test runner is not producing LCOV output. See [Setup — Coverage Configuration](#setup--coverage-configuration-important) above. This is the most common issue.
- **No lcov.info found**: crap4js looks for `{coverageDir}/lcov.info`. Ensure your coverage reporter list includes `'lcov'`. For Vitest, add `reporter: ['text', 'lcov']` to your coverage config in `vitest.config.mjs`.
- **N/A on specific files**: Coverage data exists but doesn't match those source files. The LCOV `SF:` paths may not align with your source paths. Use `CRAP4JS_DEBUG_LCOV=1 npx crap4js` to see per-file path matching diagnostics.
- **Path mismatches with TypeScript**: If LCOV `SF:` paths point to `dist/` or `build/` instead of source, ensure `sourceMap: true` is set in `tsconfig.json`. crap4js will warn about this automatically.
- **TypeScript projects**: Works out of the box — Babel parser handles TS/TSX syntax. No extra config needed.
- **HTML fallback**: If `lcov.info` is absent, crap4js attempts to parse HTML coverage reports as a fallback. This is less reliable — always prefer LCOV output.

## Publishing to npm

Publish this package once you're ready to share it publicly.

```bash
npm login
npm publish --access public
```

Before publishing, bump the package version as appropriate:

```bash
npm version patch
npm version minor
npm version major
```

## Development

Use these commands while working on the repo:

```bash
npm test              # run all tests
npm run crap          # run crap4js on its own code (dog-food)
npm run lint          # ESLint
npm run lint:env      # varlock env var check
```

## Dog-Fooding

This repo runs crap4js against its own source code. The `vitest.config.mjs` is configured to produce LCOV output, and the `package.json` `crap` config block targets `src/`. Run `npm run crap` to see the report.

## Known Gaps (v1)

- Class field initialisers are not reported as implicit functions
- Class static blocks are not reported as implicit functions
- Callback names show as `<anonymous:line>` (future: infer from parent call)

## Credits

Port of [crap4clj](https://github.com/unclebob/crap4clj) by Uncle Bob Martin.

---

## Coverage Mapping Notes

*Adapted from [crap4clj](https://github.com/unclebob/crap4clj) for the JavaScript ecosystem.*

crap4js uses coverage in this order:

1. `{coverageDir}/lcov.info` — file-accurate line coverage (preferred)
2. Per-file HTML fallback (`{coverageDir}/**/*.html`) — parsed for `<span>` elements with `covered`/`not-covered` classes

LCOV is the reliable option for per-function scoring because it preserves physical source file paths and provides exact line hit counts. HTML fallback is a best-effort mechanism — it may not match all coverage tools' output formats.

If only HTML fallback is available and no lines can be parsed, functions are reported as **N/A** (indeterminate) and a warning is printed to stderr.

Path resolution for LCOV `SF:` entries:

1. Normalise to a relative path from cwd (strip leading `./`, resolve absolute paths)
2. Direct match against known source files
3. Suffix matching — match the last N path segments against each source file

To enable LCOV in your test runner, configure the coverage reporter to include `lcov` output so `coverage/lcov.info` is generated. See [Setup — Coverage Configuration](#setup--coverage-configuration-important) above.

## CRAP Formula

```
CRAP(fn) = CC² × (1 - coverage)³ + CC
```

- **CC** = cyclomatic complexity (decision points + 1)
- **coverage** = fraction of instrumented lines covered by tests (from LCOV)

| Score | Risk |
|-------|------|
| 1–5   | Low — clean code |
| 5–30  | Moderate — refactor or add tests |
| 30+   | High — complex and under-tested |

## What It Counts

Decision points that increase cyclomatic complexity:

- `if` / `else if`
- Ternary `? :`
- `&&`, `||`, `??`
- `||=`, `&&=`, `??=`
- `for`, `for...of`, `for...in`, `for await...of`
- `while`, `do...while`
- Each `case` in `switch` (not `default`)
- `catch`

What it does **not** count (diverges from ESLint):

- `?.` optional chaining — not a testable branch
- Default parameters `f(x = 0)` — caller-side decision
- Destructuring defaults `{ x = 0 }` — same as default parameters

## GitHub Copilot / AI Code Skill

crap4js includes a `SKILL.md` for use as an AI coding assistant skill. Add it to your project's configuration:

```json
{
  "skills": [
    "https://github.com/YOUR_USER/crap4js/blob/master/SKILL.md"
  ]
}
```

Then ask GitHub Copilot or your AI assistant for a "CRAP report" and it will know how to set up and run the tool.

## References

- Original CRAP metric paper by Alberto Savoia (https://www.artima.com/weblogs/viewpost.jsp?thread=210575)
- Cyclomatic Complexity on Wikipedia (https://en.wikipedia.org/wiki/Cyclomatic_complexity)
