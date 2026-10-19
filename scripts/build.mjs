import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const sourceNames = ['theme-init.js', 'styles.css', 'reminder-core.js', 'i18n.js', 'alert-media.js', 'app.js'];
let html = await read('src/template.html');

for (const name of sourceNames) {
  const marker = `@@${name}@@`;
  if (html.split(marker).length !== 2) throw new Error(`Expected one ${marker} in template.`);
  const source = await read(`src/${name}`);
  if (name.endsWith('.js')) new Script(source, { filename: name });
  html = html.replace(marker, () => source);
}
if (/@@[a-z0-9.-]+@@/i.test(html)) throw new Error('Unresolved template marker.');

const worker = await read('src/harucheck-sw.js');
new Script(worker, { filename: 'harucheck-sw.js' });
const outputs = [['harucheck.html', html], ['harucheck-sw.js', worker]];
const checkOnly = process.argv.includes('--check');
for (const [path, content] of outputs) {
  if (checkOnly) {
    const current = (await read(path)).replace(/\r\n/g, '\n');
    if (current !== content.replace(/\r\n/g, '\n')) throw new Error(`${path} is outdated. Run npm run build.`);
  } else {
    await writeFile(new URL(path, root), content, 'utf8');
  }
}
console.log(checkOnly ? 'Build is current; JavaScript syntax is valid.' : `Built ${fileURLToPath(new URL('harucheck.html', root))}`);
