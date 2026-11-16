from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BOARD = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"


def footprint_blocks(text: str) -> list[str]:
    blocks: list[str] = []
    index = 0
    while True:
        start = text.find('(footprint ', index)
        if start < 0:
            return blocks

        depth = 0
        end = None
        for pos in range(start, len(text)):
            char = text[pos]
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    end = pos + 1
                    break
        if end is None:
            raise RuntimeError("Unclosed footprint block in KiCad PCB file.")
        blocks.append(text[start:end])
        index = end


def read_board_holes() -> dict[str, tuple[float, float, float]]:
    text = BOARD.read_text(encoding="utf-8")
    holes: dict[str, tuple[float, float, float]] = {}

    for block in footprint_blocks(text):
        ref_match = re.search(r'\(property "Reference" "([^"]+)"', block)
        if not ref_match:
            continue
        ref = ref_match.group(1)
        if not ref.startswith("H"):
            continue

        at_match = re.search(r"\(at\s+([-0-9.]+)\s+([-0-9.]+)", block)
        drill_match = re.search(r"\(drill\s+([-0-9.]+)\)", block)
        if not at_match or not drill_match:
            continue

        holes[ref] = (
            float(at_match.group(1)),
            float(at_match.group(2)),
            float(drill_match.group(1)),
        )

    return holes


def read_expected_holes() -> dict[str, tuple[float, float, float]]:
    # Current 150 x 90 mm carrier board. These become case coordinates after
    # adding the 8 mm X/Y board offset in the bottom enclosure.
    return {
        "H1": (5.0, 38.0, 3.2),
        "H2": (145.0, 5.0, 3.2),
        "H3": (5.0, 85.0, 3.2),
        "H4": (145.0, 85.0, 3.2),
    }


def assert_close(ref: str, field: str, actual: float, expected: float) -> None:
    if abs(actual - expected) > 0.01:
        raise AssertionError(
            f"{ref} {field} mismatch: board={actual:.3f}, expected={expected:.3f}"
        )


def main() -> None:
    board_holes = read_board_holes()
    expected_holes = read_expected_holes()

    missing = sorted(set(expected_holes) - set(board_holes))
    extra = sorted(set(board_holes) - set(expected_holes))
    if missing:
        raise AssertionError(f"Missing mounting holes in board: {', '.join(missing)}")
    if extra:
        raise AssertionError(f"Unexpected mounting holes in board: {', '.join(extra)}")

    for ref, expected in sorted(expected_holes.items()):
        actual = board_holes[ref]
        assert_close(ref, "X", actual[0], expected[0])
        assert_close(ref, "Y", actual[1], expected[1])
        assert_close(ref, "drill", actual[2], expected[2])

    print(f"Mounting hole verification passed: {len(expected_holes)} holes match KiCad.")


if __name__ == "__main__":
    main()
