const THRESHOLD = 8; // これ以上動いたらタップではなくドラッグとみなす（px）
const SLOP = 10; // 落とし場所の判定を、見た目より少し広くする（指で狙いやすいように）

/**
 * ドラッグ＆ドロップ（マウスでも指でも動くよう Pointer Events を使う）。
 *
 * ドラッグできるもの（source）:
 *   手札のカード … `.hand .card[data-id]`            → { kind: 'hand', id }
 *   山札・捨て札 … `[data-drag="deck" | "discard"]`  → { kind: 'pile', name }
 * 落とせる場所（target）: `[data-drop="名前"]`。`data-accepts="hand pile"` で、受け付ける source の種類を絞れる。
 *
 * タップ（ほとんど動かさない操作）は、これまでどおりクリックとして動く。ドラッグ直後のクリックだけ打ち消す。
 * ドロップ後にどうするかは onDrop で呼び出し側が決める（このファイルはゲームのことを知らない）。
 *
 * @param {HTMLElement} root 画面全体。この中のものだけがドラッグ・ドロップの対象
 * @param {{onStart: () => void, onEnd: () => void,
 *          onDrop: (d: {source: {kind: string, id?: string, name?: string}, target: string|null, x: number, y: number}) => void}} cb
 */
export function enableDnd(root, { onStart, onEnd, onDrop }) {
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest?.('[data-drag], .hand .card[data-id]');
    if (!el || !root.contains(el)) return;
    const source = el.dataset.drag ? { kind: 'pile', name: el.dataset.drag } : { kind: 'hand', id: el.dataset.id };
    const origin = { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    let ghost = null;
    let targets = [];
    let over = null;

    const hit = (x, y) => {
      let best = null;
      for (const t of targets) {
        const r = t.getBoundingClientRect();
        if (x < r.left - SLOP || x > r.right + SLOP || y < r.top - SLOP || y > r.bottom + SLOP) continue;
        const area = r.width * r.height;
        if (!best || area < best.area) best = { t, area }; // いちばん狭い（＝具体的な）場所を優先
      }
      return best?.t ?? null;
    };

    const start = () => {
      onStart();
      document.body.classList.add('dnd-active');
      el.classList.add('drag-origin');
      ghost = el.cloneNode(true);
      ghost.classList.remove('selected', 'fresh', 'drag-origin');
      ghost.classList.add('dnd-ghost');
      ghost.removeAttribute('data-anim');
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      document.body.append(ghost);
      targets = [...root.querySelectorAll('[data-drop]')].filter((t) => (t.dataset.accepts ?? 'hand pile').split(' ').includes(source.kind));
      targets.forEach((t) => t.classList.add('drop-ready'));
    };

    const move = (ev) => {
      const dx = ev.clientX - origin.x;
      const dy = ev.clientY - origin.y;
      if (!ghost) {
        if (Math.hypot(dx, dy) < THRESHOLD) return;
        start();
      }
      ghost.style.transform = `translate(${rect.left + dx}px, ${rect.top + dy}px) scale(1.1) rotate(${Math.max(-8, Math.min(8, dx / 20))}deg)`;
      const t = hit(ev.clientX, ev.clientY);
      if (t !== over) {
        over?.classList.remove('drop-over');
        t?.classList.add('drop-over');
        over = t;
      }
    };

    const finish = (ev, drop) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      if (!ghost) return;
      const target = drop ? hit(ev.clientX, ev.clientY) : null;
      ghost.remove();
      el.classList.remove('drag-origin');
      targets.forEach((t) => t.classList.remove('drop-ready', 'drop-over'));
      document.body.classList.remove('dnd-active');
      // ドラッグ直後に出るクリックは、タップ（選択・引く）として扱わない
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
      el.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => el.removeEventListener('click', swallow, true), 0);
      if (drop) onDrop({ source, target: target?.dataset.drop ?? null, x: ev.clientX, y: ev.clientY });
      onEnd();
    };
    const up = (ev) => finish(ev, true);
    const cancel = (ev) => finish(ev, false);

    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
  });
}

/** 手札の中で、位置 (x, y) にいちばん近いカード（excludeId を除く）と、その右側かどうか */
export function nearestCard(container, x, y, excludeId) {
  let best = null;
  for (const c of container.querySelectorAll('.card[data-id]')) {
    if (c.dataset.id === excludeId) continue;
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const d = Math.hypot(x - cx, y - (r.top + r.height / 2));
    if (!best || d < best.d) best = { id: c.dataset.id, d, after: x > cx };
  }
  return best;
}
