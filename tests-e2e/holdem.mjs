// テキサスホールデムのオンライン3人対戦の通しテスト（全員チェック／コールでショーダウンまで）。
// Emulator（auth 9099 / firestore 8080）と vite dev サーバー（5173）を起動してから実行する。
//   node tests-e2e/holdem.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch();
const names = ['ホスト', 'ゲストA', 'ゲストB'];
const pages = [];
for (const name of names) {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name}] console.error`, m.text().slice(0, 200)));
  pages.push(page);
}
const [host, ...guests] = pages;
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

await host.goto(URL0);
await host.fill('input[placeholder="ニックネーム"]', names[0]);
await host.click('li:has-text("テキサスホールデム") button:has-text("ルームを作る")');
await host.waitForSelector('text=参加者（1/9）');
const invite = await host.inputValue('.invite input');
for (const [i, g] of guests.entries()) {
  await g.goto(invite);
  await g.fill('input[placeholder="ニックネーム"]', names[i + 1]);
  await g.click('button:has-text("ルームに参加する")');
  await g.waitForSelector('text=ホストが開始するのを待っています');
}
await host.waitForSelector('text=参加者（3/9）');
await host.selectOption('select[name="startingChips"]', '1000');
await host.selectOption('select[name="levelHands"]', '3');
ok(await guests[0].locator('select[name="startingChips"]').isDisabled(), 'ゲストは設定を変えられない');
await host.click('button:has-text("ゲーム開始")');
await Promise.all(pages.map((p) => p.waitForSelector('.board.holdem')));
ok((await Promise.all(pages.map((p) => p.locator('.hand .card').count()))).every((n) => n === 2), '各自に手札が2枚ずつ配られた');
ok((await host.locator('.community .card.empty').count()) === 5, 'プリフロップでは場に何も開いていない');
const overflow = await Promise.all(pages.map((p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)));
ok(overflow.every((x) => x <= 0), `スマホ幅（390px）で横にはみ出さない ${overflow}`);

async function tryMove(p, fold) {
  const bar = p.locator('.holdem-actions');
  if (!(await bar.count())) return false;
  if (fold) { await bar.locator('button:has-text("フォールド")').click(); return true; }
  const check = bar.locator('button:has-text("チェック")');
  if (await check.count()) { await check.click(); return true; }
  await bar.locator('button:has-text("コール"), button:has-text("オールイン")').first().click();
  return true;
}

let hands = 0;
let sawFlop = false;
const deadline = Date.now() + Number(process.env.DEADLINE_MS ?? 120_000);
while (Date.now() < deadline && hands < 2) {
  if (await host.locator('table.result').count()) {
    hands++;
    console.log(`ハンド${hands}の結果:`, (await host.locator('main').innerText()).replace(/\n+/g, ' / ').slice(0, 260));
    if (hands < 2) {
      await host.click('button:has-text("次のハンド")');
      await Promise.all(pages.map((p) => p.waitForSelector('.board.holdem')));
    }
    continue;
  }
  if (!sawFlop && (await host.locator('.community .card:not(.empty)').count()) >= 3) sawFlop = true;
  let moved = false;
  for (const [i, p] of pages.entries()) {
    // 2ハンド目は、ゲストBがプリフロップで降りる
    if (await tryMove(p, hands === 1 && i === 2 && !sawFlop).catch(() => false)) { moved = true; await p.waitForTimeout(150); }
  }
  if (!moved) await host.waitForTimeout(250);
}
ok(sawFlop, 'フロップが開いた');
ok(hands === 2, '2ハンド最後まで進んだ');
await browser.close();
