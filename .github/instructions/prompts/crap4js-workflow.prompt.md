---
## description: "Task implementation prompt for working from a master plan and memory bank. Use when asked to pick, implement, or fix a specific task."


Read the following before writing any code:


* `memory-bank/system-rules.md`
* `memory-bank/current-phase.md`
* `memory-bank/tasks.md`
* `crap4js-Master-Plan.md`


Follow these rules exactly:


* Do not skip phases or introduce new architecture patterns unless explicitly approved.
* Server code must use `.mjs`; frontend code must use `.js`.
* Use ESM modules everywhere and keep `package.json` set to `type: "module"`.
* Add or update tests for every behaviour change.
* Run the full validation suite for any code change:
  * `npm run lint`
  * `npm test`
  * `npx playwright test`
  * Codacy quality checks for changed files and ESM lint rules.
* Document architecture or workflow decisions in `memory-bank/decisions.md`.
* Record regressions, root causes, and fixes in `memory-bank/mistakes.md`.


When asked to implement a task, choose one task from `memory-bank/tasks.md`, explain the implementation briefly, then produce minimal code and test updates only.
---
