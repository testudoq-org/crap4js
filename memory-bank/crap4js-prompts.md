# crap4js — Build Prompts

One prompt per module, in build order. Each prompt is self-contained: paste it into a fresh Claude Code session with `crap4js-design.md` attached as context.

---

## Prompt 0 — Project scaffold

```
Create an npm package called crap4js with the following structure:

crap4js/
├── src/
│   ├── crap.mjs
│   ├── coverage.mjs
│   ├── complexity.mjs
│   └── core.mjs
├── test/
│   ├── crap.test.mjs
│   ├── coverage.test.mjs
│   └── complexity.test.mjs
├── .env_schema          # declares every env var the tool may read
├── eslint.config.mjs    # flat config, ESM-aware
├── .gitignore           # must include .env and coverage/
├── package.json
└── README.md

package.json requirements:
- "type": "module"
- bin entry: "crap4js" → "src/core.mjs"
- devDependencies: vitest, eslint, @eslint/js, varlock
- dependencies: @babel/parser ^7.26, @babel/traverse ^7.26, globby ^14, commander ^13
- scripts:
    "test": "vitest run"
    "lint": "eslint src/ test/"
    "lint:env": "varlock check"
- "crap" config block with defaults:
    coverageCommand: "vitest run --coverage"
    coverageDir: "coverage"
    sourceGlob: ["src/**/*.{js,mjs,ts,tsx}", "!**/*.test.*", "!**/node_modules/**"]

Linting requirements:
- eslint.config.mjs must use flat config format (eslint ≥ 9).
- Enable @eslint/js recommended rules.
- Set sourceType: "module" and ecmaVersion: "latest" for all src/ and test/ files.
- Add a no-process-env rule or equivalent: all env var reads must go through
  a single src/env.mjs module (see below) so varlock can validate them.

Environment variable handling:
- If any env var is read at runtime (e.g. CRAP4JS_DEBUG_LCOV), it must be
  declared in .env_schema using varlock schema syntax.
- Create src/env.mjs as the single entry point for all process.env reads.
  Other modules import from here rather than reading process.env directly.
- Do not create a .env file. crap4js reads env vars from the shell environment
  only. .env_schema documents what is expected; varlock validates it.
- .gitignore must include .env on the off-chance a developer creates one locally.

.env_schema must declare:
  CRAP4JS_DEBUG_LCOV  optional  boolean
    "When set, emit per-file LCOV diagnostic output to stderr."

Create all four .mjs files as stubs with a comment indicating what goes in each.
Create src/env.mjs as a stub that exports each declared env var as a named constant.
Do not write any other implementation yet.
```

---

## Prompt 1 — `crap.mjs` (formula + formatter)

```
Implement src/crap.mjs for a tool called crap4js, a JavaScript port of
https://github.com/unclebob/crap4clj.

This module has no I/O and no dependencies. It exports three functions:

1. crapScore(cc, coverageFraction)
   Formula: cc² × (1 - coverage)³ + cc
   cc is a positive integer. coverageFraction is 0.0–1.0.
   If coverageFraction is null/undefined, return null (no coverage data).

2. riskLevel(score)
   Returns 'low' for 1–5, 'moderate' for 5–30, 'high' for 30+.
   Returns null if score is null.

3. formatReport(entries)
   entries is an array of:
     { name: string, file: string, cc: number, coverage: number|null, crap: number|null }

   Output must match this format exactly (fixed-width columns, sorted descending by crap,
   null-coverage entries sorted last):

   CRAP Report
   ===========
   Function                       File                                 CC   Cov%     CRAP
   --------------------------------------------------------------------------------------
   complexFn                      src/auth/validator.mjs               12   45.0%    130.2
   <anonymous:47>                 src/auth/validator.mjs                4    0.0%     20.0
   simpleFn                       src/auth/validator.mjs                1  100.0%      1.0
   unknownFn                      src/util/helpers.mjs                  3    N/A       N/A

   Column widths: Function 30, File 36, CC 4, Cov% 8, CRAP 8.
   Truncate long names with … at position 28/34 respectively.
   Print a risk summary line after the table: "X functions at high risk, Y at moderate."

Also write test/crap.test.mjs covering:
- Score of 1 for CC=1, coverage=1.0
- Score of CC for any function with coverage=1.0
- Score of CC² + CC for a function with coverage=0.0
- null returned when coverageFraction is null
- Correct formatting with a mix of covered, uncovered, null-coverage, and anonymous entries
- Correct sort order (null-coverage last)
- Risk summary line counts
```

---

## Prompt 2 — `coverage.mjs` (LCOV parser)

