// 大富豪のCPU対戦（人間1人＋CPU3人。ブラウザの中だけで進む）を1ゲーム最後まで通す。
//   LEVEL=normal node tests-e2e/daifugo-cpu.mjs     （easy / normal / hard）
// 開発サーバー（と、ログイン用のエミュレータ）を起動して実行する。
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const LEVEL = process.env.LEVEL ?? 'normal';
const LABEL = { easy: 'かんたん', normal: 'ふつう', hard: 'つよい' }[LEVEL];
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
p.on('dialog', (d) => d.accept());
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('console.error', m.text().slice(0, 200)));
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

await p.goto(URL0);
await p.fill('input[placeholder="ニックネーム"]', 'あなた');
await p.click('.game-tile:has-text("大富豪")');
await p.click(`.levels [data-level="${LEVEL}"]`);
await p.click('.game-detail button:has-text("CPU3人と対戦")');

// まずルールの設定画面が出る（招待URLやルームコードは出ない）。ここでルールを選んで始める
await p.waitForSelector('.options');
ok((await p.locator('.invite').count()) === 0 && (await p.locator('text=ルームコード').count()) === 0, '設定画面に、招待URL・ルームコードは出ない');
ok((await p.locator('.players li').count()) === 4, '対戦相手（あなた＋CPU3人）が並ぶ');
ok((await p.locator('input[name="revolution"]').isChecked()) && !(await p.locator('input[name="lock"]').isChecked()), 'ルールの初期値（革命ON・しばりOFF）');
await p.locator('label.rule:has(input[name="revolution"])').click();
await p.locator('label.rule:has(input[name="lock"])').click();
await p.click('button:has-text("ゲーム開始")');
await p.waitForSelector('.board');
const opts = await p.evaluate(() => window.__app.model.state.game.options);
ok(opts.revolution === false && opts.lock === true && opts.eightCut === true, `選んだルールで始まった（革命OFF・しばりON・8切りON）`);
await p.click('.hand-tools button:has-text("ルール")');
const rb = await p.locator('.modal').innerText();
ok(rb.includes('【OFF】革命') && rb.includes('【ON】しばり'), 'ルールブックにも、選んだ設定が載る');
await p.click('.modal .close');
ok((await p.locator('.opp-name', { hasText: `（${LABEL}）` }).count()) === 3, `相手は CPU3人（${LABEL}）`);
const total = (await p.locator('.opp-count').allInnerTexts()).filter((t) => t.endsWith('枚')).reduce((n, t) => n + parseInt(t, 10), 0);
ok(total === 53, `53枚が配られた（${total}）`);
ok(new URL(p.url()).searchParams.get('room') === null, 'URLにルームIDは付かない（Firebaseを使わない）');

async function tryMove() {
  const hint = await p.locator('.hint').innerText().catch(() => '');
  if (!hint || / の番です$/.test(hint)) return false;
  const n = await p.locator('.hand .card').count();
  for (let i = 0; i < n; i++) {
    await p.locator('.hand .card').nth(i).click({ position: { x: 7, y: 24 } });
    const play = p.locator('.actions .primary');
    if (await play.isEnabled()) { await play.click(); return true; }
    await p.locator('.hand .card').nth(i).click({ position: { x: 7, y: 24 } });
  }
  const pass = p.locator('.actions button', { hasText: 'パス' });
  if (await pass.isEnabled()) { await pass.click(); return true; }
  return false;
}

const deadline = Date.now() + Number(process.env.DEADLINE_MS ?? 240_000);
let moves = 0;
while (Date.now() < deadline && !(await p.locator('table.result').count())) {
  if (await tryMove().catch(() => false)) moves++;
  else await p.waitForTimeout(250);
}
console.log('あなたの手', moves);
await p.waitForSelector('table.result', { timeout: 5000 });
ok((await p.locator('table.result tbody tr').count()) === 4, '4人分の順位が出た');
console.log((await p.locator('table.result').innerText()).replace(/\n+/g, ' / '));
// 結果画面から設定へ戻り、ルールを変えて続けられる（設定は前回のまま残っている）
await p.click('button:has-text("ルールを変える")');
await p.waitForSelector('.options');
ok(!(await p.locator('input[name="revolution"]').isChecked()) && (await p.locator('input[name="lock"]').isChecked()), '設定画面に戻ると、設定は前回のまま');
await p.locator('label.rule:has(input[name="eightCut"])').click();
await p.click('button:has-text("ゲーム開始")');
await p.waitForSelector('.board');
const opts2 = await p.evaluate(() => ({ ...window.__app.model.state.game.options, round: window.__app.model.state.round }));
ok(opts2.eightCut === false && opts2.revolution === false && opts2.round === 2, `ルールを変えて2回戦が始まった（8切りOFF・2回戦）`);
ok((await p.locator('.hand .card').count()) > 0, '次のゲームが配られた');

// 途中でやめるとトップへ。始め直すと、設定は初期値に戻り、設定画面から「トップへ」でも戻れる
await p.click('button:has-text("ゲームを終了")');
await p.waitForSelector('text=ゲームを選ぶ');
ok(true, '途中でやめるとトップに戻る');
await p.click('.game-tile:has-text("大富豪")');
await p.click('.game-detail button:has-text("CPU3人と対戦")');
await p.waitForSelector('.options');
ok(await p.locator('input[name="revolution"]').isChecked(), '始め直すと、設定は初期値に戻る');
await p.click('button:has-text("トップへ")');
await p.waitForSelector('text=ゲームを選ぶ');
ok(true, '設定画面から「トップへ」で戻れる');
await browser.close();
