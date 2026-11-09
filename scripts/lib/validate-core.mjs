// Shared data checks for data/<map>.json. Used by validate.mjs (CLI, CI) and merge-update.mjs (daily job).
// See data/SCHEMA.md for the format these rules enforce.

export const TYPES = ["missile", "drone", "airstrike", "artillery", "energy", "deep-strike", "frontline", "claim", "ceasefire", "naval", "other"];
export const STATUSES = ["CONFIRMED", "ONE_PARTY", "DISPUTED", "UNVERIFIED"];
export const PRECISIONS = ["city", "approx", "oblast"];
export const STAT_CATEGORIES = ["casualties", "equipment", "shootdowns", "territory", "other"];

// Outlets that speak for one side (government, military, state media) or are unvetted social posts.
// A CONFIRMED event needs at least one source that is NOT on this list.
export const PARTY_DOMAINS = [
  "gov.ua", "mil.gov.ua", "mod.gov.ua", "president.gov.ua", "ukrinform.net", "ukrinform.ua",
  "mil.ru", "mod.gov.ru", "kremlin.ru", "government.ru", "tass.ru", "tass.com", "ria.ru", "rg.ru", "iz.ru", "rt.com", "sputnikglobe.com", "interfax.ru",
  "t.me", "x.com", "twitter.com", "facebook.com", "telegram.org", "vk.com",
];

