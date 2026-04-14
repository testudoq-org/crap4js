# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com).

## [1.0.1-beta.2] - 2026-04-14

### Changed
- Legal tidy-up: changed package license to CC BY-NC 4.0 and updated license metadata and documentation.
- Updated `package.json` metadata: set `author`, `repository`, `bugs`, and `homepage` to correct GitHub URLs (replaced `YOUR_USER` placeholders with `testudoq-org`).

### Security
- `eslint-plugin-security` added for static security linting.
- `validateCoverageCmd()` restricts coverage runners to an allowlist.
- `validateCoverageDir()` prevents directory traversal in relative coverage paths.
- `escapeHtml()` now escapes single quotes (`&#39;`).
- `SECURITY.md` added with contributor security guidelines.
- `npm run audit:security` script for dependency vulnerability scanning.

## [1.0.0] - 2026-04-14

### Added
- CRAP formula: `CRAP(fn) = CC² × (1 - coverage)³ + CC`.
- `src/coverage.mjs`: LCOV parsing, path normalisation, suffix matching, and HTML fallback.
- `src/complexity.mjs`: Babel AST-based function extraction and cyclomatic complexity counting for JS/TS/JSX.
- `src/core.mjs`: orchestration logic with filter support, coverage mapping, and exit codes.
- `src/cli.mjs`: executable CLI entrypoint.
- `src/crap.mjs`: report formatting and risk-level summary.
- `src/env.mjs`: centralised environment variable access.
- `vitest.config.mjs`: coverage configured to produce LCOV output (`reporter: ['text', 'lcov']`).
- `SKILL.md` for Claude Code integration.
- Comprehensive unit tests (67 tests across 4 files) covering formula, coverage parsing, AST complexity, and integration.
- npm packaging metadata (`files`, `keywords`, `repository`, `engines`) and CC BY-NC 4.0 license metadata.
- `npm run crap` script for dog-fooding (running crap4js on its own code).
- README with full setup guide including LCOV configuration for Vitest, Jest, c8/nyc.
- CI integration: exit code 1 when any function scores > 30.
