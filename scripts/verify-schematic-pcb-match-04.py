from __future__ import annotations

from pathlib import Path
import sys
import xml.etree.ElementTree as ET

sys.path.append(r"C:\Program Files\KiCad\10.0\bin\Lib\site-packages")
import pcbnew


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"
NETLIST = ROOT / "docs" / "pcb-assembly" / "SCHEMATIC_NETLIST_04.xml"


def main() -> int:
    board = pcbnew.LoadBoard(str(PCB))
    pcb_nets: dict[str, set[str]] = {}
    for footprint in board.GetFootprints():
        ref = footprint.GetReference()
        for pad in footprint.Pads():
            net = pad.GetNetname()
            if net:
                pcb_nets.setdefault(net, set()).add(f"{ref}.{pad.GetNumber()}")

    root = ET.parse(NETLIST).getroot()
    schematic_nets: dict[str, set[str]] = {}
    for net in root.findall("./nets/net"):
        name = net.attrib["name"]
        schematic_nets[name] = {
            f"{node.attrib['ref']}.{node.attrib['pin']}" for node in net.findall("node")
        }

    errors: list[str] = []
    for name in sorted(set(pcb_nets) | set(schematic_nets)):
        pcb_nodes = pcb_nets.get(name, set())
        schematic_nodes = schematic_nets.get(name, set())
        if pcb_nodes != schematic_nodes:
            missing = sorted(pcb_nodes - schematic_nodes)
            extra = sorted(schematic_nodes - pcb_nodes)
            errors.append(f"{name}: missing={missing}, extra={extra}")

    print(f"PCB nets: {len(pcb_nets)}")
    print(f"Schematic nets: {len(schematic_nets)}")
    print(f"PCB connected pads: {sum(map(len, pcb_nets.values()))}")
    print(f"Schematic connected pins: {sum(map(len, schematic_nets.values()))}")
    if errors:
        print("MATCH FAILED")
        for error in errors:
            print(error)
        return 1
    print("MATCH PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