```
Implement src/coverage.mjs for crap4js, a JavaScript port of the coverage
parsing logic in https://github.com/unclebob/crap4clj (coverage.cljc).

The module exports one function:

  loadCoverage(coverageDir: string): Map<string, Map<number, boolean>>

Returns a Map where:
- keys are normalised source file paths (relative, no leading ./)
- values are Maps of line number → covered (true/false)

Parse in this priority order:

1. LCOV: look for {coverageDir}/lcov.info
   Format: SF: marks a new file section. DA:lineNo,hitCount marks a line.
   hitCount 0 = not covered. Any other value = covered.
   Normalise SF: paths using the rules below.

2. Per-file HTML fallback: look for {coverageDir}/**/*.html
   Parse <span> elements with class "covered" or "not-covered" and
   data-line attributes. Only use if lcov.info is absent.

Path normalisation rules (match crap4clj exactly):
- If path starts with /, resolve to absolute then convert to relative from cwd
- Strip leading ./
- Resolve relative paths from cwd
- Store as the shortest relative path from cwd
- If no source file matches, try suffix matching: match the last N segments of
  the LCOV path against the last N segments of each source file path
- Warn to stderr for any LCOV file with no matching source

Source map warning:
- If LCOV SF: paths consistently reference dist/ or build/ directories,
  warn to stderr: "LCOV paths point to compiled output, not source.
  Check that sourceMap: true is set in tsconfig.json."
- Do not crash — continue with whatever matches

If CRAP4JS_DEBUG_LCOV is set in env, emit to stderr for each SF: entry:
  [LCOV] raw: <path> → normalised: <path> → matched: <source path or NO MATCH>

Also write test/coverage.test.mjs using fixture strings (not real files on disk).
Test:
- Basic LCOV parsing: two files, mixed covered/uncovered lines
- Absolute path in SF: resolved correctly
- ./src/foo.mjs and src/foo.mjs both normalise to src/foo.mjs
- Suffix matching kicks in when direct path fails
- Missing file emits warning to stderr
- Debug output emitted when CRAP4JS_DEBUG_LCOV is set
- dist/ path triggers source map warning
```

---

## Prompt 3 — `complexity.mjs` (AST walker)

```
Implement src/complexity.mjs for crap4js, a JavaScript port of
https://github.com/unclebob/crap4clj (complexity.cljc).

The module exports one function:

  extractFunctions(source: string, filePath: string): Array<FunctionEntry>

Where FunctionEntry is:
  { name: string, file: string, startLine: number, endLine: number, cc: number }

Parse with @babel/parser:
  import { parse } from '@babel/parser';
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    errorRecovery: true,
  });

Walk with @babel/traverse. For each function node, record name, location, and CC.

## Function node types to handle

- FunctionDeclaration
- FunctionExpression
- ArrowFunctionExpression
- ObjectMethod
- ClassMethod
- ClassPrivateMethod

Do NOT separately report class field initialisers or static blocks (v1 gap — document it).

## Naming rules (in priority order)

1. FunctionDeclaration with id → use node.id.name
2. Arrow or function expression in VariableDeclarator → use path.parent.id.name
3. ClassMethod / ClassPrivateMethod → use "ClassName.methodName"
   Get class name by traversing up path.parentPath until ClassDeclaration or ClassExpression
4. ObjectMethod → use the property key name
5. Async functions → naming is identical to non-async; async does not affect the name
6. Generator functions (node.generator === true) → naming identical to non-generator
7. Everything else → "<anonymous:startLine>"

## CC counting rules

Base: +1 per function (covers its own body only — not nested function bodies).

Count +1 for each:
- IfStatement
- ConditionalExpression (ternary)
- LogicalExpression with operator && or || or ??
- AssignmentExpression with operator ||=, &&=, or ??=
- ForStatement, ForInStatement, ForOfStatement (includes for await...of)
- WhileStatement, DoWhileStatement
- SwitchCase where node.test !== null (i.e. not the default clause)
- CatchClause

Do NOT count:
- OptionalMemberExpression (a?.b)
- OptionalCallExpression (fn?.())
- Default parameter values (AssignmentPattern in function params)
- Destructuring default values (AssignmentPattern in destructuring)
- YieldExpression
- FinallyBlock / TryStatement.finalizer
- TypeScript-specific nodes (they are control-flow-free)
- Nested function bodies — when the traversal enters any of the function node
  types listed above, call path.skip() so the outer function's CC count stops.
  The nested function will be counted as its own separate entry.

## try/catch/finally

count CatchClause (+1). Do not count the finally block.
A try with only finally (no catch) adds nothing to CC.

## Also write test/complexity.test.mjs with these cases:

CC counting:
- Empty function: CC = 1
- One if: CC = 2
- if + else if: CC = 3
- One &&: CC = 2
- One ||: CC = 2
- One ??: CC = 2
- ||= operator: CC = 2
- &&= operator: CC = 2
- ??= operator: CC = 2
- ?. optional chaining: CC = 1 (NOT counted)
- ?. chain with two links (a?.b?.c): CC = 1 (still not counted)
- Default parameter f(x = 0): CC = 1 (NOT counted)
- Destructuring default { x = 0 }: CC = 1 (NOT counted)
- switch with 3 cases + default: CC = 4 (3 cases, not default)
- for loop: CC = 2
- for...of: CC = 2
- for await...of: CC = 2
- while: CC = 2
- do...while: CC = 2
- try/catch: CC = 2
- try/finally only: CC = 1
- try/catch/finally: CC = 2 (finally not counted)
- Ternary: CC = 2

Naming:
- Named function declaration: uses function name
- Arrow in const: uses variable name
- Async arrow in const: uses variable name
- Class method: uses "ClassName.methodName"
- Object method: uses property key
- IIFE: "<anonymous:line>"
- Callback argument: "<anonymous:line>"

Isolation:
- Nested function: outer CC unaffected by inner branches
- Generator function (function*): recognised as function, yield not counted
- TypeScript function with type annotations: parses without error, CC correct
```

