from __future__ import annotations

from pathlib import Path
from copy import deepcopy
import re
import sys
from uuid import uuid4

sys.path.append(r"C:\Users\髙橋一哉\AppData\Roaming\Python\Python314\site-packages")
import pcbnew
from kiutils.items.common import Effects, Font, PageSettings, Position, Property, TitleBlock
from kiutils.schematic import (
    GlobalLabel,
    HierarchicalSheetInstance,
    NoConnect,
    Schematic,
    SchematicSymbol,
    SymbolProjectInstance,
    SymbolProjectPath,
)
from kiutils.symbol import SymbolLib


ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "docs" / "kicad" / "mefx_s3.kicad_pcb"
LEGACY = ROOT / "docs" / "kicad" / "mefx_s3_connectivity_04.sch"
MODERN = ROOT / "docs" / "kicad" / "mefx_s3.kicad_sch"
NETLIST = ROOT / "docs" / "pcb-assembly" / "PCBA_ネットリスト_04.csv"


def safe_label(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_+.-]", "_", value) or "NC"


def component_block(ref: str, value: str, pins: list[tuple[str, str]], x: int, y: int, index: int) -> str:
    count = max(1, len(pins))
    symbol = f"Connector_Generic:Conn_01x{count:02d}"
    lines = [
        "$Comp",
        f"L {symbol} {ref}",
        f"U 1 1 {0x60000000 + index:08X}",
        f"P {x} {y}",
        f'F 0 "{ref}" H {x + 80} {y + 420} 50  0000 C CNN',
        f'F 1 "{value}" H {x + 80} {y + 320} 50  0000 C CNN',
        f"\t1    {x} {y}",
        "\t1    0    0    -1",
        "$EndComp",
    ]
    first_y = y - ((count - 1) * 100) // 2
    for pin_index, (pin, net) in enumerate(pins):
        py = first_y + pin_index * 100
        px = x - 200
        lines.extend(
            [
                f"Wire Wire Line",
                f"\t{px} {py} {px - 250} {py}",
                f"Text Label {px - 250} {py} 2    40   ~ 0",
                safe_label(net if net else f"NC_{ref}_{pin}"),
            ]
        )
    return "\n".join(lines)


