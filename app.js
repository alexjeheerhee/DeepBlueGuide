// ===== Locations =====
// Coordinates are set slightly offshore so ocean data is available.
// To add a new place: copy one line, change it, and add the same id
// to VALID_LOCATIONS in tools/build_data.py.
const LOCATIONS = [
  { id: "ocean-city",   name: "Ocean City, MD",       lat: 38.33, lon: -75.05 },
  { id: "cape-cod",     name: "Cape Cod, MA",         lat: 41.70, lon: -69.90 },
  { id: "outer-banks",  name: "Outer Banks, NC",      lat: 35.25, lon: -75.45 },
  { id: "miami",        name: "Miami, FL",            lat: 25.77, lon: -80.10 },
  { id: "galveston",    name: "Galveston, TX",        lat: 29.20, lon: -94.75 },
  { id: "santa-monica", name: "Santa Monica Bay, CA", lat: 33.95, lon: -118.55 },
  { id: "monterey",     name: "Monterey Bay, CA",     lat: 36.80, lon: -121.95 },
  { id: "newport",      name: "Newport, OR",          lat: 44.63, lon: -124.10 },
  { id: "honolulu",     name: "Honolulu, HI",         lat: 21.25, lon: -157.85 }
];

// Folder where app.js lives. Used so data/species.json is always found
// next to app.js, even if the page address has no "/" or "index.html" at the end.
const APP_FOLDER = document.currentScript ? document.currentScript.src : window.location.href;

// Species data, loaded from data/species.json (made by tools/build_data.py)
let SPECIES = [];
let speciesError = ""; // filled in if species.json could not be loaded

// Keeps track of the newest request so old answers don't overwrite new ones
let requestNumber = 0;

// Status filter ("all", "native", "invasive", ...)
let statusFilter = "all";

// Remember the last place and water temperature so the filter
// can redraw the lists without loading the data again
let lastPlace = null;
let lastWaterF = null;

// Order and display names for status labels
const STATUS_ORDER = ["native", "invasive", "endangered", "threatened", "protected"];
function statusName(status) {
  return status[0].toUpperCase() + status.slice(1);
}

// ===== Weather codes → words =====
// Open-Meteo uses WMO weather codes. These are the common ones.
function describeWeather(code) {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 67) return "Rainy";
  if (code >= 71 && code <= 77) return "Snowy";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 95) return "Thunderstorm";
  return "Unknown";
}

// ===== Celsius → Fahrenheit =====
function toFahrenheit(celsius) {
  return (celsius * 9) / 5 + 32;
}

// ===== Wave height (feet) → sea state =====
// Based on the WMO sea state scale, converted from meters to feet:
// 0.5 m ≈ 1.6 ft, 1.25 m ≈ 4.1 ft, 2.5 m ≈ 8.2 ft
// Conditions must be checked from smallest to largest.
function describeSea(feet) {
  if (feet < 1.6) return "Calm";
  if (feet < 4.1) return "Smooth";
  if (feet < 8.2) return "Moderate";
  return "Rough";
}

// ===== Month → season (Northern Hemisphere) =====
function currentSeason() {
  const month = new Date().getMonth(); // 0 = January
  if (month === 11 || month <= 1) return "Winter";
  if (month <= 4) return "Spring";
  if (month <= 7) return "Summer";
  return "Fall";
}

// ===== Helper: put text into an element by id =====
function show(id, text) {
  document.getElementById(id).textContent = text;
}

// ===== Load weather =====
async function loadWeather(place, thisRequest) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (thisRequest !== requestNumber) return; // a newer location was chosen
    console.log("Weather data:", data);

    const current = data.current;
    show("air-temp", current.temperature_2m.toFixed(0) + "°F");
    show("sky", describeWeather(current.weather_code));
    show("wind-speed", current.wind_speed_10m.toFixed(0) + " mph");
    show("updated-time", new Date().toLocaleTimeString());
  } catch (error) {
    console.error("Weather error:", error);
    show("air-temp", "Could not load");
  }
}

