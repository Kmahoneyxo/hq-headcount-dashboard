#!/usr/bin/env python3
"""Save dp-mcp export_csv tool output to a clean CSV file."""

from __future__ import annotations

import re
import sys
from pathlib import Path


def clean_csv_text(text: str) -> str:
    text = text.strip()
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1].replace("\\n", "\n")
    text = re.sub(r"\n---[\s\S]*$", "", text)
    text = re.sub(r"\n\[Exported[\s\S]*$", "", text)
    return text + ("\n" if text and not text.endswith("\n") else "")


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: save-mcp-csv.py <mcp-output.txt> <out.csv>")
        sys.exit(1)
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    body = clean_csv_text(src.read_text(encoding="utf-8"))
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(body, encoding="utf-8")
    rows = max(0, body.count("\n") - 1) if body else 0
    print(f"Wrote {rows:,} data rows to {dst}")


if __name__ == "__main__":
    main()