---

## Prompt 4 — `core.mjs` (CLI orchestrator)

```
Implement src/core.mjs for crap4js, a JavaScript port of
https://github.com/unclebob/crap4clj (core.cljc).

This is the CLI entry point. Add a shebang: #!/usr/bin/env node

Imports:
  import { extractFunctions } from './complexity.mjs';
  import { loadCoverage } from './coverage.mjs';
  import { crapScore, formatReport } from './crap.mjs';
  import { globby } from 'globby';
  import { execSync } from 'child_process';
  import { readFileSync, rmSync } from 'fs';
  import { Command } from 'commander';

CLI interface:
  crap4js [filters...]          # filter by file path fragment (OR logic)
  --coverage-dir <dir>          # default: "coverage"
  --coverage-cmd <cmd>          # default: from package.json "crap" config
  --no-delete                   # skip deleting coverage dir before run
  --help

Orchestration steps (in order, matching core.cljc):

1. Read package.json from cwd. Extract "crap" config block if present.
   Fail gracefully if package.json absent.
2. Unless --no-delete: rmSync(coverageDir, { recursive: true, force: true })
3. Run coverage command via execSync({ stdio: 'inherit' }).
   If it exits non-zero, print a warning to stderr and continue.
   Coverage may be partial — do not abort.
4. Call loadCoverage(coverageDir) once and cache the result.
5. Find source files via globby using configured sourceGlob.
   If CLI filters were passed, include only files whose path contains
   at least one filter string (OR logic).
6. For each source file:
   a. Read source text. If read fails, warn to stderr and skip.
   b. Call extractFunctions(source, filePath).
      If it throws (parse error), warn to stderr and skip the file.
   c. For each FunctionEntry:
      - Look up line-level coverage from the cached Map.
      - coverageFraction = covered lines in [startLine..endLine]
        divided by total instrumented lines in that range.
      - If no DA: entries exist in that range, coverageFraction = null.
      - Compute crapScore(cc, coverageFraction).
7. Collect all entries. Call formatReport() and print to stdout.
8. Exit code:
   - 0 if every function scores ≤ 30 (or has null coverage)
   - 1 if any function scores > 30
   This enables CI integration: add `npm run crap` to your pipeline and
   it will fail the build when high-risk functions appear.

loadCoverage() is called once. Do not call it per-file.
```

---

## Prompt 5 — `SKILL.md` (Claude Code integration)

```
Write a SKILL.md for crap4js, following the same structure as the one in
https://github.com/unclebob/crap4clj/blob/master/SKILL.md.

The SKILL.md tells Claude Code how to respond when a user asks for a
"CRAP report" on a JavaScript or TypeScript project.

Include:
1. What crap4js does (CRAP metric for JS/TS — identifies complex, under-tested code)
2. How to install it (npm install --save-dev crap4js)
3. How to add to package.json scripts ("crap": "crap4js")
4. How to configure coverage command and source glob in package.json "crap" block
5. How to run it (npx crap4js, or npm run crap, or with filters: npx crap4js auth ui)
6. How to interpret the output (score table, risk thresholds: <5 low, <30 moderate, 30+ high)
7. CI integration (exit 1 if any function scores > 30)
8. Common troubleshooting:
   - No lcov.info: ensure coverage tool is configured to produce LCOV output
   - N/A coverage: run the coverage command before crap4js, or remove --no-delete
   - Path mismatches: set CRAP4JS_DEBUG_LCOV=1 to see diagnostic output
   - TypeScript projects: works out of the box; no config needed

Keep it short and actionable. A developer should be able to go from zero to
a working CRAP report in under two minutes after reading this.
```

---

## Prompt 6 — Integration test + `README.md`

```
Write an end-to-end integration test for crap4js (test/integration.test.mjs).

The test must:
1. Create a temp directory with two JS source files:
   - high-crap.mjs: a function with CC ≥ 5 (use 3 if statements + 2 logical operators)
     and no coverage data
   - low-crap.mjs: a function with CC = 1 and 100% coverage

2. Create a synthetic lcov.info in the temp dir covering every line of
   low-crap.mjs at hitCount 1, and omitting high-crap.mjs entirely.

3. Call the orchestration logic from core.mjs directly (not via child_process)
   with --no-delete and --coverage-dir pointing at the temp dir.

4. Assert:
   - high-crap function appears first in the formatted output (highest CRAP)
   - high-crap CRAP score matches CC² × (1 - 0)³ + CC = CC² + CC
   - low-crap function scores exactly its CC (1)
   - The run exits with code 1 (high-risk function present)

5. Clean up temp directory after each test.

Also write README.md. Include:
- One-paragraph description: what CRAP is, why it matters, link to Uncle Bob's original
- Quick start: install, package.json snippet, run command
- Output example showing the table format including an <anonymous:line> entry
- Full decision-point table (what counts, what does not, with a note on ESLint divergences)
- Filtering examples: npx crap4js auth ui
- CI integration: exit code behaviour, example GitHub Actions step
- Troubleshooting: CRAP4JS_DEBUG_LCOV, source maps, absolute LCOV paths
- Known gaps in v1: class field initialisers, static blocks not reported
- Link to https://github.com/unclebob/crap4clj
```

