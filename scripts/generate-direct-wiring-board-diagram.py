from __future__ import annotations

import html
from pathlib import Path

import pcbnew


ROOT = Path(__file__).resolve().parents[1]
PCB_PATH = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"
OUT_DIR = ROOT / "docs" / "hardware" / "generated"
OUT_SVG = OUT_DIR / "MEFX-S3_直配線_書き込み図.svg"
OUT_HTML = OUT_DIR / "MEFX-S3_直配線_書き込み図.html"
OUT_R78 = OUT_DIR / "MEFX-S3_R78向き拡大図.svg"


def mm(value) -> float:
    return float(pcbnew.ToMM(value))


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def rotate(x: float, y: float, degrees: float) -> tuple[float, float]:
    import math

    rad = math.radians(degrees)
    c = math.cos(rad)
    s = math.sin(rad)
    return x * c - y * s, x * s + y * c


def rect(x, y, w, h, fill, stroke="none", sw=0.2, rx=0.5, extra=""):
    return (
        f'<rect x="{x:.3f}" y="{y:.3f}" width="{w:.3f}" height="{h:.3f}" '
        f'rx="{rx:.3f}" ry="{rx:.3f}" fill="{fill}" stroke="{stroke}" '
        f'stroke-width="{sw}" {extra}/>'
    )


def circle(cx, cy, r, fill, stroke="none", sw=0.2, extra=""):
    return (
        f'<circle cx="{cx:.3f}" cy="{cy:.3f}" r="{r:.3f}" fill="{fill}" '
        f'stroke="{stroke}" stroke-width="{sw}" {extra}/>'
    )


def line(x1, y1, x2, y2, color, sw=0.6, extra=""):
    return (
        f'<line x1="{x1:.3f}" y1="{y1:.3f}" x2="{x2:.3f}" y2="{y2:.3f}" '
        f'stroke="{color}" stroke-width="{sw}" stroke-linecap="round" {extra}/>'
    )


def text(x, y, value, size=2.6, fill="#172126", weight="700", anchor="start", extra=""):
    return (
        f'<text x="{x:.3f}" y="{y:.3f}" font-family="Meiryo, Yu Gothic, Arial, sans-serif" '
        f'font-size="{size:.2f}" font-weight="{weight}" text-anchor="{anchor}" '
        f'fill="{fill}" {extra}>{esc(value)}</text>'
    )


def multiline_box(x, y, lines, color="#172126", fill="#ffffff", title_color=None, width=None):
    title_color = title_color or color
    line_h = 3.7
    pad_x = 2.4
    pad_y = 2.6
    estimated = max(len(s) for s in lines) * 1.75 + pad_x * 2
    w = width or max(24, estimated)
    h = pad_y * 2 + line_h * len(lines)
    out = [
        rect(x, y, w, h, fill, color, 0.45, 1.5, 'filter="url(#shadow)"'),
        rect(x, y, 2.2, h, color, color, 0, 1.5),
    ]
    for i, s in enumerate(lines):
        out.append(
            text(
                x + pad_x + 1.6,
                y + pad_y + 2.6 + i * line_h,
                s,
                2.45 if i else 2.7,
                title_color if i == 0 else "#172126",
                "800" if i == 0 else "600",
            )
        )
    return "\n".join(out), (x, y, w, h)


def parse_board():
    board = pcbnew.LoadBoard(str(PCB_PATH))
    footprints = {fp.GetReference(): fp for fp in board.GetFootprints()}
    return board, footprints


def pad_center(fp, pad_name: str) -> tuple[float, float]:
    for pad in fp.Pads():
        if pad.GetNumber() == pad_name:
            pos = pad.GetPosition()
            return mm(pos.x), mm(pos.y)
    raise KeyError(f"{fp.GetReference()} pad {pad_name}")


def pad_size(pad) -> tuple[float, float]:
    size = pad.GetSize()
    return mm(size.x), mm(size.y)


