import type { ImpulseResponseSettings, StoredImpulseResponse } from "./types";

type Translator = (key: string) => string;

export function describeIrStatus(ir: ImpulseResponseSettings | StoredImpulseResponse | undefined, t: Translator) {
  if (!ir?.enabled) {
    return {
      label: t("ir.status.none"),
      detail: t("ir.status.noneDetail"),
      canLoadInAudioFx: false,
      hasWavFile: false
    };
  }

  const hasWavFile = Boolean(ir.filePath);
  const canLoadInAudioFx = hasWavFile || ir.source === "generated";
  return {
    label: hasWavFile ? t("ir.status.wavReady") : t("ir.status.generatedReady"),
    detail: canLoadInAudioFx ? t("ir.status.audioReady") : t("ir.status.audioPending"),
    canLoadInAudioFx,
    hasWavFile
  };
}

export function formatIrSummary(ir: ImpulseResponseSettings | StoredImpulseResponse | undefined, t: Translator) {
  if (!ir?.enabled) return t("manual.irNone");
  const status = describeIrStatus(ir, t);
  return `${ir.name} / ${ir.mix}% / ${ir.lengthMs} ms / ${status.label}`;
}
