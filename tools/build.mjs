// Merge gen/out/*.json into docs/pack/qualia.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFile } from '../gen/check.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'gen/out');
// --out <file>: write the pack elsewhere (parallel workers must not share docs/pack)
const oi = process.argv.indexOf('--out');
const packFile = oi > 0 ? path.resolve(process.argv[oi + 1]) : path.join(root, 'docs/pack/qualia.json');
const canonSrc = JSON.parse(fs.readFileSync(path.join(root, 'data/canon.json'), 'utf8'));
const canonById = new Map(canonSrc.entries.map((e) => [e.id, e]));

const pack = {
  version: new Date().toISOString().slice(0, 10),
  attribution: canonSrc.license,
  intents: [],
  fallback: [],
  canon: [],
};
let failed = false;
const seen = new Set();

for (const f of fs.readdirSync(outDir).filter((f) => f.endsWith('.json')).sort()) {
  const file = path.join(outDir, f);
  if (!checkFile(file, { quiet: true })) { failed = true; continue; }
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (d.topic === 'canon-index') {
    for (const c of d.canon) {
      if (seen.has(c.id)) { console.log(`ERROR 正典 id が複数ファイルにある: ${c.id}`); failed = true; continue; }
      seen.add(c.id);
      pack.canon.push({ id: c.id, examples: c.examples, lead: c.lead || '', quote: c.quote, sources: canonById.get(c.id).sources });
    }
    continue;
  }
  for (const it of d.intents) {
    if (seen.has(it.id)) { console.log(`ERROR 意図 id が複数ファイルにある: ${it.id}`); failed = true; continue; }
    seen.add(it.id);
    const o = {
      id: it.id,
      topic: d.topic,
      examples: it.examples,
      responses: it.responses.map((r, i) => ({ ...r, id: `${it.id}/${r.id ?? i}` })),
    };
    if (it.more?.length) o.more = it.more.map((r, i) => ({ ...r, id: `${it.id}/more-${r.id ?? i}` }));
    if (it.followup) o.followup = true;
    if (it.context) o.context = it.context;
    if (it.pattern) o.pattern = it.pattern;
    if (it.priority) o.priority = it.priority;
    pack.intents.push(o);
  }
  for (const [i, r] of (d.fallback || []).entries()) {
    pack.fallback.push({ ...r, id: `${d.topic}.fallback/${r.id ?? i}`, intent: `${d.topic}.fallback` });
  }
}

const json = JSON.stringify(pack);
fs.mkdirSync(path.dirname(packFile), { recursive: true });
fs.writeFileSync(packFile, json);
const n = (a, k) => a.reduce((s, x) => s + x[k].length, 0);
console.log(`intents ${pack.intents.length} (context ${pack.intents.filter((i) => i.context).length}), examples ${n(pack.intents, 'examples')}, responses ${n(pack.intents, 'responses')}, fallback ${pack.fallback.length}, canon ${pack.canon.length} (examples ${n(pack.canon, 'examples')})`);
console.log(`${path.relative(root, packFile)} ${(json.length / 1024).toFixed(0)} KiB (chars)`);
process.exit(failed ? 1 : 0);
