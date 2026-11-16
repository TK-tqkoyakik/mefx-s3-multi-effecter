from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"

TARGET_REFS = {
    "U_ESP32",
    "U_PCM1808",
    "U_PCM5102",
    "U_MP1584",
    "J_DC",
    "J_IN",
    "J_OUT",
    "J_SW",
    "J_MIC",
}


def top_level_blocks(text: str, marker: str) -> list[tuple[int, int, str]]:
    blocks: list[tuple[int, int, str]] = []
    index = 0
    while True:
        start = text.find(marker, index)
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
            raise RuntimeError(f"Unclosed block at {start}")
        blocks.append((start, end, text[start:end]))
        index = end


def block_ref(block: str) -> str | None:
    marker = '(property "Reference" "'
    start = block.find(marker)
    if start < 0:
        return None
    start += len(marker)
    end = block.find('"', start)
    if end < 0:
        return None
    return block[start:end]


def hide_user_texts(block: str) -> tuple[str, int]:
    replacements: list[tuple[int, int, str]] = []
    count = 0
    for start, end, text_block in top_level_blocks(block, "(fp_text user "):
        if "(hide yes)" in text_block:
            continue
        layer = text_block.find('(layer "F.SilkS")')
        if layer < 0:
            continue
        line_end = text_block.find("\n", layer)
        if line_end < 0:
            continue
        new_text_block = text_block[: line_end + 1] + "\t\t\t(hide yes)\n" + text_block[line_end + 1 :]
        replacements.append((start, end, new_text_block))
        count += 1

    for start, end, new_text_block in reversed(replacements):
        block = block[:start] + new_text_block + block[end:]
    return block, count


def main() -> None:
    text = PCB.read_text(encoding="utf-8")
    replacements: list[tuple[int, int, str]] = []
    hidden = 0

    for start, end, block in top_level_blocks(text, "(footprint "):
        ref = block_ref(block)
        if ref not in TARGET_REFS:
            continue
        new_block, count = hide_user_texts(block)
        if count:
            replacements.append((start, end, new_block))
            hidden += count

    for start, end, new_block in reversed(replacements):
        text = text[:start] + new_block + text[end:]

    PCB.write_text(text, encoding="utf-8")
    print(f"Hid {hidden} module pin silkscreen labels in {PCB}")


if __name__ == "__main__":
    main()
