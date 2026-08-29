# Prompt 20 — Performance Enhancements

## Task

Review the current crap4js implementation and document a staged, evidence-based performance improvement plan for the post-coverage analysis path. Produce a specification that guides future implementation work while preserving exact CRAP semantics, CLI behaviour, exit codes, and all existing security checks.

## Objective

1. Profile the current analysis pipeline to identify real bottlenecks before any code changes.
2. Propose a minimal, staged improvement plan starting with instrumentation, then algorithmic changes.
3. Document semantic decisions (especially nested-function coverage semantics) that must be made before refactoring.
4. Forbid premature optimisation patterns: raising timeouts, early worker threads, formula changes, or weakened security guards.

## Codebase assets to reuse

Before implementing any phase, reuse these existing building blocks. Do not rewrite them.

| Asset | Location | Purpose |
|---|---|---|
| `FUNCTION_TYPES` Set | `src/complexity.mjs:20` | P1 single-pass AST: recognises function nodes to push/pop |
| `CC_NODE_TYPES` Set | `src/complexity.mjs:29` | P1 single-pass AST: counts base decision points |
| `NAME_RESOLVERS` map | `src/complexity.mjs:104` | P1 single-pass AST: resolves function names unchanged |
| `COMPLEXITY_HANDLERS` map | `src/complexity.mjs:128` | P1 single-pass AST: counts switch/logical/assignment decision points |
| `ALLOWED_RUNNERS` + `SHELL_META` | `src/core.mjs:19-22` | Security guards — P0–P4 must not touch these |
| `validateCoverageCmd`, `validateCoverageDir` | `src/core.mjs:29-46` | Security guards — P0–P4 must not touch these |
| `formatReport(entries, format)` | `src/crap.mjs:209` | Already supports text/markdown/html; P4 adds JSON |
| `fmtCov`, `fmtCrap`, `fmtRisk`, `riskLevel` | `src/crap.mjs:57-69` | P4 JSON formatter reuses these directly |

## Pre-requisite (DRY fix — no phase credit)

`src/core.mjs` `analyzeFile()` currently calls `coverageFraction()` **twice** per function:

```javascript
coverage: coverageFraction(fileLines, fn.startLine, fn.endLine),
crap: crapScore(fn.cc, coverageFraction(fileLines, fn.startLine, fn.endLine)),
```

This is the single largest DRY violation and a ~2× performance leak on coverage matching.

**Required before P0:**
- Compute `coverageFraction` once per function, store it in a local, and reuse it for both `coverage` and `crapScore`.
- Zero semantic risk. Zero API change.

---

## Requirements

### P0 — Measure first (prerequisite for all other work)

Add an opt-in profiler that times each phase of the analysis pipeline:

- Coverage command execution (`execSync`)
- Coverage load (`loadCoverage`)
- Source discovery (`globby`)
- AST parse + complexity (`extractFunctions`)
- Coverage matching (line-range lookup per function)
- CRAP calculation (`crapScore`)
- Sorting + formatting (`formatReport`)
- Total elapsed time

Controlled by environment variable:

```
CRAP4JS_PROFILE=1
```

Output format (stderr, so it does not pollute stdout report):

```
[PROFILE] coverage command:        210ms
[PROFILE] coverage load:            18ms
[PROFILE] source discovery:          4ms
[PROFILE] AST parse + complexity:   142ms
[PROFILE] coverage matching:        89ms
[PROFILE] CRAP calculation:          1ms
[PROFILE] sorting + formatting:      2ms
[PROFILE] total:                    470ms
```

**Implementation constraints:**

- Add `CRAP4JS_PROFILE` to `src/env.mjs` alongside `CRAP4JS_DEBUG_LCOV`.
- Implement timing as inline wrappers or a tiny closure in `src/core.mjs` (e.g., a `phase(name, fn)` helper). Do **not** create a new module such as `src/profile.mjs`.
- Do not modify the analysis pipeline logic — add timing wrappers around existing function calls.
- Do not emit profiling output to stdout.
- Verify that `CRAP4JS_PROFILE=1 npm run crap` produces identical report output on stdout and identical exit code.

### P1 — Single-pass AST

