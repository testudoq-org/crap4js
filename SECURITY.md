# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in crap4js, please report it responsibly:

1. **Do not** open a public issue.
2. Email the maintainer directly or use GitHub's private vulnerability reporting.
3. Include steps to reproduce and any relevant details.

We aim to acknowledge reports within 48 hours and provide a fix or mitigation within 7 days.

## Guidelines for Contributors

- **No secrets in code.** Never commit API keys, tokens, or credentials.
- **Dependency additions require review.** All new dependencies must be approved in a PR review. Run `npm run audit:security` before submitting.
- **Validate external input.** Any data from package.json config, CLI arguments, or environment variables must be validated before use.
- **Use `src/env.mjs`** for all environment variable access — direct `process.env` reads are forbidden by the ESLint config.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
