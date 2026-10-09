#!/usr/bin/env python3
"""Pack the per-line MP3 files of every book into one Opus file per book.

Input layout (the original media):  <src>/audio/<book path>/<line number>.mp3
Output:  public/audio/<book id>.webm   (mono Opus, speech-tuned)
         and the start/end time of every line, written into public/content/books/<id>.json
         as "s" and "e" (seconds).

Lines are decoded to PCM and concatenated sample-exactly, so the offsets are exact.
A missing or unreadable file becomes silence of the line's stored duration.

Usage:  python scripts/build_audio.py <src> [--bitrate 20k] [--jobs 6] [--only 1,2,3]
Requires ffmpeg on PATH.
"""
import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "public" / "content"
OUT = ROOT / "public" / "audio"
RATE = 48000  # Opus native rate
BYTES_PER_SAMPLE = 2  # s16le mono
DECODERS = os.cpu_count() or 4


def decode(path: Path) -> bytes | None:
    try:
        r = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"],
            capture_output=True,
            check=True,
        )
        return r.stdout or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def build_book(book: dict, src: Path, bitrate: str) -> tuple[int, int]:
    book_file = CONTENT / "books" / f"{book['id']}.json"
    data = json.loads(book_file.read_text(encoding="utf-8"))
    out = OUT / f"{book['id']}.webm"
    enc = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-y",
            "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-i", "-",
            "-c:a", "libopus", "-b:a", bitrate, "-application", "audio",
            "-frame_duration", "20", "-cues_to_front", "1",
            str(out),
        ],
        stdin=subprocess.PIPE,
    )
    samples = 0
    missing = 0
    # Decode lines in parallel (ffmpeg start-up dominates), write them in order.
    with ThreadPoolExecutor(DECODERS) as pool:
        chunks = pool.map(lambda c: decode(src / "audio" / book["path"] / f"{c['n']}.mp3"), data["captions"])
        for c, chunk in zip(data["captions"], chunks):
            if chunk is None:
                missing += 1
                chunk = bytes(int(c["d"] * RATE) * BYTES_PER_SAMPLE)
            c["s"] = round(samples / RATE, 3)
            samples += len(chunk) // BYTES_PER_SAMPLE
            c["e"] = round(samples / RATE, 3)
            enc.stdin.write(chunk)
    enc.stdin.close()
    if enc.wait() != 0:
        raise RuntimeError(f"encoding book {book['id']} failed")
    book_file.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(data["captions"]), missing


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("--bitrate", default="20k")
    ap.add_argument("--jobs", type=int, default=2)
    ap.add_argument("--only", default="")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    catalog = json.loads((CONTENT / "catalog.json").read_text(encoding="utf-8"))
    books = catalog["books"]
    if args.only:
        wanted = {int(x) for x in args.only.split(",")}
        books = [b for b in books if b["id"] in wanted]

    def run(b):
        lines, missing = build_book(b, args.src, args.bitrate)
        size = (OUT / f"{b['id']}.webm").stat().st_size / 1e6
        print(f"{b['id']:>3} {b['title'][:40]:<40} {lines:>5} lines  {missing:>3} missing  {size:6.1f} MB", flush=True)

    with ThreadPoolExecutor(args.jobs) as pool:
        list(pool.map(run, books))
    return 0


if __name__ == "__main__":
    sys.exit(main())
