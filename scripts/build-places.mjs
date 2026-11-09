// Builds scripts/geo-data/places.json from GeoNames dumps (CC BY 4.0, https://www.geonames.org).
// Usage: node scripts/build-places.mjs <UA.txt> <cities1000.txt>
// Keeps every populated place in Ukraine, plus towns of 1,000+ people in nearby countries inside the map area.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [ua, c1000] = process.argv.slice(2);
const B = { minLat: 40, maxLat: 62, minLon: 18, maxLon: 62 };
const NEAR = new Set(["RU", "BY", "MD", "RO", "PL", "SK", "HU", "GE", "TR", "BG", "LT", "LV", "EE", "FI", "KZ"]);
const latin = (s) => /^[\p{Script=Latin}\d\s'’ʼ`\-.()]+$/u.test(s);
const rows = [], seen = new Set();
function add(f) {
  const [id, name, ascii, alts, lat, lon, fclass, , cc, , , , , , pop] = f;
  if (seen.has(id) || fclass !== "P") return;
  const la = +lat, lo = +lon;
  if (la < B.minLat || la > B.maxLat || lo < B.minLon || lo > B.maxLon) return;
  seen.add(id);
  const names = [...new Set([ascii, ...(alts ? alts.split(",") : [])].filter((n) => n && n !== name && latin(n)))].slice(0, +pop >= 10000 ? 30 : 6);
  rows.push([name, Math.round(la * 1e4) / 1e4, Math.round(lo * 1e4) / 1e4, cc, +pop || 0, names.join("|")]);
}
for (const line of fs.readFileSync(ua, "utf8").split("\n")) { const f = line.split("\t"); if (f.length > 14) add(f); }
for (const line of fs.readFileSync(c1000, "utf8").split("\n")) { const f = line.split("\t"); if (f.length > 14 && (f[8] === "UA" || NEAR.has(f[8]))) add(f); }
rows.sort((a, b) => b[4] - a[4]);
const out = path.join(ROOT, "scripts/geo-data/places.json");
fs.writeFileSync(out, JSON.stringify({ source: "GeoNames (CC BY 4.0) https://www.geonames.org, built " + new Date().toISOString().slice(0, 10), fields: ["name", "lat", "lon", "country", "population", "altNames"], places: rows }));
console.log("wrote", rows.length, "places,", fs.statSync(out).size, "bytes");
