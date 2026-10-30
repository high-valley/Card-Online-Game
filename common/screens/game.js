import { getGame } from '../../games/index.js';
import { cardView } from '../ui/cards.js';
import { enableDnd, nearestCard } from '../ui/dnd.js';
import { applyOrder, moveCard } from '../ui/handOrder.js';
import { isMuted } from '../ui/sound.js';
import { avatarView } from '../ui/avatars.js';
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';

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


/** マッチの途中の決着のあと：次へ進むまでの残り時間（バーが縮む）と、すぐ次へ・止めるボタン */
function nextBar({ app, mod, result, isHost, actions }) {
  const next = app.next;
  const label = mod.resultActionLabel?.(result) ?? '次へ';
  const running = next && !next.paused;
  const left = running ? Math.max(0, next.at - Date.now()) : 0;
  return h(
    'div',
    { class: `round-next panel${running ? ' running' : ''}` },
    h('div', { class: 'next-time' },
      h('span', { class: 'label' }, running ? `${label}まで` : isHost ? '止めています' : 'ホストの操作を待っています…'),
      running && h('div', { class: 'next-bar', 'aria-hidden': 'true' }, h('span', { style: `animation-duration:${next.ms}ms;animation-delay:-${next.ms - left}ms` }))),
    isHost &&
      h('div', { class: 'next-row' },
        h('button', { class: 'primary', disabled: app.busy, onClick: () => actions.start() }, icon(running ? 'forward' : 'play'), running ? `すぐ${label}へ` : label),
        running && h('button', { class: 'link small', onClick: () => actions.pauseNext() }, '止める')),
  );
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

  // 手札の並び：ドラッグで並べ替えていればその順、なければゲームの自動整列（役ごとにまとめる）
  const auto = mod.sortHand(hand, g);
  const sorted = applyOrder(app.handOrder, hand, auto);
  const groups = !app.handOrder && mod.handGroups ? mod.handGroups(hand, g) : [sorted];
  const selected = sorted.filter((c) => app.selected.has(c));
  const mine = turn === uid;
  // マッチの途中の決着：結果画面に切り替えず、この画面のまま結果を見せて次へ進む
  const between = room.status === 'finished';

  // 重なり具合は CSS が、枚数（--n）とまとまりの数（--g）と画面幅から決める（17〜18枚でもスマホ幅に収まる）
  const handEl = h(
    'div',
    { class: 'hand', style: `--n:${hand.length};--g:${groups.length}`, 'data-drop': 'hand', 'data-accepts': 'hand pile' },
    groups.map((group) =>
      h('span', { class: 'hand-group' }, group.map((c) => {
        const dim = mine && !!mod.dimCard?.(g, hand, c, uid);
        return cardView(c, { selected: app.selected.has(c), fresh: app.fresh.has(c), dim, anim: 'pop', key: `hand:${c}`, onClick: mine && !dim ? () => actions.toggleCard(c) : undefined });
      })),
    ),
  );

  const screen = h(
    'main',
    { class: 'screen game' },
    // 上のバー：ゲーム名と、並べ替え・ルール・音・メニュー（ゲームの終了など）
    h(
      'div',
      { class: 'hand-tools topbar' },
      h('span', { class: 'brand' }, mod.emblem && h('span', { class: `brand-mark${mod.emblem.red ? ' red' : ''}`, 'aria-hidden': 'true' }, mod.emblem.mark), mod.name),
      h('span', { class: 'spacer' }),
      app.handOrder && h('button', { class: 'tool', onClick: () => actions.autoSort() }, icon('sort'), h('span', null, '自動整列')),
      mod.rulebook && h('button', { class: 'tool', onClick: () => actions.showRules(room.gameId, g.options) }, icon('help'), h('span', null, 'ルール')),
      h('button', { class: 'tool', 'aria-pressed': String(!isMuted()), onClick: () => actions.toggleSound() }, icon(isMuted() ? 'mute' : 'sound'), h('span', null, '効果音')),
      h('button', { class: 'tool', 'aria-expanded': String(!!app.menuOpen), onClick: () => actions.toggleMenu() }, icon(app.menuOpen ? 'close' : 'menu'), h('span', null, 'メニュー')),
      app.menuOpen &&
        h('div', { class: 'menu-pop', role: 'menu' },
          isHost && h('button', { class: 'end-game', role: 'menuitem', disabled: app.busy, onClick: () => actions.endGame() }, icon('stop'), 'ゲームを終了'),
          !isHost && h('button', { role: 'menuitem', onClick: () => actions.leave() }, icon('exit'), 'ルームを出る')),
    ),
    !mod.seatsInBoard && h(
      'div',
      { class: 'opponents' },
      players.map((p) => {
        const st = mod.playerStatus?.(g, p) ?? { text: `${p.handCount}枚`, out: false };
        const fan = p.uid === uid || st.out ? 0 : Math.min(p.handCount, 14);
        return h(
          'div',
          { class: `opp${p.uid === turn ? ' turn' : ''}${st.out ? ' out' : ''}${p.uid === uid ? ' self' : ''}` },
          avatarView(p, { size: '40px' }),
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
      handEl: mod.handInBoard ? handEl : undefined,
      players: mod.seatsInBoard ? players : undefined,
      turnUid: turn,
    }),
    between && nextBar({ app, mod, result: state.result, isHost, actions }),
    app.notice && h('p', { class: 'notice', role: 'status' }, app.notice),
    !mod.handInBoard && handEl,
    !mod.hideLog && h('ol', { class: 'log', 'aria-label': '直近の出来事' }, state.log.slice(-4).reverse().map((e) => h('li', null, logLine(e, names, mod)))),
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