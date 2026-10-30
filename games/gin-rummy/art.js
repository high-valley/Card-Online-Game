import { artFrame, backSvg, cardSvg } from '../../common/ui/art.js';

/** ジン・ラミー：裏向きの山札と、表向きの組み */
export const art = artFrame(`
  ${backSvg(18, 30, -18)}${backSvg(30, 24, -9)}${backSvg(42, 20, 0)}${backSvg(54, 20, 9)}${backSvg(66, 24, 18)}
  ${cardSvg(100, 26, 'A', 'S', 6, 38)}`);
