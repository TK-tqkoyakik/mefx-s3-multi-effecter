from __future__ import annotations

import csv
import argparse
import json
from pathlib import Path
import sys
import urllib.request

sys.path.append(r"C:\Program Files\KiCad\10.0\bin\Lib\site-packages")
import pcbnew


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "pcb-assembly" / "04_order_package"
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--online", action="store_true", help="LCSC APIも再照合する")
    args = parser.parse_args()
    bom = read_csv(OUT / "UPLOAD_THIS_BOM_04.csv")
    cpl = read_csv(OUT / "UPLOAD_THIS_CPL_04.csv")
    bom_refs = {ref for row in bom for ref in row["Designator"].split(",")}
    cpl_refs = {row["Designator"] for row in cpl}

    board = pcbnew.LoadBoard(str(PCB))
    pcb_smd_refs = {
        footprint.GetReference()
        for footprint in board.GetFootprints()
        if any(pad.GetAttribute() == pcbnew.PAD_ATTRIB_SMD for pad in footprint.Pads())
    }

    errors: list[str] = []
    if bom_refs != cpl_refs or cpl_refs != pcb_smd_refs:
        errors.append(
            f"reference mismatch: BOM-only={sorted(bom_refs-cpl_refs)}, "
            f"CPL-only={sorted(cpl_refs-bom_refs)}, PCB-only={sorted(pcb_smd_refs-cpl_refs)}"
        )

    for row in bom:
        code = row["LCSC Part #"]
        if not code.startswith("C") or not code[1:].isdigit():
            errors.append(f"invalid LCSC part number: {code}")
        if args.online:
            url = f"https://wmsc.lcsc.com/ftps/wm/product/detail?productCode={code}"
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.lcsc.com/"},
            )
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.load(response)
            result = payload.get("result") or {}
            description = " ".join(
                str(result.get(key, "")) for key in ("productModel", "productNameEn", "productKeyAttributes", "encapStandard")
            )
            expected = row["Footprint"].split("_")[-1]
            if expected in {"0402", "0805", "1206"} and expected not in description:
                errors.append(f"{code}: expected package {expected}, got {description}")
            if result.get("productCode") != code:
                errors.append(f"{code}: detail API did not return the requested part")

    required_zip_members = {
        "MEFX04-F_Cu.gtl", "MEFX04-B_Cu.gbl", "MEFX04-F_Mask.gts",
        "MEFX04-B_Mask.gbs", "MEFX04-F_Silkscreen.gto", "MEFX04-B_Silkscreen.gbo",
        "MEFX04-Edge_Cuts.gko", "MEFX04-PTH.drl",
    }
    import zipfile
    with zipfile.ZipFile(OUT / "UPLOAD_THIS_GERBER_04.zip") as archive:
        actual = set(archive.namelist())
    if actual != required_zip_members:
        errors.append(f"Gerber members mismatch: {sorted(actual ^ required_zip_members)}")

    print(f"PCB SMT references: {len(pcb_smd_refs)}")
    print(f"BOM references: {len(bom_refs)}")
    print(f"CPL references: {len(cpl_refs)}")
    print(f"LCSC part numbers checked: {len(bom)} ({'online' if args.online else 'offline'})")
    if errors:
        print("ORDER VERIFY FAILED")
        for error in errors:
            print(f"- {error}")
        return 1
    print("ORDER VERIFY PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
