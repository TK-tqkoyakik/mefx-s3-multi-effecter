from __future__ import annotations

import csv
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "pcb-assembly" / "05_order_package"
DST = ROOT / "docs" / "pcb-assembly" / "07_order_package"

# 07 correction from the JLCPCB full-board preview:
# U1/U2 were still 180 degrees off in 06. 270 degrees places the pin-1 mark on
# the opposite diagonal from the 90-degree attempt while keeping the lead rows
# aligned with the SOIC/TSSOP pads.
ROTATION_OVERRIDES = {
    "U1": 270.0,  # TL072CDT / SOIC-8
    "U2": 270.0,  # CS4270-CZZR / TSSOP-24
    "C36": 90.0,  # local C_0402_V footprint, BOM uses normal C_0402
}


def copy_base_files() -> None:
    if DST.exists():
        shutil.rmtree(DST)
    DST.mkdir(parents=True)

    shutil.copy2(SRC / "UPLOAD_THIS_GERBER_05.zip", DST / "UPLOAD_THIS_GERBER_07.zip")
    shutil.copy2(SRC / "UPLOAD_THIS_BOM_05.csv", DST / "UPLOAD_THIS_BOM_07.csv")

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
            target = DST / name.replace("_05", "_07")
            if source.suffix.lower() in {".txt", ".csv"}:
                text = source.read_text(encoding="utf-8-sig")
                text = text.replace("PCBA 05", "PCBA 07")
                target.write_text(text, encoding="utf-8")
            else:
                shutil.copy2(source, target)


def write_cpl() -> None:
    with (SRC / "UPLOAD_THIS_CPL_05.csv").open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    for row in rows:
        ref = row["Designator"]
        if ref in ROTATION_OVERRIDES:
            row["Rotation"] = f"{ROTATION_OVERRIDES[ref]:.1f}"

    with (DST / "UPLOAD_THIS_CPL_07.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
        writer.writeheader()
        writer.writerows(rows)


def write_notes() -> None:
    readme = """JLCPCBへ送る最終候補データ 07
==============================

この07は、JLCPCBプレビュー画像でU1/U2のPin1マークが反対側に見えたため、
06の90度補正をやめて、U1/U2を270度へ変更したものです。

JLCPCBへアップロードするファイル
--------------------------------
1. UPLOAD_THIS_GERBER_07.zip
2. UPLOAD_THIS_BOM_07.csv
3. UPLOAD_THIS_CPL_07.csv

07のRotation
------------
- U1 TL072CDT: 270.0
- U2 CS4270-CZZR: 270.0
- C36 100nF: 90.0
- U4 AP2112K-3.3: 0.0
- D1 SS14: 0.0

プレビューで見ること
--------------------
- U1のピンク点/Pin1が、基板のPad1側に来ること。
- U2のピンク点/Pin1が、基板のPad1側に来ること。
- U1/U2の足列がSOIC/TSSOPパッドにきれいに乗ること。
- U4の5本足がパッドに乗ること。
- D1の帯が+9V_PROT側に来ること。

注意
----
05と06は使わないでください。
今回の画像を見る限り、06はU1/U2の回転方向が逆でした。
"""
    (DST / "これをJLCPCBに送る.txt").write_text(readme, encoding="utf-8")

    report = [
        "MEFX-S3 PCBA 07 CPL回転補正レポート",
        "==================================",
        "",
        "06のJLCPCBプレビューでU1/U2のPin1が反対側に見えたため、U1/U2を270度に変更。",
        "",
        "補正:",
        "- U1: 90.0 -> 270.0",
        "- U2: 90.0 -> 270.0",
        "- C36: 90.0 維持",
        "- U4: 0.0 維持",
        "- D1: 0.0 維持",
        "",
        "Gerber/BOMは05/06と同じ電気設計。CPL Rotationのみ補正。",
    ]
    (DST / "CPL回転補正レポート_07.txt").write_text("\n".join(report) + "\n", encoding="utf-8")

    orientation_report = """MEFX-S3 PCBA 07 向きあり部品 最終確認レポート
========================================

この07では、JLCPCBプレビューで向きが問題になった部品配置をCPLで補正した。
Gerber/BOMは05の電気的に検証済みデータを使用し、CPL Rotationだけを変更している。

JLCPCBへ送る3ファイル
--------------------
- UPLOAD_THIS_GERBER_07.zip
- UPLOAD_THIS_BOM_07.csv
- UPLOAD_THIS_CPL_07.csv

向き確認が必要な部品
--------------------
- U1: TL072CDT / SOIC-8 / LCSC C6961
- U2: CS4270-CZZR / TSSOP-24 / LCSC C1323229
- U4: AP2112K-3.3TRG1 / SOT-23-5 / LCSC C51118
- D1: SS14 / SMA/SOD123扱い / LCSC C2480

07のCPL Rotation
----------------
- U1: 270.0
- U2: 270.0
- U4: 0.0
- D1: 0.0
- C36: 90.0

06からの変更理由
----------------
06ではU1/U2を90度へ補正したが、JLCPCBの全体プレビュー画像ではPin1マークが反対側に出ていた。
そのため07ではU1/U2を270度へ変更した。これは06から180度反転させる補正。

U1 / TL072CDT
-------------
- ピン1マークが基板Pad1側に来ること。
- 足列がSOIC-8パッド中央付近に乗ること。
- JLCPCBプレビューでまだピン1が反対側に見える場合は決済しない。

U2 / CS4270-CZZR
----------------
- ピン1マークが基板Pad1側に来ること。
- 24本の足がTSSOP-24パッド中央付近に乗ること。
- JLCPCBプレビューでまだピン1が反対側に見える場合は決済しない。

U4 / AP2112K-3.3TRG1
--------------------
- 5本の足がSOT-23-5パッド中央付近に乗ること。
- Pad1=+5V_AUDIO、Pad2=GND、Pad3=+5V_AUDIO、Pad4=NC、Pad5=+3V3_LOGIC。
- U4は前回問題になったフットプリント寸法を05で標準SOT-23-5へ修正済み。

D1 / SS14
---------
- ダイオード本体の帯マークが+9V_PROT側に来ること。
- 帯マークが+9V_RAW側に見える場合は決済しない。

向きを気にしなくてよい部品
--------------------------
- R系の抵抗は極性なし。
- セラミックコンデンサは極性なし。
- MLCCや抵抗が左右反転して見えても、足がパッド中央に乗っていれば通常は問題なし。

最終判断
--------
07で重点確認するのはU1/U2/U4/D1。
特に今回の画像で明確におかしかったU1/U2は、CPL上で270.0へ修正済み。
"""
    (DST / "向きあり部品_最終確認レポート_07.txt").write_text(
        orientation_report, encoding="utf-8"
    )


def main() -> None:
    copy_base_files()
    write_cpl()
    write_notes()
    print(f"Created {DST}")


if __name__ == "__main__":
    main()
