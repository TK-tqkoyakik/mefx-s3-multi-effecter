from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "pcb-assembly" / "07_order_package"

for name in ["UPLOAD_THIS_GERBER_07.zip", "UPLOAD_THIS_BOM_07.csv", "UPLOAD_THIS_CPL_07.csv"]:
    path = OUT / name
    if not path.exists() or path.stat().st_size == 0:
        raise SystemExit(f"NG: missing or empty {path}")

with (OUT / "UPLOAD_THIS_CPL_07.csv").open(encoding="utf-8-sig") as handle:
    lines = [line.strip().split(",") for line in handle if line.strip()]
header, rows = lines[0], lines[1:]
refs = {row[0] for row in rows}

expected_rotations = {
    "U1": "270.0",
    "U2": "270.0",
    "C36": "90.0",
    "U4": "0.0",
    "D1": "0.0",
}

errors = []
if header != ["Designator", "Mid X", "Mid Y", "Layer", "Rotation"]:
    errors.append(f"unexpected CPL header: {header}")

for ref, expected in expected_rotations.items():
    match = [row for row in rows if row[0] == ref]
    if not match:
        errors.append(f"{ref}: missing from CPL")
    elif match[0][4] != expected:
        errors.append(f"{ref}: expected rotation {expected}, actual {match[0][4]}")

with (OUT / "UPLOAD_THIS_BOM_07.csv").open(encoding="utf-8-sig") as handle:
    bom_text = handle.read()

for required in ["U1", "U2", "U4", "D1", "C36"]:
    if required not in bom_text:
        errors.append(f"{required}: missing from BOM")

if len(rows) != 59:
    errors.append(f"CPL row count expected 59, actual {len(rows)}")

if errors:
    for error in errors:
        print("NG:", error)
    raise SystemExit(1)

print("ORDER 07 VERIFY PASSED")
print(f"CPL references: {len(refs)}")
for ref in ["U1", "U2", "U4", "D1", "C36"]:
    row = [row for row in rows if row[0] == ref][0]
    print(f"{ref}: rotation={row[4]} x={row[1]} y={row[2]}")
