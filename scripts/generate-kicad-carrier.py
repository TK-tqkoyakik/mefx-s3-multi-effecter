from __future__ import annotations

import csv
import uuid
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KICAD_DIR = ROOT / "docs" / "kicad"
OUT_PCB = KICAD_DIR / "mefx_s3.kicad_pcb"
OUT_SCH_NOTE = KICAD_DIR / "mefx_s3.kicad_sch"
OUT_README = KICAD_DIR / "PCBA_DRAFT_README.txt"
OUT_CPL = ROOT / "docs" / "pcb-assembly" / "PCBA_CPL_draft.csv"


NETS = [
    "GND",
    "+9V_RAW",
    "+9V_PROT",
    "+9VA",
    "+5V",
    "+5V_AUDIO",
    "+5V_ADC",
    "+3V3_LOGIC",
    "+3V3_ADC",
    "+3V3_DAC",
    "VBIAS_4V5",
    "INPUT_TIP",
    "IN_AC",
    "TL072_A_INP",
    "TL072_A_INN",
    "TL072_A_OUT",
    "ADC_L_PRE",
    "ADC_L",
    "MIC_OUT",
    "ADC_R_PRE",
    "ADC_R",
    "ADC_VREF",
    "MCLK",
    "BCLK",
    "LRCK",
    "ADC_DOUT",
    "DAC_DIN",
    "PCM5102_XMT",
    "DAC_LOUT",
    "DAC_ROUT",
    "DAC_CAPP",
    "DAC_CAPM",
    "DAC_VNEG",
    "DAC_LDOO",
    "OUTPUT_TIP",
    "FOOTSW_GPIO",
    "TL072_B_UNUSED",
    "TL072_B_INP",
    "TL072_B_INN",
    "TL072_B_OUT",
    "MIC_BIAS",
    "MIC_AC",
    "CODEC_RST",
    "CODEC_VQ",
    "CODEC_FILT",
    "CODEC_AOUT_L",
    "CODEC_M1",
    "CODEC_M0",
    "CODEC_MDIV1",
    "CODEC_MDIV2",
]
NET_ID = {name: index + 1 for index, name in enumerate(NETS)}


@dataclass
class Part:
    ref: str
    value: str
    package: str
    x: float
    y: float
    rot: float
    assembly: str
    notes: str


PARTS: list[Part] = []


def uid() -> str:
    return str(uuid.uuid4())


def fmt(n: float) -> str:
    text = f"{n:.3f}".rstrip("0").rstrip(".")
    return text if text else "0"


def prop(name: str, value: str, x: float, y: float, layer: str = "F.SilkS", hide: bool = False) -> str:
    hidden = "\n\t\t\t(hide yes)" if hide else ""
    return (
        f'\t\t(property "{name}" "{value}"\n'
        f"\t\t\t(at {fmt(x)} {fmt(y)} 0)\n"
        f'\t\t\t(layer "{layer}"){hidden}\n'
        f"\t\t\t(uuid \"{uid()}\")\n"
        "\t\t\t(effects\n"
        "\t\t\t\t(font\n"
        "\t\t\t\t\t(size 1 1)\n"
        "\t\t\t\t\t(thickness 0.15)\n"
        "\t\t\t\t)\n"
        "\t\t\t)\n"
        "\t\t)"
    )


def pad_net(net: str) -> str:
    if not net:
        return ""
    return f'\n\t\t\t(net {NET_ID[net]} "{net}")'


def smd_pad(num: str, x: float, y: float, sx: float, sy: float, net: str) -> str:
    return (
        f'\t\t(pad "{num}" smd roundrect\n'
        f"\t\t\t(at {fmt(x)} {fmt(y)})\n"
        f"\t\t\t(size {fmt(sx)} {fmt(sy)})\n"
        '\t\t\t(layers "F.Cu" "F.Paste" "F.Mask")\n'
        "\t\t\t(roundrect_rratio 0.2)"
        f"{pad_net(net)}\n"
        f'\t\t\t(pinfunction "{num}")\n'
        '\t\t\t(pintype "passive")\n'
        f'\t\t\t(uuid "{uid()}")\n'
        "\t\t)"
    )


def th_pad(num: str, x: float, y: float, net: str, shape: str = "circle") -> str:
    return (
        f'\t\t(pad "{num}" thru_hole {shape}\n'
        f"\t\t\t(at {fmt(x)} {fmt(y)})\n"
        "\t\t\t(size 1.7 1.7)\n"
        "\t\t\t(drill 0.9)\n"
        '\t\t\t(layers "*.Cu" "*.Mask")'
        f"{pad_net(net)}\n"
        f'\t\t\t(pinfunction "{num}")\n'
        '\t\t\t(pintype "passive")\n'
        f'\t\t\t(uuid "{uid()}")\n'
        "\t\t)"
    )


