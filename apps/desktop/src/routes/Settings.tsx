import type { AppLogEntry, DiagnosticItem } from "../lib/diagnostics";
import type { Language } from "../lib/i18n";
import { useEffect, useState } from "react";
import { getDesktopApi } from "../lib/desktopApi";

type Props = {
  diagnostics: DiagnosticItem[];
  logs: AppLogEntry[];
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: (key: string) => string;
};

export function Settings({ diagnostics, logs, language, onLanguageChange, t }: Props) {
  const okCount = diagnostics.filter((item) => item.state === "ok").length;
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [notices, setNotices] = useState<{ file: string; message: string }[]>([]);
  useEffect(() => { void getDesktopApi().storage.notices().then(setNotices).catch(() => undefined); }, []);

  const manageBackup = async (mode: "export" | "import") => {
    setBackupBusy(true);
    setBackupMessage("");
    try {
      const storage = getDesktopApi().storage;
      const result = await (mode === "export" ? storage.exportBackup() : storage.importBackup());
      if (result.canceled) return;
      if (mode === "import") window.location.reload();
      else setBackupMessage(t("settings.backupSaved"));
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : t("settings.backupFailed"));
    } finally { setBackupBusy(false); }
  };

  return (
    <section className="page-content">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Settings</p>
          <h3>{t("settings.title")}</h3>
        </div>
        <span className="badge">
          {okCount}/{diagnostics.length} OK
        </span>
      </div>

      <div className="settings-grid">
        <article className="panel">
          <h4>{t("settings.backup")}</h4>
          <p className="muted">{t("settings.backupHelp")}</p>
          <div className="button-row">
            <button type="button" disabled={backupBusy} onClick={() => void manageBackup("export")}>{t("settings.exportBackup")}</button>
            <button type="button" disabled={backupBusy} onClick={() => void manageBackup("import")}>{t("settings.importBackup")}</button>
          </div>
          <p role="status" aria-live="polite">{backupBusy ? t("settings.backupBusy") : backupMessage}</p>
          {notices.map((notice) => <p className="muted" key={`${notice.file}:${notice.message}`}>{notice.file}: {notice.message}</p>)}
        </article>
        <article className="panel">
          <h4>{t("settings.basic")}</h4>
          <label className="field">
            <span>{t("settings.language")}</span>
            <select value={language} onChange={(event) => onLanguageChange(event.target.value as Language)}>
              <option value="ja">{t("settings.japanese")}</option>
              <option value="en">{t("settings.english")}</option>
            </select>
          </label>
          <p className="muted">{t("settings.languageHelp")}</p>
        </article>

        <article className="panel">
          <h4>{t("settings.checklist")}</h4>
          <ul className="check-list diagnostic-list">
            {diagnostics.map((item) => (
              <li key={item.label}>
                <span className={`check ${item.state}`} />
                <div>
                  <strong>
                    {item.label} <small>{t(`settings.state.${item.state}`)}</small>
                    {item.source ? <small>{t(`settings.source.${item.source}`)}</small> : null}
                  </strong>
                  <p>{item.detail}</p>
                  {item.path ? <code className="diagnostic-path">{item.path}</code> : null}
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel log-panel">
          <h4>{t("settings.logs")}</h4>
          {logs.length === 0 ? (
            <p className="empty-state">{t("settings.noLogs")}</p>
          ) : (
            <pre>
              {logs
                .map((entry) => `[${new Date(entry.at).toLocaleTimeString()}] ${entry.scope}: ${entry.message}`)
                .join("\n")}
            </pre>
          )}
        </article>
      </div>
    </section>
  );
}