---

## Prompt 7 — `CRAP4JS_DEBUG_LCOV` test coverage

```
Add a test case to test/coverage.test.mjs that verifies DEBUG_LCOV output.

The test must:
1. Mock the CRAP4JS_DEBUG_LCOV import from src/env.mjs to return true.
   Use vi.mock() or direct module-level override.
2. Call parseLcov() with a valid LCOV string containing two SF: entries.
3. Assert that console.error was called with strings matching the
   "[LCOV] raw: ... → normalised: ... → matched: ..." format.
4. Verify each SF: entry produces exactly one diagnostic log line.
5. Restore the original env value after the test.

This addresses a gap from Prompt 2 which explicitly required this test case.
```

---

## Prompt 8 — HTML fallback coverage tests

```
Add test cases to test/coverage.test.mjs that verify the HTML fallback
coverage parser in src/coverage.mjs.

The tests must use a real temp directory (no mocking fs):

1. Create a temp directory with NO lcov.info file.
2. Create an HTML file with <span> elements containing:
   - class="covered" data-line="1"
   - class="not-covered" data-line="2"
   - class="covered" data-line="3"
   (Test both attribute orderings: class before data-line and vice versa.)
3. Call loadCoverage(tempDir) and assert:
   - Line 1 → true
   - Line 2 → false
   - Line 3 → true
4. Create a second test: temp directory with BOTH lcov.info AND HTML files.
   Assert that lcov.info takes priority (HTML is ignored).
5. Create a third test: empty coverage directory. Assert empty Map returned.
6. Clean up temp directories after each test.

Also verify that the HTML parser correctly derives the file path from
the HTML file name (stripping .html suffix and making it relative).
```

---

## Prompt 9 — Harden dist/build warning detection

```
Improve the dist/build source-map warning logic in src/coverage.mjs.

Current behaviour: only detects paths starting with "dist/" or "build/".
This misses absolute paths like "/home/ci/project/dist/foo.js" where
the normalised path may not start with dist/ depending on cwd.

Changes:
1. After normalisation, check if the path contains "/dist/" or "/build/"
   anywhere (not just at the start). Use a regex: /[/\\](dist|build)[/\\]/i
2. Also check the raw (pre-normalisation) path for the same pattern.
3. Keep the existing "all paths must match" threshold — only warn when
   every SF: entry points to compiled output, not just some.
4. Add a test case: LCOV with absolute paths containing /dist/ that
   normalise to paths NOT starting with dist/. Verify warning is emitted.
5. Add a test case: mixed source and dist paths. Verify NO warning.

Do not change the warning message text — keep it identical.
```

---

## Prompt 10 — npm packaging metadata

```
Update package.json with fields required for public npm publishing:

1. Add "files" array to whitelist only published files:
   ["src/", "README.md", "LICENSE"]
2. Add "repository": { "type": "git", "url": "git+https://github.com/YOUR_USER/crap4js.git" }
   (use placeholder — owner will fill in their GitHub username)
3. Add "keywords": ["crap", "complexity", "coverage", "cyclomatic",
   "testing", "quality", "metrics", "static-analysis"]
4. Add "author": "" (placeholder for the owner)
5. Add "bugs": { "url": "https://github.com/YOUR_USER/crap4js/issues" }
6. Add "homepage": "https://github.com/YOUR_USER/crap4js#readme"
7. Add "engines": { "node": ">=18" }
8. Verify "license": "CC-BY-NC-4.0" is present.
9. Do NOT add a prepublishOnly script — keep it simple.

Also create a LICENSE file with the Creative Commons Attribution-NonCommercial 4.0 International license text if one does not exist.
```

---

## Prompt 11 — Dog-food crap4js on its own code

```
Write instructions and a short checklist for using crap4js to analyze its own repository.

The prompt should cover:
- Why this repo can analyze itself: it already has `type: "module"`, `bin: { "crap4js": "src/cli.mjs" }`, and the CLI entrypoint in `src/cli.mjs`.
- What is required:
  - `npm install` to install dependencies
  - `package.json` includes `scripts` for `test`, `lint`, and `lint:env`
  - `package.json` includes a `crap` config block:
    - `coverageCommand: "vitest run --coverage"`
    - `coverageDir: "coverage"`
    - `sourceGlob: ["src/**/*.{js,mjs,ts,tsx}", "!**/*.test.*", "!**/node_modules/**"]`
- How to run it from the repo root:
  - `npm run crap`
  - or `npx crap4js`
- What the run does:
  - runs `vitest run --coverage`
  - loads `coverage/lcov.info`
  - parses the repo's own `src/` files
  - computes CC, coverage fraction, and CRAP score
  - prints the CRAP report
- Useful variants:
  - `npx crap4js --no-delete` to keep existing coverage output
  - `CRAP4JS_DEBUG_LCOV=1 npx crap4js` to debug LCOV path matching
- Why this works:
  - `src/cli.mjs` is the executable entrypoint
  - `src/core.mjs` orchestrates analysis
  - `src/coverage.mjs` parses LCOV and HTML fallback
  - `src/complexity.mjs` analyzes JS/TS syntax
  - tests plus Vitest coverage support are already present
- One note:
  - because the tool analyzes its own code, the coverage command must succeed in this repo; it does, so if you want to avoid rerunning coverage, use `--no-delete`
```

