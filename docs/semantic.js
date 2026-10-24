// Optional semantic layer. Example embeddings are precomputed by tools/embed.mjs
// (docs/pack/qualia-emb.bin + .json); a query is embedded at runtime with the
// same model and compared with them. Shared by the browser worker and Node tools.

export const MODEL = 'Xenova/multilingual-e5-small';
export const DTYPE = 'q8';
export const PREFIX = 'query: '; // e5 expects a prefix on both sides
export const SCALE = 127;        // normalized vectors stored as int8

// Units that can be reached without conversation context, in a fixed order.
export function semanticUnits(pack) {
  return [
    ...pack.intents.filter((i) => !i.context && !i.followup && i.examples.length).map((i) => ({ id: i.id, examples: i.examples })),
    ...(pack.canon || []).map((c) => ({ id: c.id, examples: c.examples })),
  ];
}

// Best example similarity per unit for one query vector; returns the top `k`.
export function scoreUnits(meta, data, q, k = 8) {
  const dim = meta.dim;
  const out = [];
  let row = 0;
  for (const [id, n] of meta.units) {
    let best = -1;
    for (let e = 0; e < n; e++, row++) {
      let s = 0;
      const off = row * dim;
      for (let d = 0; d < dim; d++) s += q[d] * data[off + d];
      if (s > best) best = s;
    }
    out.push({ id, score: best / SCALE });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, k);
}
