from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KICAD_DIR = ROOT / "docs" / "kicad"
PCB = KICAD_DIR / "mefx_s3.kicad_pcb"
PRETTY = KICAD_DIR / "MEFX.pretty"
FP_LIB_TABLE = KICAD_DIR / "fp-lib-table"


def footprint_blocks(text: str) -> list[str]:
    blocks: list[str] = []
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
        blocks.append(text[start:end])
        index = end


def footprint_name(block: str) -> str:
    marker = '(footprint "MEFX:'
    start = block.find(marker)
    if start < 0:
        raise RuntimeError("Missing MEFX footprint marker.")
    start += len(marker)
    end = block.find('"', start)
    if end < 0:
        raise RuntimeError("Missing footprint name terminator.")
    return block[start:end]


def localize_block(block: str, name: str) -> str:
    return block.replace(f'(footprint "MEFX:{name}"', f'(footprint "{name}"', 1)


def main() -> None:
    text = PCB.read_text(encoding="utf-8")
    unique: dict[str, str] = {}
    for block in footprint_blocks(text):
        name = footprint_name(block)
        unique.setdefault(name, localize_block(block, name))

    PRETTY.mkdir(exist_ok=True)
    for name, block in sorted(unique.items()):
        (PRETTY / f"{name}.kicad_mod").write_text(block + "\n", encoding="utf-8")

    FP_LIB_TABLE.write_text(
        """(fp_lib_table
  (version 7)
  (lib (name "MEFX")(type "KiCad")(uri "${KIPRJMOD}/MEFX.pretty")(options "")(descr "MEFX local footprints"))
)
""",
        encoding="utf-8",
    )

    print(f"Wrote {len(unique)} footprints to {PRETTY}")
    print(f"Wrote {FP_LIB_TABLE}")


if __name__ == "__main__":
    main()
