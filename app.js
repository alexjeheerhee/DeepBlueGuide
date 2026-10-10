/* deepBlueGuide - app.js 
Author: Alex Rhee
What this file does: Gets live weather and ocean data for the place the user picks, 
                    decides which species are likely and how risky the water is, 
                    and fills in the page.

AI use: The first version was written with help from Claude (AI). 
My changes: rewrote the species cards without template literals, added Key West / Gulf / Alaska locations, changed the home screen icons
*/


// ===== Locations =====


const LOCATIONS = [
 { id: "chesapeake",   name: "Chesapeake Bay, MD",   lat: 38.85, lon: -76.40,  water: "brackish", region: "atlantic", icon: "🦀", blurb: "Brackish bay where rivers meet the sea" },
 { id: "ocean-city",   name: "Ocean City, MD",       lat: 38.33, lon: -75.05,  water: "seawater", region: "atlantic", icon: "🎡", blurb: "Mid-Atlantic beaches and inlets" },
 { id: "cape-cod",     name: "Cape Cod, MA",         lat: 41.70, lon: -69.90,  water: "seawater", region: "atlantic", icon: "🐋", blurb: "Cold New England water and whales" },
 { id: "outer-banks",  name: "Outer Banks, NC",      lat: 35.25, lon: -75.45,  water: "seawater", region: "atlantic", icon: "🪁", blurb: "Barrier islands where warm and cold water meet" },
 { id: "miami",        name: "Miami, FL",            lat: 25.77, lon: -80.10,  water: "seawater", region: "gulf",     icon: "🌴", blurb: "Warm reefs and mangroves" },
 { id: "key-west",     name: "Key West, FL",         lat: 24.45, lon: -81.80,  water: "seawater", region: "gulf",     icon: "🐠", blurb: "Coral reefs of the Florida Keys" },
 { id: "gulf-of-mexico", name: "Gulf of Mexico (off Alabama)", lat: 29.75, lon: -88.00, water: "seawater", region: "gulf", icon: "🎣", blurb: "Offshore reefs and snapper" },
 { id: "galveston",    name: "Galveston, TX",        lat: 29.20, lon: -94.75,  water: "seawater", region: "gulf",     icon: "🦐", blurb: "Gulf bays, marshes, and beaches" },
 { id: "santa-monica", name: "Santa Monica Bay, CA", lat: 33.95, lon: -118.55, water: "seawater", region: "pacific",  icon: "🎢", blurb: "Southern California kelp and reefs" },
 { id: "monterey",     name: "Monterey Bay, CA",     lat: 36.80, lon: -121.95, water: "seawater", region: "pacific",  icon: "🦦", blurb: "Kelp forests and sea otters" },
 { id: "newport",      name: "Newport, OR",          lat: 44.63, lon: -124.10, water: "seawater", region: "pacific",  icon: "⚓", blurb: "Rocky reefs of the Oregon coast" },
 { id: "alaska-coast", name: "Kodiak, AK (Gulf of Alaska)", lat: 57.70, lon: -152.20, water: "seawater", region: "north-island", icon: "🐟", blurb: "Cold North Pacific salmon waters" },
 { id: "honolulu",     name: "Honolulu, HI",         lat: 21.25, lon: -157.85, water: "seawater", region: "north-island", icon: "🐢", blurb: "Tropical Pacific reefs" }
];


