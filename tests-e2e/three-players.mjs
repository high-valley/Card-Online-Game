// 3人対戦の通しテスト。Emulator（auth 9099 / firestore 8080）と vite dev サーバー（5173）を起動してから実行する。
//   node tests-e2e/three-players.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const names = ['ホスト', 'ゲストA', 'ゲストB'];
const pages = [];
for (const name of names) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name}] console.error`, m.text()));
  pages.push(page);
}
const [host, ...guests] = pages;
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

await host.goto(URL0);
await host.fill('input[placeholder="ニックネーム"]', names[0]);
await host.click('button:has-text("ルームを作る")');
await host.waitForSelector('text=参加者（1/5）');
const invite = await host.inputValue('.invite input');
console.log('invite', invite);

for (const [i, g] of guests.entries()) {
  await g.goto(invite);
  await g.fill('input[placeholder="ニックネーム"]', names[i + 1]);
  await g.click('button:has-text("ルームに参加する")');
  await g.waitForSelector('text=ホストが開始するのを待っています');
}
await host.waitForSelector('text=参加者（3/5）');
ok(true, '3人が待機画面に揃った');

await host.click('button:has-text("ゲーム開始")');
await Promise.all(pages.map((p) => p.waitForSelector('.board')));
const counts = await Promise.all(pages.map((p) => p.locator('.hand .card').count()));
console.log('hand sizes', counts);
ok(counts.reduce((a, b) => a + b) === 53, '53枚が配られ、各自は自分の手札だけ見える');
const overflow = await Promise.all(pages.map((p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)));
ok(overflow.every((x) => x <= 0), `スマホ幅（390px）で手札が横にはみ出さない ${overflow}`);

async function tryMove(p) {
  const hint = await p.locator('.hint').innerText().catch(() => '');
  if (!hint || / の番です$/.test(hint)) return false; // 他の人の番
  const n = await p.locator('.hand .card').count();
  for (let i = 0; i < n; i++) {
    const c = p.locator('.hand .card').nth(i);
    await c.click();
    const play = p.locator('.actions .primary');
    if (await play.isEnabled()) { await play.click(); return true; }
    await p.locator('.hand .card').nth(i).click();
  }
  const pass = p.locator('.actions button', { hasText: 'パス' });
  if (await pass.isEnabled()) { await pass.click(); return true; }
  return false;
}

const deadline = Date.now() + Number(process.env.DEADLINE_MS ?? 120_000);
let moves = 0;
while (Date.now() < deadline) {
  if (await host.locator('table.result').count()) break;
  let moved = false;
  for (const p of pages) { const t0 = Date.now(); if (await tryMove(p).catch(() => false)) { moved = true; moves++; if (process.env.TIMING) console.log(`move ${moves}: ${Date.now() - t0}ms`); await p.waitForTimeout(150); } }
  if (!moved) await host.waitForTimeout(200);
}
console.log('moves', moves);
if (!(await host.locator('table.result').count())) {
  for (const [i, p] of pages.entries()) console.log(`[${names[i]}] 停滞時の画面:`, (await p.locator('body').innerText()).replace(/\n+/g, ' / ').slice(0, 400));
}
await Promise.all(pages.map((p) => p.waitForSelector('table.result', { timeout: 10_000 })));
ok(true, '全員が結果画面に到達した');
console.log(await host.locator('table.result').innerText());
await host.screenshot({ path: process.env.SHOT ?? '/tmp/result.png' });

await host.click('button:has-text("もう一度")');
await Promise.all(pages.map((p) => p.waitForSelector('.board')));
ok(true, 'もう一度で2回戦が始まった');
const turnHand = await Promise.all(pages.map((p) => p.locator('.hint').innerText()));
console.log('2回戦 hints', turnHand);
await browser.close();
