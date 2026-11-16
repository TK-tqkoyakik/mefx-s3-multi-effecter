from __future__ import annotations

import csv
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "pcb-assembly" / "05_order_package"
DST = ROOT / "docs" / "pcb-assembly" / "06_order_package"

# JLCPCB part models do not always use the same zero-degree orientation as the
# local KiCad footprints. These offsets are based on the JLC preview issue where
# SOP/TSSOP models appeared turned against the PCB pads.
ROTATION_OVERRIDES = {
    "U1": 90.0,  # TL072CDT / SOIC-8
    "U2": 90.0,  # CS4270-CZZR / TSSOP-24
    "C36": 90.0,  # local C_0402_V footprint, BOM uses normal C_0402
}


def copy_base_files() -> None:
    if DST.exists():
        shutil.rmtree(DST)
    DST.mkdir(parents=True)

    shutil.copy2(SRC / "UPLOAD_THIS_GERBER_05.zip", DST / "UPLOAD_THIS_GERBER_06.zip")
    shutil.copy2(SRC / "UPLOAD_THIS_BOM_05.csv", DST / "UPLOAD_THIS_BOM_06.csv")

    for name in [
        "DRC_full_connection_recheck_05.txt",
        "ERC_full_connection_recheck_05.txt",
        "全部品接続検証レポート_05.txt",
        "全パッド接続一覧_05.csv",
        "全接続監査サマリー_05.txt",
        "向きあり部品_最終確認レポート_05.txt",
        "全部品接続_最終監査_05.txt",
    ]:
        source = SRC / name
        if source.exists():
            shutil.copy2(source, DST / name.replace("_05", "_06"))


def write_cpl() -> None:
    with (SRC / "UPLOAD_THIS_CPL_05.csv").open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    for row in rows:
        ref = row["Designator"]
        if ref in ROTATION_OVERRIDES:
            row["Rotation"] = f"{ROTATION_OVERRIDES[ref]:.1f}"

    with (DST / "UPLOAD_THIS_CPL_06.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
        writer.writeheader()
        writer.writerows(rows)


def write_readme() -> None:
    text = """MEFX-S3 JLCPCB 再注文データ 06
================================

06は、05の電気設計を維持したまま、JLCPCBプレビューで向きがずれて見えた部品の
CPL Rotationを補正した注文用パッケージです。

JLCPCBへアップロードする最終ファイル
------------------------------------
1. UPLOAD_THIS_GERBER_06.zip
2. UPLOAD_THIS_BOM_06.csv
3. UPLOAD_THIS_CPL_06.csv

05からの変更点
--------------
Gerber: 変更なし
BOM: 変更なし
CPL: 次のRotationを補正

- U1 TL072CDT / SOIC-8: 0.0 -> 90.0
- U2 CS4270-CZZR / TSSOP-24: 0.0 -> 90.0
- C36 100nF / C_0402_V: 0.0 -> 90.0

変更していない向きあり部品
--------------------------
- U4 AP2112K-3.3 / SOT-23-5: Rotation 0.0 のまま
- D1 SS14 / SMA: Rotation 0.0 のまま

注文前の必須確認
----------------
JLCPCBの部品配置プレビューで、決済前に必ず確認してください。

1. U2の足がTSSOP-24パッド中央に重なる。
2. U2のPin1マークがPad1側。
3. U1の足がSOIC-8パッド中央に重なる。
4. U1のPin1マークがPad1側。
5. U4の5本足がSOT-23-5パッド中央に重なる。
6. U4のPin1マークがPad1側。
7. D1の帯マークが+9V_PROT側。
8. C36が小さい縦向きパッドに重なる。

もしまだズレて見える場合
------------------------
決済せず、その部品が大きく見えるスクリーンショットを送ってください。
CPLのRotationだけを再補正します。
"""
    (DST / "注文用README_06.txt").write_text(text, encoding="utf-8")


def write_rotation_report() -> None:
    with (DST / "UPLOAD_THIS_CPL_06.csv").open(encoding="utf-8", newline="") as handle:
        rows = {row["Designator"]: row for row in csv.DictReader(handle)}

    lines = [
        "MEFX-S3 PCBA 06 CPL回転補正レポート",
        "==================================",
        "",
        "JLCPCBプレビューで向きがずれて見えた部品に対して、CPL Rotationを補正した。",
        "",
        "補正対象",
        "--------",
    ]
    for ref in sorted(ROTATION_OVERRIDES):
        row = rows[ref]
        lines.append(f"- {ref}: Rotation {row['Rotation']}, X={row['Mid X']}, Y={row['Mid Y']}, {row['Layer']}")
    lines += [
        "",
        "未補正のまま確認する部品",
        "----------------------",
        f"- U4: Rotation {rows['U4']['Rotation']}。SOT-23-5の足位置をJLCPCB画面で確認する。",
        f"- D1: Rotation {rows['D1']['Rotation']}。カソード帯が+9V_PROT側か確認する。",
        "",
        "判定",
        "----",
        "06をJLCPCBへアップロードし、2D/3Dプレビューで上記を確認してから決済する。",
    ]
    (DST / "CPL回転補正レポート_06.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    copy_base_files()
    write_cpl()
    write_readme()
    write_rotation_report()
    print(f"Created {DST}")


if __name__ == "__main__":
    main()
