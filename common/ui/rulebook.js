import { h } from './h.js';

let open = null;

/**
 * ルールブックを重ねて表示する。画面（#app）とは別の場所に出すので、ゲームが進んで画面が描き直されても閉じない。
 * @param {import('../types.js').GameModule} mod
 * @param {Object} [options] そのルームのルール設定
 */
export function showRulebook(mod, options) {
  if (!mod.rulebook) return;
  closeRulebook();
  const previous = document.activeElement;
  const close = h('button', { class: 'close', 'aria-label': '閉じる', onClick: closeRulebook }, '✕ 閉じる');
  const body = h(
    'div',
    { class: 'rulebook-body' },
    mod.rulebook(options).map((s) =>
      h('section', null, h('h3', null, s.title), (s.paras ?? []).map((t) => h('p', null, t)), s.list && h('ul', null, s.list.map((t) => h('li', null, t)))),
    ),
  );
  const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${mod.name}のルール`, tabindex: '-1' }, h('header', null, h('h2', null, `${mod.name}のルール`), close), body);
  const backdrop = h('div', { class: 'modal-backdrop', onClick: (e) => e.target === backdrop && closeRulebook() }, dialog);
  const onKey = (e) => e.key === 'Escape' && closeRulebook();
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  document.body.classList.add('modal-open');
  dialog.focus();
  open = () => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    document.body.classList.remove('modal-open');
    previous?.focus?.();
  };
}

export function closeRulebook() {
  open?.();
  open = null;
}
