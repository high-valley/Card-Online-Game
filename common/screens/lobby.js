import { getGame, games } from '../../games/index.js';
import { h } from '../ui/h.js';

/** 待機画面：参加者、招待URL、ホストのルール設定・ゲーム切り替え・開始 */
export function lobbyScreen({ app, model, actions }) {
  const { room, players, uid } = model;
  const game = getGame(room.gameId);
  const isHost = room.hostUid === uid;
  const url = `${location.origin}${location.pathname}?room=${model.roomId}`;
  const canStart = players.length >= game.minPlayers && players.length <= game.maxPlayers;

  return h(
    'main',
    { class: 'screen' },
    h('h1', null, game.name),
    h('p', { class: 'sub' }, `${game.minPlayers}〜${game.maxPlayers}人 ／ ルームコード `, h('strong', null, room.code)),
    game.rulebook && h('button', { class: 'link rules-link', onClick: () => actions.showRules(room.gameId, room.options) }, 'ルールを見る'),
    h('div', { class: 'invite' }, h('input', { type: 'text', readOnly: true, value: url, onFocus: (e) => e.target.select() }), h('button', { onClick: () => actions.copy(url) }, app.copied ? 'コピーしました' : '招待URLをコピー')),
    h('h2', null, `参加者（${players.length}/${game.maxPlayers}）`),
    h(
      'ul',
      { class: 'players' },
      players.map((p) => h('li', null, p.name, p.uid === room.hostUid && h('span', { class: 'badge' }, 'ホスト'), p.uid === uid && h('span', { class: 'sub' }, '（あなた）'))),
    ),
    game.OptionsForm &&
      h(
        'div',
        { class: 'options' },
        h('h2', null, isHost ? 'ルール設定' : 'ルール（ホストが設定します）'),
        game.OptionsForm({ options: room.options, onChange: actions.setOptions, readOnly: !isHost }),
      ),
    app.notice && h('p', { class: 'notice' }, app.notice),
    isHost
      ? [
          room.status === 'dealing'
            ? h('p', null, 'カードを配っています…')
            : h('button', { class: 'primary', disabled: app.busy || !canStart, onClick: () => actions.start() }, canStart ? 'ゲーム開始' : `${game.minPlayers}人以上で開始できます`),
          h(
            'label',
            { class: 'field-row' },
            h('span', null, 'ゲームを切り替える'),
            h(
              'select',
              { onChange: (e) => actions.changeGame(e.target.value) },
              games.map((g) => h('option', { value: g.id, selected: g.id === room.gameId, disabled: players.length > g.maxPlayers }, g.name)),
            ),
          ),
        ]
      : h('p', { class: 'sub' }, 'ホストが開始するのを待っています…'),
    h('button', { class: 'link', onClick: () => actions.leave() }, 'ルームを出る'),
  );
}
