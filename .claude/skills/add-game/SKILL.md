---
name: add-game
description: このリポジトリに新しいトランプゲームを追加する手順（ルール・画面・ルールブック・CPU・テスト・README）。「〇〇を追加して」「新しいゲームを作って」のときに使う
---

# 新しいトランプゲームを追加する

最初に `common/types.js`（ゲームモジュールの約束事）を読み、いちばん近い既存ゲームを手本にする。2人用の山札ありは `games/gin-rummy/`・`games/cribbage/`、3〜5人で山札なしは `games/daifugo/`。

## 手順

1. **仕様を決める**: 人数、使う山札（`DECK_SPEC` のジョーカー枚数）、勝敗と得点、手番の進み方、ルール設定（`defaultOptions`）。迷う点は実装前にユーザーへ聞く。1ラウンドで終わるか、複数ラウンドのマッチ（得点を持ち越す）かも決める
2. **`games/<id>/rules.js`**: `deal` / `canPlay` / `applyAction` / `getResult` / `sortHand` を純粋な関数で書く。`canPlay` の不許可は理由コードで返し、`applyAction` は新しい `game` と `turnUid` と `log` を返す。山札を使うゲームは `usesDeck: true`（山札は非公開で保存される）
3. **`rules.test.js`**: ルールの境界（出せる／出せない、終了条件、得点）を先に網羅する
4. **`Board.js`**: ゲーム画面の中央（場・状態表示・操作ボタン）。`canPlay` で出せる／出せないを画面に反映する。手札の選び方は `selection` / `selectLimit` / `dimCard` で調整できる
5. **`rulebook.js`**: いつでも開けるルール説明。見出しと本文を5項目以上。設定のON/OFFは引数の `options` から出す（`games/rulebooks.test.js` が検査する）
6. **`index.js`** でモジュールを組み立て、**`games/index.js`** の `games` に足す
7. **CPU（任意）**: `cpu.js` に `CPU_LEVELS`（かんたん／ふつう／つよい）と `createCpu(level, uid, rng)`（`reset` / `observe` / `decide`）。`index.js` に `cpu: { levels, create }` を持たせる。3人以上のゲームは `opponents`（CPUの人数）を指定する。CPUの禁則: 他人の手札・山札を見ない。出す手は必ず `canPlay` が通るものにする
8. **CPU同士で全部通すテスト**: 毎回有効な手を出して終わること、複数ラウンドを `createLocalMatch` で通せること（`games/daifugo/cpu.test.js` と `localMatch.test.js` が手本）
9. **強さ比べ** `tools/<id>-bench.mjs`: かんたん＜ふつう＜つよいになるまで調整する。悪化した要素は外す
10. **e2e** `tests-e2e/<id>-cpu.mjs`: ブラウザでCPU対戦を1ゲーム通す（`tests-e2e/daifugo-cpu.mjs` が手本。スマホ幅 390px で動かす）
11. **README.md** にそのゲームの節（構成・テスト／ベンチの流し方）を足す

## 仕上げの確認

- `npx vitest run` が全部通る（既存ゲームのテストも）
- e2e を流した（エミュレータ＋ `npx vite`）。終わったら止める
- `git diff` を `game-reviewer` に見せてレビューしてもらう
- コミットは日本語。作業ブランチに push する。PR は頼まれたときだけ
