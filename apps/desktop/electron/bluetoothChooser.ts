type Candidate = { deviceId: string; deviceName: string };
type Prompt = (devices: Candidate[]) => Promise<number>;

export function mefxCandidates(devices: Candidate[]) {
  return devices.filter((device, index) => /^MEFX-S3(?:$| )/.test(device.deviceName) && device.deviceId &&
    devices.findIndex((other) => other.deviceId === device.deviceId) === index).slice(0, 8);
}

// A scan can emit repeatedly; one user decision completes its callback only once.
export class BluetoothChooser {
  private pending?: { callback: (id: string) => void; timer: ReturnType<typeof setTimeout>; prompted: boolean };

  constructor(private prompt: Prompt, private timeoutMs = 30000) {}

  cancel() {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.callback(""); }
  }

  update(devices: Candidate[], callback: (id: string) => void, trusted: boolean) {
    if (!trusted) { this.cancel(); callback(""); return; }
    if (!this.pending) {
      this.pending = { callback, prompted: false, timer: setTimeout(() => this.cancel(), this.timeoutMs) };
    }
    const pending = this.pending;
    pending.callback = callback;
    if (pending.prompted) return;
    const candidates = mefxCandidates(devices);
    if (!candidates.length) return;
    pending.prompted = true;
    void this.prompt(candidates).then((selected) => {
      if (this.pending !== pending) return;
      this.pending = undefined;
      clearTimeout(pending.timer);
      pending.callback(Number.isInteger(selected) ? candidates[selected]?.deviceId ?? "" : "");
    }).catch(() => { if (this.pending === pending) this.cancel(); });
  }
}