def fp_rect(x1: float, y1: float, x2: float, y2: float, layer: str = "F.Fab") -> str:
    return (
        "\t\t(fp_rect\n"
        f"\t\t\t(start {fmt(x1)} {fmt(y1)})\n"
        f"\t\t\t(end {fmt(x2)} {fmt(y2)})\n"
        "\t\t\t(stroke\n"
        "\t\t\t\t(width 0.12)\n"
        "\t\t\t\t(type solid)\n"
        "\t\t\t)\n"
        "\t\t\t(fill no)\n"
        f'\t\t\t(layer "{layer}")\n'
        f'\t\t\t(uuid "{uid()}")\n'
        "\t\t)"
    )


def resistor(ref: str, value: str, x: float, y: float, net1: str, net2: str) -> str:
    PARTS.append(Part(ref, value, "0805", x, y, 0, "SMT PCBA", "1% resistor"))
    return footprint(
        "MEFX:R_0805",
        ref,
        value,
        x,
        y,
        "smd",
        [smd_pad("1", -1.0, 0, 1.1, 1.3, net1), smd_pad("2", 1.0, 0, 1.1, 1.3, net2)],
        [fp_rect(-1.8, -0.8, 1.8, 0.8)],
    )


def capacitor(ref: str, value: str, x: float, y: float, net1: str, net2: str, package: str = "0805") -> str:
    PARTS.append(Part(ref, value, package, x, y, 0, "SMT PCBA", "Capacitor"))
    if package == "0402":
        offset, size, body = 0.5, (0.6, 0.7), (-0.9, -0.5, 0.9, 0.5)
    elif package == "0805":
        offset, size, body = 1.0, (1.1, 1.3), (-1.8, -0.8, 1.8, 0.8)
    else:
        offset, size, body = 1.0, (1.5, 1.8), (-1.8, -0.8, 1.8, 0.8)
    return footprint(
        f"MEFX:C_{package}",
        ref,
        value,
        x,
        y,
        "smd",
        [smd_pad("1", -offset, 0, size[0], size[1], net1), smd_pad("2", offset, 0, size[0], size[1], net2)],
        [fp_rect(*body)],
    )


def capacitor_v(ref: str, value: str, x: float, y: float, net1: str, net2: str, package: str = "0805") -> str:
    PARTS.append(Part(ref, value, package, x, y, 90, "SMT PCBA", "Capacitor"))
    if package == "0402":
        offset, size, body = 0.5, (0.7, 0.6), (-0.5, -0.9, 0.5, 0.9)
    elif package == "0805":
        offset, size, body = 1.0, (1.3, 1.1), (-0.8, -1.8, 0.8, 1.8)
    else:
        offset, size, body = 1.0, (1.8, 1.5), (-0.8, -1.8, 0.8, 1.8)
    return footprint(
        f"MEFX:C_{package}_V",
        ref,
        value,
        x,
        y,
        "smd",
        [smd_pad("1", 0, -offset, size[0], size[1], net1), smd_pad("2", 0, offset, size[0], size[1], net2)],
        [fp_rect(*body)],
    )


def diode(ref: str, value: str, x: float, y: float, net_a: str, net_k: str) -> str:
    PARTS.append(Part(ref, value, "SMA/SOD-123", x, y, 0, "SMT PCBA", "Schottky diode"))
    return footprint(
        "MEFX:D_SMA",
        ref,
        value,
        x,
        y,
        "smd",
        [smd_pad("2", -1.8, 0, 1.6, 1.8, net_a), smd_pad("1", 1.8, 0, 1.6, 1.8, net_k)],
        [
            fp_rect(-2.9, -1.1, 2.9, 1.1),
            "\t\t(fp_line\n\t\t\t(start 1.1 -1.1)\n\t\t\t(end 1.1 1.1)\n\t\t\t(stroke\n\t\t\t\t(width 0.15)\n\t\t\t\t(type solid)\n\t\t\t)\n\t\t\t(layer \"F.Fab\")\n\t\t\t(uuid \"%s\")\n\t\t)" % uid(),
        ],
    )


