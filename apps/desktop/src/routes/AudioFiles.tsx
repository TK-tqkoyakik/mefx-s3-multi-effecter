import { useEffect, useMemo, useRef, useState } from "react";
import { type AudioFileJobResult, type AudioFileSelection, getDesktopApi } from "../lib/desktopApi";
import type { EffectKey, Preset } from "../lib/types";

type Props = {
  preset: Preset;
  t: (key: string) => string;
};

const effectKeys: EffectKey[] = ["gain", "tone_eq", "compressor", "drive", "modulation", "delay_reverb"];

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resultLabel(result: AudioFileJobResult | null, t: Props["t"]) {
  if (!result) return t("audioFiles.noOutput");
  if (result.cancelled) return t("audioFiles.stopped");
  if (!result.ok) return t("audioFiles.failed");
  return result.outputPath ?? t("audioFiles.noOutput");
}

export function AudioFiles({ preset, t }: Props) {
  const desktopApi = useMemo(() => getDesktopApi(), []);
  const [selection, setSelection] = useState<AudioFileSelection | null>(null);
  const [status, setStatus] = useState(t("audioFiles.statusIdle"));
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<AudioFileJobResult | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const requestId = useRef<string | null>(null);
  useEffect(() => () => {
    if (requestId.current) void desktopApi.audioFile.cancel(requestId.current).catch(() => undefined);
  }, [desktopApi]);

  const selectFile = async () => {
    setBusy(true);
    setStatus(t("audioFiles.selecting"));
    try {
      const next = await desktopApi.audioFile.select();
      if (next.canceled) {
        setStatus(t("audioFiles.cancelled"));
        return;
      }
      setSelection(next);
      setLastResult(null);
      setStatus(t("audioFiles.selected"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("audioFiles.selectFailed"));
    } finally {
      setBusy(false);
    }
  };

  const runJob = async (mode: "convert" | "process") => {
    if (!selection?.filePath || requestId.current) return;
    const id = crypto.randomUUID();
    requestId.current = id;
    setBusy(true);
    setLastResult(null);
    setStatus(t(mode === "convert" ? "audioFiles.converting" : "audioFiles.processing"));
    try {
      const request = { inputPath: selection.filePath, requestId: id, preset };
      const result = await desktopApi.audioFile[mode](request);
      setLastResult(result);
      setStatus(result.cancelled ? t("audioFiles.stopped") : result.ok ? t(mode === "convert" ? "audioFiles.converted" : "audioFiles.processed") : result.detail);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("audioFiles.convertFailed"));
    } finally {
      requestId.current = null;
      setCancelling(false);
      setBusy(false);
    }
  };

  const cancel = async () => {
    const id = requestId.current;
    if (!id) return;
    setCancelling(true);
    setStatus(t("audioFiles.stopping"));
    try {
      await desktopApi.audioFile.cancel(id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("audioFiles.failed"));
      setCancelling(false);
    }
  };

  return (
    <section className="route">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("audioFiles.eyebrow")}</p>
          <h2>{t("audioFiles.title")}</h2>
        </div>
        <span className={busy ? "badge warn" : "badge good"}>{busy ? t("audioFiles.working") : t("common.ready")}</span>
      </div>

      <div className="audio-files-grid">
        <article className="panel">
          <h3>{t("audioFiles.source")}</h3>
          <p className="muted">{t("audioFiles.sourceHelp")}</p>
          <button type="button" onClick={selectFile} disabled={busy}>
            {t("audioFiles.choose")}
          </button>
          <div className="file-summary">
            <strong>{selection?.name ?? t("audioFiles.noFile")}</strong>
            <span>{selection?.filePath ?? t("audioFiles.pathPending")}</span>
            {selection?.sizeBytes ? <small>{formatBytes(selection.sizeBytes)}</small> : null}
          </div>
        </article>

        <article className="panel">
          <h3>{t("audioFiles.actions")}</h3>
          <div className="button-row">
            <button type="button" onClick={() => void runJob("convert")} disabled={busy || !selection?.filePath}>
              {t("audioFiles.convert")}
            </button>
            <button type="button" onClick={() => void runJob("process")} disabled={busy || !selection?.filePath}>
              {t("audioFiles.applyPreset")}
            </button>
            {busy && requestId.current ? <button type="button" onClick={() => void cancel()} disabled={cancelling}>{t(cancelling ? "audioFiles.stopping" : "audioFiles.stop")}</button> : null}
          </div>
          <p role="status" aria-live="polite">{status}</p>
          <p className="muted">{t("audioFiles.processHelp")}</p>
        </article>

        <article className="panel">
          <h3>{t("audioFiles.currentPreset")}</h3>
          <div className="fx-chain compact-chain">
            {effectKeys.map((key) => (
              <span key={key}>
                {key.replace("_", " ")} <strong>{preset.effects[key]}</strong>
              </span>
            ))}
          </div>
          <div className="ir-summary">
            <strong>{preset.ir?.enabled ? t("audioFiles.irEnabled") : t("audioFiles.irDisabled")}</strong>
            <span>{t("audioFiles.fileExportScope")}</span>
          </div>
        </article>

        <article className="panel log-panel">
          <h3>{t("audioFiles.result")}</h3>
          <code className="output-path">{resultLabel(lastResult, t)}</code>
        </article>
      </div>
    </section>
  );
}
