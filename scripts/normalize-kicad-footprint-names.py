from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"


def footprint_blocks(text: str) -> list[tuple[int, int, str]]:
    blocks: list[tuple[int, int, str]] = []
    index = 0
    while True:
        start = text.find('(footprint "MEFX:', index)
        if start < 0:
            return blocks

        depth = 0
        end = None
        for pos in range(start, len(text)):
            if text[pos] == "(":
                depth += 1
            elif text[pos] == ")":
                depth -= 1
                if depth == 0:
                    end = pos + 1
                    break
        if end is None:
            raise RuntimeError("Unclosed footprint block.")
        blocks.append((start, end, text[start:end]))
        index = end


def current_name(block: str) -> str:
    match = re.search(r'\(footprint "MEFX:([^"]+)"', block)
    if not match:
        raise RuntimeError("Missing footprint name.")
    return match.group(1)


def normalized_name(block: str) -> str | None:
    name = current_name(block)
    if name == "HEADER":
        pad_count = len(re.findall(r'\(pad "', block))
        return f"HEADER_{pad_count}P"
    if name == "NPTH":
        drill_match = re.search(r"\(drill\s+([-0-9.]+)\)", block)
        if not drill_match:
            raise RuntimeError("NPTH footprint without drill.")
        drill = drill_match.group(1).replace(".", "_")
        return f"NPTH_{drill}MM"
    return None


def main() -> None:
    text = PCB.read_text(encoding="utf-8")
    blocks = footprint_blocks(text)
    replacements: list[tuple[int, int, str]] = []

    for start, end, block in blocks:
        new_name = normalized_name(block)
        if not new_name:
            continue
        old_name = current_name(block)
        new_block = block.replace(
            f'(footprint "MEFX:{old_name}"',
            f'(footprint "MEFX:{new_name}"',
            1,
        )
        replacements.append((start, end, new_block))

    for start, end, new_block in reversed(replacements):
        text = text[:start] + new_block + text[end:]

    PCB.write_text(text, encoding="utf-8")
    print(f"Normalized {len(replacements)} footprints in {PCB}")


if __name__ == "__main__":
    main()
