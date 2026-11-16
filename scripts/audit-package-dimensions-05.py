import csv
from collections import defaultdict
from pathlib import Path

import pcbnew


BOARD = Path("docs/kicad/mefx_s3.kicad_pcb")
BOM = Path("docs/pcb-assembly/05_order_package/UPLOAD_THIS_BOM_05.csv")

board = pcbnew.LoadBoard(str(BOARD))

package_expectations = {
    "R_0805": {"pitch": None, "pad": (1.0, 1.45), "kind": "resistor 0805"},
    "C_0805": {"pitch": None, "pad": (1.0, 1.45), "kind": "capacitor 0805"},
    "C_0402": {"pitch": None, "pad": (0.6, 0.65), "kind": "capacitor 0402"},
    "C_1206": {"pitch": None, "pad": (1.15, 1.8), "kind": "capacitor 1206"},
    "D_SMA_SOD123": {"pitch": None, "pad": (1.6, 1.8), "kind": "SS14 SMA/SOD123-sized local pad"},
    "SOIC-8": {"pitch": 1.27, "pad": (1.5, 0.6), "kind": "SOIC-8"},
    "TSSOP-24_CS4270": {"pitch": 0.65, "pad": (1.7, 0.4), "kind": "TSSOP-24 0.65mm"},
    "SOT-23-5": {"pitch": 0.95, "pad": (1.325, 0.6), "kind": "SOT-23-5/SOT-25"},
}


def refs_from_designator(value):
    return [part.strip() for part in value.split(",") if part.strip()]


def pad_sizes(fp):
    sizes = []
    for pad in fp.Pads():
        sizes.append((round(pad.GetSizeX() / 1e6, 3), round(pad.GetSizeY() / 1e6, 3)))
    return sorted(set(sizes))


with BOM.open(newline="", encoding="utf-8-sig") as handle:
    rows = list(csv.DictReader(handle))

by_footprint = defaultdict(list)
for row in rows:
    for ref in refs_from_designator(row["Designator"]):
        by_footprint[row["Footprint"]].append((ref, row["Comment"], row["LCSC Part #"]))

print("MEFX-S3 PCBA 05 package dimension audit")
print("=======================================")
for fp_name, items in sorted(by_footprint.items()):
    expectation = package_expectations.get(fp_name)
    first_ref = items[0][0]
    fp = board.FindFootprintByReference(first_ref)
    if not fp:
        print(f"NG {fp_name}: missing first ref {first_ref}")
        continue
    sizes = pad_sizes(fp)
    status = "CHECK"
    if expectation:
        expected_pad = tuple(round(v, 3) for v in expectation["pad"])
        status = "OK" if expected_pad in sizes else "REVIEW"
    print(f"{status} {fp_name}: count={len(items)}, example={first_ref}, pads={sizes}")
    if expectation:
        print(f"   expected: {expectation['kind']}, nominal pad includes {expectation['pad']}, pitch={expectation['pitch']}")
    for ref, comment, lcsc in items[:5]:
        print(f"   - {ref}: {comment} / {lcsc}")
    if len(items) > 5:
        print(f"   ... {len(items) - 5} more")
