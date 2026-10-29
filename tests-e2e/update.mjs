// 「最新版の確認」と「更新」の通しテスト。古い版を開いたまま、同じ場所に新しい版をビルドし直して、
// 公開（GitHub Pages）で起きることを再現する。ログイン用のエミュレータ（auth 9099）を起動して実行する。
//   node tests-e2e/update.mjs
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const out = mkdtempSync(join(tmpdir(), 'cards-dist-'));
const PORT = 4173;
const build = (id) => execSync(`npx vite build --outDir ${out} --emptyOutDir`, { env: { ...process.env, BUILD_ID: id, VITE_USE_EMULATOR: 'true' }, stdio: 'ignore' });
const ok = (c, msg) => { if (!c) throw new Error(`FAIL: ${msg}`); console.log(`ok: ${msg}`); };

build('ver-A');
ok(JSON.parse(readFileSync(join(out, 'version.json'), 'utf8')).id === 'ver-A', 'ビルドすると version.json が出る');
// npx が起こす子プロセスごと止められるよう、独立したプロセスグループで起動する（止め忘れると、次の実行で古いサーバーが残る）
const server = spawn('npx', ['vite', 'preview', '--outDir', out, '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid); } catch { /* すでに止まっている */ } };
process.on('exit', stop);
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/version.json`)).ok) break; } catch { /* 起動待ち */ } await new Promise((r) => setTimeout(r, 200)); }

const browser = await chromium.launch();
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on('dialog', (d) => d.accept());
p.on('pageerror', (e) => console.log('pageerror', e.message));
const base = `http://127.0.0.1:${PORT}/`;

try {
  await p.goto(`${base}?room=nonexistent`);
  await p.waitForSelector('.version');
  ok((await p.locator('.version-id').innerText()) === 'ver-A', '画面に、今のバージョン（ver-A）が出る');

  // 自動確認：開いたときに確認され、最新版だと分かる
  await p.waitForFunction(() => document.querySelector('.version-status')?.textContent.includes('最新版です'));
  ok((await p.locator('#update-banner').count()) === 0, '最新版のときは、知らせの帯は出ない');

  // 新しい版を公開（同じ場所にビルドし直す）
  build('ver-B');

  // ボタンで確認 → 新しい版が見つかる
  await p.click('.version button:has-text("最新版を確認")');
  await p.waitForFunction(() => document.querySelector('.version-status')?.textContent.includes('新しいバージョンがあります'));
  ok((await p.locator('.version-status').innerText()).includes('ver-A → ver-B'), '「ver-A → ver-B」と、新しい版があることが分かる');
  await p.waitForSelector('#update-banner');
  ok((await p.locator('#update-banner').innerText()).includes('新しいバージョンがあります'), '画面の上に、知らせの帯が出る');
  ok(await p.locator('.version button.primary:has-text("更新する")').isVisible(), '確認ボタンが「更新する」になる');

  // 「あとで」で帯は消えるが、パネルの更新ボタンは残る
  await p.click('#update-banner button:has-text("あとで")');
  ok((await p.locator('#update-banner').count()) === 0, '「あとで」で帯が消える');
  ok(await p.locator('.version button.primary:has-text("更新する")').isVisible(), '更新ボタンは残る');

  // 更新する → 読み込み直されて ver-B になり、URL のルームはそのまま、_v は消える
  await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('.version button.primary:has-text("更新する")')]);
  await p.waitForSelector('.version-id');
  await p.waitForFunction(() => document.querySelector('.version-id')?.textContent === 'ver-B');
  ok(true, '更新すると、画面が ver-B になる');
  const url = new URL(p.url());
  ok(url.searchParams.get('room') === 'nonexistent' && !url.searchParams.has('_v'), `URL のルームは残り、更新用の目印 _v は消える（${url.search}）`);
  await p.waitForFunction(() => document.querySelector('.version-status')?.textContent.includes('最新版です'));
  ok((await p.locator('#update-banner').count()) === 0, '更新後は最新版と表示され、帯は出ない');

  // 通信できないときは、確認できなかったと出る
  await p.route('**/version.json*', (r) => r.abort());
  await p.click('.version button:has-text("最新版を確認")');
  await p.waitForFunction(() => document.querySelector('.version-status')?.textContent.includes('確認できませんでした'));
  ok(true, '通信できないときは「確認できませんでした」と出る');
} finally {
  await browser.close();
  stop();
}
