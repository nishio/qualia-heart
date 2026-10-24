// Grid-search engine options on a labelled single-turn set.
//   node tools/tune.mjs eval/heldout.jsonl
// Proxy metric: an answer counts as on-topic when its intent's topic equals `expect`
// or when it is a canon quote (judged separately). Reported per case:
//   right = answered on-topic, wrong = answered off-topic, the rest fell back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../docs/engine.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pack = JSON.parse(fs.readFileSync(path.join(root, 'docs/pack/qualia.json'), 'utf8'));
const topics = new Set(pack.intents.map((i) => i.topic));
const cases = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.trim())
  .map((l) => JSON.parse(l)).filter((c) => topics.has(c.expect));

const pct = (x) => `${(100 * x / cases.length).toFixed(0)}%`.padStart(4);
// a candidate between `low` and the threshold is accepted when it leads the
// runner-up (any other unit) by at least `margin`
for (const [low, margin] of [[1, 0], [0.22, 0.05], [0.22, 0.08], [0.2, 0.1]]) {
  {
    const eng = new Engine(pack, { seed: 1 });
    const tops = cases.map((c) => {
      eng.reset();
      const cands = eng.score(c.text);
      const best = cands.find((x) => x.unit.kind !== 'canon');
      const lead = best ? best.score - (cands.find((x) => x !== best)?.score || 0) : 0;
      return { c, best, lead, canon: cands.find((x) => x.unit.kind === 'canon') };
    });
    for (const th of [0.3, 0.35]) {
      const cth = 0.45;
      let right = 0, wrong = 0, canonN = 0;
      for (const { c, best, canon, lead } of tops) {
        const ok = (x) => x && (x.unit.kind === 'canon' ? x.score >= cth
          : x.score >= th || (x.score >= low && lead >= margin));
        const pick = [best, canon].filter(ok).sort((a, b) => b.score - a.score)[0];
        if (!pick) continue;
        if (pick.unit.kind === 'canon') { canonN++; right++; } else if (pick.unit.topic === c.expect) right++; else wrong++;
      }
      console.log(`low=${low} margin=${margin} th=${th.toFixed(2)}  right ${pct(right)}  wrong ${pct(wrong)}  fallback ${pct(cases.length - right - wrong)}  canon ${canonN}`);
    }
  }
}
