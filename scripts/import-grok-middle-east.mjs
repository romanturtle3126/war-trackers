// One-time conversion: Grok "Middle East Conflict Live Map" data/*.json -> war-trackers data/middle-east.json
// Usage: node scripts/import-grok-middle-east.mjs <me-zip data dir> <out.json>
import fs from "node:fs";
import path from "node:path";
const [dir, out] = process.argv.slice(2);
const rd = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const meta = rd("meta.json"), inc = rd("incidents.json"), st = rd("stats.json");
const ST = { confirmed: "CONFIRMED", one: "ONE_PARTY", disputed: "DISPUTED", unverified: "UNVERIFIED" };
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const SNAP = "2026-10-30";

// ---- source registry ----
const sources = [], byUrl = new Map(), usedIds = new Set();
function hostKey(u) {
  const h = new URL(u).hostname.replace(/^www\.|^live\.|^english\./, "");
  if (h === "x.com") return "x_" + new URL(u).pathname.split("/")[1].toLowerCase();
  const map = { "aljazeera.com": "aj", "apnews.com": "ap", "reuters.com": "reuters", "timesofisrael.com": "toi", "middleeasteye.net": "mee", "arabnews.com": "arabnews", "aa.com.tr": "anadolu", "understandingwar.org": "isw", "ochaopt.org": "ocha", "globalsecurity.org": "globalsec", "cnbc.com": "cnbc" };
  return map[h] || h.split(".")[0].replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 14);
}
function mmdd(t) { const m = String(t).match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/); return m ? String(MON[m[1]]).padStart(2, "0") + m[2].padStart(2, "0") : ""; }
function src(s) {
  if (byUrl.has(s.u)) return byUrl.get(s.u);
  let base = hostKey(s.u) + (mmdd(s.t) ? "_" + mmdd(s.t) : ""), id = base, n = 2;
  while (usedIds.has(id)) id = base + "_" + n++;
  usedIds.add(id);
  const e = { id, title: s.t, url: s.u };
  sources.push(e); byUrl.set(s.u, e); return e;
}

