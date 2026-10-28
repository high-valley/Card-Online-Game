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
 * @property {CardId[]} [hand]   操作後の自分の手札（返さない場合は「action.cards を引く」）
 * @property {CardId[]} [deck]   操作後の山札（usesDeck のゲームのみ）
 *
 * @typedef {Object} GameResult
 * @property {boolean} finished
 * @property {string[]} [ranking]  順位順の uid
 * @property {Object<string, number>} [points]  uid -> 得点
 *
 * @typedef {Object} GameModule
 * @property {string} id
 * @property {string} name
 * @property {{mark: string, red: boolean}} [emblem]  トップ画面のゲームの目印（トランプのマーク）
 * @property {number} minPlayers
 * @property {number} maxPlayers
 * @property {{jokers: number}} deck  山札の指定（ジョーカー枚数）
 * @property {boolean} [usesDeck]  true なら、配布後の山札を非公開で保存し、applyAction の ctx.deck に渡す（ジン・ラミーなど）
 * @property {'multi'|'single'} [selection]  手札の選び方（既定は複数選択）
 * @property {{levels: {id: string, label: string}[], opponents?: number, create: (level: string, uid: string, random?: () => number) => {reset(): void, observe(entry: Object, game: Object): void, decide(game: Object, hand: CardId[]): Object}}} [cpu]  CPU対戦に対応するゲームだけ。CPU は自分の手札と公開情報だけで decide する
 * @property {(game: Object) => number} [selectLimit]  同時に選べる手札の枚数の上限（超えたら古い選択から外れる。クリベッジなど）
 * @property {(game: Object, hand: CardId[], card: CardId, uid: string) => boolean} [dimCard]  true のカードは暗く表示して選べない
 * @property {(game: Object, uid: string) => Object|null} [autoAction]  画面操作を待たずに自動で出す操作（あれば）
 * @property {(game: Object, player: Object) => {text: string, out: boolean}} [playerStatus]  他プレイヤー欄の表示
 * @property {(entry: Object, names: Object<string,string>) => string|null} [logText]  ログ1件の文言
 * @property {(props: {result: Object, names: Object<string,string>, uid: string, game: Object}) => HTMLElement} [ResultDetail]  結果画面の追加表示
 * @property {(result: Object) => string} [resultActionLabel]  結果画面のホスト用ボタンの文言（既定は「もう一度」）
 * @property {Object} defaultOptions
 * @property {(players: PlayerInfo[], options: Object, prevResult?: GameResult|null, deck?: CardId[]) => DealResult} deal
 * @property {(game: Object, hand: CardId[], action: Object) => CheckResult} canPlay
 * @property {(game: Object, action: Object, ctx?: {hand: CardId[]|null, deck: CardId[]|null}) => ApplyResult} applyAction  ctx は非公開の手札・山札
 * @property {(game: Object) => GameResult} getResult
 * @property {(hand: CardId[], game: Object) => CardId[]} sortHand  手札の並び順
 * @property {(options: Object) => {title: string, paras?: string[], list?: string[]}[]} [rulebook]  ルールブックの内容（いつでも開ける）。options はそのルームの設定
 * @property {(p: {game: Object, hand: CardId[], uid: string, source: {kind: 'hand'|'pile', id?: string, name?: string, cards?: CardId[]}, target: string}) => ({action: Object}|{error: string}|null)} [dropAction]  ドラッグ＆ドロップで何をするか（引く・捨てる・出す）。null なら何もしない
 * @property {(hand: CardId[], game: Object) => CardId[][]} [handGroups]  自動整列のときに、間をあけて表示するまとまり（役ごとなど）
 * @property {(entry: Object, uid: string) => string|null} [soundFor]  操作ログ1件に鳴らす効果音の名前（省略時は共通の対応）
 * @property {(props: {options: Object, onChange: (patch: Object) => void, readOnly: boolean}) => HTMLElement} [OptionsForm]  待機画面のルール設定フォーム。readOnly のときはホスト以外向けの表示だけ
 * @property {(props: {game: Object, hand: CardId[], uid: string, selected: CardId[], names: Object<string,string>, onAction: (action: Object) => void, busy: boolean}) => HTMLElement} Board  ゲーム画面の中央部分
 */
export {};
