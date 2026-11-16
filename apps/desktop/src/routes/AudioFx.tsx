import { useEffect, useMemo, useRef, useState } from "react";
import { getDesktopApi } from "../lib/desktopApi";
import type { Preset } from "../lib/types";
import { MeterPlaceholder } from "../ui/MeterPlaceholder";

type Props = {
  preset: Preset;
  enabled: boolean;
  bypass: boolean;
  irBypass: boolean;
  inputDevice: string;
  outputDevice: string;
  latencyMode: "low" | "balanced" | "stable";
  onEnabledChange: (enabled: boolean) => void;
  onBypassChange: (bypass: boolean) => void;
  onIrBypassChange: (bypass: boolean) => void;
  onInputDeviceChange: (device: string) => void;
  onOutputDeviceChange: (device: string) => void;
  onLatencyModeChange: (mode: "low" | "balanced" | "stable") => void;
  t: (key: string) => string;
};

const inputOptions = ["default", "audio-interface", "microphone"];
const outputOptions = ["default", "headphones", "audio-interface"];
const latencyModes = ["low", "balanced", "stable"] as const;

type AudioDeviceOption = {
  id: string;
  label: string;
};

type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

type LatencySnapshot = {
  baseMs: number;
  outputMs: number;
};

function makeDriveCurve(amount: number) {
  const samples = 256;
  const curve = new Float32Array(samples);
  const drive = 1 + amount * 0.45;
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / (samples - 1) - 1;
    curve[index] = Math.tanh(x * drive);
  }
  return curve;
}

function pseudoNoise(index: number, channel: number) {
  const value = Math.sin(index * 12.9898 + channel * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function makeTestImpulseResponse(context: AudioContext, preset: Preset) {
  const lengthMs = Math.max(30, Math.min(1000, preset.ir?.lengthMs || 120));
  const sampleCount = Math.max(1, Math.floor((context.sampleRate * lengthMs) / 1000));
  const buffer = context.createBuffer(2, sampleCount, context.sampleRate);
  const profile = preset.ir?.profile ?? { brightness: 0.45, space: 0.35, saturation: 0.25, dynamics: 0.5 };
  const spectral = {
    low: Math.max(0, Math.min(1, profile.low ?? (preset.instrument === "bass" ? 0.65 : 0.25))),
    lowMid: Math.max(0, Math.min(1, profile.lowMid ?? 0.45)),
    highMid: Math.max(0, Math.min(1, profile.highMid ?? profile.brightness)),
    high: Math.max(0, Math.min(1, profile.high ?? profile.brightness * 0.75))
  };
  const decayPower = preset.instrument === "bass" ? 2.8 - profile.space * 1.1 : 4.2 - profile.space * 1.6;
  const lowTone = preset.instrument === "bass" ? 0.045 + spectral.low * 0.075 : 0.07 + spectral.low * 0.1;
  const bodyTone = preset.instrument === "bass" ? 0.14 + spectral.lowMid * 0.18 : 0.25 + spectral.lowMid * 0.36;
  const biteTone = preset.instrument === "bass" ? 0.55 + spectral.highMid * 0.28 : 0.75 + spectral.highMid * 0.55;
  const noiseAmount = preset.instrument === "bass" ? 0.08 + profile.saturation * 0.16 + spectral.high * 0.08 : 0.12 + profile.saturation * 0.2 + spectral.high * 0.14;
  const lowAmount = preset.instrument === "bass" ? 0.1 + spectral.low * 0.18 : 0.04 + spectral.low * 0.09;
  const bodyAmount = preset.instrument === "bass" ? 0.08 + spectral.lowMid * 0.13 : 0.05 + spectral.lowMid * 0.16;
  const biteAmount = preset.instrument === "bass" ? 0.03 + spectral.highMid * 0.06 : 0.04 + spectral.highMid * 0.14;
  const earlyAmount = 0.75 + profile.dynamics * 0.45;

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < sampleCount; index += 1) {
      const progress = index / sampleCount;
      const decay = Math.pow(1 - progress, decayPower);
      const highDamping = Math.max(0.25, 1 - progress * (1.1 - profile.brightness * 0.65));
      const earlyReflection = index === 0 ? earlyAmount : 0;
      const lowBody = Math.sin(index * lowTone) * decay * lowAmount;
      const cabinetBody = Math.sin(index * bodyTone) * decay * bodyAmount;
      const cabinetBite = Math.sin(index * biteTone) * decay * highDamping * biteAmount;
      const reflectionNoise = pseudoNoise(index, channel) * decay * highDamping * noiseAmount;
      const stereoOffset = channel === 0 ? 1 : 0.92 + profile.space * 0.12;
      data[index] = (earlyReflection + lowBody + cabinetBody + cabinetBite + reflectionNoise) * stereoOffset;
    }
  }

  return buffer;
}

