import test from "node:test";
import assert from "node:assert/strict";
import {
  counts,
  finished,
  flips,
  initial,
  legalMoves,
  opposite,
  pass,
  play,
  positionKey,
  type Cell,
  type Position,
} from "../src/core/rules.ts";
import {
  branch,
  importGame,
  move,
  newGame,
  parseGame,
  path,
  resign,
  snapshot,
  undo,
} from "../src/core/game.ts";
import {
  choose,
  composite,
  formulaVersion,
  questionVersion,
  validateAnalysis,
  weights,
  type Analysis,
  type Evaluation,
} from "../src/core/evaluation.ts";
import { RequestGate } from "../src/client.ts";

test("opening legal moves and immutable directional flips", () => {
  const p = initial();
  assert.deepEqual(legalMoves(p), [19, 26, 37, 44]);
  const next = play(p, 19);
  assert.deepEqual(counts(next), { black: 4, white: 1, empty: 59 });
  assert.equal(p.board[19], 0);
  assert.equal(next.turn, -1);
  assert.throws(() => play(p, 27));
  assert.throws(() => play(p, 0));
  assert.throws(() => play(p, NaN));
  assert.throws(() => pass(p));
});
test("all eight rays flip, no wrap across board edges", () => {
  const board: Cell[] = Array(64).fill(0);
  for (const [dy, dx] of [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]) {
    board[(3 + dy) * 8 + 3 + dx] = -1;
    board[(3 + 2 * dy) * 8 + 3 + 2 * dx] = 1;
  }
  assert.equal(flips({ board, turn: 1 }, 27).length, 8);
  const edge: Cell[] = Array(64).fill(0);
  edge[7] = -1;
  edge[8] = 1;
  assert.deepEqual(flips({ board: edge, turn: 1 }, 6), []);
});
test("forced pass and non-full terminal board", () => {
  const board: Cell[] = Array(64).fill(1);
  board[0] = 0;
  board[1] = -1;
  const p: Position = { board, turn: -1 };
  assert.equal(finished(p), false);
  assert.deepEqual(legalMoves(p), []);
  const next = pass(p);
  assert.equal(next.turn, 1);
  assert.deepEqual(legalMoves(next), [0]);
  assert.equal(finished(play(next, 0)), true);
  const sparse: Cell[] = Array(64).fill(0);
  sparse[0] = sparse[1] = sparse[2] = sparse[3] = 1;
  assert.equal(finished({ board: sparse, turn: 1 }), true);
  assert.throws(() => pass({ board: sparse, turn: 1 }));
});
test("undo rewinds human decision but preserves CPU moves and branches", () => {
  let g = newGame(1, "Normal");
  g = move(g, 19);
  g = move(g, legalMoves(snapshot(g).position)[0]);
  const old = g;
  g = undo(g);
  assert.equal(g.active, null);
  assert.equal(g.assisted, true);
  assert.equal(g.events.length, 2);
  g = move(g, 26);
  assert.equal(path(g).length, 1);
  assert.equal(g.events.length, 3);
  assert.equal(snapshot(g, old.active).position.board[19], 1);
  const fork = branch(old, old.events[0].id);
  assert.notEqual(fork.id, old.id);
  assert.equal(fork.practice, true);
  assert.equal(path(fork).length, 1);
  assert.equal(old.events.length, 2);
  assert.deepEqual(parseGame(g), g);
});
test("resign and import validation reject tampering; import cannot replace original", () => {
  let g = newGame(-1, "Goat");
  g = move(g, 19);
  g = resign(g);
  assert.equal(snapshot(g).result, 1);
  assert.equal(snapshot(g).resigned, true);
  assert.throws(() => move(g, 18));
  const imported = importGame(
    JSON.stringify({ ...g, unknownSecretField: "discard-this" }),
  );
  assert.notEqual(imported.id, g.id);
  assert.equal(imported.practice, true);
  assert.ok(!("unknownSecretField" in imported));
  assert.throws(() => parseGame({ ...g, events: [...g.events, g.events[0]] }));
  assert.throws(() => parseGame({ ...g, active: "missing" }));
  assert.throws(() =>
    parseGame({ ...g, events: [{ ...g.events[0], square: 0 }] }),
  );
  assert.throws(() =>
    parseGame({ ...g, events: [{ ...g.events[0], parent: g.events[0].id }] }),
  );
  assert.throws(() => importGame("x".repeat(1_000_001)));
});
test("deterministic test playouts always replay, auto-pass and terminate", () => {
  let sawPass = false;
  for (let seed = 1; seed <= 40; seed++) {
    let g = newGame(seed % 2 ? 1 : -1, "Normal"),
      step = 0,
      rng = seed;
    while (!snapshot(g).over) {
      const p = snapshot(g).position,
        before = counts(p),
        legal = legalMoves(p);
      assert.ok(legal.length);
      rng = (rng * 1664525 + 1013904223) >>> 0;
      g = move(g, legal[rng % legal.length]);
      step++;
      assert.equal(counts(snapshot(g).position).empty, before.empty - 1);
      assert.ok(step <= 60);
    }
    sawPass ||= g.events.some((e) => e.kind === "pass");
    assert.deepEqual(
      snapshot(parseGame(JSON.parse(JSON.stringify(g)))),
      snapshot(g),
    );
    const event = g.events.find((e) => e.kind === "pass");
    if (event) {
      const fork = branch(g, event.parent);
      assert.equal(path(fork).at(-1)?.kind, "pass");
      assert.ok(legalMoves(snapshot(fork).position).length);
    }
  }
  assert.ok(sawPass);
});
test("weighted scale is absolute, bounded, phase-dependent, not best-normalized", () => {
  assert.equal(composite(initial(), 0.5, 0.5, 0.5), 51);
  assert.equal(composite(initial(), 0, 0, 0), 1);
  assert.equal(composite(initial(), 1, 1, 1), 100);
  assert.deepEqual(weights(initial()), [0.6, 0.3, 0.1]);
  assert.deepEqual(
    weights({ board: Array(64).fill(1), turn: 1 }),
    [0.9, 0.05, 0.05],
  );
});
test("Goat selects best Jev score, known wins take priority, weaker settings sample only evaluated moves", () => {
  const e: Evaluation[] = [
    { square: 19, p: 0.4, m: 0.4, t: 0.5, score: 40, terminal: false },
    { square: 26, p: 0.8, m: 0.7, t: 0.6, score: 76, terminal: false },
  ];
  assert.equal(choose(e, "Goat"), 26);
  assert.equal(
    choose(e, "VeryEasy", () => 0),
    19,
  );
  assert.equal(
    choose(e, "VeryEasy", () => 0.999),
    26,
  );
  assert.equal(
    choose(
      [...e, { ...e[0], square: 37, p: 1, terminal: true, score: 100 }],
      "VeryEasy",
      () => 0,
    ),
    37,
  );
  assert.throws(() => choose([], "Normal"));
});
test("runtime analysis validation rejects stale, incomplete, duplicate and nonfinite output", () => {
  const p = initial();
  const a: Analysis = {
    key: positionKey(p),
    revision: 4,
    evaluations: legalMoves(p).map((square) => ({
      square,
      p: 0.5,
      m: 0.5,
      t: 0.5,
      score: 51,
      terminal: false,
    })),
    selected: 19,
    meta: {
      model: "test",
      calls: 1,
      tokens: 1,
      elapsedMs: 10,
      formula: formulaVersion,
      questions: questionVersion,
    },
  };
  assert.deepEqual(validateAnalysis(a, p, 4), a);
  assert.throws(() => validateAnalysis(a, p, 5));
  assert.throws(() =>
    validateAnalysis(
      { ...a, key: positionKey({ ...p, turn: opposite(p.turn) }) },
      p,
      4,
    ),
  );
  assert.throws(() =>
    validateAnalysis({ ...a, evaluations: a.evaluations.slice(1) }, p, 4),
  );
  assert.throws(() =>
    validateAnalysis(
      { ...a, evaluations: a.evaluations.map((e) => ({ ...e, square: 19 })) },
      p,
      4,
    ),
  );
  assert.throws(() =>
    validateAnalysis(
      { ...a, evaluations: a.evaluations.map((e) => ({ ...e, p: NaN })) },
      p,
      4,
    ),
  );
});
test("request generation rejects late responses after undo, new session, navigation and cancellation", () => {
  const gate = new RequestGate();
  const old = gate.begin();
  assert.equal(old.current(), true);
  const next = gate.begin();
  assert.equal(old.current(), false);
  assert.equal(old.signal.aborted, true);
  assert.equal(next.current(), true);
  gate.cancel();
  assert.equal(next.current(), false);
});
