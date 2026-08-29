# Prompt 18 — Improve the Crap Report outputting

## Task

Enhance the crap4js tool to generate a dedicated "report-only" block or a separate output file, improving the robustness of CRAPReport.md updates and eliminating fragile console parsing.

## Objective

1. Update crap4js: Modify crap4js to emit a dedicated "report-only" block or a separate output file containing the CRAP report.
2. Improve report extraction: Implement a simpler boundary rule to extract the CRAP report block reliably.
3. Enhance robustness: Make CRAPReport.md updates more robust by reducing dependence on console output parsing.

## Requirements

1. **Boundary rule:** Use a simple boundary rule, such as:
    - Start: line matches a known format marker (`CRAP Report` for text, `## CRAP Report` for markdown, `<!DOCTYPE html>` / `<h2>CRAP Report</h2>` for HTML)
    - End: first line after start matching '% Coverage report from'
    - If no end marker is found after the start, return from start to EOF (used by non-text formats, whose coverage summary goes to stderr)
2. **Report extraction:** Update `extractCrapReportBlock()` to reliably return the full report from the dedicated output file or block.
3. **Compatibility:** Ensure that `npm run crap` alone can generate the report and copy it to CRAPReport.md.

## Expected outcome

1. Robust report updates: CRAPReport.md updates are no longer fragile and dependent on console output parsing.
2. Simplified report extraction: The extractor can simply read a file instead of tailing terminal output.
3. Improved maintainability: The updated crap4js tool is more maintainable and less prone to errors.

## Implementation strategy

1. Investigate current implementation: Review the current implementation of crap4js and the report extraction script.
2. Design and test updates: Design and test the updates to crap4js and the report extraction script.
3. Verify robustness: Verify that the updated implementation is more robust and reliable.

## Deliverables

1. Updated crap4js tool: A modified version of crap4js that emits a dedicated "report-only" block or a separate output file.
2. Updated report extraction script: An updated report extraction script that uses the simpler boundary rule and extracts the report reliably.
3. Test results: Test results verifying the robustness and reliability of the updated implementation.

---

## Implementation Review — 2026-08-29

### Review scope

- `src/core.mjs`
- `src/crap.mjs`
- `src/extract.mjs`
- `test/extract.test.mjs`
- `test/integration.test.mjs`
- `package.json`
- `docs/specs/prompt-18-improvecrapreport-io-spec.md` (this file)

### Current state summary

Prompt 18 is **fully implemented** and **shippable**. All extraction deliverables are in place and verified.

### Completed work

| Item | Evidence | Status |
|---|---|---|
| `extractCrapReportBlock()` implementation | `src/extract.mjs` — pure function exporting `extractCrapReportBlock` with boundary rule | ✅ Done |
| Boundary rule: start matches any format marker, end `'% Coverage report from'` | `src/extract.mjs:6,26` — `START_MARKERS` list (`CRAP Report`, `## CRAP Report`, `<!DOCTYPE html>`, `<h2>CRAP Report</h2>`), scans for `'% Coverage report from'` end; start-to-EOF when no end marker | ✅ Done |
| `--raw-report-file <path>` CLI option | `src/core.mjs:330` — `.option('--raw-report-file <path>', ...)` | ✅ Done |
| `rawReportFile` in `normalizeRunOptions()` | `src/core.mjs:254` — `rawReportFile: options.rawReportFile` | ✅ Done |
| `writeRawReportFile()` helper | `src/core.mjs:168-181` — mirrors `writeReportFile()` defensive pattern | ✅ Done |
| Raw block written after formatted output | `src/core.mjs:287` — `writeRawReportFile(rawReportFile, output)` called after `writeReportFile` | ✅ Done |
| Unit tests for boundary extraction | `test/extract.test.mjs` — 6 tests covering normal, missing start, missing end, multiple markers, empty input, malformed order | ✅ Done |
| Integration test for raw report file | `test/integration.test.mjs:171-206` (text), `:208-245` (markdown), `:247-284` (html) — asserts both files exist, raw preserves format-specific start, raw equals boundary-delimited block | ✅ Done |
| `npm run crap` writes CRAPReport.md | `package.json:17` — unchanged, existing workflow preserved | ✅ Done |
| `npm run crap:raw` demonstrates feature | `package.json:18` — new script writing both `CRAPReport.md` and `CRAPReport.raw.md` | ✅ Done |
| Full vitest suite passes | 99 tests passed across 5 test files | ✅ Done |
| `npm run crap` exits 0 | Verified 2026-08-29 | ✅ Done |

---

## Implementation Plan — 2026-08-29

### Chosen approach

**Option B:** Keep `--report-file` for the formatted report, and add a separate `--raw-report-file <path>` for the boundary-delimited report block.

This preserves backward compatibility with existing `CRAPReport.md` workflows while adding the dedicated extraction-friendly output required by the prompt.

### Planned changes

| File | Change |
|---|---|
| `src/extract.mjs` | **New file.** Add `extractCrapReportBlock(text)` implementing the boundary rule: start at line `=== 'CRAP Report'`, end at first line including `'% Coverage report from'`. Returns `string|null`. |
| `src/core.mjs` | Add `--raw-report-file <path>` CLI option. Pass through to `run()`. After `formatReport()`, write the boundary-delimited block via `extractCrapReportBlock()` to the raw file. |
| `src/cli.mjs` | No change — thin wrapper, `core.mjs` handles new option. |
| `src/crap.mjs` | No change — formatters remain unchanged. |
| `test/extract.test.mjs` | **New file.** Unit tests for `extractCrapReportBlock()` covering: normal case, missing start, missing end, multiple markers, empty input. |
| `test/integration.test.mjs` | Add integration test verifying `--raw-report-file` writes correct boundary-delimited content. |
| `package.json` | Optionally add a script to demonstrate end-to-end raw report generation. |
| `docs/specs/prompt-18-improvecrapreport-io-spec.md` | This file — update progress as items complete. |

