import { getGame } from '../../games/index.js';
import { h } from '../ui/h.js';

/** 結果画面：順位・階級・得点と、このルームでの通算成績 */
export function resultScreen({ app, model, actions }) {
  const { room, players, state, uid } = model;
  const result = state.result;
  const isHost = room.hostUid === uid;
  const names = Object.fromEntries(players.map((p) => [p.uid, p.name]));
  const mod = getGame(room.gameId);
  const totals = (p) => p.totalPoints?.[room.gameId] ?? 0;

  return h(
    'main',
    { class: 'screen' },
    h('h1', null, '結果'),
    h('p', { class: 'sub' }, `${mod.name} 第${state.round}回`),
    h(
      'table',
      { class: 'result' },
      h('thead', null, h('tr', null, ['順位', '名前', '階級', '今回', '通算'].map((t) => h('th', null, t)))),
      h(
        'tbody',
        null,
        result.ranking.map((u, i) => {
          const p = players.find((x) => x.uid === u);
          return h('tr', { class: u === uid ? 'me' : '' }, h('td', null, i + 1), h('td', null, names[u] ?? '?'), h('td', null, result.titles?.[u] ?? ''), h('td', null, `+${result.points[u]}`), h('td', null, p ? totals(p) : ''));
        }),
      ),
    ),
    mod.ResultDetail?.({ result, names, uid, game: state.game }),
    mod.rulebook && h('button', { class: 'link', onClick: () => actions.showRules(room.gameId, state.game?.options) }, 'ルールを見る'),
    app.notice && h('p', { class: 'notice' }, app.notice),
    isHost
      ? [
          h('button', { class: 'primary', disabled: app.busy, onClick: () => actions.start() }, mod.resultActionLabel?.(result) ?? 'もう一度'),
          h('button', { disabled: app.busy, onClick: () => actions.backToLobby() }, room.local ? (mod.OptionsForm ? 'ルールを変える' : 'トップへ') : '別のゲームで遊ぶ'),
        ]
      : h('p', { class: 'sub' }, 'ホストの操作を待っています…'),
    h('button', { class: 'link', onClick: () => actions.leave() }, 'ルームを出る'),
  );
}