const ID_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;
const SRC_ID_RE = /^[A-Za-z0-9_.-]{2,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; } }
export function isPartyUrl(url) { const h = hostOf(url); return !!h && PARTY_DOMAINS.some((d) => h === d || h.endsWith("." + d)); }
function isUrl(u) { const h = typeof u === "string" && /^https?:\/\//.test(u) && hostOf(u); return !!h && h.includes("."); }
function realDate(d) { if (typeof d !== "string" || !DATE_RE.test(d)) return false; const t = new Date(d + "T00:00:00Z"); return !isNaN(t) && t.toISOString().slice(0, 10) === d; }
function str(v, max) { return typeof v === "string" && v.trim().length > 0 && v.length <= max; }

/**
 * @param doc parsed data file
 * @param mapCfg entry from web/maps.json (bounds, regions)
 * @param opts { today: "YYYY-MM-DD" } dates later than today+1 are rejected
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validate(doc, mapCfg, opts = {}) {
  const E = [], W = [];
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.parse(today + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);
  if (!doc || typeof doc !== "object") return { errors: ["file is not a JSON object"], warnings: [] };
  if (doc.schemaVersion !== 1) E.push("schemaVersion must be 1");
  if (doc.map !== mapCfg.id) E.push(`map must be "${mapCfg.id}"`);

  const m = doc.meta || {};
  if (!m.lastUpdated || isNaN(Date.parse(m.lastUpdated))) E.push("meta.lastUpdated must be an ISO date-time");
  if (typeof m.coverage !== "string" || !/^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/.test(m.coverage)) E.push('meta.coverage must look like "YYYY-MM-DD to YYYY-MM-DD"');
  if (!Array.isArray(m.notes) || m.notes.some((n) => !str(n, 1000))) E.push("meta.notes must be a list of non-empty strings");

  // Source registry
  const reg = new Map();
  if (!Array.isArray(doc.sources)) E.push("sources must be a list");
  else doc.sources.forEach((s, i) => {
    const at = `sources[${i}]`;
    if (!s || !SRC_ID_RE.test(s.id || "")) return E.push(`${at}: bad id "${s && s.id}"`);
    if (reg.has(s.id)) E.push(`${at}: duplicate source id "${s.id}"`);
    if (!str(s.title, 400)) E.push(`${at} (${s.id}): missing title`);
    if (!isUrl(s.url)) E.push(`${at} (${s.id}): bad url "${s.url}"`);
    reg.set(s.id, s);
  });
  const used = new Set();
  const ref = (id, at) => { if (id == null) return; if (!reg.has(id)) E.push(`${at}: source "${id}" is not in the sources list`); else used.add(id); };

  // Events
  const regions = new Set(mapCfg.regions.map((r) => r.id));
  const b = mapCfg.bounds, ids = new Set();
  if (!Array.isArray(doc.events) || doc.events.length === 0) E.push("events must be a non-empty list");
  else doc.events.forEach((e, i) => {
    const at = `event ${e && e.id ? `"${e.id}"` : `#${i}`}`;
    if (!e || typeof e !== "object") return E.push(`${at}: not an object`);
    if (!ID_RE.test(e.id || "")) E.push(`${at}: id must be lowercase letters, digits and dashes (3-64 chars)`);
    if (ids.has(e.id)) E.push(`${at}: duplicate id`);
    ids.add(e.id);
    if (!realDate(e.date)) E.push(`${at}: date must be a real YYYY-MM-DD date`);
    else if (e.date < "2022-02-24") E.push(`${at}: date ${e.date} is before the full-scale invasion`);
    else if (e.date > maxDate) E.push(`${at}: date ${e.date} is in the future`);
    if (!regions.has(e.region)) E.push(`${at}: region "${e.region}" must be one of ${[...regions].join(", ")}`);
    if (!str(e.oblast, 80)) E.push(`${at}: missing oblast`);
    if (!str(e.front, 80)) E.push(`${at}: missing front`);
    if (!TYPES.includes(e.type)) E.push(`${at}: type "${e.type}" must be one of ${TYPES.join(", ")}`);
    if (!STATUSES.includes(e.status)) E.push(`${at}: status "${e.status}" must be one of ${STATUSES.join(", ")}`);
    if (!str(e.title, 140)) E.push(`${at}: title missing or longer than 140 characters`);
    if (!str(e.caption, 1500)) E.push(`${at}: caption missing or longer than 1500 characters`);
    if (!PRECISIONS.includes(e.coordPrecision)) E.push(`${at}: coordPrecision must be one of ${PRECISIONS.join(", ")}`);
    if (typeof e.lat !== "number" || typeof e.lon !== "number" || !isFinite(e.lat) || !isFinite(e.lon)) E.push(`${at}: lat/lon must be numbers`);
    else if (e.lat < b.minLat || e.lat > b.maxLat || e.lon < b.minLon || e.lon > b.maxLon) E.push(`${at}: position ${e.lat},${e.lon} is outside the map area`);
    if (!Array.isArray(e.sources) || e.sources.length === 0) E.push(`${at}: needs at least one source`);
    else {
      e.sources.forEach((s, j) => {
        if (!s || !SRC_ID_RE.test(s.id || "") || !str(s.title, 400) || !isUrl(s.url)) return E.push(`${at}: source #${j + 1} needs id, title and an http(s) url`);
        const r = reg.get(s.id);
        if (!r) E.push(`${at}: source "${s.id}" is not in the sources list`);
        else { used.add(s.id); if (r.url !== s.url) E.push(`${at}: source "${s.id}" url differs from the sources list`); }
      });
      if (e.status === "CONFIRMED" && e.sources.every((s) => s && isPartyUrl(s.url)))
        E.push(`${at}: CONFIRMED needs at least one independent source (all sources are official/state/social)`);
    }
    const extra = Object.keys(e).filter((k) => !["id", "date", "region", "oblast", "front", "type", "status", "title", "caption", "lat", "lon", "coordPrecision", "sources", "numbers", "place"].includes(k));
    if (extra.length) E.push(`${at}: unknown field(s) ${extra.join(", ")}`);
    if (e.place != null && !str(e.place, 80)) E.push(`${at}: place must be a short town/city name`);
    if (e.numbers != null) checkNumbers(e.numbers, `${at} numbers`, E, ref, false);
  });

  // Stats
  if (!Array.isArray(doc.stats)) E.push("stats must be a list");
  else doc.stats.forEach((f, i) => {
    const at = `stats[${i}] "${f && f.label}"`;
    if (!f || !str(f.label, 200)) return E.push(`stats[${i}]: missing label`);
    if (!STAT_CATEGORIES.includes(f.category)) E.push(`${at}: category must be one of ${STAT_CATEGORIES.join(", ")}`);
    if (!realDate(f.asOf) || f.asOf > maxDate) E.push(`${at}: asOf must be a real date, not in the future`);
    checkNumbers(f, at, E, ref, true);
  });

  for (const id of reg.keys()) if (!used.has(id)) W.push(`source "${id}" is not used by any event or stat`);
  return { errors: E, warnings: W };
}

function checkNumbers(n, at, E, ref, isStat) {
  if (!isStat && !str(n.label, 200)) E.push(`${at}: missing label`);
  for (const side of ["ukraine", "russia"]) {
    const c = n[side];
    if (!c || !str(c.value, 600)) E.push(`${at}: ${side}.value missing`);
    else ref(c.source, `${at} ${side}`);
  }
  const ind = n.independent == null ? [] : Array.isArray(n.independent) ? n.independent : [n.independent];
  if (isStat && !Array.isArray(n.independent)) E.push(`${at}: independent must be a list (can be empty)`);
  ind.forEach((c, k) => { if (!c || !str(c.value, 600)) E.push(`${at}: independent #${k + 1} value missing`); else ref(c.source, `${at} independent`); });
}

/** Checks that each URL answers. 404/410 and unreachable hosts are errors; 401/403/429/5xx/timeouts are warnings (many news sites block bots). */
export async function checkLinks(urls, { timeoutMs = 15000, concurrency = 6 } = {}) {
  const E = [], W = [], list = [...new Set(urls)];
  let i = 0;
  // If this machine has no general internet access (some sandboxes), skip instead of failing every link.
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    await fetch("https://www.wikipedia.org/", { method: "HEAD", signal: ctl.signal }).finally(() => clearTimeout(t));
  } catch (ex) {
    return { errors: [], warnings: [`link check skipped: no internet access from this machine (${String(ex.cause?.code || ex.name || ex)})`] };
  }
  async function one(url) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { method: "GET", redirect: "follow", signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (war-trackers link check)", Accept: "text/html,*/*" } });
      if (r.status === 404 || r.status === 410) E.push(`link ${url} returned ${r.status} (page does not exist)`);
      else if (!r.ok) W.push(`link ${url} returned ${r.status} (site may block bots)`);
      try { await r.body?.cancel(); } catch {}
    } catch (ex) {
      const msg = String(ex && (ex.cause?.code || ex.name || ex));
      if (/ENOTFOUND|EAI_AGAIN|ERR_INVALID_URL/.test(msg)) E.push(`link ${url} host not found (${msg})`);
      else W.push(`link ${url} could not be checked (${msg})`);
    } finally { clearTimeout(t); }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, async () => { while (i < list.length) await one(list[i++]); }));
  return { errors: E, warnings: W };
}