// ===== Load ocean conditions =====
// Returns the water temperature in °F (or null) so species can use it.
async function loadOcean(place, thisRequest) {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${place.lat}&longitude=${place.lon}&current=sea_surface_temperature,wave_height`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (thisRequest !== requestNumber) return null; // a newer location was chosen
    console.log("Ocean data:", data);

    const current = data.current;
    let waterF = null;

    // Water temperature comes in Celsius, so convert it
    if (current && current.sea_surface_temperature !== null) {
      waterF = toFahrenheit(current.sea_surface_temperature);
      show("water-temp", waterF.toFixed(0) + "°F");
    } else {
      show("water-temp", "Not available here");
    }

    // Wave height comes in meters, so convert to feet before describing it
    if (current && current.wave_height !== null) {
      const waveFeet = current.wave_height * 3.281;
      show("wave-height", waveFeet.toFixed(1) + " ft (" + describeSea(waveFeet) + ")");
    } else {
      show("wave-height", "Not available here");
    }

    return waterF;
  } catch (error) {
    console.error("Ocean error:", error);
    show("water-temp", "Could not load");
    return null;
  }
}

// ===== Feeding Guide: estimate feeding activity from water temperature =====
// Idea: animals tend to feed most when the water is near the middle of the
// range they prefer, less near the edges, and much less outside it.
// This is only an estimate based on temperature, not a prediction.
function feedingLevel(sp, waterF) {
  // Seaweed and other algae make their own food, so skip them
  if (sp.diet.toLowerCase().includes("photosynthesis")) return null;

  if (waterF === null) {
    return {
      level: "unknown",
      label: "Unknown",
      note: "Water temperature is not available here."
    };
  }

  const middle = (sp.tempMinF + sp.tempMaxF) / 2;
  const halfRange = (sp.tempMaxF - sp.tempMinF) / 2;
  // 0 = right in the middle, 1 = at the edge, more than 1 = outside the range
  const distance = Math.abs(waterF - middle) / halfRange;

  if (distance <= 0.5) {
    return {
      level: "high",
      label: "High",
      note: "The water is near the middle of its preferred range, so it is likely to be actively feeding."
    };
  }
  if (distance <= 1) {
    return {
      level: "moderate",
      label: "Moderate",
      note: "The water is inside its preferred range but near the edge, so feeding may be less steady."
    };
  }
  if (waterF < sp.tempMinF) {
    return {
      level: "low",
      label: "Low",
      note: "The water is colder than it prefers. It may slow down, feed less, or move to warmer water."
    };
  }
  return {
    level: "low",
    label: "Low",
    note: "The water is warmer than it prefers. It may feed less and look for cooler, deeper water."
  };
}

// ===== Feeding Guide: small bar showing the range and today's temperature =====
function makeTempMeter(sp, waterF) {
  if (waterF === null) return "";

  // The bar shows 10°F on each side of the preferred range
  const low = Math.min(sp.tempMinF - 10, waterF);
  const high = Math.max(sp.tempMaxF + 10, waterF);
  const toPercent = temp => ((temp - low) / (high - low)) * 100;

  const rangeLeft = toPercent(sp.tempMinF);
  const rangeWidth = toPercent(sp.tempMaxF) - rangeLeft;
  const marker = toPercent(waterF);

  return `
    <div class="temp-meter" role="img"
         aria-label="Preferred range ${sp.tempMinF} to ${sp.tempMaxF}°F. Today ${waterF.toFixed(0)}°F.">
      <div class="temp-range" style="left:${rangeLeft}%; width:${rangeWidth}%"></div>
      <div class="temp-marker" style="left:${marker}%"></div>
    </div>
    <div class="temp-scale">
      <span>${sp.tempMinF}°F</span>
      <span>Today ${waterF.toFixed(0)}°F</span>
      <span>${sp.tempMaxF}°F</span>
    </div>
  `;
}

// ===== Species: decide how likely each one is =====
// A species is "likely" when it is in season AND the water is in its range.
// If water temperature is missing, only the season is used.
function checkSpecies(sp, waterF, season) {
  const inSeason = sp.seasons.includes("All") || sp.seasons.includes(season);
  const inTemp = waterF === null || (waterF >= sp.tempMinF && waterF <= sp.tempMaxF);

  const reasons = [];
  if (!inSeason) reasons.push("Most often seen in " + sp.seasons.join(", ").toLowerCase());
  if (!inTemp) reasons.push(`Prefers water around ${sp.tempMinF}–${sp.tempMaxF}°F`);

  return { likely: inSeason && inTemp, reasons: reasons };
}

// ===== Species: build one card =====
function makeSpeciesCard(sp, reasons, waterF) {
  const card = document.createElement("article");
  card.className = "species-card";

  const feeding = feedingLevel(sp, waterF);
  const feedingText = feeding === null ? "" : `
    <div class="feeding">
      <p><strong>Feeding activity:</strong> <span class="feed-level ${feeding.level}">${feeding.label}</span></p>
      <p class="feed-note">${feeding.note}</p>
      ${makeTempMeter(sp, waterF)}
    </div>
  `;

  const reasonText = reasons.length > 0
    ? `<p class="reason">${reasons.join(". ")}.</p>`
    : "";

  card.innerHTML = `
    <h4>${sp.name}</h4>
    <p class="scientific">${sp.scientificName}</p>
    <span class="badge ${sp.status}">${statusName(sp.status)}</span>
    <p><strong>Best time:</strong> ${sp.bestTime}</p>
    <p><strong>Feeds on:</strong> ${sp.diet}</p>
    ${feedingText}
    ${reasonText}
    <details>
      <summary>How to identify and what to do</summary>
      <p><strong>Look for:</strong> ${sp.idTips}</p>
      <p><strong>Habitat:</strong> ${sp.habitat}</p>
      <p><strong>Most active in:</strong> about ${sp.tempMinF}–${sp.tempMaxF}°F water</p>
      <p class="what-to-do">${sp.whatToDo}</p>
      <p class="source">Source: ${sp.source}</p>
    </details>
  `;
  return card;
}

// ===== Species: alerts for protected and invasive species =====
function renderAlerts(here) {
  const box = document.getElementById("species-alerts");
  box.innerHTML = "";

  const protectedOnes = here.filter(sp =>
    ["endangered", "threatened", "protected"].includes(sp.status));
  const invasiveOnes = here.filter(sp => sp.status === "invasive");

  if (protectedOnes.length > 0) {
    const names = protectedOnes.map(sp => sp.name).join(", ");
    box.innerHTML += `<p class="alert protect"><strong>Protected species live here:</strong> ${names}. Do not keep or disturb them. Open each card to see what to do.</p>`;
  }
  if (invasiveOnes.length > 0) {
    const names = invasiveOnes.map(sp => sp.name).join(", ");
    box.innerHTML += `<p class="alert invasive"><strong>Invasive species found here:</strong> ${names}. Never release them, and report sightings to your state wildlife agency.</p>`;
  }
}

// ===== Species: filter buttons =====
// Only shows buttons for statuses that exist at this location.
function renderFilterButtons(here) {
  const bar = document.getElementById("status-filter");
  bar.innerHTML = "";

  const statusesHere = STATUS_ORDER.filter(status =>
    here.some(sp => sp.status === status));

  // If the saved filter doesn't exist at this location, go back to "all"
  if (statusFilter !== "all" && !statusesHere.includes(statusFilter)) {
    statusFilter = "all";
  }

  const options = ["all", ...statusesHere];
  options.forEach(status => {
    const count = status === "all"
      ? here.length
      : here.filter(sp => sp.status === status).length;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = (status === "all" ? "All" : statusName(status)) + " (" + count + ")";
    button.setAttribute("aria-pressed", status === statusFilter ? "true" : "false");
    button.addEventListener("click", () => {
      statusFilter = status;
      renderSpecies(lastPlace, lastWaterF);
    });
    bar.appendChild(button);
  });
}

// ===== Species: show the lists for one location =====
function renderSpecies(place, waterF) {
  lastPlace = place;
  lastWaterF = waterF;

  const season = currentSeason();
  const likelyList = document.getElementById("likely-list");
  const otherList = document.getElementById("other-list");
  likelyList.innerHTML = "";
  otherList.innerHTML = "";
  document.getElementById("species-alerts").innerHTML = "";
  document.getElementById("status-filter").innerHTML = "";

  // Stop early if the data file did not load, so the reason stays on screen
  if (speciesError) {
    show("species-summary", speciesError);
    return;
  }

  const here = SPECIES.filter(sp => sp.locations.includes(place.id));
  if (here.length === 0) {
    show("species-summary", `No species have been added for ${place.name} yet. Add some to tools/species.csv and run build_data.py.`);
    return;
  }

  const basis = waterF === null
    ? `Based on the season (${season}). Water temperature is not available here.`
    : `Based on the season (${season}) and today's water temperature (${waterF.toFixed(0)}°F). Feeding activity is an estimate from water temperature only.`;
  show("species-summary", basis);

  renderAlerts(here);
  renderFilterButtons(here);

  // Apply the status filter
  const shown = statusFilter === "all"
    ? here
    : here.filter(sp => sp.status === statusFilter);

  let likelyCount = 0;
  let otherCount = 0;

  // Show the most actively feeding species first
  const feedRank = { high: 0, moderate: 1, low: 2, unknown: 3 };
  const rank = sp => {
    const feeding = feedingLevel(sp, waterF);
    return feeding === null ? 4 : feedRank[feeding.level];
  };
  const sorted = [...shown].sort((a, b) => rank(a) - rank(b));

  sorted.forEach(sp => {
    const result = checkSpecies(sp, waterF, season);
    if (result.likely) {
      likelyList.appendChild(makeSpeciesCard(sp, [], waterF));
      likelyCount++;
    } else {
      otherList.appendChild(makeSpeciesCard(sp, result.reasons, waterF));
      otherCount++;
    }
  });

  const filterWord = statusFilter === "all" ? "" : statusName(statusFilter).toLowerCase() + " ";
  if (likelyCount === 0) {
    likelyList.innerHTML = `<p class="empty">No ${filterWord}species match today's conditions. Check "Also found here" below.</p>`;
  }
  if (otherCount === 0) {
    otherList.innerHTML = `<p class="empty">None right now. Every ${filterWord}species listed for this location matches today's conditions.</p>`;
  }
}

