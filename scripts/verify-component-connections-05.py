from pathlib import Path

import pcbnew


BOARD = Path("docs/kicad/mefx_s3.kicad_pcb")
REPORT = Path("docs/pcb-assembly/05_order_package/全部品接続検証レポート_05.txt")


TWO_PIN_EXPECTED = {
    "C1": ["+9V_PROT", "GND"],
    "C2": ["+9V_PROT", "GND"],
    "C3": ["+9VA", "GND"],
    "C4": ["+9VA", "GND"],
    "C5": ["+5V", "GND"],
    "C6": ["+5V", "GND"],
    "C7": ["+3V3_LOGIC", "GND"],
    "C8": ["+3V3_LOGIC", "GND"],
    "C10": ["INPUT_TIP", "IN_AC"],
    "C13": ["TL072_A_OUT", "ADC_L_PRE"],
    "C14": ["ADC_L", "GND"],
    "C17": ["MIC_BIAS", "MIC_AC"],
    "C18": ["TL072_B_OUT", "ADC_R_PRE"],
    "C19": ["ADC_R", "GND"],
    "C20": ["CODEC_VQ", "GND"],
    "C22": ["CODEC_FILT", "GND"],
    "C24": ["CODEC_AOUT_L", "DAC_LOUT"],
    "C27": ["+3V3_DAC", "GND"],
    "C28": ["+3V3_DAC", "GND"],
    "C29": ["OUTPUT_TIP", "GND"],
    "C30": ["FOOTSW_GPIO", "GND"],
    "C31": ["VBIAS_4V5", "GND"],
    "C32": ["VBIAS_4V5", "GND"],
    "C33": ["CODEC_VQ", "GND"],
    "C34": ["CODEC_FILT", "GND"],
    "C35": ["+5V_AUDIO", "GND"],
    "C36": ["+5V_AUDIO", "GND"],
    "D1": ["+9V_PROT", "+9V_RAW"],
    "J1": ["+9V_RAW", "GND"],
    "J2": ["INPUT_TIP", "GND"],
    "J3": ["MIC_BIAS", "GND"],
    "J4": ["FOOTSW_GPIO", "GND"],
    "J5": ["OUTPUT_TIP", "GND"],
    "R1": ["INPUT_TIP", "GND"],
    "R2": ["IN_AC", "VBIAS_4V5"],
    "R3": ["IN_AC", "TL072_A_INP"],
    "R4": ["TL072_A_OUT", "TL072_A_INN"],
    "R5": ["TL072_A_INN", "VBIAS_4V5"],
    "R6": ["ADC_L_PRE", "ADC_L"],
    "R7": ["ADC_R_PRE", "ADC_R"],
    "R8": ["+9V_PROT", "+9VA"],
    "R9": ["+5V", "+5V_AUDIO"],
    "R12": ["+3V3_LOGIC", "+3V3_DAC"],
    "R20": ["+5V_AUDIO", "MIC_BIAS"],
    "R21": ["MIC_AC", "VBIAS_4V5"],
    "R22": ["MIC_AC", "TL072_B_INP"],
    "R23": ["TL072_B_OUT", "TL072_B_INN"],
    "R24": ["TL072_B_INN", "VBIAS_4V5"],
    "R30": ["ADC_DOUT", "GND"],
    "R31": ["CODEC_RST", "GND"],
    "R35": ["DAC_LOUT", "OUTPUT_TIP"],
    "R36": ["OUTPUT_TIP", "GND"],
    "R40": ["+3V3_LOGIC", "FOOTSW_GPIO"],
    "R50": ["+9VA", "VBIAS_4V5"],
    "R51": ["VBIAS_4V5", "GND"],
    "R60": ["CODEC_M1", "GND"],
    "R61": ["CODEC_M0", "GND"],
    "R62": ["CODEC_MDIV1", "GND"],
    "R63": ["CODEC_MDIV2", "GND"],
    "R64": ["ADC_L", "GND"],
    "R65": ["ADC_R", "GND"],
    "U5": ["+9V_PROT", "GND", "+5V"],
}

