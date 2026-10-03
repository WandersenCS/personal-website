import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const run = (command, args, allowed = [0]) => {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.error || !allowed.includes(result.status)) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error ?? result.stderr}\n${result.stdout}`);
  }
  return result.stdout;
};
const audit = () => {
  const report = JSON.parse(run('npm', ['audit', '--json'], [0, 1]));
  // Audit exits 1 for vulnerabilities AND registry errors; only a real report is usable.
  if (report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities) {
    throw new Error(`npm audit did not return a vulnerability report: ${JSON.stringify(report)}`);
  }
  return report;
};
const repair = () => {
  // A partial repair exits 1. Keep its successful changes and audit independently.
  console.log(run('npm', ['audit', 'fix', '--no-fund'], [0, 1]));
  return audit();
};
const sections = ['dependencies', 'devDependencies'];
const beforeLock = read('package-lock.json');
const before = audit();
let after = before;
const actions = [];
if (before.metadata.vulnerabilities.total > 0) {
  after = repair();
  actions.push('Applied npm audit fix; retained successful fixes even when vulnerabilities remained.');
}

const source = read('package.hugo.json');
const root = read('package.json');
const workspace = read('packages/hugoautogen/package.json');
const upgraded = [];
// Upgrade affected direct dependencies, including Hugo's workspace tooling. Avoid
// --force: npm can recommend obsolete downgrades that introduce other advisories.
const newer = (candidate, current) => {
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
};
const lock = read('package-lock.json');
for (const [name, vulnerability] of Object.entries(after.vulnerabilities)) {
  const section = sections.find((key) => root[key]?.[name] || workspace[key]?.[name]);
  if (!section) continue;
  const versions = JSON.parse(run('npm', ['view', `${name}@latest`, 'version', '--json']));
  const latest = Array.isArray(versions) ? versions[0] : versions;
  const installed = (vulnerability.nodes ?? []).map((path) => lock.packages[path]?.version).filter(Boolean);
  if (typeof latest !== 'string' || !/^\d+\.\d+\.\d+$/.test(latest) || !installed.length || !installed.every((version) => newer(latest, version))) continue;
  source[section] ??= {};
  root[section] ??= {};
  source[section][name] = root[section][name] = `^${latest}`;
  upgraded.push(`${name}: ${installed.join(', ')} → ^${latest}`);
}
if (upgraded.length) {
  write('package.hugo.json', source);
  write('package.json', root);
  run('hugo', ['mod', 'npm', 'pack']);
  console.log(run('npm', ['install', '--no-audit', '--no-fund']));
  after = repair();
  actions.push('Updated affected direct dependencies to newer releases (may include major upgrades):', ...upgraded.map((item) => `  - ${item}`));
}

const counts = (report) => report.metadata.vulnerabilities;
const lines = [
  'Automated Hugo module and npm dependency update.', '',
  '### npm security audit', '',
  '| Severity | Before | After |', '| --- | ---: | ---: |',
  ...['critical', 'high', 'moderate', 'low', 'info', 'total'].map((severity) => `| ${severity} | ${counts(before)[severity]} | ${counts(after)[severity]} |`),
  '', ...actions.map((action) => `- ${action}`), '',
];
const afterLock = read('package-lock.json');
const changed = Object.entries(afterLock.packages).filter(([path, pkg]) => path && pkg.version && beforeLock.packages[path]?.version !== pkg.version);
lines.push(`Updated ${changed.length} locked dependency entries.`, '');
if (changed.length) {
  lines.push('<details><summary>Dependency version changes</summary>', '',
    ...changed.map(([path, pkg]) => `- ${path}: ${beforeLock.packages[path]?.version ?? 'new'} → ${pkg.version}`),
    '', '</details>', '');
}
if (counts(after).total === 0) {
  lines.push('Final npm audit: **no known vulnerabilities**.');
} else {
  lines.push('Successful fixes are retained. **Remaining vulnerabilities require review:**', '', '| Package | Severity | npm remediation |', '| --- | --- | --- |');
  for (const [name, vulnerability] of Object.entries(after.vulnerabilities)) {
    const fix = vulnerability.fixAvailable;
    const note = typeof fix === 'object' ? `${fix.name}@${fix.version}${fix.isSemVerMajor ? ' (outside current range; may be a downgrade)' : ''}` : fix ? 'npm reports a fix; manual dependency review needed' : 'No fix reported by npm';
    lines.push(`| ${name} | ${vulnerability.severity} | ${note} |`);
  }
  const advisories = new Map();
  for (const vulnerability of Object.values(after.vulnerabilities)) {
    for (const via of vulnerability.via) {
      if (typeof via === 'object') advisories.set(via.url, via.title);
    }
  }
  lines.push('', ...[...advisories].map(([url, title]) => `- [${title}](${url})`));
}
lines.push('', 'The workflow verifies a production Hugo build before creating this PR.');
writeFileSync(process.argv[2] ?? '/tmp/npm-update-report.md', `${lines.join('\n')}\n`);
console.log(`npm audit: ${counts(before).total} → ${counts(after).total} affected packages`);
