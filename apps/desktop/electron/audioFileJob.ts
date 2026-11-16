import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { linkSync } from "node:fs";

export type AudioJobState = { requestId: string | null; stage: "idle" | "running" | "cancelling" | "cancelled" | "completed" | "failed" | "timeout" };
export type AudioJobResult = { ok: boolean; cancelled?: boolean; code?: string; detail: string; outputPath?: string; durationMs: number };

export class AudioFileJobs {
  private active?: { requestId: string; stage: AudioJobState["stage"]; cancel: () => void; done: Promise<AudioJobResult> };
  private last: AudioJobState = { requestId: null, stage: "idle" };

  status(requestId: string): AudioJobState {
    return this.active?.requestId === requestId ? { requestId, stage: this.active.stage } :
      this.last.requestId === requestId ? { ...this.last } : { requestId: null, stage: "idle" };
  }

  async cancel(requestId: string) {
    const job = this.active;
    if (!job || job.requestId !== requestId) return { ok: false };
    job.cancel();
    await job.done;
    return { ok: true };
  }

  async stop() {
    if (this.active) await this.cancel(this.active.requestId);
  }

  run(executable: string, args: string[], outputPath: string, requestId: string, timeoutMs = 30 * 60 * 1000): Promise<AudioJobResult> {
    if (!/^[\w-]{8,80}$/.test(requestId)) throw new Error("Invalid audio job ID.");
    if (this.active) throw new Error("音声ファイルを処理中です。完了または中止後に実行してください。");
    const started = Date.now();
    const partial = path.join(path.dirname(outputPath), `.${randomUUID()}.partial.wav`);
    let cancel = () => {};
    const done = (async (): Promise<AudioJobResult> => {
      let reason: "CANCELLED" | "TIMEOUT" | undefined;
      let stderr = "";
      let spawnError: Error | undefined;
      let killPromise: Promise<void> | undefined;
      let child: ReturnType<typeof spawn> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let code: number | null = null;
      const terminate = (nextReason: "CANCELLED" | "TIMEOUT") => {
        if (reason) return;
        reason = nextReason;
        if (this.active?.requestId === requestId) this.active.stage = "cancelling";
        if (child?.pid && child.exitCode === null) {
          if (process.platform === "win32") {
            const killer = spawn(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
            killPromise = new Promise((resolve) => {
              killer.once("error", () => { child?.kill(); resolve(); });
              killer.once("close", () => { if (child?.exitCode === null) child.kill(); resolve(); });
            });
          } else child.kill("SIGKILL");
        }
      };
      cancel = () => terminate("CANCELLED");
      try {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        if (!reason) {
          child = spawn(executable, [...args, partial], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
          child.stderr?.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-12000); });
          timer = setTimeout(() => terminate("TIMEOUT"), timeoutMs);
          code = await new Promise<number | null>((resolve) => {
            child!.once("error", (error) => { spawnError = error; });
            child!.once("close", resolve);
          });
          if (timer) clearTimeout(timer);
          await killPromise;
        }
        if (reason) return { ok: false, cancelled: reason === "CANCELLED", code: reason, detail: reason === "CANCELLED" ? "音声ファイル処理を中止しました。" : "音声ファイル処理が制限時間を超えました。", durationMs: Date.now() - started };
        if (spawnError || code !== 0) throw spawnError || new Error(stderr.trim() || `ffmpeg exited with code ${code}`);
        const stat = await fs.stat(partial);
        if (stat.size < 44) throw new Error("ffmpeg returned an empty WAV file.");
        if (reason) return { ok: false, cancelled: reason === "CANCELLED", code: reason, detail: "音声ファイル処理を中止しました。", durationMs: Date.now() - started };
        // Same-directory hard link publishes the complete file atomically without overwrite.
        linkSync(partial, outputPath);
        return { ok: true, outputPath, detail: `WAV file written: ${outputPath}`, durationMs: Date.now() - started };
      } catch (error) {
        return { ok: false, code: "AUDIO_FILE_FAILED", detail: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started };
      } finally {
        if (timer) clearTimeout(timer);
        await fs.rm(partial, { force: true }).catch(() => undefined);
      }
    })();
    this.active = { requestId, stage: "running", cancel: () => cancel(), done };
    return done.then((result) => {
      this.last = { requestId, stage: result.ok ? "completed" : result.cancelled ? "cancelled" : result.code === "TIMEOUT" ? "timeout" : "failed" };
      this.active = undefined;
      return result;
    });
  }
}
