#!/usr/bin/env python3
"""
Find every /explore/<slug> topic page that shows the empty-lessons message:
    "No lesson covers this topic yet. It is mapped in the curriculum and waiting for content."

The message renders when the topic detail API returns zero lessons, and that list comes
from exactly one server query (server/src/modules/curriculum/curriculum.repo.ts,
getTopicBySlug): lessons that are published, belong to a published course, and are linked
to the topic via lesson_topics. This script replicates that condition 1:1 against the
SQLite database, so no running server is needed.

Output: topics_without_lessons.txt next to this script (one topic per line, plus a count).
Usage:  python check_topics_without_lessons.py [--db PATH] [--include-drafts]
"""

import argparse
import sqlite3
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DB = SCRIPT_DIR / "server" / "data" / "ai-mastery.sqlite"
OUTPUT_FILE = SCRIPT_DIR / "topics_without_lessons.txt"

# Mirrors the lessons query in getTopicBySlug (curriculum.repo.ts): a topic page shows the
# message when no lesson satisfies all three joins/filters below.
SQL = """
SELECT t.slug, t.name, t.status,
       s.name AS subdomain, d.name AS domain
FROM topics t
JOIN subdomains s ON s.id = t.subdomain_id
JOIN domains d ON d.id = s.domain_id
WHERE NOT EXISTS (
    SELECT 1
    FROM lesson_topics lt
    JOIN lessons l ON l.id = lt.lesson_id
    JOIN courses c ON c.id = l.course_id
    WHERE lt.topic_id = t.id
      AND l.status = 'published'
      AND c.status = 'published'
)
ORDER BY d.name, s.name, t.name
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Path to ai-mastery.sqlite")
    parser.add_argument(
        "--include-drafts",
        action="store_true",
        help="Also list draft topics (their pages are only visible to staff, "
        "but they show the same message when viewed)",
    )
    args = parser.parse_args()

    if not args.db.exists():
        print(f"ERROR: database not found: {args.db}")
        print("Point --db at the right file (default: server/data/ai-mastery.sqlite).")
        return 1

    con = sqlite3.connect(f"file:{args.db.resolve()}?mode=ro", uri=True)
    try:
        rows = con.execute(SQL).fetchall()
        total_published = con.execute(
            "SELECT COUNT(*) FROM topics WHERE status = 'published'"
        ).fetchone()[0]
        total_drafts = con.execute(
            "SELECT COUNT(*) FROM topics WHERE status = 'draft'"
        ).fetchone()[0]
    finally:
        con.close()

    # The message shows on any viewable topic page with zero lessons. Published pages are
    # visible to everyone; draft pages only to staff (included with --include-drafts).
    hits = [r for r in rows if r[2] == "published"]
    draft_hits = [r for r in rows if r[2] != "published"]
    selected = hits + (draft_hits if args.include_drafts else [])

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("Topics whose /explore page shows 'No lesson covers this topic yet'\n")
        f.write(f"Generated from: {args.db.resolve()}\n")
        f.write(f"Total: {len(selected)} topics "
                f"({len(hits)} published"
                + (f", {len(draft_hits)} draft" if args.include_drafts else "")
                + ")\n\n")
        for slug, name, status, subdomain, domain in selected:
            f.write(f"{name}  |  /explore/{slug}  |  {domain} / {subdomain}\n")

    print(f"Topics without lessons: {len(selected)} "
          f"(published: {len(hits)}"
          + (f", draft: {len(draft_hits)}" if args.include_drafts else "")
          + f"; published total: {total_published}, drafts: {total_drafts})")
    print(f"Names written to: {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
