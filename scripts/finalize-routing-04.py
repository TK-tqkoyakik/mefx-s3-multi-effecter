from pathlib import Path
import sys

import pcbnew


def point(x: float, y: float) -> pcbnew.VECTOR2I:
    return pcbnew.VECTOR2I(pcbnew.FromMM(x), pcbnew.FromMM(y))


def add_via(board, net, x: float, y: float) -> None:
    item = pcbnew.PCB_VIA(board)
    item.SetNet(net)
    item.SetPosition(point(x, y))
    item.SetWidth(pcbnew.FromMM(0.6))
    item.SetDrill(pcbnew.FromMM(0.3))
    board.Add(item)


def add_track(board, net, start, end, layer=pcbnew.B_Cu) -> None:
    item = pcbnew.PCB_TRACK(board)
    item.SetNet(net)
    item.SetLayer(layer)
    item.SetWidth(pcbnew.FromMM(0.25))
    item.SetStart(point(*start))
    item.SetEnd(point(*end))
    board.Add(item)


def main() -> None:
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    board = pcbnew.LoadBoard(str(source))
    ground = board.FindNet("GND")

    reference_map = {
        "U_CODEC": "U2", "U_ESP32": "U3", "U_LDO": "U4", "U_PWR": "U5",
        "J_DC": "J1", "J_IN": "J2", "J_MIC": "J3", "J_SW": "J4", "J_OUT": "J5",
        "C9A": "C31", "C9B": "C32", "C20B": "C33", "C22B": "C34",
        "C27B": "C35", "C28B": "C36",
    }
    for old, new in reference_map.items():
        board.FindFootprintByReference(old).SetReference(new)

    diode = board.FindFootprintByReference("D1")
    diode.FindPadByNumber("A").SetNumber("2")
    diode.FindPadByNumber("K").SetNumber("1")

    # Dense SMT ground pads cannot fit two thermal spokes. A local solid
    # connection is electrically preferable and these parts are machine-placed.
    for reference, pad_number in (
        ("R64", "2"),
        ("C36", "2"),
        ("C35", "2"),
        ("C1", "2"),
        ("U4", "2"),
    ):
        pad = board.FindFootprintByReference(reference).FindPadByNumber(pad_number)
        pad.SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_FULL)

    # Move the fixed LRCK segment around the only viable GND stitching point.
    segment_replaced = False
    for item in board.GetTracks():
        if item.GetNetname() != "LRCK" or item.GetLayer() != pcbnew.B_Cu:
            continue
        start = (round(pcbnew.ToMM(item.GetStart().x), 3), round(pcbnew.ToMM(item.GetStart().y), 3))
        end = (round(pcbnew.ToMM(item.GetEnd().x), 3), round(pcbnew.ToMM(item.GetEnd().y), 3))
        if {start, end} == {(77.0, 46.0), (84.0, 57.925)}:
            item.SetStart(point(77.0, 46.0))
            item.SetEnd(point(82.0, 52.0))
            segment_replaced = True
    lrck = board.FindNet("LRCK")
    if not segment_replaced:
        raise RuntimeError("Expected LRCK segment was not found")
    lrck_points = ((82.0, 52.0), (82.5, 53.0), (84.0, 57.925))
    for start, end in zip(lrck_points, lrck_points[1:]):
        add_track(board, lrck, start, end)

    # These positions connect isolated top-copper GND regions to the solid
    # bottom GND plane while preserving 0.20 mm copper clearance.
    for x, y in ((81.2, 54.0), (80.0, 55.5), (100.8, 61.3), (33.5, 39.0)):
        add_via(board, ground, x, y)

    for item in board.GetTracks():
        if item.GetNetname() == "+5V_AUDIO" and not isinstance(item, pcbnew.PCB_VIA):
            item.SetWidth(pcbnew.FromMM(0.5))

    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    pcbnew.SaveBoard(str(output), board)


if __name__ == "__main__":
    main()
