const THRESHOLD = 8; // これ以上動いたらタップではなくドラッグとみなす（px）

/**
 * 手札のカードをドラッグして並べ替える（マウスでも指でも動くよう Pointer Events を使う）。
 * タップ（ほとんど動かさない操作）はこれまでどおり「選択」になり、ドラッグ直後のクリックだけ打ち消す。
 * @param {HTMLElement} container 手札の入れ物。中の .card（data-id 付き）が対象
 * @param {{onDragStart: () => void, onDragEnd: () => void, onReorder: (moving: string, anchor: string, after: boolean) => void}} cb
 */
export function enableHandDrag(container, { onDragStart, onDragEnd, onReorder }) {
  container.addEventListener('pointerdown', (e) => {
    const card = e.target.closest?.('.card');
    if (!card || !container.contains(card) || !card.dataset.id) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const origin = { x: e.clientX, y: e.clientY };
    let dragging = false;

    const move = (ev) => {
      const dx = ev.clientX - origin.x;
      const dy = ev.clientY - origin.y;
      if (!dragging) {
        if (Math.hypot(dx, dy) < THRESHOLD) return;
        dragging = true;
        onDragStart();
        card.classList.add('dragging');
      }
      card.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;
    };

    const finish = (ev, drop) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      if (!dragging) return;
      card.style.transform = '';
      card.classList.remove('dragging');
      // ドラッグ直後に出るクリックは、カードの選択として扱わない
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
      card.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => card.removeEventListener('click', swallow, true), 0);
      if (drop) {
        // いちばん近いカードの前か後ろに入れる
        const others = [...container.querySelectorAll('.card[data-id]')].filter((c) => c !== card);
        let nearest = null;
        for (const c of others) {
          const r = c.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const d = Math.hypot(ev.clientX - cx, ev.clientY - (r.top + r.height / 2));
          if (!nearest || d < nearest.d) nearest = { c, d, after: ev.clientX > cx };
        }
        if (nearest) onReorder(card.dataset.id, nearest.c.dataset.id, nearest.after);
      }
      onDragEnd();
    };
    const up = (ev) => finish(ev, true);
    const cancel = (ev) => finish(ev, false);

    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
  });
}
