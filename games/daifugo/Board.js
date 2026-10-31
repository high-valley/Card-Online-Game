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
        ? [fieldStack(game, names), h('div', { class: 'field-by' }, `${names[f.uid] ?? '?'} が出しました`)]
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

/** 場に重ねて見せる組の数（最新を含む） */
const STACK = 3;

/**
 * 場が流れるまでに出た組を、最新を手前にして重ねる。
 * 前の組は上にずらして奥に置き、数字とマークの角が見えるようにする。
 */
function fieldStack(game, names) {
  const f = game.field;
  const pile = game.pile?.length ? game.pile : [{ uid: f.uid, cards: f.cards }]; // pile のない古い状態でも最新だけは出す
  const shown = pile.slice(-STACK);
  const hidden = pile.length - shown.length;
  return h(
    'div',
    { class: 'field-stack', style: `--depth:${shown.length - 1}` },
    hidden > 0 && h('div', { class: 'field-more' }, `ほか${hidden}組`),
    shown.map((p, i) => {
      const back = shown.length - 1 - i; // 0 が最新
      return back === 0
        ? h('div', { class: 'field-group field-cards', style: '--back:0' }, p.cards.map((c) => cardView(c, { anim: 'drop', key: `field:${c}` })))
        : h(
            'div',
            { class: 'field-group past', style: `--back:${back}` },
            p.cards.map((c) => cardView(c)),
            h('span', { class: 'field-group-by' }, names[p.uid] ?? '?'),
          );
    }),
  );
}
