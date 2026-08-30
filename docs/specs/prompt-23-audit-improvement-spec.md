# Prompt 23 — Audit-Driven Quality Improvements

**Branch:** `prompt-23-audit-improvements`
**Status:** Specification
**Depends on:** Prompts 20, 21, 22 (all complete)

---

## 1. Context

An exhaustive requirements audit was performed against the current `main` branch codebase. The audit mapped ~50 normative requirements from `README.md`, `package.json`, `src/*.mjs`, and `test/*.test.mjs` to concrete code, classifying gaps using ISTQB CTFL definitions:

- **Defect** — code does not match a requirement
- **Delivery failure** — requirement is explicitly promised but absent
- **Understanding gap** — documentation contradicts implementation
- **Observation / Risk** — potential future issue

Three items from that audit are actionable in this branch. The remainder are either documentation-only clarifications, future work items, or already resolved by Prompts 20–22.

---

## 2. Goal

Close the three remaining audit findings with minimal, surgical changes while preserving all existing public API, CLI behaviour, and test contracts.

---

## 3. Non-goals

- Changing the CRAP formula or risk thresholds beyond alignment fixes.
- Adding new CLI options or report formats.
- Modifying coverage matching semantics (innermost-wins is fixed).
- Performance work.

---

## 4. Scope

| Item | Type | Severity | Files touched |
|------|------|----------|---------------|
| R45 | Defect — grammar | Low | `src/crap.mjs` |
| R4 | Understanding gap + potential defect | Medium | `src/core.mjs`, `README.md`, `test/integration.test.mjs` |
| R10 | Delivery failure | High | `src/complexity.mjs`, `test/complexity.test.mjs` |

---

## 5. Item R45 — Risk Summary Grammar

### Finding

`src/crap.mjs:75` produces:
```
1 functions at high risk, 1 at moderate.
```

The word "functions" is ungrammatical when the count is `1`.

### Current code

```js
function riskSummary(sorted) {
  const { highCount, moderateCount } = riskCounts(sorted);
  return `${highCount} functions at high risk, ${moderateCount} at moderate.`;
}
```

### Fix

Add a tiny pluralisation helper and use it for the high-risk count only. The moderate-risk clause intentionally omits the word `"function"` to match existing test fixtures:

```js
function plural(n, singular, plural) {
  return n === 1 ? singular : plural;
}

function riskSummary(sorted) {
  const { highCount, moderateCount } = riskCounts(sorted);
  return `${highCount} ${plural(highCount, 'function', 'functions')} at high risk, ${moderateCount} at moderate.`;
}
```

### Impact

- **Source:** `src/crap.mjs` — 2 lines added, 1 line changed.
- **Tests:** Check `test/crap.test.mjs` for exact-string assertions against `riskSummary()` or formatted output. If present, update expected strings from `"1 functions"` to `"1 function"`. If tests use snapshot-style or partial matching, no change needed.
- **Behaviour:** No functional change. Output text is identical for counts other than `1`.

---

## 6. Item R4 — Risk Threshold Boundary Alignment

### Finding

Three separate rules encode the high-risk boundary, and they are inconsistent:

| Location | Rule | Reference |
|----------|------|-----------|
| `riskLevel()` | `< 5` low, `< 30` moderate, `>= 30` high | `src/crap.mjs:21-25` |
| Exit code | `crap > 30` → exit `1` | `src/core.mjs:408` |
| README (top) | `< 5` Low, `5–29` Moderate, `>= 30` High | `README.md:111-115` |
| README (bottom) | `1–5` Low, `5–30` Moderate, `30+` High | `README.md:280-284` |

**The inconsistency:** A CRAP score of exactly `30` is labelled `"high"` by `riskLevel()`, but does **not** fail CI because the exit check uses `> 30`. The tool says "high risk" but allows the build to pass.

### Decision required

Choose one of two alignment strategies.

#### Option A — Keep `> 30` exit threshold (minimal change, backward compatible)

- No code change.
- Update README to document both thresholds explicitly:
  - Risk label: `>= 30` High
  - CI exit: `> 30` High
