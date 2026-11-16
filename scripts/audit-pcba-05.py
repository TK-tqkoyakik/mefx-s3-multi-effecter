from __future__ import annotations

import csv
from pathlib import Path

import pcbnew


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"
OUT = ROOT / "docs" / "pcb-assembly" / "05_order_package"


def mm(value: int) -> float:
    return round(pcbnew.ToMM(value), 4)


def main() -> int:
    board = pcbnew.LoadBoard(str(PCB))
    errors: list[str] = []

    expected_u4 = {
        "1": "+5V_AUDIO",
        "2": "GND",
        "3": "+5V_AUDIO",
        "4": "",
        "5": "+3V3_LOGIC",
    }
    u4 = board.FindFootprintByReference("U4")
    if u4.GetFPID().GetUniStringLibId() != "Package_TO_SOT_SMD:SOT-23-5":
        errors.append(f"U4 footprint: {u4.GetFPID().GetUniStringLibId()}")
    for pad in u4.Pads():
        number = pad.GetNumber()
        if pad.GetNetname() != expected_u4[number]:
            errors.append(
                f"U4 pad {number}: expected {expected_u4[number]}, got {pad.GetNetname()}"
            )
        size = (mm(pad.GetSize().x), mm(pad.GetSize().y))
        if size != (1.325, 0.6):
            errors.append(f"U4 pad {number} size: {size}")

    u2 = board.FindFootprintByReference("U2")
    for pad in u2.Pads():
        size = (mm(pad.GetSize().x), mm(pad.GetSize().y))
        if size != (1.7, 0.4):
            errors.append(f"U2 pad {pad.GetNumber()} size: {size}")

    expected_pin1 = {
        "D1": ("+9V_PROT", (79.8, 10.0)),
        "U1": ("TL072_A_OUT", (34.4, 50.905)),
        "U2": ("DAC_DIN", (86.9, 58.575)),
        "U4": ("+5V_AUDIO", (98.8625, 10.05)),
    }
    for ref, (net, expected_position) in expected_pin1.items():
        footprint = board.FindFootprintByReference(ref)
        pad = footprint.FindPadByNumber("1")
        position = (mm(pad.GetPosition().x), mm(pad.GetPosition().y))
        if pad.GetNetname() != net or position != expected_position:
            errors.append(
                f"{ref} pin 1: net={pad.GetNetname()} position={position}"
            )

    cpl_path = OUT / "UPLOAD_THIS_CPL_05.csv"
    if cpl_path.exists():
        with cpl_path.open(encoding="utf-8-sig", newline="") as file:
            rows = {row["Designator"]: row for row in csv.DictReader(file)}
        row = rows.get("U4")
        if not row:
            errors.append("U4 missing from CPL")
        elif (
            row["Mid X"] != "100.000mm"
            or row["Mid Y"] != "-11.000mm"
            or row["Layer"] != "Top"
            or row["Rotation"] != "0.0"
        ):
            errors.append(f"U4 CPL: {row}")

    print("U4 footprint:", u4.GetFPID().GetUniStringLibId())
    for pad in sorted(u4.Pads(), key=lambda item: int(item.GetNumber())):
        print(
            f"U4 pad {pad.GetNumber()}: {pad.GetNetname() or 'NC'}, "
            f"{mm(pad.GetSize().x)}x{mm(pad.GetSize().y)} mm"
        )
    print("D1 pin 1: cathode / +9V_PROT")
    print("U1 pin 1: TL072_A_OUT")
    print("U2 pin 1: DAC_DIN; pads 1.70x0.40 mm")
    if errors:
        print("PCBA 05 AUDIT FAILED")
        for error in errors:
            print("-", error)
        return 1
    print("PCBA 05 AUDIT PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