---

## Prompt 12 — Vitest LCOV reporter configuration (dog-food fix)

```
Fix the N/A coverage problem when crap4js dog-foods itself.

Root cause:
- crap4js loads coverage from `coverage/lcov.info`
- Vitest's default coverage reporters are `['text', 'html', 'clover', 'json']` — no LCOV
- Without `lcov.info`, `loadCoverage()` falls back to HTML parsing
- The HTML fallback expects `<span class="covered" data-line="N">` elements,
  but Istanbul/v8 HTML uses `<span class="cline-any cline-yes">` — no match
- Result: every function shows N/A for coverage and CRAP

Fix:
1. Create `vitest.config.mjs` at the project root with:
   - Coverage reporter list that includes `'lcov'` (plus `'text'` for console output)
   - `reportsDirectory` set to `'coverage'` (matches the `crap.coverageDir` default)
   - Coverage include pattern matching the project's source files

   ```js
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

2. Add `"crap": "crap4js"` to the `scripts` block in `package.json`
   so that `npm run crap` works out of the box.
3. Add `@vitest/coverage-v8` to `devDependencies` if not already present
   (it is the coverage provider Vitest v3 uses for v8).
4. Run `npm run crap` and verify:

   - `coverage/lcov.info` is generated
   - All functions show numeric Cov% and CRAP values (no N/A)
   - The report matches expected scores
5. Update `README.md` Troubleshooting section to include:

   - "N/A coverage: ensure your test runner is configured to produce LCOV
     output. For Vitest, add `reporter: ['text', 'lcov']` to your coverage
     config in `vitest.config.mjs`."

Do not change coverage.mjs or any other source logic. This is purely a
configuration fix — the tool works correctly when LCOV data is present.

```

---

## Prompt 13 — Risk column + multi-format output (text, markdown, HTML)

```

Add a Risk column to the CRAP report and support three output formats:
plain text (default), markdown, and HTML.

## Part A — Risk column

Add a "Risk" column as the last column in the report table.

Changes to src/crap.mjs:

1. Add COL_RISK = 10 constant alongside the existing column width constants.
2. In the header row, append "Risk" right-padded to COL_RISK.
3. In each data row, append the result of riskLevel(entry.crap):
   - "low", "moderate", "high", or "N/A" for null scores.
   - Pad to COL_RISK.
4. Update the separator line width to include the new column.
5. The riskLevel() function already exists — reuse it.

Expected text output after this change:

CRAP Report
===========

Function                       File                                   CC     Cov%     CRAP  Risk
------------------------------------------------------------------------------------------------

  resolveName                    src/complexity.mjs                     25    87.5%     26.2  moderate
  simpleFn                       src/crap.mjs                            1   100.0%      1.0  low
  unknownFn                      src/util/helpers.mjs                    3      N/A      N/A  N/A

  0 functions at high risk, 1 at moderate.

## Part B — Multi-format output

Add a `format` parameter to formatReport() and a --format CLI option.

Changes to src/crap.mjs:

1. Change signature: formatReport(entries, format = 'text')
2. format accepts: 'text' (default), 'markdown', 'html'
3. Text format: current fixed-width table (with the new Risk column from Part A)
4. Markdown format:
   - Standard pipe-delimited markdown table
   - Header: | Function | File | CC | Cov% | CRAP | Risk |
   - Alignment row: |:---|:---|---:|---:|---:|:---|
   - Data rows with same values as text, no padding needed
   - Title "CRAP Report" as a markdown heading (## CRAP Report)
   - Risk summary as a paragraph after the table
5. HTML format:
   - Complete `<table>` with `<thead>` and `<tbody>`
   - Risk cells get a CSS class: class="risk-low", class="risk-moderate",
     class="risk-high", or class="risk-na"
   - Wrap in a minimal `<div class="crap-report">` container
   - Include a `<style>` block with basic colours:
     .risk-low { color: green; }
     .risk-moderate { color: orange; }
     .risk-high { color: red; font-weight: bold; }
   - Risk summary as a `<p>` after the table
   - Do NOT generate a full HTML page — just the fragment
     (users embed it in their own pages or CI reports)

Changes to src/core.mjs:

1. Pass options.format through to formatReport(entries, format)
2. The run() function signature already accepts an options object — add format

Changes to CLI (src/core.mjs cli()):

1. Add --format <text|markdown|html> option (default: 'text')
2. Pass opts.format to run()

## Tests (test/crap.test.mjs)

Add tests for:

1. Text format includes Risk column with correct values (low, moderate, high, N/A)
2. Markdown format produces valid pipe table with header, alignment row, data
3. Markdown format sorts same as text (descending CRAP, null last)
4. HTML format produces `<table>` with correct structure
5. HTML format includes risk CSS classes on risk cells
6. HTML format includes `<style>` block
7. Default format is 'text' (backward compatible)
8. Risk summary appears in all three formats

## Constraints

- Do not change the analysis pipeline (core.mjs steps 1-6)
- Do not change crapScore() or riskLevel() signatures
- Existing tests must continue to pass without modification
  (formatReport(entries) with no format arg must produce text)
- The text format column widths for existing columns must not change
  (Function 30, File 36, CC 4, Cov% 8, CRAP 8) — only Risk 10 is added

```

## Prompt 13A — Fix crap4js --format html

```

The markdown and plain text outputs are functioning correctly. However,
when executing `npx crap4js --format html > crap-report.html`, the
resulting file has two problems:

1. No valid HTML document structure — the output is a bare `<div>` fragment
   missing `<!DOCTYPE html>`, `<html>`, `<head>`, `<title>`, and `<body>` wrappers.
   Browsers can render it, but it is not a conformant HTML page.
2. When piped to a file, Vitest's console output (ANSI escape codes,
   coverage table) appears above the HTML because `console.log()` in
   core.mjs writes everything to stdout.

