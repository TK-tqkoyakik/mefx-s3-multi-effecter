from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"


def blocks(text: str, keyword: str) -> list[tuple[int, int, str]]:
    result: list[tuple[int, int, str]] = []
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
            elif char == '"':
                quoted = True
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    result.append((start, index + 1, text[start:index + 1]))
                    start = index + 1
                    break
        else:
            raise RuntimeError(f"Unclosed {keyword}")


def main() -> None:
    replacements = {
        "C14": "220pF C0G",
        "C19": "220pF C0G",
        "C22B": "47uF 10V X5R",
        "R4": "0R",
    }
    text = PCB.read_text(encoding="utf-8")
    edits: list[tuple[int, int, str]] = []
    found: set[str] = set()
    for start, end, block in blocks(text, "footprint"):
        ref_match = re.search(r'\(property "Reference" "([^"]+)"', block)
        if not ref_match or ref_match.group(1) not in replacements:
            continue
        ref = ref_match.group(1)
        value = replacements[ref]
        updated, count = re.subn(
            r'(\(property "Value" ")[^"]+("\s*)',
            rf'\g<1>{value}\g<2>',
            block,
            count=1,
        )
        if count != 1:
            raise RuntimeError(f"Could not update {ref}")
        edits.append((start, end, updated))
        found.add(ref)
    missing = set(replacements) - found
    if missing:
        raise RuntimeError(f"Missing references: {sorted(missing)}")
    for start, end, updated in reversed(edits):
        text = text[:start] + updated + text[end:]
    PCB.write_text(text, encoding="utf-8")
    print("Applied core fixes 04: " + ", ".join(sorted(found)))


if __name__ == "__main__":
    main()
