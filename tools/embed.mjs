// Precompute example embeddings for the semantic layer.
//   node tools/embed.mjs [--pack docs/pack/qualia.json]
// Writes <pack>-emb.bin (int8, one row per example) and <pack>-emb.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from '@huggingface/transformers';
import { MODEL, DTYPE, PREFIX, SCALE, semanticUnits } from '../docs/semantic.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pi = process.argv.indexOf('--pack');
const packFile = pi > 0 ? path.resolve(process.argv[pi + 1]) : path.join(root, 'docs/pack/qualia.json');
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
const units = semanticUnits(pack);
const texts = units.flatMap((u) => u.examples);

const t0 = Date.now();
const extractor = await pipeline('feature-extraction', MODEL, { dtype: DTYPE });
let dim = 0;
const rows = [];
for (let i = 0; i < texts.length; i += 64) {
  const t = await extractor(texts.slice(i, i + 64).map((s) => PREFIX + s), { pooling: 'mean', normalize: true });
  dim = t.dims[1];
  for (let j = 0; j < t.dims[0]; j++) rows.push(t.data.subarray(j * dim, (j + 1) * dim));
}
const data = new Int8Array(rows.length * dim);
rows.forEach((r, i) => { for (let d = 0; d < dim; d++) data[i * dim + d] = Math.max(-127, Math.min(127, Math.round(r[d] * SCALE))); });

const base = packFile.replace(/\.json$/, '');
fs.writeFileSync(`${base}-emb.bin`, data);
fs.writeFileSync(`${base}-emb.json`, JSON.stringify({ model: MODEL, dtype: DTYPE, dim, pack: pack.id, units: units.map((u) => [u.id, u.examples.length]) }));
console.log(`${texts.length} examples x ${dim} -> ${path.relative(root, base)}-emb.bin ${(data.length / 1024 / 1024).toFixed(1)} MiB in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
