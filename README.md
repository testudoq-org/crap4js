# crap4js

A JavaScript/TypeScript port of the [CRAP metric](https://github.com/unclebob/crap4clj) — **C**hange **R**isk **A**nti-**P**atterns. Identifies functions that are both complex and poorly tested, the most dangerous code to change. Based on Uncle Bob's formula: `CRAP(fn) = CC² × (1 - coverage)³ + CC`.

## Quick Start

```bash
npm install --save-dev crap4js
```

Add to `package.json`:

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

- **No lcov.info found**: Ensure your coverage tool produces LCOV output. For Vitest: `vitest run --coverage --coverage.reporter=lcov`.
- **N/A coverage**: Coverage data is missing for that file. Run the coverage command before crap4js, or remove `--no-delete`.
- **Path mismatches**: Set `CRAP4JS_DEBUG_LCOV=1` to see per-file path matching diagnostics.
- **TypeScript projects**: Works out of the box — Babel parser handles TS syntax. No config needed.

## Known Gaps (v1)

- Class field initialisers are not reported as implicit functions
- Class static blocks are not reported as implicit functions
- Callback names show as `<anonymous:line>` (future: infer from parent call)

## Credits

Port of [crap4clj](https://github.com/unclebob/crap4clj) by Uncle Bob Martin.
