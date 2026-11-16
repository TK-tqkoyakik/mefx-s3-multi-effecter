"""Validate the exact bundled distribution set and cached model, without network access."""
import argparse
import hashlib
import importlib.metadata
import json
import platform
from pathlib import Path
import re


def verify(packages, torch_home):
    root = Path(__file__).resolve().parent
    lock = json.loads((root / "desktop-python-archives.json").read_text(encoding="utf-8"))
    if platform.python_version() != lock["python"] or platform.machine().upper() not in ("AMD64", "X86_64"):
        raise ValueError("Wrong Python runtime for the locked analysis bundle")
    normalize = lambda name: re.sub(r"[-_.]+", "-", name.lower())
    expected = {item["name"]: item["version"] for item in lock["records"] if item.get("role") != "build"}
    actual = {normalize(item.metadata["Name"]): item.version for item in importlib.metadata.distributions(path=[str(packages)])}
    if actual != expected:
        raise ValueError(f"Distribution set differs from lock: {actual}")
    models = json.loads((root / "desktop-analysis-models.lock.json").read_text(encoding="utf-8"))
    for model in models["files"]:
        candidate = (torch_home / model["path"]).resolve()
        candidate.relative_to(torch_home.resolve())
        with candidate.open("rb") as source:
            actual_hash = hashlib.file_digest(source, "sha256").hexdigest()
        if actual_hash != model["sha256"]:
            raise ValueError(f"Model checksum mismatch: {model['path']}")
    print(f"Verified Python {lock['python']}, {len(actual)} exact distributions, and htdemucs model SHA-256.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--packages", type=Path, required=True)
    parser.add_argument("--torch-home", type=Path, required=True)
    args = parser.parse_args()
    verify(args.packages, args.torch_home)
