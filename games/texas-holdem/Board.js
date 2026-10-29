import { cardView } from '../../common/ui/cards.js';
import { h } from '../../common/ui/h.js';
import { reasonText } from './messages.js';
import { BLIND_LEVELS, betInfo, blindsFor, canPlay } from './rules.js';

const fmt = (n) => n.toLocaleString('ja-JP');

/** ベット額の下書き（再描画されても、操作中の額が戻らないよう画面の外に持つ）。ラウンドや場の状況が変わったら最小に戻す */
let draft = { key: '', to: 0 };

/** 次のブラインドレベルまでの案内 */
function levelText(game) {
  const { levelHands } = game.options;
  const left = levelHands - ((game.handNo - 1) % levelHands);
  const next = blindsFor(game.handNo + left, levelHands);
  return `ハンド${game.handNo} ／ ブラインド ${fmt(game.blinds.sb)}/${fmt(game.blinds.bb)}（あと${left}ハンドで ${fmt(next.sb)}/${fmt(next.bb)}）`;
}

/** 場の5枚（まだ開いていない分は空き枠） */
function community(game) {
  return h(
    'div',
    { class: 'community', 'aria-label': '場のカード' },
    Array.from({ length: 5 }, (_, i) => {
      const c = game.board[i];
      return c ? cardView(c, { anim: 'drop', key: `board:${game.handNo}:${c}` }) : h('div', { class: 'card empty', 'aria-hidden': 'true' });
    }),
  );
}

/** ベット／レイズの入力（スライダー・数字・早見ボタン）と確定ボタン */
function raiseControls({ game, info, uid, busy, send }) {
  const { minTo, maxTo } = info;
  const verb = game.currentBet > 0 ? 'レイズ' : 'ベット';
  const key = `${game.handNo}:${game.phase}:${game.currentBet}:${uid}`;
  if (draft.key !== key) draft = { key, to: minTo };
  draft.to = Math.min(Math.max(draft.to, minTo), maxTo);

  const number = h('input', { type: 'number', inputMode: 'numeric', min: minTo, max: maxTo, step: 1, 'aria-label': `${verb}後の合計額`, value: draft.to });
  const range = h('input', { type: 'range', min: minTo, max: maxTo, step: Math.max(1, Math.floor(game.blinds.sb / 5)), 'aria-label': `${verb}額`, value: draft.to });
  const submit = h('button', { class: 'primary', disabled: busy, onClick: () => send(draft.to >= maxTo ? { type: 'allin' } : { type: 'raise', to: draft.to }) });
  const label = () => (draft.to >= maxTo ? `オールイン ${fmt(maxTo)}` : `${verb} ${fmt(draft.to)}`);
  const set = (v, from) => {
    draft.to = Math.min(Math.max(Math.round(Number(v) || minTo), minTo), maxTo);
    if (from !== number) number.value = draft.to;
    if (from !== range) range.value = draft.to;
    submit.textContent = label();
  };
  number.addEventListener('input', () => set(number.value, number));
  number.addEventListener('change', () => set(number.value));
  range.addEventListener('input', () => set(range.value, range));
  submit.textContent = label();

  // ポットサイズのレイズ：コールしたあとのポットの何割を上乗せするか
  const potRaise = (frac) => game.currentBet + (info.pot + info.toCall) * frac;
  const quick = (text, value) => h('button', { type: 'button', class: 'quick', disabled: busy, onClick: () => set(value) }, text);
  return h(
    'div',
    { class: 'raise-box' },
    h('div', { class: 'raise-row' }, range, number),
    h('div', { class: 'raise-quick' }, quick('最小', minTo), quick('½ポット', potRaise(0.5)), quick('ポット', potRaise(1)), quick('オールイン', maxTo)),
    submit,
  );
}

/** テキサスホールデムのゲーム画面中央：ブラインド・場のカード・ポット・各自のベット・操作 */
export function Board({ game, hand, uid, names, onAction, busy }) {
  const mine = game.turnUid === uid;
  const send = (a) => onAction({ ...a, uid });
  const name = (u) => names[u] ?? '?';
  const pot = Object.values(game.total).reduce((a, b) => a + b, 0);
  const showdown = game.phase === 'SHOWDOWN';
  const betting = mine && !game.ended && !showdown;
  const info = betting ? betInfo(game, uid) : null;

  let hint = '';
  if (game.ended) hint = '';
  else if (showdown) hint = mine ? '手札を公開します…' : `${name(game.turnUid)} が手札を公開します`;
  else if (!game.dealt.includes(uid)) hint = '脱落しました。観戦中です';
  else if (game.folded[uid]) hint = 'フォールドしました';
  else if (!mine) hint = game.turnUid ? `${name(game.turnUid)} の番です` : '';
  else if (info.toCall > 0) hint = `コールは ${fmt(info.toCall)}${info.toCall >= info.chips ? '（オールイン）' : ''}`;
  else hint = 'チェックするか、ベットしてください';

  const bets = game.order.filter((u) => (game.bets[u] ?? 0) > 0);
  const shown = Object.entries(game.shown);

  const callCheck = betting && (info.canCheck
    ? h('button', { disabled: busy, onClick: () => send({ type: 'check' }) }, 'チェック')
    : h('button', { disabled: busy || !canPlay(game, hand, { type: 'call', uid }).ok, onClick: () => send({ type: info.toCall >= info.chips ? 'allin' : 'call' }) }, info.toCall >= info.chips ? `オールイン ${fmt(info.chips)}` : `コール ${fmt(info.toCall)}`));

  return h(
    'section',
    { class: 'board holdem' },
    h('div', { class: 'sub level-info' }, levelText(game)),
    community(game),
    h(
      'div',
      { class: 'pot' },
      h('strong', null, `ポット ${fmt(pot)}`),
      bets.length > 0 && h('span', { class: 'sub' }, bets.map((u) => `${name(u)} ${fmt(game.bets[u])}`).join(' ／ ')),
    ),
    shown.length > 0 &&
      h(
        'div',
        { class: 'shown-hands' },
        shown.map(([u, cards]) => h('div', { class: 'shown' }, h('span', { class: 'sub' }, name(u)), h('span', { class: 'shown-cards' }, cards.map((c) => cardView(c, { small: true, anim: 'drop', key: `shown:${game.handNo}:${c}` }))))),
      ),
    h('div', { class: 'hint' }, hint),
    betting &&
      h(
        'div',
        { class: 'actions holdem-actions' },
        h('button', { disabled: busy, onClick: () => send({ type: 'fold' }) }, 'フォールド'),
        callCheck,
        info.canRaise && raiseControls({ game, info, uid, busy, send }),
      ),
  );
}

export { reasonText, BLIND_LEVELS };
