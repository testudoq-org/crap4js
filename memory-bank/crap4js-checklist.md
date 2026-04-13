# crap4js — Fidelity Checklist

Use this to verify the port is faithful to Uncle Bob's CRAP metric
as implemented in https://github.com/unclebob/crap4clj.
Tick each box before shipping. Items marked [v2] are known gaps deferred to the next release.

---

## Formula

- [ ] `CRAP(fn) = CC² × (1 - coverage)³ + CC`
- [ ] CC = 1 base + 1 per decision point
- [ ] Coverage is a fraction (0.0–1.0), not a percentage
- [ ] A function with 100% coverage scores exactly its CC
- [ ] A function with 0% coverage scores CC² + CC
- [ ] Null coverage (no data) is reported as N/A, not 0%

---

## Cyclomatic complexity — must count

- [ ] `if` / `else if` (`IfStatement`)
- [ ] Ternary `x ? y : z` (`ConditionalExpression`)
- [ ] `&&` (`LogicalExpression`, operator `&&`)
- [ ] `||` (`LogicalExpression`, operator `||`)
- [ ] `??` nullish coalescing (`LogicalExpression`, operator `??`)
- [ ] `||=` logical assignment (`AssignmentExpression`, operator `||=`)
- [ ] `&&=` logical assignment (`AssignmentExpression`, operator `&&=`)
- [ ] `??=` logical assignment (`AssignmentExpression`, operator `??=`)
- [ ] `for` (`ForStatement`)
- [ ] `for...of` (`ForOfStatement`)
- [ ] `for await...of` (`ForOfStatement` with `await: true`)
- [ ] `for...in` (`ForInStatement`)
- [ ] `while` (`WhileStatement`)
- [ ] `do...while` (`DoWhileStatement`)
- [ ] `switch case` — each case clause, **not** default (`SwitchCase` where `test !== null`)
- [ ] `catch` clause (`CatchClause`)

---

## Cyclomatic complexity — must NOT count

- [ ] `?.` optional chaining (`OptionalMemberExpression`, `OptionalCallExpression`)
- [ ] Default parameter values — `function f(x = 0)` (`AssignmentPattern` in params)
- [ ] Destructuring defaults — `const { x = 0 } = obj` (`AssignmentPattern` in destructuring)
- [ ] `default` clause in switch (`SwitchCase` where `test === null`)
- [ ] `finally` block (`TryStatement.finalizer`)
- [ ] `yield` / `yield*` (`YieldExpression`)
- [ ] Type annotations and TypeScript-specific nodes
- [ ] Nested function bodies — stop traversal with `path.skip()` at any nested function node

---

## Function recognition

- [ ] `FunctionDeclaration` — named function
- [ ] `FunctionExpression` — including `const foo = function() {}`
- [ ] `ArrowFunctionExpression` — including `const foo = () => {}`
- [ ] `async` variants of all the above — treated identically to non-async
- [ ] Generator functions (`node.generator === true`) — treated identically to non-generator
- [ ] `ClassMethod` — named `ClassName.methodName`
- [ ] `ClassPrivateMethod` — named `ClassName.#methodName`
- [ ] `ObjectMethod` — named with the property key
- [ ] IIFE — named `<anonymous:lineNumber>`
- [ ] Callback argument — named `<anonymous:lineNumber>`

---

## Function naming

- [ ] `FunctionDeclaration`: uses `node.id.name`
- [ ] Arrow or function expression in `VariableDeclarator`: uses `path.parent.id.name`
- [ ] Class method: uses class name from parent `ClassDeclaration`/`ClassExpression`
- [ ] Object method: uses property key name
- [ ] Anonymous fallback: `<anonymous:startLine>` (includes line number)

---

## Coverage parsing

- [ ] Primary source: `{coverageDir}/lcov.info`
- [ ] Fallback: per-file HTML if lcov.info absent
- [ ] Coverage fraction = covered lines in function range ÷ total instrumented lines in range
- [ ] Lines with no `DA:` entry are ignored (not counted as uncovered)
- [ ] `DA:` lines with hitCount 0 are counted as not covered
- [ ] Absolute paths in `SF:` entries resolved relative to cwd
- [ ] Leading `./` stripped from `SF:` paths
- [ ] Suffix matching as last-resort path resolution
- [ ] Path mismatch warning to stderr
- [ ] Warning to stderr if `SF:` paths point to `dist/` or `build/` (source map issue)
- [ ] `CRAP4JS_DEBUG_LCOV` env var emits per-file diagnostic to stderr

---

## Reporting

- [ ] Sorted descending by CRAP score
- [ ] Null-coverage entries sorted last
- [ ] Table column widths match crap4clj output (Function 30, File 36, CC 4, Cov% 8, CRAP 8)
- [ ] Long names truncated with `…`
- [ ] Risk summary line after table
- [ ] Filter by file path fragment — OR logic, CLI args

---

## CI behaviour

- [ ] Exit 0 if every function scores ≤ 30 (or has null coverage)
- [ ] Exit 1 if any function scores > 30

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
