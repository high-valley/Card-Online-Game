import { getGame } from '../../games/index.js';
import { cardView } from '../ui/cards.js';
import { enableDnd, nearestCard } from '../ui/dnd.js';
import { applyOrder, moveCard } from '../ui/handOrder.js';
import { isMuted } from '../ui/sound.js';
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

/** 名前から決まる色相（アイコンの色分け用） */
const hueOf = (name) => [...name].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 360, 17);

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

  // 手札の並び：ドラッグで並べ替えていればその順、なければゲームの自動整列（役ごとにまとめる）
  const auto = mod.sortHand(hand, g);
  const sorted = applyOrder(app.handOrder, hand, auto);
  const groups = !app.handOrder && mod.handGroups ? mod.handGroups(hand, g) : [sorted];
  const selected = sorted.filter((c) => app.selected.has(c));
  const mine = turn === uid;

  // 重なり具合は CSS が、枚数（--n）とまとまりの数（--g）と画面幅から決める（17〜18枚でもスマホ幅に収まる）
  const handEl = h(
    'div',
    { class: 'hand', style: `--n:${hand.length};--g:${groups.length}`, 'data-drop': 'hand', 'data-accepts': 'hand pile' },
    groups.map((group) =>
      h('span', { class: 'hand-group' }, group.map((c) => cardView(c, { selected: app.selected.has(c), fresh: app.fresh.has(c), anim: 'pop', key: `hand:${c}`, onClick: mine ? () => actions.toggleCard(c) : undefined }))),
    ),
  );

  const screen = h(
    'main',
    { class: 'screen game' },
    // 上のバー：ゲーム名・ルール・音・並べ替え・終了
    h(
      'div',
      { class: 'hand-tools topbar' },
      h('span', { class: 'brand' }, mod.name),
      h('span', { class: 'spacer' }),
      app.handOrder && h('button', { class: 'link', onClick: () => actions.autoSort() }, '自動整列'),
      mod.rulebook && h('button', { class: 'link', onClick: () => actions.showRules(room.gameId, g.options) }, 'ルール'),
      h('button', { class: 'link', 'aria-pressed': String(!isMuted()), onClick: () => actions.toggleSound() }, isMuted() ? '効果音 OFF' : '効果音 ON'),
      isHost && h('button', { class: 'link end-game', disabled: app.busy, onClick: () => actions.endGame() }, 'ゲームを終了'),
    ),
    h(
      'div',
      { class: 'opponents' },
      players.map((p) => {
        const st = mod.playerStatus?.(g, p) ?? { text: `${p.handCount}枚`, out: false };
        const fan = p.uid === uid || st.out ? 0 : Math.min(p.handCount, 14);
        return h(
          'div',
          { class: `opp${p.uid === turn ? ' turn' : ''}${st.out ? ' out' : ''}${p.uid === uid ? ' self' : ''}` },
          h('div', { class: 'avatar', style: `--hue:${hueOf(p.name)}`, 'aria-hidden': 'true' }, [...p.name][0] ?? '?'),
          h('div', { class: 'opp-name' }, p.name, p.uid === uid && '（自分）'),
          h('div', { class: 'opp-count' }, st.text),
          fan > 0 && h('div', { class: 'opp-fan', 'aria-hidden': 'true' }, Array.from({ length: fan }, () => h('span', { class: 'mini-back' }))),
        );
      }),
    ),
    stale && isHost && h('div', { class: 'skip' }, `${turnPlayer.name} の応答がありません `, h('button', { disabled: app.busy, onClick: () => actions.skip() }, 'スキップ')),
    mod.Board({
      game: g, hand, uid, selected, names, busy: app.busy, fresh: [...app.fresh], log: state.log,
      onAction: (action) => actions.act(action),
    }),
    app.notice && h('p', { class: 'notice', role: 'status' }, app.notice),
    handEl,
    h('ol', { class: 'log', 'aria-label': '直近の出来事' }, state.log.slice(-4).reverse().map((e) => h('li', null, logLine(e, names, mod)))),
  );

  // ドラッグ＆ドロップ：手札の並べ替え、そして「引く・捨てる・出す」をゲームごとの dropAction で行う
  enableDnd(screen, {
    onStart: () => actions.dragStart(),
    onEnd: () => actions.dragEnd(),
    onDrop: ({ source, target, x, y }) => {
      if (source.kind === 'hand' && target === 'hand') {
        const near = nearestCard(handEl, x, y, source.id);
        if (near) actions.reorderHand(moveCard(sorted, source.id, near.id, near.after));
        return;
      }
      if (!mod.dropAction || !target) return;
      // 選択中のカードをドラッグしたら、選択中のカードをまとめて動かす
      const cards = source.kind === 'hand' ? (selected.includes(source.id) ? selected : [source.id]) : [];
      const result = mod.dropAction({ game: g, hand, uid, source: { ...source, cards }, target });
      if (result?.error) actions.toast(result.error);
      else if (result?.action) actions.act(result.action);
    },
  });
  return screen;
}