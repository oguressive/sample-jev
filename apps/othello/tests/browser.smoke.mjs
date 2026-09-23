// Opt-in browser checks. All Jev traffic is intercepted; this never makes a paid call.
// Requires Playwright; OTHELLO_PLAYWRIGHT can point to a separately installed module.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { legalMoves, positionKey } from "../src/core/rules.ts";
import {
  composite,
  formulaVersion,
  questionVersion,
} from "../src/core/evaluation.ts";
const { chromium } = await import(
  process.env.OTHELLO_PLAYWRIGHT || "playwright"
);
const output = process.env.OTHELLO_SCREENSHOTS || "/tmp/othello-screenshots";
await mkdir(output, { recursive: true });
const require = createRequire(import.meta.url);
const server = process.env.OTHELLO_URL
  ? null
  : spawn(
      process.execPath,
      [
        join(dirname(require.resolve("vite/package.json")), "bin/vite.js"),
        "--host",
        "127.0.0.1",
        "--port",
        "3011",
        "--strictPort",
      ],
      { cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "ignore" },
    );
if (server)
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch("http://127.0.0.1:3011");
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.OTHELLO_CHROMIUM || undefined,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
const page = await context.newPage();
await page.addInitScript(() => {
  window.__othelloSounds = 0;
  const original = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function (...args) {
    window.__othelloSounds++;
    return original.apply(this, args);
  };
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let calls = 0,
  warmups = 0,
  failNext = false,
  holdNext = false,
  release;
await page.route("**/api/health", (route) =>
  route.fulfill({ json: { ready: true } }),
);
await page.route("**/api/warmup", (route) => {
  warmups++;
  return route.fulfill({ json: { state: "warm" } });
});
await page.route("**/api/evaluate", async (route) => {
  calls++;
  const r = route.request().postDataJSON();
  if (holdNext && r.mode === "move") {
    holdNext = false;
    await new Promise((resolve) => {
      release = resolve;
    });
  }
  if (failNext && r.mode === "move") {
    failNext = false;
    return route.fulfill({
      status: 502,
      json: { error: "テスト用の通信失敗。再試行できます。" },
    });
  }
  const evaluations = legalMoves(r.position).map((square, i) => ({
    square,
    p: 0.55 + (i % 3) * 0.1,
    m: 0.6,
    t: 0.5,
    score: composite(r.position, 0.55 + (i % 3) * 0.1, 0.6, 0.5),
    terminal: false,
  }));
  const selected = evaluations.reduce((a, b) =>
    b.score > a.score ? b : a,
  ).square;
  await route
    .fulfill({
      json: {
        key: positionKey(r.position),
        revision: r.revision,
        evaluations,
        selected,
        meta: {
          model: "browser-mock",
          calls: 1,
          tokens: 20,
          elapsedMs: 10,
          formula: formulaVersion,
          questions: questionVersion,
        },
      },
    })
    .catch(() => {});
});
const button = (name) => page.getByRole("button", { name, exact: true });
const until = async (predicate) => {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await page.waitForTimeout(50);
  }
  throw new Error("Timed out waiting for browser assertion");
};
const disks = () => page.locator(".board .disk").count();
const rows = () =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("sample-jev-othello-v1", 1);
        r.onsuccess = () => {
          const q = r.result.transaction("games").objectStore("games").getAll();
          q.onsuccess = () => {
            r.result.close();
            resolve(q.result);
          };
          q.onerror = reject;
        };
        r.onerror = reject;
      }),
  );
