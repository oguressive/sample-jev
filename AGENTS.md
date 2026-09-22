# Repository development

- Read the target workspace and nearby instructions before editing. Preserve unrelated apps and dependencies.
- Use `.agents/skills/workspace-change-safety/SKILL.md` for app additions and shared changes.
- Keep credentials server-side and out of source, client bundles, fixtures, logs and PR text.
- Put app-specific code and styles in that app. Explain and verify every shared-package change.
- Run the target workspace checks first; run `npm run check` for shared runtime or root dependency changes.
- Report mock, browser and live API verification separately. Never claim an unavailable check passed.

Harness usage: `docs/development-harness.md`.
