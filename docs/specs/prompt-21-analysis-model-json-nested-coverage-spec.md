# Prompt 21 — Analysis Model, JSON Output, and Nested Coverage Policy

**Branch:** `prompt-21-analysis-model-json-nested-coverag`
**Depends on:** Performance work already landed (profiler, single-pass AST, path index, binary-search coverage)

> **Naming note:** Prompt 20 P2 defined its own Option A (inclusive range) and Option B (innermost-wins). This branch adopts **innermost-wins** and retires the Prompt 20 naming. The behaviour is now fixed and tested; there is no remaining choice.

---

## 1. Goal

Close the remaining gaps after the performance work:

1. Make nested-function coverage semantics explicit and switch to **innermost-wins** (exclusive ranges).
2. Finish the analysis model so renderers are pure.
3. Upgrade JSON output to a versioned, top-level schema with a summary.
4. Keep the existing profiler and do not re-open performance work.

**Out of scope:** incremental caching, worker threads, AST micro-optimisations, decision-point metadata (`decisions`), CRAP formula or threshold changes.

Success:

- Existing tests pass (or are updated only where nested coverage deliberately changes a score).
- New nested-coverage and JSON tests pass.
- Non-nested CRAP scores are identical to the pre-branch baseline.
- `CRAP4JS_PROFILE=1` still shows analysis in the low hundreds of milliseconds.

---

## 2. Non-goals

- Incremental / content-hash caching
- Worker threads / parallel file analysis
- Changes to the CRAP formula or risk thresholds
- Weakening of command or path security guards
- Raising timeouts or memory limits
- New dependencies
- Decision-point metadata (`decisions` field) — deferred to a future branch

---

## 3. Nested coverage policy (fixed: innermost-wins)

**Chosen policy:** An instrumented line belongs to the **innermost** function whose range contains it. Parent and nested functions therefore have **disjoint** instrumented-line sets.

Rationale:

- CC isolation already works via the single-pass stack; coverage must match it.
- Inclusive ranges (the previous behaviour) double-count nested lines in the parent, which inflates the parent's coverage fraction and can mask under-tested inner bodies.
- Innermost-wins produces one canonical owner per line, which is simpler to reason about and matches how developers think about "which function is this test covering?".

Consequences:

- A parent whose only instrumented lines live inside nested functions will report `instrumented: 0` and `percentage: null` for coverage, and `crap: null`.
- Fixtures that contain nesting **will** see parent CRAP scores change. Update those expectations deliberately and record the change in the PR description.
- Fixtures without nesting are unaffected.

Documentation:

- Add a short code comment above the ownership helper in `src/core.mjs`.
- Add a "Nested functions" subsection to `README.md` stating the innermost-wins rule.

---

## 4. Analysis model (target shape)

Every function entry produced by the analysis layer:

```js
{
  id: string,                    // stable: `${file}:${startLine}:${name}`
  name: string,
  file: string,
  startLine: number,
  endLine: number,
  cc: number,
  coverage: {
    covered: number,
    instrumented: number,
    percentage: number | null    // null when instrumented === 0
  },
  crap: number | null,
  risk: 'low' | 'moderate' | 'high' | null
}
```

Rules:

- Analysis produces this model once in `analyzeFile()`.
- Renderers (text, markdown, html, json) only read the model; they never recompute CC, coverage, CRAP, or risk.
- `id` must be stable across runs for the same source.
- Existing text/markdown/html output must remain byte-compatible for the fields they already show (name, file, cc, cov%, crap, risk).

**Note:** The stable `id`, `coverage` object shape, and `formatJson()` were introduced in Prompt 20 P4. They already exist in the codebase. This branch upgrades the JSON *schema* (see §6) and changes the nested coverage *semantics* (see §3). No fields are added or removed from the model.

---

## 5. Coverage matching algorithm

Implement innermost-wins with a single per-file pre-pass over the sorted function list.

**Algorithm:**

1. After `extractFunctions()` returns the functions for a file, sort them by `startLine` ascending.
2. Build an **ownership map**: for each instrumented line key (from the sorted coverage index), walk the sorted function list and assign the line to the **last** function whose range `[startLine, endLine]` contains it. Because the list is sorted by `startLine`, the last match is the innermost containing function.
3. For each function, count only the lines it owns:
   - `instrumented` = number of owned lines.
   - `covered` = number of owned lines where the LCOV hit count is > 0.
4. `percentage = instrumented === 0 ? null : covered / instrumented`.
5. Compute coverage **once** per function and attach it to the entry.

Complexity: O(F log F + L × depth) per file, where F is the number of functions and L is the number of instrumented lines. In practice F and L are small, and the sorted-function walk terminates early for lines outside any range.

