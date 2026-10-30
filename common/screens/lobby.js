import { getGame, games } from '../../games/index.js';
import { avatarView } from '../ui/avatars.js';
import { h } from '../ui/h.js';
import { icon } from '../ui/icons.js';
import { versionPanel } from '../ui/versionPanel.js';

/** 待機画面：参加者、招待URL、ホストのルール設定・ゲーム切り替え・開始 */
export function lobbyScreen({ app, model, actions }) {
  const { room, players, uid } = model;
  const game = getGame(room.gameId);
  const isHost = room.hostUid === uid;
  const url = `${location.origin}${location.pathname}?room=${model.roomId}`;
  const solo = !!room.local; // CPU対戦の設定画面：招待・ルームコード・ゲームの切り替えは出さない
  const canStart = players.length >= game.minPlayers && players.length <= game.maxPlayers;

  return h(
    'main',
    { class: 'screen lobby' },
    h('header', { class: 'screen-head' },
      h('button', { class: 'square ghost', 'aria-label': solo ? 'トップへ' : 'ルームを出る', onClick: () => actions.leave() }, icon('back')),
      h('h1', null, solo ? 'CPU対戦の設定' : '待機ルーム'),
      game.rulebook ? h('button', { class: 'square ghost', 'aria-label': 'ルールを見る', onClick: () => actions.showRules(room.gameId, room.options) }, icon('help')) : h('span', { class: 'square-space' })),
    h('p', { class: 'lobby-game' }, h('strong', null, game.name), h('span', { class: 'sub' }, solo ? ' ／ ルールを決めて始めます' : ` ／ ${game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}〜${game.maxPlayers}`}人`)),
    !solo &&
      h('section', { class: 'panel room-code' },
        h('div', null, h('span', { class: 'label' }, 'ルームコード'), h('strong', { class: 'code' }, room.code)),
        h('button', { class: 'copy', onClick: () => actions.copy(url) }, icon('copy'), app.copied ? 'コピーしました' : 'リンクをコピー'),
        // 招待URLそのもの（長押しでコピーしたいとき用。画面には小さく出す）
        h('div', { class: 'invite' }, h('input', { type: 'text', readOnly: true, value: url, 'aria-label': '招待URL', onFocus: (e) => e.target.select() }))),
    h('section', { class: 'panel' },
      h('h2', null, solo ? '対戦相手' : `参加者（${players.length}/${game.maxPlayers}）`),
      h(
        'ul',
        { class: 'players' },
        players.map((p) =>
          h('li', { class: p.uid === uid ? 'me' : '' },
            avatarView(p, { size: '40px' }),
            h('span', { class: 'player-name' }, p.name, p.uid === uid && h('span', { class: 'sub' }, '（あなた）')),
            p.uid === room.hostUid && !solo && h('span', { class: 'badge host' }, icon('crown'), 'ホスト'))),
      )),
    game.OptionsForm &&
      h(
        'section',
        { class: 'panel options' },
        h('h2', null, isHost ? 'ルール・設定' : 'ルール（ホストが設定します）'),
        game.OptionsForm({ options: room.options, onChange: actions.setOptions, readOnly: !isHost }),
      ),
    isHost && !solo && h(
      'label',
      { class: 'panel field-row switch-game' },
      h('span', null, 'ゲームを切り替える'),
      h(
        'select',
        { onChange: (e) => actions.changeGame(e.target.value) },
        games.map((g) => h('option', { value: g.id, selected: g.id === room.gameId, disabled: players.length > g.maxPlayers }, g.name)),
      ),
    ),
    app.notice && h('p', { class: 'notice' }, app.notice),
    h('div', { class: 'start-bar' },
      isHost
        ? room.status === 'dealing'
          ? h('p', null, 'カードを配っています…')
          : h('button', { class: 'primary big', disabled: app.busy || !canStart, onClick: () => actions.start() }, icon('play'), canStart ? 'ゲーム開始' : `${game.minPlayers}人以上で開始できます`)
        : h('p', { class: 'sub waiting' }, 'ホストが開始するのを待っています…'),
      h('button', { class: 'link', onClick: () => actions.leave() }, solo ? 'トップへ' : 'ルームを出る')),
    versionPanel({ app, actions }),
  );
}
