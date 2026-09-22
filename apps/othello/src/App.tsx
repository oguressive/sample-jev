import { useEffect, useRef, useState } from "react";
import { Board } from "./Board.tsx";
import { evaluate, RequestGate } from "./client.ts";
import {
  formulaVersion,
  questionVersion,
  validateAnalysis,
  type Analysis,
} from "./core/evaluation.ts";
import {
  branch,
  difficulties,
  importGame,
  move,
  newGame,
  path,
  resign,
  resultLabel,
  snapshot,
  touch,
  undo,
  type Difficulty,
  type Game,
} from "./core/game.ts";
import {
  colorName,
  coordinate,
  counts,
  opposite,
  positionKey,
  type Color,
} from "./core/rules.ts";
import {
  deleteGame,
  downloadGame,
  loadAnalysis,
  loadGames,
  loadSettings,
  saveAnalysis,
  saveGame,
  saveSettings,
  type Settings,
  type Theme,
} from "./storage.ts";

type View = "home" | "play" | "records" | "replay" | "stats";
type Review = {
  event: string;
  played: number;
  best: number;
  loss: number;
  index: number;
};
const themes: { id: Theme; title: string; sub: string }[] = [
  { id: "normal", title: "静かな森", sub: "NORMAL" },
  { id: "sports", title: "勝負の熱", sub: "SPORTS" },
  { id: "sensual", title: "夜の余韻", sub: "SENSUAL" },
];
const describeError = (e: unknown) =>
  e instanceof Error ? e.message : "処理に失敗しました";
