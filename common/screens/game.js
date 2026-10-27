import { getGame } from '../../games/index.js';
import { cardView } from '../ui/cards.js';
import { h } from '../ui/h.js';

const STALE_MS = 60_000;

const effectText = { 'eight-cut': '8切り', revolution: '革命', spade3: 'スペ3返し', lock: 'しばり', flush: '場が流れた', out: '上がり', foul: '反則上がり', fall: '都落ち' };

function logLine(entry, names, mod) {
  const custom = mod.logText?.(entry, names);
  if (custom) return custom;
  const who = names[entry.uid] ?? '?';
  const base = entry.type === 'play' ? `${who}: ${entry.cards.join(' ')}` : entry.type === 'pass' ? `${who}: パス` : `${who}: スキップ`;
  const fx = (entry.effects ?? []).map((e) => effectText[e]).filter(Boolean);
  return fx.length ? `${base}（${fx.join('・')}）` : base;
}

/** ゲーム画面：上に他プレイヤーとログ、中央にゲームの Board、下に自分の手札 */
export function gameScreen({ app, model, actions }) {
  const { room, players, state, uid, hand } = model;
  const mod = getGame(room.gameId);
  const names = Object.fromEntries(players.map((p) => [p.uid, p.name]));
  const g = state.game;
  const turn = state.turnUid;
  const isHost = room.hostUid === uid;
  const turnPlayer = players.find((p) => p.uid === turn);
  const lastSeen = turnPlayer?.lastSeen?.toMillis?.();
  const stale = turn && turn !== uid && lastSeen != null && Date.now() - lastSeen > STALE_MS;

  const sorted = mod.sortHand(hand, g);
  const selected = sorted.filter((c) => app.selected.has(c));
  const mine = turn === uid;

  return h(
    'main',
    { class: 'screen game' },
    h(
      'div',
      { class: 'opponents' },
      players.map((p) => {
        const st = mod.playerStatus?.(g, p) ?? { text: `${p.handCount}枚`, out: false };
        return h(
          'div',
          { class: `opp${p.uid === turn ? ' turn' : ''}${st.out ? ' out' : ''}` },
          h('div', { class: 'opp-name' }, p.name, p.uid === uid && '（自分）'),
          h('div', { class: 'opp-count' }, st.text),
        );
      }),
    ),
    stale && isHost && h('div', { class: 'skip' }, `${turnPlayer.name} の応答がありません `, h('button', { disabled: app.busy, onClick: () => actions.skip() }, 'スキップ')),
    mod.Board({
      game: g, hand, uid, selected, names, busy: app.busy,
      onAction: (action) => actions.act(action),
    }),
    app.notice && h('p', { class: 'notice' }, app.notice),
    h('ol', { class: 'log' }, state.log.slice(-5).reverse().map((e) => h('li', null, logLine(e, names, mod)))),
    h(
      'div',
      { class: 'hand' },
      sorted.map((c) => cardView(c, { selected: app.selected.has(c), onClick: mine ? () => actions.toggleCard(c) : undefined })),
    ),
    isHost && h('button', { class: 'link end-game', disabled: app.busy, onClick: () => actions.endGame() }, 'ゲームを終了'),
  );
}
