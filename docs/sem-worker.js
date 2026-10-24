// Web Worker for the semantic layer: downloads the model in the background,
// then embeds each user message and scores it against the precomputed examples.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
import { MODEL, DTYPE, PREFIX, scoreUnits } from './semantic.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1; // GitHub Pages is not cross-origin isolated

let extractor = null;
let meta = null;
let data = null;

async function init(packId) {
  const [m, b] = await Promise.all([fetch('pack/qualia-emb.json'), fetch('pack/qualia-emb.bin')]);
  if (!m.ok || !b.ok) throw new Error('embedding files missing');
  meta = await m.json();
  if (meta.pack !== packId) throw new Error('embeddings do not match the rule pack');
  data = new Int8Array(await b.arrayBuffer());
  const files = new Map();
  extractor = await pipeline('feature-extraction', MODEL, {
    dtype: DTYPE,
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files.set(p.file, [p.loaded, p.total]);
      let loaded = 0, total = 0;
      for (const [l, t] of files.values()) { loaded += l; total += t; }
      self.postMessage({ type: 'progress', loaded, total });
    },
  });
  // first call compiles the model; do it before reporting ready
  await extractor(PREFIX + 'こんにちは', { pooling: 'mean', normalize: true });
  self.postMessage({ type: 'ready' });
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    try { await init(msg.packId); } catch (err) { self.postMessage({ type: 'error', message: String(err.message || err) }); }
  } else if (msg.type === 'query' && extractor) {
    const t = await extractor(PREFIX + msg.text, { pooling: 'mean', normalize: true });
    self.postMessage({ type: 'result', id: msg.id, top: scoreUnits(meta, data, t.data) });
  }
};
