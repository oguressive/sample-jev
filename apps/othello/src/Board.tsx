import type { Evaluation } from "./core/evaluation.ts";
import {
  colorName,
  coordinate,
  legalMoves,
  type Position,
} from "./core/rules.ts";

export function Board({
  position,
  last,
  evaluations = [],
  onMove,
  disabled = false,
}: {
  position: Position;
  last: number | null;
  evaluations?: Evaluation[];
  onMove?: (square: number) => void;
  disabled?: boolean;
}) {
  const legal = legalMoves(position),
    best = Math.max(...evaluations.map((e) => e.score));
  return (
    <div className="board-frame">
      <div className="board-coordinates" aria-hidden="true">
        {"ABCDEFGH".split("").map((letter) => (
          <span key={letter}>{letter}</span>
        ))}
      </div>
      <div className="board-body">
        <div className="board-rows" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <div className="board" role="group" aria-label="オセロ盤。A1からH8">
          {position.board.map((cell, square) => {
            const valid = legal.includes(square),
              value = evaluations.find((e) => e.square === square);
            return (
              <button
                key={square}
                className={`square ${last === square ? "last" : ""} ${value?.score === best ? "best" : ""}`}
                disabled={disabled || !valid || !onMove}
                onClick={() => onMove?.(square)}
                aria-label={`${coordinate(square)} ${cell ? colorName(cell) : valid ? "合法手" : "空き"}${last === square ? " 最終着手" : ""}${value ? ` 評価${value.score}${value.score === best ? " 最善候補" : ""}` : ""}`}
                title={
                  value
                    ? `Jev推定: 勝利${Math.round(value.p * 100)}% / 手の広さ${Math.round(value.m * 100)} / 手番優位${Math.round(value.t * 100)}`
                    : coordinate(square)
                }
              >
                {cell ? (
                  <span
                    key={`${square}-${cell}`}
                    className={`disk ${cell === 1 ? "black" : "white"}`}
                  >
                    {last === square && <i />}
                  </span>
                ) : value ? (
                  <span className="evaluation">{value.score}</span>
                ) : (
                  valid && <span className="legal-dot" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
