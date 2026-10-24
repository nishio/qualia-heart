// Find context intents that shadow `more`: they answer a generic follow-up
// ("なんで？", "たとえば？") after many different intents, so the follow-up never
// reaches the previous intent's own `more`.
//   node tools/lint-shadow.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../docs/engine.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pack = JSON.parse(fs.readFileSync(path.join(root, 'docs/pack/qualia.json'), 'utf8'));
const generic = new Set(pack.intents.filter((i) => i.followup).flatMap((i) => i.examples.map(normalize)));
const byId = new Map(pack.intents.map((i) => [i.id, i]));

let n = 0;
for (const it of pack.intents) {
  if (!it.context || it.followup) continue;
  const g = it.examples.filter((e) => generic.has(normalize(e)));
  if (g.length < 2 || g.length / it.examples.length < 0.4) continue;
  // which previous intents does it cover, and do they have `more`?
  const prev = new Set(it.context.map((c) => c.split('/')[0]));
  const withMore = [...prev].filter((p) => byId.get(p)?.more?.length);
  if (!withMore.length) continue;
  n++;
  console.log(`${it.id}  generic examples ${g.length}/${it.examples.length}  covers ${prev.size} intents (${withMore.length} with more): ${g.slice(0, 4).join(' / ')}`);
}
console.log(`${n} context intents shadow \`more\``);
