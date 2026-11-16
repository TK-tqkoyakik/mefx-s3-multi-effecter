from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"

PROBLEM_REFERENCE_REFS = {
    "H1",
    "H2",
    "H3",
    "H4",
    "H_PWR_1",
    "H_PWR_2",
    "H_ADC_1",
    "H_ADC_2",
    "H_DAC_1",
    "H_DAC_2",
    "U_PCM1808",
    "U_PCM5102",
    "U_ESP32",
    "U_MP1584",
    "J_OUT",
    "R35",
    "R36",
    "R5",
    "R50",
    "C2",
}


def blocks(text: str, marker: str) -> list[tuple[int, int, str]]:
    found: list[tuple[int, int, str]] = []
    index = 0
    while True:
        start = text.find(marker, index)
        if start < 0:
            return found
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
        found.append((start, end, text[start:end]))
        index = end


def get_ref(footprint: str) -> str | None:
    marker = '(property "Reference" "'
    start = footprint.find(marker)
    if start < 0:
        return None
    start += len(marker)
    end = footprint.find('"', start)
    return None if end < 0 else footprint[start:end]


def hide_reference_property(footprint: str) -> tuple[str, bool]:
    prop_start = footprint.find('(property "Reference" ')
    if prop_start < 0:
        return footprint, False
    prop_block = blocks(footprint[prop_start:], "(property ")[0]
    start = prop_start + prop_block[0]
    end = prop_start + prop_block[1]
    text = prop_block[2]
    if "(hide yes)" in text:
        return footprint, False
    layer_pos = text.find('(layer "F.SilkS")')
    if layer_pos < 0:
        return footprint, False
    line_end = text.find("\n", layer_pos)
    if line_end < 0:
        return footprint, False
    new_text = text[: line_end + 1] + "\t\t\t(hide yes)\n" + text[line_end + 1 :]
    return footprint[:start] + new_text + footprint[end:], True


def move_d1_silk_to_fab(footprint: str) -> tuple[str, int]:
    count = footprint.count('(layer "F.SilkS")')
    return footprint.replace('(layer "F.SilkS")', '(layer "F.Fab")'), count


def hide_draft_title(text: str) -> tuple[str, bool]:
    title = '(gr_text "MEFX-S3 JLCPCB CARRIER DRAFT v1"'
    start = text.find(title)
    if start < 0:
        return text, False
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
        raise RuntimeError("Unclosed draft title text.")
    block = text[start:end]
    new_block = block.replace('(layer "F.SilkS")', '(layer "F.Fab")')
    return text[:start] + new_block + text[end:], new_block != block


def main() -> None:
    text = PCB.read_text(encoding="utf-8")
    replacements: list[tuple[int, int, str]] = []
    hidden_refs = 0
    moved_d1_items = 0

    for start, end, footprint in blocks(text, "(footprint "):
        ref = get_ref(footprint)
        new_footprint = footprint
        if ref in PROBLEM_REFERENCE_REFS:
            new_footprint, changed = hide_reference_property(new_footprint)
            hidden_refs += int(changed)
        if ref == "D1":
            new_footprint, moved = move_d1_silk_to_fab(new_footprint)
            moved_d1_items += moved
        if new_footprint != footprint:
            replacements.append((start, end, new_footprint))

    for start, end, new_footprint in reversed(replacements):
        text = text[:start] + new_footprint + text[end:]

    text, title_hidden = hide_draft_title(text)
    PCB.write_text(text, encoding="utf-8")

    print(f"Hid {hidden_refs} reference silkscreen fields.")
    print(f"Moved {moved_d1_items} D1 silkscreen items to F.Fab.")
    print(f"Moved draft title to F.Fab: {'yes' if title_hidden else 'no'}")


if __name__ == "__main__":
    main()
