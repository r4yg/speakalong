#!/usr/bin/env python3
"""One-off: download the original per-line MP3 files listed in the catalog.

Used by the build-audio workflow to produce the per-book Opus files once.
Usage: python scripts/download_media.py <dest> <base url>
"""
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "public" / "content"


def main() -> int:
    dest, base = Path(sys.argv[1]), sys.argv[2].rstrip("/") + "/"
    catalog = json.loads((CONTENT / "catalog.json").read_text(encoding="utf-8"))
    paths = []
    for b in catalog["books"]:
        captions = json.loads((CONTENT / "books" / f"{b['id']}.json").read_text(encoding="utf-8"))["captions"]
        paths += [f"audio/{b['path']}/{c['n']}.mp3" for c in captions]

    fails = []

    def get(p: str):
        out = dest / p
        if out.exists() and out.stat().st_size > 0:
            return
        out.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(5):
            try:
                with urllib.request.urlopen(base + p, timeout=60) as r:
                    data = r.read()
                tmp = out.with_suffix(".part")
                tmp.write_bytes(data)
                os.replace(tmp, out)
                return
            except Exception as e:  # noqa: BLE001
                err = e
                time.sleep(1 + attempt)
        fails.append(f"{p}: {err}")

    with ThreadPoolExecutor(64) as ex:
        list(ex.map(get, paths))
    print(f"downloaded {len(paths) - len(fails)}/{len(paths)} files")
    for f in fails[:50]:
        print("FAIL", f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