- Risk: Users may still be confused by the dual thresholds.

#### Option B — Move exit threshold to `>= 30` (strict CI, behavioural change)

- Change `src/core.mjs:408`:
  ```js
  // Before
  return entries.some(e => e.crap != null && e.crap > 30) ? 1 : 0;
  // After
  return entries.some(e => e.crap != null && e.crap >= 30) ? 1 : 0;
  ```
- Update `README.md:280-284` table to say `>= 30` instead of `30+`.
- Update tests in `test/integration.test.mjs` that assert the exit-code boundary for a function with CRAP = 30.
- Consider bumping the package version (`1.0.1-beta.6` → `1.0.1-beta.7` or next appropriate tag) because this is a CI-contract change.

### Recommendation

**Option B** is preferred. It removes the logical gap where a tool reports `"high"` risk but does not block the build. The re-work is small (one operator, README table unification, 1–2 test updates).

### Impact if Option B chosen

| Artifact | Change |
|----------|--------|
| `src/core.mjs:408` | `> 30` → `>= 30` |
| `README.md:280-284` | `30+` → `>= 30` |
| `test/integration.test.mjs` | Update exit-code assertion for CRAP = 30 |
| `package.json` | Version bump recommended |

---

## 7. Item R10 — Missing `ForAwaitStatement` in CC Counting

### Finding

`README.md:129` and `README.md:294` explicitly list `for await...of` as a counted decision point.

`src/complexity.mjs:29-38` defines `CC_NODE_TYPES`:

```js
const CC_NODE_TYPES = new Set([
  'IfStatement',
  'ConditionalExpression',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'CatchClause',
]);
```

`ForAwaitStatement` is **absent** from the set. However, Babel does not emit a distinct `ForAwaitStatement` node in this version; it emits a `ForOfStatement` node with the boolean flag `await: true`. Because `ForOfStatement` is already present in `CC_NODE_TYPES`, `for await...of` loops are already counted correctly (+1 CC). The README promise is therefore already being kept, but the codebase lacks an explicit assertion that guards against parser-version changes that could alter this behaviour.

### Classification

**Observation / Risk** — the README promise is kept by the existing `ForOfStatement` entry, but there is no explicit test guarding the AST shape. A future Babel upgrade could introduce a distinct `ForAwaitStatement` node type and silently break counting.

### Fix

Add `'ForAwaitStatement'` to `CC_NODE_TYPES` as a **documentary alias** (no runtime effect, since Babel emits `ForOfStatement` with `await: true`), and add an AST-shape assertion test to lock in the current parser behaviour:

```js
const CC_NODE_TYPES = new Set([
  'IfStatement',
  'ConditionalExpression',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForAwaitStatement',   // documentary alias: Babel emits ForOfStatement with await: true
  'WhileStatement',
  'DoWhileStatement',
  'CatchClause',
]);
```

New test in `test/complexity.test.mjs`:

```js
it('for await...of parses as ForOfStatement with await flag', async () => {
  const { parse } = await import('@babel/parser');
  const ast = parse('async function f() { for await (const x of []) {} }');
  const loop = ast.program.body[0].body.body[0];
  expect(loop.type).toBe('ForOfStatement');
  expect(loop.await).toBe(true);
});
```

### Impact

- **Source:** `src/complexity.mjs:29` — one line added (documentary alias, no runtime effect).
- **Tests:** `test/complexity.test.mjs` gets a new AST-shape assertion test proving `for await...of` is parsed as `ForOfStatement` with `await: true`. The existing `for await...of: CC = 2` test already passes and does not need modification.
- **README:** Already correct. No change needed.
- **Behaviour:** No change. `for await...of` already contributes +1 CC via `ForOfStatement`. The alias and test guard against future parser-version regressions.

---

## 8. Summary of Re-Work Required

| Item | Action | Files to touch | Tests affected? | Version bump? |
|------|--------|----------------|-----------------|---------------|
| **R45** | Grammar fix + helper | `src/crap.mjs` | Possibly `test/crap.test.mjs` | No |
| **R4** | Exit threshold `>= 30` (Option B) | `src/core.mjs`, `README.md`, `test/integration.test.mjs` | Yes | Recommended |
| **R10** | Add `ForAwaitStatement` | `src/complexity.mjs`, `test/complexity.test.mjs` | Yes | No |

