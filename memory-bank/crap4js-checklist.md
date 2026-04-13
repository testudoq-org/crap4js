# crap4js — Fidelity Checklist

Use this to verify the port is faithful to Uncle Bob's CRAP metric
as implemented in https://github.com/unclebob/crap4clj.
Tick each box before shipping. Items marked [v2] are known gaps deferred to the next release.

---

## Formula

- [x] `CRAP(fn) = CC² × (1 - coverage)³ + CC`
- [x] CC = 1 base + 1 per decision point
- [x] Coverage is a fraction (0.0–1.0), not a percentage
- [x] A function with 100% coverage scores exactly its CC
- [x] A function with 0% coverage scores CC² + CC
- [x] Null coverage (no data) is reported as N/A, not 0%

---

## Cyclomatic complexity — must count

- [x] `if` / `else if` (`IfStatement`)
- [x] Ternary `x ? y : z` (`ConditionalExpression`)
- [x] `&&` (`LogicalExpression`, operator `&&`)
- [x] `||` (`LogicalExpression`, operator `||`)
- [x] `??` nullish coalescing (`LogicalExpression`, operator `??`)
- [x] `||=` logical assignment (`AssignmentExpression`, operator `||=`)
- [x] `&&=` logical assignment (`AssignmentExpression`, operator `&&=`)
- [x] `??=` logical assignment (`AssignmentExpression`, operator `??=`)
- [x] `for` (`ForStatement`)
- [x] `for...of` (`ForOfStatement`)
- [x] `for await...of` (`ForOfStatement` with `await: true`)
- [x] `for...in` (`ForInStatement`)
- [x] `while` (`WhileStatement`)
- [x] `do...while` (`DoWhileStatement`)
- [x] `switch case` — each case clause, **not** default (`SwitchCase` where `test !== null`)
- [x] `catch` clause (`CatchClause`)

---

## Cyclomatic complexity — must NOT count

- [x] `?.` optional chaining (`OptionalMemberExpression`, `OptionalCallExpression`)
- [x] Default parameter values — `function f(x = 0)` (`AssignmentPattern` in params)
- [x] Destructuring defaults — `const { x = 0 } = obj` (`AssignmentPattern` in destructuring)
- [x] `default` clause in switch (`SwitchCase` where `test === null`)
- [x] `finally` block (`TryStatement.finalizer`)
- [x] `yield` / `yield*` (`YieldExpression`)
- [x] Type annotations and TypeScript-specific nodes
- [x] Nested function bodies — stop traversal with `path.skip()` at any nested function node

---

## Function recognition

- [x] `FunctionDeclaration` — named function
- [x] `FunctionExpression` — including `const foo = function() {}`
- [x] `ArrowFunctionExpression` — including `const foo = () => {}`
- [x] `async` variants of all the above — treated identically to non-async
- [x] Generator functions (`node.generator === true`) — treated identically to non-generator
- [x] `ClassMethod` — named `ClassName.methodName`
- [x] `ClassPrivateMethod` — named `ClassName.#methodName`
- [x] `ObjectMethod` — named with the property key
- [x] IIFE — named `<anonymous:lineNumber>`
- [x] Callback argument — named `<anonymous:lineNumber>`

---

## Function naming

- [x] `FunctionDeclaration`: uses `node.id.name`
- [x] Arrow or function expression in `VariableDeclarator`: uses `path.parent.id.name`
- [x] Class method: uses class name from parent `ClassDeclaration`/`ClassExpression`
- [x] Object method: uses property key name
- [x] Anonymous fallback: `<anonymous:startLine>` (includes line number)

---

## Coverage parsing

- [x] Primary source: `{coverageDir}/lcov.info`
- [x] Fallback: per-file HTML if lcov.info absent
- [x] Coverage fraction = covered lines in function range ÷ total instrumented lines in range
- [x] Lines with no `DA:` entry are ignored (not counted as uncovered)
- [x] `DA:` lines with hitCount 0 are counted as not covered
- [x] Absolute paths in `SF:` entries resolved relative to cwd
- [x] Leading `./` stripped from `SF:` paths
- [x] Suffix matching as last-resort path resolution
- [x] Path mismatch warning to stderr
- [x] Warning to stderr if `SF:` paths point to `dist/` or `build/` (source map issue)
- [x] `CRAP4JS_DEBUG_LCOV` env var emits per-file diagnostic to stderr

---

## Reporting

- [x] Sorted descending by CRAP score
- [x] Null-coverage entries sorted last
- [x] Table column widths match crap4clj output (Function 30, File 36, CC 4, Cov% 8, CRAP 8)
- [x] Long names truncated with `…`
- [x] Risk summary line after table
- [x] Filter by file path fragment — OR logic, CLI args

---

## CI behaviour

- [x] Exit 0 if every function scores ≤ 30 (or has null coverage)
- [x] Exit 1 if any function scores > 30

---

## Known divergences from crap4clj (intentional)

| crap4clj | crap4js | Reason |
|---|---|---|
| Character-level parser | Babel AST | JS syntax is too complex for regex |
| `.cljc` files | `.mjs` files | Language convention |
| Cloverage HTML | c8/nyc/Vitest LCOV | Different ecosystem defaults |
| Namespace-level grouping | File-level grouping | JS has no namespace concept |
| `clj -M:cov` command | Configurable via `package.json` | No universal JS coverage command |

---

## Known divergences from ESLint's `complexity` rule (intentional)

| Construct | ESLint counts | crap4js counts | Reason |
|---|---|---|---|
| `?.` optional chaining | Yes (+1 per link) | No | Not a testable branch; inflates scores on idiomatic JS |
| Default parameters `f(x = 0)` | Yes (+1) | No | Caller-side decision, not internal branching |
| Destructuring defaults `{ x = 0 }` | Yes (+1) | No | Same as default parameters |
| `||=` / `&&=` / `??=` | Yes (+1) | Yes (+1) | Agreed — shorthand for a branch + assignment |

---

## Known gaps — deferred to v2

- [ ] [v2] Class field initialisers not reported as implicit functions
- [ ] [v2] Class static blocks not reported as implicit functions
- [ ] [v2] Callback name inference (`filter callback` rather than `<anonymous:line>`)
