import { readFile, stat, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root = new URL('../', import.meta.url).pathname;
for (const file of ['web/index.html', 'web/styles.css', 'web/assets/mafia.svg', 'web/assets/favicon.svg']) {
  if (!(await stat(path.join(root, file))).size) throw new Error('Empty asset: ' + file);
}
for (const name of await readdir(path.join(root, 'web/js'))) if (name.endsWith('.js')) execFileSync(process.execPath, ['--check', path.join(root, 'web/js', name)], { stdio: 'inherit' });
const html = await readFile(path.join(root, 'web/index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) await stat(path.join(root, 'web', match[1]));
console.log('Static build verified: all modules parse; referenced assets exist; deployment is base-path independent.');
