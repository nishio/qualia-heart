// Run single-turn test utterances through the engine.
//   node tools/eval.mjs eval/<set>.jsonl [--out eval/results/<set>.jsonl]
// Input lines: {"id": "...", "text": "...", "expect": "<topic or intent prefix, optional>", "context": ["prior user turn", ...]}
// Prints hit rate per expected topic; writes one result line per case.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../docs/engine.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const out = oi >= 0 ? args.splice(oi, 2)[1] : null;
const pack = JSON.parse(fs.readFileSync(path.join(root, 'docs/pack/qualia.json'), 'utf8'));
const eng = new Engine(pack, { seed: 1 });

const cases = fs.readFileSync(args[0], 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const rows = [];
const by = new Map();
for (const c of cases) {
  eng.reset();
  for (const p of c.context || []) eng.respond(p);
  const r = eng.respond(c.text);
  const topic = r.kind === 'canon' ? 'canon' : r.kind === 'fallback' ? 'fallback' : r.intent.split('.')[0];
  const hit = c.expect ? (r.intent || '').startsWith(c.expect) || topic === c.expect : null;
  rows.push({ id: c.id, text: c.text, expect: c.expect, kind: r.kind, intent: r.intent, score: +r.score.toFixed(3), reply: r.text, hit, cands: r.candidates });
  const k = c.expect || '(none)';
  const s = by.get(k) || { n: 0, fb: 0, hit: 0 };
  s.n++; if (r.kind === 'fallback') s.fb++; if (hit) s.hit++;
  by.set(k, s);
}
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}
let N = 0, FB = 0, H = 0;
for (const [k, s] of [...by].sort()) {
  N += s.n; FB += s.fb; H += s.hit;
  console.log(`${k.padEnd(14)} n=${String(s.n).padStart(3)} fallback=${String(s.fb).padStart(3)} expected-topic=${String(s.hit).padStart(3)}`);
}
console.log(`TOTAL          n=${N} fallback=${FB} (${(100 * FB / N).toFixed(1)}%) expected-topic=${H} (${(100 * H / N).toFixed(1)}%)`);
