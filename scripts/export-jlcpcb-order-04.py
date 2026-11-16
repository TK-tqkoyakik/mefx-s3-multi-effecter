from __future__ import annotations

import csv
import shutil
import subprocess
import zipfile
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"
OUT = ROOT / "docs" / "pcb-assembly" / "04_order_package"
GERBER = OUT / "gerber"
KICAD = Path(r"C:\Program Files\KiCad\10.0\bin\kicad-cli.exe")


# Value/package -> verified, in-stock JLCPCB/LCSC catalog part.
PASSIVES = {
    ("0R", "R_0805"): ("C17477", "UNI-ROYAL 0805W8F0000T5E"),
    ("10R", "R_0805"): ("C17415", "UNI-ROYAL 0805W8F100JT5E"),
    ("470R", "R_0805"): ("C17710", "UNI-ROYAL 0805W8F4700T5E"),
    ("1k", "R_0805"): ("C17513", "UNI-ROYAL 0805W8F1001T5E"),
    ("2k", "R_0805"): ("C17604", "UNI-ROYAL 0805W8F2001T5E"),
    ("2.2k", "R_0805"): ("C17520", "UNI-ROYAL 0805W8F2201T5E"),
    ("10k", "R_0805"): ("C17414", "UNI-ROYAL 0805W8F1002T5E"),
    ("47k", "R_0805"): ("C17713", "UNI-ROYAL 0805W8F4702T5E"),
    ("100k", "R_0805"): ("C149504", "UNI-ROYAL 0805W8F1003T5E"),
    ("1M", "R_0805"): ("C17514", "UNI-ROYAL 0805W8F1004T5E"),
    ("100nF", "C_0805"): ("C49678", "YAGEO CC0805KRX7R9BB104"),
    ("100nF", "C_0805_V"): ("C49678", "YAGEO CC0805KRX7R9BB104"),
    ("100nF", "C_0402"): ("C307331", "Samsung CL05B104KB54PNC"),
    ("100nF", "C_0402_V"): ("C307331", "Samsung CL05B104KB54PNC"),
    ("1uF", "C_0805"): ("C28323", "Samsung CL21B105KBFNNNE"),
    ("1uF", "C_1206"): ("C1848", "Samsung CL31B105KBHNNNE"),
    ("220pF C0G", "C_0805"): ("C61747", "Samsung CL21C221JBANNNC"),
    ("3.3nF C0G", "C_0805"): ("C77062", "Murata GRM2165C1H332JA01D"),
    ("47uF 10V X5R", "C_1206"): ("C96123", "Samsung CL31A476MPHNNNE"),
    ("10uF 25V X7R", "C_1206"): ("C9807", "Samsung CL31A106KAHNNNE"),
    ("10uF 25V X7R", "C_1206_V"): ("C9807", "Samsung CL31A106KAHNNNE"),
}

SPECIAL = {
    "D1": ("C2480", "SS14", "D_SMA_SOD123"),
    "U1": ("C6961", "TL072CDT", "SOIC-8"),
    "U2": ("C1323229", "CS4270-CZZR", "TSSOP-24_CS4270"),
    "U4": ("C51118", "AP2112K-3.3", "SOT-23-5"),
}


def run(*args: str) -> None:
    result = subprocess.run(args, cwd=ROOT, text=True)
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(args)}")


