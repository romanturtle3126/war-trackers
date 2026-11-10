// Builds the GeoNames place list a map's coordinate checks use (GeoNames, CC BY 4.0, https://www.geonames.org).
// Ukraine:      node scripts/build-places.mjs ukraine <UA.txt> <cities1000.txt>      -> scripts/geo-data/places.json
// Middle East:  node scripts/build-places.mjs middle-east <cities1000.txt>           -> scripts/geo-data/places-middle-east.json
// Ukraine keeps every populated place in Ukraine plus towns of 1,000+ in nearby countries;
// the Middle East list keeps towns of 1,000+ people inside the map area.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAPS = {
  ukraine: { out: "places.json", B: { minLat: 40, maxLat: 62, minLon: 18, maxLon: 62 }, near: new Set(["UA", "RU", "BY", "MD", "RO", "PL", "SK", "HU", "GE", "TR", "BG", "LT", "LV", "EE", "FI", "KZ"]) },
  "middle-east": { out: "places-middle-east.json", B: { minLat: 8, maxLat: 42, minLon: 26, maxLon: 66 }, near: null },
};
const [mapId, ...files] = process.argv.slice(2);
const M = MAPS[mapId];
if (!M || !files.length) { console.error("usage: node scripts/build-places.mjs <ukraine|middle-east> <GeoNames .txt files>"); process.exit(1); }
const B = M.B;
const latin = (s) => /^[\p{Script=Latin}\d\s'’ʼ`\-.()]+$/u.test(s);
const rows = [], seen = new Set();
function add(f) {
  const [id, name, ascii, alts, lat, lon, fclass, , cc, , , , , , pop] = f;
  if (seen.has(id) || fclass !== "P") return;
  if (M.near && !M.near.has(cc)) return;
  const la = +lat, lo = +lon;
  if (la < B.minLat || la > B.maxLat || lo < B.minLon || lo > B.maxLon) return;
  seen.add(id);
  const names = [...new Set([ascii, ...(alts ? alts.split(",") : [])].filter((n) => n && n !== name && latin(n)))].slice(0, +pop >= 10000 ? 30 : 6);
  rows.push([name, Math.round(la * 1e4) / 1e4, Math.round(lo * 1e4) / 1e4, cc, +pop || 0, names.join("|")]);
}
for (const file of files) for (const line of fs.readFileSync(file, "utf8").split("\n")) { const f = line.split("\t"); if (f.length > 14) add(f); }
rows.sort((a, b) => b[4] - a[4]);
const out = path.join(ROOT, "scripts/geo-data", M.out);
fs.writeFileSync(out, JSON.stringify({ source: "GeoNames (CC BY 4.0) https://www.geonames.org, built " + new Date().toISOString().slice(0, 10), fields: ["name", "lat", "lon", "country", "population", "altNames"], places: rows }));
console.log("wrote", rows.length, "places,", fs.statSync(out).size, "bytes");
