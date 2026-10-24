// Web Worker for the semantic layer: downloads the model in the background,
// then embeds each user message and scores it against the precomputed examples.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

const V = new URL(import.meta.url).search; // content hash from the page, see tools/stamp.mjs
// not a top-level await: onmessage must be registered before the page's first
// message arrives, or that message is dropped
const shared = import(`./semantic.js${V}`);
let MODEL, DTYPE, PREFIX, scoreUnits;

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1; // GitHub Pages is not cross-origin isolated

let extractor = null;
let meta = null;
let data = null;

async function init(packId) {
  ({ MODEL, DTYPE, PREFIX, scoreUnits } = await shared);
  const [m, b] = await Promise.all([fetch(`pack/qualia-emb.json${V}`), fetch(`pack/qualia-emb.bin${V}`)]);
  if (!m.ok || !b.ok) throw new Error('embedding files missing');
  meta = await m.json();
  if (meta.pack !== packId) throw new Error('embeddings do not match the rule pack');
  data = new Int8Array(await b.arrayBuffer());
  extractor = await pipeline('feature-extraction', MODEL, {
    dtype: DTYPE,
    // the small config/tokenizer files finish first; only the model weights
    // (~110 MB) say how far along the download is
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total || !String(p.file).endsWith('.onnx')) return;
      self.postMessage({ type: 'progress', loaded: p.loaded, total: p.total });
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
