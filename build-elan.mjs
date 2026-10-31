import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcName = 'elan-social.original.html';
const outName = 'elan-social.html';

const src = path.join(here, srcName);
const out = path.join(here, outName);
const css = readFileSync(path.join(here, 'elan-enhance.css'), 'utf8');
const js = readFileSync(path.join(here, 'elan-enhance.js'), 'utf8');

if (!existsSync(src)) throw new Error(`missing ${srcName}`);
let html = readFileSync(src, 'utf8');
if (html.includes('elan-enhance:start')) throw new Error(`${srcName} already contains the enhancement layer`);

// 1. make the CDN font stylesheets non-blocking: a hung CDN must not delay first paint or script execution
const fonts = [
  'https://cdn.jsdelivr.net/npm/@fontsource-variable/manrope@5.2.8/index.css',
  'https://cdn.jsdelivr.net/npm/@fontsource-variable/noto-sans-sc@5.2.10/index.css',
];
let fontPatched = 0;
for (const url of fonts) {
  const before = `<link href="${url}" rel="stylesheet">`;
  const after = `<link href="${url}" rel="stylesheet" media="print" onload="this.media='all'">`;
  if (html.includes(before)) { html = html.split(before).join(after); fontPatched += 1; }
}

// 2. append the enhancement layer before </body>
const block =
  '<style id="elan-enhance-css">\n' + css + '\n</style>\n' +
  '<script id="elan-enhance-js">\n' + js + '\n</script>\n';

const at = html.lastIndexOf('</body>');
if (at === -1) throw new Error('no </body> in source');
html = html.slice(0, at) + '<!-- elan-enhance:start -->\n' + block + '<!-- elan-enhance:end -->\n' + html.slice(at);

writeFileSync(out, html, 'utf8');
console.log(JSON.stringify({
  out: outName,
  bytes: Buffer.byteLength(html),
  fontPatched,
  styleTags: (html.match(/<style/g) || []).length,
  scriptTags: (html.match(/<script/g) || []).length,
}));
