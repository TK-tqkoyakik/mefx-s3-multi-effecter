import { useEffect, useRef, useState } from "react";
import { getDesktopApi, type AnalyzerHealth } from "../lib/desktopApi";
import { describeIrStatus, formatIrSummary } from "../lib/irStatus";
import { createMockToneMatchPreset, isLikelyYoutubeUrl, type ToneMatchResult } from "../lib/toneMatch";
import type { Instrument } from "../lib/types";

type Props = {
  onApplyResult: (result: ToneMatchResult) => void | Promise<void>;
  analyzerHealth: AnalyzerHealth;
  onRefreshAnalyzer: () => void;
  onStartAnalyzer: () => void | Promise<AnalyzerHealth>;
  onStopAnalyzer: () => void;
  onAnalyzeWithServer: (url: string, instrument: Instrument, requestId: string) => Promise<ToneMatchResult>;
  t: (key: string) => string;
};

export function ToneMatch({
  onApplyResult,
  analyzerHealth,
  onRefreshAnalyzer,
  onStartAnalyzer,
  onStopAnalyzer,
  onAnalyzeWithServer,
  t
}: Props) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [instrument, setInstrument] = useState<Instrument>("guitar");
  const [status, setStatus] = useState(t("tone.initialStatus"));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [result, setResult] = useState<ToneMatchResult | null>(null);
  const [stage, setStage] = useState("");
  const [cancelError, setCancelError] = useState("");
  const activeJob = useRef<{ id: string; cancelled: boolean; submitted: boolean } | null>(null);
  const mounted = useRef(true);
  const mockTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(mockTimer.current);
      const job = activeJob.current;
      if (job) { job.cancelled = true; if (job.submitted) void getDesktopApi().analyzer.cancel(job.id).catch(() => undefined); }
    };
  }, []);

  const analyze = () => {
    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl) {
      setStatus(t("tone.urlRequired"));
      setResult(null);
      return;
    }

    if (!isLikelyYoutubeUrl(trimmedUrl)) {
      setStatus(t("tone.invalidUrl"));
      setResult(null);
      return;
    }

    setIsAnalyzing(true);
    setResult(null);
    setStage("");
    setStatus(t("tone.mockRunning"));
    mockTimer.current = window.setTimeout(() => {
      const nextResult = createMockToneMatchPreset(trimmedUrl, instrument);
      setResult(nextResult);
      setStatus(t("tone.mockReady"));
      setIsAnalyzing(false);
    }, 450);
  };

  const analyzeWithServer = async () => {
    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl) {
      setStatus(t("tone.urlRequired"));
      setResult(null);
      return;
    }

    if (!isLikelyYoutubeUrl(trimmedUrl)) {
      setStatus(t("tone.invalidUrl"));
      setResult(null);
      return;
    }

    const job = { id: crypto.randomUUID(), cancelled: false, submitted: false };
    activeJob.current = job;
    let poll: number | undefined;
    let polling = false;
    try {
      setIsAnalyzing(true);
      setResult(null);
      setCancelError("");
      setStage("preparing");
      if (!analyzerHealth.ok) {
        setStatus(t("tone.startingAnalyzer"));
        const health = await onStartAnalyzer();
        if (health && !health.ok) {
          setStatus(health.lastError ?? t("tone.startAnalyzerFailed"));
          setResult(null);
          return;
        }
      }
      if (job.cancelled || !mounted.current) return;
      setStatus(t("tone.serverRunning"));
      poll = window.setInterval(() => {
        if (polling) return;
        polling = true;
        void getDesktopApi().analyzer.progress(job.id).then((progress) => {
          if (!mounted.current || activeJob.current !== job || progress.requestId !== job.id) return;
          setStage(progress.stage);
          if (job.cancelled && !["completed", "cancelled", "failed"].includes(progress.stage)) {
            return getDesktopApi().analyzer.cancel(job.id).then(() => undefined);
          }
        }).catch(() => undefined).finally(() => { polling = false; });
      }, 700);
      job.submitted = true;
      const nextResult = await onAnalyzeWithServer(trimmedUrl, instrument, job.id);
      if (job.cancelled || !mounted.current) return;
      setResult(nextResult);
      setStage("completed");
      setStatus(t("tone.serverReady"));
    } catch (error) {
      if (mounted.current) {
        const message = error instanceof Error ? error.message : "";
        const code = message.match(/\b(CANCELLED|TIMEOUT|DOWNLOAD_FAILED|TOOLS_MISSING|ANALYSIS_FAILED)\b/)?.[1];
        setStatus(job.cancelled ? t("tone.cancelled") : code ? t(`tone.error.${code}`) : message || t("tone.serverFailed"));
        setResult(null);
        setStage(job.cancelled ? "cancelled" : "failed");
      }
    } finally {
      window.clearInterval(poll);
      activeJob.current = null;
      if (mounted.current) {
        setIsAnalyzing(false);
        if (job.cancelled) { setStatus(t("tone.cancelled")); setStage("cancelled"); }
      }
    }
  };

  const cancelAnalysis = async () => {
    const job = activeJob.current;
    if (!job) {
      window.clearTimeout(mockTimer.current);
      setIsAnalyzing(false);
      setStatus(t("tone.cancelled"));
      return;
    }
    job.cancelled = true;
    setStatus(t("tone.cancelling"));
    if (job.submitted) {
      try { await getDesktopApi().analyzer.cancel(job.id); }
      catch { setCancelError(t("tone.cancelFailed")); }
    }
  };

  const applyResult = async () => {
    if (!result) return;
    try {
      setIsApplying(true);
      await onApplyResult(result);
      setStatus(t("tone.appliedWithIr"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("tone.applyFailed"));
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <section className="page-content">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Tone Match</p>
          <h3>{t("tone.title")}</h3>
        </div>
        <span className={analyzerHealth.ok ? "badge good" : "badge warn"}>
          {analyzerHealth.ok ? t("tone.analyzerOnline") : t("tone.analyzerOffline")}
        </span>
      </div>

      <article className="panel analyzer-control-panel">
        <div>
          <h4>{t("tone.localAnalyzer")}</h4>
          <p className="muted">
            {analyzerHealth.ok
              ? `${analyzerHealth.service ?? "Analyzer"} ${analyzerHealth.version ?? ""} ${t("tone.ready")}`
              : analyzerHealth.lastError ?? t("tone.offline")}
          </p>
        </div>
        <div className="button-row">
          <button type="button" onClick={onStartAnalyzer}>
            {t("common.start")}
          </button>
          <button type="button" onClick={onRefreshAnalyzer}>
            {t("common.check")}
          </button>
          <button type="button" onClick={onStopAnalyzer} disabled={isAnalyzing || (!analyzerHealth.running && !analyzerHealth.ok)}>
            {t("common.stop")}
          </button>
        </div>
      </article>

      <article className="panel form-panel tone-match-form">
        <label className="field">
          <span>{t("tone.youtubeUrl")}</span>
          <input
            placeholder="https://www.youtube.com/watch?v=..."
            value={youtubeUrl}
            disabled={isAnalyzing}
            onChange={(event) => setYoutubeUrl(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("tone.targetPart")}</span>
          <select value={instrument} disabled={isAnalyzing} onChange={(event) => setInstrument(event.target.value as Instrument)}>
            <option value="guitar">{t("common.guitar")}</option>
            <option value="bass">{t("common.bass")}</option>
          </select>
        </label>
        <button type="button" onClick={analyzeWithServer} disabled={isAnalyzing}>
          {isAnalyzing ? t("tone.analyzing") : t("tone.analyze")}
        </button>
        {isAnalyzing && <button type="button" onClick={() => void cancelAnalysis()}>{t("tone.cancel")}</button>}
        <p className="muted analysis-status" role="status" aria-live="polite">{isAnalyzing && stage ? `${t(`tone.stage.${stage}`)} · ` : ""}{status}</p>
        {cancelError && <p className="analysis-status" role="alert">{cancelError}</p>}
      </article>

      <details className="panel tone-demo">
        <summary>{t("tone.fallback")}</summary>
        <div className="button-row">
          <button type="button" onClick={analyze} disabled={isAnalyzing}>
            {t("tone.createMock")}
          </button>
        </div>
        <p className="muted">{t("tone.fallbackHelp")}</p>
      </details>

      <article className="panel">
        <div className="section-heading compact">
          <div>
            <h4>{t("tone.estimatedPreset")}</h4>
          </div>
          {result && (
            <button type="button" onClick={applyResult} disabled={isApplying}>
              {isApplying ? t("tone.applying") : t("tone.apply")}
            </button>
          )}
        </div>

        {result ? (
          <div className="tone-result">
            <div className="meta-grid">
              <span>{t("common.name")}</span>
              <strong>{result.preset.name}</strong>
              <span>{t("tone.part")}</span>
              <strong>{result.preset.instrument === "guitar" ? t("common.guitar") : t("common.bass")}</strong>
              <span>{t("common.source")}</span>
              <strong>{result.preset.source}</strong>
              <span>{t("tone.extraction")}</span>
              <strong>{result.extraction?.method === "demucs" ? t(result.extraction.stem === "bass" ? "tone.method.bass" : "tone.method.other") : t(result.extraction?.method === "filter" ? "tone.method.filter" : result.extraction?.method === "mock" ? "tone.method.mock" : "tone.method.unknown")}</strong>
              <span>{t("tone.irCandidate")}</span>
              <strong>{formatIrSummary(result.preset.ir, t)}</strong>
              <span>{t("ir.sourceUrl")}</span>
              <strong>{result.preset.ir?.createdFromUrl ?? t("ir.sourceUrlNone")}</strong>
              <span>{t("ir.wavFile")}</span>
              <strong>{describeIrStatus(result.preset.ir, t).hasWavFile ? t("ir.wavReady") : t("ir.wavPending")}</strong>
              <span>{t("ir.audioFxReady")}</span>
              <strong>{describeIrStatus(result.preset.ir, t).canLoadInAudioFx ? t("common.ready") : t("ir.audioFxPending")}</strong>
            </div>
            {result.extraction?.fallbackReason && <p className="muted">{t("tone.fallbackReason")}: {result.extraction.fallbackReason}</p>}
            <div className="effect-summary">
              {Object.entries(result.preset.effects).map(([key, value]) => (
                <span key={key}>
                  {key}: <strong>{value}</strong>
                </span>
              ))}
            </div>
            <ul className="note-list">
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="empty-state">{t("tone.empty")}</p>
        )}
      </article>
    </section>
  );
}
