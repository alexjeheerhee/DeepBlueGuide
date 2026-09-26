"""
build_data.py
Reads tools/species.csv, checks every row for mistakes,
and saves the result as data/species.json for the app.

Run from the project folder:
    python tools/build_data.py
"""

import csv
import json
from pathlib import Path

# Folders are found relative to this script, so it works from anywhere
PROJECT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT / "tools" / "species.csv"
JSON_PATH = PROJECT / "data" / "species.json"

# These must match the location ids in app.js
VALID_LOCATIONS = {
    "ocean-city", "cape-cod", "outer-banks", "miami", "galveston",
    "santa-monica", "monterey", "newport", "honolulu",
}
VALID_STATUS = {"native", "invasive", "endangered", "threatened", "protected"}
VALID_SEASONS = {"Spring", "Summer", "Fall", "Winter", "All"}

REQUIRED = [
    "id", "name", "scientific_name", "status", "locations", "seasons",
    "temp_min_f", "temp_max_f", "best_time", "diet", "habitat",
    "id_tips", "what_to_do", "source",
]


def split_list(text):
    """'a;b;c' -> ['a', 'b', 'c']"""
    return [part.strip() for part in text.split(";") if part.strip()]


def check_row(row, line):
    """Return a list of problems found in one row."""
    problems = []

    for field in REQUIRED:
        if not row.get(field, "").strip():
            problems.append(f"line {line}: '{field}' is empty")

    if row["status"] not in VALID_STATUS:
        problems.append(f"line {line}: unknown status '{row['status']}'")

    for place in split_list(row["locations"]):
        if place not in VALID_LOCATIONS:
            problems.append(f"line {line}: unknown location '{place}'")

    for season in split_list(row["seasons"]):
        if season not in VALID_SEASONS:
            problems.append(f"line {line}: unknown season '{season}'")

    try:
        low = int(row["temp_min_f"])
        high = int(row["temp_max_f"])
        if low > high:
            problems.append(f"line {line}: temp_min_f is bigger than temp_max_f")
    except ValueError:
        problems.append(f"line {line}: temperatures must be whole numbers")

    return problems


def main():
    species = []
    problems = []
    seen_ids = set()

    with open(CSV_PATH, newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        # line 1 is the header, so data starts on line 2
        for line, row in enumerate(reader, start=2):
            row_problems = check_row(row, line)
            if row["id"] in seen_ids:
                row_problems.append(f"line {line}: id '{row['id']}' is used twice")
            seen_ids.add(row["id"])

            if row_problems:
                problems.extend(row_problems)
                continue

            species.append({
                "id": row["id"],
                "name": row["name"],
                "scientificName": row["scientific_name"],
                "status": row["status"],
                "locations": split_list(row["locations"]),
                "seasons": split_list(row["seasons"]),
                "tempMinF": int(row["temp_min_f"]),
                "tempMaxF": int(row["temp_max_f"]),
                "bestTime": row["best_time"],
                "diet": row["diet"],
                "habitat": row["habitat"],
                "idTips": row["id_tips"],
                "whatToDo": row["what_to_do"],
                "source": row["source"],
            })

    if problems:
        print("Fix these problems in species.csv, then run again:")
        for problem in problems:
            print("  -", problem)
        return

    JSON_PATH.parent.mkdir(exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as file:
        json.dump(species, file, indent=2, ensure_ascii=False)

    print(f"Saved {len(species)} species to {JSON_PATH.relative_to(PROJECT)}")
    for place in sorted(VALID_LOCATIONS):
        count = sum(place in s["locations"] for s in species)
        print(f"  {place}: {count} species")


if __name__ == "__main__":
    main()

