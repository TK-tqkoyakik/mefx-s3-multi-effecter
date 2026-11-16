import csv
from collections import defaultdict
from pathlib import Path

import pcbnew


BOARD = Path("docs/kicad/mefx_s3.kicad_pcb")
BOM = Path("docs/pcb-assembly/05_order_package/UPLOAD_THIS_BOM_05.csv")
OUT = Path("docs/pcb-assembly/05_order_package/全パッド接続一覧_05.csv")
SUMMARY = Path("docs/pcb-assembly/05_order_package/全接続監査サマリー_05.txt")


def ref_key(ref: str):
    prefix = "".join(ch for ch in ref if not ch.isdigit())
    number = "".join(ch for ch in ref if ch.isdigit())
    return prefix, int(number or 0), ref


def get_fpid(fp):
    fpid = fp.GetFPID()
    return f"{fpid.GetLibNickname()}:{fpid.GetLibItemName()}"


def load_bom_refs():
    refs = set()
    if not BOM.exists():
        return refs
    with BOM.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            for ref in row["Designator"].split(","):
                ref = ref.strip()
                if ref:
                    refs.add(ref)
    return refs


board = pcbnew.LoadBoard(str(BOARD))
bom_refs = load_bom_refs()

rows = []
net_to_pads = defaultdict(list)
footprints = sorted(board.GetFootprints(), key=lambda fp: ref_key(fp.GetReference()))

for fp in footprints:
    ref = fp.GetReference()
    value = fp.GetValue()
    fpid = get_fpid(fp)
    side = "Top" if fp.IsFlipped() is False else "Bottom"
    smt_in_bom = "yes" if ref in bom_refs else "no"
    for pad in sorted(fp.Pads(), key=lambda p: p.GetNumber()):
        net = pad.GetNetname() or "NO_NET"
        pad_type = str(pad.GetAttribute()).split(".")[-1]
        row = {
            "Reference": ref,
            "Value": value,
            "Footprint": fpid,
            "Side": side,
            "In_BOM_05": smt_in_bom,
            "Pad": pad.GetNumber(),
            "Net": net,
            "Pad_Size_mm": f"{pad.GetSizeX()/1e6:.3f}x{pad.GetSizeY()/1e6:.3f}",
            "Pad_Offset_mm": f"{(pad.GetPosition().x-fp.GetPosition().x)/1e6:.3f},{(pad.GetPosition().y-fp.GetPosition().y)/1e6:.3f}",
            "Pad_Type": pad_type,
        }
        rows.append(row)
        net_to_pads[net].append((ref, pad.GetNumber()))

OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open("w", newline="", encoding="utf-8-sig") as handle:
    writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

single_pad_nets = []
no_net_pads = []
for net, pads in sorted(net_to_pads.items()):
    if net == "NO_NET":
        no_net_pads.extend(pads)
    elif len(pads) == 1 and not net.startswith("unconnected-"):
        single_pad_nets.append((net, pads[0]))

with SUMMARY.open("w", encoding="utf-8") as handle:
    handle.write("MEFX-S3 PCBA 05 全接続監査サマリー\n")
    handle.write("===================================\n\n")
    handle.write(f"Footprints: {len(footprints)}\n")
    handle.write(f"Pads: {len(rows)}\n")
    handle.write(f"Nets: {len(net_to_pads)}\n")
    handle.write(f"SMT refs in BOM: {len(bom_refs)}\n")
    handle.write(f"Single-pad named nets: {len(single_pad_nets)}\n")
    handle.write(f"NO_NET pads: {len(no_net_pads)}\n\n")

    handle.write("BOMに入るSMT部品\n")
    handle.write("----------------\n")
    for ref in sorted(bom_refs, key=ref_key):
        fp = board.FindFootprintByReference(ref)
        if fp:
            handle.write(f"{ref}: {fp.GetValue()} / {get_fpid(fp)}\n")
        else:
            handle.write(f"{ref}: MISSING ON PCB\n")

    handle.write("\nSingle-pad named nets\n")
    handle.write("---------------------\n")
    if not single_pad_nets:
        handle.write("なし\n")
    for net, (ref, pad) in single_pad_nets:
        handle.write(f"{net}: {ref} pad {pad}\n")

    handle.write("\nNO_NET pads\n")
    handle.write("-----------\n")
    if not no_net_pads:
        handle.write("なし\n")
    for ref, pad in sorted(no_net_pads, key=lambda item: ref_key(item[0]) + (item[1],)):
        handle.write(f"{ref} pad {pad}\n")

print(f"Wrote {OUT}")
print(f"Wrote {SUMMARY}")