function decodeBase64ToArrayBuffer(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function makeGeneratedIrKey(preset: Preset) {
  const profile = preset.ir?.profile;
  return [
    "generated",
    preset.instrument,
    preset.ir?.lengthMs ?? 120,
    profile?.brightness ?? 0.45,
    profile?.space ?? 0.35,
    profile?.saturation ?? 0.25,
    profile?.dynamics ?? 0.5,
    profile?.low ?? 0,
    profile?.lowMid ?? 0,
    profile?.highMid ?? 0,
    profile?.high ?? 0
  ].join(":");
}

export function AudioFx({
  preset,
  enabled,
  bypass,
  irBypass,
  inputDevice,
  outputDevice,
  latencyMode,
  onEnabledChange,
  onBypassChange,
  onIrBypassChange,
  onInputDeviceChange,
  onOutputDeviceChange,
  onLatencyModeChange,
  t
}: Props) {
  const desktopApi = useMemo(() => getDesktopApi(), []);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [status, setStatus] = useState(t("audio.statusIdle"));
  const [availableInputs, setAvailableInputs] = useState<AudioDeviceOption[]>([]);
  const [availableOutputs, setAvailableOutputs] = useState<AudioDeviceOption[]>([]);
  const [deviceMessage, setDeviceMessage] = useState(t("audio.devicePermissionHint"));
  const [startupHint, setStartupHint] = useState(t("audio.startHint"));
  const [latencySnapshot, setLatencySnapshot] = useState<LatencySnapshot>({ baseMs: 0, outputMs: 0 });
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const monitorElementRef = useRef<SinkAudioElement | null>(null);
  const monitorDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const toneRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const driveRef = useRef<WaveShaperNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const irWetRef = useRef<GainNode | null>(null);
  const irDryRef = useRef<GainNode | null>(null);
  const modulationDelayRef = useRef<DelayNode | null>(null);
  const modulationDepthRef = useRef<GainNode | null>(null);
  const modulationOscRef = useRef<OscillatorNode | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const delayFeedbackRef = useRef<GainNode | null>(null);
  const delayWetRef = useRef<GainNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const irBufferKeyRef = useRef("");

  const loadImpulseResponseBuffer = async (context: AudioContext) => {
    const filePath = preset.ir?.filePath;
    if (!filePath) {
      irBufferKeyRef.current = makeGeneratedIrKey(preset);
      return makeTestImpulseResponse(context, preset);
    }

    const base64 = await desktopApi.storage.readImpulseResponseFile(filePath);
    const decoded = await context.decodeAudioData(decodeBase64ToArrayBuffer(base64));
    irBufferKeyRef.current = `file:${filePath}`;
    return decoded;
  };

  useEffect(() => {
    let cancelled = false;

    async function refreshDevices() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          setDeviceMessage(t("audio.deviceUnsupported"));
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const inputs = devices
          .filter((device) => device.kind === "audioinput")
          .map((device, index) => ({
            id: device.deviceId || "default",
            label: device.label || `${t("audio.inputDevice")} ${index + 1}`
          }));
        const outputs = devices
          .filter((device) => device.kind === "audiooutput")
          .map((device, index) => ({
            id: device.deviceId || "default",
            label: device.label || `${t("audio.outputDevice")} ${index + 1}`
          }));
        setAvailableInputs(inputs);
        setAvailableOutputs(outputs);
        setDeviceMessage(inputs.some((device) => device.label) ? t("audio.deviceReady") : t("audio.devicePermissionHint"));
      } catch (error) {
        setDeviceMessage(error instanceof Error ? error.message : t("audio.deviceFailed"));
      }
    }

    void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
    };
  }, [t]);

  useEffect(() => {
    if (!enabled) {
      setStatus(t("audio.statusIdle"));
      setInputLevel(0);
      setOutputLevel(0);
      return;
    }

    let cancelled = false;
    let frame = 0;

    async function startAudio() {
      try {
        const context = new AudioContext({
          latencyHint: latencyMode === "low" ? "interactive" : latencyMode === "stable" ? "playback" : "balanced"
        });
        setLatencySnapshot({
          baseMs: Math.round((context.baseLatency || 0) * 1000),
          outputMs: Math.round(((context as AudioContext & { outputLatency?: number }).outputLatency || 0) * 1000)
        });
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        };
        if (inputDevice && !inputOptions.includes(inputDevice) && inputDevice !== "default") {
          audioConstraints.deviceId = { exact: inputDevice };
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          void context.close();
          return;
        }

        const source = context.createMediaStreamSource(stream);
        const inputAnalyser = context.createAnalyser();
        const preGain = context.createGain();
        const tone = context.createBiquadFilter();
        const compressor = context.createDynamicsCompressor();
        const drive = context.createWaveShaper();
        const convolver = context.createConvolver();
        const irWet = context.createGain();
        const irDry = context.createGain();
        const modulationDelay = context.createDelay(0.05);
        const modulationDepth = context.createGain();
        const modulationOsc = context.createOscillator();
        const delay = context.createDelay(1.2);
        const delayFeedback = context.createGain();
        const delayWet = context.createGain();
        const dry = context.createGain();
        const outputAnalyser = context.createAnalyser();
        const monitorDestination = context.createMediaStreamDestination();
        const monitorElement = new Audio();
        monitorElement.autoplay = true;
        monitorElement.srcObject = monitorDestination.stream;

        inputAnalyser.fftSize = 512;
        outputAnalyser.fftSize = 512;
        tone.type = "peaking";
        tone.frequency.value = preset.instrument === "bass" ? 180 : 1200;
        tone.Q.value = 0.8;
        compressor.knee.value = 18;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.008;
        compressor.release.value = 0.18;
        drive.oversample = "2x";
        convolver.buffer = await loadImpulseResponseBuffer(context);
        irWet.gain.value = preset.ir?.enabled && !bypass && !irBypass ? (preset.ir.mix ?? 0) / 100 : 0;
        irDry.gain.value = preset.ir?.enabled && !bypass && !irBypass ? 1 - ((preset.ir.mix ?? 0) / 100) * 0.45 : 1;
        modulationDelay.delayTime.value = 0.006;
        modulationDepth.gain.value = 0;
        modulationOsc.frequency.value = 0.8;
        delay.delayTime.value = 0.24;
        delayFeedback.gain.value = 0;
        delayWet.gain.value = 0;
        dry.gain.value = 1;

        source.connect(inputAnalyser);
        inputAnalyser.connect(preGain);
        preGain.connect(tone);
        tone.connect(compressor);
        compressor.connect(drive);
        drive.connect(irDry);
        drive.connect(convolver);
        convolver.connect(irWet);
        irDry.connect(modulationDelay);
        irWet.connect(modulationDelay);
        modulationOsc.connect(modulationDepth);
        modulationDepth.connect(modulationDelay.delayTime);
        modulationOsc.start();
        modulationDelay.connect(dry);
        modulationDelay.connect(delay);
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delay.connect(delayWet);
        dry.connect(outputAnalyser);
        delayWet.connect(outputAnalyser);
        outputAnalyser.connect(monitorDestination);
        if (monitorElement.setSinkId && outputDevice && !outputOptions.includes(outputDevice) && outputDevice !== "default") {
          await monitorElement.setSinkId(outputDevice);
        }
        await monitorElement.play();

        audioContextRef.current = context;
        streamRef.current = stream;
        monitorElementRef.current = monitorElement;
        monitorDestinationRef.current = monitorDestination;
        sourceRef.current = source;
        inputAnalyserRef.current = inputAnalyser;
        outputAnalyserRef.current = outputAnalyser;
        gainRef.current = preGain;
        toneRef.current = tone;
        compressorRef.current = compressor;
        driveRef.current = drive;
        convolverRef.current = convolver;
        irWetRef.current = irWet;
        irDryRef.current = irDry;
        modulationDelayRef.current = modulationDelay;
        modulationDepthRef.current = modulationDepth;
        modulationOscRef.current = modulationOsc;
        delayRef.current = delay;
        delayFeedbackRef.current = delayFeedback;
        delayWetRef.current = delayWet;
        dryRef.current = dry;
        setStatus(inputDevice === "default" && outputDevice === "default" ? t("audio.statusFeedbackRisk") : t("audio.statusRunning"));
        setDeviceMessage(t("audio.deviceReady"));
        setStartupHint(
          inputDevice === "default" && outputDevice === "default"
            ? t("audio.feedbackHint")
            : outputDevice === "default"
              ? t("audio.outputDefaultHint")
              : t("audio.runningHint")
        );

        const inputData = new Uint8Array(new ArrayBuffer(inputAnalyser.frequencyBinCount));
        const outputData = new Uint8Array(new ArrayBuffer(outputAnalyser.frequencyBinCount));
        const readMeter = (analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>) => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const value of data) peak = Math.max(peak, Math.abs(value - 128) / 128);
          return Math.round(Math.min(1, peak) * 100);
        };
        const tick = () => {
          setInputLevel(readMeter(inputAnalyser, inputData));
          setOutputLevel(readMeter(outputAnalyser, outputData));
          frame = window.requestAnimationFrame(tick);
        };
        tick();
      } catch (error) {
        const message = error instanceof Error ? error.message : t("audio.statusFailed");
        setStatus(message);
        setStartupHint(
          message.toLowerCase().includes("permission") || message.toLowerCase().includes("denied")
            ? t("audio.failPermissionHint")
            : message.toLowerCase().includes("device")
              ? t("audio.failDeviceHint")
              : t("audio.failGenericHint")
        );
        onEnabledChange(false);
      }
    }

    void startAudio();

    return () => {
      cancelled = true;
      if (frame) window.cancelAnimationFrame(frame);
      sourceRef.current?.disconnect();
      inputAnalyserRef.current?.disconnect();
      if (monitorElementRef.current) {
        monitorElementRef.current.pause();
        monitorElementRef.current.srcObject = null;
      }
      gainRef.current?.disconnect();
      toneRef.current?.disconnect();
      compressorRef.current?.disconnect();
      driveRef.current?.disconnect();
      convolverRef.current?.disconnect();
      irWetRef.current?.disconnect();
      irDryRef.current?.disconnect();
      try {
        modulationOscRef.current?.stop();
      } catch {
        // Oscillator may already be stopped during rapid monitor toggles.
      }
      modulationOscRef.current?.disconnect();
      modulationDepthRef.current?.disconnect();
      modulationDelayRef.current?.disconnect();
      delayRef.current?.disconnect();
      delayFeedbackRef.current?.disconnect();
      delayWetRef.current?.disconnect();
      dryRef.current?.disconnect();
      outputAnalyserRef.current?.disconnect();
      monitorDestinationRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
      setLatencySnapshot({ baseMs: 0, outputMs: 0 });
      audioContextRef.current = null;
      streamRef.current = null;
      monitorElementRef.current = null;
      monitorDestinationRef.current = null;
      sourceRef.current = null;
      inputAnalyserRef.current = null;
      outputAnalyserRef.current = null;
      gainRef.current = null;
      toneRef.current = null;
      compressorRef.current = null;
      driveRef.current = null;
      convolverRef.current = null;
      irWetRef.current = null;
      irDryRef.current = null;
      modulationDelayRef.current = null;
      modulationDepthRef.current = null;
      modulationOscRef.current = null;
      delayRef.current = null;
      delayFeedbackRef.current = null;
      delayWetRef.current = null;
      dryRef.current = null;
    };
  }, [
    bypass,
    enabled,
    irBypass,
    inputDevice,
    latencyMode,
    onEnabledChange,
    outputDevice,
    preset.instrument,
    preset.ir?.enabled,
    preset.ir?.filePath,
    preset.ir?.lengthMs,
    preset.ir?.mix,
    t
  ]);

  useEffect(() => {
    if (
      !gainRef.current ||
      !audioContextRef.current ||
      !toneRef.current ||
      !compressorRef.current ||
      !driveRef.current ||
      !convolverRef.current ||
      !irWetRef.current ||
      !irDryRef.current ||
      !modulationDepthRef.current ||
      !modulationOscRef.current ||
      !modulationDelayRef.current ||
      !delayRef.current ||
      !delayFeedbackRef.current ||
      !delayWetRef.current ||
      !dryRef.current
    ) {
      return;
    }
    const gainValue = bypass ? 1 : 0.45 + preset.effects.gain / 70;
    gainRef.current.gain.value = gainValue;
    toneRef.current.gain.value = bypass ? 0 : (preset.effects.tone_eq - 50) / 2.5;
    compressorRef.current.threshold.value = bypass ? 0 : -18 - preset.effects.compressor * 0.3;
    compressorRef.current.ratio.value = bypass ? 1 : 1 + preset.effects.compressor / 18;
    driveRef.current.curve = bypass ? makeDriveCurve(0) : makeDriveCurve(preset.effects.drive);
    const nextIrKey = preset.ir?.filePath
      ? `file:${preset.ir.filePath}`
      : makeGeneratedIrKey(preset);
    if (irBufferKeyRef.current !== nextIrKey) {
      void loadImpulseResponseBuffer(audioContextRef.current)
        .then((buffer) => {
          if (convolverRef.current) convolverRef.current.buffer = buffer;
        })
        .catch((error) => {
          setDeviceMessage(error instanceof Error ? error.message : t("audio.irFileFailed"));
          if (convolverRef.current && audioContextRef.current) {
            convolverRef.current.buffer = makeTestImpulseResponse(audioContextRef.current, preset);
            irBufferKeyRef.current = makeGeneratedIrKey(preset);
          }
        });
    }
    const irMix = !bypass && !irBypass && preset.ir?.enabled ? (preset.ir.mix ?? 0) / 100 : 0;
    irWetRef.current.gain.value = irMix;
    irDryRef.current.gain.value = irMix > 0 ? 1 - irMix * 0.45 : 1;
    modulationDepthRef.current.gain.value = bypass ? 0 : preset.effects.modulation / 12000;
    modulationOscRef.current.frequency.value = 0.25 + preset.effects.modulation / 22;
    modulationDelayRef.current.delayTime.value = 0.004 + preset.effects.modulation / 5000;
    delayRef.current.delayTime.value = 0.08 + preset.effects.delay_reverb / 140;
    delayFeedbackRef.current.gain.value = bypass ? 0 : Math.min(0.72, preset.effects.delay_reverb / 150);
    delayWetRef.current.gain.value = bypass ? 0 : preset.effects.delay_reverb / 140;
    dryRef.current.gain.value = bypass ? 1 : Math.max(0.55, 1 - preset.effects.delay_reverb / 220);
  }, [
    bypass,
    irBypass,
    preset.effects.compressor,
    preset.effects.delay_reverb,
    preset.effects.drive,
    preset.effects.gain,
    preset.effects.modulation,
    preset.effects.tone_eq,
    preset.instrument,
    preset.ir?.enabled,
    preset.ir?.filePath,
    preset.ir?.lengthMs,
    preset.ir?.mix,
    preset.ir?.profile?.brightness,
    preset.ir?.profile?.dynamics,
    preset.ir?.profile?.saturation,
    preset.ir?.profile?.space,
    t
  ]);

  return (
    <section className="page-content">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("audio.eyebrow")}</p>
          <h3>{t("audio.title")}</h3>
        </div>
        <span className={enabled ? "badge good" : "badge warn"}>{enabled ? t("audio.monitorOn") : t("audio.monitorOff")}</span>
      </div>

      <div className="audio-fx-grid">
        <article className="panel audio-status-panel">
          <h4>{t("audio.currentPreset")}</h4>
          <p className="large-value">{preset.name || t("dashboard.untitledPreset")}</p>
          <div className="meta-grid">
            <span>{t("manual.instrument")}</span>
            <strong>{preset.instrument === "guitar" ? t("common.guitar") : t("common.bass")}</strong>
            <span>{t("manual.bypass")}</span>
            <strong>{bypass ? t("dashboard.bypassOn") : t("dashboard.bypassOff")}</strong>
            <span>{t("audio.irBypass")}</span>
            <strong>{irBypass ? t("dashboard.bypassOn") : t("dashboard.bypassOff")}</strong>
            <span>{t("audio.latency")}</span>
            <strong>{t(`audio.latency.${latencyMode}`)}</strong>
            <span>{t("audio.latencyEstimate")}</span>
            <strong>
              {latencySnapshot.baseMs || latencySnapshot.outputMs
                ? `${latencySnapshot.baseMs + latencySnapshot.outputMs} ms`
                : t("audio.latencyUnknown")}
            </strong>
            <span>{t("audio.status")}</span>
            <strong>{status}</strong>
          </div>
        </article>

        <article className="panel audio-control-panel">
          <h4>{t("audio.monitor")}</h4>
          <div className="toggle-grid">
            <label className="checkbox-row">
              <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
              {t("audio.enableMonitor")}
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={bypass} onChange={(event) => onBypassChange(event.target.checked)} />
              {t("manual.bypass")}
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={irBypass}
                disabled={!preset.ir?.enabled}
                onChange={(event) => onIrBypassChange(event.target.checked)}
              />
              {t("audio.irBypass")}
            </label>
          </div>
        </article>

        <article className="panel">
          <h4>{t("audio.devices")}</h4>
          <div className="device-grid">
            <label className="field">
              <span>
                {t("audio.inputDevice")} · {availableInputs.length} {t("audio.detected")}
              </span>
              <select value={inputDevice} onChange={(event) => onInputDeviceChange(event.target.value)}>
                <option value="default">{t("audio.device.default")}</option>
                {availableInputs.map((device) => (
                  <option value={device.id} key={device.id}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>
                {t("audio.outputDevice")} · {availableOutputs.length} {t("audio.detected")}
              </span>
              <select value={outputDevice} onChange={(event) => onOutputDeviceChange(event.target.value)}>
                <option value="default">{t("audio.device.default")}</option>
                {availableOutputs.map((device) => (
                  <option value={device.id} key={device.id}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("audio.latency")}</span>
              <select value={latencyMode} onChange={(event) => onLatencyModeChange(event.target.value as "low" | "balanced" | "stable")}>
                {latencyModes.map((mode) => (
                  <option value={mode} key={mode}>
                    {t(`audio.latency.${mode}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted audio-device-note">{deviceMessage}</p>
          <p className={inputDevice === "default" && outputDevice === "default" ? "muted audio-device-note warn-text" : "muted audio-device-note"}>
            {startupHint}
          </p>
        </article>

        <article className="panel">
          <h4>{t("audio.chain")}</h4>
          <div className="fx-chain">
            {Object.entries(preset.effects).map(([key, value]) => (
              <span key={key}>
                {key}: <strong>{value}</strong>
              </span>
            ))}
          </div>
          <div className="ir-summary">
            <strong>{t("audio.irStage")}</strong>
            <span>
              {preset.ir?.enabled
                ? `${preset.ir.name} / ${preset.ir.mix}% / ${irBypass ? t("audio.irBypassed") : preset.ir.filePath ? t("audio.irFileLoaded") : t("audio.irActive")}`
                : t("audio.irDisabled")}
            </span>
          </div>
        </article>
      </div>

      <div className="meter-grid">
        <MeterPlaceholder label={t("dashboard.input")} value={inputLevel} clip={inputLevel > 92} />
        <MeterPlaceholder label={t("audio.processed")} value={bypass ? inputLevel : outputLevel} clip={!bypass && outputLevel > 92} />
        <MeterPlaceholder label={t("audio.output")} value={enabled ? (bypass ? inputLevel : outputLevel) : 0} />
      </div>

      <article className="panel">
        <h4>{t("audio.nextStepTitle")}</h4>
        <p className="muted">{t("audio.nextStepBody")}</p>
      </article>
    </section>
  );
}
