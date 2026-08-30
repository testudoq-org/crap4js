# Prompt 22 — Fix and improve crap4js (test coverage, dead code, and dog-food exit behaviour)

## Context (current master)

crap4js is a working CRAP metric tool for JS/TS. It uses Babel for CC, LCOV for coverage, and produces text/markdown/html/json reports. Dog-fooding via `npm run crap` currently exits 1 because of one high-risk function:

- `coverageCounts` in `src/core.mjs` (CC ≈ 9, 0 % coverage, CRAP 90, risk high)

That function (and the thin wrapper `coverageFraction`) is **dead code**. The live analysis path uses `assignCoverageOwnership` (innermost-wins) instead. The binary-search helpers remain from an earlier design, are marked `/* eslint-disable-next-line no-unused-vars */`, and are never exercised by tests or production code. This is pre-existing tech debt, not a regression introduced by recent test work.

> **Status (2026-08-30):** The dead-code follow-up described in this spec has been completed. `coverageCounts` / `coverageFraction` were removed from `src/core.mjs` (closes #19). `npm run crap` now exits 0 on the project source. The acceptance criteria below that assumed exit 1 are superseded by that cleanup.

## Explicit caveat (record in every PR that touches tests or core, and track as a separate issue)

`npm run crap` returns exit 1 solely because of `coverageCounts` (high CRAP + 0 % coverage). If a CI gate hard-fails on crap’s non-zero exit, that failure predates this change and must be treated as its own tech-debt item. Options:

- delete the unused dead-code functions (original intent of the Phase-3 cleanup referenced in the design history), or
- exclude them from the CRAP report / risk calculation.

Ship the test improvements first. File the `coverageCounts` cleanup as a separate ticket. Do not block the test work on it.

---

### Goals

1. Raise real test coverage on the live path (`assignCoverageOwnership`, nested-function semantics, analysis pipeline) without touching the dead helpers yet.
2. Keep the public API and CLI behaviour unchanged.
3. Document the dead-code situation so future contributors do not treat the exit-1 as a new failure.
4. Prepare a clean follow-up that removes or quarantines `coverageCounts` / `coverageFraction`.

### Non-goals

- Changing the CRAP formula, risk thresholds, or exit-code policy.
- Removing `coverageCounts` in this change set.
- Performance work or new report formats.

---

### Scope of the current change set

**A. Test improvements (primary)**
- Expand `test/core.test.mjs` (and any supporting fixtures) so that:
  - `assignCoverageOwnership` is exercised for:
    - parent/child nesting (disjoint ownership),
    - three-level nesting,
    - sibling nested functions,
    - nested arrows and class methods,
    - sparse and zero-coverage LCOV,
    - empty ownership for a parent that only contains nested functions.
  - `analyzeFile` / full `run({ runCoverage: false, delete: false })` produces correct CRAP/risk values for the above cases.
  - Edge cases already present (profiler, simple non-nested functions) remain green.
- Prefer direct unit tests of the exported helpers over full CLI integration where possible, so coverage is attributed to the right functions.
- Ensure the new tests themselves do not introduce high-CRAP code.

**B. Documentation / PR hygiene**
- In the PR description and any linked issue, include the exact caveat above.
- Add a short note in `docs/` or the existing design notes stating that `coverageCounts` / `coverageFraction` are retained dead code pending a dedicated cleanup ticket.
- Update `CHANGELOG.md` under “Unreleased” or the next beta with a “Tests” section that lists the new nested-coverage cases.

**C. Out of scope for this PR (separate ticket)**
- Delete or rewrite `coverageCounts` / `coverageFraction`.
- Any change that would make `npm run crap` exit 0 while those functions still exist and score ≥ 30.
- CI configuration changes that alter the hard-fail behaviour of the crap gate.

---

### Acceptance criteria

- All existing tests pass.
- New tests cover the nested-ownership scenarios listed above and raise line/branch coverage on `assignCoverageOwnership` and the analysis path.
- `npm test` is green.
- `npm run crap` exits 0 after the dead-code follow-up is complete (issue #19). While the dead helpers still existed, exit 1 was expected and documented; that debt is now resolved.
- No new high-risk functions appear in the dog-food report that are caused by the test changes.
- PR description contains the caveat paragraph verbatim (or a close paraphrase that preserves the “pre-existing / track separately” message).

---

### Follow-up ticket (to be filed immediately after this PR merges)

**Title:** Remove dead `coverageCounts` / `coverageFraction` (or exclude from CRAP)
**Body:**
These helpers are unused after the switch to innermost-wins ownership via `assignCoverageOwnership`. They currently produce the only high-risk entry on the dog-food report and force `npm run crap` to exit 1. Delete them (or, if any external consumer is discovered, move them behind a private symbol and exclude from the report). Once gone, re-run the dog-food report and confirm exit 0 under the current thresholds. Reference this PR and the original Phase-3 design note.

---

### Implementation notes for the implementer

- Prefer pure unit tests that construct small `Map` coverage objects and call `assignCoverageOwnership` + `analyzeFile` directly. Avoid relying on a full Vitest coverage run inside the unit tests.
- Keep the binary-search helpers in place and marked unused until the follow-up ticket; do not “fix” them in this change set.
- If any test needs to import a non-exported helper, export it for testing only (or use the existing `export` already present) rather than duplicating logic.

This keeps the test work cleanly shippable while the known exit-1 is recorded as intentional prior debt.