// Home screen groups, in the order they appear
const REGIONS = [
 { id: "atlantic",     name: "Atlantic Coast" },
 { id: "gulf",         name: "Florida and the Gulf of Mexico" },
 { id: "pacific",      name: "Pacific Coast" },
 { id: "north-island", name: "Alaska and Hawaii" }
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


// ===== Celsius difference → Fahrenheit difference =====
// A temperature DIFFERENCE only gets multiplied by 1.8 (no +32),
// because the +32 cancels out when you subtract two temperatures.
function diffToFahrenheit(celsiusDiff) {
 return celsiusDiff * 1.8;
}


// ===== Anomaly (°F) → words =====
// These cutoffs are this app's own simple labels, not an official
// marine heatwave definition (that needs many days of data).
function describeAnomaly(diffF) {
 if (diffF >= 3.6)  return { label: "Unusually warm", css: "very-warm" };
 if (diffF >= 1)    return { label: "Warmer than normal", css: "warm" };
 if (diffF <= -3.6) return { label: "Unusually cool", css: "very-cool" };
 if (diffF <= -1)   return { label: "Cooler than normal", css: "cool" };
 return { label: "About normal", css: "" };
}


// ===== Salinity: what kind of water is at this location =====
// Salinity = how much salt is in the water, in parts per thousand (ppt).
//   Fresh water: less than 0.5 ppt
//   Brackish water: 0.5 to 30 ppt (rivers mixing with the sea)
//   Seawater: about 30 to 35 ppt along most coasts
// We don't have live salinity data yet, so this describes the usual type.
function describeSalinity(place) {
 if (place.water === "brackish") {
   return {
     label: "Brackish (mix of river and sea water, 0.5–30 ppt)",
     note: "Salinity here changes a lot. It rises in droughts, when less river water flows in, and drops after heavy rain or floods."
   };
 }
 return {
   label: "Seawater (about 30–35 ppt)",
   note: "Open-coast salinity is fairly steady, but it can drop near river mouths after heavy rain."
 };
}


// ===== Vibrio: estimate conditions from water temperature (PPT 4) =====
// Vibrio bacteria barely grow below about 15°C (59°F), start growing
// between 15 and 20°C (59–68°F), and grow fastest above 20°C (68°F).
// They also do best in brackish (low-salinity) water.
// This is an estimate from conditions, NOT a test of the water.
function describeVibrio(waterF) {
 if (waterF === null) return { level: "unknown", label: "Unknown" };
 if (waterF < 59)  return { level: "low",      label: "Low" };
 if (waterF < 68)  return { level: "moderate", label: "Moderate" };
 return { level: "high", label: "High" };
}


// Fill in the Vibrio card for one location
function renderVibrio(place, waterF) {
 const result = describeVibrio(waterF);
 const levelSpan = document.getElementById("vibrio-level");
 levelSpan.textContent = result.label;
 levelSpan.className = "vibrio-level " + result.level;


 let reason;
 if (result.level === "unknown") {
   reason = "Water temperature is not available here, so we can't estimate Vibrio conditions. Follow the safety tips below whenever you are in salt or brackish water.";
 } else if (result.level === "low") {
   reason = "Water is " + waterF.toFixed(0) + "°F. Vibrio bacteria barely grow below 59°F.";
 } else if (result.level === "moderate") {
   reason = "Water is " + waterF.toFixed(0) + "°F. Vibrio bacteria start to grow between 59°F and 68°F.";
 } else {
   reason = "Water is " + waterF.toFixed(0) + "°F. Vibrio bacteria grow fastest above 68°F.";
 }
 show("vibrio-reason", reason);


 // Extra notes: water type and season
 const notes = [];
 if (place.water === "brackish") {
   notes.push("This is brackish water, where rivers mix with the sea. Vibrio does best in this kind of low-salinity water.");
 }
 const month = new Date().getMonth(); // 0 = January
 if (month >= 4 && month <= 9) {
   notes.push("Most Vibrio infections in the U.S. happen between May and October.");
 }
 const list = document.getElementById("vibrio-notes");
 list.innerHTML = "";
 notes.forEach(text => {
   const p = document.createElement("p");
   p.textContent = text;
   list.appendChild(p);
 });


 // "Compared to normal" may arrive before or after this, so use it if we have it
 updateVibrioWithAnomaly(lastAnomalyF);
}


// Called when "compared to normal" arrives (diffF is null if we don't know)
let lastAnomalyF = null;
function updateVibrioWithAnomaly(diffF) {
 lastAnomalyF = diffF;
 if (diffF !== null && diffF >= 1) {
   show("vibrio-warm-note", "The water is warmer than normal for this time of year, so the Vibrio season may start earlier or last longer.");
 } else {
   show("vibrio-warm-note", "");
 }
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
 const url = new URL("https://api.open-meteo.com/v1/forecast");
 url.searchParams.set("latitude", place.lat);
 url.searchParams.set("longitude", place.lon);
 url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
 url.searchParams.set("temperature_unit", "fahrenheit");
 url.searchParams.set("wind_speed_unit", "mph");


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
 const url = new URL("https://marine-api.open-meteo.com/v1/marine");
 url.searchParams.set("latitude", place.lat);
 url.searchParams.set("longitude", place.lon);
 url.searchParams.set("current", "sea_surface_temperature,wave_height");


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


 const todayF = waterF.toFixed(0);
 return '<div class="temp-meter" role="img" aria-label="Preferred range ' +
     sp.tempMinF + " to " + sp.tempMaxF + "°F. Today " + todayF + '°F.">' +
     '<div class="temp-range" style="left:' + rangeLeft + "%; width:" + rangeWidth + '%"></div>' +
     '<div class="temp-marker" style="left:' + marker + '%"></div>' +
   "</div>" +
   '<div class="temp-scale">' +
     "<span>" + sp.tempMinF + "°F</span>" +
     "<span>Today " + todayF + "°F</span>" +
     "<span>" + sp.tempMaxF + "°F</span>" +
   "</div>";
}


// ===== Same Water, Different Responses =====
// The same water can be fine for one organism and stressful for another.
// Each organism has a "good" range and a wider "ok" range for each factor:
//   inside good        -> ✓ does well
//   inside ok only     -> ⚠ stressed
//   outside ok         -> ✕ can't cope
//   null               -> — not a main factor
// Units: temperature °F, salinity ppt, dissolved oxygen (DO) mg/L.
// These are simplified, approximate ranges for teaching. Check them against
// the sources and change them here if you find better numbers.
const ORGANISMS = [
 {
   id: "striped-bass",
   name: "Striped Bass",
   icon: "🐟",
   temp: { good: [50, 77], ok: [40, 84] },
   salinity: { good: [0, 36], ok: [0, 36] },
   oxygen: { good: [5, 20], ok: [3, 20] },
   note(r, v) {
     if (r.temp !== "good" && v.temp > 77 && r.oxygen !== "good") {
       return "Temperature-oxygen squeeze: the surface is too warm and the cooler deep water has too little oxygen, so there is nowhere comfortable to go.";
     }
     return "";
   }
 },
 {
   id: "blue-crab",
   name: "Blue Crab",
   icon: "🦀",
   temp: { good: [59, 86], ok: [46, 92] },
   salinity: { good: [2, 36], ok: [0, 36] },
   oxygen: { good: [4, 20], ok: [2, 20] },
   note(r, v) {
     if (r.oxygen !== "good") {
       return "Crabs can walk or swim away from low-oxygen water. Sometimes they crowd into the shallows, which people call a \"crab jubilee.\"";
     }
     if (v.temp < 50) return "In cold water, blue crabs bury themselves in the mud and stop feeding until spring.";
     return "";
   }
 },
 {
   id: "eastern-oyster",
   name: "Eastern Oyster",
   icon: "🦪",
   temp: { good: [50, 86], ok: [34, 95] },
   salinity: { good: [12, 28], ok: [5, 35] },
   oxygen: { good: [4, 20], ok: [1.5, 20] },
   note(r, v) {
     if (r.oxygen !== "good") {
       return "Oysters can't swim away. They close their shells and wait, which works for a few days but not for long.";
     }
     if (r.salinity !== "good" && v.salinity < 12) {
       return "After big floods, long stretches of fresh water can kill oyster beds.";
     }
     if (r.salinity !== "good" && v.salinity > 28) {
       return "Saltier water helps oyster diseases (Dermo and MSX) and predators spread.";
     }
     return "";
   }
 },
 {
   id: "vibrio",
   name: "Vibrio vulnificus",
   icon: "🦠",
   isGerm: true,
   temp: { good: [68, 110], ok: [59, 110] },
   salinity: { good: [5, 25], ok: [1, 30] },
   oxygen: null,
   note(r) {
     if (r.temp === "good" && r.salinity === "good") {
       return "Warm, brackish water: these bacteria grow fast. Good for Vibrio means more risk for people, so take extra care with cuts.";
     }
     return "";
   }
 }
];


const FACTORS = [
 { key: "temp",     label: "Temp",     low: "too cold",  high: "too warm" },
 { key: "salinity", label: "Salinity", low: "too fresh", high: "too salty" },
 { key: "oxygen",   label: "Oxygen",   low: "too little oxygen", high: "too much oxygen" }
];


// Example scenarios the user can try with one tap
const SCENARIOS = [
 { id: "today",    label: "Today here" },
 { id: "heatwave", label: "Summer heatwave", temp: 86, salinity: 15, oxygen: 3 },
 { id: "flood",    label: "Spring flood",    temp: 58, salinity: 3,  oxygen: 9 },
 { id: "drought",  label: "Fall drought",    temp: 72, salinity: 26, oxygen: 6 },
 { id: "winter",   label: "Winter",          temp: 40, salinity: 18, oxygen: 11 }
];


// Rate one value against one organism's ranges
function rateFactor(range, value) {
 if (range === null) return "none";
 if (value >= range.good[0] && value <= range.good[1]) return "good";
 if (value >= range.ok[0] && value <= range.ok[1]) return "stressed";
 return "bad";
}


const RATING_SYMBOL = { good: "✓", stressed: "⚠", bad: "✕", none: "—" };
const RATING_WORD = { good: "Does well", stressed: "Stressed", bad: "Can't cope", none: "Not a main factor" };
const GERM_WORD = { good: "Grows fast", stressed: "Grows slowly", bad: "Barely grows", none: "Not a main factor" };


// Words that describe the current slider values
function describeSalinityValue(ppt) {
 if (ppt < 0.5) return "Fresh";
 if (ppt < 30) return "Brackish";
 return "Seawater";
}


function describeOxygenValue(mgL) {
 if (mgL < 2) return "Very low (dead zone)";
 if (mgL < 5) return "Low";
 return "Healthy";
}


// Typical starting values for a place (live salinity and oxygen aren't available yet)
let todayValues = { temp: 70, salinity: 15, oxygen: 7 };


function setResponseDefaults(place, waterF) {
 todayValues = {
   temp: waterF === null ? 70 : Math.round(waterF),
   salinity: place.water === "brackish" ? 15 : 33,
   oxygen: 7
 };
 applyScenario("today");
}


function applyScenario(id) {
 const scenario = SCENARIOS.find(s => s.id === id);
 const values = id === "today" ? todayValues : scenario;
 document.getElementById("resp-temp").value = values.temp;
 document.getElementById("resp-salinity").value = values.salinity;
 document.getElementById("resp-oxygen").value = values.oxygen;
 document.querySelectorAll("#resp-scenarios button").forEach(button => {
   button.setAttribute("aria-pressed", button.dataset.id === id ? "true" : "false");
 });
 renderResponses();
}


function renderResponses() {
 const v = {
   temp: Number(document.getElementById("resp-temp").value),
   salinity: Number(document.getElementById("resp-salinity").value),
   oxygen: Number(document.getElementById("resp-oxygen").value)
 };
 show("resp-temp-value", v.temp + "°F");
 show("resp-salinity-value", v.salinity + " ppt (" + describeSalinityValue(v.salinity) + ")");
 show("resp-oxygen-value", v.oxygen + " mg/L (" + describeOxygenValue(v.oxygen) + ")");


 const body = document.getElementById("resp-rows");
 body.innerHTML = "";


 ORGANISMS.forEach(org => {
   const ratings = {};
   FACTORS.forEach(f => { ratings[f.key] = rateFactor(org[f.key], v[f.key]); });


   const row = document.createElement("tr");
   const nameHtml = org.isGerm ? "<em>" + org.name + "</em>" : org.name;
   let cells = '<th scope="row"><span aria-hidden="true">' + org.icon + "</span> " + nameHtml + "</th>";
   FACTORS.forEach(f => {
     const rating = ratings[f.key];
     const word = (org.isGerm ? GERM_WORD : RATING_WORD)[rating];
     const cellClass = "resp-cell " + rating + (org.isGerm ? " germ" : "");
     cells += '<td class="' + cellClass + '" title="' + word + '">' +
       '<span aria-hidden="true">' + RATING_SYMBOL[rating] + "</span>" +
       '<span class="visually-hidden">' + word + "</span></td>";
   });
   row.innerHTML = cells;
   body.appendChild(row);


   // One-line explanation under each organism
   const problems = [];
   FACTORS.forEach(f => {
     const range = org[f.key];
     if (range === null || ratings[f.key] === "good") return;
     problems.push(v[f.key] < range.good[0] ? f.low : f.high);
   });
   let summary;
   if (org.isGerm) {
     summary = problems.length === 0
       ? "Conditions are ideal for this germ."
       : "Growth is held back: " + problems.join(", ") + ".";
   } else {
     summary = problems.length === 0 ? "Comfortable in this water." : capitalize(problems.join(" and ")) + ".";
   }
   const extra = org.note(ratings, v);
   const noteRow = document.createElement("tr");
   noteRow.className = "resp-note-row";
   noteRow.innerHTML = '<td colspan="4">' + summary + (extra ? " " + extra : "") + "</td>";
   body.appendChild(noteRow);
 });
}


function capitalize(text) {
 return text.charAt(0).toUpperCase() + text.slice(1);
}


function setupResponses() {
 ["resp-temp", "resp-salinity", "resp-oxygen"].forEach(id => {
   document.getElementById(id).addEventListener("input", () => {
     document.querySelectorAll("#resp-scenarios button").forEach(b => b.setAttribute("aria-pressed", "false"));
     renderResponses();
   });
 });
 const bar = document.getElementById("resp-scenarios");
 SCENARIOS.forEach(s => {
   const button = document.createElement("button");
   button.type = "button";
   button.dataset.id = s.id;
   button.textContent = s.label;
   button.addEventListener("click", () => applyScenario(s.id));
   bar.appendChild(button);
 });
}


// ===== Load "compared to normal" (sea surface temperature anomaly) =====
// The anomaly is how much warmer or cooler the water is than the long-term
// average for that day of the year. NOAA calculates it for us.
//
// We try, in this order:
//   1. NOAA OISST v2.1 (preliminary), coastwatch.pfeg.noaa.gov
//   2. NOAA Coral Reef Watch 5 km SST anomaly, coastwatch.noaa.gov (backup server)
//   3. A saved copy in data/anomaly.json, made by tools/fetch_anomaly.py
// Live data is loaded like a <script> file ("JSONP") because a normal
// fetch() to these servers kept timing out from the app.
const ANOMALY_TIMEOUT_MS = 25000;
const MAX_AGE_DAYS = 10; // ignore data older than this
let jsonpCounter = 0;


// Each live source knows how to build its address for a location.
// The box is about ±0.25° around the location so we can skip land points.
const ANOMALY_SOURCES = [
 {
   name: "NOAA OISST v2.1",
   url(place) {
     return "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21NrtAgg_LonPM180.json?anom" +
       "%5B(last)%5D%5B(0.0)%5D" +
       "%5B(" + (place.lat - 0.25).toFixed(2) + "):1:(" + (place.lat + 0.25).toFixed(2) + ")%5D" +
       "%5B(" + (place.lon - 0.25).toFixed(2) + "):1:(" + (place.lon + 0.25).toFixed(2) + ")%5D";
   }
 },
 {
   name: "NOAA Coral Reef Watch",
   url(place) {
     // This dataset stores latitude from north to south, so the bigger
     // number comes first. ":5:" takes every 5th point (every 0.25°).
     return "https://coastwatch.noaa.gov/erddap/griddap/noaacrwsstanomalyDaily.json?sea_surface_temperature_anomaly" +
       "%5B(last)%5D" +
       "%5B(" + (place.lat + 0.25).toFixed(2) + "):5:(" + (place.lat - 0.25).toFixed(2) + ")%5D" +
       "%5B(" + (place.lon - 0.25).toFixed(2) + "):5:(" + (place.lon + 0.25).toFixed(2) + ")%5D";
   }
 }
];


// Load a JSONP address and give back the data (or an error after a timeout)
function loadJsonp(url, timeoutMs) {
 return new Promise((resolve, reject) => {
   jsonpCounter++;
   const callbackName = "deepBlueGuideAnomaly" + jsonpCounter;
   const script = document.createElement("script");


   const cleanUp = () => {
     clearTimeout(timer);
     delete window[callbackName];
     script.remove();
   };
   const timer = setTimeout(() => {
     cleanUp();
     reject(new Error("timed out"));
   }, timeoutMs);


   window[callbackName] = data => {
     cleanUp();
     resolve(data);
   };
   script.onerror = () => {
     cleanUp();
     reject(new Error("could not load"));
   };


   script.src = url + "&.jsonp=" + callbackName;
   document.body.appendChild(script);
 });
}


// From a NOAA table, find the ocean point closest to the location.
// The anomaly is whichever column is not time, depth, latitude, or longitude.
function closestAnomaly(table, place) {
 const cols = table.columnNames;
 const iTime = cols.indexOf("time");
 const iLat = cols.indexOf("latitude");
 const iLon = cols.indexOf("longitude");
 const iAnom = cols.findIndex(name => !["time", "zlev", "latitude", "longitude"].includes(name));


 // Keep only ocean points (land points have no value)
 const ocean = table.rows.filter(row => typeof row[iAnom] === "number" && !Number.isNaN(row[iAnom]));
 if (ocean.length === 0) return null;


 const distance = row => (row[iLat] - place.lat) ** 2 + (row[iLon] - place.lon) ** 2;
 ocean.sort((a, b) => distance(a) - distance(b));
 return { time: ocean[0][iTime], anomC: ocean[0][iAnom] };
}


// True if the data date is recent enough to show as "now"
function isRecent(time) {
 const ageDays = (Date.now() - new Date(time).getTime()) / 86400000;
 return ageDays <= MAX_AGE_DAYS;
}


// Load the saved copy made by tools/fetch_anomaly.py
async function loadSavedAnomaly(place) {
 const response = await fetch(new URL("data/anomaly.json", APP_FOLDER).href);
 if (!response.ok) return null;
 const saved = await response.json();
 return saved.locations[place.id] || null;
}


// Put the result on the screen
function showAnomaly(result, sourceText) {
 const diffF = diffToFahrenheit(result.anomC);
 const words = describeAnomaly(diffF);
 const sign = diffF >= 0 ? "+" : "−";
 const amount = Math.abs(diffF).toFixed(1);


 const span = document.getElementById("water-anomaly");
 span.textContent = sign + amount + "°F (" + words.label + ")";
 span.className = "anomaly " + words.css;


 const date = new Date(result.time).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
 show("anomaly-note", sourceText + " satellite data for " + date + ", compared with the long-term average for that date.");


 updateVibrioWithAnomaly(diffF);
}


async function loadAnomaly(place, thisRequest) {
 // 1 and 2. Try each live source
 for (const source of ANOMALY_SOURCES) {
   try {
     const url = source.url(place);
     console.log("Anomaly request (" + source.name + "):", url);
     const data = await loadJsonp(url, ANOMALY_TIMEOUT_MS);
     if (thisRequest !== requestNumber) return; // a newer location was chosen
     const result = closestAnomaly(data.table, place);
     if (result !== null && isRecent(result.time)) {
       showAnomaly(result, source.name);
       return;
     }
     console.warn(source.name + ": no recent ocean data here");
   } catch (error) {
     console.warn(source.name + " failed (" + error.message + ")");
   }
   if (thisRequest !== requestNumber) return;
 }


 // 3. Try the saved copy
 try {
   const result = await loadSavedAnomaly(place);
   if (thisRequest !== requestNumber) return;
   if (result !== null && isRecent(result.time)) {
     showAnomaly(result, "Saved " + (result.source || "NOAA"));
     return;
   }
 } catch (error) {
   console.warn("Saved anomaly failed:", error);
 }


 show("water-anomaly", "Not available right now");
}


// ===== Species: decide how likely each one is =====
// A species is "likely" when it is in season AND the water is in its range.
// If water temperature is missing, only the season is used.
function checkSpecies(sp, waterF, season) {
 const inSeason = sp.seasons.includes("All") || sp.seasons.includes(season);
 const inTemp = waterF === null || (waterF >= sp.tempMinF && waterF <= sp.tempMaxF);


 const reasons = [];
 if (!inSeason) reasons.push("Most often seen in " + sp.seasons.join(", ").toLowerCase());
 if (!inTemp) reasons.push("Prefers water around " + sp.tempMinF + "–" + sp.tempMaxF + "°F");


 return { likely: inSeason && inTemp, reasons: reasons };
}


// ===== Species: build one card =====
function makeSpeciesCard(sp, reasons, waterF) {
 const card = document.createElement("article");
 card.className = "species-card";


 const feeding = feedingLevel(sp, waterF);
 let feedingText = "";
 if (feeding !== null) {
   feedingText = '<div class="feeding">' +
     '<p><strong>Feeding activity:</strong> <span class="feed-level ' + feeding.level + '">' +
     feeding.label + "</span></p>" +
     '<p class="feed-note">' + feeding.note + "</p>" +
     makeTempMeter(sp, waterF) +
     "</div>";
 }


 // PPT 3: how climate change is affecting this species (if we have a note)
 let climateText = "";
 if (sp.climate) {
   climateText = '<div class="climate">' +
     "<p><strong>Climate watch:</strong> " + sp.climate.note + "</p>" +
     '<p class="source">Source: ' + sp.climate.source + "</p>" +
     "</div>";
 }


 // PPT 5: parasites this species can carry, and how to eat it safely
 let parasiteText = "";
 if (sp.parasite) {
   let eatingText = "";
   if (sp.parasite.foodSafety) {
     eatingText = "<p><strong>Eating it:</strong> " + sp.parasite.foodSafety + "</p>";
   }
   parasiteText = '<div class="parasite">' +
     "<p><strong>Parasite note:</strong> " + sp.parasite.note + "</p>" +
     eatingText +
     '<p class="source">Source: ' + sp.parasite.source + "</p>" +
     "</div>";
 }


 let reasonText = "";
 if (reasons.length > 0) {
   reasonText = '<p class="reason">' + reasons.join(". ") + ".</p>";
 }


 card.innerHTML =
   "<h4>" + sp.name + "</h4>" +
   '<p class="scientific">' + sp.scientificName + "</p>" +
   '<span class="badge ' + sp.status + '">' + statusName(sp.status) + "</span>" +
   "<p><strong>Best time:</strong> " + sp.bestTime + "</p>" +
   "<p><strong>Feeds on:</strong> " + sp.diet + "</p>" +
   feedingText +
   climateText +
   parasiteText +
   reasonText +
   "<details>" +
     "<summary>How to identify and what to do</summary>" +
     "<p><strong>Look for:</strong> " + sp.idTips + "</p>" +
     "<p><strong>Habitat:</strong> " + sp.habitat + "</p>" +
     "<p><strong>Most active in:</strong> about " + sp.tempMinF + "–" + sp.tempMaxF + "°F water</p>" +
     '<p class="what-to-do">' + sp.whatToDo + "</p>" +
     '<p class="source">Source: ' + sp.source + "</p>" +
   "</details>";
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
   box.innerHTML += '<p class="alert protect"><strong>Protected species live here:</strong> ' +
     names + ". Do not keep or disturb them. Open each card to see what to do.</p>";
 }
 if (invasiveOnes.length > 0) {
   const names = invasiveOnes.map(sp => sp.name).join(", ");
   box.innerHTML += '<p class="alert invasive"><strong>Invasive species found here:</strong> ' +
     names + ". Never release them, and report sightings to your state wildlife agency.</p>";
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
   show("species-summary", "No species have been added for " + place.name +
     " yet. Add some to tools/species.csv and run build_data.py.");
   return;
 }


 let basis = "Based on the season (" + season + "). Water temperature is not available here.";
 if (waterF !== null) {
   basis = "Based on the season (" + season + ") and today's water temperature (" +
     waterF.toFixed(0) + "°F). Feeding activity is an estimate from water temperature only.";
 }
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
   likelyList.innerHTML = '<p class="empty">No ' + filterWord +
     'species match today\'s conditions. Check "Also found here" below.</p>';
 }
 if (otherCount === 0) {
   otherList.innerHTML = '<p class="empty">None right now. Every ' + filterWord +
     "species listed for this location matches today's conditions.</p>";
 }
}


