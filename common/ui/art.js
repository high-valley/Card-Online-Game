/**
 * ゲームの目印のイラスト（ホームのタイル用）を描くための部品。ゲームごとの絵は games/<id>/art.js が組み立てる。
 * どれも viewBox="0 0 160 110" の SVG 文字列を返す。
 */
const RED = '#c8242c';
const MARK = { S: '♠', H: '♥', D: '♦', C: '♣' };

/** 表向きのカード1枚。x,y は左上、rot は回転（度、カードの下端中央が軸） */
export function cardSvg(x, y, rank, suit, rot = 0, w = 34) {
  const hgt = w * 1.4;
  const color = suit === 'H' || suit === 'D' ? RED : '#16181c';
  const fs = w * 0.36;
  return `<g transform="rotate(${rot} ${x + w / 2} ${y + hgt})">
    <rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="${w * 0.12}" fill="#fdfcf7" stroke="rgba(0,0,0,.35)" stroke-width="1"/>
    <text x="${x + w * 0.1}" y="${y + fs * 1.05}" font-size="${fs}" font-weight="800" fill="${color}" font-family="Arial, sans-serif">${rank}</text>
    <text x="${x + w * 0.12}" y="${y + fs * 1.95}" font-size="${fs * 0.8}" fill="${color}">${MARK[suit]}</text>
    <text x="${x + w / 2}" y="${y + hgt * 0.68}" font-size="${w * 0.62}" text-anchor="middle" fill="${color}">${MARK[suit]}</text>
  </g>`;
}

/** 裏向きのカード1枚（赤い柄） */
export function backSvg(x, y, rot = 0, w = 34) {
  const hgt = w * 1.4;
  return `<g transform="rotate(${rot} ${x + w / 2} ${y + hgt})">
    <rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="${w * 0.12}" fill="#fdfcf7" stroke="rgba(0,0,0,.35)"/>
    <rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${hgt - 6}" rx="${w * 0.08}" fill="#b8222c"/>
    <path d="M${x + 3} ${y + 3} l${w - 6} ${hgt - 6} M${x + w - 3} ${y + 3} l${-(w - 6)} ${hgt - 6}" stroke="#e05a63" stroke-width="1" opacity=".6"/>
    <rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${hgt - 12}" rx="${w * 0.05}" fill="none" stroke="#f3c1c4" stroke-width="1" opacity=".7"/>
  </g>`;
}

/** カジノチップの山。color は本体の色 */
export function chipStackSvg(x, y, n, color) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const cy = y - i * 4;
    s += `<ellipse cx="${x}" cy="${cy + 2}" rx="13" ry="5" fill="rgba(0,0,0,.35)"/><ellipse cx="${x}" cy="${cy}" rx="13" ry="5" fill="${color}" stroke="#fff" stroke-width="1" stroke-dasharray="3 3"/>`;
  }
  return s;
}

/** 絵の外枠（暗い緑の光と、下の影） */
export const artFrame = (body) =>
  `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="glow" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#2f8a5f" stop-opacity=".55"/><stop offset="1" stop-color="#2f8a5f" stop-opacity="0"/></radialGradient></defs><rect width="160" height="110" fill="url(#glow)"/>${body}</svg>`;
