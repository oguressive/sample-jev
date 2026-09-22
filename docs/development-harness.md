# Development harness

The repository-local `workspace-change-safety` skill keeps app changes isolated and makes shared impact explicit. It does not change runtime configuration.

## Commands (from the repository root; Node 22.12+ and Git)

```sh
node --test scripts/harness/check-scope.test.mjs
node scripts/harness/check-scope.mjs --policy .harness/othello.json --base origin/main
```

The guard uses the merge-base with the supplied ref and includes committed, staged, unstaged and non-ignored untracked paths. Rename source and destination are both checked. A missing base fails with a useful error. For stacked PRs, pass the actual target branch/ref.

CI uses `--auto`: when no owned Othello path changed, the policy skips entirely. Other apps are not forced through Othello requirements. The original CI and npm commands remain intact; a separate read-only PR workflow runs small Node tests and this conditional guard.

## Shared changes

Set `base` in `docs/othello/change-scope.json` to the exact merge-base SHA for the PR. For each changed file outside the policy's owned paths add:

```json
{
  "path": "packages/ui/src/index.tsx",
  "reason": "Add a backward-compatible navigation entry for Othello.",
  "checks": ["List affected consumer builds/tests and their evidence in the PR"]
}
```

Only exact paths are allowed. Refresh the manifest in each PR and use its actual merge base. The script checks that review evidence is declared; it cannot prove the checks passed.

## Secret checks and limits

On active scope checks, changed files are checked in the worktree, index and HEAD for common token/private-key literals, tracked non-example env files and exposed public credential assignments. A worktree edit cannot hide a secret already staged for commit. Ignored local env files are not read. Findings print a path, snapshot and rule only, never the matching text. Symlinks fail closed instead of following files outside the repository. Deleted paths are checked if still present in the index or HEAD. Intermediate historical commits are not scanned.

This is a lightweight accidental-leak guard, not exhaustive secret detection or proof that tests passed. Keep using the repository secret scan, runtime validation, targeted tests and review.

To reuse it for another app, add a policy with `name`, `owned` paths and a `manifest`, then invoke it conditionally in CI.
