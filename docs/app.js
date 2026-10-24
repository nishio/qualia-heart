import { Engine } from './engine.js';

const KEY = 'qualia-heart-v1';
const $ = (id) => document.getElementById(id);
const log = $('log');
const input = $('input');

const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
  clear() { try { localStorage.removeItem(KEY); } catch {} },
};

let engine;
let history = [];

// --- semantic layer: starts without it, loads the model in the background ---
const SEM_KEY = 'qualia-heart-sem';
const sem = { worker: null, state: 'idle', pct: 0, enabled: true, pending: new Map(), seq: 0 };
try { sem.enabled = localStorage.getItem(SEM_KEY) !== 'off'; } catch {}
const semButton = $('sem');

function showSem() {
  const label = !sem.enabled ? 'OFF'
    : sem.state === 'ready' ? 'ON'
    : sem.state === 'loading' ? `準備中 ${sem.pct}%`
    : sem.state === 'error' ? '使えません'
    : '—';
  semButton.textContent = `意味検索 ${label}`;
  semButton.classList.toggle('on', sem.enabled && sem.state === 'ready');
}

function startSem(packId) {
  if (sem.worker || !sem.enabled) return;
  sem.state = 'loading';
  showSem();
  sem.worker = new Worker('sem-worker.js', { type: 'module' });
  sem.worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') { sem.pct = Math.floor(100 * m.loaded / m.total); showSem(); }
    else if (m.type === 'ready') { sem.state = 'ready'; showSem(); }
    else if (m.type === 'error') { sem.state = 'error'; showSem(); console.warn('semantic layer:', m.message); }
    else if (m.type === 'result') { sem.pending.get(m.id)?.(m.top); sem.pending.delete(m.id); }
  };
  sem.worker.onerror = (e) => { sem.state = 'error'; showSem(); console.warn('semantic worker:', e.message); };
  sem.worker.postMessage({ type: 'init', packId });
}

// resolves to the top semantic matches, or null when the layer is off or slow
function semQuery(text) {
  if (!sem.enabled || sem.state !== 'ready') return Promise.resolve(null);
  const id = ++sem.seq;
  return new Promise((resolve) => {
    sem.pending.set(id, resolve);
    sem.worker.postMessage({ type: 'query', id, text });
    setTimeout(() => { if (sem.pending.delete(id)) resolve(null); }, 3000);
  });
}

function trace(r) {
  if (!r) return '';
  const cands = r.candidates.map((c) => `  ${c.score.toFixed(3)} ${c.id}`).join('\n');
  const semLines = r.semantic ? '\n意味: ' + r.semantic.map((s) => `${s.id} ${s.score.toFixed(3)}`).join(', ') : '';
  const via = r.via === 'semantic' ? ' [意味検索]' : '';
  return `${r.kind}${via} → ${r.response ?? '-'} (${r.score.toFixed(3)})\n${cands}${semLines}`;
}

function render(m) {
  const div = document.createElement('div');
  div.className = `msg ${m.who}`;
  div.textContent = m.text;
  if (m.who === 'bot' && m.r?.kind === 'canon') {
    const a = document.createElement('a');
    a.className = 'badge';
    a.textContent = '正典 ' + m.r.intent.replace('canonical:', '#');
    const url = m.r.sources?.[0]?.url;
    if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; }
    div.append(a);
  }
  if (m.who === 'bot' && m.r) {
    const t = document.createElement('div');
    t.className = 'trace';
    t.textContent = trace(m.r);
    div.append(t);
  }
  log.append(div);
  log.scrollTop = log.scrollHeight;
  div.scrollIntoView({ block: 'end' });
}

function save() {
  store.set({ state: engine.state, history: history.slice(-200) });
}

function greet() {
  const hour = new Date().getHours();
  const text = hour < 5 || hour >= 22 ? 'こんばんは。夜も観測を続けていますか。'
    : hour < 11 ? 'おはようございます。今日の地球はどうですか。'
    : 'こんにちは。私はクオリアさん、母星と地球をつなぐインターフェイスです。';
  const m = { who: 'bot', text };
  history.push(m);
  render(m);
}

async function say(text) {
  const u = { who: 'user', text };
  history.push(u);
  render(u);
  const typing = document.createElement('div');
  typing.className = 'msg bot typing';
  typing.textContent = '…';
  log.append(typing);
  typing.scrollIntoView({ block: 'end' });
  const semantic = await semQuery(text);
  const r = engine.respond(text, semantic ? { semantic } : {});
  const delay = Math.min(1200, 250 + r.text.length * 8);
  setTimeout(() => {
    typing.remove();
    const m = { who: 'bot', text: r.text, r };
    history.push(m);
    render(m);
    save();
  }, delay);
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  say(text);
});

semButton.addEventListener('click', () => {
  sem.enabled = !sem.enabled;
  try { localStorage.setItem(SEM_KEY, sem.enabled ? 'on' : 'off'); } catch {}
  if (sem.enabled) startSem(engine.packId);
  showSem();
});

$('debug').addEventListener('change', (e) => {
  document.body.classList.toggle('debug', e.target.checked);
});

$('reset').addEventListener('click', () => {
  store.clear();
  engine.reset();
  history = [];
  log.textContent = '';
  greet();
  input.focus();
});

async function main() {
  const pack = await (await fetch('pack/qualia.json')).json();
  engine = new Engine(pack);
  const n = (a, k) => a.reduce((s, x) => s + x[k].length, 0);
  $('stats').textContent = `辞書: 意図 ${pack.intents.length}、例文 ${n(pack.intents, 'examples') + n(pack.canon, 'examples')}、返答 ${n(pack.intents, 'responses') + pack.fallback.length}、正典 ${pack.canon.length}（${pack.version} 生成）`;
  const saved = store.get();
  if (saved?.state && saved.history?.length) {
    engine.load(saved.state);
    history = saved.history;
    history.forEach(render);
  } else {
    greet();
  }
  input.disabled = false;
  $('send').disabled = false;
  input.focus();
  engine.packId = pack.id;
  showSem();
  // the rule engine is usable now; fetch the semantic model afterwards, unless data saving is on
  const saveData = navigator.connection?.saveData === true;
  if (sem.enabled && !saveData) setTimeout(() => startSem(pack.id), 1500);
}

main().catch((e) => {
  render({ who: 'bot', text: '辞書の読み込みに失敗しました: ' + e.message });
});
