import { artFrame, cardSvg, chipStackSvg } from '../../common/ui/art.js';

/** テキサスホールデム：チップの山と、エースのペア */
export const art = artFrame(`
  ${chipStackSvg(36, 92, 5, '#c8242c')}${chipStackSvg(60, 98, 3, '#2a5bc4')}${chipStackSvg(126, 96, 4, '#2f8a5a')}
  ${cardSvg(66, 12, 'A', 'S', -10, 38)}${cardSvg(90, 14, 'A', 'H', 10, 38)}`);