def header(ref: str, value: str, x: float, y: float, pin_nets: list[tuple[str, str]], horizontal: bool = False) -> str:
    PARTS.append(Part(ref, value, f"PinHeader_1x{len(pin_nets)}", x, y, 0, "Hand solder", "Module or panel connector"))
    pads = []
    graphics = []
    for i, (_label, net) in enumerate(pin_nets):
        px = i * 2.54 if horizontal else 0
        py = 0 if horizontal else i * 2.54
        shape = "rect" if i == 0 else "circle"
        pads.append(th_pad(str(i + 1), px, py, net, shape))
    width = max(2.54 * (len(pin_nets) - 1), 2.54) if horizontal else 2.54
    height = 2.54 if horizontal else max(2.54 * (len(pin_nets) - 1), 2.54)
    graphics.append(fp_rect(-1.5, -1.5, width + 1.5, height + 1.5))
    for i, (label, _net) in enumerate(pin_nets):
        tx = (i * 2.54 - 1.1) if horizontal else 1.8
        ty = 2.0 if horizontal else (i * 2.54 + 0.35)
        graphics.append(
            f'\t\t(fp_text user "{label}"\n'
            f"\t\t\t(at {fmt(tx)} {fmt(ty)} 0)\n"
                '\t\t\t(layer "F.Fab")\n'
            f'\t\t\t(uuid "{uid()}")\n'
            "\t\t\t(effects\n"
            "\t\t\t\t(font\n"
            "\t\t\t\t\t(size 0.8 0.8)\n"
            "\t\t\t\t\t(thickness 0.1)\n"
            "\t\t\t\t)\n"
            "\t\t\t)\n"
            "\t\t)"
        )
    return footprint("MEFX:HEADER", ref, value, x, y, "through_hole", pads, graphics)


def esp32_freenove_socket(ref: str, x: float, y: float) -> str:
    """Freenove ESP32-S3 Board Lite: 2x20, 2.54-mm pitch, 25.4-mm row spacing."""
    PARTS.append(
        Part(
            ref,
            "Freenove ESP32-S3 Board Lite B0FRRH9NCP",
            "Socket_2x20_P2.54_Row25.4_Board57x28",
            x,
            y,
            0,
            "Hand solder",
            "Fit two 1x20 female sockets; USB end at board outline left",
        )
    )
    row_a = [
        ("5V", "+5V"), ("14", ""), ("13", ""), ("12", ""), ("11", ""),
        ("10", ""), ("9", "FOOTSW_GPIO"), ("46", ""), ("3", ""), ("8", ""),
        ("18", ""), ("17", "MCLK"), ("16", "DAC_DIN"), ("15", "CODEC_RST"), ("7", ""),
        ("6", "ADC_DOUT"), ("5", "LRCK"), ("4", "BCLK"), ("EN", ""), ("3V3", ""),
    ]
    row_b = [
        ("GND", "GND"), ("19", ""), ("20", ""), ("21", ""), ("47", ""),
        ("48", ""), ("45", ""), ("0", ""), ("35", ""), ("36", ""),
        ("37", ""), ("38", ""), ("39", ""), ("40", ""), ("41", ""),
        ("42", ""), ("2", ""), ("1", ""), ("RX", ""), ("TX", ""),
    ]
    pads = []
    for row_index, row in enumerate((row_a, row_b)):
        py = row_index * 25.4
        for pin_index, (_label, net) in enumerate(row):
            px = pin_index * 2.54
            number = str(pin_index + 1 + row_index * 20)
            pads.append(th_pad(number, px, py, net, "rect" if pin_index == 0 else "circle"))

    # The pin rows are 48.26 mm long. The module body extends to 57 x 28 mm.
    graphics = [
        fp_rect(-4.37, -1.3, 52.63, 26.7),
        fp_rect(-4.37, 5.0, 5.5, 20.4, "F.Fab"),
        fp_rect(39.0, -1.3, 52.63, 26.7, "F.Fab"),
        f'\t\t(fp_text user "USB"\n\t\t\t(at -2 12.7 90)\n\t\t\t(layer "F.SilkS")\n\t\t\t(uuid "{uid()}")\n\t\t\t(effects (font (size 1 1) (thickness 0.15)))\n\t\t)',
        f'\t\t(fp_text user "ANTENNA KEEP CLEAR"\n\t\t\t(at 46 12.7 90)\n\t\t\t(layer "F.SilkS")\n\t\t\t(uuid "{uid()}")\n\t\t\t(effects (font (size 0.8 0.8) (thickness 0.12)))\n\t\t)',
    ]
    return footprint("MEFX:FREENOVE_ESP32S3_LITE_SOCKET", ref, "ESP32-S3 2x20 SOCKET", x, y, "through_hole", pads, graphics)


def soic8(ref: str, value: str, x: float, y: float) -> str:
    PARTS.append(Part(ref, value, "SOIC-8", x, y, 0, "SMT PCBA", "TL072 dual op amp"))
    nets = {
        "1": "TL072_A_OUT",
        "2": "TL072_A_INN",
        "3": "TL072_A_INP",
        "4": "GND",
        "5": "TL072_B_INP",
        "6": "TL072_B_INN",
        "7": "TL072_B_OUT",
        "8": "+9VA",
    }
    pads = []
    for i in range(4):
        pads.append(smd_pad(str(i + 1), -2.6, 1.905 - i * 1.27, 1.5, 0.6, nets[str(i + 1)]))
    for i in range(4):
        pads.append(smd_pad(str(i + 5), 2.6, -1.905 + i * 1.27, 1.5, 0.6, nets[str(i + 5)]))
    return footprint("MEFX:SOIC-8", ref, value, x, y, "smd", pads, [fp_rect(-2.0, -3.2, 2.0, 3.2)])


