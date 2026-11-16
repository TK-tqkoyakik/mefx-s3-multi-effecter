export type DiagnosticState = "ok" | "warn" | "pending" | "fail";

export type DiagnosticItem = {
  label: string;
  detail: string;
  state: DiagnosticState;
  source?: "bundled" | "external" | "configured" | "optional" | "app";
  path?: string;
};

export type AppLogEntry = {
  at: string;
  scope: "storage" | "simulator" | "ui" | "analyzer" | "bluetooth";
  message: string;
};
