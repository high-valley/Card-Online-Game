import { cardView } from '../../common/ui/cards.js';
import { h } from '../../common/ui/h.js';
import { deadwoodOf } from './melds.js';
import { canPlay } from './rules.js';

const REASONS = {
  'same-card': '取った捨て札はそのターンに捨てられません',
  'deadwood-too-high': 'ノックはデッドウッド10点以下で宣言できます',
  'not-gin': 'ジンはデッドウッド0点のときだけ宣言できます',
  'must-draw-deck': '最初のターンは山札から引きます',
};

const back = (label, { onClick, disabled }) =>
  h('button', { type: 'button', class: 'card back', disabled, onClick }, h('span', { class: 'rank' }, label));

/** 11枚のとき：どれか1枚を捨てた後の最小デッドウッド */
const bestAfterDiscard = (hand) => Math.min(...hand.map((c) => deadwoodOf(hand.filter((x) => x !== c))));

/** ジン・ラミーのゲーム画面中央：山札・捨て札・操作ボタン */
export function Board({ game, hand, uid, selected, names, onAction, busy }) {
  const mine = game.turnUid === uid;
  const check = (a) => (mine ? canPlay(game, hand, { ...a, uid }) : { ok: false });
  const phase = game.phase;
  const top = game.discard.at(-1);
  const card = selected[0];

  const drawDeck = check({ type: 'draw', source: 'deck' });
  const drawDiscard = check({ type: 'draw', source: 'discard' });
  const discard = card ? check({ type: 'discard', card }) : { ok: false };
  const knock = card ? check({ type: 'knock', card }) : { ok: false };
  const gin = card ? check({ type: 'gin', card }) : { ok: false };
  const send = (a) => () => onAction({ ...a, uid });

  const dw = hand.length === 10 ? deadwoodOf(hand) : hand.length === 11 ? bestAfterDiscard(hand) : null;

  let hint = '';
  if (!mine) hint = game.turnUid ? `${names[game.turnUid] ?? '?'} の番です` : '';
  else if (phase === 'INITIAL_OFFER') hint = '最初の公開カードを取りますか？';
  else if (phase === 'WAITING_FOR_DRAW') hint = '山札か捨て札をタップして1枚引きます';
  else if (phase === 'WAITING_FOR_DISCARD')
    hint = !card ? '捨てるカードを選んでください' : (REASONS[discard.reason] ?? (!knock.ok && !gin.ok ? REASONS[knock.reason] ?? '' : ''));
  if (phase === 'SHOWDOWN') hint = mine ? '手札を公開しています…' : `${names[game.knock.uid]} が${game.knock.type === 'gin' ? 'ジン' : 'ノック'}しました。相手の公開を待っています`;

  const k = game.knock;
  return h(
    'section',
    { class: 'board gin' },
    h(
      'div',
      { class: 'scores' },
      h('span', null, `ラウンド${game.round}`),
      game.order.map((u) => h('span', { class: u === uid ? 'me' : '' }, `${names[u] ?? '?'} ${game.scores[u]}点${u === game.dealer ? '（親）' : ''}`)),
    ),
    h(
      'div',
      { class: 'piles' },
      h('div', { class: 'pile' }, back(`山札 ${game.deckCount}`, { disabled: busy || !drawDeck.ok, onClick: send({ type: 'draw', source: 'deck' }) }), h('div', { class: 'sub' }, '山札')),
      h(
        'div',
        { class: 'pile' },
        top ? cardView(top, { anim: 'drop', key: `top:${top}`, onClick: !busy && drawDiscard.ok ? send({ type: 'draw', source: 'discard' }) : undefined }) : h('div', { class: 'card empty' }),
        h('div', { class: 'sub' }, '捨て札'),
      ),
    ),
    k &&
      h(
        'div',
        { class: 'declared' },
        h('strong', null, `${names[k.uid]} の${k.type === 'gin' ? 'ジン' : 'ノック'}（デッドウッド${k.dw}点）`),
        h('div', { class: 'meld-row' }, k.melds.map((m) => h('span', { class: 'meld' }, m.cards.map((c) => cardView(c, { small: true }))))),
      ),
    h('div', { class: 'hint' }, hint),
    phase === 'INITIAL_OFFER' &&
      mine &&
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'primary', disabled: busy || !drawDiscard.ok, onClick: send({ type: 'draw', source: 'discard' }) }, '取る'),
        h('button', { disabled: busy, onClick: send({ type: 'pass' }) }, 'パス'),
      ),
    phase === 'WAITING_FOR_DISCARD' &&
      mine &&
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'primary', disabled: busy || !discard.ok, onClick: send({ type: 'discard', card }) }, '捨てる'),
        h('button', { disabled: busy || !knock.ok, onClick: send({ type: 'knock', card }) }, 'ノック'),
        h('button', { disabled: busy || !gin.ok, onClick: send({ type: 'gin', card }) }, 'ジン'),
      ),
    phase === 'SHOWDOWN' && mine && h('div', { class: 'actions' }, h('button', { class: 'primary', disabled: busy, onClick: send({ type: 'showdown' }) }, '手札を公開する')),
    dw != null && h('div', { class: 'sub' }, hand.length === 11 ? `デッドウッド：捨て方しだいで最小 ${dw}点` : `デッドウッド：${dw}点`),
  );
}
