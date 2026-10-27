// ルール設定（OptionsForm）の確認。Emulator と vite dev サーバーを起動して実行する。
//   node tests-e2e/options.mjs
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
const checked = (p, key) => p.locator(`input[name="${key}"]`).isChecked();

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

ok((await checked(host, 'revolution')) && (await checked(host, 'eightCut')) && !(await checked(host, 'lock')), '初期値：革命・8切りON、しばりOFF');
ok(await a.locator('input[name="revolution"]').isDisabled(), 'ホスト以外は変更できない');

await host.locator('label.rule:has(input[name="revolution"])').click();
await host.locator('label.rule:has(input[name="lock"])').click();
for (const p of [a, b]) await p.waitForFunction(() => !document.querySelector('input[name="revolution"]').checked && document.querySelector('input[name="lock"]').checked);
ok(!(await checked(a, 'revolution')) && (await checked(a, 'lock')), '設定の変更がほかの参加者の画面に反映される');
ok(!(await checked(b, 'revolution')) && (await checked(b, 'lock')), '3人目の画面にも反映される');

await host.click('button:has-text("ゲーム開始")');
await Promise.all(pages.map((p) => p.waitForSelector('.board')));
if (!process.env.APP_URL) {
  // Emulator のデータを直接読み、設定がゲーム状態（state.game.options）に入っていることを確かめる
  const roomId = new URL(invite).searchParams.get('room');
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/demo-card-online-game/databases/(default)/documents/cards_rooms/${roomId}/state/current`, { headers: { Authorization: 'Bearer owner' } });
  const f = (await res.json()).fields.game.mapValue.fields.options.mapValue.fields;
  ok(f.revolution.booleanValue === false && f.lock.booleanValue === true && f.eightCut.booleanValue === true, '配布時の設定がゲーム状態に入っている');
}
await host.click('button:has-text("ゲームを終了")').catch(() => {});
await host.waitForSelector('button:has-text("ゲーム開始")', { timeout: 15000 }).catch(() => {});
ok(!(await checked(host, 'revolution')) && (await checked(host, 'lock')), '終了して待機に戻っても設定は保たれる');
await browser.close();
