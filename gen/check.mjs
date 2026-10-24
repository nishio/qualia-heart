// Validate one generated rule file: node gen/check.mjs gen/out/<topic>.json
// Exit code 1 on errors. Warnings are advisory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../docs/engine.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

const ID = /^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/;
const sentences = (t) => t.split(/(?<=[。！？!?])/u).map((s) => s.trim()).filter(Boolean).length;
const endsWithQuestion = (t) => /[？?]\s*$/u.test(t);

export function checkFile(file, { quiet = false } = {}) {
  errors.length = 0;
  warns.length = 0;
  quietMode = quiet;
  let d;
  try {
    d = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(`JSON として読めない: ${e.message}`);
    return report(file);
  }
  const topic = d.topic;
  if (!topic) err('topic がない');
  if (topic === 'canon-index') checkCanon(d);
  else checkIntents(d, topic);
  return report(file);
}

function checkTemplates(where, text) {
  const bad = text.match(/\{[^}]*\}/g)?.filter((m) => !/^\{[a-z0-9_]+(\|[^}]*)?\}$/.test(m));
  if (bad?.length) err(`${where}: テンプレートの書式が不正 ${bad.join(' ')}`);
}

function checkIntents(d, topic) {
  if (!Array.isArray(d.intents)) return err('intents が配列でない');
  const ids = new Set();
  const respIds = new Set();
  for (const it of d.intents) {
    if (!ID.test(it.id || '')) err(`id が不正: ${it.id}`);
    if (!String(it.id).startsWith(topic + '.')) err(`id が topic で始まらない: ${it.id}`);
    if (ids.has(it.id)) err(`id が重複: ${it.id}`);
    ids.add(it.id);
    for (const r of it.responses || []) if (r.id) respIds.add(`${it.id}/${r.id}`);
  }
  ids.add(`${topic}.fallback`);
  for (const r of d.fallback || []) if (r.id) respIds.add(`${topic}.fallback/${r.id}`);

  const seen = new Map();
  let total = 0, q = 0, hs = 0, oneSent = 0, moreN = 0, noMore = 0;
  for (const it of d.intents) {
    const ex = it.examples || [];
    const rs = it.responses || [];
    const ctx = !!it.context;
    if (!ex.length && !it.pattern) err(`${it.id}: examples が空（pattern だけの意図なら examples: [] と pattern を書く）`);
    if (!rs.length) err(`${it.id}: responses が空`);
    if (!ctx && !it.pattern && ex.length < 12) warn(`${it.id}: 例文が少ない (${ex.length})`);
    if (!ctx && rs.length < 3) warn(`${it.id}: 返答が少ない (${rs.length})`);
    for (const e of ex) {
      const n = normalize(e);
      if (!n) { warn(`${it.id}: 正規化すると空になる例文 "${e}"`); continue; }
      const prev = seen.get(n);
      if (prev && prev !== it.id) warn(`例文 "${e}" が ${prev} と ${it.id} で重複`);
      seen.set(n, it.id);
    }
    if (it.context) {
      if (!Array.isArray(it.context)) err(`${it.id}: context は配列`);
      else for (const c of it.context) if (!ids.has(c) && !respIds.has(c)) err(`${it.id}: context の参照先がない ${c}`);
    }
    if (it.pattern) {
      try { new RegExp(it.pattern, 'u'); } catch (e) { err(`${it.id}: pattern が不正 ${e.message}`); }
    }
    let one = false;
    for (const r of rs) checkResponse(it.id, r, ids);
    for (const r of it.more || []) checkResponse(`${it.id} (more)`, r, ids);
    if (it.more && !Array.isArray(it.more)) err(`${it.id}: more は配列`);
    if (it.followup && topic !== 'generic') warn(`${it.id}: followup は generic.json 以外では使わない想定`);
    moreN += (it.more || []).length;
    if (!ctx && !it.followup && !(it.more || []).length) noMore++;
    for (const r of rs) {
      total++;
      if (endsWithQuestion(r.text)) q++;
      if (/ホモ.?サピエンス|HS/u.test(r.text)) hs++;
      if (sentences(r.text) <= 1) { one = true; oneSent++; }
    }
    if (!ctx && !one) warn(`${it.id}: 1文の返答がない`);
  }
  for (const r of d.fallback || []) { checkResponse(`${topic}.fallback`, r, ids); total++; if (endsWithQuestion(r.text)) q++; }
  if (total && q / total > 0.2) warn(`質問で終わる返答が ${(100 * q / total).toFixed(0)}% (目安 20% 以下)`);
  if (total && hs / total > 0.15) warn(`HS/ホモ・サピエンスを含む返答が ${(100 * hs / total).toFixed(0)}% (多すぎないか)`);
  const exN = d.intents.reduce((a, i) => a + (i.examples?.length || 0), 0);
  if (noMore && topic !== 'generic') warn(`more の無い通常意図が ${noMore} 個`);
  console.log(`intents ${d.intents.length} (context ${d.intents.filter((i) => i.context).length}), examples ${exN}, responses ${total}, more ${moreN}, 1-sentence ${oneSent}, question-ending ${q}, fallback ${(d.fallback || []).length}`);
}

function checkResponse(where, r, ids) {
  if (typeof r.text !== 'string' || !r.text.trim()) return err(`${where}: text がない`);
  checkTemplates(where, r.text);
  for (const m of r.text.matchAll(/\{([a-z0-9_]+)\}/g)) {
    if (!(r.requires || []).includes(m[1])) err(`${where}: {${m[1]}} に既定値も requires もない（記憶が無いと文が崩れる）: "${r.text.slice(0, 30)}"`);
  }
  if (r.id && !/^[a-z0-9_-]+$/.test(r.id)) err(`${where}: response id が不正 ${r.id}`);
  for (const n of r.next || []) if (!ids.has(n)) err(`${where}: next の参照先がない ${n}`);
  if (/お手伝い|素晴らしい質問|何でも聞いて/u.test(r.text)) warn(`${where}: アシスタント口調 "${r.text.slice(0, 30)}"`);
  for (const v of Object.values(r.set || {})) checkTemplates(where, String(v));
}

function checkCanon(d) {
  const canon = JSON.parse(fs.readFileSync(path.join(root, 'data/canon.json'), 'utf8'));
  const byId = new Map(canon.entries.map((e) => [e.id, e]));
  const seen = new Set();
  for (const c of d.canon || []) {
    const e = byId.get(c.id);
    if (!e) { err(`正典 id がない: ${c.id}`); continue; }
    if (seen.has(c.id)) err(`正典 id が重複: ${c.id}`);
    seen.add(c.id);
    if (!c.examples?.length) err(`${c.id}: examples が空`);
    if (!c.quote) { err(`${c.id}: quote がない`); continue; }
    if (!normalize(e.text).includes(normalize(c.quote))) err(`${c.id}: quote が正典本文の逐語部分でない`);
  }
  console.log(`canon entries ${(d.canon || []).length}, examples ${(d.canon || []).reduce((a, c) => a + (c.examples?.length || 0), 0)}`);
}

let quietMode = false;

function report(file) {
  if (!quietMode) for (const w of warns) console.log('WARN ', w);
  for (const e of errors) console.log('ERROR', e);
  console.log(errors.length ? `NG: ${path.basename(file)} errors ${errors.length}` : `OK: ${path.basename(file)} (warnings ${warns.length})`);
  return errors.length === 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ok = checkFile(process.argv[2]);
  process.exit(ok ? 0 : 1);
}