def draw_tracks(board):
    out = []
    for item in board.GetTracks():
        if item.GetLayer() != pcbnew.F_Cu:
            continue
        cls_name = item.__class__.__name__
        if cls_name == "PCB_VIA":
            p = item.GetPosition()
            d = mm(item.GetWidth())
            out.append(circle(mm(p.x), mm(p.y), d / 2, "#1f6f3d", "#134d2b", 0.08, 'opacity="0.45"'))
            continue
        if hasattr(item, "GetStart") and hasattr(item, "GetEnd"):
            s = item.GetStart()
            e = item.GetEnd()
            w = max(mm(item.GetWidth()), 0.2)
            out.append(line(mm(s.x), mm(s.y), mm(e.x), mm(e.y), "#1f6f3d", w, 'opacity="0.38"'))
    return "\n".join(out)


def draw_pads(board, target_refs):
    out = []
    for fp in board.GetFootprints():
        ref = fp.GetReference()
        for pad in fp.Pads():
            pos = pad.GetPosition()
            x, y = mm(pos.x), mm(pos.y)
            w, h = pad_size(pad)
            is_th = pad.GetAttribute() in (pcbnew.PAD_ATTRIB_PTH, pcbnew.PAD_ATTRIB_NPTH)
            stroke = "#f5f2d2" if ref in target_refs else "#cfc586"
            fill = "#d6bc4f" if not is_th else "#dedede"
            if is_th:
                out.append(circle(x, y, max(w, h) / 2, fill, stroke, 0.18))
                drill = pad.GetDrillSize()
                drill_d = max(mm(drill.x), mm(drill.y), 0.65)
                out.append(circle(x, y, drill_d / 2, "#1d1d1d", "none", 0))
            else:
                out.append(
                    rect(
                        x - w / 2,
                        y - h / 2,
                        w,
                        h,
                        fill,
                        stroke,
                        0.1,
                        min(w, h) * 0.18,
                        'opacity="0.95"',
                    )
                )
    return "\n".join(out)


def highlight_pad(fp, pad_no, color, label, dx=0, dy=-3.2):
    x, y = pad_center(fp, str(pad_no))
    return "\n".join(
        [
            circle(x, y, 1.75, "none", color, 0.65),
            circle(x, y, 0.52, color, "white", 0.12),
            text(x + dx, y + dy, label, 2.35, color, "900", "middle"),
        ]
    )


def callout(fp, pad_no, box, color):
    px, py = pad_center(fp, str(pad_no))
    bx, by, bw, bh = box
    # Connect to the closest side of the label box.
    tx = bx if px < bx else bx + bw if px > bx + bw else bx + bw / 2
    ty = by + bh / 2
    return "\n".join(
        [
            line(px, py, tx, ty, color, 0.55, 'stroke-dasharray="1.4 1.1"'),
            circle(px, py, 1.25, "none", color, 0.45),
        ]
    )


def draw_r78_main(fp_u5):
    p1 = pad_center(fp_u5, "1")
    p2 = pad_center(fp_u5, "2")
    p3 = pad_center(fp_u5, "3")
    x1 = min(p1[0], p3[0]) - 2.0
    y1 = p1[1] + 2.6
    out = [
        rect(x1, y1, 9.2, 9.6, "#20242a", "#ffffff", 0.25, 0.7, 'opacity="0.92"'),
        text(x1 + 4.6, y1 + 4.2, "R-78E", 1.9, "#ffffff", "800", "middle"),
        text(x1 + 4.6, y1 + 7.1, "印字面", 1.5, "#dbeafe", "700", "middle"),
    ]
    for x, y, c in [(p1[0], p1[1], "#e53935"), (p2[0], p2[1], "#111111"), (p3[0], p3[1], "#f59e0b")]:
        out.append(line(x, y + 0.9, x, y1, c, 0.55))
    out.append(text(p1[0], p1[1] - 4.4, "1 VIN", 2.1, "#e53935", "900", "middle"))
    out.append(text(p2[0], p2[1] - 4.4, "2 GND", 2.1, "#111111", "900", "middle"))
    out.append(text(p3[0], p3[1] - 4.4, "3 +5V", 2.1, "#f59e0b", "900", "middle"))
    out.append(text(x1 + 4.6, y1 + 12.8, "本体は基板中央側", 2.05, "#111827", "900", "middle"))
    return "\n".join(out)