// ---- events ----
const KIND = { Strike: "airstrike", Airstrike: "airstrike", Missile: "missile", Drone: "drone", Maritime: "naval", Explosions: "naval", Ground: "ground", Shooting: "ground", Shelling: "artillery", Diplomacy: "diplomacy", Protest: "unrest", "Settler attack": "unrest", "Chemical claim": "claim", "Military buildup": "other", "Security op": "other", "Armed group": "other" };
const FRONT = meta.fronts.labels;
function region(i) {
  const p = i.place;
  if (i.front === "pal") return /Nablus|West Bank/i.test(p) ? "westbank" : "gaza";
  if (i.front === "north") return /Syria|Quneitra/i.test(p) ? "syria" : "lebanon";
  if (i.front === "other") return /Iraq/i.test(p) ? "iraq" : "iran-internal";
  if (/Israel/i.test(p)) return "israel";
  if (/Yemen/i.test(p)) return "yemen";
  if (/Tehran/i.test(p)) return "iran-war";
  return "gulf";
}
function area(i) {
  const p = i.place;
  for (const [re, n] of [[/Gaza|Rafah|Khan Younis|Mawasi/i, "Gaza"], [/Nablus/i, "West Bank"], [/Lebanon|Bint Jbeil/i, "Lebanon"], [/Syria|Quneitra/i, "Syria"], [/Israel/i, "Israel"], [/Yemen/i, "Yemen"], [/Saudi/i, "Saudi Arabia"], [/Iraq/i, "Iraq"], [/Oman|Hormuz|Qeshm|Sirik/i, "Strait of Hormuz"], [/Iran/i, "Iran"], [/Tampa/i, "Lebanon"]]) if (re.test(p)) return n;
  return "Region";
}
const OBLAST_PREC = new Set([46, 18, 31, 13, 29, 30, 21]); // only a province / area, or a symbolic marker
const evIds = new Set();
function slug(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").filter((w) => !["near", "the", "of", "sea", "nm", "ne", "n", "w", "sw", "s", "southern", "western", "eastern", "east", "north", "northern", "central", "south", "a", "and", "exact", "region", "international"].includes(w) && !/^\d+$/.test(w)).slice(0, 2).join("-") || "event"; }
const events = inc.incidents.map((i) => {
  const date = i.d ? `2026-10-${String(i.d).padStart(2, "0")}` : "2026-10-06";
  const FIX = { 46: "western-yemen", 13: "eastern-province", 18: "southern-syria", 33: "hormuz-corridor" };
  let base = `${FIX[i.id] || slug(i.place)}-${date.slice(5).replace("-", "")}`, id = base, n = 2;
  while (evIds.has(id)) id = `${base}-${n++}`;
  evIds.add(id);
  const kind = KIND[i.kind]; if (!kind) throw new Error("unknown kind " + i.kind);
  const e = {
    id, date, region: region(i), oblast: area(i), front: FRONT[i.front], type: kind, status: ST[i.st],
    title: `${i.kind}: ${i.place}`.slice(0, 140), caption: i.cap, lat: i.lat, lon: i.lon,
    coordPrecision: OBLAST_PREC.has(i.id) ? "oblast" : "approx", place: i.place.slice(0, 80),
    sources: i.src.map(src), read: i.full ? "full" : "snippet",
  };
  if (!i.d) e.dateNote = i.dl;
  if (i.claims && i.claims.length) e.claims = i.claims.map((c) => ({ who: c.who, says: c.says }));
  return e;
}).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

const lanes = inc.lanes.map((l) => {
  const o = { id: slug(l.n.replace(/\//g, " ")).replace(/^strait-hormuz$/, "hormuz").replace(/^red-bab$/, "red-sea") + "-lane", name: l.n, status: ST[l.st], text: l.status, color: l.color, points: l.pts, sources: l.src.map(src) };
  if (l.claims) o.claims = l.claims.map((c) => ({ who: c.who, says: c.says }));
  return o;
});

// ---- stats ----
function asOf(s) {
  const all = [...String(s).matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s*-\s*(\d{1,2}))?(?:,\s*(\d{4}))?/g)];
  if (!all.length) return SNAP;
  const m = all[all.length - 1], d = m[3] || m[2];
  return `${m[4] || 2026}-${String(MON[m[1]]).padStart(2, "0")}-${d.padStart(2, "0")}`;
}
const stats = [];
for (const f of st.figures) stats.push({
  label: f.title, category: /displaced/i.test(f.title) ? "humanitarian" : "casualties", asOf: asOf(f.asOf), asOfNote: f.asOf, status: ST[f.st],
  rows: f.rows.map((r) => ({ who: r.who, value: r.says })), ...(f.note ? { note: f.note } : {}), sources: f.src.map((s) => src(s).id),
});
for (const d of st.diplomacy) stats.push({ label: d.front, category: "diplomacy", asOf: SNAP, asOfNote: "Oct 30, 2026", status: ST[d.st], headline: d.status, tone: d.tone, text: d.text, sources: [src(d.src).id] });
const o = st.oil;
stats.push({ label: "Brent crude oil price", category: "economy", asOf: asOf(o.priceSub), status: ST[o.st], headline: o.price, sub: o.priceSub, series: o.brent.map((b) => ({ label: b.l, value: b.v })), note: o.note, sources: o.src.map((s) => src(s).id) });
for (const c of st.cards) stats.push({
  label: c.title, category: "economy", asOf: SNAP, asOfNote: c.sub ? c.sub : "Oct 30, 2026", status: ST[c.st],
  ...(c.claims ? { rows: c.claims.map((r) => ({ who: r.who, value: r.says })) } : {}), ...(c.note ? { note: c.note } : {}), ...(c.text ? { text: c.text } : {}), sources: c.src.map((s) => src(s).id),
});

const doc = {
  schemaVersion: 1, map: "middle-east",
  meta: {
    lastUpdated: meta.lastUpdated,
    coverage: `${events[0].date} to ${events[events.length - 1].date}`,
    notes: [
      `Snapshot as of ${meta.asOf}, imported from the original Grok tracker. Facts, labels and sources are unchanged.`,
      "A sample of incidents, not a complete count: Gaza and Lebanon strikes are near-daily.",
      "Counts come from different parties, periods and methods; do not add them together.",
      "Marker positions are approximate (see coordPrecision). Undated incidents sit on Oct 6 and say so.",
    ],
  },
  events, lanes, stats, sources,
};
fs.writeFileSync(out, JSON.stringify(doc, null, 1) + "\n");
console.log(`${events.length} events, ${lanes.length} lanes, ${stats.length} stats, ${sources.length} sources`);
console.log(events.map((e) => `${e.id} ${e.region} ${e.type} ${e.status}`).join("\n"));
