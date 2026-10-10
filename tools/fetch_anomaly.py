"""
fetch_anomaly.py
Downloads today's "compared to normal" sea temperature (sea surface
temperature anomaly) for every app location and saves it to data/anomaly.json.

The app tries live NOAA data first and uses this saved copy if the NOAA
servers are slow. Run it before a demo (or once a day):
    python3 tools/fetch_anomaly.py
"""

import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
JSON_PATH = PROJECT / "data" / "anomaly.json"

# Must match LOCATIONS in app.js
LOCATIONS = {
    "chesapeake":   (38.85, -76.40),
    "ocean-city":   (38.33, -75.05),
    "cape-cod":     (41.70, -69.90),
    "outer-banks":  (35.25, -75.45),
    "miami":        (25.77, -80.10),
    "galveston":    (29.20, -94.75),
    "santa-monica": (33.95, -118.55),
    "monterey":     (36.80, -121.95),
    "newport":      (44.63, -124.10),
    "key-west":     (24.45, -81.80),
    "gulf-of-mexico": (29.75, -88.00),
    "alaska-coast": (57.70, -152.20),
    "honolulu":     (21.25, -157.85),
}


def oisst_url(lat, lon):
    """NOAA OISST v2.1 (preliminary): a small box (±0.25°) around the location."""
    return ("https://coastwatch.pfeg.noaa.gov/erddap/griddap/"
            "ncdcOisst21NrtAgg_LonPM180.json?anom"
            + "%5B(last)%5D%5B(0.0)%5D"
            + f"%5B({lat - 0.25:.2f}):1:({lat + 0.25:.2f})%5D"
            + f"%5B({lon - 0.25:.2f}):1:({lon + 0.25:.2f})%5D")


def crw_url(lat, lon):
    """NOAA Coral Reef Watch 5 km anomaly (backup server).
    Latitude is stored north to south, so the bigger number comes first."""
    return ("https://coastwatch.noaa.gov/erddap/griddap/"
            "noaacrwsstanomalyDaily.json?sea_surface_temperature_anomaly"
            + "%5B(last)%5D"
            + f"%5B({lat + 0.25:.2f}):5:({lat - 0.25:.2f})%5D"
            + f"%5B({lon - 0.25:.2f}):5:({lon + 0.25:.2f})%5D")


SOURCES = [("NOAA OISST v2.1", oisst_url), ("NOAA Coral Reef Watch", crw_url)]

# Some servers reset connections from unknown programs, so say who we are
HEADERS = {"User-Agent": "Mozilla/5.0 (deepBlueGuide student app; data download)"}


def closest_anomaly(table, lat, lon):
    """Return the ocean point closest to (lat, lon), or None if all are land."""
    cols = table["columnNames"]
    i_time = cols.index("time")
    i_lat = cols.index("latitude")
    i_lon = cols.index("longitude")
    i_anom = next(i for i, name in enumerate(cols)
                  if name not in ("time", "zlev", "latitude", "longitude"))

    ocean = [row for row in table["rows"] if isinstance(row[i_anom], (int, float))]
    if not ocean:
        return None
    best = min(ocean, key=lambda r: (r[i_lat] - lat) ** 2 + (r[i_lon] - lon) ** 2)
    return {"time": best[i_time], "anomC": best[i_anom]}


def download(url):
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main():
    results = {}
    print("Downloading from NOAA. Each location can take up to a minute...")
    for place_id, (lat, lon) in LOCATIONS.items():
        for source_name, make_url in SOURCES:
            print(f"  {place_id}: trying {source_name}...", flush=True)
            start = time.time()
            try:
                result = closest_anomaly(download(make_url(lat, lon))["table"], lat, lon)
            except Exception as error:
                print(f"  {place_id}: {source_name} failed ({error})")
                continue
            if result is None:
                print(f"  {place_id}: {source_name} has no ocean data here")
                continue
            result["source"] = source_name
            results[place_id] = result
            change_f = result["anomC"] * 1.8
            print(f"  {place_id}: {change_f:+.1f}°F  "
                  f"({result['time'][:10]}, {source_name}, {time.time() - start:.0f} s)")
            break

    if not results:
        print("Nothing was downloaded, so data/anomaly.json was not changed.")
        return

    JSON_PATH.parent.mkdir(exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as file:
        json.dump({
            "downloaded": datetime.now(timezone.utc).isoformat(timespec="minutes"),
            "locations": results,
        }, file, indent=2)
    print(f"Saved {len(results)} locations to data/anomaly.json")


if __name__ == "__main__":
    main()