### Progress

| Item | Status | Notes |
|---|---|---|
| Create `src/extract.mjs` with `extractCrapReportBlock()` | ✅ Done | Boundary rule: start `'CRAP Report'`, end `'% Coverage report from'` |
| Update `src/core.mjs` with `--raw-report-file` | ✅ Done | Write raw block after formatted output via `writeRawReportFile()` |
| Add `test/extract.test.mjs` | ✅ Done | 6 unit tests for boundary extraction |
| Update `test/integration.test.mjs` | ✅ Done | Integration test for raw report file generation |
| Run vitest + crap4js self-analysis | ✅ Done | 97 tests pass, `npm run crap` exits 0 |
| Update this spec with verification results | ✅ Done | This section |

### Shippability criteria

Prompt 18 is considered shippable when:

- [x] `extractCrapReportBlock()` exists and is exported
- [x] Boundary rule matches the documented start/end markers
- [x] `--raw-report-file` writes a boundary-delimited report block
- [x] `npm run crap` generates both formatted and raw reports (or raw report is demonstrably available)
- [x] Unit tests for extraction pass
- [x] Integration tests for raw report generation pass
- [x] Full vitest suite passes
- [x] `npm run crap` self-analysis exits 0
- [x] This spec is updated with final verification evidence

### Verification evidence — 2026-08-29

**Test results:**
```
✓ test/extract.test.mjs (6 tests)
✓ test/crap.test.mjs (27 tests)
✓ test/coverage.test.mjs (16 tests)
✓ test/complexity.test.mjs (35 tests)
✓ test/integration.test.mjs (15 tests)

Test Files  5 passed (5)
     Tests  99 passed (99)
```

**Self-analysis:**
- `npm run crap` exits 0
- `npm run crap:raw` writes both `CRAPReport.md` and `CRAPReport.raw.md`
- Coverage: 93.81% statements, 85.42% branches, 95.74% functions, 93.81% lines
- 0 functions at high risk, 1 at moderate risk (`extractCrapReportBlock` in `src/extract.mjs`, CC=5)

**Files changed:**
- `src/extract.mjs` — new pure-function module with boundary rule
- `src/core.mjs` — added `--raw-report-file` CLI option, `normalizeRunOptions()` field, `writeRawReportFile()` helper, and raw block write in `renderFinalOutput()`
- `test/extract.test.mjs` — new unit test file with 6 boundary cases
- `test/integration.test.mjs` — added raw report file integration test
- `package.json` — added `crap:raw` script demonstrating the feature
- `docs/specs/prompt-18-improvecrapreport-io-spec.md` — updated with verification evidence

---

## Follow-up — Non-text format raw report edge case (2026-08-29)

### Trigger

A planning handover added an integration test for the non-text (`markdown`, `html`) `--raw-report-file` paths, asserting the raw file receives the complete report when no end marker (`% Coverage report from`) is present. For non-text formats the coverage summary is redirected to stderr, so it never appears in the formatted output and `extractCrapReportBlock()` must return the full text (start to EOF).

### Issue found

The original boundary rule matched the start marker with an **exact** line check `line === 'CRAP Report'`. The text formatter emits `CRAP Report` on its own line, but the markdown formatter emits `## CRAP Report` and the HTML formatter emits `<h2>CRAP Report</h2>` (with `<!DOCTYPE html>` as the document start). For markdown/html no start marker was found, so `extractCrapReportBlock()` returned `null` and `writeRawReportFile()` skipped writing the raw file entirely — the new tests could not pass.

### Fix

`src/extract.mjs` — replaced the single `START_MARKER` constant with a `START_MARKERS` list covering every format's start line:

```javascript
const START_MARKERS = ['CRAP Report', '## CRAP Report', '<!DOCTYPE html>', '<h2>CRAP Report</h2>'];
```

The `findIndex` now matches any of these markers; the end-marker scan and start-to-EOF fallback are unchanged. This keeps all existing `extract.test.mjs` cases valid (text still matches `CRAP Report`; arbitrary text without a marker still returns `null`).

### Tests added

`test/integration.test.mjs` — two new `it()` blocks after the text-format raw report test:

| Test | Asserts |
|---|---|
| `writes a raw report file with the full markdown report when format is markdown` (`:208-245`) | exit 0; report + raw files exist; raw starts with `## CRAP Report`; raw has no `% Coverage report from`; raw equals `extractCrapReportBlock(formattedContents)`; formatted equals `result.output` |
| `writes a raw report file with the full HTML report when format is html` (`:247-284`) | exit 0; report + raw files exist; raw starts with `<!DOCTYPE html>`; raw has no `% Coverage report from`; raw equals `extractCrapReportBlock(formattedContents)`; formatted equals `result.output` |

### Verification (2026-08-29)

- `npx vitest run` → **99 passed** (97 prior + 2 new), 0 failures.
- `test/integration.test.mjs` → **15 tests** (was 13).
- `npm run crap` → exits **0**; `src/extract.mjs` `extractCrapReportBlock` at **100% coverage**.
- `npm run lint` → only pre-existing errors in `src/core.mjs` (line 5 redeclares `console`/`process` globals, unrelated to this change) plus warnings; `extract.mjs` adds only a `detect-object-injection` warning, consistent with existing warnings.

### Status

✅ Complete — Prompt 18 raw-report feature now verified for all three output formats (text, markdown, html).