def tssop14_pcm1808(ref: str, x: float, y: float) -> str:
    PARTS.append(Part(ref, "PCM1808PWR", "TSSOP-14", x, y, 0, "SMT PCBA", "24-bit stereo ADC"))
    nets = {
        "1": "ADC_VREF", "2": "GND", "3": "+5V_ADC", "4": "+3V3_ADC",
        "5": "GND", "6": "MCLK", "7": "LRCK", "8": "BCLK",
        "9": "ADC_DOUT", "10": "GND", "11": "GND", "12": "GND",
        "13": "ADC_L", "14": "ADC_R",
    }
    pads = []
    for i in range(7):
        pads.append(smd_pad(str(i + 1), -3.1, 1.95 - i * 0.65, 1.7, 0.40, nets[str(i + 1)]))
    for i in range(7):
        pin = i + 8
        pads.append(smd_pad(str(pin), 3.1, -1.95 + i * 0.65, 1.7, 0.40, nets[str(pin)]))
    return footprint("MEFX:TSSOP-14_PCM1808", ref, "PCM1808PWR", x, y, "smd", pads, [fp_rect(-2.6, -2.8, 2.6, 2.8)])


def tssop20_pcm5102a(ref: str, x: float, y: float) -> str:
    PARTS.append(Part(ref, "PCM5102APWR", "TSSOP-20", x, y, 0, "SMT PCBA", "32-bit stereo DAC"))
    nets = {
        "1": "+3V3_DAC", "2": "DAC_CAPP", "3": "GND", "4": "DAC_CAPM", "5": "DAC_VNEG",
        "6": "DAC_LOUT", "7": "DAC_ROUT", "8": "+3V3_DAC", "9": "GND", "10": "GND",
        "11": "GND", "12": "GND", "13": "BCLK", "14": "DAC_DIN", "15": "LRCK",
        "16": "GND", "17": "PCM5102_XMT", "18": "DAC_LDOO", "19": "GND", "20": "+3V3_DAC",
    }
    pads = []
    for i in range(10):
        pads.append(smd_pad(str(i + 1), -3.1, 2.925 - i * 0.65, 1.7, 0.40, nets[str(i + 1)]))
    for i in range(10):
        pin = i + 11
        pads.append(smd_pad(str(pin), 3.1, -2.925 + i * 0.65, 1.7, 0.40, nets[str(pin)]))
    return footprint("MEFX:TSSOP-20_PCM5102A", ref, "PCM5102APWR", x, y, "smd", pads, [fp_rect(-2.6, -3.7, 2.6, 3.7)])


def tssop24_cs4270(ref: str, x: float, y: float) -> str:
    PARTS.append(Part(ref, "CS4270-CZZR", "TSSOP-24", x, y, 0, "SMT PCBA", "JLC/LCSC C1323229 stereo audio codec"))
    nets = {
        "1": "DAC_DIN", "2": "LRCK", "3": "MCLK", "4": "BCLK",
        "5": "+3V3_DAC", "6": "GND", "7": "ADC_DOUT", "8": "+3V3_DAC",
        "9": "CODEC_M1", "10": "CODEC_M0", "11": "+3V3_DAC", "12": "CODEC_MDIV1",
        "13": "CODEC_MDIV2", "14": "CODEC_RST", "15": "ADC_L", "16": "ADC_R",
        "17": "CODEC_VQ", "18": "CODEC_FILT", "19": "+5V_AUDIO", "20": "GND",
        "21": "", "22": "CODEC_AOUT_L", "23": "", "24": "",
    }
    pads = []
    for i in range(12):
        pads.append(smd_pad(str(i + 1), -3.1, 3.575 - i * 0.65, 1.7, 0.40, nets[str(i + 1)]))
    for i in range(12):
        pin = i + 13
        pads.append(smd_pad(str(pin), 3.1, -3.575 + i * 0.65, 1.7, 0.40, nets[str(pin)]))
    return footprint("MEFX:TSSOP-24_CS4270", ref, "CS4270-CZZR", x, y, "smd", pads, [fp_rect(-2.6, -4.3, 2.6, 4.3)])


def sot23_5_ldo(ref: str, x: float, y: float) -> str:
    PARTS.append(Part(ref, "AP2112K-3.3", "SOT-23-5", x, y, 0, "SMT PCBA", "Dedicated audio 3.3-V LDO"))
    nets = {"1": "+5V_AUDIO", "2": "GND", "3": "+5V_AUDIO", "4": "", "5": "+3V3_LOGIC"}
    pads = [
        smd_pad("1", -1.1375, -0.95, 1.325, 0.6, nets["1"]),
        smd_pad("2", -1.1375, 0, 1.325, 0.6, nets["2"]),
        smd_pad("3", -1.1375, 0.95, 1.325, 0.6, nets["3"]),
        smd_pad("4", 1.1375, 0.95, 1.325, 0.6, nets["4"]),
        smd_pad("5", 1.1375, -0.95, 1.325, 0.6, nets["5"]),
    ]
    return footprint("Package_TO_SOT_SMD:SOT-23-5", ref, "AP2112K-3.3", x, y, "smd", pads, [fp_rect(-1.5, -1.7, 1.5, 1.7)])


