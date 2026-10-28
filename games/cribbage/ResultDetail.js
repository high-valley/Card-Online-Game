import { cardView } from '../../common/ui/cards.js';
import { h } from '../../common/ui/h.js';
import { breakdownView } from './Breakdown.js';

const REASON = {
  win: '121点に到達',
  complete: 'ラウンド終了',
  abort: 'ホストの操作で引き分け（同じ親で配り直し）',
};

const TYPE = { fifteen: '15', 'thirty-one': '31', pair: 'ペア', run: 'ラン', flush: 'フラッシュ', nobs: 'Nobs', heels: 'His Heels', go: 'Go', last: '最後の札' };

/** ラウンド結果の詳細：終了理由、スターター、手札・クリブの採点内訳、得点の経過、累積得点 */
export function ResultDetail({ result, names, uid }) {
  const show = result.detail?.show ?? {};
  const events = result.detail?.events ?? [];
  return h(
    'section',
    { class: 'crib-result' },
    h('p', null, h('strong', null, REASON[result.reason] ?? result.reason)),
    result.matchOver && h('p', { class: 'badge hot' }, `マッチ終了：${names[result.matchWinner] ?? '?'} の勝ち${result.matchWinner === uid ? '！' : ''}`),
    result.starter && h('div', { class: 'meld-row' }, h('span', { class: 'sub' }, 'スターター'), cardView(result.starter, { small: true })),
    Object.entries(show).map(([key, entry]) => breakdownView(entry, result.starter, key === 'crib' ? 'クリブ' : `${names[key] ?? '?'} の手札`)),
    events.length > 0 &&
      h(
        'details',
        null,
        h('summary', null, `得点の経過（${events.length}件）`),
        h('ol', { class: 'log' }, events.map((e) => h('li', null, `${names[e.playerId] ?? '?'}: ${TYPE[e.type] ?? e.type} +${e.points}（${e.previousScore}→${e.newScore}）`))),
      ),
    h('p', { class: 'sub' }, `累積得点：${Object.entries(result.scores).map(([u, n]) => `${names[u] ?? '?'} ${n}点`).join(' ／ ')}`),
  );
}