PIN_EXPECTED = {
    "U1": {
        "1": "TL072_A_OUT",
        "2": "TL072_A_INN",
        "3": "TL072_A_INP",
        "4": "GND",
        "5": "TL072_B_INP",
        "6": "TL072_B_INN",
        "7": "TL072_B_OUT",
        "8": "+9VA",
    },
    "U2": {
        "1": "DAC_DIN",
        "2": "LRCK",
        "3": "MCLK",
        "4": "BCLK",
        "5": "+3V3_DAC",
        "6": "GND",
        "7": "ADC_DOUT",
        "8": "+3V3_DAC",
        "9": "CODEC_M1",
        "10": "CODEC_M0",
        "11": "+3V3_DAC",
        "12": "CODEC_MDIV1",
        "13": "CODEC_MDIV2",
        "14": "CODEC_RST",
        "15": "ADC_L",
        "16": "ADC_R",
        "17": "CODEC_VQ",
        "18": "CODEC_FILT",
        "19": "+5V_AUDIO",
        "20": "GND",
        "21": "NO_NET",
        "22": "CODEC_AOUT_L",
        "23": "NO_NET",
        "24": "NO_NET",
    },
    "U3": {
        "1": "+5V",
        "7": "FOOTSW_GPIO",
        "12": "MCLK",
        "13": "DAC_DIN",
        "14": "CODEC_RST",
        "16": "ADC_DOUT",
        "17": "LRCK",
        "18": "BCLK",
        "21": "GND",
    },
    "U4": {
        "1": "+5V_AUDIO",
        "2": "GND",
        "3": "+5V_AUDIO",
        "4": "NO_NET",
        "5": "+3V3_LOGIC",
    },
}


def ref_key(ref: str):
    prefix = "".join(ch for ch in ref if not ch.isdigit())
    number = "".join(ch for ch in ref if ch.isdigit())
    return prefix, int(number or 0), ref


def pad_nets(fp):
    return {pad.GetNumber(): (pad.GetNetname() or "NO_NET") for pad in fp.Pads()}


def check_two_pin(board, ref, expected_nets):
    fp = board.FindFootprintByReference(ref)
    if not fp:
        return False, f"{ref}: missing footprint"
    nets = [net for _, net in sorted(pad_nets(fp).items())]
    if sorted(nets) != sorted(expected_nets):
        return False, f"{ref}: expected {expected_nets}, actual {nets}"
    return True, f"{ref}: OK {nets}"


def check_pin_map(board, ref, expected):
    fp = board.FindFootprintByReference(ref)
    if not fp:
        return False, f"{ref}: missing footprint"
    actual = pad_nets(fp)
    errors = []
    for pin, exp in expected.items():
        got = actual.get(pin, "MISSING_PAD")
        if got != exp:
            errors.append(f"pin {pin}: expected {exp}, actual {got}")
    if errors:
        return False, f"{ref}: " + "; ".join(errors)
    return True, f"{ref}: OK"


board = pcbnew.LoadBoard(str(BOARD))
lines = []
failures = []
checked_refs = set()
all_refs = {fp.GetReference() for fp in board.GetFootprints()}
ignored_refs = {"H1", "H2", "H3", "H4"}

lines.append("MEFX-S3 PCBA 05 全部品接続検証レポート")
lines.append("=======================================")
lines.append("")

lines.append("2端子/3端子部品")
lines.append("---------------")
for ref in sorted(TWO_PIN_EXPECTED, key=ref_key):
    checked_refs.add(ref)
    ok, message = check_two_pin(board, ref, TWO_PIN_EXPECTED[ref])
    lines.append(("OK  " if ok else "NG  ") + message)
    if not ok:
        failures.append(message)

lines.append("")
lines.append("IC/ソケットのピン番号別確認")
lines.append("---------------------------")
for ref in sorted(PIN_EXPECTED, key=ref_key):
    checked_refs.add(ref)
    ok, message = check_pin_map(board, ref, PIN_EXPECTED[ref])
    lines.append(("OK  " if ok else "NG  ") + message)
    if not ok:
        failures.append(message)

lines.append("")
lines.append("チェック対象の網羅性")
lines.append("--------------------")
missing_from_check = sorted(all_refs - checked_refs - ignored_refs, key=ref_key)
missing_on_board = sorted((set(TWO_PIN_EXPECTED) | set(PIN_EXPECTED)) - all_refs, key=ref_key)
if missing_from_check:
    failures.append("未監査フットプリント: " + ", ".join(missing_from_check))
    lines.append("NG: 未監査フットプリントあり: " + ", ".join(missing_from_check))
else:
    lines.append("OK: 固定穴H1-H4を除く全フットプリントを監査対象に含めた。")
if missing_on_board:
    failures.append("基板上に存在しない期待部品: " + ", ".join(missing_on_board))
    lines.append("NG: 基板上に存在しない期待部品あり: " + ", ".join(missing_on_board))
else:
    lines.append("OK: 期待接続表にある部品はすべて基板上に存在。")

lines.append("")
lines.append("判定")
lines.append("----")
if failures:
    lines.append(f"NG: {len(failures)}件の不一致あり。")
    for item in failures:
        lines.append("- " + item)
else:
    lines.append("OK: 定義した全部品接続はKiCad PCB実データと一致。")

REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("\n".join(lines))
