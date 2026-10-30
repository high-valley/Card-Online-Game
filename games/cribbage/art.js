import { artFrame, cardSvg } from '../../common/ui/art.js';

/** クリベッジ：ペグを挿す木の盤と、5のカード */
const holes = Array.from({ length: 3 }, (_, r) => Array.from({ length: 12 }, (_, c) => `<circle cx="${22 + c * 10}" cy="${78 + r * 7}" r="1.8" fill="#3a2414"/>`).join('')).join('');
export const art = artFrame(`
  <rect x="12" y="68" width="136" height="32" rx="8" fill="#b77a3e" stroke="#6b4320" stroke-width="2"/><rect x="12" y="68" width="136" height="6" rx="3" fill="#d39a5c" opacity=".7"/>${holes}
  <rect x="50" y="70" width="4" height="10" rx="2" fill="#c8242c"/><rect x="90" y="77" width="4" height="10" rx="2" fill="#2f7bd8"/>
  ${cardSvg(58, 4, '5', 'S', -12)}${cardSvg(78, 2, '5', 'H', 4)}${cardSvg(98, 6, '5', 'C', 18)}`);
