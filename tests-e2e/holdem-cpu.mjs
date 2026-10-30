// テキサスホールデムのCPU対戦（人間1人＋CPU3人。ブラウザの中だけで進む）を数ハンド通す。
//   LEVEL=normal node tests-e2e/holdem-cpu.mjs     （easy / normal / hard）
// 開発サーバー（と、ログイン用のエミュレータ）を起動して実行する。SHOTS=ディレクトリ で画面を保存
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const URL0 = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const LEVEL = process.env.LEVEL ?? 'normal';
const LABEL = { easy: 'かんたん', normal: 'ふつう', hard: 'つよい' }[LEVEL];
const HANDS = Number(process.env.HANDS ?? 3);
const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
p.on('dialog', (d) => d.accept());
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => m.type() === 'error' && console.log('console.error', m.text().slice(0, 200)));
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };
const shot = (name) => process.env.SHOTS && p.screenshot({ path: `${process.env.SHOTS}/${name}.png` });

await p.goto(URL0);
await p.fill('input[placeholder="ニックネーム"]', 'あなた');
await p.click('.game-tile:has-text("テキサスホールデム")');
await p.click(`.levels [data-level="${LEVEL}"]`);
await p.click('.game-detail button:has-text("CPU3人と対戦")');
await p.waitForSelector('.board.holdem');
ok((await p.locator('.opp-name', { hasText: `（${LABEL}）` }).count()) === 3, `相手は CPU3人（${LABEL}）`);
ok((await p.locator('.hand .card').count()) === 2, '手札が2枚');
ok(new URL(p.url()).searchParams.get('room') === null, 'URLにルームIDは付かない（Firebaseを使わない）');
await shot('start');

let hands = 0;
let moves = 0;
const deadline = Date.now() + Number(process.env.DEADLINE_MS ?? 180_000);
while (Date.now() < deadline && hands < HANDS) {
  if (await p.locator('table.result').count()) {
    hands++;
    console.log(`ハンド${hands}:`, (await p.locator('main').innerText()).replace(/\n+/g, ' / ').slice(0, 240));
    await shot(`result${hands}`);
    if (hands >= HANDS) break;
    if (await p.locator('button:has-text("新しいトーナメント")').count()) { console.log('トーナメント終了'); break; }
    await p.click('button:has-text("次のハンド")');
    await p.waitForSelector('.board.holdem');
    continue;
  }
  const bar = p.locator('.holdem-actions');
  if (await bar.count()) {
    // コールかチェックを基本に、ときどきレイズする
    const raise = bar.locator('button.primary');
    const pick = moves % 4 === 3 && (await raise.count()) ? raise : bar.locator('button:has-text("チェック"), button:has-text("コール"), button:has-text("オールイン")').first();
    await pick.click().catch(() => {});
    moves++;
    if (moves === 2) await shot('midhand');
  } else await p.waitForTimeout(250);
}
ok(hands >= 1, `${hands}ハンド最後まで進んだ（あなたの操作 ${moves} 回）`);
await p.click('button:has-text("ゲームを終了"), button:has-text("ルームを出る")');
await p.waitForSelector('text=ゲームを選ぶ');
ok(true, 'トップに戻れた');
await browser.close();
