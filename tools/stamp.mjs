// Stamp a content hash into docs/index.html (?v=...) so browsers fetch new code
// and data after every change instead of reusing cached copies.
//   node tools/stamp.mjs
// app.js passes its own ?v= on to engine.js, the worker and the pack files.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const docs = path.join(root, 'docs');
const files = ['app.js', 'engine.js', 'semantic.js', 'sem-worker.js', 'style.css', 'pack/qualia.json', 'pack/qualia-emb.json', 'pack/qualia-emb.bin'];
const h = crypto.createHash('sha256');
for (const f of files) {
  const p = path.join(docs, f);
  if (fs.existsSync(p)) h.update(f).update(fs.readFileSync(p));
}
const v = h.digest('hex').slice(0, 10);
const index = path.join(docs, 'index.html');
const html = fs.readFileSync(index, 'utf8');
const out = html.replace(/(href="style\.css|src="app\.js)(\?v=[0-9a-f]+)?"/g, `$1?v=${v}"`);
if (out !== html) fs.writeFileSync(index, out);
console.log(`stamped v=${v}`);
