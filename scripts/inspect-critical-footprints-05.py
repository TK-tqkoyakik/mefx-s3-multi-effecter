import pcbnew


board = pcbnew.LoadBoard("docs/kicad/mefx_s3.kicad_pcb")

for ref in ["U1", "U2", "U4", "D1"]:
    fp = board.FindFootprintByReference(ref)
    if fp is None:
        print(f"{ref}: MISSING")
        continue
    fpid = fp.GetFPID()
    print(f"{ref}: {fpid.GetLibNickname()}:{fpid.GetLibItemName()} rot={fp.GetOrientationDegrees():.1f}")
    rows = []
    for pad in fp.Pads():
        rows.append(
            (
                pad.GetNumber(),
                pad.GetNetname() or "NC",
                pad.GetSizeX() / 1e6,
                pad.GetSizeY() / 1e6,
                (pad.GetPosition().x - fp.GetPosition().x) / 1e6,
                (pad.GetPosition().y - fp.GetPosition().y) / 1e6,
            )
        )
    for number, net, sx, sy, dx, dy in sorted(rows, key=lambda item: item[0]):
        print(f"  pad {number}: {net:18s} size={sx:.3f}x{sy:.3f} offset=({dx:.3f},{dy:.3f})")