// ===== Load everything for one location =====
async function loadLocation(index) {
 const place = LOCATIONS[index];
 requestNumber = requestNumber + 1;
 const thisRequest = requestNumber;


 // Reset the screen while new data loads
 ["updated-time", "air-temp", "sky", "wind-speed", "water-temp", "water-anomaly", "wave-height", "species-summary", "vibrio-level", "vibrio-reason"]
   .forEach(id => show(id, "Loading..."));
 document.getElementById("vibrio-level").className = "vibrio-level";
 document.getElementById("vibrio-notes").innerHTML = "";
 updateVibrioWithAnomaly(null);
 document.getElementById("water-anomaly").className = "anomaly";
 show("anomaly-note", "");
 document.getElementById("likely-list").innerHTML = "";
 document.getElementById("other-list").innerHTML = "";


 // Remember the choice for next time
 try {
   localStorage.setItem("deepBlueGuide-location", place.id);
 } catch (error) {
   // Storage not available; the app still works without it
 }


 const salinity = describeSalinity(place);
 show("salinity", salinity.label);
 show("salinity-note", salinity.note);


 loadWeather(place, thisRequest);
 loadAnomaly(place, thisRequest);
 const waterF = await loadOcean(place, thisRequest);
 if (thisRequest !== requestNumber) return; // a newer location was chosen
 renderVibrio(place, waterF);
 setResponseDefaults(place, waterF);
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


// ===== Home screen: ocean tiles grouped by region =====
function lastViewedId() {
 try {
   return localStorage.getItem("deepBlueGuide-location");
 } catch (error) {
   return null; // storage not available
 }
}


function buildHome() {
 const box = document.getElementById("ocean-groups");
 box.innerHTML = "";
 const lastId = lastViewedId();


 REGIONS.forEach(region => {
   const places = LOCATIONS.filter(place => place.region === region.id);
   if (places.length === 0) return;


   const group = document.createElement("section");
   group.className = "ocean-group region-" + region.id;
   group.innerHTML = "<h3>" + region.name + "</h3>";


   const grid = document.createElement("div");
   grid.className = "ocean-grid";


   places.forEach(place => {
     const count = SPECIES.filter(sp => sp.locations.includes(place.id)).length;
     const tile = document.createElement("a");
     tile.className = "ocean-tile";
     tile.href = "#" + place.id;
     let lastText = "";
     if (place.id === lastId) {
       lastText = '<span class="tile-last">Last viewed</span>';
     }
     tile.innerHTML =
       '<span class="tile-icon" aria-hidden="true">' + place.icon + "</span>" +
       '<span class="tile-name">' + place.name + "</span>" +
       '<span class="tile-blurb">' + place.blurb + "</span>" +
       '<span class="tile-count">' + count + " species</span>" +
       lastText;
     grid.appendChild(tile);
   });


   group.appendChild(grid);
   box.appendChild(group);
 });
}




function showHome() {
 requestNumber = requestNumber + 1;
 document.getElementById("detail-view").hidden = true;
 document.getElementById("home-view").hidden = false;
 document.title = "deepBlueGuide";
 buildHome();
}


function showOcean(index) {
 const place = LOCATIONS[index];
 document.getElementById("home-view").hidden = true;
 document.getElementById("detail-view").hidden = false;
 document.getElementById("place-icon").textContent = place.icon;
 show("place-name", place.name);
 show("place-blurb", place.blurb);
 document.title = place.name + " · deepBlueGuide";
 loadLocation(index);
}


function showPage() {
 const id = decodeURIComponent(window.location.hash.slice(1));
 const index = LOCATIONS.findIndex(place => place.id === id);
 if (index === -1) {
   showHome();
 } else {
   showOcean(index);
 }
 window.scrollTo(0, 0);
}


// ===== Start =====




async function start() {
 await loadSpeciesData();
 setupResponses();
 window.addEventListener("hashchange", showPage);
 showPage();
}


start();








