export type LocalAnalyzerStatus = "checking" | "online" | "offline";

export type LocalAnalyzerHealth = {
  ok: boolean;
  service: string;
  version?: string;
  autoShutdown?: boolean;
  idleTimeoutMs?: number;
};

export const localAnalyzerBaseUrl = "http://127.0.0.1:8787";
export const analysisEndpoint = `${localAnalyzerBaseUrl}/analyze`;
export const localAnalyzerHeartbeatEndpoint = `${localAnalyzerBaseUrl}/heartbeat`;
export const localAnalyzerClientCloseEndpoint = `${localAnalyzerBaseUrl}/client-close`;
export const localAnalyzerDownloadUrl =
  "https://github.com/TK-tqkoyakik/mefx-s3-multi-effecter/archive/refs/heads/master.zip";
export const localAnalyzerGuideUrl =
  "https://github.com/TK-tqkoyakik/mefx-s3-multi-effecter/blob/master/docs/%E3%83%AD%E3%83%BC%E3%82%AB%E3%83%AB%E8%A7%A3%E6%9E%90%E3%83%A9%E3%83%B3%E3%83%81%E3%83%A3%E3%83%BC.md";

export async function checkLocalAnalyzer(timeoutMs = 1800): Promise<LocalAnalyzerHealth> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${localAnalyzerBaseUrl}/health`, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Local analyzer returned ${response.status}`);
    return (await response.json()) as LocalAnalyzerHealth;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function sendLocalAnalyzerHeartbeat() {
  await fetch(localAnalyzerHeartbeatEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client: "mefx-web", at: new Date().toISOString() }),
    keepalive: true
  });
}

export function sendLocalAnalyzerCloseBeacon() {
  const body = JSON.stringify({ client: "mefx-web", at: new Date().toISOString() });
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(localAnalyzerClientCloseEndpoint, blob);
    return;
  }

  void fetch(localAnalyzerClientCloseEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  }).catch(() => undefined);
}
