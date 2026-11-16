from pathlib import Path
import sys

import pcbnew


def point(x: float, y: float) -> pcbnew.VECTOR2I:
    return pcbnew.VECTOR2I(pcbnew.FromMM(x), pcbnew.FromMM(y))


def track(board, net, layer, start, end, width=0.25):
    item = pcbnew.PCB_TRACK(board)
    item.SetNet(net)
    item.SetLayer(layer)
    item.SetWidth(pcbnew.FromMM(width))
    item.SetStart(point(*start))
    item.SetEnd(point(*end))
    board.Add(item)


def via(board, net, location):
    item = pcbnew.PCB_VIA(board)
    item.SetNet(net)
    item.SetPosition(point(*location))
    item.SetWidth(pcbnew.FromMM(0.6))
    item.SetDrill(pcbnew.FromMM(0.3))
    board.Add(item)


def add_ground_stitching(board):
    net = board.FindNet("GND")
    for y in (10.0, 30.0, 50.0, 70.0):
        for x in (10.0, 30.0, 50.0, 70.0, 90.0, 110.0, 130.0):
            if 42.0 <= x <= 59.0 and 7.5 <= y <= 27.5:
                continue
            if y == 30.0 and x <= 50.0:
                continue
            if x == 90.0 and y == 10.0:
                continue
            via(board, net, (x, y))


def add_path(board, net_name, points, start_layer, middle_layer, width=0.25):
    net = board.FindNet(net_name)
    track(board, net, start_layer, points[0], points[1], width)
    via(board, net, points[1])
    for start, end in zip(points[1:-2], points[2:-1]):
        track(board, net, middle_layer, start, end, width)
    via(board, net, points[-2])
    track(board, net, start_layer, points[-2], points[-1], width)


def main():
    path = Path(sys.argv[1])
    board = pcbnew.LoadBoard(str(path))
    if "--no-stitch" not in sys.argv[2:]:
        add_ground_stitching(board)

    # Fix the codec VA bypass route before autorouting; this pin has little escape room.
    va = board.FindNet("+5V_AUDIO")
    va_points = [(93.1, 55.325), (94.0, 55.325), (94.5, 55.15)]
    for start, end in zip(va_points, va_points[1:]):
        track(board, va, pcbnew.F_Cu, start, end, 0.5)

    ground = board.FindNet("GND")
    track(board, ground, pcbnew.F_Cu, (86.9, 55.325), (86.5, 55.25))
    track(board, ground, pcbnew.F_Cu, (86.5, 55.25), (84.0, 55.25))
    track(board, ground, pcbnew.F_Cu, (84.0, 55.25), (84.0, 55.975))
    logic_3v3 = board.FindNet("+3V3_DAC")
    track(board, logic_3v3, pcbnew.F_Cu, (86.9, 55.975), (85.0, 55.975), 0.3)
    track(board, ground, pcbnew.F_Cu, (93.1, 55.975), (94.5, 56.15))

    if "--va-only" in sys.argv[2:]:
        pcbnew.SaveBoard(str(path), board)
        return

    # Keep LRCK away from the ESP32 antenna keepout (x=42..59, y=7.5..27.5).
    add_path(
        board,
        "LRCK",
        [(45.01, 5.0), (45.01, 2.5), (62.0, 2.5), (63.0, 30.0), (77.0, 46.0), (82.0, 52.0), (82.5, 53.0), (84.0, 57.925), (86.9, 57.925)],
        pcbnew.F_Cu,
        pcbnew.B_Cu,
    )
    add_path(
        board,
        "+5V_AUDIO",
        [(14.0, 66.0), (14.0, 68.0), (55.0, 76.0), (82.0, 70.0), (96.5, 55.15), (94.5, 55.15)],
        pcbnew.F_Cu,
        pcbnew.B_Cu,
        0.5,
    )

    power_5v = board.FindNet("+5V")
    power_points = [(89.08, 10.0), (92.0, 1.0), (4.37, 1.0), (4.37, 5.0)]
    for start, end in zip(power_points, power_points[1:]):
        track(board, power_5v, pcbnew.B_Cu, start, end, 1.0)

    pcbnew.SaveBoard(str(path), board)


if __name__ == "__main__":
    main()