def r78_inset_svg():
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="980" height="640" viewBox="0 0 98 64">
<defs>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
<feDropShadow dx="0.8" dy="1.2" stdDeviation="0.9" flood-color="#000000" flood-opacity="0.24"/>
</filter>
</defs>
{rect(2, 2, 94, 60, "#f7fafc", "#172126", 0.35, 2.0)}
{text(49, 9, "R-78E5.0-1.0 の向き", 4.2, "#172126", "900", "middle")}
{text(49, 15, "足を下、印字面を正面に見る", 3.0, "#334155", "700", "middle")}
{rect(31, 21, 36, 18, "#20242a", "#111827", 0.5, 1.0, 'filter="url(#shadow)"')}
{text(49, 29, "RECOM", 4.2, "#ffffff", "900", "middle")}
{text(49, 35, "R-78E5.0-1.0", 2.7, "#dbeafe", "800", "middle")}
{rect(36, 39, 3, 11, "#c9c9c9", "#555", 0.25, 0.3)}
{rect(48, 39, 3, 11, "#c9c9c9", "#555", 0.25, 0.3)}
{rect(60, 39, 3, 11, "#c9c9c9", "#555", 0.25, 0.3)}
{text(37.5, 55, "1", 4.0, "#e53935", "900", "middle")}
{text(49.5, 55, "2", 4.0, "#111111", "900", "middle")}
{text(61.5, 55, "3", 4.0, "#f59e0b", "900", "middle")}
{text(37.5, 60, "+Vin", 2.8, "#e53935", "900", "middle")}
{text(49.5, 60, "GND", 2.8, "#111111", "900", "middle")}
{text(61.5, 60, "+5V", 2.8, "#f59e0b", "900", "middle")}
{line(14, 45, 36, 45, "#e53935", 0.9)}
{text(13, 44, "U5-1へ", 3.0, "#e53935", "900", "end")}
{line(84, 45, 63, 45, "#f59e0b", 0.9)}
{text(85, 44, "U5-3へ", 3.0, "#f59e0b", "900", "start")}
</svg>
"""


def build_svg():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    board, fps = parse_board()
    target_refs = {"J1", "J2", "J3", "J4", "J5", "U3", "U5"}
    svg = []
    svg.append(
        """<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="1320" viewBox="-42 -24 245 142">
