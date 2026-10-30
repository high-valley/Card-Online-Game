import { chipStackSvg } from '../../common/ui/art.js';
import { avatarView } from '../../common/ui/avatars.js';
import { cardView } from '../../common/ui/cards.js';
import { h } from '../../common/ui/h.js';
import { betInfo, blindsFor, canPlay } from './rules.js';

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

/** ベット／レイズ：金のボタン（確定）と、額のスライダー・数字・早見ボタン。確定ボタンは操作の行に並べる */
function raiseControls({ game, info, uid, busy, send }) {
  const { minTo, maxTo } = info;
  const verb = game.currentBet > 0 ? 'レイズ' : 'ベット';
  const key = `${game.handNo}:${game.phase}:${game.currentBet}:${uid}:${minTo}:${maxTo}`;
  if (draft.key !== key) draft = { key, to: minTo };
  draft.to = Math.min(Math.max(draft.to, minTo), maxTo);

  const number = h('input', { type: 'number', inputMode: 'numeric', min: minTo, max: maxTo, step: 1, 'aria-label': `${verb}後の合計額`, value: draft.to });
  const range = h('input', { type: 'range', min: minTo, max: maxTo, step: Math.max(1, Math.floor(game.blinds.sb / 5)), 'aria-label': `${verb}額`, value: draft.to });
  const title = h('span', { class: 'btn-title' });
  const amount = h('span', { class: 'btn-amount' });
  const submit = h('button', { class: 'primary', disabled: busy, onClick: () => send(draft.to >= maxTo ? { type: 'allin' } : { type: 'raise', to: draft.to }) }, title, amount);
  const label = () => {
    title.textContent = draft.to >= maxTo ? 'オールイン' : verb;
    amount.textContent = fmt(draft.to);
  };
  const set = (v, from) => {
    draft.to = Math.min(Math.max(Math.round(Number(v) || minTo), minTo), maxTo);
    if (from !== number) number.value = draft.to;
    if (from !== range) range.value = draft.to;
    range.style.setProperty('--fill', `${((draft.to - minTo) / Math.max(1, maxTo - minTo)) * 100}%`);
    label();
  };
  number.addEventListener('input', () => set(number.value, number));
  number.addEventListener('change', () => set(number.value));
  range.addEventListener('input', () => set(range.value, range));
  set(draft.to);

  // ポットサイズのレイズ：コールしたあとのポットの何割を上乗せするか
  const potRaise = (frac) => game.currentBet + (info.pot + info.toCall) * frac;
  const quick = (text, value) => h('button', { type: 'button', class: 'quick', disabled: busy, onClick: () => set(value) }, text);
  return {
    submit,
    box: h(
      'div',
      { class: 'raise-box' },
      h('div', { class: 'raise-row' }, h('span', { class: 'label' }, `${verb}額`), range, number),
      h('div', { class: 'raise-quick' }, quick('最小', minTo), quick('½ポット', potRaise(0.5)), quick('ポット', potRaise(1)), quick('オールイン', maxTo)),
    ),
  };
}

/** ハンドの決着：誰がいくら取ったか（役つき）、戻った分、自分の増減。結果画面に切り替えずに卓の上で見せる */
function handSummary(game, uid, name) {
  const hr = game.handResult;
  if (!hr) return null;
  const won = new Map(); // 勝者ごとの獲得額（返却分は別に出す）
  for (const p of hr.pots.filter((x) => !x.refund)) {
    const share = Math.floor(p.amount / p.winners.length);
    p.winners.forEach((u, i) => won.set(u, (won.get(u) ?? 0) + share + (i < p.amount - share * p.winners.length ? 1 : 0)));
  }
  return h(
    'div',
    { class: 'hand-summary', role: 'status' },
    [...won].map(([u, amount]) =>
      h('p', { class: `won${u === uid ? ' me' : ''}` },
        h('strong', null, `${u === uid ? 'あなた' : name(u)} が ${fmt(amount)} を獲得`),
        hr.uncontested ? h('span', { class: 'sub' }, '（他の人が降りました）') : hr.hands[u] && h('span', { class: 'hand-name' }, hr.hands[u].name)),
    ),
    hr.pots.filter((p) => p.refund).map((p) => h('p', { class: 'sub' }, `${name(p.winners[0])} の ${fmt(p.amount)} は受けてもらえなかったので戻りました`)),
  );
}

