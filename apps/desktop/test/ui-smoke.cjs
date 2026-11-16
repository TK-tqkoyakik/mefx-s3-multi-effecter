const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
app.disableHardwareAcceleration();

(async () => {
  const desktopRoot = path.resolve(__dirname, "..");
  const scratch = process.env.MEFX_UI_TEST_DIRECTORY || await fs.mkdtemp(path.join(os.tmpdir(), "mefx-ui-日本語-"));
  const screenshots = path.resolve(desktopRoot, "../../output/desktop/02_検証画像");
  process.env.MEFX_TEST_USER_DATA = scratch;
  process.env.MEFX_PROJECT_ROOT = path.resolve(desktopRoot, "../..");
  delete process.env.VITE_DEV_SERVER_URL;
  const watchdog = setTimeout(() => { console.error("UI smoke timed out"); app.exit(1); }, 45000);
  try {
    await import(pathToFileURL(path.join(desktopRoot, "dist-electron/main.js")).href);
    await app.whenReady();
    const window = BrowserWindow.getAllWindows()[0];
    if (window.webContents.isLoading()) await new Promise((resolve) => window.webContents.once("did-finish-load", resolve));
    const evaluate = (source) => window.webContents.executeJavaScript(source, true);
    const waitFor = async (source) => {
      for (let attempt = 0; attempt < 80; attempt++) {
        try { if (await evaluate(source)) return; } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`UI condition was not met: ${source}`);
    };
    const click = (label) => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === ${JSON.stringify(label)}); if (!button || button.disabled) throw new Error('Button unavailable'); button.click(); })()`);
    const nav = (label) => evaluate(`(() => { [...document.querySelectorAll('nav button')].find(item => item.querySelector('span').innerText === ${JSON.stringify(label)}).click(); })()`);
    await waitFor("document.querySelectorAll('nav button').length === 7");
    assert.equal(await evaluate("typeof navigator.bluetooth?.requestDevice"), "function");
    console.log("UI: Web Bluetooth API is available in the secured local renderer.");
    await nav("設定");
    await waitFor("document.body.innerText.includes('バックアップと復元')");
    console.log("UI: Settings loaded.");
    const backupPath = path.join(scratch, "試験バックアップ.json");
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: backupPath });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [backupPath] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    const original = { instrument: "guitar", name: "UI復元テスト", effects: { gain: 40, tone_eq: 50, compressor: 25, drive: 10, modulation: 0, delay_reverb: 10 }, bypass: false, createdAt: "2026-10-21T00:00:00Z", source: "manual" };
    await evaluate(`window.mefxDesktop.storage.savePresets([${JSON.stringify(original)}])`);
    await click("バックアップを書き出す");
    await waitFor("document.body.innerText.includes('バックアップを保存しました。')");
    assert.equal(JSON.parse(await fs.readFile(backupPath, "utf8")).presets[0].name, original.name);
    await evaluate(`window.mefxDesktop.storage.savePresets([${JSON.stringify({ ...original, name: "変更後" })}])`);
    const reloaded = new Promise((resolve) => window.webContents.once("did-finish-load", resolve));
    await click("バックアップから復元");
    await reloaded;
    await waitFor("document.body.innerText.includes('バックアップと復元')");
    assert.equal((await evaluate("window.mefxDesktop.storage.loadPresets()"))[0].name, original.name);
    await fs.mkdir(screenshots, { recursive: true });
    await fs.writeFile(path.join(screenshots, "01_バックアップ.png"), (await window.webContents.capturePage()).toPNG());
    console.log("UI: backup export / restore / Japanese paths passed.");

    let mode = "cancel";
    let job;
    const replaceHandler = (name, callback) => { ipcMain.removeHandler(name); ipcMain.handle(name, callback); };
    replaceHandler("analyzer:start", () => ({ ok: true, running: true, service: "UI test fixture" }));
    replaceHandler("analyzer:progress", (_event, requestId) => ({ requestId, stage: job?.stage || "preparing" }));
    replaceHandler("analyzer:analyze", (_event, request) => {
      if (mode === "filter") return { preset: original, notes: [], extraction: { method: "filter", stem: null, fallbackReason: "UI test fixture" } };
      job = { stage: "separating" };
      return new Promise((_resolve, reject) => { job.reject = reject; });
    });
    replaceHandler("analyzer:cancel", () => { if (job) { job.stage = "cancelled"; job.reject(new Error("CANCELLED: Analysis cancelled")); } return { ok: true }; });
    await nav("トーンマッチ");
    await waitFor("Boolean(document.querySelector('input[placeholder*=youtube]'))");
    await evaluate("(() => { const input = document.querySelector('input[placeholder*=youtube]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'https://www.youtube.com/watch?v=demo'); input.dispatchEvent(new Event('input', {bubbles:true})); })()");
    await click("解析");
    await waitFor("document.body.innerText.includes('パートを抽出中')");
    await fs.writeFile(path.join(screenshots, "02_解析進行.png"), (await window.webContents.capturePage()).toPNG());
    await click("解析を中止");
    await waitFor("document.body.innerText.includes('解析を中止しました。') && ![...document.querySelectorAll('button')].some(item => item.innerText === '解析を中止')");
    mode = "filter";
    await click("解析");
    await waitFor("document.body.innerText.includes('簡易フィルター（楽器単独の分離ではありません）')");
    await fs.writeFile(path.join(screenshots, "03_抽出方式.png"), (await window.webContents.capturePage()).toPNG());
    await evaluate("document.querySelector('details.tone-demo').open = true");
    await click("デモ結果を作成");
    await waitFor("document.body.innerText.includes('デモ値（音源未解析）')");
    console.log("UI: analysis stages / cancel / filter / demo labels passed (mocked analyzer).");

    let allowBluetooth;
    let selectedBluetooth;
    dialog.showMessageBox = () => new Promise((resolve) => { allowBluetooth = resolve; });
    window.webContents.emit("select-bluetooth-device", { preventDefault() {} }, [
      { deviceName: "Other", deviceId: "ignore" }, { deviceName: "MEFX-S3", deviceId: "approved-device" }
    ], (id) => { selectedBluetooth = id; });
    assert.equal(selectedBluetooth, undefined);
    allowBluetooth({ response: 1 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(selectedBluetooth, "approved-device");
    console.log("UI: Bluetooth selection requires explicit native-dialog approval (no physical BLE device).");

    replaceHandler("audio-file:select", () => ({ canceled: false, filePath: path.join(scratch, "試験.wav"), name: "試験.wav", sizeBytes: 1024 }));
    let audioReject;
    replaceHandler("audio-file:convert", () => new Promise((resolve) => { audioReject = () => resolve({ ok: false, cancelled: true, inputPath: "fixture", mode: "convert", detail: "cancelled", durationMs: 1 }); }));
    replaceHandler("audio-file:cancel", () => { audioReject(); return { ok: true }; });
    await nav("音声ファイル");
    await click("音声ファイルを選択");
    await waitFor("document.body.innerText.includes('試験.wav')");
    await click("WAVへ変換");
    await waitFor("document.body.innerText.includes('処理を中止')");
    await click("処理を中止");
    await waitFor("document.body.innerText.includes('処理を中止しました。元ファイルは変更していません。')");
    await fs.writeFile(path.join(screenshots, "04_音声ファイル中止.png"), (await window.webContents.capturePage()).toPNG());
    console.log("UI: audio-file cancellation state passed (mocked processing; real ffmpeg tested separately).");
    await evaluate("window.mefxDesktop.storage.saveSettings({language:'en',lastPage:'settings'})");
    const englishReload = new Promise((resolve) => window.webContents.once("did-finish-load", resolve));
    window.webContents.reload(); await englishReload;
    await waitFor("document.body.innerText.includes('Backup and restore')");
    console.log("UI: settings persistence / English restoration passed.");
    await fs.writeFile(path.join(scratch, "irs.json"), "broken");
    await fs.rm(path.join(scratch, "irs.json.bak"), { force: true });
    const damagedReload = new Promise((resolve) => window.webContents.once("did-finish-load", resolve));
    window.webContents.reload(); await damagedReload;
    await waitFor("document.body.innerText.includes('UI復元テスト') && document.body.innerText.includes('irs.json')");
    assert.equal((await evaluate("window.mefxDesktop.storage.loadPresets()"))[0].name, original.name);
    assert.equal(await fs.readFile(path.join(scratch, "irs.json"), "utf8"), "broken");
    console.log("UI: one damaged library cannot hide or overwrite healthy presets.");
    clearTimeout(watchdog);
    app.exit(0);
  } catch (error) {
    console.error(error);
    const failedWindow = BrowserWindow.getAllWindows()[0];
    if (failedWindow) {
      console.error(await failedWindow.webContents.executeJavaScript("document.body.innerText.slice(0, 2400)").catch(() => "Renderer unavailable"));
      await fs.mkdir(screenshots, { recursive: true });
      await fs.writeFile(path.join(screenshots, "00_失敗診断.png"), (await failedWindow.webContents.capturePage()).toPNG()).catch(() => undefined);
    }
    clearTimeout(watchdog);
    app.exit(1);
  }
})().catch((error) => { console.error(error); app.exit(1); });
