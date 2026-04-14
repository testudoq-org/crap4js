# crap4js — Design Document

## Does the `.mjs` Port Actually Serve Uncle Bob's Intent?

Short answer: yes — but JavaScript has more syntactic surface area than Clojure by an order of magnitude, and several of those constructs require an explicit ruling before you write a line of code. This document makes those rulings.

### What the CRAP metric is actually for

Uncle Bob's formulation is blunt: code that is both complex *and* poorly tested is the most dangerous code to change. The formula is:

```
CRAP(fn) = CC² × (1 - coverage)³ + CC
```

Where CC is cyclomatic complexity and coverage is the fraction of the function exercised by tests. The cube on the coverage term is deliberate — it makes low coverage catastrophically expensive. A function with CC 10 and 0% coverage scores 110. The same function at 90% coverage scores 11. At 100% it scores exactly its CC.

The original Clojure implementation reproduces the formula Uncle Bob used in FitNesse, including the decision-point taxonomy (if, when, cond, case, and, or, loop, catch). The JS port needs the same formula with an equivalent taxonomy. The formula itself is trivial to port. The taxonomy is not.

### Why the taxonomy is harder in JavaScript

In Clojure, the decision-point set is small and unambiguous. The language has no operator precedence surprises, no implicit control flow, and no syntax edge cases that affect control flow counting. The crap4clj parser walks character-by-character and gets correct results.

JavaScript has the same logical primitives — branches, loops, short-circuits — but expresses them in far more ways, and several modern additions (optional chaining, nullish coalescing, logical assignment, default parameters, destructuring defaults) create genuine ambiguity about whether they represent testable branches or defensive boilerplate. The rulings below are not arbitrary — each one is argued from the question Uncle Bob cares about: *does this construct require a separate test path?*

The Babel AST approach is the right call. Do not substitute a regex walker.

---

## Decision-Point Taxonomy

### Count these — they create testable execution paths

| Construct | AST node | Notes |
|---|---|---|
| `if` / `else if` | `IfStatement` | +1 per clause |
| Ternary `x ? y : z` | `ConditionalExpression` | +1 |
| `&&` | `LogicalExpression` (operator `&&`) | +1 |
| `\|\|` | `LogicalExpression` (operator `\|\|`) | +1 |
| `??` nullish coalescing | `LogicalExpression` (operator `??`) | +1 — see ruling below |
| `\|\|=` logical assignment | `AssignmentExpression` (operator `\|\|=`) | +1 — shorthand for `x = x \|\| val` |
| `&&=` logical assignment | `AssignmentExpression` (operator `&&=`) | +1 — shorthand for `x = x && val` |
| `??=` logical assignment | `AssignmentExpression` (operator `??=`) | +1 — shorthand for `x = x ?? val` |
| `for` | `ForStatement` | +1 |
| `for...of` | `ForOfStatement` | +1 |
| `for await...of` | `ForOfStatement` (`await: true`) | +1 — still a loop |
| `for...in` | `ForInStatement` | +1 |
| `while` | `WhileStatement` | +1 |
| `do...while` | `DoWhileStatement` | +1 |
| `switch case` | `SwitchCase` | +1 per case, **not** default |
| `catch` clause | `CatchClause` | +1 |
| Base per function | — | +1 always |

### Do not count these — they do not require separate test paths

| Construct | AST node | Ruling |
|---|---|---|
| `?.` optional chaining | `OptionalMemberExpression` / `OptionalCallExpression` | Suppresses a TypeError, does not branch execution in a way that requires a separate test. Counting it inflates scores on idiomatic modern JS. |
| Default parameters `f(x = 0)` | `AssignmentPattern` in params | A missing argument is a caller-side decision, not a function-internal branch. Not counted by McCabe. |
| Destructuring defaults `{ x = 0 }` | `AssignmentPattern` in destructuring | Same reasoning as default parameters. |
| `default` in switch | `SwitchCase` (`test === null`) | The catch-all path — not an additional independent path. |
| `finally` block | `TryStatement.finalizer` | Always executes regardless of branching. Not a decision point. |
| `yield` / `yield*` | `YieldExpression` | Suspends execution but does not branch. |
| Type annotations (TypeScript) | Various TS-specific nodes | Erased at runtime; no control flow. |
| Nested function bodies | Any function node inside another | Counted separately as their own entry. Use `path.skip()` to stop the outer traversal. |

