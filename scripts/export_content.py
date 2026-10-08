#!/usr/bin/env python3
"""Export the SpeakAlong book catalogue from a PostgreSQL database to static JSON.

Only content tables are read (book_booklevel, book_book, book_caption).
No user, progress, bookmark or account table is ever queried.

Usage:
    DATABASE_URL=postgresql://user:pass@localhost/db python scripts/export_content.py

Output:
    public/content/catalog.json        levels + book metadata
    public/content/books/<id>.json     captions of each book
"""
import json
import os
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "content"

# Display fixes for typos in the original titles.
TITLE_FIXES = {
    "The fiftheen character": "The Fifteenth Character",
    "Aladin and the Enchanted Lamp": "Aladdin and the Enchanted Lamp",
    "Logan Choice": "Logan's Choice",
    "Seven stories of mistery and horror": "Seven Stories of Mystery and Horror",
    "Love among Haystacks": "Love Among the Haystacks",
    "Pride and Perjudice": "Pride and Prejudice",
    "The woman in black": "The Woman in Black",
    "The call of the wild": "The Call of the Wild",
    "Diamonds are forever": "Diamonds Are Forever",
    "Forget to remember": "Forget to Remember",
    "Bridget Jones diary": "Bridget Jones's Diary",
    "The sign of four": "The Sign of Four",
    "Sense and sensibility": "Sense and Sensibility",
    "The Riddle of the sands": "The Riddle of the Sands",
    "The age of innocence": "The Age of Innocence",
    "Live and let die": "Live and Let Die",
    "A woman in white": "The Woman in White",
    "Drive into danger": "Drive into Danger",
    "The princess diaries 1": "The Princess Diaries 1",
    "The princess diaries 2": "The Princess Diaries 2",
}


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is required", file=sys.stderr)
        return 1

    (OUT / "books").mkdir(parents=True, exist_ok=True)

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("SELECT id, level FROM book_booklevel ORDER BY level")
        levels = [{"id": i, "name": name, "index": int(name.split()[-1])} for i, name in cur.fetchall()]

        cur.execute(
            "SELECT id, title, book_path, level_id, image_url FROM book_book ORDER BY level_id, id"
        )
        books = []
        for book_id, title, path, level_id, image in cur.fetchall():
            cur.execute(
                "SELECT cc_number, cc, cc_spanish, duration FROM book_caption "
                "WHERE book_id = %s ORDER BY cc_number",
                (book_id,),
            )
            captions = [
                {"n": n, "en": en.strip(), "es": es.strip(), "d": round(float(d), 2)}
                for n, en, es, d in cur.fetchall()
            ]
            words = sum(len(c["en"].split()) for c in captions)
            seconds = sum(c["d"] for c in captions)
            books.append(
                {
                    "id": book_id,
                    "title": TITLE_FIXES.get(title, title),
                    "levelId": level_id,
                    "path": path.replace("\\", "/"),
                    "cover": image,
                    "captions": len(captions),
                    "words": words,
                    "minutes": round(seconds / 60),
                }
            )
            with open(OUT / "books" / f"{book_id}.json", "w", encoding="utf-8") as f:
                json.dump({"id": book_id, "captions": captions}, f, ensure_ascii=False, separators=(",", ":"))

    with open(OUT / "catalog.json", "w", encoding="utf-8") as f:
        json.dump({"version": 1, "levels": levels, "books": books}, f, ensure_ascii=False, indent=1)

    print(f"Exported {len(levels)} levels, {len(books)} books to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