// ===== Load everything for one location =====
async function loadLocation(index) {
  const place = LOCATIONS[index];
  requestNumber = requestNumber + 1;
  const thisRequest = requestNumber;

  // Reset the screen while new data loads
  ["updated-time", "air-temp", "sky", "wind-speed", "water-temp", "wave-height", "species-summary"]
    .forEach(id => show(id, "Loading..."));
  document.getElementById("likely-list").innerHTML = "";
  document.getElementById("other-list").innerHTML = "";

  // Remember the choice for next time
  try {
    localStorage.setItem("deepBlueGuide-location", index);
  } catch (error) {
    // Storage not available; the app still works without it
  }

  loadWeather(place, thisRequest);
  const waterF = await loadOcean(place, thisRequest);
  if (thisRequest !== requestNumber) return; // a newer location was chosen
  renderSpecies(place, waterF);
}

// ===== Load species data =====
async function loadSpeciesData() {
  const speciesUrl = new URL("data/species.json", APP_FOLDER).href;
  try {
    const response = await fetch(speciesUrl);
    if (!response.ok) {
      throw new Error("data/species.json was not found (status " + response.status + ")");
    }
    SPECIES = await response.json();
    console.log("Species loaded:", SPECIES.length);
  } catch (error) {
    console.error("Species error:", error);
    speciesError = "Could not load species data from " + speciesUrl + " (" + error.message + ")";
  }
}

// ===== Build the location menu =====
function setupLocationMenu() {
  const select = document.getElementById("location-select");

  LOCATIONS.forEach((place, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = place.name;
    select.appendChild(option);
  });

  // Start with the last location the user picked, or the first one
  let startIndex = 0;
  try {
    const saved = localStorage.getItem("deepBlueGuide-location");
    if (saved !== null && LOCATIONS[saved]) startIndex = Number(saved);
  } catch (error) {
    // Storage not available; use the first location
  }

  select.value = startIndex;
  select.addEventListener("change", () => loadLocation(Number(select.value)));
  loadLocation(startIndex);
}

// ===== Start =====
async function start() {
  await loadSpeciesData();
  setupLocationMenu();
}

start();


