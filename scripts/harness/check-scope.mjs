import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function safePath(path, directory = false) {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/') &&
    !/[\\*?\[\]\x00-\x1f:]/.test(path) &&
    !(directory ? path.replace(/\/$/, '') : path).split('/').some(p => !p || p === '..' || p === '.');
}

function regularFile(root, path) {
  // Reject symlinked parents as well as symlinked files, including config files.
  let current = root;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink is not allowed: ${path}`);
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }
  return lstatSync(current).isFile();
}

function jsonFile(root, path) {
  if (!safePath(path) || !regularFile(root, path)) throw new Error(`Missing or unsafe configuration: ${path}`);
  try { return JSON.parse(readFileSync(resolve(root, path), 'utf8')); }
  catch { throw new Error(`Invalid JSON: ${path}`); }
}

function matches(path, patterns) {
  return patterns.some(p => p.endsWith('/') ? path.startsWith(p) : path === p);
}

export function secretRules(path, text) {
  const rules = [];
  if (/^\.env(?:\.|$)/.test(basename(path)) && !path.endsWith('.example')) rules.push('non-example-env-file');
  if (/(?:tsai|ts_live|ts_test)_[A-Za-z0-9_-]{12,}/.test(text)) rules.push('typesafe-token');
  if (/(?:ghp|github_pat)_[A-Za-z0-9_]{20,}/.test(text)) rules.push('github-token');
  const privateKeyKind = 'PRIVATE KEY';
  const privateKeyHeader = new RegExp('-----BEGIN (?:[A-Z]+ )?' + privateKeyKind + '-----');
  if (privateKeyHeader.test(text)) rules.push('private-key');
  if (/(?:VITE_|NEXT_PUBLIC_|PUBLIC_)[A-Z0-9_]*(?:API_KEY|SECRET|TOKEN)["']?\s*[:=]/.test(text)) rules.push('public-credential-assignment');
  return rules;
}

export function checkScope({ cwd = process.cwd(), policyPath, base, auto = false }) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  if (!base || base.startsWith('-') || /[\x00-\x1f]/.test(base)) throw new Error('Supply a valid --base ref.');
  let mergeBase;
  try { mergeBase = git(root, ['merge-base', base, 'HEAD']).trim(); }
  catch { throw new Error('Cannot resolve the base; fetch the target branch and pass --base explicitly.'); }
  const policy = jsonFile(root, policyPath);
  if (typeof policy.name !== 'string' || !Array.isArray(policy.owned) || !policy.owned.length ||
      !policy.owned.every(p => safePath(p, true)) || !safePath(policy.manifest)) {
    throw new Error('Policy requires name, owned paths and a safe manifest path.');
  }
  // Separate diffs retain even paths changed in a commit and restored in the worktree.
  const changed = new Set();
  for (const args of [
    ['diff', '--name-only', '--no-renames', '-z', mergeBase, 'HEAD', '--'],
    ['diff', '--name-only', '--no-renames', '-z', '--cached', '--'],
    ['diff', '--name-only', '--no-renames', '-z', '--'],
    ['ls-files', '--others', '--exclude-standard', '-z'],
  ]) for (const path of git(root, args).split('\0').filter(Boolean)) changed.add(path);
  const paths = [...changed].sort();
  if (!paths.every(p => safePath(p))) throw new Error('Unsafe changed path; review manually.');
  if (auto && !paths.some(p => matches(p, policy.owned))) {
    return { skipped: true, name: policy.name, mergeBase, files: paths.length, shared: [], errors: [] };
  }
  const shared = paths.filter(p => !matches(p, policy.owned));
  const errors = [];
  if (shared.length) {
    const manifest = jsonFile(root, policy.manifest);
    if (!changed.has(policy.manifest)) errors.push('Refresh the scope manifest in this diff for shared changes.');
    if (manifest.base !== mergeBase) errors.push('Scope manifest base must match the PR merge-base SHA.');
    if (!Array.isArray(manifest.sharedChanges)) throw new Error('Manifest requires sharedChanges.');
    const entries = new Map();
    for (const entry of manifest.sharedChanges) {
      if (!entry || !safePath(entry.path) || entries.has(entry.path) ||
          typeof entry.reason !== 'string' || entry.reason.trim().length < 12 ||
          !Array.isArray(entry.checks) || !entry.checks.length ||
          !entry.checks.every(c => typeof c === 'string' && c.trim().length > 5)) {
        throw new Error('Each shared change needs a unique exact file, substantive reason and verification steps.');
      }
      entries.set(entry.path, entry);
    }
    for (const path of shared) if (!entries.has(path)) errors.push(`Undocumented cross-boundary change: ${path}`);
    for (const path of entries.keys()) if (!shared.includes(path)) errors.push(`Stale/non-shared manifest entry: ${path}`);
  }
  for (const path of paths) {
    const snapshots = [];
    if (regularFile(root, path)) snapshots.push(['worktree', readFileSync(resolve(root, path), 'utf8')]);
    // A clean worktree must not conceal a staged or already committed credential.
    for (const [label, ref] of [['index', `:${path}`], ['HEAD', `HEAD:${path}`]]) {
      try { snapshots.push([label, git(root, ['show', ref])]); }
      catch { /* New or deleted paths need not exist in every snapshot. */ }
    }
    for (const [label, text] of snapshots) {
      for (const rule of secretRules(path, text)) errors.push(`Potential secret: ${path} (${rule}, ${label})`);
    }
  }
  return { skipped: false, name: policy.name, mergeBase, files: paths.length, shared, errors };
}

function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--auto') options.auto = true;
    else if (args[i] === '--policy' || args[i] === '--base') {
      const key = args[i] === '--policy' ? 'policyPath' : 'base';
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${args[i]}`);
      options[key] = args[++i];
    } else throw new Error('Usage: node scripts/harness/check-scope.mjs --policy FILE --base REF [--auto]');
  }
  if (!options.policyPath) throw new Error('Supply --policy.');
  const result = checkScope(options);
  console.log(`${result.name}: ${result.skipped ? 'SKIP (no owned changes)' : result.errors.length ? 'FAIL' : 'PASS'}; ${result.files} changed paths`);
  for (const path of result.shared) console.log(`Shared review: ${path}`);
  for (const error of result.errors) console.error(error);
  if (result.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`Harness error: ${error.message}`); process.exitCode = 1; }
}