try {
  await page.goto(process.env.OTHELLO_URL || "http://127.0.0.1:3011");
  await page.getByRole("heading", { name: "今日の相手を選ぶ" }).waitFor();
  await until(async () => warmups === 1);
  await page.screenshot({ path: `${output}/desktop-home.png`, fullPage: true });
  assert.equal(await page.locator(".difficulty-grid button").count(), 8);
  await page.getByRole("button", { name: /対戦をはじめる/ }).click();
  await page.getByRole("button", { name: "D3 合法手", exact: true }).click();
  await until(async () => (await disks()) === 6);
  await until(async () => (await rows())[0]?.events.length === 2);
  await page.getByRole("checkbox", { name: /評価値を表示/ }).check();
  await until(async () => (await page.locator(".evaluation").count()) > 0);
  await page.screenshot({ path: `${output}/desktop-game.png`, fullPage: true });
  const downloadPromise = page.waitForEvent("download");
  await button("書き出し").click();
  const download = await downloadPromise;
  assert.ok(download.suggestedFilename().endsWith(".json"));
  await button("↶ 待った").click();
  await until(async () => (await disks()) === 4);
  assert.equal((await rows())[0].events.length, 2);
  await page.reload();
  await page.getByRole("button", { name: /続きから/ }).click();
  assert.equal(await disks(), 4);
  // Late CPU result must not apply after undo, even when fetch cancellation races it.
  await page.getByRole("checkbox", { name: /評価値を表示/ }).uncheck();
  holdNext = true;
  await page.getByRole("button", { name: "D3 合法手", exact: true }).click();
  await until(() => Boolean(release));
  await button("↶ 待った").click();
  release();
  release = undefined;
  await page.waitForTimeout(150);
  assert.equal(await disks(), 4);
  failNext = true;
  await page.getByRole("button", { name: "C4 合法手", exact: true }).click();
  await page.getByText("テスト用の通信失敗。再試行できます。").waitFor();
  assert.equal(await disks(), 5);
  await button("再試行する").click();
  await until(async () => (await disks()) === 6);
  await button("投了").click();
  await button("投了する").click();
  await page.getByRole("heading", { name: "Jevの勝ち", exact: true }).waitFor();
  await button("振り返りを分析する").click();
  await page.getByText("全着手の分析が完了しました").waitFor();
  assert.equal(await page.locator(".review-result").count(), 1);
  const beforeReplay = calls;
  await button("棋譜を見る").click();
  assert.equal(await disks(), 4);
  await button("一手進む").click();
  assert.equal(await disks(), 5);
  await page.waitForTimeout(100);
  assert.equal(calls, beforeReplay);
  await page.locator(".timeline").fill("0");
  await page.getByRole("button", { name: /ここから別の手を試す/ }).click();
  await until(async () => (await rows()).length === 2);
  assert.equal(await disks(), 4);
  assert.ok((await rows()).some((g) => g.practice));
  await button("投了").click();
  await button("投了する").click();
  await page.getByRole("heading", { name: "Jevの勝ち", exact: true }).waitFor();
  await button("振り返りを分析する").click();
  await page.getByText("分析できる着手がありません").waitFor();
  await page.getByRole("button", { name: /黒白を交代して再戦/ }).click();
  await until(async () => (await disks()) === 5);
  await page.getByRole("button", { name: /背景・音・動きの設定/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("checkbox", { name: /着手音/ }).check();
  await page
    .getByRole("button", { name: /夜の余韻/ })
    .nth(1)
    .click();
  await page
    .getByRole("button", { name: "設定を閉じる", exact: true })
    .last()
    .click();
  holdNext = true;
  await page.locator(".board .square:not(:disabled)").first().click();
  await until(() => Boolean(release));
  const soundsBeforeMute = await page.evaluate(() => window.__othelloSounds);
  await page.getByRole("button", { name: /背景・音・動きの設定/ }).click();
  await page.getByRole("checkbox", { name: /着手音/ }).uncheck();
  await page
    .getByRole("button", { name: "設定を閉じる", exact: true })
    .last()
    .click();
  release();
  release = undefined;
  await until(async () => (await disks()) === 7);
  const soundsAfterMute = await page.evaluate(() => window.__othelloSounds);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile-game.png`, fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.getByRole("button", { name: "RE:VERSI ホーム" }).click();
  await page.screenshot({ path: `${output}/mobile-home.png`, fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await button("戦績").click();
  assert.equal(await page.locator("tbody tr").count(), 8);
  await page.getByRole("button", { name: /^棋譜/ }).click();
  const countBeforeDelete = (await rows()).length;
  await page
    .getByRole("button", { name: /の棋譜を削除/ })
    .first()
    .click();
  await until(async () => (await rows()).length === countBeforeDelete - 1);
  await button("元に戻す").click();
  await until(async () => (await rows()).length === countBeforeDelete);
  // Keeping the deletion must not let a later unrelated notice revive the record.
  await page
    .getByRole("button", { name: /の棋譜を削除/ })
    .first()
    .click();
  await until(async () => (await rows()).length === countBeforeDelete - 1);
  await page.getByText("棋譜を削除しました。").waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: `${output}/mobile-delete-banner.png`,
    fullPage: true,
  });
  await button("削除したままにする").click();
  assert.equal(await button("元に戻す").count(), 0);
  const redo = (await rows())[0];
  await page.locator("input[type=file]").setInputFiles({
    name: "notice.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(redo)),
  });
  await page.getByText("棋譜を練習記録として読み込みました").waitFor();
  assert.equal(await button("元に戻す").count(), 0);
  await until(async () => (await rows()).length === countBeforeDelete);
  // File import is validated and cannot overwrite an existing game.
  const exported = (await rows())[0];
  await page.locator("input[type=file]").setInputFiles({
    name: "roundtrip.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await until(async () => (await rows()).length === countBeforeDelete + 1);
  assert.equal(warmups, 2, "page load and reload each send one warmup hint");
  const failureContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const failurePage = await failureContext.newPage();
  const quotaErrors = [];
  failurePage.on("pageerror", (error) => quotaErrors.push(error.message));
  await failurePage.addInitScript(() => {
    // Real write failures surface asynchronously: the request errors, then the transaction aborts.
    const put = IDBObjectStore.prototype.put;
    let blocked = true;
    window.__othelloAllowWrites = () => {
      blocked = false;
    };
    IDBObjectStore.prototype.put = function (value, key) {
      return blocked && this.name === "games"
        ? this.add(value, key)
        : put.call(this, value, key);
    };
  });
  await failurePage.route("**/api/health", (route) =>
    route.fulfill({ json: { ready: false } }),
  );
  await failurePage.route("**/api/evaluate", (route) =>
    route.fulfill({ status: 503, json: { error: "Jev未設定です" } }),
  );
  await failurePage.goto(process.env.OTHELLO_URL || "http://127.0.0.1:3011");
  await failurePage.getByRole("button", { name: /対戦をはじめる/ }).click();
  await failurePage.getByText("自動保存済み", { exact: true }).waitFor();
  await failurePage
    .getByRole("button", { name: "D3 合法手", exact: true })
    .click();
  await failurePage.getByText("未保存の棋譜あり").waitFor();
  const rescueDownload = failurePage.waitForEvent("download");
  await failurePage
    .getByRole("button", { name: "棋譜を書き出す", exact: true })
    .click();
  assert.ok((await rescueDownload).suggestedFilename().endsWith(".json"));
  await failurePage.evaluate(() => window.__othelloAllowWrites());
  await failurePage.getByRole("checkbox", { name: /評価値を表示/ }).check();
  await failurePage.getByText("自動保存済み", { exact: true }).waitFor();
  await failurePage.waitForTimeout(100);
  await failureContext.close();
  console.log(
    JSON.stringify({
      reviewRegression: { soundsBeforeMute, soundsAfterMute, quotaErrors },
    }),
  );
  assert.equal(
    soundsAfterMute,
    soundsBeforeMute,
    "muting during inference must silence the pending CPU move",
  );
  assert.deepEqual(
    quotaErrors,
    [],
    "handled save failure must not leak an unhandled queue rejection",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      mockedRequests: calls,
      checks: [
        "desktop/mobile layout",
        "CPU/hints",
        "IndexedDB resume",
        "export/import",
        "undo/late response",
        "retry",
        "replay no calls",
        "branch",
        "resign/rematch",
        "themes",
        "stats",
        "delete/restore",
        "mute during CPU inference",
        "quota failure recovery without unhandled rejection",
      ],
      screenshots: output,
    }),
  );
} finally {
  await browser.close();
  server?.kill();
}