def main() -> None:
    board = pcbnew.LoadBoard(str(PCB))
    components: list[tuple[str, str, list[tuple[str, str]]]] = []
    nets: dict[str, list[str]] = {}
    for footprint in sorted(board.GetFootprints(), key=lambda item: item.GetReference()):
        ref = footprint.GetReference()
        pads = sorted(footprint.Pads(), key=lambda pad: (len(pad.GetNumber()), pad.GetNumber()))
        pin_data = [(pad.GetNumber(), pad.GetNetname()) for pad in pads]
        if not pin_data or all(not net for _, net in pin_data):
            continue
        components.append((ref, footprint.GetValue(), pin_data))
        for pin, net in pin_data:
            if net:
                nets.setdefault(net, []).append(f"{ref}.{pin}")

    blocks: list[str] = []
    x_positions = [2500, 8500, 14500, 20500, 26500, 32500, 38500, 44500]
    column = 0
    y = 2500
    for index, (ref, value, pins) in enumerate(components, start=1):
        height = max(1200, len(pins) * 100 + 700)
        if y + height > 31500:
            column += 1
            y = 2500
        if column >= len(x_positions):
            raise RuntimeError("A0 sheet capacity exceeded")
        center_y = y + height // 2
        blocks.append(component_block(ref, value, pins, x_positions[column], center_y, index))
        y += height

    text = "\n".join(
        [
            "EESchema Schematic File Version 4",
            "LIBS:power",
            "LIBS:device",
            "LIBS:Connector_Generic",
            "EELAYER 29 0",
            "EELAYER END",
            "$Descr A0 46811 33110",
            "Sheet 1 1",
            'Title "MEFX-S3 PCBA 04 - PCB connectivity schematic"',
            'Date "2026-06-19"',
            'Rev "04"',
            'Comp "Generated directly from verified PCB"',
            'Comment1 "Net labels are authoritative; component shapes are connector-style pin maps."',
            "$EndDescr",
            *blocks,
            "$EndSCHEMATC",
            "",
        ]
    )
    LEGACY.write_text(text, encoding="utf-8")

    connector_library = SymbolLib().from_file(
        r"C:\Program Files\KiCad\10.0\share\kicad\symbols\Connector_Generic.kicad_sym"
    )
    connector_symbols = {symbol.entryName: symbol for symbol in connector_library.symbols}
    schematic = Schematic(
        version="20231120",
        generator="codex",
        uuid=str(uuid4()),
        paper=PageSettings(paperSize="A0"),
        titleBlock=TitleBlock(
            title="MEFX-S3 PCBA 04 - PCB connectivity schematic",
            date="2026-06-19",
            revision="04",
            company="Generated directly from verified PCB",
            comments={1: "Net labels are authoritative; connector-style symbols show exact PCB pins."},
        ),
        sheetInstances=[HierarchicalSheetInstance(instancePath="/", page="1")],
    )
    x_positions_mm = [25.4, 88.9, 152.4, 215.9, 279.4, 342.9, 406.4]
    column = 0
    y_mm = 25.4
    for ref, value, pins in components:
        count = max(1, len(pins))
        height = max(15.24, count * 2.54 + 10.16)
        if y_mm + height > 320.0:
            column += 1
            y_mm = 25.4
        if column >= len(x_positions_mm):
            raise RuntimeError("A0 sheet capacity exceeded")
        x_mm = x_positions_mm[column]
        center_y = y_mm + height / 2
        entry = f"Conn_01x{count:02d}"
        lib_id = f"Connector_Generic:{entry}"
        if not any(symbol.entryName == entry for symbol in schematic.libSymbols):
            lib_symbol = deepcopy(connector_symbols[entry])
            lib_symbol.entryName = entry
            lib_symbol.libraryNickname = "Connector_Generic"
            schematic.libSymbols.append(lib_symbol)
        symbol_uuid = str(uuid4())
        pin_uuids = {str(index): str(uuid4()) for index in range(1, count + 1)}
        properties = [
            Property("Reference", ref, position=Position(x_mm + 2.54, center_y - 5.08, 0), effects=Effects(font=Font(height=1.27, width=1.27))),
            Property("Value", value, position=Position(x_mm + 2.54, center_y + 5.08, 0), effects=Effects(font=Font(height=1.27, width=1.27))),
            Property("Footprint", "", position=Position(x_mm, center_y, 0), effects=Effects(font=Font(height=1.27, width=1.27), hide=True)),
            Property("Datasheet", "", position=Position(x_mm, center_y, 0), effects=Effects(font=Font(height=1.27, width=1.27), hide=True)),
        ]
        instance = SymbolProjectInstance(
            name="",
            paths=[SymbolProjectPath(sheetInstancePath="/", reference=ref, unit=1)],
        )
        schematic.schematicSymbols.append(
            SchematicSymbol(
                libraryNickname="Connector_Generic",
                entryName=entry,
                libName=lib_id,
                position=Position(x_mm, center_y, 0),
                unit=1,
                inBom=True,
                onBoard=True,
                uuid=symbol_uuid,
                properties=properties,
                pins=pin_uuids,
                instances=[instance],
            )
        )
        symbol_pins = {pin.number: pin for pin in connector_symbols[entry].units[0].pins}
        for pin_index, (pin, net) in enumerate(pins):
            symbol_pin = symbol_pins[str(pin_index + 1)]
            pin_x = x_mm + symbol_pin.position.X
            pin_y = center_y - symbol_pin.position.Y
            if net:
                schematic.globalLabels.append(
                    GlobalLabel(
                        text=safe_label(net),
                        shape="bidirectional",
                        position=Position(pin_x, pin_y, 180),
                        effects=Effects(font=Font(height=1.0, width=1.0)),
                        uuid=str(uuid4()),
                    )
                )
            else:
                schematic.noConnects.append(NoConnect(position=Position(pin_x, pin_y), uuid=str(uuid4())))
        y_mm += height
    schematic.to_file(str(MODERN), encoding="utf-8")

    rows = ["Net,Connections"]
    for net in sorted(nets):
        connections = ",".join(nets[net])
        rows.append(f'"{net}","{connections}"')
    NETLIST.write_text("\n".join(rows) + "\n", encoding="utf-8-sig")
    print(f"Wrote {LEGACY}")
    print(f"Wrote {MODERN}")
    print(f"Wrote {NETLIST}")


if __name__ == "__main__":
    main()
