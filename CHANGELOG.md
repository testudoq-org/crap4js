# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com).

## [1.0.0] - 2026-04-14

### Added
- Implemented CRAP formula: `CRAP(fn) = CC² × (1 - coverage)³ + CC`.
- Added `src/coverage.mjs` with LCOV parsing, path normalisation, suffix matching, and HTML fallback.
- Added `src/complexity.mjs` with Babel AST-based function extraction and cyclomatic complexity counting for JS/TS/JSX.
- Added `src/core.mjs` orchestration logic with filter support, coverage mapping, and exit codes.
- Added `src/cli.mjs` as the executable CLI entrypoint.
- Added `src/crap.mjs` report formatting and risk-level summary.
- Added `SKILL.md` for Claude Code integration.
- Added `test/integration.test.mjs` and comprehensive unit tests for core functionality.
- Added npm packaging metadata and LICENSE file for public publishing.

### Changed
- Documented publishing and development workflow in `README.md`.