Fix: Wrap the HTML formatter output in a full HTML5 document:

<!DOCTYPE html>

<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>CRAP Report</title>
    <style>…</style>
  </head>
  <body>
    <h2>CRAP Report</h2>
    <table>…</table>
    <p>risk summary</p>
  </body>
  </html>

Move the `<style>` block into `<head>`. Drop the outer `<div class="crap-report">`
wrapper (the `<body>` serves that role). Keep all existing CSS classes and
escaping.

Update tests:

- HTML output starts with `<!DOCTYPE html>`
- Contains <html, `<head>`, `<body>`, `</html>`
- <style> block is inside <head>
- Risk CSS classes still present
- HTML entity escaping still works
- Existing text and markdown tests unchanged

Verify:

- `npx crap4js --format html > crap-report.html` produces a valid HTML page
- `npm test` — all tests pass, no regression
- `npm run crap` — text output unchanged

```

## Prompt 14 — Security Review

```

Security review of crap4js. Do not implement changes — document findings
and separate recommendations into two tiers:

  A) Local (code + VS Code level) — things we can fix or add in this repo
  B) External (GitHub / CI / third-party) — things configured outside the repo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 1. Purpose & Functionality

crap4js is a CLI tool that computes CRAP scores for JS/TS functions.
It parses source files (Babel), reads LCOV/HTML coverage data, and
outputs risk reports (text, markdown, HTML) for CI and developer use.

## 2. Current Security Posture

- Environment variables centralised in src/env.mjs.
- .env_schema documents expected vars; .gitignore includes .env.
- Modular design — no file exceeds 500 lines.
- HTML output uses escapeHtml() for XSS-safe rendering.
- Test coverage exists for all major modules.

## 3. Findings

### Finding 1 — execSync command injection risk

  src/core.mjs uses execSync(coverageCmd, ...) where coverageCmd
  comes from package.json "crap.coverageCommand" or --coverage-cmd.
  If a malicious package.json is present, arbitrary commands execute.
  Risk: Medium (requires write access to package.json or CLI args).

### Finding 2 — Directory traversal in coverageDir / sourceGlob

  coverageDir and sourceGlob are read from package.json and CLI.
  No validation prevents paths like "../../etc" or absolute paths
  outside the project.
  Risk: Low (tool runs locally with user permissions anyway).

### Finding 3 — Dependency supply chain

  @babel/parser, @babel/traverse, globby, commander are direct deps.
  No lockfile integrity check or automated vulnerability scanning.
  Risk: Medium (common npm supply-chain concern).

### Finding 4 — HTML output injection surface

  escapeHtml() covers &, <, >, " but not single quotes (').
  Risk: Low (output is static file, not served by a web app).

## 4. Recommendations