const date = (n: number) =>
  new Intl.DateTimeFormat("ja", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(n);
const cacheKey = (key: string) => `${formulaVersion}/${questionVersion}/${key}`;

export function App() {
  const [view, setView] = useState<View>("home");
  const [settings, setSettings] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("Normal");
  const [color, setColor] = useState<"black" | "white" | "random">("black");
  const [games, setGames] = useState<Game[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const current = useRef<Game | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState("");
  const [apiError, setApiError] = useState("");
  const [retry, setRetry] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [telemetry, setTelemetry] = useState<Analysis["meta"] | null>(null);
  const gate = useRef(new RequestGate());
  const [replayGame, setReplayGame] = useState<Game | null>(null);
  const [replayStep, setReplayStep] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [deleted, setDeleted] = useState<Game | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewComplete, setReviewComplete] = useState(false);
  const [confirmingResign, setConfirmingResign] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const pending = useRef(0);
  const lastWriteFailed = useRef(false);
  const failedWrites = useRef(new Map<string, number>());
  const state = game ? snapshot(game) : null;
  const history = game ? path(game) : [];
  const replayEvents = replayGame ? path(replayGame) : [];
  const replayState = replayGame
    ? snapshot(
        replayGame,
        replayStep === 0
          ? null
          : (replayEvents[replayStep - 1]?.id ?? replayGame.active),
      )
    : null;
  const theme =
    view === "play" || view === "replay"
      ? settings.gameTheme
      : settings.homeTheme;
  const wantsHints = settings.hints && state?.position.turn === game?.human;

  useEffect(() => {
    let active = true;
    loadGames()
      .then((rows) => {
        if (active) {
          setGames(rows);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) {
          setNotice(describeError(e));
          setStorageError(true);
          setLoaded(true);
        }
      });
    fetch("/api/health")
      .then((r) => r.json())
      .then((r) => {
        if (active) setReady(r.ready === true);
      })
      .catch(() => {
        if (active) setReady(false);
      });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current || lastWriteFailed.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      active = false;
      gate.current.cancel();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  useEffect(() => {
    if (settingsOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [settingsOpen]);
  useEffect(() => {
    if (!autoplay || view !== "replay") return;
    const timer = window.setInterval(
      () =>
        setReplayStep((step) => {
          if (step >= replayEvents.length) {
            setAutoplay(false);
            return step;
          }
          return step + 1;
        }),
      1200 / speed,
    );
    return () => clearInterval(timer);
  }, [autoplay, view, replayEvents.length, speed]);

  function cancel() {
    gate.current.cancel();
    setBusy("");
    setApiError("");
    setAnalysis(null);
  }
  function navigate(next: View) {
    cancel();
    setAutoplay(false);
    setView(next);
    setConfirmingResign(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function persist(g: Game) {
    pending.current++;
    setSaved("保存中…");
    setGames((rows) =>
      [g, ...rows.filter((row) => row.id !== g.id)].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    );
    saveGame(g)
      .then(() => {
        if ((failedWrites.current.get(g.id) ?? -1) <= g.revision)
          failedWrites.current.delete(g.id);
      })
      .catch((e) => {
        failedWrites.current.set(g.id, g.revision);
        setNotice(describeError(e));
      })
      .finally(() => {
        pending.current--;
        lastWriteFailed.current = failedWrites.current.size > 0;
        setStorageError(lastWriteFailed.current);
        setSaved(
          pending.current
            ? "保存中…"
            : lastWriteFailed.current
              ? "未保存の棋譜あり"
              : "自動保存済み",
        );
      });
  }
  function commit(g: Game) {
    cancel();
    current.current = g;
    setGame(g);
    persist(g);
  }
  function updateSettings(update: Partial<Settings>) {
    const next = { ...settings, ...update };
    setSettings(next);
    try {
      saveSettings(next);
    } catch {
      setNotice("設定を保存できません。このタブを閉じると元に戻ります。");
    }
    if (update.hints && current.current && view === "play") {
      // Metadata does not invalidate an in-flight CPU decision for the same board.
      const g = { ...current.current, assisted: true, updatedAt: Date.now() };
      current.current = g;
      setGame(g);
      persist(g);
    }
    if (update.hints === false) {
      setAnalysis(null);
      if (
        current.current &&
        snapshot(current.current).position.turn === current.current.human
      ) {
        gate.current.cancel();
        setBusy("");
      }
    }
  }
  function start(human?: Color, level = difficulty) {
    const selected =
      human ??
      (color === "black"
        ? 1
        : color === "white"
          ? -1
          : Math.random() < 0.5
            ? 1
            : -1);
    const g = newGame(selected, level);
    g.assisted = settings.hints;
    setReview(null);
    setReviewStatus("");
    setReviewComplete(false);
    commit(g);
    navigate("play");
  }
  function resume(g: Game) {
    setReview(null);
    setReviewStatus("");
    setReviewComplete(false);
    const next =
      settings.hints && !g.assisted ? touch({ ...g, assisted: true }) : g;
    commit(next);
    navigate("play");
  }
  function sound() {
    if (!settings.sound) return;
    try {
      const ctx = (audio.current ??= new AudioContext());
      void ctx.resume();
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.frequency.value = 320;
      gain.gain.setValueAtTime(0.055, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.08);
    } catch {
      /* Audio is optional, gameplay is not. */
    }
  }
  function humanMove(square: number) {
    const g = current.current;
    if (!g || snapshot(g).over || snapshot(g).position.turn !== g.human) return;
    try {
      commit(move(g, square));
      sound();
    } catch (e) {
      setNotice(describeError(e));
    }
  }

  useEffect(() => {
    if (view !== "play" || !game || !state || state.over) return;
    const cpu = state.position.turn !== game.human;
    if (!cpu && !settings.hints) return;
    const token = gate.current.begin(),
      expectedId = game.id,
      expectedRevision = game.revision;
    const position = state.position;
    setBusy(cpu ? "Jevが考えています" : "合法手を評価しています");
    setApiError("");
    (async () => {
      let result: Analysis | undefined;
      if (!cpu) {
        try {
          const cached = await loadAnalysis(cacheKey(positionKey(position)));
          if (cached)
            result = validateAnalysis(
              { ...cached, revision: expectedRevision },
              position,
              expectedRevision,
            );
        } catch {
          /* A cache failure does not substitute an engine. */
        }
      }
      if (!token.current()) return;
      result ??= await evaluate(
        position,
        expectedRevision,
        game.difficulty,
        cpu ? "move" : "hint",
        token.signal,
      );
      if (
        !token.current() ||
        current.current?.id !== expectedId ||
        current.current.revision !== expectedRevision
      )
        return;
      setReady(true);
      setTelemetry(result.meta);
      setBusy("");
      if (cpu) {
        commit(move(current.current, result.selected));
        sound();
      } else {
        setAnalysis(result);
        void saveAnalysis(cacheKey(result.key), result).catch(() => {});
      }
    })().catch((e) => {
      if (token.current()) {
        setBusy("");
        setApiError(describeError(e));
      }
    });
    return () => gate.current.cancel();
    // Saving, notices and telemetry must not retrigger paid inference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, game?.revision, view, wantsHints, retry]);

  function replay(g: Game, step = 0) {
    setReplayGame(g);
    setReplayStep(step);
    navigate("replay");
  }
  async function remove(g: Game) {
    try {
      await deleteGame(g.id);
      setGames((rows) => rows.filter((row) => row.id !== g.id));
      setDeleted(g);
      if (current.current?.id === g.id) {
        cancel();
        current.current = null;
        setGame(null);
      }
      setNotice("棋譜を削除しました。下の「削除を取り消す」で戻せます。");
    } catch (e) {
      setNotice(describeError(e));
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("棋譜は1MB以内にしてください");
      const g = importGame(await file.text());
      persist(g);
      setNotice("棋譜を練習記録として読み込みました");
    } catch (e) {
      setNotice(describeError(e));
    }
  }
  async function runReview() {
    if (!game || !state?.over) return;
    const target = game,
      events = path(target),
      turns = events.filter(
        (e) => e.kind === "move" && e.color === target.human,
      );
    const token = gate.current.begin();
    setReview(null);
    setReviewComplete(false);
    setApiError("");
    setBusy("振り返り分析中");
    let worst: Review | null = null;
    try {
      for (let i = 0; i < turns.length; i++) {
        if (!token.current()) return;
        const event = turns[i],
          position = snapshot(target, event.parent).position;
        setReviewStatus(`${i + 1} / ${turns.length} 局面を確認中`);
        let result: Analysis | undefined;
        try {
          const cached = await loadAnalysis(cacheKey(positionKey(position)));
          if (cached)
            result = validateAnalysis(
              { ...cached, revision: target.revision },
              position,
              target.revision,
            );
        } catch {
          /* Re-request only on an explicit review run. */
        }
        if (!token.current()) return;
        result ??= await evaluate(
          position,
          target.revision,
          target.difficulty,
          "review",
          token.signal,
        );
        if (!token.current()) return;
        void saveAnalysis(cacheKey(result.key), result).catch(() => {});
        const played = result.evaluations.find(
            (e) => e.square === event.square,
          )!,
          best = result.evaluations.find((e) => e.square === result!.selected)!;
        const candidate = {
          event: event.id,
          played: played.square,
          best: best.square,
          loss: Math.max(0, best.score - played.score),
          index: events.findIndex((e) => e.id === event.id),
        };
        if (!worst || candidate.loss > worst.loss) worst = candidate;
        setReview(worst);
        setTelemetry(result.meta);
      }
      setReviewComplete(true);
      setReviewStatus(
        turns.length
          ? "全着手の分析が完了しました"
          : "分析できる着手がありません",
      );
      setBusy("");
    } catch (e) {
      if (token.current()) {
        setBusy("");
        setApiError(describeError(e));
        setReviewStatus(
          "途中までの分析です。再実行時は保存済み評価を利用します。",
        );
      }
    }
  }

  const activeGames = games.filter((g) => !snapshot(g).over);
  const completeGames = games.filter((g) => snapshot(g).over);
  const highest = [...difficulties]
    .reverse()
    .find((d) =>
      completeGames.some(
        (g) =>
          g.difficulty === d &&
          !g.assisted &&
          !g.practice &&
          snapshot(g).result === g.human,
      ),
    );
  return (
    <div
      className={`othello theme-${theme} ${settings.reduced ? "reduced-motion" : ""}`}
    >
      <div className="ambience" aria-hidden="true">
        <span />
        <span />
        <svg viewBox="0 0 800 800">
          <circle cx="400" cy="400" r="330" />
          <circle cx="400" cy="400" r="260" />
          <path d="M0 400H800M400 0V800" />
        </svg>
      </div>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label="RE:VERSI ホーム"
        >
          <span className="brand-mark">◐</span> RE:VERSI <small>JEV LAB</small>
        </button>
        <nav aria-label="メイン">
          <button
            className={view === "records" ? "active" : ""}
            onClick={() => navigate("records")}
          >
            棋譜 <span>{games.length}</span>
          </button>
          <button
            className={view === "stats" ? "active" : ""}
            onClick={() => navigate("stats")}
          >
            戦績
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="背景・音・動きの設定"
          >
            設定 <span>⚙</span>
          </button>
        </nav>
      </header>
      <main>
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            {storageError && game && (
              <button onClick={() => downloadGame(game)}>棋譜を書き出す</button>
            )}
            {deleted && (
              <button
                onClick={() => {
                  persist(deleted);
                  setDeleted(null);
                  setNotice("削除を取り消しました");
                }}
              >
                削除を取り消す
              </button>
            )}
            <button aria-label="通知を閉じる" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {view === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">ONE MOVE. A NEW PERSPECTIVE.</p>
                <h1>
                  一手で、
                  <br />
                  景色は変わる。
                </h1>
                <p className="intro">
                  黒と白。そのあいだに、可能性。
                  <br />
                  Jevと向き合う、あなたのためのオセロ。
                </p>
                <div className="hero-tags">
                  <span>8 LEVELS</span>
                  <span>AUTO SAVE</span>
                  <span>JEV ONLY</span>
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="art-orbit" />
                <div className="art-board">
                  {Array.from({ length: 16 }, (_, i) => (
                    <div key={i}>
                      {[5, 6, 9, 10].includes(i) && (
                        <span
                          className={`disk ${i === 5 || i === 10 ? "white" : "black"}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <span className="art-caption">THE NEXT MOVE IS YOURS.</span>
                <span className="floating-disc disk black" />
                <span className="floating-disc second disk white" />
              </div>
            </section>
            <section className="start-panel">
              <div className="setup">
                <div className="section-title">
                  <p className="eyebrow">YOUR CHALLENGE</p>
                  <h2>今日の相手を選ぶ</h2>
                </div>
                <fieldset>
                  <legend>難易度</legend>
                  <div className="difficulty-grid">
                    {difficulties.map((d, i) => (
                      <button
                        key={d}
                        aria-pressed={difficulty === d}
                        onClick={() => setDifficulty(d)}
                      >
                        <small>{String(i + 1).padStart(2, "0")}</small>
                        {d}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <p className="muted fine">
                  Goatは最高評価設定。世界最強は目標であり、棋力・難易度順の実測保証はありません。
                </p>
                <div className="setup-bottom">
                  <fieldset>
                    <legend>あなたの石</legend>
                    <div className="segmented">
                      {(["black", "white", "random"] as const).map((c) => (
                        <button
                          key={c}
                          aria-pressed={color === c}
                          onClick={() => setColor(c)}
                        >
                          {c === "black"
                            ? "● 黒（先手）"
                            : c === "white"
                              ? "○ 白"
                              : "おまかせ"}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={settings.hints}
                      onChange={(e) =>
                        updateSettings({ hints: e.target.checked })
                      }
                    />
                    <span>
                      評価値を表示<small>すべての合法手に 1–100</small>
                    </span>
                  </label>
                </div>
              </div>
              <div className="launch">
                <span className="launch-icon">◑</span>
                <h3>さあ、盤を囲もう。</h3>
                <p>
                  途中で閉じても大丈夫。
                  <br />
                  一手ごとに、この端末へ保存します。
                </p>
                <button
                  className="primary"
                  disabled={!loaded}
                  onClick={() => start()}
                >
                  対戦をはじめる <span>↗</span>
                </button>
                {activeGames[0] && (
                  <button
                    className="secondary"
                    onClick={() => resume(activeGames[0])}
                  >
                    続きから · {activeGames[0].difficulty}
                  </button>
                )}
                <p className={`connection ${ready ? "online" : ""}`}>
                  {ready === null
                    ? "接続を確認中"
                    : ready
                      ? "Jevサーバー設定済み"
                      : "Jev API未接続 / 未設定"}
                </p>
              </div>
            </section>
            <div className="home-notes">
              <p>
                <b>考える楽しさを、そのままに。</b>
                <br />
                待った・棋譜再生・別の手を試す。気になる一手を、何度でも。
              </p>
              <p>
                <b>これはJevの可能性を試す実験です。</b>
                <br />
                評価は未校正の推定。通信には設定したAPIの利用料が発生します。
              </p>
            </div>
          </>
        )}
        {view === "play" && game && state && (
          <section className="game-layout">
            <div className="game-main">
              <div className="game-heading">
                <div>
                  <p className="eyebrow">
                    {game.difficulty.toUpperCase()} ·{" "}
                    {game.practice
                      ? "PRACTICE"
                      : game.assisted
                        ? "ASSISTED"
                        : "CHALLENGE"}
                  </p>
                  <h1>
                    {state.over
                      ? resultLabel(game)
                      : state.position.turn === game.human
                        ? "あなたの一手。"
                        : "Jevの一手。"}
                  </h1>
                </div>
                <span
                  className={`save-status ${storageError ? "error-text" : ""}`}
                >
                  {saved}
                </span>
              </div>
              <div className="scorebar">
                <div
                  className={
                    state.position.turn === 1 && !state.over ? "turn" : ""
                  }
                >
                  <span className="mini-disk black" />
                  <span>
                    {game.human === 1 ? "あなた" : "Jev"}
                    <small>BLACK</small>
                  </span>
                  <strong>{counts(state.position).black}</strong>
                </div>
                <span className="score-vs">vs</span>
                <div
                  className={
                    state.position.turn === -1 && !state.over ? "turn" : ""
                  }
                >
                  <strong>{counts(state.position).white}</strong>
                  <span>
                    {game.human === -1 ? "あなた" : "Jev"}
                    <small>WHITE</small>
                  </span>
                  <span className="mini-disk white" />
                </div>
              </div>
              <Board
                position={state.position}
                last={state.last}
                evaluations={settings.hints ? analysis?.evaluations : undefined}
                onMove={humanMove}
                disabled={state.over || state.position.turn !== game.human}
              />
              <div className="board-legend">
                <span>
                  <i className="legend-dot" />
                  合法手
                </span>
                <span>◉ 最終着手</span>
                {settings.hints && <span>◎ 最善候補</span>}
                <span>残り {counts(state.position).empty} マス</span>
              </div>
              <div className="game-actions">
                <button
                  disabled={
                    !history.some(
                      (e) => e.kind === "move" && e.color === game.human,
                    )
                  }
                  onClick={() => {
                    commit(undo(game));
                    setReview(null);
                    setReviewComplete(false);
                    setReviewStatus("");
                  }}
                >
                  ↶ 待った
                </button>
                <button onClick={() => replay(game)}>棋譜を見る</button>
                <button onClick={() => downloadGame(game)}>書き出し</button>
                {!state.over && (
                  <button onClick={() => setConfirmingResign(true)}>
                    投了
                  </button>
                )}
              </div>
              {confirmingResign && (
                <div className="notice" role="alert">
                  <span>この対局を投了しますか？</span>
                  <button
                    onClick={() => {
                      commit(resign(game));
                      setConfirmingResign(false);
                    }}
                  >
                    投了する
                  </button>
                  <button onClick={() => setConfirmingResign(false)}>
                    戻る
                  </button>
                </div>
              )}
            </div>
            <aside className="game-sidebar">
              <section className="panel">
                <p className="eyebrow">LIVE TABLE</p>
                <h2>
                  {state.over
                    ? "おつかれさまでした。"
                    : busy ||
                      (state.position.turn === game.human
                        ? "合法手をタップ"
                        : "対戦相手の手番")}
                </h2>
                {busy && (
                  <div className="thinking" aria-label="処理中">
                    <i />
                    <i />
                    <i />
                  </div>
                )}
                {history.at(-1)?.kind === "pass" && (
                  <p role="status">
                    {colorName(history.at(-1)!.color)}
                    は合法手がないためパスしました。
                  </p>
                )}
                {apiError && (
                  <div className="api-error" role="alert">
                    <p>{apiError}</p>
                    {!state.over && (
                      <button
                        className="secondary"
                        onClick={() => setRetry((n) => n + 1)}
                      >
                        再試行する
                      </button>
                    )}
                  </div>
                )}
                {!state.over && (
                  <>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={settings.hints}
                        onChange={(e) =>
                          updateSettings({ hints: e.target.checked })
                        }
                      />
                      <span>
                        評価値を表示<small>難易度に依存しない分析設定</small>
                      </span>
                    </label>
                    <p className="fine muted">
                      表示・待ったを使った対局はアシスト戦として集計します。
                    </p>
                  </>
                )}
                {state.over && (
                  <>
                    <p>
                      {state.resigned
                        ? "投了による終局。"
                        : "両者が着手できなくなり終局。"}
                      いい一手を、次の対局へ。
                    </p>
                    <button
                      className="primary"
                      onClick={() =>
                        start(opposite(game.human), game.difficulty)
                      }
                    >
                      黒白を交代して再戦 ↗
                    </button>
                    <button
                      className="secondary"
                      onClick={() => navigate("home")}
                    >
                      難易度を選び直す
                    </button>
                  </>
                )}
              </section>
              {state.over && (
                <section className="panel">
                  <p className="eyebrow">ONE MOVE TO REMEMBER</p>
                  <h2>いちばん惜しかった一手</h2>
                  <p className="fine muted">
                    Jev推定で自分の全着手を比較します。未保存の局面はAPIを呼び出します（最大
                    {
                      history.filter(
                        (e) => e.kind === "move" && e.color === game.human,
                      ).length
                    }
                    局面・1局面最大8リクエスト）。
                  </p>
                  {busy ? (
                    <button
                      onClick={() => {
                        cancel();
                        setReviewStatus("中断しました。表示は途中結果です。");
                      }}
                    >
                      分析を中断
                    </button>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() => void runReview()}
                    >
                      {reviewComplete ? "もう一度確認" : "振り返りを分析する"}
                    </button>
                  )}
                  <p role="status" className="fine">
                    {reviewStatus}
                  </p>
                  {review && (
                    <div className="review-result">
                      <strong>
                        {coordinate(review.played)} <span>→</span>{" "}
                        {coordinate(review.best)}
                      </strong>
                      <p>
                        {review.loss > 0
                          ? `Jev総合評価の差 ${review.loss} ポイント`
                          : "今回の評価では最善候補と同点です"}
                      </p>
                      <small>
                        {reviewComplete
                          ? "全着手の中での推定結果"
                          : "途中結果（確定前）"}
                      </small>
                      <button onClick={() => replay(game, review.index)}>
                        この局面から振り返る →
                      </button>
                    </div>
                  )}
                </section>
              )}
              <section className="panel quiet">
                <p className="eyebrow">HOW JEV SEES IT</p>
                <h3>勝つ力 × 手を稼ぐ力</h3>
                <p className="fine">
                  1–100は勝利見込み・未来の合法手の広さ・パスを含む手番優位の合成。最善候補でも100とは限りません。
                </p>
                <details>
                  <summary>評価の内訳・実験情報</summary>
                  <p className="fine">
                    序盤 60/30/10、中盤 75/15/10、終盤 90/5/5
                    の比率。勝利見込みはJevの未校正推定、手の広さと手番優位は0–100の尺度で、実際の手数ではありません。終局手は確定結果を優先します。
                  </p>
                  {analysis && (
                    <div className="eval-table">
                      {analysis.evaluations.map((e) => (
                        <div key={e.square}>
                          <b>
                            {coordinate(e.square)} · {e.score}
                          </b>
                          <span>
                            勝利 {Math.round(e.p * 100)}% / 広さ{" "}
                            {Math.round(e.m * 100)} / 手番{" "}
                            {Math.round(e.t * 100)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {telemetry && (
                    <p className="fine">
                      直近: {telemetry.model} · {telemetry.elapsedMs}ms ·{" "}
                      {telemetry.calls} calls · {telemetry.tokens} tokens
                      <br />
                      {telemetry.questions} / {telemetry.formula}
                    </p>
                  )}
                  <p className="fine">
                    Goatを含め棋力・速度は未検証。Jev以外の対戦エンジンは使用しません。
                  </p>
                </details>
              </section>
            </aside>
          </section>
        )}
        {view === "play" && !game && (
          <section className="empty">
            <h1>対局をはじめましょう</h1>
            <button className="primary" onClick={() => navigate("home")}>
              ホームへ
            </button>
          </section>
        )}
        {view === "records" && (
          <section className="records">
            <div className="page-heading">
              <div>
                <p className="eyebrow">YOUR ARCHIVE</p>
                <h1>一手ずつ、残っている。</h1>
              </div>
              <button
                className="secondary"
                onClick={() => fileInput.current?.click()}
              >
                棋譜を読み込む
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  void importFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="muted">
              このブラウザー内に保存。端末変更やデータ削除に備えてJSONで書き出せます。読み込んだ棋譜は練習扱いです。
            </p>
            {!loaded ? (
              <p>読み込み中…</p>
            ) : !games.length ? (
              <div className="empty">
                <span>◐</span>
                <h2>最初の一局が、ここに。</h2>
                <button className="primary" onClick={() => navigate("home")}>
                  対戦をはじめる
                </button>
              </div>
            ) : (
              <div className="record-list">
                {games.map((g) => (
                  <article className="record" key={g.id}>
                    <span className="record-symbol">
                      {snapshot(g).over ? "◑" : "◴"}
                    </span>
                    <div className="record-title">
                      <h2>
                        {g.difficulty}{" "}
                        <small>
                          {g.practice
                            ? "練習"
                            : g.assisted
                              ? "アシスト"
                              : "通常"}
                        </small>
                      </h2>
                      <p>
                        {date(g.updatedAt)} · あなたは{colorName(g.human)} ·{" "}
                        {path(g).filter((e) => e.kind === "move").length}手
                      </p>
                    </div>
                    <span className="record-result">{resultLabel(g)}</span>
                    <div className="record-actions">
                      {!snapshot(g).over && (
                        <button onClick={() => resume(g)}>再開</button>
                      )}
                      <button onClick={() => replay(g)}>再生</button>
                      <button onClick={() => downloadGame(g)}>書き出し</button>
                      <button
                        aria-label={`${date(g.updatedAt)}の棋譜を削除`}
                        onClick={() => void remove(g)}
                      >
                        削除
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {view === "replay" && replayGame && replayState && (
          <section className="replay-layout">
            <div>
              <p className="eyebrow">
                REPLAY · {replayGame.difficulty.toUpperCase()}
              </p>
              <h1>あの一手を、もう一度。</h1>
              <Board
                position={replayState.position}
                last={replayState.last}
                disabled
              />
              <div className="replay-controls">
                <button
                  aria-label="最初へ"
                  onClick={() => {
                    setAutoplay(false);
                    setReplayStep(0);
                  }}
                >
                  ⏮
                </button>
                <button
                  aria-label="一手戻る"
                  disabled={replayStep === 0}
                  onClick={() => {
                    setAutoplay(false);
                    setReplayStep((n) => n - 1);
                  }}
                >
                  ←
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    if (replayStep >= replayEvents.length) setReplayStep(0);
                    setAutoplay((v) => !v);
                  }}
                >
                  {autoplay ? "停止" : "再生"}
                </button>
                <button
                  aria-label="一手進む"
                  disabled={replayStep >= replayEvents.length}
                  onClick={() => {
                    setAutoplay(false);
                    setReplayStep((n) => n + 1);
                  }}
                >
                  →
                </button>
                <select
                  aria-label="再生速度"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                </select>
              </div>
              <input
                className="timeline"
                aria-label="棋譜の再生位置"
                type="range"
                min={0}
                max={replayEvents.length}
                value={replayStep}
                onChange={(e) => {
                  setAutoplay(false);
                  setReplayStep(Number(e.target.value));
                }}
              />
              <p className="fine muted">
                {replayStep} / {replayEvents.length} イベント（パスを含む） ·
                再生はAPI利用なし
              </p>
            </div>
            <aside>
              <section className="panel">
                <p className="eyebrow">ANOTHER POSSIBILITY</p>
                <h2>もし、別の手なら。</h2>
                <p>元の棋譜はそのままに、この局面から練習できます。</p>
                <button
                  className="primary"
                  disabled={replayState.over}
                  onClick={() => {
                    const g = branch(
                      replayGame,
                      replayStep ? replayEvents[replayStep - 1].id : null,
                    );
                    resume(g);
                  }}
                >
                  ここから別の手を試す ↗
                </button>
              </section>
              <section className="panel">
                <h3>着手一覧</h3>
                <div className="move-list">
                  <button
                    className={replayStep === 0 ? "selected" : ""}
                    onClick={() => {
                      setAutoplay(false);
                      setReplayStep(0);
                    }}
                  >
                    初期局面
                  </button>
                  {replayEvents.map((e, i) => (
                    <button
                      key={e.id}
                      className={replayStep === i + 1 ? "selected" : ""}
                      onClick={() => {
                        setAutoplay(false);
                        setReplayStep(i + 1);
                      }}
                    >
                      <span>{i + 1}</span>
                      {colorName(e.color)}{" "}
                      {e.kind === "move"
                        ? coordinate(e.square!)
                        : e.kind === "pass"
                          ? "パス"
                          : "投了"}
                    </button>
                  ))}
                </div>
                {replayGame.events.length > replayEvents.length && (
                  <details>
                    <summary>待った前・別分岐の履歴</summary>
                    <p className="fine muted">
                      すべての着手を保持しています。選ぶと、その手までの履歴を表示します。
                    </p>
                    <div className="move-list">
                      {replayGame.events
                        .filter(
                          (e) =>
                            !replayEvents.some((active) => active.id === e.id),
                        )
                        .map((e) => (
                          <button
                            key={e.id}
                            onClick={() => {
                              const alt = { ...replayGame, active: e.id };
                              setReplayGame(alt);
                              setReplayStep(path(alt).length);
                              setAutoplay(false);
                            }}
                          >
                            {colorName(e.color)}{" "}
                            {e.kind === "move"
                              ? coordinate(e.square!)
                              : e.kind === "pass"
                                ? "パス"
                                : "投了"}
                          </button>
                        ))}
                    </div>
                  </details>
                )}
              </section>
            </aside>
          </section>
        )}
        {view === "stats" && (
          <section className="stats">
            <p className="eyebrow">SMALL STEPS, REAL PROGRESS</p>
            <h1>昨日より、ひとつ先へ。</h1>
            <div className="stat-cards">
              <article>
                <small>通常戦・最高撃破難易度</small>
                <strong>{highest ?? "まだこれから"}</strong>
              </article>
              <article>
                <small>終えた対局</small>
                <strong>
                  {completeGames.length}
                  <span>局</span>
                </strong>
              </article>
              <article>
                <small>進行中の対局</small>
                <strong>
                  {activeGames.length}
                  <span>局</span>
                </strong>
              </article>
            </div>
            <div className="table-scroll">
              <table>
                <caption>
                  難易度別成績（勝 / 敗 /
                  引き分け）。練習・補助使用を分けて表示。
                </caption>
                <thead>
                  <tr>
                    <th>難易度</th>
                    <th>通常戦</th>
                    <th>アシスト戦</th>
                    <th>練習</th>
                  </tr>
                </thead>
                <tbody>
                  {difficulties.map((d) => (
                    <tr key={d}>
                      <th>{d}</th>
                      {["normal", "assisted", "practice"].map((group) => {
                        const rows = completeGames.filter(
                          (g) =>
                            g.difficulty === d &&
                            (group === "practice"
                              ? g.practice
                              : group === "assisted"
                                ? g.assisted && !g.practice
                                : !g.assisted && !g.practice),
                        );
                        return (
                          <td key={group}>
                            {
                              rows.filter((g) => snapshot(g).result === g.human)
                                .length
                            }{" "}
                            /{" "}
                            {
                              rows.filter(
                                (g) => snapshot(g).result === -g.human,
                              ).length
                            }{" "}
                            /{" "}
                            {
                              rows.filter((g) => snapshot(g).result === 0)
                                .length
                            }
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="fine muted">
              この端末の棋譜から集計します。棋譜を削除すると成績からも除かれます。競技レーティングではありません。
            </p>
          </section>
        )}
      </main>
      <footer>
        <span>
          RE:VERSI <i>—</i> A JEV EXPERIMENT
        </span>
        <span>一手を楽しむ。結果から学ぶ。</span>
      </footer>
      <dialog
        ref={dialog}
        onCancel={() => setSettingsOpen(false)}
        onClose={() => setSettingsOpen(false)}
        aria-labelledby="settings-title"
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">MAKE IT YOURS</p>
            <h2 id="settings-title">あなたの盤の、空気。</h2>
          </div>
          <button
            aria-label="設定を閉じる"
            onClick={() => setSettingsOpen(false)}
          >
            ×
          </button>
        </div>
        {(["homeTheme", "gameTheme"] as const).map((target) => (
          <fieldset key={target}>
            <legend>
              {target === "homeTheme" ? "TOP画面の背景" : "対戦画面の背景"}
            </legend>
            <div className="theme-options">
              {themes.map((t) => (
                <button
                  key={t.id}
                  className={`theme-option swatch-${t.id}`}
                  aria-pressed={settings[target] === t.id}
                  onClick={() => updateSettings({ [target]: t.id })}
                >
                  <span>◐</span>
                  <b>{t.title}</b>
                  <small>{t.sub}</small>
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="fine muted">
          ノーマル / スポ根系 /
          官能系。官能系は落ち着いた光と色で表現し、キャラクターは使用していません。
        </p>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => updateSettings({ sound: e.target.checked })}
          />
          <span>
            着手音<small>小さな音で、一手を感じる</small>
          </span>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.reduced}
            onChange={(e) => updateSettings({ reduced: e.target.checked })}
          />
          <span>
            動きを減らす<small>背景と石のアニメーションを停止</small>
          </span>
        </label>
        <button className="primary" onClick={() => setSettingsOpen(false)}>
          設定を閉じる
        </button>
      </dialog>
    </div>
  );
}