### Rulings that diverge from ESLint's `complexity` rule

ESLint counts the following — crap4js does not, for the reasons given:

**Optional chaining (`?.`)**: ESLint counts each `?.` as a branch. This produces misleading scores on modern idiomatic code. `user?.profile?.avatar` is not three testable paths — it is one null guard. Exclude it.

**Default parameters**: ESLint counts `function f(x = 0)` as CC = 2. Uncle Bob's metric targets functions that are complex because of *internal* branching logic, not because they have defaults. Exclude it.

**Destructuring defaults**: Same argument. `const { timeout = 5000 } = config` is not a branch you write a test for. Exclude it.

These exclusions produce lower CC scores than ESLint on the same code. That is correct — crap4js is measuring something slightly different from ESLint's generic complexity cap.

---

## JavaScript-Specific Constructs Requiring Special Handling

### Function naming

Clojure functions are always named at the definition site. JS functions frequently are not. The naming strategy, in priority order:

1. `FunctionDeclaration` — use `node.id.name`
2. `const foo = function() {}` — look at `path.parent` (`VariableDeclarator`), use `id.name`
3. `const foo = () => {}` — same, look at parent `VariableDeclarator`
4. `class Foo { bar() {} }` — use `ClassName.methodName`; get class name by walking up to the `ClassDeclaration` or `ClassExpression`
5. `{ method() {} }` inside an object literal — use the property key name
6. `arr.filter(function() {})` or `arr.filter(() => {})` — use `<anonymous:lineNumber>`
7. IIFE `(function() {})()` — `<anonymous:lineNumber>`
8. `async function foo()` / `async () => {}` — treat identically to their non-async equivalents; `async` does not affect CC

### `??` versus `?.` — why one counts and the other does not

`??` (nullish coalescing) is a genuine branch: if the left-hand value is null or undefined, take the right-hand path. Two paths, one decision point. Count it.

`?.` (optional chaining) does not create a new execution path in the McCabe sense — it short-circuits to `undefined` rather than throwing, but the caller receives a single value either way. You do not need a separate test case for "what happens when `user` is null and I call `user?.name`" — the answer is always `undefined`. Do not count it.

### Logical assignment operators (`||=`, `&&=`, `??=`)

These are shorthand for a branch plus an assignment. `foo ||= 1` is `foo = foo || 1`, which would count as a `LogicalExpression`. Count all three. The Babel AST node is `AssignmentExpression` — match on `operator.endsWith('=')` after confirming the base operator is `||`, `&&`, or `??`.

### Generator functions

`function*` generators must be recognised as functions and included in the report. The `node.generator === true` flag identifies them on `FunctionDeclaration` and `FunctionExpression`. `yield` and `yield*` are not branches — do not count them. CC inside a generator is computed identically to a normal function.

### `async`/`await`

`async function foo()` is the same as `function foo()` for CC purposes. `await` expressions are not branches. The naming logic is identical — async does not change how you extract the function name.

### `try/catch/finally`

Count the `catch` clause (+1). Do not count `finally` — it always executes, it is not a decision point. A `try` block with only `finally` (no `catch`) adds nothing to CC.

### Class field initialisers and static blocks

ESLint treats these as implicit functions with their own complexity. For crap4js v1, skip them. A class field initialiser with a complex expression is a real smell, but it is uncommon enough that the added implementation complexity is not worth it for an initial release. Document this as a known gap.

```js
class C {
  // This initialiser's complexity is NOT reported in v1:
  x = a || b || c;

  // This static block's complexity is NOT reported in v1:
  static {
    if (foo) { bar = baz || qux; }
  }
}
```

### Callbacks passed as arguments

```js
arr.filter(x => x > 0)
arr.reduce((acc, x) => { if (x > 0) acc.push(x); return acc; }, [])
```

Both arrow functions are real functions and must appear in the report. The first has CC = 1 and will score 1 (harmless). The second has CC = 2. Name them `<anonymous:lineNumber>`. A future version could infer `filter callback` from the parent `CallExpression.callee`, but that is a nice-to-have — `<anonymous:line>` is sufficient.

### IIFEs

```js
const result = (function() {
  if (x) return 1;
  return 2;
})();
```

The `VariableDeclarator` holds the call result, not the function. Name it `<anonymous:lineNumber>`. The CC still matters and must appear in the report.

---

## Architecture

