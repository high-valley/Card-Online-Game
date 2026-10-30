/**
 * プレイヤーの顔アイコン（仮のイラスト）。SVG で描くので読み込み不要・どの大きさでもくっきり。
 * 今は uid から自動で決まる。あとでガチャなどで選べるようにするときは、プレイヤーに avatar（下の id）を持たせれば、それが優先される。
 */
import { h } from './h.js';

const face = (bg, body) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="${bg}"/>${body}</svg>`;
const eyes = (y, dx = 9, r = 3.2, c = '#1d1d1f') => `<circle cx="${32 - dx}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${32 + dx}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${32 - dx + 1}" cy="${y - 1.2}" r="${r / 3}" fill="#fff"/><circle cx="${32 + dx + 1}" cy="${y - 1.2}" r="${r / 3}" fill="#fff"/>`;

/** id → { name, svg }。名前は将来の選択画面用 */
export const AVATARS = {
  cat: {
    name: 'ねこ',
    svg: face('#6b8fa8', `<path d="M14 26 L17 8 L28 19 Z" fill="#9aa3ab"/><path d="M50 26 L47 8 L36 19 Z" fill="#9aa3ab"/><path d="M17.5 22 L19 13 L25 19 Z" fill="#f3b6c0"/><path d="M46.5 22 L45 13 L39 19 Z" fill="#f3b6c0"/>
      <ellipse cx="32" cy="38" rx="21" ry="19" fill="#b9c0c6"/><path d="M24 22 q4 4 0 8 M32 20 v9 M40 22 q-4 4 0 8" stroke="#6f7880" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <ellipse cx="32" cy="46" rx="10" ry="8" fill="#f4f1ec"/>${eyes(36, 9, 3.6, '#2f3a1e')}<path d="M29.5 43 h5 l-2.5 3 z" fill="#e58a9a"/><path d="M32 46 q-3 3 -6 1 M32 46 q3 3 6 1" stroke="#555" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M12 41 h9 M12 45 h9 M43 41 h9 M43 45 h9" stroke="#fff" stroke-width="1" opacity=".7"/>`),
  },
  dog: {
    name: 'いぬ',
    svg: face('#c9a46a', `<ellipse cx="32" cy="36" rx="18" ry="19" fill="#f7efe3"/><path d="M14 22 q-6 16 2 26 q6 -2 6 -12 q0 -10 -8 -14z" fill="#8a5a2b"/><path d="M50 22 q6 16 -2 26 q-6 -2 -6 -12 q0 -10 8 -14z" fill="#8a5a2b"/>
      <path d="M18 24 q14 -14 28 0 q-2 10 -6 12 h-16 q-4 -2 -6 -12z" fill="#b5762f"/><path d="M29 20 h6 v24 h-6z" fill="#f7efe3"/>
      ${eyes(33, 8.5, 3.4)}<ellipse cx="32" cy="43" rx="4.2" ry="3" fill="#2a1d14"/><path d="M32 46 v3 M32 49 q-3 2 -6 0 M32 49 q3 2 6 0" stroke="#2a1d14" stroke-width="1.5" fill="none" stroke-linecap="round"/>`),
  },
  shiba: {
    name: 'しば',
    svg: face('#e8c27a', `<path d="M15 25 L18 9 L29 20 Z" fill="#d98b3a"/><path d="M49 25 L46 9 L35 20 Z" fill="#d98b3a"/><path d="M19 21 L20 13 L26 19 Z" fill="#f6dfc0"/><path d="M45 21 L44 13 L38 19 Z" fill="#f6dfc0"/>
      <ellipse cx="32" cy="37" rx="20" ry="18" fill="#d98b3a"/><ellipse cx="32" cy="44" rx="13" ry="10" fill="#fbf3e6"/><ellipse cx="22" cy="33" rx="4" ry="2.4" fill="#fbf3e6"/><ellipse cx="42" cy="33" rx="4" ry="2.4" fill="#fbf3e6"/>
      ${eyes(37, 9, 3)}<ellipse cx="32" cy="43" rx="3.6" ry="2.6" fill="#2a1d14"/><path d="M32 45.5 q-3 3 -6 1 M32 45.5 q3 3 6 1" stroke="#2a1d14" stroke-width="1.4" fill="none" stroke-linecap="round"/><ellipse cx="22" cy="44" rx="3" ry="2" fill="#f2a7a0" opacity=".7"/><ellipse cx="42" cy="44" rx="3" ry="2" fill="#f2a7a0" opacity=".7"/>`),
  },
  robot: {
    name: 'ロボット',
    svg: face('#3b6ea8', `<path d="M32 8 v6" stroke="#cfd8e3" stroke-width="2.4"/><circle cx="32" cy="7" r="3" fill="#7fe3ff"/>
      <rect x="12" y="14" width="40" height="34" rx="14" fill="#eef3f8"/><rect x="17" y="22" width="30" height="18" rx="9" fill="#1b2330"/>
      <ellipse cx="25" cy="31" rx="3.6" ry="4.4" fill="#5fdcff"/><ellipse cx="39" cy="31" rx="3.6" ry="4.4" fill="#5fdcff"/><path d="M28 37 q4 2 8 0" stroke="#5fdcff" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <rect x="7" y="25" width="6" height="12" rx="3" fill="#cfd8e3"/><rect x="51" y="25" width="6" height="12" rx="3" fill="#cfd8e3"/><path d="M20 52 q12 -6 24 0 v12 h-24z" fill="#eef3f8"/><circle cx="32" cy="56" r="2.4" fill="#ff7aa8"/>`),
  },
  fox: {
    name: 'きつね',
    svg: face('#4f7a5a', `<path d="M13 28 L16 8 L29 21 Z" fill="#e8742c"/><path d="M51 28 L48 8 L35 21 Z" fill="#e8742c"/><path d="M17 23 L18 13 L25 20 Z" fill="#3a2414"/><path d="M47 23 L46 13 L39 20 Z" fill="#3a2414"/>
      <path d="M12 30 q20 -18 40 0 q-4 18 -20 24 q-16 -6 -20 -24z" fill="#e8742c"/><path d="M14 33 q8 4 18 16 q10 -12 18 -16 q-4 16 -18 21 q-14 -5 -18 -21z" fill="#fbf3e6"/>
      ${eyes(34, 8.5, 3)}<ellipse cx="32" cy="45" rx="3" ry="2.2" fill="#2a1d14"/>`),
  },
  panda: {
    name: 'パンダ',
    svg: face('#7bb08a', `<circle cx="16" cy="17" r="8" fill="#222"/><circle cx="48" cy="17" r="8" fill="#222"/><ellipse cx="32" cy="36" rx="21" ry="19" fill="#fafafa"/>
      <ellipse cx="23" cy="34" rx="6" ry="7.5" fill="#222" transform="rotate(-20 23 34)"/><ellipse cx="41" cy="34" rx="6" ry="7.5" fill="#222" transform="rotate(20 41 34)"/>
      <circle cx="24" cy="34" r="2.6" fill="#fff"/><circle cx="40" cy="34" r="2.6" fill="#fff"/><circle cx="24.5" cy="34.5" r="1.4" fill="#222"/><circle cx="39.5" cy="34.5" r="1.4" fill="#222"/>
      <ellipse cx="32" cy="43" rx="3.4" ry="2.4" fill="#222"/><path d="M32 45 q-3 3 -6 1 M32 45 q3 3 6 1" stroke="#222" stroke-width="1.4" fill="none" stroke-linecap="round"/>`),
  },
  bear: {
    name: 'くま',
    svg: face('#a3c1d9', `<circle cx="15" cy="18" r="8" fill="#8b5a3c"/><circle cx="49" cy="18" r="8" fill="#8b5a3c"/><circle cx="15" cy="18" r="4" fill="#d8a982"/><circle cx="49" cy="18" r="4" fill="#d8a982"/>
      <ellipse cx="32" cy="36" rx="21" ry="19" fill="#8b5a3c"/><ellipse cx="32" cy="44" rx="10" ry="8" fill="#d8a982"/>${eyes(34, 9, 3)}<ellipse cx="32" cy="41" rx="3.6" ry="2.6" fill="#2a1d14"/><path d="M32 44 v3" stroke="#2a1d14" stroke-width="1.4"/>`),
  },
  boy: {
    name: 'おとこのこ',
    svg: face('#2f6d55', `<path d="M14 64 q2 -14 18 -14 q16 0 18 14z" fill="#2b3a55"/><path d="M27 46 h10 v6 q-5 3 -10 0z" fill="#f2c9a8"/>
      <ellipse cx="32" cy="32" rx="14" ry="16" fill="#f6d3b5"/><path d="M17 30 q-2 -18 15 -19 q17 1 15 19 q-3 -8 -8 -10 q-2 4 -8 4 q-4 -1 -6 -5 q-6 3 -8 11z" fill="#2a2420"/>
      <ellipse cx="26" cy="33" rx="2.2" ry="2.8" fill="#2a2420"/><ellipse cx="38" cy="33" rx="2.2" ry="2.8" fill="#2a2420"/><path d="M28 41 q4 3 8 0" stroke="#b5654f" stroke-width="1.6" fill="none" stroke-linecap="round"/>`),
  },
  girl: {
    name: 'おんなのこ',
    svg: face('#8a5a8c', `<path d="M14 64 q2 -14 18 -14 q16 0 18 14z" fill="#c2415d"/><path d="M15 34 q-3 -22 17 -23 q20 1 17 23 v14 h-34z" fill="#5a3324"/>
      <path d="M27 46 h10 v6 q-5 3 -10 0z" fill="#f2c9a8"/><ellipse cx="32" cy="33" rx="13" ry="15" fill="#f6d3b5"/><path d="M19 28 q4 -12 13 -12 q10 0 13 12 q-8 -6 -13 -6 q-6 0 -13 6z" fill="#5a3324"/>
      <ellipse cx="26.5" cy="34" rx="2.2" ry="2.8" fill="#2a2420"/><ellipse cx="37.5" cy="34" rx="2.2" ry="2.8" fill="#2a2420"/><ellipse cx="23" cy="39" rx="2.4" ry="1.5" fill="#f2a7a0" opacity=".7"/><ellipse cx="41" cy="39" rx="2.4" ry="1.5" fill="#f2a7a0" opacity=".7"/><path d="M29 42 q3 2 6 0" stroke="#b5654f" stroke-width="1.6" fill="none" stroke-linecap="round"/>`),
  },
};

