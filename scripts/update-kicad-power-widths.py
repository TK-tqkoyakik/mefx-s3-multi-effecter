from __future__ import annotations

import re
import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"
OUT = ROOT / "docs" / "kicad" / "mefx_s3_power_width_test.kicad_pcb"

WIDTHS = {
    "+9V_RAW": 1.0,
    "+9V_PROT": 1.0,
    "+9VA": 0.8,
    "+5V": 0.8,
    "+3V3_LOGIC": 0.5,
    "VBIAS_4V5": 0.3,
    "GND": 0.5,
}

SEGMENT_RE = re.compile(
    r"(\(segment\s+\(start [^)]+\)\s+\(end [^)]+\)\s+\(width )"
    r"([-0-9.]+)"
    r"(\)\s+\(layer \"[^\"]+\"\)\s+\(net \"([^\"]+)\"\))",
    re.MULTILINE,
)


def replace(match: re.Match[str]) -> str:
    net = match.group(4)
    width = WIDTHS.get(net)
    if width is None:
        return match.group(0)
    return f"{match.group(1)}{width:.2f}{match.group(3)}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=SRC)
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()
    source = args.input.resolve()
    output = args.output.resolve()
    text = source.read_text(encoding="utf-8")
    updated, count = SEGMENT_RE.subn(replace, text)
    output.write_text(updated, encoding="utf-8")
    print(f"Updated {count} segment records in {output}")


if __name__ == "__main__":
    main()
