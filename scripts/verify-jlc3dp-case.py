from __future__ import annotations

import re
import struct
import math
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CASE_DIR = ROOT / "docs" / "case-jlc3dp"
OUT = CASE_DIR / "04_ケース寸法検証.txt"
VERTEX_RE = re.compile(r"vertex\s+([-0-9.eE]+)\s+([-0-9.eE]+)\s+([-0-9.eE]+)")


@dataclass
class Bounds:
    min_x: float
    max_x: float
    min_y: float
    max_y: float
    min_z: float
    max_z: float
    vertices: int

    @property
    def size(self) -> tuple[float, float, float]:
        return self.max_x - self.min_x, self.max_y - self.min_y, self.max_z - self.min_z


def read_vertices(path: Path) -> list[tuple[float, float, float]]:
    data = path.read_bytes()
    coords: list[tuple[float, float, float]] = []
    if len(data) >= 84 and 84 + struct.unpack_from("<I", data, 80)[0] * 50 == len(data):
        count = struct.unpack_from("<I", data, 80)[0]
        for index in range(count):
            offset = 84 + index * 50 + 12
            coords.extend(struct.unpack_from("<9f", data, offset)[i : i + 3] for i in (0, 3, 6))
    else:
        text = data.decode("ascii", errors="ignore")
        coords = [tuple(map(float, m.groups())) for m in VERTEX_RE.finditer(text)]
    if not coords:
        raise RuntimeError(f"STL頂点がありません: {path}")
    return coords


def read_bounds(path: Path) -> Bounds:
    coords = read_vertices(path)
    xs, ys, zs = zip(*coords)
    return Bounds(min(xs), max(xs), min(ys), max(ys), min(zs), max(zs), len(coords))


def close(actual: float, expected: float, tolerance: float = 0.01) -> bool:
    return abs(actual - expected) <= tolerance


def main() -> None:
    bottom_path = CASE_DIR / "mefx_case_bottom_jlc3dp.stl"
    bottom = read_bounds(bottom_path)
    lid = read_bounds(CASE_DIR / "mefx_case_lid_jlc3dp.stl")
    vertices = read_vertices(bottom_path)

    def aperture_diameter(axis: str, center_a: float, center_z: float, wall_min: float, wall_max: float, low: float, high: float) -> float:
        radii = []
        for x, y, z in vertices:
            wall_value = x if axis == "x" else y
            transverse = y if axis == "x" else x
            if wall_min <= wall_value <= wall_max:
                radius = math.hypot(transverse - center_a, z - center_z)
                if low <= radius <= high:
                    radii.append(radius)
        if not radii:
            raise RuntimeError(f"ケース穴を検出できません: axis={axis}, center={center_a},{center_z}")
        return 2 * sum(radii) / len(radii)

    input_d = aperture_diameter("x", 56, 38, -0.01, 3.01, 4.0, 6.0)
    output_d = aperture_diameter("x", 58, 38, 162.99, 166.01, 4.0, 6.0)
    dc_d = aperture_diameter("y", 83, 38, 102.99, 106.01, 3.5, 5.0)
    bw, bd, bh = bottom.size
    lw, ld, lh = lid.size
    checks = {
        "底箱外形166x106x55mm": close(bw, 166) and close(bd, 106) and close(bh, 55),
        "フタ外形166x106x8mm": close(lw, 166) and close(ld, 106) and close(lh, 8),
        "入力ジャック穴9.8mm": close(input_d, 9.8),
        "出力ジャック穴9.8mm": close(output_d, 9.8),
        "DCジャック穴8.5mm": close(dc_d, 8.5),
    }
    if not all(checks.values()):
        raise RuntimeError(f"ケース寸法が不一致です: {checks}")

    lines = [
        "MEFX-S3 ケース寸法検証 04",
        "===============================",
        "",
        f"- 底箱: {bw:.2f} x {bd:.2f} x {bh:.2f} mm",
        f"- 補強付きフタ: {lw:.2f} x {ld:.2f} x {lh:.2f} mm",
        "- 基板: 150 x 90 mm、ケース内オフセット: X=8mm, Y=8mm",
        "- 基板固定位置: (13,46), (153,13), (13,93), (153,93) mm",
        "- ケース固定位置: (6,6), (160,6), (6,100), (160,100) mm",
        "- フットスイッチ開口: 直径12.4 mm",
        f"- 入力ジャック開口: 直径{input_d:.2f} mm、中心高さ38 mm",
        f"- 出力ジャック開口: 直径{output_d:.2f} mm、中心高さ38 mm",
        f"- DCジャック開口: 直径{dc_d:.2f} mm、中心高さ38 mm",
        "- ESP32 USB-C開口: 28 x 12 mm（2端子を露出）",
        "- マイク音孔: 直径4.0 mm、中心(120,35) mm",
        "",
        "判定: PASS",
        "注意: 購入品の商品図でねじ部外径、ナット外径、3mm厚パネル対応を照合する。",
        "ケースは踏み込み強度未検証のため、初回は寸法確認用試作とする。",
    ]
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