Edge cases to test: nested arrows/methods, three-level nesting, sibling nested functions, parent whose only instrumented lines were inside children, sparse LCOV, empty coverage, and non-nested functions (scores must not change).

---

## 6. JSON output

```
crap4js --format json
```

**Schema (versioned top-level object):**

```json
{
  "version": 1,
  "tool": "crap4js",
  "summary": {
    "functions": 0,
    "high": 0,
    "moderate": 0,
    "low": 0,
    "na": 0
  },
  "functions": []
}
```

Rules:

- `functions` array contains the analysis model entries, sorted descending by CRAP, nulls last (same order as text/markdown/html).
- `summary.functions` = total entry count.
- `summary.high` = entries where `risk === 'high'`.
- `summary.moderate` = entries where `risk === 'moderate'`.
- `summary.low` = entries where `risk === 'low'`.
- `summary.na` = entries where `crap === null` (and therefore `risk === null`).
- No Markdown or HTML strings inside the JSON.
- Machine-readable only; no pretty-print requirement beyond stable key order if easy.

**Migration note:** Prompt 20 P4 added `formatJson()` which returns a raw array. This branch replaces it with the versioned top-level object above. Update `test/crap.test.mjs` and `test/integration.test.mjs` JSON assertions accordingly.

---

## 7. Decision counts — deferred

**This branch does not implement the `decisions` field.**

Rationale: the spec is complete without it, and half-implementing optional metadata creates a worse maintenance burden than shipping it atomically in a future branch.

If re-introduced later, the `decisions` counts must be added simultaneously to:

- `extractFunctions()` in `src/complexity.mjs` (single-pass stack accumulation)
- The analysis model in `src/core.mjs`
- All renderers in `src/crap.mjs`
- All JSON, text, markdown, and html tests

---

## 8. Files to change

