from __future__ import annotations

import gzip
import io
import json
import re
import sys
import urllib.request


BASE = "https://yaqwsx.github.io/jlcparts/data/"


def main() -> None:
    patterns = [re.compile(value, re.IGNORECASE) for value in sys.argv[1:]]
    manifest = json.load(urllib.request.urlopen(BASE + "manifest.json"))
    category = next(item for item in manifest["categories"] if item["id"] == 53)
    matches = [[] for _ in patterns]
    for shard in category["shards"]:
        compressed = urllib.request.urlopen(BASE + shard).read()
        with gzip.open(io.BytesIO(compressed), "rt", encoding="utf-8") as file:
            next(file)
            for line in file:
                row = json.loads(line)
                description = row[3]
                for index, pattern in enumerate(patterns):
                    if pattern.search(description):
                        matches[index].append({
                            "lcsc": row[0], "mfr": row[1], "joints": row[2],
                            "description": description, "stock": row[9],
                            "price": row[5][0]["price"] if row[5] else None,
                        })
    for pattern, result in zip(patterns, matches):
        print(f"=== {pattern.pattern} ===")
        result.sort(key=lambda item: (-item["stock"], item["price"] or 999))
        for item in result[:20]:
            print(json.dumps(item, ensure_ascii=False))


if __name__ == "__main__":
    main()