def read_pos(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def write_bom_and_cpl(position_path: Path) -> None:
    rows = read_pos(position_path)
    groups: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    cpl_rows: list[list[str]] = []

    for row in rows:
        ref, value, package = row["Ref"], row["Val"], row["Package"]
        if ref in SPECIAL:
            lcsc, comment, footprint = SPECIAL[ref]
        else:
            key = (value, package)
            if key not in PASSIVES:
                raise RuntimeError(f"No approved LCSC mapping for {ref}: {key}")
            lcsc, comment = PASSIVES[key]
            footprint = package
        # Orientation-specific local footprints describe placement only. JLC's
        # BOM must contain one row per physical LCSC part, otherwise duplicate
        # rows can be matched with quantity zero.
        bom_footprint = footprint.removesuffix("_V")
        groups[(comment, bom_footprint, lcsc)].append(ref)
        cpl_rows.append([
            ref,
            f'{float(row["PosX"]):.3f}mm',
            f'{float(row["PosY"]):.3f}mm',
            "Top",
            f'{float(row["Rot"]):.1f}',
        ])

    with (OUT / "UPLOAD_THIS_BOM_04.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["Comment", "Designator", "Footprint", "LCSC Part #"])
        for (comment, footprint, lcsc), refs in sorted(groups.items()):
            writer.writerow([comment, ",".join(sorted(refs)), footprint, lcsc])

    with (OUT / "UPLOAD_THIS_CPL_04.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
        writer.writerows(sorted(cpl_rows))

def copy_support_files() -> None:
    case_out = OUT / "case_3d_print"
    case_out.mkdir()
    case_src = ROOT / "docs" / "case-jlc3dp"
    for name in ["mefx_case_bottom_jlc3dp.stl", "mefx_case_lid_jlc3dp.stl", "README.txt", "04_ケース寸法検証.txt"]:
        shutil.copy2(case_src / name, case_out / name)

    hand_solder = """MEFX-S3 手はんだ・機構部品 04
================================

所持済み
- Freenove ESP32-S3 Board Lite B0FRRH9NCP x1

基板へ取り付ける部品
- R-78E5.0-1.0 固定5V DC/DC SIP-3 x1
- 1x20ピン 2.54mmピッチ ロープロファイル雌ソケット x2
- KF128-2P 2.54mmピッチ 2極ねじ端子台 x5

ケースへ取り付ける部品
- REAN NYS229相当 6.35mmモノラル・パネルジャック（ねじ部外径9.5mm以下）x2
- DC-022B相当 5.5/2.1mmパネルDCジャック（ねじ部外径8.2mm以下）x1
- M12 モーメンタリーNOフットスイッチ（取付穴12.4mm、ねじ軸長8mm以上）x1
- 2線式エレクトレットマイクカプセル 6x5mm x1
- AWG24撚り線、熱収縮チューブ 適量

ケース固定
- M3用熱圧入インサートナット 外径4.6mm以下・長さ5mm x8
- M3x12mm なべねじ x4（フタ）
- M3x6mm なべねじ x4（基板）

重要
- 9V電源はセンターマイナス、安定化済み、1A以上を使用する。
- ジャックとスイッチはねじ部外径と3mm厚パネル対応を商品図で確認してから購入する。
"""
    (OUT / "手はんだ購入部品_04.txt").write_text(hand_solder, encoding="utf-8")

    readme = """MEFX-S3 JLCPCB/JLC3DP 注文データ 04
======================================

JLCPCBへアップロード
1. UPLOAD_THIS_GERBER_04.zip をPCB見積ページへアップロードする。
2. PCB Assemblyを有効にし、UPLOAD_THIS_BOM_04.csv とUPLOAD_THIS_CPL_04.csvを指定する。
3. 部品照合画面で全SMT部品が一致することを確認する。

JLC3DPへアップロード
- case_3d_print/mefx_case_bottom_jlc3dp.stl
- case_3d_print/mefx_case_lid_jlc3dp.stl
上下を別部品として各1個注文する。

推奨の安価設定
- PCB: 2層、FR-4、1.6mm、1oz銅、HASL lead free、緑、5枚
- PCBA: Top side、Economic、5枚すべて実装、JLCPCB parts、Tooling holesはJLC側追加可
- ケース: 初回寸法確認はSLA Standard Resin。踏み込み試験後はMJF PA12を推奨。

注文画面で確定した主要部品
- 10uF: C9807 / Samsung CL31A106KAHNNNE / 25V X5R 1206
- 100nF: C49678 / YAGEO CC0805KRX7R9BB104 / 50V X7R 0805
- PCBA数量を変更した直後は、2を選んでから目的の数量へ戻し、部品数量が0でないことを確認する。

発注前条件
- drc_report_04.txt が違反0、未配線0であること。
- 注文画面の部品向きプレビューでU1/U_CODEC/U_LDO/D1を目視確認する。
- 初回はケースと基板を各最小数量にし、実物合わせ後に量産する。
"""
    (OUT / "注文用README_04.txt").write_text(readme, encoding="utf-8")


def main() -> None:
    if not KICAD.exists() or not PCB.exists():
        raise FileNotFoundError("KiCad CLI or PCB file is missing")
    if OUT.exists():
        shutil.rmtree(OUT)
    GERBER.mkdir(parents=True)

    drc = OUT / "drc_report_04.txt"
    run(str(KICAD), "pcb", "drc", "--refill-zones", "--save-board", "--output", str(drc), "--format", "report", str(PCB))
    report = drc.read_text(encoding="utf-8")
    for required in ["** Found 0 DRC violations **", "** Found 0 unconnected pads **"]:
        if required not in report:
            raise RuntimeError(f"Order export stopped: DRC gate failed ({required})")

    run(str(KICAD), "pcb", "export", "gerbers", "--output", str(GERBER), "--layers", "F.Cu,B.Cu,F.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts", str(PCB))
    run(str(KICAD), "pcb", "export", "drill", "--output", str(GERBER), "--format", "excellon", "--excellon-units", "mm", str(PCB))
    pos = OUT / "kicad_smd_position.csv"
    run(str(KICAD), "pcb", "export", "pos", "--output", str(pos), "--format", "csv", "--units", "mm", "--side", "front", "--smd-only", str(PCB))
    write_bom_and_cpl(pos)

    # Conservative JLCPCB parser package: only fabrication layers, ASCII names,
    # and the widely recognized .gko outline extension.
    compatibility_names = {
        "mefx_s3-F_Cu.gtl": "MEFX04-F_Cu.gtl",
        "mefx_s3-B_Cu.gbl": "MEFX04-B_Cu.gbl",
        "mefx_s3-F_Mask.gts": "MEFX04-F_Mask.gts",
        "mefx_s3-B_Mask.gbs": "MEFX04-B_Mask.gbs",
        "mefx_s3-F_Silkscreen.gto": "MEFX04-F_Silkscreen.gto",
        "mefx_s3-B_Silkscreen.gbo": "MEFX04-B_Silkscreen.gbo",
        "mefx_s3-Edge_Cuts.gm1": "MEFX04-Edge_Cuts.gko",
        "mefx_s3.drl": "MEFX04-PTH.drl",
    }
    compatibility_zip = OUT / "UPLOAD_THIS_GERBER_04.zip"
    with zipfile.ZipFile(compatibility_zip, "w", zipfile.ZIP_DEFLATED) as archive:
        for source_name, archive_name in compatibility_names.items():
            archive.write(GERBER / source_name, archive_name)
    copy_support_files()
    shutil.rmtree(GERBER)
    pos.unlink()
    print(f"Order package created: {OUT}")


if __name__ == "__main__":
    main()
