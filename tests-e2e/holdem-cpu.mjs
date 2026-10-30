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
// ルール設定のあるゲームは、まず設定画面が出る（初期値のまま始める）
await p.click('button:has-text("ゲーム開始")');
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
    // 結果画面に切り替わるのは、トーナメントが終わったときだけ
    ok(await p.locator('button:has-text("新しいトーナメント")').count() === 1, 'トーナメントが終わったときだけ結果画面になる');
    console.log('トーナメント終了');
    hands++;
    break;
  }
  if (await p.locator('.hand-summary').count()) {
    // 1ハンドの決着は、結果画面に切り替えず卓の上に出て、少し待つと自動で次のハンドが配られる
    hands++;
    console.log(`ハンド${hands}:`, (await p.locator('.hand-summary').innerText()).replace(/\n+/g, ' / '));
    await shot(`result${hands}`);
    if (hands >= HANDS) break;
    if (hands === 1) {
      ok((await p.locator('.round-next .next-bar').count()) === 1, '次のハンドまでの残り時間が出る');
      await p.waitForSelector('.hand-summary', { state: 'detached', timeout: 12_000 });
      ok(true, '何も押さなくても、次のハンドが配られた');
    } else {
      await p.click('.round-next button.primary'); // 「すぐ次のハンドへ」
      await p.waitForSelector('.hand-summary', { state: 'detached' });
    }
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