**Total scope:** 3 files changed in `src/`, 2 test files updated, 1 doc file updated.

---

## 9. Acceptance Criteria

1. `npm test` passes with all green.
2. `npm run lint` passes (exit code `0`).
3. `npm run crap` passes (exit code `0`).
4. Risk summary uses correct singular/plural grammar for counts of `1`.
5. Exit code `1` is returned when any function scores `>= 30`.
6. `for await...of` contributes `+1` to cyclomatic complexity.
7. README risk tables are unified and unambiguous.
8. No new high-risk functions appear in the dog-food report caused by these changes.

---

## 10. Implementation Notes

- **Order of operations:** Fix R10 first (source correctness), then R4 (exit threshold + docs), then R45 (grammar polish). This keeps behaviour-correcting changes together and the cosmetic change last.
- **Test discipline:** For R4, add a dedicated boundary test asserting exit code `1` for CRAP = 30, rather than only modifying an existing ambiguous test. This makes the contract explicit.
- **README sync:** After code changes, run `npm run crap` and confirm the dog-food report still passes. If the tool's own score for any function crosses a threshold due to R10, that is expected and correct — record it in the commit message.
- **Commit message convention:** Reference each audit item explicitly, e.g., `audit(R10): count for await...of in CC`, `audit(R4): align exit threshold to >= 30`, `audit(R45): fix risk summary grammar`.

---

## 12. Test Impact Assessment

This section documents the precise test impact of each proposed source-code change, based on a line-by-line audit of `test/crap.test.mjs`, `test/complexity.test.mjs`, and `test/integration.test.mjs`.

### 12.1 R45 — Risk Summary Grammar

**Proposed change:** Add `plural()` helper in `src/crap.mjs:75` and update `riskSummary()`.

#### Existing tests that will break

Three tests assert the exact string `"1 functions"`:

| Test file | Line | Assertion |
|---|---|---|
| `test/crap.test.mjs` | 151 | `expect(report).toMatch(/1 functions at high risk, 1 at moderate\./);` |
| `test/crap.test.mjs` | 185 | `expect(report).toMatch(/1 functions at high risk, 1 at moderate\./);` |
| `test/crap.test.mjs` | 252 | `expect(report).toMatch(/<p>1 functions at high risk, 1 at moderate\.<\/p>/);` |

All three use `toMatch()` with exact literal substrings. They will fail immediately after the source change if not updated.

#### Assessment

- **Action: MODIFY** all three assertions. Change the expected literal from `"1 functions"` to `"1 function"`.
- **Action: CREATE** a new test in `test/crap.test.mjs` under `describe('formatReport')` that exercises `formatReport` with an entry set producing a **count = 2** for one risk bucket, asserting `"2 functions"` appears. This guards against regressing pluralisation for counts other than `0` or `1`. The existing integration test at `test/integration.test.mjs:169` already covers `"0 functions"`, but count `2` is not tested anywhere.

#### Summary

| Action | Count | Details |
|--------|-------|---------|
| Modify | 3 | Exact-string assertions in `test/crap.test.mjs` |
| Create | 1 | Pluralisation guard for count = 2 |
| Improve | 0 | — |

---

### 12.2 R4 — Risk Threshold Boundary Alignment (Option B)

**Proposed change:** `src/core.mjs:408` — `> 30` → `>= 30`.

#### Existing tests that reference the threshold

| Test file | Line | Current state |
|---|---|---|
| `test/integration.test.mjs` | 287 | Test title: `'returns exit code 1 when a function scores > 30'` |
| `test/integration.test.mjs` | 334 | Comment: `// CRAP = 6² + 6 = 42 → high risk` |
| `test/integration.test.mjs` | 336 | `expect(result.exitCode).toBe(1);` — this will still pass (42 > 30 and 42 >= 30) |

