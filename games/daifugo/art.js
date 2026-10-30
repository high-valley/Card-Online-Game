import { artFrame, cardSvg } from '../../common/ui/art.js';

/** 大富豪：扇に開いた強いカードと、王冠 */
export const art = artFrame(`
  ${cardSvg(30, 22, '2', 'S', -28)}${cardSvg(48, 14, 'A', 'H', -14)}${cardSvg(64, 10, 'K', 'S')}${cardSvg(80, 14, 'Q', 'D', 14)}${cardSvg(96, 22, 'J', 'C', 28)}
  <g transform="translate(80 84)"><path d="M-26 8 h52 l5 -26 -16 11 -15 -20 -15 20 -16 -11z" fill="#f2c14e" stroke="#8a5d00" stroke-width="2" stroke-linejoin="round"/>
  <rect x="-27" y="8" width="54" height="8" rx="2" fill="#d9a43a" stroke="#8a5d00" stroke-width="2"/><circle cx="0" cy="-2" r="4" fill="#c8242c"/><circle cx="-15" cy="1" r="3" fill="#2f7bd8"/><circle cx="15" cy="1" r="3" fill="#2f9a5a"/></g>`);
