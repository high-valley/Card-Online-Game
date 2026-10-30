// クリベッジ2人対戦（オンライン）の通しテスト。Emulator と vite dev サーバーを起動して実行する。
//   node tests-e2e/cribbage.mjs
// 非公開のクリブ・山札が Firestore 経由で正しく受け渡され、1ラウンドが採点まで進むことを確かめる。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const names = ['ホスト', 'ゲスト'];
const pages = [];
for (const name of names) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name}] console.error`, m.text().slice(0, 200)));
  pages.push(page);
}
const [host, guest] = pages;
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

await host.goto(URL0);
await host.fill('input[placeholder="ニックネーム"]', names[0]);
await host.click('.game-tile:has-text("クリベッジ")');
await host.click('.game-detail button:has-text("ルームを作る")');
await host.waitForSelector('text=参加者（1/2）');
const invite = await host.inputValue('.invite input');
await guest.goto(invite);
await guest.fill('input[placeholder="ニックネーム"]', names[1]);
await guest.click('button:has-text("ルームに参加する")');
await guest.waitForSelector('text=ホストが開始するのを待っています');
await host.waitForSelector('text=参加者（2/2）');
await host.click('button:has-text("ゲーム開始")');
await Promise.all(pages.map((p) => p.waitForSelector('.board.cribbage')));
const sizes = await Promise.all(pages.map((p) => p.locator('.hand .card').count()));
ok(sizes[0] === 6 && sizes[1] === 6, `両者に6枚ずつ配られた ${sizes}`);

const btn = (p, label) => p.locator('.actions button', { hasText: label });

async function tryMove(p) {
  if ((await btn(p, 'クリブに置く').count()) && (await p.locator('.hand .card').count()) === 6) {
    await p.locator('.hand .card').nth(0).click({ position: { x: 7, y: 24 } });
    await p.locator('.hand .card').nth(1).click({ position: { x: 7, y: 24 } });
    await btn(p, 'クリブに置く').click();
    return 'discard';
  }
  if (await btn(p, '出す').count()) {
    if (await btn(p, 'Go').count()) { await btn(p, 'Go').click(); return 'go'; }
    await p.locator('.hand .card:not(.dim)').first().click({ position: { x: 7, y: 24 } });
    await btn(p, '出す').click();
    return 'play';
  }
  if (await p.locator('.actions button.primary', { hasText: '採点' }).count()) {
    await p.locator('.actions button.primary').click();
    return 'show';
  }
  return null;
}

const seen = {};
const deadline = Date.now() + Number(process.env.DEADLINE_MS ?? 420_000);
while (Date.now() < deadline && !(await host.locator('.crib-result').count())) {
  let moved = false;
  for (const p of pages) {
    const r = await tryMove(p).catch(() => null);
    if (r) { seen[r] = (seen[r] ?? 0) + 1; moved = true; await p.waitForTimeout(100); }
  }
  if (!moved) await host.waitForTimeout(200);
}
console.log('moves', JSON.stringify(seen));
if (!(await host.locator('.crib-result').count())) {
  for (const [i, p] of pages.entries()) {
    console.log(`[${names[i]}] 停滞時の状態:`, JSON.stringify(await p.evaluate(() => ({ notice: document.querySelector('.notice')?.textContent, busy: window.__app?.busy, myTurn: window.__app?.model?.state?.turnUid === window.__app?.uid, phase: window.__app?.model?.state?.game?.phase, ver: window.__app?.model?.state?.version, count: window.__app?.model?.state?.game?.peg?.count, hand: window.__app?.model?.hand, played: window.__app?.model?.state?.game?.peg?.played, actions: [...document.querySelectorAll('.actions button')].map((b) => b.textContent + (b.disabled ? '(無効)' : '')), hint: document.querySelector('.hint')?.textContent }))));
  }
}
await Promise.all(pages.map((p) => p.waitForSelector('.crib-result', { timeout: 15000 })));
ok(true, '両者がラウンド結果画面に到達した');
ok(seen.discard === 2 && seen.play === 8, `クリブは2回、出札は8枚 ${JSON.stringify(seen)}`);
ok(seen.show === 3, '手札2回＋クリブ1回の採点');
const [a, b] = await Promise.all(pages.map((p) => p.locator('.crib-breakdown').count()));
ok(a === 3 && b === 3, `両者の画面に採点内訳が3つ（手札2・クリブ1）`);
console.log((await host.locator('.crib-result').innerText()).replace(/\n+/g, ' / ').slice(0, 300));
await browser.close();
