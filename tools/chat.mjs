// Talk to the engine from a terminal.
//   node tools/chat.mjs                         interactive (one line per turn)
//   node tools/chat.mjs --state s.json "text"   one turn, conversation state kept in s.json
//   options: --seed N, --json, --debug, --pack <file>
//   kind in --debug output: intent / pattern / canon / more (follow-up answered from `more`) / fallback
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Engine } from '../docs/engine.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args.splice(i, 2)[1]; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const stateFile = opt('--state');
const seed = opt('--seed');
const asJson = flag('--json');
const debug = flag('--debug');

const packFile = opt('--pack') || path.join(root, 'docs/pack/qualia.json');
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
const eng = new Engine(pack, { seed: seed != null ? +seed : undefined });
if (stateFile && fs.existsSync(stateFile)) eng.load(JSON.parse(fs.readFileSync(stateFile, 'utf8')));

const show = (r) => {
  if (asJson) return console.log(JSON.stringify(r));
  console.log(r.text);
  if (debug) console.log(`  [${r.kind} ${r.response} ${r.score.toFixed(3)}] ${r.candidates.map((c) => `${c.id}:${c.score}`).join(' ')}`);
};

if (args.length) {
  for (const a of args) show(eng.respond(a));
  if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(eng.state));
} else {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => { if (line.trim()) show(eng.respond(line)); });
  rl.on('close', () => { if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(eng.state)); });
}