<defs>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
<feDropShadow dx="0.7" dy="1.0" stdDeviation="0.8" flood-color="#000000" flood-opacity="0.25"/>
</filter>
<marker id="arrow-red" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
<polygon points="0 0, 7 3.5, 0 7" fill="#e53935"/>
</marker>
<marker id="arrow-blue" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
<polygon points="0 0, 7 3.5, 0 7" fill="#1d4ed8"/>
</marker>
</defs>
"""
    )
    svg.append(rect(-42, -24, 245, 142, "#eef2f7", "none", 0, 0))
    svg.append(text(75, -16, "MEFX-S3 直配線 書き込み図", 5.0, "#111827", "900", "middle"))
    svg.append(text(75, -10.5, "基板は部品面を上。端子台は使わず、J1-J5へ線を直接はんだ付け。", 3.1, "#334155", "700", "middle"))
    svg.append(rect(0, 0, 150, 90, "#0f6a33", "#073f1f", 1.0, 1.8, 'filter="url(#shadow)"'))
    svg.append(rect(3, 3, 144, 84, "#16743a", "none", 0, 1.2, 'opacity="0.55"'))
    svg.append(draw_tracks(board))
    svg.append(draw_pads(board, target_refs))
    svg.append(draw_r78_main(fps["U5"]))

    # U3 socket frame and labels.
    svg.append(rect(4.37, 5, 48.26, 25.4, "none", "#d9f99d", 0.45, 1.2))
    svg.append(text(27.5, 20, "ESP32-S3", 3.5, "#d9f99d", "900", "middle"))
    svg.append(text(5, 34.5, "USB端子はこちら側", 2.6, "#ffffff", "900"))
    svg.append(line(1.5, 32.5, 1.5, 8, "#ffffff", 0.7, 'marker-end="url(#arrow-blue)"'))

    # Pad highlights.
    colors = {
        "J1": [("#e53935", "1 +9V"), ("#111111", "2 GND")],
        "J2": [("#ffffff", "1 TIP"), ("#111111", "2 GND")],
        "J3": [("#22c55e", "1 MIC+"), ("#111111", "2 GND")],
        "J4": [("#facc15", "1 SW"), ("#111111", "2 GND")],
        "J5": [("#2563eb", "1 OUT"), ("#111111", "2 GND")],
        "U5": [("#e53935", "1 VIN"), ("#111111", "2 GND"), ("#f59e0b", "3 +5V")],
    }
    for ref, entries in colors.items():
        fp = fps[ref]
        for idx, (color, label) in enumerate(entries, start=1):
            svg.append(highlight_pad(fp, idx, color, label, dy=-2.8 if ref != "U5" else -6.0))

    boxes = {}
    boxes["J1"], boxes["J1_box"] = multiline_box(55, -22, ["J1 9V入力", "1 赤 -> DC外周 +9V", "2 黒 -> DC中心 GND"], "#e53935", width=48)
    boxes["U5"], boxes["U5_box"] = multiline_box(103, -22, ["U5 R-78", "1 VIN / 2 GND / 3 +5V", "1番は四角ランド"], "#f59e0b", width=48)
    boxes["U3"], boxes["U3_box"] = multiline_box(-40, 8, ["U3 ESP32ソケット", "20ピン雌ソケット x2", "ESP32はまだ挿さない"], "#65a30d", width=41)
    boxes["J2"], boxes["J2_box"] = multiline_box(-40, 43, ["J2 INPUT", "1 白 -> TIP", "2 黒 -> SLEEVE"], "#64748b", width=35)
    boxes["J3"], boxes["J3_box"] = multiline_box(-40, 72, ["J3 MIC", "1 緑 -> マイク+", "2 黒 -> マイク-"], "#16a34a", width=35)
    boxes["J4"], boxes["J4_box"] = multiline_box(42, 95, ["J4 SWITCH", "1 黄 -> NO片側", "2 黒 -> NO反対側"], "#ca8a04", width=43)
    boxes["J5"], boxes["J5_box"] = multiline_box(154, 43, ["J5 OUTPUT", "1 青 -> TIP", "2 黒 -> SLEEVE"], "#2563eb", width=39)
    for key in ["J1", "U5", "U3", "J2", "J3", "J4", "J5"]:
        svg.append(boxes[key])

    svg.append(callout(fps["J1"], "1", boxes["J1_box"], "#e53935"))
    svg.append(callout(fps["J1"], "2", boxes["J1_box"], "#111111"))
    svg.append(callout(fps["U5"], "1", boxes["U5_box"], "#e53935"))
    svg.append(callout(fps["U5"], "3", boxes["U5_box"], "#f59e0b"))
    svg.append(callout(fps["U3"], "1", boxes["U3_box"], "#65a30d"))
    svg.append(callout(fps["J2"], "1", boxes["J2_box"], "#e2e8f0"))
    svg.append(callout(fps["J3"], "1", boxes["J3_box"], "#16a34a"))
    svg.append(callout(fps["J4"], "1", boxes["J4_box"], "#ca8a04"))
    svg.append(callout(fps["J5"], "1", boxes["J5_box"], "#2563eb"))

    # R-78 orientation inset.
    svg.append(rect(154, -5, 46, 40, "#ffffff", "#172126", 0.45, 1.5, 'filter="url(#shadow)"'))
    svg.append(text(177, 1.5, "R-78 実物向き", 3.0, "#172126", "900", "middle"))
    svg.append(text(177, 6.0, "足を下、印字面を正面", 2.2, "#475569", "800", "middle"))
    svg.append(rect(164, 10, 26, 12, "#20242a", "#111827", 0.25, 0.8))
    svg.append(text(177, 15.2, "R-78E", 2.7, "#ffffff", "900", "middle"))
    svg.append(text(177, 19.3, "印字面", 1.7, "#dbeafe", "700", "middle"))
    for x, n, name, c in [(168, "1", "+Vin", "#e53935"), (177, "2", "GND", "#111111"), (186, "3", "+5V", "#f59e0b")]:
        svg.append(rect(x - 0.8, 22, 1.6, 8.0, "#c8c8c8", "#555", 0.12, 0.2))
        svg.append(text(x, 33.8, n, 2.7, c, "900", "middle"))
        svg.append(text(x, 37.2, name, 2.0, c, "900", "middle"))
    svg.append(text(177, 42.5, "左から 1-2-3", 2.35, "#dc2626", "900", "middle"))
    svg.append(text(177, 46.2, "1番足 -> U5四角ランド", 2.2, "#dc2626", "900", "middle"))

    svg.append(rect(154, 64, 46, 31, "#fff7ed", "#ea580c", 0.4, 1.4, 'filter="url(#shadow)"'))
    svg.append(text(177, 70, "最初の停止位置", 3.0, "#ea580c", "900", "middle"))
    svg.append(text(157, 76, "1 U3ソケット", 2.3, "#172126", "800"))
    svg.append(text(157, 81, "2 U5 R-78", 2.3, "#172126", "800"))
    svg.append(text(157, 86, "3 J1だけ直配線", 2.3, "#172126", "800"))
    svg.append(text(157, 91, "ESP32なしで5V測定", 2.3, "#dc2626", "900"))

    svg.append("</svg>")
    OUT_SVG.write_text("\n".join(svg), encoding="utf-8")
    OUT_R78.write_text(r78_inset_svg(), encoding="utf-8")
    OUT_HTML.write_text(
        f"""<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>MEFX-S3 直配線 書き込み図</title>
  <style>
    body {{ margin: 0; font-family: Meiryo, "Yu Gothic", sans-serif; background: #eef2f7; color: #172126; }}
    header {{ padding: 18px 24px; background: #172126; color: white; }}
    main {{ padding: 18px 24px 40px; }}
    .panel {{ background: white; border-radius: 10px; padding: 14px; box-shadow: 0 8px 24px rgba(15, 23, 42, .12); }}
    img {{ width: 100%; height: auto; display: block; }}
    .danger {{ margin-top: 14px; padding: 12px 14px; border-left: 6px solid #dc2626; background: #fff1f2; font-weight: 700; }}
    code {{ background: #f1f5f9; padding: 2px 5px; border-radius: 4px; }}
  </style>
</head>
<body>
  <header>
    <h1>MEFX-S3 直配線 書き込み図</h1>
    <p>基板データから描き起こした、組み立て時に見る図です。</p>
  </header>
  <main>
    <div class="panel">
      <img src="{OUT_SVG.name}" alt="MEFX-S3 直配線 書き込み図">
    </div>
    <div class="danger">
      最初は <code>U3ソケット</code>、<code>U5 R-78</code>、<code>J1 9V入力</code> だけ。
      ESP32は5V確認が終わるまで挿さない。
    </div>
  </main>
</body>
</html>
""",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build_svg()
    print(OUT_SVG)
    print(OUT_HTML)
    print(OUT_R78)