Four files, mirroring the Clojure source one-to-one.

```
crap4js/
├── src/
│   ├── cli.mjs           # Thin shebang wrapper for bin entry
│   ├── crap.mjs          # Formula + table formatter
│   ├── coverage.mjs      # LCOV parser + HTML fallback
│   ├── complexity.mjs    # AST walker, CC computation, function extraction
│   ├── core.mjs          # CLI orchestrator
│   └── env.mjs           # Centralised env var access (varlock-validated)
├── test/
│   ├── crap.test.mjs
│   ├── coverage.test.mjs
│   ├── complexity.test.mjs
│   └── integration.test.mjs
├── vitest.config.mjs     # Coverage: reporter ['text', 'lcov']
├── package.json
├── README.md
├── SKILL.md              # Claude Code integration (mirrors crap4clj)
├── CHANGELOG.md
└── LICENSE               # CC BY-NC 4.0
```

### Build order

1. `crap.mjs` — pure maths, no I/O, trivial to unit-test
2. `coverage.mjs` — pure string parsing, test against known LCOV fixture strings
3. `complexity.mjs` — AST walking, test against known JS snippets covering every ruling above
4. `core.mjs` — integration, test end-to-end on the repo itself

---

## Dependencies

```json
{
  "type": "module",
  "dependencies": {
    "@babel/parser": "^7.26",
    "@babel/traverse": "^7.26",
    "globby": "^14",
    "commander": "^13"
  }
}
```

No bundler required. Pure ESM throughout. `@babel/traverse` is the only dependency that feels heavy (~2 MB transitive) — but there is no lighter alternative that handles the full JS/TS/JSX syntax surface correctly. Do not substitute a regex walker.

---

## Coverage Parsing

### Source map warning

If a project compiles TypeScript or JSX before running tests, the LCOV file may reference compiled `.js` output (in `dist/` or `build/`) rather than `.ts` source. Line numbers will not match. Detect this: if LCOV `SF:` paths consistently point outside `src/`, warn to stderr and suggest enabling `sourceMap: true` in `tsconfig.json`. Do not silently report wrong coverage — mismatched lines are worse than no coverage data.

### Absolute paths in LCOV

c8 sometimes writes absolute paths in `SF:` entries. If an `SF:` path starts with `/`, resolve it relative to cwd before storing. This is the most common cause of `N/A` when coverage data clearly exists.

### Vitest provider note

As of Vitest 1.x, the default coverage provider is `v8` (not istanbul). Both write `lcov.info` to the coverage directory, but path formats differ slightly. The normalisation logic handles both.

### Parse priority

1. `{coverageDir}/lcov.info` — primary source
2. Per-file HTML in `{coverageDir}/` — fallback only if lcov.info absent

---

## Output Format

Match the Clojure output exactly. Fixed-width columns, sorted descending by CRAP score.

```
CRAP Report
===========
Function                       File                                 CC   Cov%     CRAP
--------------------------------------------------------------------------------------
complexFn                      src/auth/validator.mjs               12   45.0%    130.2
<anonymous:47>                 src/auth/validator.mjs                4    0.0%     20.0
simpleFn                       src/auth/validator.mjs                1  100.0%      1.0
unknownFn                      src/util/helpers.mjs                  3    N/A       N/A
```

Risk thresholds (identical to crap4clj):

| Score | Risk |
|---|---|
| 1–5 | Low |
| 5–30 | Moderate — refactor or add tests |
| 30+ | High — complex and under-tested |

---

## Edge Cases Carried Over from crap4clj

- **Anonymous functions** — `<anonymous:lineNumber>` with file and line
- **LCOV path mismatches** — normalise both source paths and `SF:` paths to relative, strip leading `./`, fall back to suffix matching
- **No coverage data** — show `N/A`; do not treat as 0%
- **TypeScript and JSX** — add `typescript` and `jsx` to Babel parser plugins; they do not change the CC logic
- **`CRAP4JS_DEBUG_LCOV` env var** — emit diagnostic output to stderr, matching crap4clj's `CRAP4CLJ_DEBUG_LCOV` behaviour

---

## Known Gaps (v1)

| Gap | Reason deferred |
|---|---|
| Class field initialisers not reported | Rare in practice; complex to implement as implicit functions |
| Class static blocks not reported | Same |
| Callback name inference (`filter callback`) | `<anonymous:line>` is sufficient for a first release |
