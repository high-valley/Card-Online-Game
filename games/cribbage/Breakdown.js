import { cardView } from '../../common/ui/cards.js';
import { h } from '../../common/ui/h.js';

const cards = (ids) => h('span', { class: 'meld' }, ids.map((c) => cardView(c, { small: true })));

const row = (label, points, ids) => h('div', { class: 'crib-row' }, h('span', { class: 'crib-kind' }, label), cards(ids), h('span', { class: 'crib-pts' }, `+${points}`));

/**
 * 手札（クリブ）1つ分の採点内訳：15・ペア・ラン・フラッシュ・Nobs を役ごとに、使ったカードと一緒に表示する。
 * @param {{cards: string[], total: number, awarded: number, combinations: Object}} entry game.show の1件
 */
export function breakdownView(entry, starter, title) {
  const { fifteens, pairs, runs, flush, nobs } = entry.combinations;
  return h(
    'div',
    { class: 'crib-breakdown' },
    h('strong', null, `${title}：${entry.total}点`),
    h('div', { class: 'meld-row' }, cards(entry.cards), h('span', { class: 'sub' }, '＋スターター'), cards([starter])),
    fifteens.map((c) => row('15', c.points, c.cards)),
    pairs.map((c) => row('ペア', c.points, c.cards)),
    runs.map((c) => row(`${c.cards.length}枚のラン`, c.points, c.cards)),
    flush && row(`フラッシュ`, flush.points, flush.cards),
    nobs && row('Nobs', nobs.points, [nobs.card]),
    entry.total === 0 && h('div', { class: 'sub' }, '得点なし'),
    entry.awarded !== entry.total && h('div', { class: 'sub' }, `121点に届いたため加算は ${entry.awarded}点まで`),
  );
}