### A) Local — Code & VS Code level

  ┌─────────┬──────────────────────────────────────────────────────┐
  │Priority │ Action                                    │ Status   │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Critical │ Harden execSync: validate coverageCmd against an     │
  │         │ allowlist of known runners (vitest, jest, c8, nyc,   │
  │         │ npx) or at minimum reject shell metacharacters       │
  │         │ (;, |, &&, ||, $, `) before execution.    │ ✅ DONE  │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Critical │ Validate coverageDir: resolve to an absolute path,   │
  │         │ confirm it is inside cwd, reject ".." traversal.     │
  │         │                                           │ ✅ DONE  │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Medium   │ Escape single quotes in escapeHtml(): add            │
  │         │   .replace(/'/g, '&#39;')                            │
  │         │ for defense-in-depth.                     │ ✅ DONE  │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Medium   │ Add ESLint security plugin (eslint-plugin-security)  │
  │         │ to the local lint config for static analysis.         │
  │         │                                           │ ✅ DONE  │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Low      │ Create SECURITY.md with contributor guidelines:      │
  │         │ no secrets in code, how to report vulnerabilities,   │
  │         │ required review for dependency additions. │ ✅ DONE  │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Low      │ Add npm audit --audit-level=moderate as a local      │
  │         │ script ("scripts": { "audit": "npm audit ..." })     │
  │         │ so developers can run it manually.        │ ✅ DONE  │
  └─────────┴──────────────────────────────────────────────────────┘

### B) External — GitHub / CI / Third-party

  ┌─────────┬──────────────────────────────────────────────────────┐
  │Priority │ Action                                               │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Critical │ Enable GitHub Dependabot or Snyk for automated       │
  │         │ dependency vulnerability alerts and PRs.             │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Medium   │ Add a CI workflow step that runs npm audit and       │
  │         │ fails the build on high/critical vulnerabilities.    │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Medium   │ Integrate semgrep or SonarQube in CI for deeper     │
  │         │ static security analysis beyond ESLint.              │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Medium   │ Require PR reviews for any changes to package.json  │
  │         │ dependencies (GitHub branch protection + CODEOWNERS).│
  ├─────────┼──────────────────────────────────────────────────────┤
  │Low      │ Add a GitHub Actions workflow for periodic           │
  │         │ npm audit / Trivy scans on a schedule (weekly).      │
  ├─────────┼──────────────────────────────────────────────────────┤
  │Low      │ Pin GitHub Actions versions by SHA to prevent        │
  │         │ supply-chain attacks via compromised actions.         │
  └─────────┴──────────────────────────────────────────────────────┘

## 5. Summary

No exposed secrets or monolithic files detected. Main risks are
unsanitized CLI command execution and standard npm supply-chain
concerns. The local fixes (A) can be implemented in-repo without
external tooling. The external fixes (B) require GitHub settings,
CI configuration, or third-party service setup.

No code is modified by this prompt — it is a review document only.

```

## Prompt 15 — Release & npm Publish Plan

```

Document a complete release and npm publishing plan for crap4js.
Combine the publish checklist from Prompt 99 with the following guidance:

## 1. Versioning

- Use semantic versioning: MAJOR.MINOR.PATCH.
- Bump `patch` for bug fixes and backwards-compatible changes.
- Bump `minor` for new features that remain backwards compatible.
- Bump `major` for breaking changes.
- Update `package.json` version before publishing.
- Keep `CHANGELOG.md` or release notes aligned with the version.

## 2. Package validation

- Confirm `package.json` metadata: `name`, `version`, `author`, `repository`, `bugs`, `homepage`, `license`.
- Confirm `files` exports only intended published assets: `src/`, `README.md`, `LICENSE`, `LEGAL.md`.
- Confirm `bin` points to `src/cli.mjs`.
- Run `npm test`, `npm run lint`, and `npm run audit:security`.
- Run `npm pack --dry-run` and verify the archive contents.

## 3. Publish flow

- Log in with `npm login`.
- Publish stable release with `npm publish --access public`.
- For prerelease channels, use dist-tags:
  - `npm publish --tag next`
  - `npm publish --tag beta`
- Keep `latest` reserved for stable releases.

## 4. Git release hygiene

- Tag the release: `git tag vX.Y.Z`.
- Push commits and tags: `git push origin main --tags`.
- Document release notes in GitHub Releases or `CHANGELOG.md`.

## 5. CI / automation notes

- Automate tests, lint, audit, version bump, and publish where possible.
- Protect npm auth tokens and never commit secrets.
- Use CI to enforce `npm test` and `npm run lint` before every publish.

## 6. Summary

- Prompt 15 is documentation only.
- It replaces Prompt 99 in the prompt bank.
- It captures npm publishing, semantic versioning, dist-tags, validation, and release process best practices.

```

## Prompt 16 — CRAP Setup Diagnosis

```

Identify why crap4js did not produce a report after installation and document the required workspace configuration.

## 1. Problem

- crap4js depends on workspace-specific coverage configuration.
- If no `crap` config block exists in `package.json`, the tool cannot infer coverage settings.
- Without `coverageCommand`, `coverageDir`, and `sourceGlob`, crap4js cannot generate a function-level CRAP report.
- A missing `crap` script means the workspace does not expose a standard way to run the report.

## 2. Expected setup

- `package.json` must include a `crap` config block with:
  - `coverageCommand`: command to generate LCOV coverage
  - `coverageDir`: directory containing `lcov.info`
  - `sourceGlob`: source file patterns to analyze
- `package.json` should also include a `crap` script, e.g.:
  - `"crap": "crap4js"`

## 3. Workspace validation

- If the workspace already has coverage output and a matching config, crap4js is ready.
- If coverage is missing, install `@vitest/coverage-v8` and configure `vitest` to emit `lcov`.
- If the coverage command exits non-zero, fix the workspace tests/coverage pipeline first; partial coverage results are not reliable.
- If the package is part of a monorepo, pass `--coverage-dir` and run coverage in the correct subworkspace.

## 3.1. Monorepo examples

- `npx crap4js --coverage-dir server/coverage`
- `npx crap4js --coverage-dir web/coverage`

## 4. Example root package configuration

```json
"scripts": {
  "crap": "crap4js"
},
"crap": {
  "coverageCommand": "vitest run --coverage",
  "coverageDir": "coverage",
  "sourceGlob": [
    "src/**/*.{js,mjs,ts,tsx}",
    "!**/*.test.*",
    "!**/node_modules/**"
  ]
}
```

## 5. Summary

- The issue is missing application-specific `crap` metadata, not a failure of the tool itself.
- If the coverage command fails, an empty report is expected; fix the workspace tests/coverage runner first.
- Check that `coverage/lcov.info` exists and is readable before rerunning `npx crap4js`.
- For monorepos, set per-workspace config and pass `--coverage-dir` when needed.

```

## Prompt 17 — Legal / License Tidy-Up

```

Review the repository for any references to the MIT license and replace them with Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).

## 1. License metadata

- Ensure `package.json` uses `CC-BY-NC-4.0`.
- Ensure the `LICENSE` file contains the CC BY-NC 4.0 license text.
- Update any repository docs or internal design notes that still refer to MIT.

## 2. Documentation review

- Update `CHANGELOG.md`, `README.md`, and any prompt or design docs that mention MIT.
- Keep the repository's public license consistent across `package.json`, `LICENSE`, and `LEGAL.md`.

## 3. Publishing impact

- Publish the updated legal/license package version to npm so the public package metadata matches the repository license.
- Use the appropriate npm dist-tag for the release channel.

## 4. Summary

* This prompt is a legal tidy-up and license alignment task.
* Replace remaining MIT references with CC BY-NC 4.0.
* Ensure the packaged artifact carries the corrected license metadata.

## Prompt 18 Improve the Crap Report outputting

Task: Enhance the crap4js tool to generate a dedicated "report-only" block or a separate output file, improving the robustness of CRAPReport.md updates and eliminating fragile console parsing.

Objective:

1. Update crap4js: Modify crap4js to emit a dedicated "report-only" block or a separate output file containing the CRAP report.
2. Improve report extraction: Implement a simpler boundary rule to extract the CRAP report block reliably.
3. Enhance robustness: Make CRAPReport.md updates more robust by reducing dependence on console output parsing.

Requirements:

1. Boundary rule: Use a simple boundary rule, such as:
   * Start: line === 'CRAP Report'
   * End: first line after start matching '% Coverage report from'
2. Report extraction: Update `extractCrapReportBlock()` to reliably return the full report from the dedicated output file or block.
3. Compatibility: Ensure that `npm run crap` alone can generate the report and copy it to CRAPReport.md.

Expected** **outcome:

1. Robust report updates: CRAPReport.md updates are no longer fragile and dependent on console output parsing.
2. Simplified report extraction: The extractor can simply read a file instead of tailing terminal output.
3. Improved maintainability: The updated crap4js tool is more maintainable and less prone to errors.

Implementation** **strategy:

1. Investigate current implementation: Review the current implementation of crap4js and the report extraction script.
2. Design and test updates: Design and test the updates to crap4js and the report extraction script.
3. Verify robustness: Verify that the updated implementation is more robust and reliable.

Deliverables:

1. Updated crap4js tool: A modified version of crap4js that emits a dedicated "report-only" block or a separate output file.
2. Updated report extraction script: An updated report extraction script that uses the simpler boundary rule and extracts the report reliably.
3. Test results: Test results verifying the robustness and reliability of the updated implementation.

Task: Enhance the crap4js tool to generate a dedicated "report-only" block or a separate output file, improving the robustness of CRAPReport.md updates and eliminating fragile console parsing.

Objective:

1. Update crap4js: Modify crap4js to emit a dedicated "report-only" block or a separate output file containing the CRAP report.
2. Improve report extraction: Implement a simpler boundary rule to extract the CRAP report block reliably.
3. Enhance robustness: Make CRAPReport.md updates more robust by reducing dependence on console output parsing.

Requirements:

1. Boundary rule: Use a simple boundary rule, such as:
   * Start: line === 'CRAP Report'
   * End: first line after start matching '% Coverage report from'
2. Report extraction: Update `extractCrapReportBlock()` to reliably return the full report from the dedicated output file or block.
3. Compatibility: Ensure that `npm run crap` alone can generate the report and copy it to CRAPReport.md.

Expected** **outcome:

1. Robust report updates: CRAPReport.md updates are no longer fragile and dependent on console output parsing.
2. Simplified report extraction: The extractor can simply read a file instead of tailing terminal output.
3. Improved maintainability: The updated crap4js tool is more maintainable and less prone to errors.

Implementation** **strategy:

1. Investigate current implementation: Review the current implementation of crap4js and the report extraction script.
2. Design and test updates: Design and test the updates to crap4js and the report extraction script.
3. Verify robustness: Verify that the updated implementation is more robust and reliable.

Deliverables:

1. Updated crap4js tool: A modified version of crap4js that emits a dedicated "report-only" block or a separate output file.
2. Updated report extraction script: An updated report extraction script that uses the simpler boundary rule and extracts the report reliably.
3. Test results: Test results verifying the robustness and reliability of the updated implementation.
