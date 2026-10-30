import { cardView } from '../../common/ui/cards.js';
import { h } from '../../common/ui/h.js';

const fmt = (n) => n.toLocaleString('ja-JP');

/** ハンド結果の詳細：場のカード、公開された手札と役、ポットごとの勝者、チップの増減、脱落 */
export function ResultDetail({ result, names, uid }) {
  const name = (u) => names[u] ?? '?';
  const hr = result.handResult;
  const delta = (u) => result.chips[u] - result.startChips[u];
  const sign = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n));
  const dealtIn = Object.keys(result.startChips).filter((u) => result.startChips[u] > 0);
  const pots = (hr?.pots ?? []).filter((p) => !p.refund);
  const refunds = (hr?.pots ?? []).filter((p) => p.refund);

  return h(
    'section',
    { class: 'holdem-result' },
    hr?.uncontested
      ? h('p', null, h('strong', null, `${name(Object.keys(hr.awards)[0])} が ${fmt(Object.values(hr.awards)[0])} を獲得`), h('span', { class: 'sub' }, '（他の人が降りたため、手札は公開されません）'))
      : [
          result.board.length > 0 && h('div', { class: 'hr-row' }, h('span', { class: 'sub' }, '場'), h('span', { class: 'shown-cards' }, result.board.map((c) => cardView(c, { small: true })))),
          Object.entries(hr?.hands ?? {}).map(([u, hand]) =>
            h(
              'div',
              { class: `hr-row${u === uid ? ' me' : ''}` },
              h('span', { class: 'sub' }, name(u)),
              h('span', { class: 'shown-cards' }, hand.cards.map((c) => cardView(c, { small: true }))),
              h('strong', null, hand.name),
              hr.awards[u] > 0 && h('span', { class: 'badge hot' }, `+${fmt(hr.awards[u])}`),
            ),
          ),
          pots.length > 1 && h('p', { class: 'sub' }, pots.map((p, i) => `${i === 0 ? 'メイン' : `サイド${i}`}ポット ${fmt(p.amount)}：${p.winners.map(name).join('・')}`).join(' ／ ')),
        ],
    refunds.map((p) => h('p', { class: 'sub' }, `${name(p.winners[0])} の ${fmt(p.amount)} は受けてもらえなかったので戻りました`)),
    h('ul', { class: 'chips-list' }, dealtIn.map((u) => h('li', { class: u === uid ? 'me' : '' }, `${name(u)}：${fmt(result.chips[u])}（${sign(delta(u))}）${result.busted.includes(u) ? ' 脱落' : ''}`))),
    result.out.length > 0 && h('p', { class: 'sub' }, `脱落済み：${result.out.map(name).join('、')}`),
    h('p', { class: 'sub' }, `ハンド${result.handNo} 終了`),
  );
}