def sip3_regulator(ref: str, x: float, y: float) -> str:
    PARTS.append(Part(ref, "R-78E5.0-1.0", "SIP-3_P2.54", x, y, 0, "Hand solder", "Fixed 5-V 1-A DC/DC; pin 1 IN, 2 GND, 3 OUT"))
    pads = [th_pad("1", 0, 0, "+9V_PROT", "rect"), th_pad("2", 2.54, 0, "GND"), th_pad("3", 5.08, 0, "+5V")]
    return footprint("MEFX:SIP3_R78E", ref, "R-78E5.0-1.0", x, y, "through_hole", pads, [fp_rect(-1.5, -2.0, 6.6, 10.5)])


def footprint(libname: str, ref: str, value: str, x: float, y: float, attr: str, pads: list[str], graphics: list[str]) -> str:
    lines = [
        f'\t(footprint "{libname}"',
        '\t\t(layer "F.Cu")',
        f'\t\t(uuid "{uid()}")',
        f"\t\t(at {fmt(x)} {fmt(y)})",
        f"\t\t(attr {attr})",
        prop("Reference", ref, 0, -2.0, "F.SilkS", True),
        prop("Value", value, 0, 2.0, "F.Fab"),
        prop("Footprint", libname, 0, 0, "F.Fab", True),
    ]
    lines.extend(graphics)
    lines.extend(pads)
    lines.append("\t)")
    return "\n".join(lines)


def board_text(text: str, x: float, y: float, size: float = 1.2) -> str:
    return (
        f'\t(gr_text "{text}"\n'
        f"\t\t(at {fmt(x)} {fmt(y)} 0)\n"
        '\t\t(layer "F.SilkS")\n'
        f'\t\t(uuid "{uid()}")\n'
        "\t\t(effects\n"
        "\t\t\t(font\n"
        f"\t\t\t\t(size {fmt(size)} {fmt(size)})\n"
        "\t\t\t\t(thickness 0.15)\n"
        "\t\t\t)\n"
        "\t\t)\n"
        "\t)"
    )


def edge_line(x1: float, y1: float, x2: float, y2: float) -> str:
    return (
        "\t(gr_line\n"
        f"\t\t(start {fmt(x1)} {fmt(y1)})\n"
        f"\t\t(end {fmt(x2)} {fmt(y2)})\n"
        "\t\t(stroke\n"
        "\t\t\t(width 0.1)\n"
        "\t\t\t(type solid)\n"
        "\t\t)\n"
        '\t\t(layer "Edge.Cuts")\n'
        f'\t\t(uuid "{uid()}")\n'
        "\t)"
    )


def zone(net: str, layer: str, points: list[tuple[float, float]]) -> str:
    pts = "\n".join([f"\t\t\t\t(xy {fmt(x)} {fmt(y)})" for x, y in points])
    return (
        "\t(zone\n"
        f"\t\t(net {NET_ID[net]})\n"
        f'\t\t(net_name "{net}")\n'
        f'\t\t(layer "{layer}")\n'
        f'\t\t(uuid "{uid()}")\n'
        "\t\t(hatch edge 0.5)\n"
        "\t\t(connect_pads\n"
        "\t\t\t(clearance 0.25)\n"
        "\t\t)\n"
        "\t\t(min_thickness 0.25)\n"
        "\t\t(filled_areas_thickness no)\n"
        "\t\t(fill yes\n"
        "\t\t\t(thermal_gap 0.5)\n"
        "\t\t\t(thermal_bridge_width 0.5)\n"
        "\t\t)\n"
        "\t\t(polygon\n"
        "\t\t\t(pts\n"
        f"{pts}\n"
        "\t\t\t)\n"
        "\t\t)\n"
        "\t)\n"
    )


def keepout_zone(points: list[tuple[float, float]]) -> str:
    pts = "\n".join([f"\t\t\t\t(xy {fmt(x)} {fmt(y)})" for x, y in points])
    return (
        "\t(zone\n"
        "\t\t(net 0)\n"
        '\t\t(net_name "")\n'
        '\t\t(layers "F.Cu" "B.Cu")\n'
        f'\t\t(uuid "{uid()}")\n'
        "\t\t(hatch edge 0.5)\n"
        "\t\t(keepout\n"
        "\t\t\t(tracks not_allowed)\n"
        "\t\t\t(vias not_allowed)\n"
        "\t\t\t(pads not_allowed)\n"
        "\t\t\t(copperpour not_allowed)\n"
        "\t\t\t(footprints not_allowed)\n"
        "\t\t)\n"
        "\t\t(polygon\n"
        "\t\t\t(pts\n"
        f"{pts}\n"
        "\t\t\t)\n"
        "\t\t)\n"
        "\t)\n"
    )