Replace the current discover-then-re-traverse pattern with one traversal that accumulates complexity for the active function only.

**Current pattern:**

- `extractFunctions()` parses once with Babel and walks the entire AST to discover function nodes.
- For each discovered function, `countCC()` performs a second traversal of that function's body only.
- Nested functions are skipped via `innerPath.skip()`.

**Target pattern (Babel `enter`/`leave`):**

- Single traversal using `@babel/traverse`.
- Maintain a plain array stack of active function contexts.
- On `enter` of a function-like node: push `{ name, startLine, endLine, cc: 1 }` onto the stack. `startLine`/`endLine` come from `node.loc`.
- On `enter` of any other node: if the stack is non-empty, add `nodeComplexity(node)` to the top entry's `cc`.
- On `leave` of a function-like node: pop the completed entry and push it to the results array.
- Nested functions push their own context, so parent `cc` is unaffected.

**Constraints:**

- Preserve the exact `FunctionEntry` shape: `{ name, file, startLine, endLine, cc }`.
- Preserve all naming rules in priority order (declaration id, variable declarator parent id, ClassName.methodName, object property key, anonymous fallback).
- Preserve all CC counting rules: if, ternary, logicals, loops, switch cases (non-default), catch clauses. Optional chaining and default parameters must remain uncounted.
- Nested functions must still be reported as separate entries.
- The existing test suite (`test/complexity.test.mjs`) must continue to pass without modification.
- Do not change the exported API of `complexity.mjs`.

### P2 — Indexed coverage

Pre-process each file's coverage Map so that "how many instrumented / covered lines in [startLine, endLine]?" is answered in near-constant time.

**Current behaviour:**

- `analyzeFile()` reads the source file's coverage Map and iterates line-by-line from `startLine` to `endLine` for every function.
- `coverageFraction()` and `coverageCounts()` perform linear scans of that range.

**Target behaviour:**

- For each source file, sort the coverage Map keys once into an array.
- Use binary search to find the first key `>= startLine`, then walk forward until `> endLine`, accumulating `covered` and `instrumented`.
- This is O(log n + k) where k is the number of instrumented lines in the range.
- Prefix sums are **not** recommended: coverage data is sparse, and prefix sums would require an array up to `maxLineNumber` for every file.

**Semantic decision (recommended default: Option A):**

- **Nested-function lines:** Currently, lines belonging to nested functions are included in the parent function's `[startLine..endLine]` range, inflating the parent's `instrumentedCount`.
  - **Option A (recommended):** Keep current behaviour. Document explicitly that nested lines count toward the parent. Requires no changes to `analyzeFile()`'s call signature and can be implemented independently of P1.
  - Option B: Exclude nested-function line ranges from parent counts. Requires knowing nested function boundaries during coverage matching, which couples P2 to P1.

  **Decision:** Implement Option A for P2. If Option B is desired later, it becomes a follow-up change after P1 stabilises.

**Constraints:**

- Do not change the `coverageFraction` return value for the case where no instrumented lines exist in the range (must remain `null`).
- Preserve the existing `Map<string, Map<number, boolean>>` external contract for `loadCoverage()`.
- Indexing must be done lazily or on-demand, not eagerly at load time, to avoid slowing down projects where `analyzeFile` is never called.

### P3 — Path index

Build a normalised-path Map and a short-suffix index once during `loadCoverage()`.

**Current behaviour:**

- `resolveLcovSource()` normalises paths then walks path suffixes against every known source file for every unmatched LCOV SF entry.
- Suffix matching is O(segments × source files). Acceptable for small projects, noticeable on large monorepos.

**Target behaviour:**

- Build two structures at load time:
  - `normalisedPathMap`: `Map<string, string>` — normalised path → original source file path.
  - `suffixIndex`: `Map<string, string[]>` — last N path segments → list of matching source file paths.
- Resolve unmatched SF entries against the suffix index in O(segments) time.
- Preserve deterministic behaviour when ambiguity exists: pick the shortest match, or warn and skip.

**Constraints:**

