// Qualia Heart engine: rule-based dialogue over a generated persona pack.
// No dependencies; runs in the browser and in Node (ES module).

export function normalize(s) {
  s = String(s).normalize('NFKC').toLowerCase();
  // katakana -> hiragana
  s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  // drop whitespace, punctuation and symbols
  return s.replace(/[\s\p{P}\p{S}]/gu, '');
}

function grams(s) {
  const p = '\u0002' + s + '\u0003';
  const out = new Map();
  const add = (g, w) => out.set(g, (out.get(g) || 0) + w);
  for (const ch of s) add(ch, 0.5);
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i + n <= p.length; i++) add(p.slice(i, i + n), 1);
  }
  return out;
}

export function expand(text, memory) {
  return text.replace(/\{([a-z0-9_]+)(?:\|([^}]*))?\}/g, (_, k, d) =>
    memory[k] != null && memory[k] !== '' ? String(memory[k]) : d ?? '');
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULTS = {
  threshold: 0.3,      // minimum score to answer from an intent (tools/tune.mjs)
  canonThreshold: 0.45, // canon quotes need a closer match
  marginLow: 0.2,      // below the threshold, the top intent is still taken from this score...
  margin: 0.1,         // ...when it leads the runner-up by this much
  semThreshold: 0.92,  // semantic layer: minimum embedding similarity (multilingual-e5-small)
  crisisPrefix: 'life.crisis',          // intents that start the care period
  careTurns: 6,                         // turns after a crisis reply that stay in care
  careTopics: ['life', 'daily', 'generic'],
  careUnits: ['life.crisis_still', 'life.crisis'], // answer from these when another topic would
  contextBoost: 0.12,  // intent whose context matches the previous bot turn
  nextBoost: 0.06,     // intent listed in the previous response's `next`
  recentSize: 40,      // responses remembered to avoid repetition
  priorityFloor: 0.3,  // similarity needed before an intent's priority counts
  idfBy: 'unit',       // 'unit' or 'example'
  segmentWeight: 0.9,  // clause-level similarity counts at this weight (0 = whole input only)
  coverWeight: 0,      // weight of "input contains the example" (0 = cosine only)
  coverMinLen: 6,      // examples shorter than this never match by containment
};

export class Engine {
  constructor(pack, opts = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.rand = opts.seed != null ? mulberry32(opts.seed) : Math.random;
    this.units = [];  // intents and canon entries, uniformly
    this.fallback = pack.fallback || [];
    for (const it of pack.intents) {
      this.units.push({
        ...it,
        kind: 'intent',
        re: it.pattern ? new RegExp(it.pattern, 'u') : null,
      });
    }
    for (const c of pack.canon || []) {
      this.units.push({
        id: c.id,
        kind: 'canon',
        examples: c.examples,
        responses: [{ id: c.id, text: (c.lead ? c.lead + ' ' : '') + c.quote }],
        sources: c.sources,
      });
    }
    this.byId = new Map(this.units.map((u) => [u.id, u]));
    this.awaited = new Set(this.units.flatMap((u) => u.context || []));
    this.#index();
    this.reset();
  }