def mount_hole(ref: str, x: float, y: float) -> str:
    PARTS.append(Part(ref, "M3", "MountingHole_3.2mm", x, y, 0, "Mechanical", "No copper mounting hole"))
    return footprint(
        "MEFX:MOUNT_M3",
        ref,
        "M3",
        x,
        y,
        "through_hole",
        [
            '\t\t(pad "" np_thru_hole circle\n'
            "\t\t\t(at 0 0)\n"
            "\t\t\t(size 3.2 3.2)\n"
            "\t\t\t(drill 3.2)\n"
            '\t\t\t(layers "*.Cu" "*.Mask")\n'
            f'\t\t\t(uuid "{uid()}")\n'
            "\t\t)"
        ],
        [fp_rect(-3.2, -3.2, 3.2, 3.2)],
    )


def npth_hole(ref: str, value: str, x: float, y: float, drill: float, note: str) -> str:
    PARTS.append(Part(ref, value, f"NPTH_{fmt(drill)}mm", x, y, 0, "Mechanical", note))
    radius = max(drill / 2 + 1.0, 2.0)
    return footprint(
        "MEFX:NPTH",
        ref,
        value,
        x,
        y,
        "through_hole",
        [
            '\t\t(pad "" np_thru_hole circle\n'
            "\t\t\t(at 0 0)\n"
            f"\t\t\t(size {fmt(drill)} {fmt(drill)})\n"
            f"\t\t\t(drill {fmt(drill)})\n"
            '\t\t\t(layers "*.Cu" "*.Mask")\n'
            f'\t\t\t(uuid "{uid()}")\n'
            "\t\t)"
        ],
        [fp_rect(-radius, -radius, radius, radius, "F.Fab")],
    )