The existing test fixture yields CRAP = 42, which passes under both `> 30` and `>= 30`. There is **no existing test that asserts exit code 1 for a function scoring exactly 30**.

#### Assessment

- **Action: MODIFY** `test/integration.test.mjs:287`. Update the test title from `> 30` to `>= 30` to match the new contract. Also update the comment at line 334 if it references the old threshold.
- **Action: CREATE** a new boundary test. The spec recommends adding one. A fixture with CC = 5 and 0% coverage produces CRAP = 30 exactly (`5² + 5 = 30`). This test should be added to `test/integration.test.mjs` to make the boundary contract explicit. Suggested shape:

```js
it('returns exit code 1 when a function scores >= 30 (boundary)', () => {
  // CC=5, coverage=0% → CRAP = 30 exactly
  // assert exitCode === 1
});
```

- **Action: IMPROVE** (optional). The existing test at line 287 is valuable but only tests a score well above the threshold. The new boundary test makes the contract precise.

#### Summary

| Action | Count | Details |
|--------|-------|---------|
| Modify | 1 | Test title + comment in `test/integration.test.mjs` |
| Create | 1 | Boundary test for CRAP = 30 → exit 1 |
| Improve | 0 | — |

---

### 12.3 R10 — Missing `ForAwaitStatement` in CC Counting

**Actual behaviour:** Babel parses `for await (const x of asyncIterable) {}` as a `ForOfStatement` node with `await: true`. Because `ForOfStatement` is already present in `CC_NODE_TYPES`, the existing test at `test/complexity.test.mjs:123` passes and `for await...of` already contributes +1 CC. There is no functional defect.

**Proposed change:** Add `'ForAwaitStatement'` to `CC_NODE_TYPES` as a **documentary alias** (no runtime effect), and add an AST-shape assertion test to guard against future parser-version changes.

#### Existing tests

| Test file | Line | Assertion |
|---|---|---|
| `test/complexity.test.mjs` | 123–128 | `it('for await...of: CC = 2', ...)` — expects `fns[0].cc` to be `2`; **already passing** |
| `test/complexity.test.mjs` | 130–136 | New AST assertion: `loop.type` is `'ForOfStatement'` and `loop.await` is `true` |

#### Assessment

- **Action: IMPROVE** the existing CC test is insufficient because it does not verify the AST shape. Add a dedicated test that parses `for await...of` and asserts `type === 'ForOfStatement'` and `await === true`.
- **Action: MODIFY** `src/complexity.mjs` to add the documentary alias and comment.
- **Action: CREATE** 0 new CC-behaviour tests needed; the existing `CC = 2` test already covers the behaviour.

#### Summary

| Action | Count | Details |
|--------|-------|---------|
| Modify | 1 | Add documentary alias in `src/complexity.mjs` |
| Create | 1 | AST-shape assertion test in `test/complexity.test.mjs` |
| Improve | 1 | Existing CC test remains; AST test added alongside it |

---

### 12.4 Consolidated Test-Change Matrix

| Item | Source file | Modify existing tests | Create new tests | Improve existing tests |
|------|-------------|----------------------|------------------|------------------------|
| **R45** | `src/crap.mjs` | 3 assertions in `test/crap.test.mjs` (lines 151, 185, 252) | 1 (`formatReport` with count=2) | Add count=2 pluralisation guard |
| **R4** | `src/core.mjs` | 1 test title + comment in `test/integration.test.mjs` (line 287) | 1 boundary test (CRAP=30 → exit 1) | None required |
| **R10** | `src/complexity.mjs` | 1 (add documentary alias) | 1 (AST-shape assertion test) | 1 (existing CC test already covers behaviour) |

**Bottom line:** The re-work is small. R45 requires the most test edits (3 string updates + 1 new test). R4 requires a title update + 1 new boundary test. R10 requires 1 source edit (documentary alias) + 1 new AST assertion test.

---




## 11. Out of Scope

- Any performance optimisation work (covered by Prompt 20).
- Any new report formats or CLI options.
- Changes to the CRAP formula or risk threshold values.
- Modifications to coverage matching semantics.
