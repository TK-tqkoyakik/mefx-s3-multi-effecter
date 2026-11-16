from pathlib import Path

import pcbnew


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"
LIBRARY = Path(
    r"C:\Program Files\KiCad\10.0\share\kicad\footprints\Package_TO_SOT_SMD.pretty"
)


def main() -> None:
    board = pcbnew.LoadBoard(str(PCB))
    old = board.FindFootprintByReference("U4")
    if not old:
        raise RuntimeError("U4 is missing")

    expected = {
        "1": "+5V_AUDIO",
        "2": "GND",
        "3": "+5V_AUDIO",
        "4": "",
        "5": "+3V3_LOGIC",
    }
    for pad in old.Pads():
        if pad.GetNetname() != expected[pad.GetNumber()]:
            raise RuntimeError(
                f"U4 pad {pad.GetNumber()} net changed: {pad.GetNetname()}"
            )

    replacement = pcbnew.FootprintLoad(str(LIBRARY), "SOT-23-5")
    replacement.SetFPID(pcbnew.LIB_ID("Package_TO_SOT_SMD", "SOT-23-5"))
    replacement.SetReference("U4")
    replacement.SetValue("AP2112K-3.3")
    replacement.SetPosition(old.GetPosition())
    replacement.SetOrientation(old.GetOrientation())
    for pad in replacement.Pads():
        net_name = expected[pad.GetNumber()]
        if net_name:
            pad.SetNet(board.FindNet(net_name))

    board.Remove(old)
    board.Add(replacement)
    pcbnew.SaveBoard(str(PCB), board)


if __name__ == "__main__":
    main()
