/**
 * ゲームモジュールの約束事（仕様書 2章）。
 * 共通基盤はここで定義した形だけを前提にし、特定のゲームの中身は知らない。
 * ルール判定の関数は画面や Firebase に依存しない純粋な関数で書く。
 *
 * カード表記は全ゲーム共通で「スート1文字＋数字」（S/H/D/C ＋ A,2〜10,J,Q,K）。
 * ジョーカーは "JK"（2枚使うゲームは "JK1","JK2"）。
 *
 * @typedef {string} CardId  例: "S3", "H10", "JK"
 *
 * @typedef {Object} PlayerInfo
 * @property {string} uid
 * @property {number} seat  席順（0始まり）
 * @property {string} [name]
 *
 * @typedef {Object} DealResult
 * @property {Object<string, CardId[]>} hands  uid -> 手札
 * @property {Object} game   state/current の game 欄に入れるゲーム固有の公開情報
 * @property {string|null} turnUid  最初の手番
 *
 * @typedef {Object} CheckResult
 * @property {boolean} ok
 * @property {string} [reason]  ok=false のときの理由コード
 *
 * @typedef {Object} ApplyResult
 * @property {Object} game      更新後の game 欄
 * @property {string|null} turnUid  次の手番（終了時は null）
 * @property {Object} log       ログ1件分（UI が整形する）
 *
 * @typedef {Object} GameResult
 * @property {boolean} finished
 * @property {string[]} [ranking]  順位順の uid
 * @property {Object<string, number>} [points]  uid -> 得点
 *
 * @typedef {Object} GameModule
 * @property {string} id
 * @property {string} name
 * @property {number} minPlayers
 * @property {number} maxPlayers
 * @property {{jokers: number}} deck  山札の指定（ジョーカー枚数）
 * @property {Object} defaultOptions
 * @property {(players: PlayerInfo[], options: Object, prevResult?: GameResult|null, deck?: CardId[]) => DealResult} deal
 * @property {(game: Object, hand: CardId[], action: Object) => CheckResult} canPlay
 * @property {(game: Object, action: Object) => ApplyResult} applyAction
 * @property {(game: Object) => GameResult} getResult
 * @property {(hand: CardId[], game: Object) => CardId[]} sortHand  手札の並び順
 * @property {*} [OptionsForm]  待機画面のルール設定フォーム（フェーズ3）
 * @property {(props: {game: Object, hand: CardId[], uid: string, selected: CardId[], names: Object<string,string>, onAction: (action: Object) => void, busy: boolean}) => HTMLElement} Board  ゲーム画面の中央部分
 */
export {};
