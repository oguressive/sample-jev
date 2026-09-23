export type Color = 1 | -1;
export type Cell = Color | 0;
export type Position = { board: Cell[]; turn: Color };
export const opposite = (color: Color): Color => (color === 1 ? -1 : 1);
export const coordinate = (square: number) =>
  `${"ABCDEFGH"[square % 8]}${Math.floor(square / 8) + 1}`;
export const colorName = (color: Color) => (color === 1 ? "黒" : "白");
export function initial(): Position {
  const board: Cell[] = Array(64).fill(0);
  board[27] = board[36] = -1;
  board[28] = board[35] = 1;
  return { board, turn: 1 };
}
const directions = [-1, 0, 1]
  .flatMap((y) => [-1, 0, 1].map((x) => [y, x]))
  .filter(([y, x]) => y || x);
export function flips(
  position: Position,
  square: number,
  color = position.turn,
): number[] {
  if (
    !Number.isInteger(square) ||
    square < 0 ||
    square > 63 ||
    position.board[square] !== 0
  )
    return [];
  const result: number[] = [];
  for (const [dy, dx] of directions) {
    let row = Math.floor(square / 8) + dy,
      col = (square % 8) + dx;
    const ray: number[] = [];
    while (
      row >= 0 &&
      row < 8 &&
      col >= 0 &&
      col < 8 &&
      position.board[row * 8 + col] === -color
    ) {
      ray.push(row * 8 + col);
      row += dy;
      col += dx;
    }
    if (
      ray.length &&
      row >= 0 &&
      row < 8 &&
      col >= 0 &&
      col < 8 &&
      position.board[row * 8 + col] === color
    )
      result.push(...ray);
  }
  return result;
}
export const legalMoves = (position: Position, color = position.turn) =>
  position.board.flatMap((_, square) =>
    flips(position, square, color).length ? [square] : [],
  );
export function play(position: Position, square: number): Position {
  const captured = flips(position, square);
  if (!captured.length) throw new Error("合法手ではありません");
  const board = [...position.board];
  board[square] = position.turn;
  for (const s of captured) board[s] = position.turn;
  return { board, turn: opposite(position.turn) };
}
export const finished = (p: Position) =>
  !legalMoves(p).length && !legalMoves(p, opposite(p.turn)).length;
export function pass(p: Position): Position {
  if (legalMoves(p).length || finished(p)) throw new Error("パスできません");
  return { board: [...p.board], turn: opposite(p.turn) };
}
export const counts = (p: Position) => ({
  black: p.board.filter((c) => c === 1).length,
  white: p.board.filter((c) => c === -1).length,
  empty: p.board.filter((c) => c === 0).length,
});
export function winner(p: Position): Cell {
  const { black, white } = counts(p);
  return black === white ? 0 : black > white ? 1 : -1;
}
export const positionKey = (p: Position) =>
  `${p.turn}:${p.board.map((c) => (c === -1 ? "W" : c === 1 ? "B" : ".")).join("")}`;
export function parsePosition(value: unknown): Position {
  if (!value || typeof value !== "object") throw new Error("局面が不正です");
  const p = value as Position;
  if (
    (p.turn !== 1 && p.turn !== -1) ||
    !Array.isArray(p.board) ||
    p.board.length !== 64 ||
    p.board.some((c) => c !== 0 && c !== 1 && c !== -1) ||
    p.board.filter(Boolean).length < 4
  )
    throw new Error("局面が不正です");
  return { board: [...p.board], turn: p.turn };
}
