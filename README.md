# オンライントランプ

友達・家族と遊ぶブラウザのトランプゲーム集（第1弾：大富豪）。

## 構成

- `common/` … ルーム・ログイン・手番進行・共通画面（特定のゲームは知らない）
- `games/daifugo/`（大富豪）、`games/gin-rummy/`（ジン・ラミー）、`games/cribbage/`（クリベッジ）… ゲームモジュール（`rules.js` ＋ `Board.js` ＋ テスト）。`games/index.js` に登録するだけで一覧に出る
- `common/types.js` … ゲームモジュールの約束事（JSDoc）
- `firestore.rules` … セキュリティルール（`cards_*` コレクション）

## 開発

```
npm install
npm run emulators      # Auth(9099) / Firestore(8080) のエミュレータ（Java が必要）
npm run dev            # http://127.0.0.1:5173/
npm test               # ルール判定の単体テスト
npm run test:rules     # セキュリティルールのテスト（エミュレータ起動中に実行）
npm run test:e2e       # 3人対戦（大富豪）の通しテスト（途中終了: node tests-e2e/abort-game.mjs、ルール設定: node tests-e2e/options.mjs）（エミュレータと dev サーバー起動中に実行。playwright が必要）
```

開発中は自動でエミュレータに接続する。本番接続は `.env.example` を参考に `VITE_FIREBASE_*` を設定する。

## 公開（GitHub Pages）

画面は GitHub Pages、ログインとデータは Firebase（Spark）で動く。`main` への push で `.github/workflows/pages.yml` が自動デプロイする。

1. Firebase コンソールで本番プロジェクトを用意し、Authentication で「匿名」を有効にし、Firestore を作成する
2. Authentication の設定 → 承認済みドメインに `<ユーザー名>.github.io` を追加する
3. `firestore.rules` を本番に反映する（`npx firebase deploy --only firestore:rules --project <プロジェクトID>`）
4. GitHub の Settings → Secrets and variables → Actions → **Variables** に `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` / `VITE_FIREBASE_PROJECT_ID` / `VITE_FIREBASE_APP_ID` を登録する（Web 用の設定値は公開されても問題ない。守っているのはセキュリティルール）
5. Settings → Pages → Source を **GitHub Actions** にする

## 大富豪

3〜5人。`games/daifugo/`（`rules.js` 役の判定と進行、`cpu.js` CPU）。

トップ画面の大富豪の欄から、強さ（かんたん／ふつう／つよい）を選んで、CPU3人と1人で遊べる（ブラウザの中だけで進む）。
CPU は自分の手札と公開情報（場・残り枚数・革命・しばり）だけで判断する。かんたんはほぼランダム、ふつうは弱い札からまとめて出して強い札を温存し、つよいは革命の損得・上がり間際の相手・出し切るまでの手数も見る。反則上がり（ジョーカー・2・8切りの8で上がる）は、どの難易度でも避けようとする。

```
LEVEL=hard node tests-e2e/daifugo-cpu.mjs   # CPU対戦（easy / normal / hard）を1ゲーム通す
node tools/daifugo-bench.mjs 400            # CPUの強さ比べ（4人卓で1人だけ強さを変えて、平均順位点を表示）
```

## ジン・ラミー

2人対戦。`games/gin-rummy/`（`melds.js` 役とデッドウッド・レイオフの計算、`rules.js` 進行と得点）。
山札は `cards_rooms/{id}/deck/current` に非公開で保存する（山札を使うゲームだけ）。

```
node tests-e2e/gin-rummy.mjs   # 2人で山札切れまで通す
node tests-e2e/gin-knock.mjs   # 決まった手札でノック→手札公開→得点まで通す
node tests-e2e/dnd-gin.mjs     # ドラッグ＆ドロップ（ジン・ラミーのCPU対戦）
node tests-e2e/dnd-daifugo.mjs # ドラッグ＆ドロップ（大富豪・3人）
node tests-e2e/gin-ui.mjs      # 手札のドラッグ並べ替え・自動整列・効果音の切り替え・アニメーション
LEVEL=hard node tests-e2e/gin-cpu.mjs   # CPU対戦（easy / normal / hard）を1ラウンド通す
node tools/cpu-bench.mjs 400   # CPUの強さ比べ（難易度どうしを対戦させて勝率・得点差を表示）
```

### CPU対戦

トップ画面のジン・ラミーの欄から、強さ（かんたん／ふつう／つよい）を選んで1人で始める。Firebase は使わず、ブラウザの中だけで進む（`common/localMatch.js`）。
CPU（`games/gin-rummy/cpu.js`）は、自分の手札と公開情報、相手の公開された行動だけで判断し、山札や人間の手札は参照しない。
別のゲームでも、モジュールに `cpu: { levels, create }` を持たせればCPU対戦の欄が出る（3人以上のゲームは `opponents` でCPUの人数を指定する）。

## クリベッジ

2人対戦・121点先取。`games/cribbage/`（`scoring.js` 手札・クリブ・ペギングの採点、`rules.js` 進行と得点イベント、`cpu.js` CPU）。
マギンズ（採点漏れの指摘）は初期版では対象外で、採点はすべて自動。

- クリブとスターター以外の山札は、非公開の山札欄に `[...クリブ, ...山札]` の順で保存する（`rules.js` 冒頭のコメント参照）。ペギングで出した札は公開情報（`game.peg.played`）に残し、それがそのまま手札採点の4枚になる
- 得点は `game.scoreEvents`（eventId・playerId・type・points・previousScore・newScore）に1件ずつ記録し、121点に届いた時点でそれ以降の加算を止める
- Go は人間は「Go」ボタンで宣言する（出せる札があるときは宣言できない）。CPU は自動で宣言する

```
node tests-e2e/cribbage.mjs      # 2人で1ラウンド（クリブ・ペギング・採点）を通す
LEVEL=hard node tests-e2e/cribbage-cpu.mjs   # CPU対戦（easy / normal / hard）を1ラウンド通す。SHOTS=ディレクトリ で画面を保存
node tools/cribbage-bench.mjs 200            # CPUの強さ比べ
```

CPU は自分の手札・スターター・公開された出札・自分が置いたクリブの札だけで判断する（`games/cribbage/cpu.js`）。
