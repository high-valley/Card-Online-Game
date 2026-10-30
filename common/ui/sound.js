/**
 * 効果音。音声ファイルは使わず、Web Audio で作る（読み込み不要・容量ゼロ）。
 * ブラウザの決まりで、ユーザーが一度画面を触るまでは鳴らせない（触れた時点で自動で使えるようになる）。
 */
const KEY = 'cards.muted';

let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem(KEY) === '1';
} catch { /* 保存できなくても動く */ }

const audio = () => {
  if (!ctx) {
    const C = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

/** 音の定義：f=周波数, t=開始までの秒, d=長さ, type=波形, v=音量, to=終わりの周波数 */
export const SOUNDS = {
  tap: [{ f: 1400, to: 900, d: 0.025, type: 'sine', v: 0.05 }], // ボタンを押したときの小さなクリック
  draw: [{ f: 520, d: 0.05, type: 'triangle' }, { f: 760, t: 0.05, d: 0.07, type: 'triangle' }],
  discard: [{ f: 240, to: 150, d: 0.12, type: 'square', v: 0.07 }],
  card: [{ f: 400, to: 260, d: 0.07, type: 'triangle', v: 0.14 }],
  pass: [{ f: 330, d: 0.08, type: 'sine', v: 0.1 }],
  knock: [{ f: 160, to: 90, d: 0.1, type: 'square', v: 0.12 }, { f: 160, to: 90, t: 0.16, d: 0.1, type: 'square', v: 0.12 }],
  special: [{ f: 520, d: 0.08, type: 'sawtooth', v: 0.08 }, { f: 780, t: 0.08, d: 0.12, type: 'sawtooth', v: 0.08 }],
  gin: [523, 659, 784, 1047].map((f, i) => ({ f, t: i * 0.09, d: 0.16, type: 'triangle', v: 0.14 })),
  win: [523, 659, 784, 1047].map((f, i) => ({ f, t: i * 0.12, d: 0.22, type: 'triangle', v: 0.16 })),
  lose: [392, 330, 262].map((f, i) => ({ f, t: i * 0.16, d: 0.24, type: 'sine', v: 0.14 })),
};

/** 操作ログ1件に対応する音の名前（ゲームごとに `soundFor` で上書きできる） */
export function soundForEntry(entry) {
  const fx = entry.effects ?? [];
  if (fx.includes('gin') || entry.type === 'gin') return 'gin';
  if (fx.includes('knock') || entry.type === 'knock') return 'knock';
  if (fx.some((e) => ['revolution', 'eight-cut', 'spade3'].includes(e))) return 'special';
  switch (entry.type) {
    case 'play': return 'card';
    case 'draw': return 'draw';
    case 'discard': return 'discard';
    case 'pass':
    case 'skip': return 'pass';
    default: return null;
  }
}

export function play(name) {
  const def = SOUNDS[name];
  if (!def || muted) return;
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  for (const n of def) {
    const osc = a.createOscillator();
    const gain = a.createGain();
    const t0 = now + (n.t ?? 0);
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.f, t0);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.d);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(n.v ?? 0.12, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
    osc.connect(gain).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + n.d + 0.02);
  }
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = value;
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch { /* 保存できなくても動く */ }
}

/** 最初のタップで音を使えるようにする（ブラウザの自動再生制限への対応） */
export function unlockAudio() {
  const once = () => {
    audio();
    removeEventListener('pointerdown', once, true);
  };
  addEventListener('pointerdown', once, true);
}
