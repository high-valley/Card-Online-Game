import { h } from './h.js';

const SUIT_MARK = { S: '♠', H: '♥', D: '♦', C: '♣' };

/** カード1枚の表示部品。全ゲーム共通。onClick を渡すと手札として選べる */
export function cardView(id, { selected = false, small = false, fresh = false, onClick, anim, key } = {}) {
  const joker = id.startsWith('JK');
  const red = id[0] === 'H' || id[0] === 'D';
  return h(
    'button',
    {
      type: 'button',
      class: `card${joker ? ' joker' : red ? ' red' : ''}${selected ? ' selected' : ''}${small ? ' small' : ''}${fresh ? ' fresh' : ''}`,
      // 選べないカードも、手札の並べ替え（ドラッグ）はできるように disabled にはしない
      'aria-disabled': onClick ? null : 'true',
      tabindex: onClick ? null : '-1',
      'aria-pressed': onClick ? String(selected) : null,
      'data-id': id,
      // 新しく現れたときに動かす（main.js が data-key の増減を見てアニメーションさせる）
      'data-anim': anim,
      'data-key': anim ? key ?? id : null,
      onClick,
    },
    joker ? h('span', { class: 'rank' }, 'JOKER') : [h('span', { class: 'rank' }, id.slice(1)), h('span', { class: 'suit' }, SUIT_MARK[id[0]])],
  );
}

export const suitMark = (s) => SUIT_MARK[s] ?? '';