def make_board() -> str:
    fps: list[str] = []

    fps.extend(
        [
            mount_hole("H1", 5, 38),
            mount_hole("H2", 145, 5),
            mount_hole("H3", 5, 85),
            mount_hole("H4", 145, 85),
            header("J1", "9V DC", 70, 10, [("+9V", "+9V_RAW"), ("GND", "GND")], True),
            sip3_regulator("U5", 84, 10),
            sot23_5_ldo("U4", 100, 11),
            header("J2", "INPUT", 8, 48, [("TIP", "INPUT_TIP"), ("GND", "GND")], True),
            header("J3", "ELECTRET MIC", 8, 70, [("MIC+", "MIC_BIAS"), ("GND", "GND")], True),
            header("J4", "FOOTSW", 100, 82, [("GPIO9", "FOOTSW_GPIO"), ("GND", "GND")], True),
            header("J5", "OUTPUT", 140, 50, [("TIP", "OUTPUT_TIP"), ("GND", "GND")], True),
            esp32_freenove_socket("U3", 4.37, 5),
            tssop24_cs4270("U2", 90, 55),
            soic8("U1", "TL072", 37, 49),
        ]
    )

    # Power and bias
    fps.extend(
        [
            diode("D1", "SS14", 78, 10, "+9V_RAW", "+9V_PROT"),
            resistor("R8", "10R", 79, 25, "+9V_PROT", "+9VA"),
            capacitor("C1", "10uF 25V X7R", 78, 16, "+9V_PROT", "GND", "1206"),
            capacitor("C2", "100nF", 82, 16, "+9V_PROT", "GND"),
            capacitor("C3", "10uF 25V X7R", 84, 25, "+9VA", "GND", "1206"),
            capacitor("C4", "100nF", 89, 25, "+9VA", "GND"),
            capacitor("C5", "10uF 25V X7R", 92, 10, "+5V", "GND", "1206"),
            capacitor("C6", "1uF", 96, 8, "+5V", "GND"),
            resistor("R9", "0R", 96, 16, "+5V", "+5V_AUDIO"),
            resistor("R12", "0R", 99, 36, "+3V3_LOGIC", "+3V3_DAC"),
            capacitor("C7", "10uF 25V X7R", 105, 8, "+3V3_LOGIC", "GND", "1206"),
            capacitor("C8", "100nF", 108, 11, "+3V3_LOGIC", "GND"),
            resistor("R50", "10k", 32, 37, "+9VA", "VBIAS_4V5"),
            resistor("R51", "10k", 38, 37, "VBIAS_4V5", "GND"),
            capacitor("C31", "10uF 25V X7R", 56, 34, "VBIAS_4V5", "GND", "1206"),
            capacitor("C32", "100nF", 61, 34, "VBIAS_4V5", "GND"),
        ]
    )

    # Input and ADC
    fps.extend(
        [
            resistor("R1", "1M", 14, 48, "INPUT_TIP", "GND"),
            capacitor("C10", "100nF", 19, 48, "INPUT_TIP", "IN_AC"),
            resistor("R2", "1M", 24, 48, "IN_AC", "VBIAS_4V5"),
            resistor("R3", "1k", 29, 46, "IN_AC", "TL072_A_INP"),
            resistor("R4", "0R", 34, 42, "TL072_A_OUT", "TL072_A_INN"),
            resistor("R5", "100k", 40, 42, "TL072_A_INN", "VBIAS_4V5"),
            capacitor("C13", "10uF 25V X7R", 48, 62, "TL072_A_OUT", "ADC_L_PRE", "1206"),
            resistor("R6", "2k", 72, 56.3, "ADC_L_PRE", "ADC_L"),
            capacitor("C14", "220pF C0G", 99, 46, "ADC_L", "GND"),
            resistor("R64", "2k", 104, 46, "ADC_L", "GND"),
            resistor("R20", "2.2k", 15, 66, "+5V_AUDIO", "MIC_BIAS"),
            capacitor("C17", "1uF", 20, 70, "MIC_BIAS", "MIC_AC", "1206"),
            resistor("R21", "1M", 25, 70, "MIC_AC", "VBIAS_4V5"),
            resistor("R22", "1k", 30, 68, "MIC_AC", "TL072_B_INP"),
            resistor("R23", "100k", 35, 61, "TL072_B_OUT", "TL072_B_INN"),
            resistor("R24", "10k", 41, 61, "TL072_B_INN", "VBIAS_4V5"),
            capacitor("C18", "10uF 25V X7R", 48, 70, "TL072_B_OUT", "ADC_R_PRE", "1206"),
            resistor("R7", "2k", 72, 60, "ADC_R_PRE", "ADC_R"),
            capacitor("C19", "220pF C0G", 99, 49, "ADC_R", "GND"),
            resistor("R65", "2k", 104, 49, "ADC_R", "GND"),
            capacitor("C20", "10uF 25V X7R", 104, 53, "CODEC_VQ", "GND", "1206"),
            capacitor("C33", "100nF", 96.2, 53.1, "CODEC_VQ", "GND", "0402"),
            capacitor("C22", "100nF", 96.2, 54.2, "CODEC_FILT", "GND", "0402"),
            capacitor("C34", "47uF 10V X5R", 104, 57, "CODEC_FILT", "GND", "1206"),
        ]
    )

    # DAC and controls
    fps.extend(
        [
            resistor("R30", "47k", 109, 49, "ADC_DOUT", "GND"),
            resistor("R31", "10k", 109, 46, "CODEC_RST", "GND"),
            resistor("R60", "10k", 80, 64, "CODEC_M1", "GND"),
            resistor("R61", "10k", 85, 64, "CODEC_M0", "GND"),
            resistor("R62", "10k", 90, 66, "CODEC_MDIV1", "GND"),
            resistor("R63", "10k", 95, 66, "CODEC_MDIV2", "GND"),
            capacitor("C27", "10uF 25V X7R", 80, 54, "+3V3_DAC", "GND", "1206"),
            capacitor("C28", "100nF", 84.5, 55.975, "GND", "+3V3_DAC", "0402"),
            capacitor("C35", "10uF 25V X7R", 104, 61, "+5V_AUDIO", "GND", "1206"),
            capacitor_v("C36", "100nF", 94.5, 55.65, "+5V_AUDIO", "GND", "0402"),
            capacitor("C24", "10uF 25V X7R", 109, 55, "CODEC_AOUT_L", "DAC_LOUT", "1206"),
            resistor("R35", "470R", 108, 67, "DAC_LOUT", "OUTPUT_TIP"),
            capacitor("C29", "3.3nF C0G", 114, 67, "OUTPUT_TIP", "GND"),
            resistor("R36", "10k", 123, 67, "OUTPUT_TIP", "GND"),
            resistor("R40", "10k", 94, 78, "+3V3_LOGIC", "FOOTSW_GPIO"),
            capacitor("C30", "100nF", 94, 84, "FOOTSW_GPIO", "GND"),
        ]
    )

    net_lines = "\n".join(["\t(net 0 \"\")"] + [f'\t(net {NET_ID[name]} "{name}")' for name in NETS])
    graphics = "\n".join(
        [
            edge_line(0, 0, 150, 0),
            edge_line(150, 0, 150, 90),
            edge_line(150, 90, 0, 90),
            edge_line(0, 90, 0, 0),
            board_text("MEFX-S3 PCBA 04", 82, 34, 1.2),
            board_text("ESP32 USB THIS SIDE", 13, 34, 0.9),
            board_text("9V CENTER NEGATIVE", 82, 5, 0.8),
        ]
    )
    zones = zone("GND", "F.Cu", [(1.5, 1.5), (148.5, 1.5), (148.5, 88.5), (1.5, 88.5)])
    zones += zone("GND", "B.Cu", [(1.5, 1.5), (148.5, 1.5), (148.5, 88.5), (1.5, 88.5)])
    zones += keepout_zone([(42.0, 7.5), (59.0, 7.5), (59.0, 27.5), (42.0, 27.5)])

    footprints = "\n".join(fps)
    return f"""(kicad_pcb
\t(version 20241030)
\t(generator "pcbnew")
\t(generator_version "10.0")
\t(general
\t\t(thickness 1.6)
\t\t(legacy_teardrops no)
\t)
\t(paper "A4")
\t(title_block
\t\t(title "MEFX-S3 JLCPCB PCBA 04")
\t\t(date "2026-06-17")
\t\t(rev "04")
\t\t(company "MEFX")
\t\t(comment 1 "JLCPCB order candidate 04. CS4270 codec and Freenove ESP32-S3 socket.")
\t)
\t(layers
\t\t(0 "F.Cu" signal)
\t\t(2 "B.Cu" signal)
\t\t(9 "F.Adhes" user)
\t\t(11 "B.Adhes" user)
\t\t(13 "F.Paste" user)
\t\t(15 "B.Paste" user)
\t\t(5 "F.SilkS" user)
\t\t(7 "B.SilkS" user)
\t\t(1 "F.Mask" user)
\t\t(3 "B.Mask" user)
\t\t(17 "Dwgs.User" user)
\t\t(19 "Cmts.User" user)
\t\t(21 "Eco1.User" user)
\t\t(23 "Eco2.User" user)
\t\t(25 "Edge.Cuts" user)
\t\t(27 "Margin" user)
\t\t(31 "F.CrtYd" user)
\t\t(29 "B.CrtYd" user)
\t\t(35 "F.Fab" user)
\t\t(33 "B.Fab" user)
\t)
\t(setup
\t\t(pad_to_mask_clearance 0)
\t\t(allow_soldermask_bridges_in_footprints no)
\t\t(tenting front back)
\t)
{net_lines}
{graphics}
{zones}
{footprints}
)
"""