/**
 * 相手の席の位置（卓の中心からの角度）。自分は手前（下）に座り、左隣から時計回りに、左 → 奥 → 右へ並べる。
 * 返すのは卓の大きさに対する % の座標
 */
function seatSpots(k) {
  // 4人までは奥の半周に。5人以上は左右の下の方まで使って、間をあける
  const from = k <= 4 ? 205 : 152;
  const to = k <= 4 ? 335 : 388;
  return Array.from({ length: k }, (_, i) => {
    const deg = k === 1 ? 270 : from + ((to - from) * i) / (k - 1);
    const rad = (deg * Math.PI) / 180;
    return { x: 50 + (k <= 4 ? 40 : 42) * Math.cos(rad), y: 43 + 34 * Math.sin(rad) };
  });
}

/** 席の目印：ディーラーボタン・SB・BB */
function marker(game, u) {
  const list = [];
  if (u === game.dealer) list.push(h('span', { class: 'mk dealer', title: 'ディーラー' }, 'D'));
  if (u === game.sbUid) list.push(h('span', { class: 'mk blind', title: 'スモールブラインド' }, 'SB'));
  if (u === game.bbUid) list.push(h('span', { class: 'mk blind', title: 'ビッグブラインド' }, 'BB'));
  return list.length ? h('span', { class: 'markers' }, list) : null;
}

/** 席の状態の短い文字（フォールド・オールイン・脱落） */
function seatState(game, u) {
  if (!game.dealt.includes(u)) return '脱落';
  if (game.folded[u]) return 'フォールド';
  if (game.chips[u] === 0 && !game.ended) return 'オールイン';
  return '';
}

const isWinner = (game, u) => !!game.handResult?.pots.some((p) => !p.refund && p.winners.includes(u));

/** 相手の席：伏せたカード（公開されたら表）、顔、名前とチップ、このラウンドのベット */
function seatView({ game, player, spot, turnUid, crowded }) {
  const u = player.uid;
  const inHand = game.dealt.includes(u) && !game.folded[u];
  const shown = game.shown[u];
  const state = seatState(game, u);
  const cards = shown
    ? h('span', { class: 'seat-cards shown-cards' }, shown.map((c) => cardView(c, { small: true, anim: 'drop', key: `shown:${game.handNo}:${c}` })))
    : inHand && h('span', { class: 'seat-cards backs', 'aria-hidden': 'true' }, h('span', { class: 'mini-card' }), h('span', { class: 'mini-card' }));
  const bet = game.bets[u] ?? 0;
  return h(
    'div',
    {
      // ベット額は名札の横に出す（右側の席は左へ、それ以外は右へ）。下に出すとポットの表示に重なる
      class: `seat${spot.x > 55 ? ' bet-left' : ''}${u === turnUid ? ' turn' : ''}${state ? ` is-${state === 'オールイン' ? 'allin' : state === '脱落' ? 'out' : 'folded'}` : ''}${isWinner(game, u) ? ' winner' : ''}`,
      style: `left:${spot.x}%;top:${spot.y}%`,
    },
    cards,
    h('span', { class: 'seat-face' }, avatarView(player, { size: crowded ? '36px' : '48px' }), marker(game, u)),
    h('span', { class: 'seat-plate' }, h('span', { class: 'opp-name' }, player.name), h('span', { class: 'opp-count' }, state || fmt(game.chips[u] ?? 0))),
    bet > 0 && h('span', { class: 'seat-bet' }, h('span', { class: 'chip-dot', 'aria-hidden': 'true' }), fmt(bet)),
  );
}

/** 卓の中央：ポット（チップの山）と、場の5枚。決着したら、誰がいくら取ったかに替わる */
function center(game, uid, name) {
  const pot = Object.values(game.total).reduce((a, b) => a + b, 0);
  const pile = h('span', { class: 'pot-chips', 'aria-hidden': 'true' });
  pile.innerHTML = `<svg viewBox="0 0 110 44">${chipStackSvg(30, 34, 3, '#c8242c')}${chipStackSvg(55, 38, 4, '#2a5bc4')}${chipStackSvg(80, 34, 3, '#2f8a5a')}</svg>`;
  return h(
    'div',
    { class: 'table-center' },
    game.ended
      ? handSummary(game, uid, name)
      : h('div', { class: 'pot' }, h('span', { class: 'pot-label' }, 'ポット'), h('strong', null, fmt(pot)), pot > 0 && pile),
    community(game),
  );
}

