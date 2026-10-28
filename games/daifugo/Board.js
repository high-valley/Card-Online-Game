import { cardView, suitMark } from '../../common/ui/cards.js';
import { h } from '../../common/ui/h.js';
import { canPlay } from './rules.js';

import { REASON_TEXT } from './messages.js';

const REASONS = { ...REASON_TEXT, 'not-your-turn': '' };

/**
 * 大富豪のゲーム画面中央（場・状態表示・操作ボタン）。
 * @param {{game: object, hand: string[], uid: string, selected: string[], names: Object<string,string>,
 *          onAction: (action: object) => void, busy: boolean}} p
 */
export function Board({ game, hand, uid, selected, names, onAction, busy }) {
  const mine = game.turnUid === uid;
  const play = { type: 'play', uid, cards: selected };
  const playCheck = mine ? canPlay(game, hand, play) : { ok: false };
  const passCheck = mine ? canPlay(game, hand, { type: 'pass', uid }) : { ok: false };

  const f = game.field;
  const badges = [
    game.revolution && h('span', { class: 'badge hot' }, '革命中'),
    game.lock && h('span', { class: 'badge' }, `しばり ${game.lock.map(suitMark).join('')}`),
  ];

  let hint = '';
  if (mine && selected.length > 0 && !playCheck.ok) hint = REASONS[playCheck.reason] ?? '';
  else if (mine && selected.length === 0) hint = game.field ? '出すカードを選ぶか、パスしてください' : 'あなたの番です。出すカードを選んでください';
  else if (!mine && game.turnUid) hint = `${names[game.turnUid] ?? '?'} の番です`;

  return h(
    'section',
    { class: 'board' },
    h('div', { class: 'badges' }, badges),
    h(
      'div',
      { class: 'field', 'data-drop': 'field', 'data-accepts': 'hand' },
      f
        ? [h('div', { class: 'field-cards' }, f.cards.map((c) => cardView(c, { anim: 'drop', key: `field:${c}` }))), h('div', { class: 'field-by' }, `${names[f.uid] ?? '?'} が出しました`)]
        : h('div', { class: 'field-empty' }, '場は空です'),
    ),
    h('div', { class: 'hint' }, hint),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'primary', disabled: busy || !playCheck.ok, onClick: () => onAction(play) }, '出す'),
      h('button', { disabled: busy || !passCheck.ok, onClick: () => onAction({ type: 'pass', uid }) }, 'パス'),
    ),
  );
}
