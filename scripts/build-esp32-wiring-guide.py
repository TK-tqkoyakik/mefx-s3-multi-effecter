"""Read KiCad geometry and verify the wiring before rendering the offline guide."""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import shutil
from pathlib import Path

import pcbnew

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/hardware/generated/esp32-wiring-guide"
PCB = ROOT / "docs/kicad/mefx_s3.kicad_pcb"
PHOTO = "board-photo.png"
ROW_A = "5V 14 13 12 11 10 9 46 3 8 18 17 16 15 7 6 5 4 EN 3V3".split()
ROW_B = "GND 19 20 21 47 48 45 0 35 36 37 38 39 40 41 42 2 1 RX TX".split()
SIGNALS = [
    ("power", 1, "+5V", "5V", "5V電源", "#bc3038", "基板 → ESP32", "I2Sではなく電源です。9V・3V3・GPIOへつながない。"),
    ("ground", 21, "GND", "GND", "共通GND", "#333333", "共通", "下列のUSB側から1穴目。電源OFFで基板GNDとの導通を確認。"),
    ("mclk", 12, "MCLK", "17", "基準クロック", "#176bc0", "ESP32 → U2", "ESP32の印字17へ。基板の穴番号12とGPIO17は別の番号。"),
    ("bclk", 18, "BCLK", "4", "ビットクロック", "#087e8b", "ESP32 → U2", "ESP32の印字4へ。穴番号4へつなぐという意味ではありません。"),
    ("lrck", 17, "LRCK", "5", "左右クロック", "#7858a6", "ESP32 → U2", "ESP32の印字5へ。BCLKとは別の信号。"),
    ("adc", 16, "ADC_DOUT", "6", "録音側の音声", "#197b58", "U2 → ESP32", "CS4270からESP32へ入る音声データ。"),
    ("dac", 13, "DAC_DIN", "16", "再生側の音声", "#b25b12", "ESP32 → U2", "ESP32からCS4270へ出す音声データ。ADC側と交換しない。"),
    ("reset", 14, "CODEC_RST", "15", "コーデックRESET", "#a33e81", "ESP32 → U2", "印字15へ。ESP32自身のEN端子には接続しない。"),
    ("switch", 7, "FOOTSW_GPIO", "9", "押しボタン", "#7d6b16", "J4 → ESP32", "外付けボタンはJ4へ。U3ではGPIO9へつながっています。"),
]


def mm(value):
    return round(float(pcbnew.ToMM(value)), 5)


def point(value):
    return [mm(value.x), mm(value.y)]


