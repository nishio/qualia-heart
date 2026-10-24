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

function trace(r) {
  if (!r) return '';
  const cands = r.candidates.map((c) => `  ${c.score.toFixed(3)} ${c.id}`).join('\n');
  return `${r.kind} → ${r.response ?? '-'} (${r.score.toFixed(3)})\n${cands}`;
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

function say(text) {
  const u = { who: 'user', text };
  history.push(u);
  render(u);
  const r = engine.respond(text);
  const typing = document.createElement('div');
  typing.className = 'msg bot typing';
  typing.textContent = '…';
  log.append(typing);
  typing.scrollIntoView({ block: 'end' });
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
}

main().catch((e) => {
  render({ who: 'bot', text: '辞書の読み込みに失敗しました: ' + e.message });
});