def make_schematic_note() -> str:
    return f"""(kicad_sch
\t(version 20250610)
\t(generator "codex")
\t(generator_version "1")
\t(uuid "{uid()}")
\t(paper "A4")
\t(title_block
\t\t(title "MEFX-S3 PCBA Carrier Draft")
\t\t(date "2026-06-16")
\t\t(rev "draft-1")
\t\t(comment 1 "Schematic is not drawn yet. See docs/pcb-assembly/PCBA_ネットリスト.csv.")
\t)
\t(lib_symbols)
\t(text "PCB-only draft. Source netlist: docs/pcb-assembly/PCBA_ネットリスト.csv. Draw full schematic before final order."
\t\t(at 25.4 25.4 0)
\t\t(effects
\t\t\t(font
\t\t\t\t(size 1.27 1.27)
\t\t\t)
\t\t)
\t\t(uuid "{uid()}")
\t)
\t(sheet_instances
\t\t(path "/"
\t\t\t(page "1")
\t\t)
\t)
)
"""


def write_cpl() -> None:
    OUT_CPL.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CPL.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Designator", "Val", "Package", "Mid X", "Mid Y", "Rotation", "Layer", "Assembly", "Notes"])
        for part in PARTS:
            writer.writerow([part.ref, part.value, part.package, f"{part.x:.3f}", f"{part.y:.3f}", f"{part.rot:.1f}", "Top", part.assembly, part.notes])


def main() -> None:
    KICAD_DIR.mkdir(parents=True, exist_ok=True)
    pcb = make_board()
    OUT_PCB.write_text(pcb, encoding="utf-8")
    OUT_SCH_NOTE.write_text(make_schematic_note(), encoding="utf-8")
    OUT_README.write_text(
        "\n".join(
            [
                "MEFX-S3 KiCad PCBA draft",
                "=========================",
                "",
                "Generated files:",
                "- mefx_s3.kicad_pcb: PCB-only placement/net draft.",
                "- mefx_s3.kicad_sch: note-only schematic placeholder.",
                "",
                "Important:",
                "- This is NOT order-ready yet.",
                "- Open the PCB in KiCad, route all ratsnest connections, then run DRC.",
                "- After DRC is clean, export Gerber/BOM/CPL for PCBWay or JLCPCB.",
                "- Use docs/pcb-assembly/PCBA_基板設計_v1.txt as the design rule source.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    write_cpl()
    print(f"Wrote {OUT_PCB}")
    print(f"Wrote {OUT_SCH_NOTE}")
    print(f"Wrote {OUT_CPL}")


if __name__ == "__main__":
    main()