/** CPU は席の順に決まった顔（cpu1 ロボット・cpu2 ねこ・cpu3 いぬ…）。人は uid から自動で選ぶ */
const CPU_ORDER = ['robot', 'cat', 'dog', 'shiba', 'fox', 'panda', 'bear'];
const HUMAN_ORDER = ['boy', 'girl', 'cat', 'dog', 'shiba', 'fox', 'panda', 'bear'];
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7);

export function avatarIdOf(player) {
  if (player?.avatar && AVATARS[player.avatar]) return player.avatar;
  const uid = String(player?.uid ?? '');
  const cpu = uid.match(/^cpu(\d*)$/);
  if (cpu) return CPU_ORDER[(Number(cpu[1] || 1) - 1) % CPU_ORDER.length];
  return HUMAN_ORDER[hash(uid) % HUMAN_ORDER.length];
}

/** 丸い顔アイコン。size は CSS の大きさ（例 '44px'） */
export function avatarView(player, { size, ring = true, cls = '' } = {}) {
  const el = h('span', { class: `avatar${ring ? ' ring' : ''}${cls ? ` ${cls}` : ''}`, style: size ? `--av:${size}` : null, 'aria-hidden': 'true' });
  el.innerHTML = AVATARS[avatarIdOf(player)].svg;
  return el;
}
