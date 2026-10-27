import { cardView } from '../../common/ui/cards.js';
import { h } from '../../common/ui/h.js';

const REASON = {
  knock: 'ノック',
  gin: 'ジン',
  undercut: 'アンダーカット（逆転）',
  exhausted: '山札切れで引き分け（同じ親で配り直し）',
  abort: 'ホストの操作で引き分け',
};

const cards = (ids) => ids.map((c) => cardView(c, { small: true }));

/** ラウンド結果の詳細：終了理由、両者の公開手札・役・デッドウッド・レイオフ、累積得点、マッチの決着 */
export function ResultDetail({ result, names, uid }) {
  const detail = result.detail ?? {};
  return h(
    'section',
    { class: 'gin-result' },
    h('p', null, h('strong', null, REASON[result.reason] ?? result.reason)),
    result.matchOver &&
      h('p', { class: 'badge hot' }, `マッチ終了：${names[result.matchWinner] ?? '?'} の勝ち${result.matchWinner === uid ? '！' : ''}`),
    Object.entries(detail).map(([u, d]) =>
      h(
        'div',
        { class: 'reveal' },
        h('strong', null, `${names[u] ?? '?'}（デッドウッド${d.dw}点）`),
        h('div', { class: 'meld-row' }, d.melds.map((m) => h('span', { class: 'meld' }, cards(m.cards)))),
        d.deadwood.length > 0 && h('div', { class: 'meld-row' }, h('span', { class: 'sub' }, 'デッドウッド'), h('span', { class: 'meld' }, cards(d.deadwood))),
        d.layoffs.length > 0 && h('div', { class: 'meld-row' }, h('span', { class: 'sub' }, 'レイオフ'), h('span', { class: 'meld' }, cards(d.layoffs.map((l) => l.card)))),
      ),
    ),
    h('p', { class: 'sub' }, `累積得点：${Object.entries(result.scores).map(([u, n]) => `${names[u] ?? '?'} ${n}点`).join(' ／ ')}`),
  );
}
