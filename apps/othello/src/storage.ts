import { parseGame, type Game } from "./core/game.ts";
import { type Analysis } from "./core/evaluation.ts";

const dbName = "sample-jev-othello-v1";
let opened: Promise<IDBDatabase> | undefined;
function db() {
  return (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("games", { keyPath: "id" });
      request.result.createObjectStore("analysis");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        opened = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      opened = undefined;
      reject(new Error("保存領域を開けません"));
    };
    request.onblocked = () => {
      opened = undefined;
      reject(new Error("別タブを閉じてください"));
    };
  }));
}
async function transaction<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode),
      request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () =>
      reject(new Error("保存できません。棋譜を書き出してください"));
  });
}
// Serialize writes (including deletes), so a slow old transaction cannot undo a new move.
let queue = Promise.resolve();
function write(action: () => Promise<unknown>) {
  const task = queue.catch(() => {}).then(action);
  queue = task.then(() => {});
  return task;
}
export const saveGame = (game: Game) =>
  write(() => transaction("games", "readwrite", (s) => s.put(parseGame(game))));
export const deleteGame = (id: string) =>
  write(() => transaction("games", "readwrite", (s) => s.delete(id)));
export async function loadGames(): Promise<Game[]> {
  const games = await transaction<unknown[]>("games", "readonly", (s) =>
    s.getAll(),
  );
  // Surface corruption; never silently discard someone's history.
  return games.map(parseGame).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const saveAnalysis = (key: string, analysis: Analysis) =>
  write(() =>
    transaction("analysis", "readwrite", (s) => s.put(analysis, key)),
  );
export const loadAnalysis = (key: string) =>
  transaction<Analysis | undefined>("analysis", "readonly", (s) => s.get(key));
export type Theme = "normal" | "sports" | "sensual";
export type Settings = {
  homeTheme: Theme;
  gameTheme: Theme;
  sound: boolean;
  reduced: boolean;
  hints: boolean;
};
export const defaults: Settings = {
  homeTheme: "normal",
  gameTheme: "normal",
  sound: false,
  reduced: false,
  hints: false,
};
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem("othello-settings") || "{}");
    const theme = (v: unknown): Theme =>
      v === "sports" || v === "sensual" ? v : "normal";
    return {
      homeTheme: theme(s.homeTheme),
      gameTheme: theme(s.gameTheme),
      sound: s.sound === true,
      reduced:
        s.reduced === true ||
        matchMedia("(prefers-reduced-motion: reduce)").matches,
      hints: s.hints === true,
    };
  } catch {
    return { ...defaults, reduced: true };
  }
}
export const saveSettings = (s: Settings) =>
  localStorage.setItem("othello-settings", JSON.stringify(s));
export function downloadGame(game: Game) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(parseGame(game), null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `reversi-${game.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
