import argparse
import wave
from pathlib import Path

import torch

from demucs.apply import BagOfModels, apply_model
from demucs.htdemucs import HTDemucs
from demucs.pretrained import get_model


def read_pcm16_wav(path: Path) -> torch.Tensor:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        frame_count = wav.getnframes()
        if sample_width != 2:
            raise ValueError("Only 16-bit PCM WAV is supported.")
        raw = wav.readframes(frame_count)

    audio = torch.frombuffer(bytearray(raw), dtype=torch.int16).float() / 32768.0
    audio = audio.reshape(-1, channels).transpose(0, 1).contiguous()
    if channels == 1:
        audio = audio.repeat(2, 1)
    elif channels > 2:
        audio = audio[:2]
    return audio


def write_pcm16_wav(path: Path, wav: torch.Tensor, samplerate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    wav = wav.detach().cpu().float()
    peak = wav.abs().max().item() if wav.numel() else 0
    if peak > 1:
        wav = wav / (peak * 1.01)
    pcm = (wav.clamp(-1, 1).transpose(0, 1).contiguous() * 32767).short().numpy()
    with wave.open(str(path), "wb") as out:
        out.setnchannels(wav.shape[0])
        out.setsampwidth(2)
        out.setframerate(samplerate)
        out.writeframes(pcm.tobytes())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--model", default="htdemucs")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--shifts", type=int, default=1)
    parser.add_argument("--overlap", type=float, default=0.25)
    parser.add_argument("--jobs", type=int, default=0)
    args = parser.parse_args()

    model = get_model(args.model)
    max_allowed_segment = float("inf")
    if isinstance(model, HTDemucs):
        max_allowed_segment = float(model.segment)
    elif isinstance(model, BagOfModels):
        max_allowed_segment = model.max_allowed_segment

    model.cpu()
    model.eval()
    mix = read_pcm16_wav(Path(args.input))
    ref = mix.mean(0)
    mix -= ref.mean()
    mix /= ref.std().clamp_min(1e-8)

    sources = apply_model(
        model,
        mix[None],
        device=args.device,
        shifts=args.shifts,
        split=True,
        overlap=args.overlap,
        progress=True,
        num_workers=args.jobs,
        segment=max_allowed_segment,
    )[0]
    sources *= ref.std().clamp_min(1e-8)
    sources += ref.mean()

    out_dir = Path(args.out) / args.model / Path(args.input).stem
    for source, name in zip(sources, model.sources):
        write_pcm16_wav(out_dir / f"{name}.wav", source, model.samplerate)


if __name__ == "__main__":
    main()
