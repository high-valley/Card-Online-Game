// ジン・ラミー2人対戦の通しテスト。Emulator と vite dev サーバーを起動して実行する。
//   node tests-e2e/gin-rummy.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const names = ['ホスト', 'ゲスト'];
const pages = [];
for (const name of names) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name}] console.error`, m.text().slice(0, 200)));
  pages.push(page);
}
const [host, guest] = pages;
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

await host.goto(URL0);
await host.fill('input[placeholder="ニックネーム"]', names[0]);
await host.click('li:has-text("ジン・ラミー") button:has-text("ルームを作る")');
await host.waitForSelector('text=参加者（1/2）');
const invite = await host.inputValue('.invite input');
await guest.goto(invite);
await guest.fill('input[placeholder="ニックネーム"]', names[1]);
await guest.click('button:has-text("ルームに参加する")');
await guest.waitForSelector('text=ホストが開始するのを待っています');
await host.waitForSelector('text=参加者（2/2）');
await host.click('button:has-text("ゲーム開始")');
await Promise.all(pages.map((p) => p.waitForSelector('.board.gin')));
const sizes = await Promise.all(pages.map((p) => p.locator('.hand .card').count()));
ok(sizes[0] === 10 && sizes[1] === 10, `両者に10枚ずつ配られた ${sizes}`);

const enabled = (p, label) => p.locator('.actions button', { hasText: label }).isEnabled().catch(() => false);

async function tryMove(p) {
  const hint = await p.locator('.board .hint').innerText().catch(() => '');
  if (hint.includes('最初の公開カード')) { await p.click('.actions button:has-text("パス")'); return 'pass'; }
  if (hint.includes('山札か捨て札')) { await p.click('.pile .card.back'); return 'draw'; }
  const n = await p.locator('.hand .card').count();
  if (n !== 11 || !(await p.locator('.actions button:has-text("捨てる")').count())) return null;
  // 画面に出ている「捨て方しだいの最小デッドウッド」が10点以下のときだけ、ノック／ジンを探す
  const info = await p.locator('.board .sub', { hasText: '最小' }).innerText().catch(() => '');
  const best = Number(/最小 (\d+)点/.exec(info)?.[1] ?? 99);
  let discardIdx = -1;
  for (let i = 0; i < n; i++) {
    await p.locator('.hand .card').nth(i).click({ position: { x: 7, y: 24 } });
    if (best <= 10) {
      if (await enabled(p, 'ジン')) { await p.click('.actions button:has-text("ジン")'); return 'gin'; }
      if (await enabled(p, 'ノック')) { await p.click('.actions button:has-text("ノック")'); return 'knock'; }
    }
    if (await enabled(p, '捨てる')) { discardIdx = i; if (best > 10) break; }
    else await p.locator('.hand .card').nth(i).click({ position: { x: 7, y: 24 } });
    if (best <= 10) await p.locator('.hand .card').nth(i).click({ position: { x: 7, y: 24 } });
  }
  if (discardIdx < 0) return null;
  if (best <= 10) await p.locator('.hand .card').nth(discardIdx).click({ position: { x: 7, y: 24 } }); // 探している間は選択を外していたので選び直す
  await p.click('.actions button:has-text("捨てる")');
  return 'discard';
}

const seen = {};
const deadline = Date.now() + Number(process.env.DEADLINE_MS ?? 240_000);
while (Date.now() < deadline && !(await host.locator('.gin-result').count())) {
  let moved = false;
  for (const p of pages) {
    const r = await tryMove(p).catch(() => null);
    if (r) { seen[r] = (seen[r] ?? 0) + 1; moved = true; await p.waitForTimeout(100); }
  }
  if (!moved) await host.waitForTimeout(200);
}
console.log('moves', JSON.stringify(seen));
if (!(await host.locator('.gin-result').count())) {
  for (const [i, p] of pages.entries()) { try { console.log(`[${names[i]}] 再試行:`, await tryMove(p)); } catch (e) { console.log(`[${names[i]}] 再試行エラー:`, e.message.split('\n')[0]); } }
  for (const [i, p] of pages.entries()) console.log(`[${names[i]}] ボタン状態:`, JSON.stringify(await p.evaluate(() => ({ deckDisabled: document.querySelector('.pile .card.back')?.disabled, deckClass: document.querySelector('.pile .card.back')?.className, actions: [...document.querySelectorAll('.actions button')].map((b) => b.textContent + (b.disabled ? '(無効)' : '')), notice: document.querySelector('.notice')?.textContent, busy: window.__app?.busy, turn: window.__app?.model?.state?.turnUid === window.__app?.uid, phase: window.__app?.model?.state?.game?.phase, ver: window.__app?.model?.state?.version, sel: [...(window.__app?.selected ?? [])] }))));
  for (const [i, p] of pages.entries()) console.log(`[${names[i]}] 停滞時の画面:`, (await p.locator('body').innerText()).replace(/\n+/g, ' / ').slice(0, 500));
}
await Promise.all(pages.map((p) => p.waitForSelector('.gin-result', { timeout: 15000 })));
ok(true, '両者がラウンド結果画面に到達した');
console.log((await host.locator('.gin-result').innerText()).replace(/\n+/g, ' / ').slice(0, 300));
ok((await guest.locator('button:has-text("次のラウンド"), button:has-text("配り直す"), button:has-text("新しいマッチ")').count()) === 0, 'ボタンはホストだけに出る');
await host.click('button:has-text("次のラウンド"), button:has-text("配り直す"), button:has-text("新しいマッチ")');
await Promise.all(pages.map((p) => p.waitForSelector('.board.gin')));
ok((await host.locator('.hand .card').count()) === 10, '次のラウンドが配られた');
await browser.close();
