// Gazetteer helpers: look up populated places (GeoNames) by name and measure distances.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../geo-data/places.json");
let INDEX = null;

/** Normalise a place name for matching: case, accents, apostrophes, dashes and common prefixes don't matter. */
export function norm(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[ʼ'’‘`´"]/g, "").replace(/[-‐–—_.,()]/g, " ")
    .replace(/\b(city|town|village|selo|smt|urban type settlement|oblast|raion|district)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** Looser key so transliteration variants match: Kupiansk = Kup'yans'k, Afipsky = Afipskiy, Dobropillia = Dobropillya. */
export function loose(s) {
  return norm(s).replace(/kh/g, "h").replace(/zh/g, "z").replace(/ts/g, "c").replace(/[yj]/g, "i").replace(/(.)\1+/g, "$1");
}

function load() {
  if (INDEX) return INDEX;
  const rows = JSON.parse(fs.readFileSync(FILE, "utf8")).places; // [name, lat, lon, cc, pop, alts]
  INDEX = new Map();
  for (const r of rows) {
    const p = { name: r[0], lat: r[1], lon: r[2], cc: r[3], pop: r[4] };
    const all = [r[0], ...(r[5] ? r[5].split("|") : [])];
    for (const n of new Set([...all.map(norm), ...all.map((x) => "~" + loose(x))])) {
      if (!n) continue;
      if (!INDEX.has(n)) INDEX.set(n, []);
      INDEX.get(n).push(p);
    }
  }
  return INDEX;
}

/** All places matching a name, biggest first. */
export function lookup(name) {
  const idx = load(), hits = [...(idx.get(norm(name)) || []), ...(idx.get("~" + loose(name)) || [])];
  return [...new Set(hits)].sort((a, b) => b.pop - a.pop);
}

export function km(lat1, lon1, lat2, lon2) {
  const R = 6371, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Max allowed distance (km) between an event marker and its named place, by coordPrecision. */
export const MAX_KM = { city: 15, approx: 40, oblast: 200 };

/** Check an event's `place` against its coordinates. Returns null if OK, or an error message. */
export function checkPlace(e) {
  if (typeof e.place !== "string" || !e.place.trim()) return "needs a \"place\" (the town or city the position is based on)";
  const hits = lookup(e.place);
  if (!hits.length) return `place "${e.place}" is not in the place list; use the nearest town or city name (check with: node scripts/place.mjs "${e.place}")`;
  const max = MAX_KM[e.coordPrecision] ?? 40;
  const best = hits.map((p) => ({ p, d: km(e.lat, e.lon, p.lat, p.lon) })).sort((a, b) => a.d - b.d)[0];
  if (best.d > max) return `position ${e.lat},${e.lon} is ${Math.round(best.d)} km from ${best.p.name} (${best.p.lat},${best.p.lon}); "${e.coordPrecision}" allows up to ${max} km. Use the coordinates from: node scripts/place.mjs "${e.place}"`;
  return null;
}