def esc(value):
    return html.escape(str(value), quote=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--photo", type=Path)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    board = pcbnew.LoadBoard(str(PCB))
    fps = {fp.GetReference(): fp for fp in board.GetFootprints()}
    u3 = {int(pad.GetNumber()): pad for pad in fps["U3"].Pads()}
    assert len(u3) == 40
    assert fps["U3"].GetOrientationDegrees() == 0
    for number, pad in u3.items():
        assert point(pad.GetPosition()) == [round(4.37 + ((number - 1) % 20) * 2.54, 5), 5.0 if number <= 20 else 30.4]
    external_nets = {"U5": ["+9V_PROT", "GND", "+5V"], "J1": ["+9V_RAW", "GND"],
                     "J2": ["INPUT_TIP", "GND"], "J3": ["MIC_BIAS", "GND"],
                     "J4": ["FOOTSW_GPIO", "GND"], "J5": ["OUTPUT_TIP", "GND"]}
    for ref, nets in external_nets.items():
        actual = {int(p.GetNumber()): p.GetNetname() for p in fps[ref].Pads()}
        assert [actual[i] for i in range(1, len(nets) + 1)] == nets, ref
    firmware = (ROOT / "firmware/components/audio_io/audio_io.c").read_text(encoding="utf-8")
    switch = (ROOT / "firmware/components/switch_control/switch_control.c").read_text(encoding="utf-8")
    macros = dict(re.findall(r"#define\s+(\w+)\s+GPIO_NUM_(\d+)", firmware + "\n" + switch))
    expected = {"I2S_MCLK": "17", "I2S_ADC_BCLK": "4", "I2S_ADC_WS": "5", "I2S_ADC_DIN": "6", "I2S_DAC_DOUT": "16", "CODEC_RESET": "15"}
    for key, gpio in expected.items():
        assert macros.get(key) == gpio, (key, macros.get(key))
    assert "GPIO_NUM_9" in switch
    with (ROOT / "docs/pcb-assembly/07_order_package/全パッド接続一覧_07.csv").open(encoding="utf-8-sig", newline="") as f:
        audit = {int(row["Pad"]): row["Net"] for row in csv.DictReader(f) if row["Reference"] == "U3"}
    signals = []
    for sid, pad, net, label, title, color, direction, note in SIGNALS:
        assert u3[pad].GetNetname() == net, (pad, net)
        assert audit[pad] == net, ("07 CSV differs", pad)
        assert (ROW_A + ROW_B)[pad - 1] == label
        signals.append(dict(id=sid, pad=pad, net=net, label=label, title=title, color=color,
                            direction=direction, note=note, pos=point(u3[pad].GetPosition()),
                            row="上列" if pad <= 20 else "下列", ordinal=(pad - 1) % 20 + 1))
    assert {n for n, p in u3.items() if p.GetNetname()} == {s[1] for s in SIGNALS}
    assert not u3[20].GetNetname(), "ESP32 3V3 must remain unconnected"
    pads = []
    parts = []
    for ref, fp in fps.items():
        parts.append(dict(ref=ref, value=fp.GetValue(), pos=point(fp.GetPosition()), rotation=fp.GetOrientationDegrees()))
        for pad in fp.Pads():
            pads.append(dict(ref=ref, number=pad.GetNumber(), net=pad.GetNetname(), pos=point(pad.GetPosition()),
                             size=point(pad.GetSize()), drill=point(pad.GetDrillSize()),
                             rotation=pad.GetOrientationDegrees(), rect=pad.GetShape() == pcbnew.PAD_SHAPE_RECT))
    tracks = []
    for track in board.GetTracks():
        if isinstance(track, pcbnew.PCB_TRACK) and not isinstance(track, pcbnew.PCB_VIA) and track.GetLayer() == pcbnew.F_Cu:
            tracks.append(dict(start=point(track.GetStart()), end=point(track.GetEnd()), width=mm(track.GetWidth())))
    if args.photo:
        shutil.copyfile(args.photo, OUT / PHOTO)
    assert (OUT / PHOTO).exists(), "Supply the user's physical-board photograph with --photo"
    payload = dict(width=150, height=90, pads=pads, parts=parts, tracks=tracks, signals=signals,
                   rows=[ROW_A, ROW_B], photo=PHOTO, pcbSha256=hashlib.sha256(PCB.read_bytes()).hexdigest(),
                   source="docs/kicad/mefx_s3.kicad_pcb", revision="07_order_package",
                   pinoutUrl="https://github.com/Freenove/Freenove_ESP32_S3_WROOM_Board_Lite/blob/main/ESP32S3_Lite_Pinout.png")
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    (OUT / "wiring-data.js").write_text("window.MEFX_WIRING_DATA=" + serialized + ";\n", encoding="utf-8")
    template = (ROOT / "docs/hardware/wiring-viewer/index.html").read_text(encoding="utf-8")
    guide = ROOT / "docs/hardware/18_基板とESP32_画像配線ガイド.html"
    guide.write_text(template, encoding="utf-8")
    report = ["MEFX-S3 画像配線ガイド 検証記録", "", "基板・07接続CSV・現行ファームウェアを照合。9接続すべて一致。",
              "U3: 40パッド、2.54mmピッチ、列間25.4mm、表面、USB左。",
              "U3-20 (ESP32 3V3) は未接続。U4の3.3V出力と追加接続しない。",
              "基板SHA256: " + payload["pcbSha256"], "", "接続:"]
    report.extend(f"U3-{s['pad']} / {s['net']} -> ESP32 {s['label']} ({s['row']} USB側から{s['ordinal']}穴目)" for s in signals)
    report.extend(["", "実物写真で確認した範囲: USB左、アンテナ右、端子印字が設計の並びと整合。",
                   "未確認: 裏面のはんだ、ソケットへの挿入、導通、電圧、起動、音出し。",
                   "3Dは取り付け説明用の簡略モデル。ソケット高さ・外形の実測や干渉保証ではない。",
                   "USB給電だけで完成回路を駆動する案内ではない。書込み時は基板からESP32を外す。"])
    (OUT / "検証記録.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(guide)
    print("PASS: 40 pads / 9 connections / firmware GPIO / audit CSV / 3V3 isolation")


if __name__ == "__main__":
    main()
