from __future__ import annotations

from pathlib import Path

import pcbnew


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"


def mm(value: float) -> int:
    return pcbnew.FromMM(value)


def point(x: float, y: float) -> pcbnew.VECTOR2I:
    return pcbnew.VECTOR2I(mm(x), mm(y))


def add_track(board, net, start, end, width):
    track = pcbnew.PCB_TRACK(board)
    track.SetLayer(pcbnew.F_Cu)
    track.SetNet(net)
    track.SetWidth(mm(width))
    track.SetStart(point(*start))
    track.SetEnd(point(*end))
    board.Add(track)


def near(value, x, y, tolerance=0.02):
    return (
        abs(pcbnew.ToMM(value.x) - x) <= tolerance
        and abs(pcbnew.ToMM(value.y) - y) <= tolerance
    )


def main() -> None:
    board = pcbnew.LoadBoard(str(PCB))
    u4 = board.FindFootprintByReference("U4")
    u2 = board.FindFootprintByReference("U2")
    if not u4 or not u2:
        raise RuntimeError("U2 or U4 is missing")
    u4_pads = list(u4.Pads())
    u2_pads = list(u2.Pads())

    # Exact KiCad Package_TO_SOT_SMD:SOT-23-5 land pattern.
    u4.SetFPID(pcbnew.LIB_ID("Package_TO_SOT_SMD", "SOT-23-5"))
    positions = {
        "1": (-1.1375, -0.95),
        "2": (-1.1375, 0.0),
        "3": (-1.1375, 0.95),
        "4": (1.1375, 0.95),
        "5": (1.1375, -0.95),
    }
    expected_nets = {
        "1": "+5V_AUDIO",
        "2": "GND",
        "3": "+5V_AUDIO",
        "4": "",
        "5": "+3V3_LOGIC",
    }
    for pad in u4_pads:
        number = pad.GetNumber()
        if pad.GetNetname() != expected_nets[number]:
            raise RuntimeError(
                f"U4 pad {number}: expected {expected_nets[number]}, got {pad.GetNetname()}"
            )
        pad.SetPosition(u4.GetPosition() + point(*positions[number]))
        pad.SetSize(point(1.325, 0.6))
        pad.SetShape(pcbnew.PAD_SHAPE_ROUNDRECT)
        pad.SetRoundRectRadiusRatio(0.25)
        if number == "2":
            pad.SetZoneLayerOverride(pcbnew.F_Cu, pcbnew.ZONE_CONNECTION_FULL)

    # Remove only short traces ending at the obsolete U4 lands.
    obsolete = {
        (98.1, 12.0),
        (98.1, 10.0),
        (101.9, 12.0),
        (98.8625, 10.05),
        (98.8625, 11.95),
        (101.1375, 10.05),
        (102.5, 10.05),
        (102.5, 12.0),
        (103.0, 10.05),
        (103.0, 32.1),
    }
    for track in list(board.GetTracks()):
        if track.GetLayer() != pcbnew.F_Cu:
            continue
        if any(
            near(track.GetStart(), x, y) or near(track.GetEnd(), x, y)
            for x, y in obsolete
        ):
            board.Remove(track)

    net_5v = board.FindNet("+5V_AUDIO")
    net_3v3 = board.FindNet("+3V3_LOGIC")
    add_track(board, net_5v, (98.8625, 10.05), (97.383, 10.0), 0.5)
    add_track(board, net_5v, (98.8625, 11.95), (97.4535, 12.0), 0.5)
    add_track(board, net_3v3, (101.1375, 10.05), (103.0, 10.05), 0.3)
    add_track(board, net_3v3, (103.0, 10.05), (106.0, 12.0), 0.3)
    add_track(board, net_3v3, (103.0, 10.05), (103.0, 32.1), 0.3)
    add_track(board, net_3v3, (103.0, 32.1), (101.9, 32.1), 0.3)

    # Keep the validated 1.70 x 0.40-mm TSSOP lands. They are longer than the
    # KiCad standard 1.475 x 0.40-mm lands and preserve 0.65-mm-pitch clearance.
    for pad in u2_pads:
        pad.SetSize(point(1.7, 0.4))
        pad.SetRoundRectRadiusRatio(0.2)

    pcbnew.SaveBoard(str(PCB), board)


if __name__ == "__main__":
    main()
