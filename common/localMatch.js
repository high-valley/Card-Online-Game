/**
 * 人間1人 ＋ CPU（mod.cpu.opponents 人。既定1人）のローカル対戦。Firebase を使わず、ブラウザの中だけで進める。
 * オンライン対戦（engine.js）と同じ「ゲームモジュールの約束事」（deal・canPlay・applyAction・getResult・autoAction）で動くので、
 * ゲーム画面・結果画面・Board をそのまま使える。
 *
 * CPU には、自分の手札と公開情報（game）、相手の公開された行動（observe）だけを渡す。山札や人間の手札は渡さない。
 */
const cpuUid = (i, total) => (total === 1 ? 'cpu' : `cpu${i + 1}`);
const LOG_LIMIT = 20;

/**
 * @param {{mod: import('./types.js').GameModule, level: string, humanUid: string, humanName: string,
 *          onChange: (model: Object) => void, random?: () => number, think?: boolean}} p
 */
export function createLocalMatch({ mod, level, humanUid, humanName, onChange, random = Math.random, think = true }) {
  const levelInfo = mod.cpu.levels.find((l) => l.id === level) ?? mod.cpu.levels[0];
  const total = mod.cpu.opponents ?? 1;
  const cpus = Array.from({ length: total }, (_, i) => {
    const uid = cpuUid(i, total);
    return { uid, impl: mod.cpu.create(levelInfo.id, uid, random), name: total === 1 ? `CPU（${levelInfo.label}）` : `CPU${i + 1}（${levelInfo.label}）` };
  });
  const cpuOf = (uid) => cpus.find((c) => c.uid === uid);
  const players = [
    { uid: humanUid, name: humanName, seat: 0, handCount: 0, totalPoints: {}, lastSeen: null },
    ...cpus.map((c, i) => ({ uid: c.uid, name: c.name, seat: i + 1, handCount: 0, totalPoints: {}, lastSeen: null })),
  ];
  // local: true は、画面が「CPU対戦の設定画面」（招待URLなし）として扱うための目印
  const room = { code: '', local: true, gameId: mod.id, hostUid: humanUid, status: 'waiting', options: mod.defaultOptions, members: players.map((p) => p.uid) };
  let state = null;
  let hands = {};
  let deck = null;
  let timer = null;
  let stopped = false;

  const model = () => ({
    roomId: 'local',
    uid: humanUid,
    room: { ...room },
    players: players.map((p) => ({ ...p, totalPoints: { ...p.totalPoints } })),
    playersLoaded: true,
    state,
    hand: [...(hands[humanUid] ?? [])],
  });
  const emit = () => onChange(model());

  function apply(uid, action) {
    const hand = hands[uid] ?? [];
    const own = uid in hands && action.type !== 'skip';
    const checked = mod.canPlay(state.game, hand, action);
    if (!checked.ok) throw Object.assign(new Error(checked.reason), { code: checked.reason });
    const applied = mod.applyAction(state.game, action, { hand: own ? hand : null, deck });

    const nextHand = applied.hand ?? (action.type === 'play' ? hand.filter((c) => !action.cards.includes(c)) : null);
    if (nextHand) {
      hands = { ...hands, [uid]: nextHand };
      players.find((p) => p.uid === uid).handCount = nextHand.length;
    }
    if (applied.deck) deck = applied.deck;

    const result = mod.getResult(applied.game);
    state = {
      ...state,
      game: applied.game,
      turnUid: applied.turnUid,
      version: state.version + 1,
      log: [...state.log, applied.log].slice(-LOG_LIMIT),
      result: result.finished ? result : null,
    };
    if (result.finished) {
      room.status = 'finished';
      for (const p of players) p.totalPoints[mod.id] = (p.totalPoints[mod.id] ?? 0) + (result.points[p.uid] ?? 0);
    }
    for (const c of cpus) c.impl.observe(applied.log, applied.game);
    emit();
    schedule();
  }

  /** 次にCPUが動く必要があれば、考えている間（演出）をおいて実行する */
  function schedule() {
    clearTimeout(timer);
    if (stopped || room.status !== 'playing') return;
    const game = state.game;
    const autoCpu = cpus.find((c) => mod.autoAction?.(game, c.uid));
    const actor = autoCpu ?? cpuOf(game.turnUid);
    if (!actor) return;
    const auto = autoCpu ? mod.autoAction(game, actor.uid) : null;
    const wait = !think ? 0 : auto ? 300 : 700 + random() * 900;
    timer = setTimeout(() => {
      if (stopped || room.status !== 'playing') return;
      try {
        apply(actor.uid, auto ?? actor.impl.decide(game, hands[actor.uid]));
      } catch (e) {
        console.error('CPU turn failed', e);
      }
    }, wait);
  }

  return {
    model,
    /** 新しいラウンド（または新しいマッチ）を配る。前回の結果があれば引き継ぐ */
    start() {
      const dealt = mod.deal(players.map(({ uid, seat }) => ({ uid, seat })), room.options, state?.result ?? null);
      hands = dealt.hands;
      deck = dealt.deck ?? null;
      for (const p of players) p.handCount = hands[p.uid].length;
      state = {
        gameId: mod.id,
        round: (state?.round ?? 0) + 1,
        turnUid: dealt.turnUid,
        version: (state?.version ?? 0) + 1,
        log: [],
        result: null,
        game: dealt.game,
      };
      room.status = 'playing';
      for (const c of cpus) c.impl.reset();
      emit();
      schedule();
    },
    /** ルールの設定画面を出す（開始前、または結果画面から「ルールを変える」）。進行中のCPUの手は止める */
    openSettings() {
      clearTimeout(timer);
      room.status = 'waiting';
      emit();
    },
    /** ルール設定を、項目ごとに更新する（設定画面でのみ） */
    setOptions(patch) {
      if (room.status !== 'waiting') return;
      room.options = { ...room.options, ...patch };
      emit();
    },
    /** 人間の操作（自動操作を含む）。不正な操作は例外 */
    act(action) {
      if (room.status !== 'playing') throw Object.assign(new Error('ended'), { code: 'ended' });
      apply(humanUid, action);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
