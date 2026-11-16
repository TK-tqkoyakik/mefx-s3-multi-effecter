from pathlib import Path

from pypdf import PdfReader


PDFS = {
    "CS4270": Path("docs/hardware/datasheets_02/CS4270.pdf"),
    "TL072": Path("docs/hardware/datasheets_02/tl072.pdf"),
}

KEYWORDS = {
    "CS4270": [
        "Pin Name",
        "VA",
        "VL",
        "AINA",
        "AOUTA",
        "FILT+",
        "VQ",
        "TSSOP",
        "reset",
    ],
    "TL072": [
        "Pin connections",
        "Output 1",
        "VCC",
        "SO8",
        "Supply voltage",
    ],
}


def compact(text: str) -> str:
    return " ".join(text.replace("\x00", " ").split())


for name, path in PDFS.items():
    print(f"## {name}: {path}")
    if not path.exists():
        print("missing")
        continue
    reader = PdfReader(str(path))
    hits = []
    for idx, page in enumerate(reader.pages):
        text = compact(page.extract_text() or "")
        lower = text.lower()
        score = sum(1 for key in KEYWORDS[name] if key.lower() in lower)
        if score:
            hits.append((score, idx + 1, text[:1800]))
    for score, page, text in sorted(hits, reverse=True)[:8]:
        print(f"\n-- page {page}, score {score} --")
        print(text)
