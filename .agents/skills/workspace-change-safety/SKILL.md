---
name: workspace-change-safety
description: Keep app additions and shared-package changes isolated and reviewable in sample-jev. Use for implementation, API integration, dependency changes and regression reviews.
---

# Keep changes isolated

1. Inspect the worktree, target scripts, dependencies and tests; identify the PR base.
2. Keep app-specific code/styles local. For shared changes, record the exact files, reason and affected consumers.
3. Validate external/model responses at runtime. Keep credentials on the server; do not run paid live tests implicitly.
4. Run the target's real typecheck/tests/build, then affected consumer checks. Use `npm run check` for shared runtime or root dependency changes.
5. Review the diff for unrelated edits, dependency churn and secrets. Report commands, results, mock/live boundaries and unverified gaps.

Use `docs/development-harness.md` when a scoped policy is present.
