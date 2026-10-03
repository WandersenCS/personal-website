import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const updater = resolve('scripts/update-npm-dependencies.mjs');
function fixture(mode) {
  const dir = mkdtempSync(join(tmpdir(), 'dependency-update-'));
  const json = (path, value) => writeFileSync(join(dir, path), JSON.stringify(value));
  mkdirSync(join(dir, 'packages/hugoautogen'), { recursive: true });
  mkdirSync(join(dir, 'bin'));
  json('package.json', { devDependencies: { tool: '^1.0.0' } });
  json('package.hugo.json', { devDependencies: { tool: '^1.0.0' } });
  json('packages/hugoautogen/package.json', { devDependencies: { lint: '^1.0.0' } });
  json('package-lock.json', { packages: { 'node_modules/tool': { version: '1.0.0' }, 'node_modules/lint': { version: '1.0.0' } } });
  writeFileSync(join(dir, 'bin/hugo'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(dir, 'bin/npm'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const mode = process.env.TEST_MODE;
const lock = JSON.parse(fs.readFileSync('package-lock.json'));
const repaired = fs.existsSync('repaired');
if (args[0] === 'view') { console.log(JSON.stringify(['2.0.0'])); process.exit(0); }
if (args[0] === 'install' || args[1] === 'fix') {
  fs.writeFileSync('repaired', 'yes');
  lock.packages['node_modules/tool'].version = '1.1.0';
  if (args[0] === 'install') lock.packages['node_modules/lint'].version = '2.0.0';
  fs.writeFileSync('package-lock.json', JSON.stringify(lock));
  process.exit(args[1] === 'fix' ? 1 : 0);
}
if (mode === 'error') { console.log(JSON.stringify({error:{summary:'registry unavailable'}})); process.exit(1); }
const vulnerabilities = mode === 'upgrade' && lock.packages['node_modules/lint'].version !== '2.0.0'
  ? {lint:{severity:'high',nodes:['node_modules/lint'],via:[],fixAvailable:{name:'lint',version:'2.0.0',isSemVerMajor:true}}}
  : mode === 'upgrade' ? {} : {transitive:{severity:'high',nodes:[],via:[],fixAvailable:false}};
const total = Object.keys(vulnerabilities).length;
console.log(JSON.stringify({vulnerabilities,metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:total,critical:0,total}}}));
process.exit(total ? 1 : 0);
`, { mode: 0o755 });
  const result = spawnSync(process.execPath, [updater, join(dir, 'report.md')], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, TEST_MODE: mode, PATH: `${join(dir, 'bin')}:${process.env.PATH}` },
  });
  return { dir, result, read: (path) => readFileSync(join(dir, path), 'utf8'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('retains partial repairs and reports remaining vulnerabilities', () => {
  const f = fixture('partial');
  try {
    assert.equal(f.result.status, 0, f.result.stderr);
    assert.equal(JSON.parse(f.read('package-lock.json')).packages['node_modules/tool'].version, '1.1.0');
    assert.match(f.read('report.md'), /Remaining vulnerabilities require review/);
    assert.match(f.read('report.md'), /No fix reported by npm/);
    assert.match(f.read('report.md'), /1.0.0 → 1.1.0/);
  } finally { f.cleanup(); }
});
test('upgrades affected workspace dependencies and persists Hugo overrides', () => {
  const f = fixture('upgrade');
  try {
    assert.equal(f.result.status, 0, f.result.stderr);
    assert.equal(JSON.parse(f.read('package.hugo.json')).devDependencies.lint, '^2.0.0');
    assert.equal(JSON.parse(f.read('package.json')).devDependencies.lint, '^2.0.0');
    assert.match(f.read('report.md'), /no known vulnerabilities/);
    assert.match(f.read('report.md'), /lint: 1.0.0 → \^2.0.0/);
  } finally { f.cleanup(); }
});
test('fails on registry errors instead of treating them as vulnerabilities', () => {
  const f = fixture('error');
  try {
    assert.notEqual(f.result.status, 0);
    assert.match(f.result.stderr, /did not return a vulnerability report/);
  } finally { f.cleanup(); }
});