/** テキサスホールデムのゲーム画面中央：楕円の卓（相手の席・ポット・場のカード・自分の席と手札）と、その下の操作 */
export function Board({ game, hand, uid, names, onAction, busy, handEl, players = [], turnUid }) {
  const mine = game.turnUid === uid;
  const send = (a) => onAction({ ...a, uid });
  const name = (u) => names[u] ?? '?';
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

  // 席：自分の左隣から時計回り
  const me = game.order.indexOf(uid);
  const others = me < 0 ? game.order : [...game.order.slice(me + 1), ...game.order.slice(0, me)];
  const byUid = Object.fromEntries(players.map((p) => [p.uid, p]));
  const spots = seatSpots(others.length);
  const crowded = others.length >= 5;
  const meP = byUid[uid] ?? { uid, name: name(uid) };
  const myBet = game.bets[uid] ?? 0;
  const delta = game.ended && game.dealt.includes(uid) ? game.chips[uid] - (game.startChips[uid] ?? 0) : 0;
  const myState = seatState(game, uid);

  // 操作：自分の番なら押せる。それ以外は同じ並びを押せない状態で出し、画面がずれないようにする
  let actions = null;
  if (!game.ended) {
    if (betting) {
      const raise = info.canRaise ? raiseControls({ game, info, uid, busy, send }) : null;
      const allinCall = info.toCall >= info.chips;
      const callCheck = info.canCheck
        ? h('button', { class: 'go', disabled: busy, onClick: () => send({ type: 'check' }) }, h('span', { class: 'btn-title' }, 'チェック'))
        : h('button', { class: 'go', disabled: busy || !canPlay(game, hand, { type: 'call', uid }).ok, onClick: () => send({ type: allinCall ? 'allin' : 'call' }) },
            h('span', { class: 'btn-title' }, allinCall ? 'オールイン' : 'コール'), h('span', { class: 'btn-amount' }, fmt(allinCall ? info.chips : info.toCall)));
      actions = h(
        'div',
        { class: 'actions holdem-actions' },
        h('div', { class: 'hint' }, hint),
        h('div', { class: 'main-row' }, h('button', { class: 'danger', disabled: busy, onClick: () => send({ type: 'fold' }) }, h('span', { class: 'btn-title' }, 'フォールド')), callCheck, raise?.submit),
        raise?.box,
      );
    } else {
      actions = h(
        'div',
        { class: 'actions holdem-idle', 'aria-hidden': 'true' },
        h('div', { class: 'hint' }, hint),
        h('div', { class: 'main-row' }, h('button', { class: 'danger', disabled: true, tabindex: '-1' }, 'フォールド'), h('button', { class: 'go', disabled: true, tabindex: '-1' }, 'コール'), h('button', { class: 'primary', disabled: true, tabindex: '-1' }, 'レイズ')),
      );
    }
  }

  return h(
    'section',
    { class: 'board holdem' },
    h('div', { class: 'level-info' }, levelText(game)),
    h(
      'div',
      { class: `poker-table${crowded ? ' crowded' : ''}` },
      h('div', { class: 'felt', 'aria-hidden': 'true' }),
      others.map((u, i) => seatView({ game, player: byUid[u] ?? { uid: u, name: name(u) }, spot: spots[i], turnUid, crowded })),
      center(game, uid, name),
      // 自分の席：手札（共通画面から受け取る）と、顔・名前・チップ
      h(
        'div',
        { class: `my-seat${mine && !game.ended ? ' turn' : ''}${isWinner(game, uid) ? ' winner' : ''}${myState ? ' dim' : ''}` },
        hand.length > 0 && handEl,
        h('div', { class: 'my-plate' },
          h('span', { class: 'seat-face' }, avatarView(meP, { size: '52px' }), marker(game, uid)),
          h('span', { class: 'my-info' }, h('span', { class: 'my-name' }, meP.name), h('strong', { class: 'my-chips' }, myState && myState !== 'オールイン' ? myState : fmt(game.chips[uid] ?? 0))),
          myBet > 0 && h('span', { class: 'seat-bet' }, h('span', { class: 'chip-dot', 'aria-hidden': 'true' }), fmt(myBet)),
          delta !== 0 && h('span', { class: `my-delta ${delta > 0 ? 'plus' : 'minus'}` }, `${delta > 0 ? '+' : ''}${fmt(delta)}`)),
      ),
    ),
    actions,
  );
}
