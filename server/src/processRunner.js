import path from "node:path";
import { spawn } from "node:child_process";

export function createAnalysisError(code, message, cause) {
  return Object.assign(new Error(message, cause === undefined ? undefined : { cause }), { code });
}

export function throwIfCancelled(signal) {
  if (signal?.aborted) throw createAnalysisError("CANCELLED", "Analysis cancelled");
}

function stopProcessTree(child) {
  if (!child.pid) return Promise.resolve();
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") child.kill("SIGKILL");
    }
    return Promise.resolve();
  }

  // yt-dlp can own ffmpeg children; wait for taskkill as well as the child close.
  return new Promise((resolve) => {
    const taskkill = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    const killer = spawn(taskkill, ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    killer.on("error", () => child.kill("SIGKILL"));
    killer.on("close", (code) => {
      if (code !== 0) child.kill("SIGKILL");
      resolve();
    });
  });
}

export async function runProcess(command, args, options = {}) {
  const { signal, timeoutMs = 180000, ...spawnOptions } = options;
  throwIfCancelled(signal);
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        ...spawnOptions,
        windowsHide: true,
        detached: process.platform !== "win32"
      });
    } catch (error) {
      reject(createAnalysisError("TOOLS_MISSING", `Could not start ${path.basename(command)}`, error));
      return;
    }

    let stdout = "";
    let stderr = "";
    let processError;
    let stopError;
    let stopping;
    const stop = (error) => {
      if (stopError) return;
      stopError = error;
      stopping = stopProcessTree(child);
    };
    const onAbort = () => stop(createAnalysisError("CANCELLED", "Analysis cancelled"));
    const timer = setTimeout(() => {
      stop(createAnalysisError("TIMEOUT", `${path.basename(command)} timed out`));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      processError = createAnalysisError(
        ["ENOENT", "EACCES"].includes(error.code) ? "TOOLS_MISSING" : "ANALYSIS_FAILED",
        `Could not run ${path.basename(command)}: ${error.message}`,
        error
      );
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      await stopping;
      signal?.removeEventListener("abort", onAbort);
      if (stopError || processError) {
        reject(stopError || processError);
      } else if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(createAnalysisError(
          "ANALYSIS_FAILED",
          stderr.trim() || stdout.trim() || `${path.basename(command)} exited with ${code}`
        ));
      }
    });
  });
}
