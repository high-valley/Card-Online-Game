import { h } from './h.js';

const SUIT_MARK = { S: '♠', H: '♥', D: '♦', C: '♣' };

/** カード1枚の表示部品。全ゲーム共通。onClick を渡すと手札として選べる */
export function cardView(id, { selected = false, small = false, fresh = false, onClick, anim, key, attrs = {} } = {}) {
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
      ...attrs,
      onClick,
    },
    face(id, joker),
  );
}

/** 実際のトランプのように、左上と右下（逆さ）に数字とマーク、中央に大きなマーク */
function face(id, joker) {
  const rank = joker ? 'JK' : id.slice(1);
  const mark = joker ? '★' : SUIT_MARK[id[0]];
  const corner = (pos) => h('span', { class: `corner ${pos}` }, h('span', { class: 'rank' }, rank), h('span', { class: 'suit' }, mark));
  return [corner('tl'), h('span', { class: 'pip', 'aria-hidden': 'true' }, mark), corner('br')];
}

export const suitMark = (s) => SUIT_MARK[s] ?? '';
