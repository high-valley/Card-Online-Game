// ホストが途中でゲームを終了できることの確認。Emulator と vite dev サーバーを起動して実行する。
//   node tests-e2e/abort-game.mjs
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
  pages.push(page);
}
const [host, a, b] = pages;
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

await host.goto(URL0);
await host.fill('input[placeholder="ニックネーム"]', names[0]);
await host.click('button:has-text("ルームを作る")');
await host.waitForSelector('text=参加者（1/5）');
const invite = await host.inputValue('.invite input');
for (const [i, g] of [a, b].entries()) {
  await g.goto(invite);
  await g.fill('input[placeholder="ニックネーム"]', names[i + 1]);
  await g.click('button:has-text("ルームに参加する")');
  await g.waitForSelector('text=ホストが開始するのを待っています');
}
await host.waitForSelector('text=参加者（3/5）');
await host.click('button:has-text("ゲーム開始")');
await Promise.all(pages.map((p) => p.waitForSelector('.board')));

ok((await a.locator('button:has-text("ゲームを終了")').count()) === 0, 'ホスト以外には終了ボタンが出ない');
await host.click('button:has-text("ゲームを終了")');
await Promise.all(pages.map((p) => p.waitForSelector('button:has-text("ルームを出る")')));
ok((await host.locator('button:has-text("ゲーム開始")').count()) === 1, 'ホストは待機画面に戻り、再び開始できる');
await a.waitForSelector('text=ホストがゲームを終了しました');
ok(true, 'ほかの参加者に終了が通知される');
ok((await host.locator('text=結果').count()) === 0, '結果画面にはならない');

await host.click('button:has-text("ゲーム開始")');
await Promise.all(pages.map((p) => p.waitForSelector('.board')));
const sizes = await Promise.all(pages.map((p) => p.locator('.hand .card').count()));
ok(sizes.reduce((x, y) => x + y) === 53, '終了後にもう一度始めると、新しく配り直される');
await browser.close();
