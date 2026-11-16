from pathlib import Path

from pypdf import PdfReader


items = {
    "U4_AP2112_C51118": {
        "pdf": Path("docs/hardware/datasheets_05/C51118_lcsc.pdf"),
        "keywords": ["VIN", "GND", "EN", "NC", "VOUT", "SOT25", "SOT-23-5"],
    },
    "U2_CS4270_C1323229": {
        "pdf": Path("docs/hardware/datasheets_05/C1323229_lcsc.pdf"),
        "keywords": ["SDIN", "LRCK", "MCLK", "SCLK", "RST", "AINA", "FILT", "TSSOP"],
    },
    "U1_TL072_C6961": {
        "pdf": Path("docs/hardware/datasheets_05/C6961_lcsc.pdf"),
        "keywords": ["Output 1", "Inverting input 1", "Non-inverting input 1", "VCC", "SO8"],
    },
    "D1_SS14_C2480": {
        "pdf": Path("docs/hardware/datasheets_05/C2480_lcsc.pdf"),
        "keywords": ["SMA", "DO-214AC", "Cathode", "Polarity", "SS14"],
    },
}


def compact(text):
    return " ".join((text or "").replace("\x00", " ").split())


for name, info in items.items():
    path = info["pdf"]
    print(f"## {name}")
    print(path)
    if not path.exists():
        print("missing")
        continue
    reader = PdfReader(str(path))
    hits = []
    for index, page in enumerate(reader.pages):
        text = compact(page.extract_text() or "")
        lower = text.lower()
        score = sum(1 for key in info["keywords"] if key.lower() in lower)
        if score:
            hits.append((score, index + 1, text[:2200]))
    for score, page, text in sorted(hits, reverse=True)[:4]:
        print(f"-- page {page}, score {score} --")
        print(text)
        print()
