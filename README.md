# オンライントランプ

友達・家族と遊ぶブラウザのトランプゲーム集（第1弾：大富豪）。

## 構成

- `common/` … ルーム・ログイン・手番進行・共通画面（特定のゲームは知らない）
- `games/daifugo/`（大富豪）、`games/gin-rummy/`（ジン・ラミー）… ゲームモジュール（`rules.js` ＋ `Board.js` ＋ テスト）。`games/index.js` に登録するだけで一覧に出る
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
別のゲームでも、モジュールに `cpu: { levels, create }` を持たせればCPU対戦の欄が出る。
