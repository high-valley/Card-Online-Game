# オンライントランプ

友達・家族と遊ぶブラウザのトランプゲーム集（第1弾：大富豪）。

## 構成

- `common/` … ルーム・ログイン・手番進行・共通画面（特定のゲームは知らない）
- `games/<ゲーム名>/` … ゲームモジュール（`rules.js` ＋ `Board.js` ＋ テスト）。`games/index.js` に登録するだけで一覧に出る
- `common/types.js` … ゲームモジュールの約束事（JSDoc）
- `firestore.rules` … セキュリティルール（`cards_*` コレクション）

## 開発

```
npm install
npm run emulators      # Auth(9099) / Firestore(8080) のエミュレータ（Java が必要）
npm run dev            # http://127.0.0.1:5173/
npm test               # ルール判定の単体テスト
npm run test:rules     # セキュリティルールのテスト（エミュレータ起動中に実行）
npm run test:e2e       # 3人対戦の通しテスト（エミュレータと dev サーバー起動中に実行。playwright が必要）
```

開発中は自動でエミュレータに接続する。本番接続は `.env.example` を参考に `VITE_FIREBASE_*` を設定する。
