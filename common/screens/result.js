import { getGame } from '../../games/index.js';
import { avatarView } from '../ui/avatars.js';
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';

/** 結果画面：1位のバナー、順位・階級・得点の表、このルームでの通算成績、ゲームごとの詳細 */
export function resultScreen({ app, model, actions }) {
  const { room, players, state, uid } = model;
  const result = state.result;
  const isHost = room.hostUid === uid;
  const names = Object.fromEntries(players.map((p) => [p.uid, p.name]));
  const mod = getGame(room.gameId);
  const totals = (p) => p.totalPoints?.[room.gameId] ?? 0;
  const top = result.ranking[0];
  const topPlayer = players.find((p) => p.uid === top) ?? { uid: top };
  const decided = Object.values(result.points ?? {}).some((p) => p > 0); // 全員0点なら引き分け
  const title = result.titles?.[top] && !/枚$|点$/.test(result.titles[top]) ? result.titles[top] : '1位';

  return h(
    'main',
    { class: 'screen result-screen' },
    h('header', { class: 'screen-head' }, h('span', { class: 'square-space' }), h('h1', null, '結果'), h('span', { class: 'square-space' })),
    h('p', { class: 'lobby-game' }, h('strong', null, mod.name), h('span', { class: 'sub' }, ` ／ 第${state.round}回`)),
    decided &&
      h('section', { class: 'winner-banner' },
        h('div', { class: 'winner-avatar' }, icon('crown', 'crown'), avatarView(topPlayer, { size: '76px' })),
        h('div', { class: 'winner-text' }, h('span', { class: 'winner-title' }, title), h('strong', null, names[top] ?? '?'), top === uid && h('span', { class: 'sub' }, 'おめでとうございます！'))),
    h(
      'table',
      { class: 'result' },
      h('thead', null, h('tr', null, ['順位', 'プレイヤー', '階級', '今回', '通算'].map((t) => h('th', null, t)))),
      h(
        'tbody',
        null,
        result.ranking.map((u, i) => {
          const p = players.find((x) => x.uid === u);
          return h('tr', { class: `${u === uid ? 'me' : ''}${i === 0 ? ' first' : ''}` },
            h('td', { class: 'rank' }, `${i + 1}位`),
            h('td', { class: 'who' }, avatarView(p ?? { uid: u }, { size: '28px', ring: false }), h('span', null, names[u] ?? '?')),
            h('td', null, result.titles?.[u] ?? ''),
            h('td', null, `+${result.points[u]}`),
            h('td', null, p ? totals(p) : ''));
        }),
      ),
    ),
    mod.ResultDetail && h('section', { class: 'panel result-detail' }, mod.ResultDetail({ result, names, uid, game: state.game })),
    app.notice && h('p', { class: 'notice' }, app.notice),
    h('div', { class: 'start-bar' },
      isHost
        ? [
            h('button', { class: 'primary big', disabled: app.busy, onClick: () => actions.start() }, icon(result.matchOver ? 'trophy' : 'play'), mod.resultActionLabel?.(result) ?? 'もう一度'),
            h('button', { disabled: app.busy, onClick: () => actions.backToLobby() }, room.local ? (mod.OptionsForm ? 'ルールを変える' : 'トップへ') : '別のゲームで遊ぶ'),
          ]
        : h('p', { class: 'sub waiting' }, 'ホストの操作を待っています…'),
      h('div', { class: 'foot-links' },
        mod.rulebook && h('button', { class: 'link small', onClick: () => actions.showRules(room.gameId, state.game?.options) }, icon('help'), 'ルールを見る'),
        h('button', { class: 'link small', onClick: () => actions.leave() }, icon('exit'), 'ルームを出る'))),
  );
}
