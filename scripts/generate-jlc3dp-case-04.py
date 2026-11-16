from __future__ import annotations

from pathlib import Path

import manifold3d as m3d
import numpy as np
import trimesh


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "case-jlc3dp"


def box(size: tuple[float, float, float], at: tuple[float, float, float] = (0, 0, 0)) -> m3d.Manifold:
    return m3d.Manifold.cube(size).translate(at)


def cylinder(radius: float, height: float, at: tuple[float, float, float]) -> m3d.Manifold:
    return m3d.Manifold.cylinder(height, radius, radius, 48).translate(at)


def cylinder_x(radius: float, length: float, at: tuple[float, float, float]) -> m3d.Manifold:
    return m3d.Manifold.cylinder(length, radius, radius, 48).rotate((0, 90, 0)).translate(at)


def cylinder_y(radius: float, length: float, at: tuple[float, float, float]) -> m3d.Manifold:
    return m3d.Manifold.cylinder(length, radius, radius, 48).rotate((-90, 0, 0)).translate(at)


def export(model: m3d.Manifold, path: Path) -> None:
    if model.is_empty() or model.status() != m3d.Error.NoError:
        raise RuntimeError(f"Invalid manifold: {path.name}, status={model.status()}")
    mesh = model.to_mesh()
    vertices = np.asarray(mesh.vert_properties)[:, :3]
    faces = np.asarray(mesh.tri_verts)
    result = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    if not result.is_watertight or not result.is_winding_consistent:
        raise RuntimeError(f"Non-watertight export: {path.name}")
    result.export(path)
    print(f"{path.name}: watertight, {len(result.faces)} faces, volume={result.volume:.1f} mm3")


def bottom() -> m3d.Manifold:
    w, d, h, wall, floor = 166.0, 106.0, 55.0, 3.0, 3.0
    model = box((w, d, h)) - box((w - 2 * wall, d - 2 * wall, h), (wall, wall, floor))

    # USB service opening plus exact round panel holes for the selected parts.
    # The Freenove board has two adjacent USB-C receptacles across its
    # 28-mm width. Keep the complete connector face accessible.
    model -= box((4, 28, 12), (-0.5, 12, 10))
    # Raise panel parts above the PCB/component envelope. Slight clearance is
    # included because resin-printed round holes commonly finish undersize.
    model -= cylinder_x(4.9, 4, (-0.5, 56, 38))  # 9.8-mm input jack hole
    model -= cylinder_x(4.9, 4, (w - 3.5, 58, 38))  # 9.8-mm output jack hole
    model -= cylinder_y(4.25, 4, (83, d - 3.5, 38))  # 8.5-mm DC jack hole

    # Independent case pillars. M3 heat-set inserts are installed from the top,
    # so the lid can be removed without holding a nut under the enclosure.
    for x, y in [(6, 6), (160, 6), (6, 100), (160, 100)]:
        model += cylinder(4.5, h, (x, y, 0))
        model -= cylinder(1.6, 7, (x, y, h - 7))
        model -= cylinder(2.35, 5.2, (x, y, h - 5.2))

    # PCB standoffs have their own M3 inserts and leave the case floor closed.
    for x, y in [(13, 46), (153, 13), (13, 93), (153, 93)]:
        model += cylinder(3.8, 11, (x, y, 0))
        model -= cylinder(1.6, 7, (x, y, 4))
        model -= cylinder(2.35, 5.2, (x, y, 5.8))
    return model


def lid() -> m3d.Manifold:
    w, d, rib_h, skin = 166.0, 106.0, 5.0, 3.0
    # The 3-mm top skin is reinforced by 5-mm underside ribs. This keeps the
    # center footswitch load away from a large unsupported resin sheet.
    model = box((w, d, skin), (0, 0, rib_h))
    model += box((w - 6, 3, rib_h), (3, 51.5, 0))
    model += box((3, d - 6, rib_h), (81.5, 3, 0))
    for x, y in [(6, 6), (160, 6), (6, 100), (160, 100)]:
        model += cylinder(4.5, rib_h + skin, (x, y, 0))
    model -= cylinder(6.2, rib_h + skin + 2, (83, 53, -1))  # 12.4-mm momentary footswitch
    # Acoustic port for a 6x5-mm electret capsule bonded below the lid.
    # It is offset from both reinforcing ribs and the footswitch washer.
    model -= cylinder(2.0, rib_h + skin + 2, (120, 35, -1))
    for x, y in [(6, 6), (160, 6), (6, 100), (160, 100)]:
        model -= cylinder(1.7, rib_h + skin + 2, (x, y, -1))
    return model


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    export(bottom(), OUT / "mefx_case_bottom_jlc3dp.stl")
    export(lid(), OUT / "mefx_case_lid_jlc3dp.stl")


if __name__ == "__main__":
    main()
