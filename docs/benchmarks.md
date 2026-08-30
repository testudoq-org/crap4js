# Benchmarks

Profiling data captured with `CRAP4JS_PROFILE=1`.

## Methodology

Run `CRAP4JS_PROFILE=1 npm run crap` against an existing `coverage/` directory.
The `coverage command` phase dominates because `npm run crap` invokes
`vitest run --coverage` (the configured coverage command from `package.json`).

## Post-implementation numbers (all phases complete)

```
[PROFILE] coverage command:          3334ms
[PROFILE] source discovery:          9ms
[PROFILE] coverage load:             3ms
[PROFILE] AST parse + complexity:    120ms
[PROFILE] CRAP calculation + sorting + formatting:3ms
```

## Observations

- `coverage command` (vitest run --coverage) dominates at ~99% of total runtime.
- `AST parse + complexity` is ~120ms, indicating the single-pass traversal
  and binary-search coverage matching are performant.
- `coverage load` with the path index is ~3ms.
- No further AST phase split is warranted at this time; coverage command
  remains the bottleneck.

## Known deviation from spec

The spec lists 8 profiler phases. The implementation uses 5 merged phases:
- `coverage command`, `source discovery`, `coverage load`, `AST parse + complexity`, `CRAP calculation + sorting + formatting`.

Phases are merged because coverage matching and CRAP calculation are not
bottlenecks on current workloads. The `coverage command` phase dominates
(~99% of runtime). If finer granularity is needed later, split
`analyzeFile` into separate `coverage matching` and `CRAP calculation`
phases.


## Dead code (v1)

`src/core.mjs` module-private `coverageCounts` / `coverageFraction` helpers were removed after the switch to innermost-wins ownership via `assignCoverageOwnership` eliminated their call-sites (see [issue #19](https://github.com/testudoq-org/crap4js/issues/19)).