- Preserve the existing warning to stderr for unmatched LCOV files.
- Preserve `CRAP4JS_DEBUG_LCOV` diagnostic output format (`[LCOV] raw: ... → normalised: ... → matched: ...`).
- Do not change `loadCoverage()` return type or external behaviour.

### P4 — Clean analysis model + JSON output

Produce a stable internal representation once in the existing `core.mjs` pipeline and render it to multiple formats.

**Architecture note:** `core.mjs` currently handles CLI parsing, config loading, path validation, coverage execution, source discovery, analysis, rendering, file I/O, and exit codes. P4 should not create new modules; instead, reorganise `core.mjs` into clearly named internal sections (validation, orchestration, analysis, rendering, I/O) with comments separating them. The goal is readability, not new files.

**Target internal model:**

```typescript
interface FunctionReportEntry {
  id: string;               // stable identity: file + ':' + startLine + ':' + name (no hash)
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  cc: number;
  coverage: {
    covered: number;
    instrumented: number;
    percentage: number | null;
  };
  crap: number | null;
  risk: 'low' | 'moderate' | 'high' | null;
}
```

**Target changes:**

- `core.mjs` analysis pipeline produces a `FunctionReportEntry[]` array once in `analyzeFile()` / `analyzeSourceFiles()`.
- `crap.mjs` `formatReport()` accepts the array plus a `format` parameter (`'text'`, `'markdown'`, `'html'`, `'json'`).
- Renderers become pure consumers of the model. No re-sorting, no re-querying coverage, no re-calculating CRAP during rendering.
- Add `'json'` as a first-class format alongside `'text'`, `'markdown'`, and `'html'`.

**JSON format:**

```json
[
  {
    "name": "resolveName",
    "file": "src/complexity.mjs",
    "startLine": 12,
    "endLine": 87,
    "cc": 25,
    "coverage": {
      "covered": 66,
      "instrumented": 76,
      "percentage": 86.84
    },
    "crap": 26.2,
    "risk": "moderate"
  }
]
```

**Implementation notes:**

- The JSON formatter should reuse `riskLevel()` and `crapScore()` from `crap.mjs`. Re-implementing logic violates DRY.
- The `coverage` object (`{ covered, instrumented, percentage }`) is computed once in `core.mjs` and attached to each entry before rendering. Text/markdown/html formatters continue to use the existing `entry.coverage` number.
- The `id` field is derived from `file + ':' + startLine + ':' + name`. No hashing required.

**Constraints:**

- Existing formats (text, markdown, html) must produce byte-identical output for the same input.
- JSON output is opt-in via `--format json`; default remains `'text'`.
- The stable `id` field is included in JSON for downstream tooling but does not affect text/markdown/html output.

### P5 — Later (not in scope for this spec)

- Incremental analysis keyed by source-file hash (skip unchanged files).
- Optional "why is this high risk?" breakdown (decision-point counts per function).
- Worker threads only if the profiled single-threaded path is still too slow after P0–P4.

## Expected outcome

1. **Profiler in place:** `CRAP4JS_PROFILE=1` gives per-phase timings with zero overhead when unset.
2. **Faster AST analysis:** Single-pass traversal eliminates redundant per-function re-traversals.
3. **Faster coverage matching:** Sorted-key + binary-search turns linear scans into O(log n + k) queries.
4. **Faster path resolution:** Suffix index turns O(n×m) path matching into O(segments).
5. **Cleaner architecture:** `core.mjs` is reorganised into clearly named sections; JSON output is available.
6. **No regressions:** Existing tests pass, CLI behaviour and exit codes are unchanged, security guards are preserved.

## Implementation strategy

1. **Pre-requisite:** Fix the double `coverageFraction()` call in `analyzeFile()`.
2. **Phase 0:** Implement P0 profiler. Run `CRAP4JS_PROFILE=1 npm run crap` on the crap4js repo itself and on a medium-sized project (≥ 500 functions) to collect baseline numbers.
3. **Phase 1:** Implement P1 single-pass AST. Benchmark against Phase 0 baseline.
4. **Phase 2:** Implement P2 indexed coverage (Option A: keep nested lines in parent). Benchmark.
5. **Phase 3:** Implement P3 path index. Benchmark on a project with deep path nesting.
6. **Phase 4:** Implement P4 clean analysis model + JSON. No performance expectation, but maintainability win.
7. **Do not parallelise or raise timeouts.** If Phase 1–4 profiling still shows unacceptable wall-clock time, record the data and propose a separate P6 worker-thread spec.

