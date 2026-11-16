from __future__ import annotations

import re
import sys
import math
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"


def blocks(text: str, keyword: str) -> list[str]:
    result: list[str] = []
    marker = f"({keyword}"
    start = 0
    while True:
        start = text.find(marker, start)
        if start < 0:
            return result
        depth = 0
        quoted = False
        escaped = False
        for index in range(start, len(text)):
            char = text[index]
            if quoted:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    quoted = False
                continue
            if char == '"':
                quoted = True
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    result.append(text[start:index + 1])
                    start = index + 1
                    break
        else:
            raise ValueError(f"Unclosed {keyword} block")


def property_value(block: str, name: str) -> str:
    match = re.search(rf'\(property "{re.escape(name)}" "([^"]*)"', block)
    return match.group(1) if match else ""


def item_position(block: str) -> tuple[float, float]:
    match = re.search(r'^\s*\([^\s]+.*?\n\s*\(layer[^\n]*\).*?\n(?:\s*\(uuid[^\n]*\)\n)?\s*\(at\s+([-0-9.]+)\s+([-0-9.]+)', block, re.DOTALL)
    if not match:
        match = re.search(r'\(at\s+([-0-9.]+)\s+([-0-9.]+)', block)
    if not match:
        raise ValueError("Item has no position")
    return float(match.group(1)), float(match.group(2))


def footprint_pad_position(footprint: str, number: str) -> tuple[float, float]:
    origin_x, origin_y = item_position(footprint)
    for pad in blocks(footprint, "pad"):
        match = re.match(r'\(pad\s+"([^"]+)"', pad)
        if match and match.group(1) == number:
            local_x, local_y = item_position(pad)
            return origin_x + local_x, origin_y + local_y
    raise ValueError(f"Pad {number} not found")


def main() -> int:
    text = PCB.read_text(encoding="utf-8")
    errors: list[str] = []

    footprints = {}
    for block in blocks(text, "footprint"):
        ref = property_value(block, "Reference")
        if ref:
            footprints[ref] = {
                "value": property_value(block, "Value"),
                "block": block,
            }

    expected_values = {
        "C14": "220pF C0G",
        "C19": "220pF C0G",
        "C34": "47uF 10V X5R",
        "R4": "0R",
        "R30": "47k",
        "R60": "10k",
        "R61": "10k",
        "R62": "10k",
        "R63": "10k",
        "U2": "CS4270-CZZR",
        "U4": "AP2112K-3.3",
        "U1": "TL072",
    }
    for ref, expected in expected_values.items():
        actual = footprints.get(ref, {}).get("value")
        if actual != expected:
            errors.append(f"{ref}: expected {expected!r}, got {actual!r}")

    decoupling_checks = [
        ("VQ 100nF", "U2", "17", "C33", "1"),
        ("FILT+ 100nF", "U2", "18", "C22", "1"),
        ("VA 100nF", "U2", "19", "C36", "1"),
        ("VD 100nF", "U2", "5", "C28", "2"),
    ]
    decoupling_distances: dict[str, float] = {}
    for label, ic_ref, ic_pad, cap_ref, cap_pad in decoupling_checks:
        try:
            a = footprint_pad_position(footprints[ic_ref]["block"], ic_pad)
            b = footprint_pad_position(footprints[cap_ref]["block"], cap_pad)
            distance = math.dist(a, b)
            decoupling_distances[label] = distance
            if distance > 5.0:
                errors.append(f"{label}: pad distance {distance:.2f} mm exceeds 5.00 mm")
        except (KeyError, ValueError) as error:
            errors.append(f"{label}: {error}")

    all_net_names = set(re.findall(r'\(net\s+"([^"]+)"\)', text))
    widths: dict[str, set[float]] = defaultdict(set)
    for segment in blocks(text, "segment"):
        width_match = re.search(r'\(width\s+([0-9.]+)\)', segment)
        net_match = re.search(r'\(net\s+"([^"]+)"\)', segment)
        if width_match and net_match:
            widths[net_match.group(1)].add(float(width_match.group(1)))

    minimum_widths = {
        "+9V_RAW": 1.0,
        "+9V_PROT": 1.0,
        "+5V": 0.8,
        "+5V_AUDIO": 0.4,
        "+9VA": 0.5,
        "+3V3_LOGIC": 0.3,
        "+3V3_DAC": 0.3,
    }
    for net, minimum in minimum_widths.items():
        actual = widths.get(net, set())
        if not actual:
            errors.append(f"{net}: no routed track found")
        elif min(actual) < minimum:
            errors.append(f"{net}: minimum width {min(actual):.3f} mm is below {minimum:.3f} mm")

    required_nets = {
        "MCLK", "BCLK", "LRCK", "ADC_DOUT", "DAC_DIN", "CODEC_RST",
        "ADC_L", "ADC_R", "CODEC_FILT", "CODEC_VQ", "OUTPUT_TIP",
    }
    missing_nets = sorted(required_nets - all_net_names)
    if missing_nets:
        errors.append("missing nets: " + ", ".join(missing_nets))

    print(f"PCB: {PCB}")
    print(f"Footprints: {len(footprints)}")
    for net in minimum_widths:
        shown = ", ".join(f"{width:.3f}" for width in sorted(widths.get(net, set()))) or "missing"
        print(f"{net}: {shown} mm")
    for label, distance in decoupling_distances.items():
        print(f"{label}: {distance:.2f} mm")

    if errors:
        print("AUDIT FAILED")
        for error in errors:
            print(f"- {error}")
        return 1
    print("AUDIT PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
