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
# Optional extra file: one climate-change note per species id
CLIMATE_PATH = PROJECT / "tools" / "climate_notes.csv"
# Optional extra file: parasite and food-safety notes per species id
PARASITE_PATH = PROJECT / "tools" / "parasite_notes.csv"
JSON_PATH = PROJECT / "data" / "species.json"

# These must match the location ids in app.js
VALID_LOCATIONS = {
    "chesapeake", "ocean-city", "cape-cod", "outer-banks", "miami", "key-west",
    "gulf-of-mexico", "galveston", "santa-monica", "monterey", "newport",
    "alaska-coast", "honolulu",
}
VALID_STATUS = {"native", "invasive", "endangered", "threatened", "protected"}
VALID_SEASONS = {"Spring", "Summer", "Fall", "Winter", "All"}

REQUIRED = [
    "id", "name", "scientific_name", "status", "locations", "seasons",
    "temp_min_f", "temp_max_f", "best_time", "diet", "habitat",
    "id_tips", "what_to_do", "source",
]


def make_id(text):
    """'  Bonnet head-Shark ' -> 'bonnet-head-shark'"""
    return "-".join(text.strip().lower().replace("_", " ").split()).replace("--", "-")


def tidy_row(row):
    """Fix small typing differences so they don't cause errors:
    extra spaces, capital letters in ids/status/locations, 'summer' vs 'Summer'."""
    row = {key.strip(): (value or "").strip() for key, value in row.items() if key}
    row["id"] = make_id(row.get("id", ""))
    row["status"] = row.get("status", "").lower()
    row["locations"] = ";".join(make_id(p) for p in split_list(row.get("locations", "")))
    row["seasons"] = ";".join(p.capitalize() for p in split_list(row.get("seasons", "")))
    return row


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


def load_climate_notes():
    """Read tools/climate_notes.csv into {species id: {note, source}}.
    The file is optional; species without a note simply show none."""
    notes = {}
    if not CLIMATE_PATH.exists():
        return notes
    with open(CLIMATE_PATH, newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            if row.get("id", "").strip() and row.get("climate_note", "").strip():
                notes[row["id"].strip()] = {
                    "note": row["climate_note"].strip(),
                    "source": row.get("source", "").strip(),
                }
    return notes


def load_parasite_notes():
    """Read tools/parasite_notes.csv into {species id: {note, foodSafety, source}}.
    The file is optional; species without a note simply show none."""
    notes = {}
    if not PARASITE_PATH.exists():
        return notes
    with open(PARASITE_PATH, newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            if row.get("id", "").strip() and row.get("parasite_note", "").strip():
                notes[row["id"].strip()] = {
                    "note": row["parasite_note"].strip(),
                    "foodSafety": row.get("food_safety", "").strip(),
                    "source": row.get("source", "").strip(),
                }
    return notes


def main():
    climate_notes = load_climate_notes()
    parasite_notes = load_parasite_notes()
    species = []
    problems = []
    seen_ids = set()

    with open(CSV_PATH, newline="", encoding="utf-8-sig") as file:
        lines = file.read().splitlines()

    # Skip anything above the header row (for example a title like "species")
    header_index = next((i for i, text in enumerate(lines) if text.strip().startswith("id,")), None)
    if header_index is None:
        print("Could not find the header row (it should start with 'id,') in species.csv")
        return
    if header_index > 0:
        print(f"Note: skipped {header_index} line(s) above the header row in species.csv")

    reader = csv.DictReader(lines[header_index:])
    first_data_line = header_index + 2  # spreadsheet line numbers start at 1
    for line, raw_row in enumerate(reader, start=first_data_line):
            if not any((value or "").strip() for value in raw_row.values()):
                continue  # skip empty rows
            row = tidy_row(raw_row)
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
                "climate": climate_notes.get(row["id"]),
                "parasite": parasite_notes.get(row["id"]),
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
    with_notes = sum(1 for s in species if s["climate"])
    print(f"  {with_notes} species have a climate note")
    print(f"  {sum(1 for s in species if s['parasite'])} species have a parasite note")
    unused = (set(climate_notes) | set(parasite_notes)) - {s["id"] for s in species}
    for species_id in sorted(unused):
        print(f"  (a notes file has '{species_id}', but no species uses that id)")
    for place in sorted(VALID_LOCATIONS):
        count = sum(place in s["locations"] for s in species)
        print(f"  {place}: {count} species")


if __name__ == "__main__":
    main()


