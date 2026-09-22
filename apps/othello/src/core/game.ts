import {
  colorName,
  finished,
  initial,
  legalMoves,
  opposite,
  pass,
  play,
  winner,
  type Cell,
  type Color,
  type Position,
} from "./rules.ts";

export const difficulties = [
  "VeryEasy",
  "Easy",
  "Normal",
  "Hard",
  "VeryHard",
  "Super",
  "Ultra",
  "Goat",
] as const;
export type Difficulty = (typeof difficulties)[number];
export type GameEvent = {
  id: string;
  parent: string | null;
  kind: "move" | "pass" | "resign";
  color: Color;
  square?: number;
};
export type Game = {
  schema: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  human: Color;
  difficulty: Difficulty;
  events: GameEvent[];
  active: string | null;
  revision: number;
  assisted: boolean;
  practice: boolean;
};
const id = () => crypto.randomUUID();
export function newGame(human: Color, difficulty: Difficulty): Game {
  const now = Date.now();
  return {
    schema: 1,
    id: id(),
    createdAt: now,
    updatedAt: now,
    human,
    difficulty,
    events: [],
    active: null,
    revision: 0,
    assisted: false,
    practice: false,
  };
}
export function path(game: Game, active = game.active): GameEvent[] {
  const map = new Map(game.events.map((e) => [e.id, e]));
  const result: GameEvent[] = [],
    seen = new Set<string>();
  while (active) {
    const event = map.get(active);
    if (!event || seen.has(active)) throw new Error("棋譜の参照が不正です");
    seen.add(active);
    result.push(event);
    active = event.parent;
  }
  return result.reverse();
}
export type Snapshot = {
  position: Position;
  over: boolean;
  result: Cell | null;
  last: number | null;
  resigned: boolean;
};
export function advance(snapshot: Snapshot, event: GameEvent): Snapshot {
  if (snapshot.over) throw new Error("終局後の手です");
  const p = snapshot.position;
  if (event.kind !== "resign" && event.color !== p.turn)
    throw new Error("手番が不正です");
  if (event.kind === "resign")
    return {
      ...snapshot,
      over: true,
      result: opposite(event.color),
      resigned: true,
    };
  const next = event.kind === "pass" ? pass(p) : play(p, event.square!);
  const over = finished(next);
  return {
    position: next,
    over,
    result: over ? winner(next) : null,
    last: event.kind === "move" ? event.square! : snapshot.last,
    resigned: false,
  };
}
export function snapshot(game: Game, active = game.active): Snapshot {
  return path(game, active).reduce(advance, {
    position: initial(),
    over: false,
    result: null,
    last: null,
    resigned: false,
  } as Snapshot);
}
export const touch = (g: Game): Game => ({
  ...g,
  revision: g.revision + 1,
  updatedAt: Date.now(),
});
export function move(game: Game, square: number): Game {
  if (game.events.length > 997)
    throw new Error(
      "履歴の上限です。棋譜を書き出し、この局面から新しい練習を始めてください。",
    );
  const current = snapshot(game);
  const event: GameEvent = {
    id: id(),
    parent: game.active,
    kind: "move",
    color: current.position.turn,
    square,
  };
  const next = advance(current, event);
  let g = { ...game, events: [...game.events, event], active: event.id };
  if (!next.over && !legalMoves(next.position).length) {
    const skip: GameEvent = {
      id: id(),
      parent: event.id,
      kind: "pass",
      color: next.position.turn,
    };
    g = { ...g, events: [...g.events, skip], active: skip.id };
  }
  return touch(g);
}
export function resign(game: Game): Game {
  if (snapshot(game).over) return game;
  const event: GameEvent = {
    id: id(),
    parent: game.active,
    kind: "resign",
    color: game.human,
  };
  return touch({ ...game, events: [...game.events, event], active: event.id });
}
export function undo(game: Game): Game {
  const lastHuman = path(game)
    .filter((e) => e.kind === "move" && e.color === game.human)
    .at(-1);
  if (!lastHuman) return game;
  return touch({ ...game, active: lastHuman.parent, assisted: true });
}
export function branch(game: Game, active: string | null): Game {
  const events = path(game, active);
  const next = {
    ...newGame(game.human, game.difficulty),
    events,
    active,
    practice: true,
    assisted: true,
  };
  // A replay may stop on a mandatory pass; make it explicit before resuming.
  const state = snapshot(next);
  if (!state.over && !legalMoves(state.position).length) {
    const event: GameEvent = {
      id: id(),
      parent: active,
      kind: "pass",
      color: state.position.turn,
    };
    next.events = [...events, event];
    next.active = event.id;
  }
  return next;
}
export function resultLabel(g: Game) {
  const s = snapshot(g);
  return !s.over
    ? `${colorName(s.position.turn)}の手番`
    : s.result === 0
      ? "引き分け"
      : s.result === g.human
        ? "あなたの勝ち"
        : "Jevの勝ち";
}
const validId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(v);
export function parseGame(input: unknown): Game {
  if (!input || typeof input !== "object")
    throw new Error("棋譜形式が不正です");
  const g = input as Game;
  if (
    g.schema !== 1 ||
    !validId(g.id) ||
    !difficulties.includes(g.difficulty) ||
    (g.human !== 1 && g.human !== -1) ||
    !Array.isArray(g.events) ||
    g.events.length > 1000 ||
    !Number.isSafeInteger(g.revision) ||
    g.revision < 0 ||
    ![g.createdAt, g.updatedAt].every(
      (n) => Number.isSafeInteger(n) && n > 0 && n < 8_640_000_000_000_000,
    ) ||
    typeof g.assisted !== "boolean" ||
    typeof g.practice !== "boolean"
  )
    throw new Error("棋譜形式が不正です");
  const states = new Map<string | null, Snapshot>([
    [
      null,
      {
        position: initial(),
        over: false,
        result: null,
        last: null,
        resigned: false,
      },
    ],
  ]);
  const events: GameEvent[] = [];
  for (const e of g.events) {
    if (
      !e ||
      !validId(e.id) ||
      states.has(e.id) ||
      !states.has(e.parent) ||
      !["move", "pass", "resign"].includes(e.kind) ||
      (e.color !== 1 && e.color !== -1) ||
      (e.kind === "resign" && e.color !== g.human) ||
      (e.kind === "move" && !Number.isInteger(e.square))
    )
      throw new Error("不正な手・分岐です");
    const clean: GameEvent = {
      id: e.id,
      parent: e.parent,
      kind: e.kind,
      color: e.color,
      ...(e.kind === "move" ? { square: e.square } : {}),
    };
    states.set(e.id, advance(states.get(e.parent)!, clean));
    events.push(clean);
  }
  if (!states.has(g.active)) throw new Error("再開地点が不正です");
  const current = states.get(g.active)!;
  if (!current.over && !legalMoves(current.position).length)
    throw new Error("パス記録が欠けています");
  return {
    schema: 1,
    id: g.id,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    human: g.human,
    difficulty: g.difficulty,
    events,
    active: g.active,
    revision: g.revision,
    assisted: g.assisted,
    practice: g.practice,
  };
}
export function importGame(text: string): Game {
  if (text.length > 1_000_000) throw new Error("棋譜は1MB以内にしてください");
  // Import as an independent practice copy: it cannot overwrite or inflate ranked results.
  const g = parseGame(JSON.parse(text));
  return { ...g, id: id(), updatedAt: Date.now(), practice: true };
}
