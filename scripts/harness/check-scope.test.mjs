import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkScope } from './check-scope.mjs';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'jev-harness-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  const put = (path, text) => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), text); };
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Harness tests');
  put('.harness/othello.json', JSON.stringify({ name: 'othello', owned: ['apps/othello/', 'docs/othello/'], manifest: 'docs/othello/change-scope.json' }));
  put('docs/othello/change-scope.json', JSON.stringify({ base: 'old', sharedChanges: [] }));
  put('apps/existing/index.ts', 'export const unchanged = true;');
  put('apps/othello/index.ts', 'export const game = true;');
  git('add', '.'); git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'baseline');
  const base = git('rev-parse', 'HEAD');
  const run = (extra = {}) => checkScope({ cwd, policyPath: '.harness/othello.json', base, ...extra });
  const manifest = (paths, baseValue = base) => put('docs/othello/change-scope.json', JSON.stringify({ base: baseValue, sharedChanges: paths.map(path => ({ path, reason: 'Reusable backward-compatible change', checks: ['Run affected consumer tests'] })) }));
  return { cwd, put, git, base, run, manifest };
}

test('owned untracked files pass, unrelated-only PR auto skips', t => {
  const f = fixture(t);
  f.put('apps/existing/index.ts', 'export const unchanged = false;');
  assert.equal(f.run({ auto: true }).skipped, true);
  f.put('apps/othello/new.ts', 'export {};');
  assert.match(f.run({ auto: true }).errors.join('\n'), /Undocumented.*apps\/existing/);
});

test('includes committed, staged, unstaged and untracked changes', t => {
  const f = fixture(t);
  f.put('apps/othello/committed.ts', 'export {};'); f.git('add', '.'); f.git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'slice');
  f.put('apps/othello/staged.ts', 'export {};'); f.git('add', '.');
  f.put('apps/othello/index.ts', 'export const game = false;');
  f.put('apps/othello/untracked.ts', 'export {};');
  assert.equal(f.run().files, 4); assert.deepEqual(f.run().errors, []);
});

test('rename from a sibling app is not concealed by owned destination', t => {
  const f = fixture(t); f.git('mv', 'apps/existing/index.ts', 'apps/othello/moved.ts');
  assert.match(f.run().errors.join('\n'), /Undocumented.*apps\/existing\/index.ts/);
});

test('exact shared manifest permits reviewed reuse and rejects stale base', t => {
  const f = fixture(t); f.put('apps/existing/index.ts', 'export const reusable = true;');
  f.manifest(['apps/existing/index.ts']); assert.deepEqual(f.run().errors, []);
  f.manifest(['apps/existing/index.ts'], 'old'); assert.match(f.run().errors.join('\n'), /merge-base/);
});

test('previous manifest cannot silently authorize later PRs', t => {
  const f = fixture(t); f.manifest(['apps/existing/index.ts']); f.git('add', '.'); f.git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'old manifest');
  const nextBase = f.git('rev-parse', 'HEAD'); f.put('apps/existing/index.ts', 'export const later = true;');
  const errors = f.run({ base: nextBase }).errors.join('\n');
  assert.match(errors, /Refresh/); assert.match(errors, /merge-base/);
});

test('wildcard and stale manifest entries fail', t => {
  const f = fixture(t); f.put('apps/existing/index.ts', 'export {};');
  f.manifest(['apps/*']); assert.throws(() => f.run(), /unique exact file/);
  f.manifest(['apps/existing/index.ts', 'packages/unused.ts']);
  assert.match(f.run().errors.join('\n'), /Stale/);
});

test('bad base, traversal policy and symlinks fail closed', t => {
  const f = fixture(t);
  assert.throws(() => f.run({ base: 'missing-ref' }), /Cannot resolve/);
  assert.throws(() => f.run({ policyPath: '../outside.json' }), /unsafe/);
  symlinkSync(join(f.cwd, 'apps/existing/index.ts'), join(f.cwd, 'apps/othello/link.ts'));
  assert.throws(() => f.run(), /Symlink/);
});

test('secrets and public credentials fail without echoing values', t => {
  const f = fixture(t); const fake = ['tsai', 'x'.repeat(24)].join('_');
  f.put('apps/othello/leak.ts', `const key = '${fake}';`);
  f.put('apps/othello/.env', 'VALUE=placeholder');
  f.put('apps/othello/public.ts', ['const VITE_', 'API_KEY = "placeholder";'].join(''));
  const script = fileURLToPath(new URL('./check-scope.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--policy', '.harness/othello.json', '--base', f.base], { cwd: f.cwd, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /typesafe-token/); assert.match(result.stderr, /non-example-env/); assert.match(result.stderr, /public-credential/);
  assert.equal((result.stdout + result.stderr).includes(fake), false);
});

test('clean example env is allowed and ignored local secrets are not inspected', t => {
  const f = fixture(t);
  f.put('apps/othello/.gitignore', '.env\n'); f.put('apps/othello/.env', ['tsai', 'x'.repeat(24)].join('_'));
  f.put('apps/othello/.env.example', 'TYPESAFE_API_KEY=\n');
  assert.deepEqual(f.run().errors, []);
});

test('clean worktree cannot hide staged or committed secrets', t => {
  const f = fixture(t); const fake = ['tsai', 'x'.repeat(24)].join('_');
  f.put('apps/othello/key.ts', `const key = '${fake}';`); f.git('add', '.');
  f.put('apps/othello/key.ts', 'export {};');
  assert.match(f.run().errors.join('\n'), /typesafe-token, index/);
  f.git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture secret');
  assert.match(f.run().errors.join('\n'), /typesafe-token, HEAD/);
});