| File                          | Work                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/core.mjs`              | Replace inclusive coverage matching with innermost-wins ownership helper; keep profiler and security helpers untouched |
| `src/crap.mjs`              | Upgrade`formatJson` to versioned top-level object with summary counts; keep renderers pure                           |
| `src/cli.mjs`               | No change needed;`--format json` already wired in Prompt 20 P4                                                       |
| `test/core.test.mjs`        | Update the existing nested-coverage test (currently asserts inclusive behaviour); add innermost-wins cases             |
| `test/crap.test.mjs`        | Update JSON assertions for versioned schema                                                                            |
| `test/integration.test.mjs` | Update JSON assertions for versioned schema                                                                            |
| `README.md`                 | Add "Nested functions" subsection; document JSON format; update Known Gaps                                             |
| `docs/benchmarks.md`        | Already notes this branch is completeness, not speed; confirm analysis phases remain cheap                             |

---

## 9. DRY / reuse checklist

- [X] Coverage computed once per function (fixed in Prompt 20 P0)
- [X] `crapScore` / `riskLevel` only in the analysis path
- [X] Single AST traversal for CC
- [X] Path index and coverage index from prior work reused
- [X] JSON summary uses the same risk classification as other formats (upgrade required this branch)

---

## 10. Score stability

- Formula and thresholds unchanged.
- Exit codes unchanged.
- Non-nested fixtures: identical scores.
- Nested fixtures: parent scores will change under innermost-wins. Update expectations in tests and note the semantic clarification in the PR.

---

## 11. Tests

Must cover:

1. Innermost-wins attribution: parent and nested with distinct lines.
2. Three-level nesting.
3. Sibling nested functions.
4. Parent left with no instrumented lines after attribution (percentage/crap/risk all null).
5. Empty / full / zero / sparse coverage.
6. JSON: valid, version 1, correct summary counts, correct sort.
7. CLI `--format json` and exit codes.

Existing tests to update:

- `test/core.test.mjs`: the `describe('Option A nested-function semantics')` block (lines 109–144) asserts inclusive behaviour. Rename the block and change the assertion to verify innermost-wins.
- `test/crap.test.mjs`: JSON format tests (lines 214–265) expect a raw array; update to expect the versioned top-level object.
- `test/integration.test.mjs`: JSON integration test (lines 359–396) expects a raw array; update accordingly.

Keep all other tests green.

---

## 12. Docs

- README: add "Nested functions" subsection under the output/explanation area, stating that each instrumented line is attributed to the innermost containing function.
- README: document `--format json` with the versioned schema shape.
- Known Gaps: drop resolved items; leave class fields / static blocks / anonymous callbacks if still true.
- PR description: state the chosen nested rule, list any score changes on nested fixtures, confirm non-nested stability and untouched security.

---

## 13. Agent constraints

1. Read current `complexity.mjs`, `core.mjs`, `coverage.mjs`, `crap.mjs`, and tests before editing.
2. Smallest diff that meets acceptance.
3. ESM `.mjs`, existing JSDoc style, no TypeScript, no new deps.
4. After changes: `npm test`, `npm run lint`, `npm run crap`, `CRAP4JS_PROFILE=1 npm run crap`.
5. Non-nested score drift is a regression — stop and fix.
6. Nested score changes must be intentional and documented.

---

## 14. Acceptance

- [ ] Innermost nested coverage implemented, commented, documented, tested
- [ ] Analysis model shape unchanged from Prompt 20 P4 (no new fields, no removed fields)
- [ ] `--format json` emits the versioned top-level schema with summary
- [ ] Text / markdown / html unchanged for existing columns (except deliberate nested updates)
- [ ] `decisions` field remains absent (deferred)
- [ ] All tests pass; non-nested scores identical
- [ ] Security code untouched
- [ ] README and Known Gaps updated

---

## 15. Definition of done

Merge when the checklist is complete, the PR notes nested score changes (if any), and `npm test && npm run crap` is green with no unexplained drift on non-nested code.

---

## 16. Implemented fixes (code quality pass)

This section records the fixes applied after the initial branch work was reviewed.

### Phase 1 — DRY fix in `formatJson()`

The JSON summary counts in `src/crap.mjs` were inlining risk thresholds (`entry.crap >= 30`, `entry.crap >= 5`) instead of reusing the existing `riskLevel()` function.

Fix: replaced the inline checks with calls to `riskLevel(entry.crap)`, so the JSON summary uses the same single source of truth as the text/markdown/html renderers.

### Phase 2 — Complexity comment on `assignCoverageOwnership()`

Updated the JSDoc in `src/core.mjs` to state the actual worst-case complexity: **O(F log F + F × L)**. Added a note that the early-termination condition (`lineNo < fn.startLine → break`) makes the inner loop effectively O(depth) for well-nested code in practice.

### Phase 3 — Dead export removal (restored as module-private)

`coverageCounts` and `coverageFraction` in `src/core.mjs` were exported but unused outside of tests in `test/core.test.mjs`. The production pipeline (`analyzeFile`) uses `assignCoverageOwnership` exclusively.

Actions:
- Removed `export` from both functions, making them module-private.
- Restored the functions after a follow-up review determined the original plan intended only to unexport them, not delete them. Added `eslint-disable-next-line no-unused-vars` comments above each to suppress the reintroduced lint error, since these functions are intentionally kept module-private per the plan.
- Removed the `import { coverageCounts, coverageFraction }` line from `test/core.test.mjs`.
- Deleted the entire `describe('P2 indexed coverage')` block (7 tests) that tested dead code.

### Phase 4 — Missing edge-case tests for nested coverage

Added 4 new tests inside `describe('innermost-wins nested-function semantics')` in `test/core.test.mjs`:

1. **Nested arrow function** — `const inner = () => { if (a) {} }`; asserts the `if` line is owned by the arrow, not the parent function.
2. **Nested function inside class method** — `class Foo { method() { function inner() { if (a) {} } } }`; asserts `inner` owns its lines and `Foo.method` owns none.
3. **Sparse LCOV + nesting** — mixed `true`/`false` coverage on two `if` statements inside `inner()`; asserts `outer` instrumented=0 (null percentage) and `inner` instrumented=2, covered=1.
4. **Empty coverage + nesting** — all lines hitCount=0 inside `inner()`; asserts `outer` instrumented=0 (null percentage) and `inner` instrumented=1, covered=0.

### Phase 5 — Non-nested score-stability test

Added `describe('non-nested score stability')` with an explicit test for a single non-nested function (`export function simple(a, b) { return a + b; }`) with full coverage, asserting exact CRAP score = 1.0 and risk = `'low'`. This makes the spec §10 requirement explicit rather than implicit.

### Validation results

- `npm test` — all 122 tests pass.
- `npm run lint` — 0 errors, 20 warnings (exit code 0). The 4 additional warnings introduced by restoring the module-private dead-code functions are: 3 security-plugin warnings inside `coverageCounts()` (`detect-object-injection` × 2, `detect-non-literal-fs-filename` × 1), and 1 `Unused eslint-disable directive` warning on the `coverageFraction` disable comment. These are expected artifacts of keeping intentionally-unused module-private code.
- `npm run crap` — passes, dog-food report generated.
- `npm run dry` — returns `{"candidates": []}` (clean).

### Known Gaps status

The README Known Gaps section was intentionally left unchanged. All three listed items remain true in the current implementation:
- Class field initialisers are not reported as implicit functions.
- Class static blocks are not reported as implicit functions.
- Callback names show as `<anonymous:line>` (future: infer from parent call).

Per spec §12, unresolved items are left in place; no items were resolved by this branch.