  #index() {
    const docs = [];
    this.units.forEach((u, ui) => {
      for (const ex of u.examples) {
        const n = normalize(ex);
        docs.push({ ui, g: grams(n), len: [...n].length });
      }
    });
    this.docLen = docs.map((d) => d.len);
    // document frequency per unit (intent) by default: a phrase shared by many
    // intents ("〜についてどう思う") carries little information about which one is meant
    const df = new Map();
    let N;
    if (this.opts.idfBy === 'example') {
      for (const d of docs) for (const g of d.g.keys()) df.set(g, (df.get(g) || 0) + 1);
      N = docs.length;
    } else {
      const per = this.units.map(() => new Set());
      for (const d of docs) for (const g of d.g.keys()) per[d.ui].add(g);
      for (const s of per) for (const g of s) df.set(g, (df.get(g) || 0) + 1);
      N = this.units.length;
    }
    this.idf = new Map();
    for (const [g, n] of df) this.idf.set(g, Math.log(1 + N / n));
    this.defaultIdf = Math.log(1 + N);
    this.postings = new Map();
    this.docUnit = [];
    docs.forEach((d, di) => {
      const v = this.#weigh(d.g);
      this.docUnit.push(d.ui);
      for (const [g, w] of v) {
        let p = this.postings.get(g);
        if (!p) this.postings.set(g, (p = []));
        p.push(di, w);
      }
    });
  }

  #weigh(gm) {
    const v = new Map();
    let norm = 0;
    for (const [g, tf] of gm) {
      const w = tf * (this.idf.get(g) ?? this.defaultIdf);
      v.set(g, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [g, w] of v) v.set(g, w / norm);
    return v;
  }

  reset() {
    this.state = { turn: 0, memory: {}, last: null, recent: [] };
  }

  load(state) {
    this.state = { turn: 0, memory: {}, last: null, recent: [], ...state };
  }

  #contextMatches(unit) {
    const last = this.state.last;
    if (!unit.context) return true;
    if (!last) return false;
    return unit.context.some((c) => c === last.intent || c === last.response);
  }

  // Split a message into clauses. A leading back-channel ("なるほど。でも…") or
  // a second question should not decide the match on its own.
  static segments(input) {
    const len = (s) => [...normalize(s)].length;
    let parts = String(input).split(/[。．.？?！!\n]+/u).map((s) => s.trim()).filter(Boolean);
    // a short lead set off by a comma, space or laugh: "あはは、確かに" "てかさ、宇宙人って"
    parts = parts.flatMap((p) => {
      const m = p.match(/^([^、,\s]{1,6}?)(?:[、,\s]+|[wｗ笑]+)(.+)$/u);
      return m && len(m[2]) >= 3 ? [m[1], m[2]] : [p];
    });
    parts = parts.flatMap((p) => p.split(/(?<=[、,\swｗ笑])\s*(?=でも|けど|だけど|じゃあ|ただ|てか|ていうか|それより)/u))
      .map((s) => s.trim()).filter(Boolean);
    // leading greetings and back-channels give way to the content after them
    while (parts.length > 1 && len(parts[0]) <= 6 && parts.slice(1).some((s) => len(s) >= 5)) parts.shift();
    // so does a trailing laugh ("〜だよね 笑")
    while (parts.length > 1 && len(parts.at(-1)) <= 2 && parts.some((s) => len(s) >= 5)) parts.pop();
    return parts.length === 1 && len(parts[0]) === len(input) ? [] : parts;
  }

  // Score every unit against the input; returns sorted candidates.
  score(input) {
    const raw = String(input).normalize('NFKC').toLowerCase();
    const segs = this.opts.segmentWeight > 0 ? Engine.segments(input) : [];
    // short clauses (back-channels) are dropped from the text that is matched as a whole
    const best = this.#similarity(segs.length ? segs.join('。') : input);
    if (segs.length < 2) segs.length = 0;
    for (const seg of segs) {
      const s = this.#similarity(seg);
      for (let ui = 0; ui < best.length; ui++) {
        const v = this.opts.segmentWeight * s[ui];
        if (v > best[ui]) best[ui] = v;
      }
    }
    const next = new Set(this.state.last?.next || []);
    const out = [];
    this.units.forEach((u, ui) => {
      if (!this.#contextMatches(u)) return;
      let s = best[ui];
      let match = null;
      if (u.re) {
        match = u.re.exec(raw);
        if (match) s = Math.max(s, 1);
      }
      if (s <= 0) return;
      if (u.context) s += this.opts.contextBoost;
      if (next.has(u.id)) s += this.opts.nextBoost;
      // priority breaks near-ties; it must not lift a weak match over the threshold
      if (u.priority && (match || best[ui] >= this.opts.priorityFloor)) s += u.priority;
      out.push({ unit: u, score: s, match });
    });
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  // Best example similarity per unit for one piece of text.
  #similarity(text) {
    const q = this.#weigh(grams(normalize(text)));
    const best = new Float64Array(this.units.length);
    const acc = new Map();
    // cover[di]: share of the example's weight that also occurs in the input.
    // Cosine alone falls as the input grows; a long input that contains a whole
    // example should still count as a match.
    const cover = new Map();
    for (const [g, w] of q) {
      const p = this.postings.get(g);
      if (!p) continue;
      for (let i = 0; i < p.length; i += 2) {
        acc.set(p[i], (acc.get(p[i]) || 0) + w * p[i + 1]);
        cover.set(p[i], (cover.get(p[i]) || 0) + p[i + 1] * p[i + 1]);
      }
    }
    const cw = this.opts.coverWeight;
    for (const [di, s0] of acc) {
      const ui = this.docUnit[di];
      let s = s0;
      if (cw > 0 && this.docLen[di] >= this.opts.coverMinLen) s = Math.max(s, cw * cover.get(di));
      if (s > best[ui]) best[ui] = s;
    }
    return best;
  }

  #pick(responses, key, mem = this.state.memory) {
    const ok = responses.filter((r) => !r.requires || r.requires.every((k) => mem[k] != null && mem[k] !== ''));
    if (!ok.length) return null;
    const recent = this.state.recent;
    // prefer the least recently used; unseen responses first
    const age = (r) => {
      const i = recent.lastIndexOf(key(r));
      return i < 0 ? Infinity : recent.length - i;
    };
    const maxAge = Math.max(...ok.map(age));
    const pool = ok.filter((r) => age(r) === maxAge);
    return pool[Math.floor(this.rand() * pool.length)];
  }

  // opts.semantic: [{id, score}] from the semantic layer, best first (optional)
  respond(input, opts = {}) {
    const st = this.state;
    st.turn++;
    const cands = this.score(input);
    let chosen = null;
    // a weak top intent is still taken when nothing else comes close to it
    const top = cands[0];
    const clearLead = top && top.unit.kind !== 'canon' && top.score >= this.opts.marginLow &&
      top.score - (cands[1]?.score || 0) >= this.opts.margin;
    const floor = Math.min(this.opts.threshold, this.opts.canonThreshold, clearLead ? top.score : 1);
    for (const c of cands) {
      if (c.score < floor) break;
      // canon quotes have their own, higher threshold; a canon candidate below it
      // must not hide an intent further down that clears the intent threshold
      const th = c.unit.kind === 'canon' ? this.opts.canonThreshold : this.opts.threshold;
      if (c.score < th && !(clearLead && c === top)) continue;
      if (c.unit.kind === 'canon' && st.recent.includes(c.unit.id)) continue;
      // a context reply that has been used up gives way (e.g. to `more` for a follow-up)
      if (c.unit.context && c.unit.responses.every((r) => st.recent.includes(r.id))) continue;
      // a generic follow-up ("なんで？", "たとえば？") is answered from the
      // `more` of whatever was being talked about, if anything is left there
      if (c.unit.followup) {
        const prev = this.byId.get(st.last?.intent);
        const r = prev?.more && this.#pick(prev.more.filter((m) => !st.recent.includes(m.id)), (m) => m.id);
        if (r) { chosen = { ...c, unit: prev, response: r, captured: {}, more: true }; break; }
      }
      // values captured by this input count as remembered when choosing a response
      const captured = {};
      for (const [k, v] of Object.entries(c.match?.groups || {})) if (v?.trim()) captured[k] = v.trim();
      const r = this.#pick(c.unit.responses, (r) => r.id, { ...st.memory, ...captured });
      if (r) { chosen = { ...c, response: r, captured }; break; }
    }
    // semantic layer (optional): when the n-gram match finds nothing, take the
    // closest unit by meaning if it is close enough
    if (!chosen && opts.semantic) {
      for (const s of opts.semantic) {
        if (s.score < this.opts.semThreshold) break;
        const unit = this.byId.get(s.id);
        if (!unit || unit.context || unit.followup) continue;
        if (unit.kind === 'canon' && st.recent.includes(unit.id)) continue;
        const r = this.#pick(unit.responses, (r) => r.id);
        if (r) { chosen = { unit, score: s.score, response: r, captured: {}, semantic: true }; break; }
      }
    }
    // care: for a few turns after a crisis reply, only plain-talk topics answer.
    // A sharp opinion (e.g. on the value of a life) must not follow a crisis.
    if (st.care > 0) {
      st.care--;
      const safe = chosen && chosen.unit.kind === 'intent' && this.opts.careTopics.includes(chosen.unit.id.split('.')[0]);
      if (!safe) {
        const units = this.opts.careUnits.map((id) => this.byId.get(id)).filter(Boolean);
        // unused care replies first; repeating one is still better than a sharp opinion
        const fresh = units.flatMap((u) => u.responses.filter((x) => !st.recent.includes(x.id)).map((r) => [u, r]));
        const pool = fresh.length ? fresh : units.flatMap((u) => u.responses.map((r) => [u, r]));
        if (pool.length) {
          const [unit, response] = pool[Math.floor(this.rand() * pool.length)];
          chosen = { unit, score: chosen?.score || 0, response, captured: {}, care: true };
        }
      }
    }
    if (chosen?.unit.id.startsWith(this.opts.crisisPrefix)) st.care = this.opts.careTurns;
    let result;
    if (chosen) {
      const { unit, response, match, captured } = chosen;
      Object.assign(st.memory, captured);
      result = {
        kind: chosen.more ? 'more' : unit.kind === 'canon' ? 'canon' : match ? 'pattern' : 'intent',
        intent: unit.id,
        response: response.id,
        score: chosen.score,
        text: expand(response.text, st.memory),
        sources: unit.sources,
        via: chosen.care ? 'care' : chosen.semantic ? 'semantic' : 'ngram',
      };
      this.#apply(response);
      st.last = { intent: unit.id, response: response.id, next: response.next || [] };
    } else {
      // after a miss, do not keep switching topics: prefer fallbacks that do not lead elsewhere
      // (a fallback leads elsewhere when it has `next` or a context reply waits for it)
      const plain = this.fallback.filter((r) => !r.next?.length && !this.awaited.has(r.id));
      const pool = st.misses >= 1 && plain.length ? plain : this.fallback;
      const r = this.#pick(pool, (r) => r.id);
      result = { kind: 'fallback', intent: r?.intent, response: r?.id, score: cands[0]?.score || 0, text: r ? expand(r.text, st.memory) : '……' };
      if (r) {
        this.#apply(r);
        st.last = { intent: r.intent, response: r.id, next: r.next || [] };
      }
    }
    st.misses = result.kind === 'fallback' ? (st.misses || 0) + 1 : 0;
    if (result.response) {
      st.recent.push(result.response);
      if (st.recent.length > this.opts.recentSize) st.recent.shift();
    }
    result.candidates = cands.slice(0, 5).map((c) => ({ id: c.unit.id, score: +c.score.toFixed(3) }));
    if (opts.semantic) result.semantic = opts.semantic.slice(0, 3).map((s) => ({ id: s.id, score: +s.score.toFixed(3) }));
    return result;
  }

  #apply(r) {
    if (!r.set) return;
    for (const [k, v] of Object.entries(r.set)) this.state.memory[k] = expand(String(v), this.state.memory);
  }
}
