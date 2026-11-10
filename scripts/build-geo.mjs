// Builds web/geo/<name>.json from a Natural Earth 1:50m admin-0 GeoJSON file.
// Usage: node scripts/build-geo.mjs <ne_50m_admin_0_countries.geojson> <out.json> <minLon> <minLat> <maxLon> <maxLat> [tolerance] [disputed.geojson "Area,Area"]
//   Ukraine:      node scripts/build-geo.mjs ne.geojson web/geo/eastern-europe.json 12 38 64 62
//   Middle East:  node scripts/build-geo.mjs ne.geojson web/geo/middle-east.json 22 5 68 44 0.012 ne_50m_admin_0_breakaway_disputed_areas.geojson "Golan Heights"
// Named areas from the disputed-areas file are written as `areas` (drawn hatched, e.g. occupied territory).
// Shows internationally recognised borders: Crimea is moved from Russia to Ukraine, and
// breakaway entities (N. Cyprus, Somaliland) are merged into the countries they belong to.
import fs from "node:fs";
const [src, out, ...rest] = process.argv.slice(2);
const [minLon, minLat, maxLon, maxLat] = rest.slice(0, 4).map(Number);
const TOL = rest[4] ? Number(rest[4]) : 0.025; // degrees, Douglas-Peucker tolerance
const g = JSON.parse(fs.readFileSync(src, "utf8"));

function inRing(pt, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
function polys(f) { return f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates; }
function bbox(ring) { let a = [180, 90, -180, -90]; for (const [x, y] of ring) { a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; } return a; }
function dp(pts) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); let md = 0, mi = -1;
    const [x1, y1] = pts[s], [x2, y2] = pts[e], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-12;
    for (let i = s + 1; i < e; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / L; if (d > md) { md = d; mi = i; } }
    if (md > TOL) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function dpRing(r) { const m = r.length >> 1; return dp(r.slice(0, m + 1)).concat(dp(r.slice(m)).slice(1)); }
const r2 = (n) => Math.round(n * 100) / 100;
const inBox = ([x, y]) => x >= minLon && x <= maxLon && y >= minLat && y <= maxLat;

const byA3 = {};
for (const f of g.features) byA3[f.properties.ADM0_A3] = { name: f.properties.NAME, polys: polys(f).map((p) => p.map((r) => r.slice())) };
// Move Crimea (the RUS polygon containing Simferopol) to Ukraine.
if (inBox([34.1, 44.95])) {
  const rus = byA3.RUS, ukr = byA3.UKR;
  const ci = rus.polys.findIndex((p) => inRing([34.1, 44.95], p[0]));
  if (ci < 0) throw new Error("Crimea polygon not found in RUS");
  ukr.polys.push(rus.polys.splice(ci, 1)[0]);
}
for (const [from, to] of [["CYN", "CYP"], ["SOL", "SOM"]]) if (byA3[from] && byA3[to]) { byA3[to].polys.push(...byA3[from].polys); delete byA3[from]; }

const countries = [];
for (const [a3, c] of Object.entries(byA3)) {
  const ps = [];
  for (const p of c.polys) {
    const b = bbox(p[0]);
    if (b[2] < minLon || b[0] > maxLon || b[3] < minLat || b[1] > maxLat) continue;
    const ring = dpRing(p[0]).map(([x, y]) => [r2(x), r2(y)]);
    if (ring.length >= 4) ps.push(ring);
  }
  if (ps.length) countries.push({ a3, name: c.name, rings: ps });
}
countries.sort((a, b) => a.a3.localeCompare(b.a3));
const areas = [];
if (rest[5]) {
  const want = (rest[6] || "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const f of JSON.parse(fs.readFileSync(rest[5], "utf8")).features) {
    const name = f.properties.NAME || f.properties.BRK_NAME;
    if (!want.includes(name)) continue;
    areas.push({ name, rings: polys(f).map((p) => dpRing(p[0]).map(([x, y]) => [r2(x), r2(y)])).filter((r) => r.length >= 4) });
  }
}
const doc = { source: "Natural Earth 1:50m admin-0 (public domain); internationally recognised borders (Crimea shown as Ukraine)", bbox: [minLon, minLat, maxLon, maxLat], countries };
if (areas.length) doc.areas = areas;
fs.writeFileSync(out, JSON.stringify(doc));
console.log("wrote", out, countries.length, "countries", fs.statSync(out).size, "bytes");