## Deliverables

1. **Profiler implementation:** `CRAP4JS_PROFILE` env var in `src/env.mjs`; inline timing wrappers in `src/core.mjs`.
2. **DRY fix:** `analyzeFile()` computes `coverageFraction` once per function.
3. **Single-pass AST:** Refactored `src/complexity.mjs` with one Babel traversal and a function-context stack.
4. **Indexed coverage:** Updated `src/core.mjs` coverage matching using sorted keys + binary search.
5. **Path index:** Updated `src/coverage.mjs` with normalised-path Map and suffix index.
6. **Clean analysis model + JSON:** Reorganised `src/core.mjs` sections; updated `src/crap.mjs` with `'json'` format; `--format json` CLI option.
7. **Regression tests:** Extended existing test files (see table below).
8. **Benchmark report:** Before/after profiling numbers from `CRAP4JS_PROFILE=1` runs.

## Constraints

- Do not change the CRAP formula (`crapScore(cc, coverageFraction)`).
- Do not change risk thresholds (`riskLevel()`).
- Do not weaken the existing shell-command allow-list or path-traversal guards in `src/core.mjs`.
- Do not raise timeouts or memory limits as the primary fix.
- Do not introduce worker threads in this phase.
- Do not modify `src/crap.mjs` risk levels or formatter column widths unless explicitly required by the JSON format addition.
- Do not break any existing test in `test/crap.test.mjs`, `test/coverage.test.mjs`, `test/complexity.test.mjs`, or `test/integration.test.mjs`.
- Do not create new source modules (`src/profile.mjs`, `src/analysis.mjs`, etc.). Keep the codebase small.

## Unstated semantic decisions

| Decision | Current behaviour | Required action |
|---|---|---|
| Nested-function lines in parent coverage | Lines inside nested functions are counted in the parent's `[startLine..endLine]` range, inflating the parent's `instrumentedCount` | Choose Option A for P2 (keep current behaviour); document the choice; add regression test |
| Empty coverage range | `coverageFraction` returns `null` when no DA entries exist in the function range | Preserve; document in coverage index implementation |
| Anonymous function identity | No stable ID beyond `name + file + startLine` | Introduce stable `id` in P4 as `file + ':' + startLine + ':' + name` (no hash) |

## Existing tests and contracts that must not break

- `test/complexity.test.mjs` — CC counting and naming rules.
- `test/coverage.test.mjs` — LCOV parsing, HTML fallback, path normalisation, suffix matching, debug output, dist/build warnings.
- `test/crap.test.mjs` — `crapScore()` formula, `riskLevel()` thresholds, `formatReport()` text/markdown/html output.
- `test/integration.test.mjs` — end-to-end orchestration, exit codes, `--format` options.
- `package.json` scripts: `npm test`, `npm run lint`, `npm run crap`.
- CLI interface: `crap4js [filters...]`, `--coverage-dir`, `--coverage-cmd`, `--no-delete`, `--format`.

## New regression tests required

| Phase | Test file | Action | Purpose |
|---|---|---|---|
| P0 | `test/core.test.mjs` (new) | New | Verifies `CRAP4JS_PROFILE=1` emits timing lines to stderr. Verifies no profiling output when unset. |
| P1 | `test/complexity.test.mjs` | Extended | Paraphrase test: single-pass AST produces identical `FunctionEntry[]` to the current implementation for all existing fixture cases. |
| P2 | `test/core.test.mjs` | Extended | Coverage-index query tests: verifies binary-search returns correct `covered` and `instrumented` counts for arbitrary `[start, end]` ranges. Includes nested-function semantic regression test (Option A). |
| P3 | `test/coverage.test.mjs` | Extended | Verifies suffix index resolves the same paths as the current linear scan for all existing fixture cases. |
| P4 | `test/crap.test.mjs` | Extended | Verifies `--format json` emits valid JSON matching the expected schema, sort order, null handling, and risk values. |
