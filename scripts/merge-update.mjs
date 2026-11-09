#!/usr/bin/env node
// Merge a daily research file into a map's data file — only if everything validates.
// Usage: node scripts/merge-update.mjs [data/incoming/ukraine.json] [--dry-run] [--no-links]
//
// Rules (see UPDATE_PROMPT.md and data/SCHEMA.md):
//  - Events are merged by id. New ids are added; a matching id replaces the old event. Nothing is ever deleted.
//  - An existing event's date cannot change. New events must be dated within the last MAX_AGE_DAYS days.
//  - Stats are merged by exact label. Sources are added to the registry; an existing source id cannot change url.
//  - At most MAX_NEW new events and MAX_UPDATED updated events per run.
//  - The merged file must pass validate-core, and every NEW source URL must not be a dead link (404/410/no such host).
//  - On success: data file rewritten, meta.lastUpdated bumped, UPDATE_LOG.md appended, incoming file deleted. Exit 0.
//  - On failure: data file untouched, reason appended to UPDATE_LOG.md, exit 1.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, checkLinks } from "./lib/validate-core.mjs";

const MAX_NEW = 40, MAX_UPDATED = 30, MAX_AGE_DAYS = 10, MAX_NOTES = 10;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run"), LINKS = !args.includes("--no-links");
const inFile = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(ROOT, "data/incoming/ukraine.json"));
const LOG = path.join(ROOT, "UPDATE_LOG.md");

function torontoStamp(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset" }).formatToParts(d).map((x) => [x.type, x.value]));
  const off = (p.timeZoneName || "GMT-05:00").replace("GMT", "") || "+00:00";
  return { iso: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`, human: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} Toronto`, day: `${p.year}-${p.month}-${p.day}` };
}
const now = torontoStamp();

function log(lines) {
  if (DRY) { console.log(lines.join("\n")); return; }
  const head = "# Data update log\n\nNewest first. Written by scripts/merge-update.mjs on every daily run.\n\n";
  const old = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").replace(head, "") : "";
  fs.writeFileSync(LOG, head + lines.join("\n") + "\n\n" + old);
}
function fail(reasons, warnings = []) {
  log([`## ${now.human} — FAILED (data not changed)`, ...reasons.slice(0, 40).map((r) => `- ${r}`), ...(reasons.length > 40 ? [`- …and ${reasons.length - 40} more`] : []), ...warnings.slice(0, 10).map((w) => `- warning: ${w}`)]);
  console.error("UPDATE REJECTED — data/ unchanged:\n" + reasons.map((r) => "  - " + r).join("\n"));
  process.exit(1);
}

let inc;
try { inc = JSON.parse(fs.readFileSync(inFile, "utf8")); }
catch (ex) { fail([`incoming file ${path.relative(ROOT, inFile)} missing or not valid JSON: ${ex.message}`]); }
const maps = JSON.parse(fs.readFileSync(path.join(ROOT, "web/maps.json"), "utf8")).maps;
const cfg = maps.find((m) => m.id === inc.map);
if (!cfg) fail([`incoming "map" must be one of ${maps.map((m) => m.id).join(", ")}`]);
const dataFile = path.join(ROOT, cfg.data);
const cur = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const next = structuredClone(cur);
const problems = [];

const inEvents = Array.isArray(inc.events) ? inc.events : [];
const inStats = Array.isArray(inc.stats) ? inc.stats : [];
const inSources = Array.isArray(inc.sources) ? inc.sources : [];
if (!Array.isArray(inc.events)) problems.push('incoming "events" must be a list (it can be empty)');

// Sources: explicit registry additions first, then any new ids used inline by events.
const reg = new Map(next.sources.map((s) => [s.id, s]));
const newSourceUrls = [];
function addSource(s, where) {
  if (!s || !s.id) return problems.push(`${where}: source without id`);
  const old = reg.get(s.id);
  if (old) { if (old.url !== s.url) problems.push(`${where}: source id "${s.id}" already exists with a different url — use a new id`); return; }
  const entry = { id: s.id, title: s.title, url: s.url };
  reg.set(s.id, entry); next.sources.push(entry); newSourceUrls.push(s.url);
}
inSources.forEach((s, i) => addSource(s, `sources[${i}]`));
inEvents.forEach((e) => (e && Array.isArray(e.sources) ? e.sources : []).forEach((s) => addSource(s, `event "${e.id}"`)));

// Events
const byId = new Map(next.events.map((e, i) => [e.id, i]));
const added = [], updated = [];
const minDate = new Date(Date.parse(now.day + "T00:00:00Z") - MAX_AGE_DAYS * 864e5).toISOString().slice(0, 10);
const seen = new Set();
for (const e of inEvents) {
  if (!e || typeof e.id !== "string") { problems.push("an incoming event has no id"); continue; }
  if (seen.has(e.id)) { problems.push(`event "${e.id}" appears twice in the incoming file`); continue; }
  seen.add(e.id);
  if (byId.has(e.id)) {
    const i = byId.get(e.id), old = next.events[i];
    if (old.date !== e.date) { problems.push(`event "${e.id}": cannot change the date of an existing event (${old.date} → ${e.date})`); continue; }
    if (JSON.stringify(old) === JSON.stringify(e)) continue;
    const changed = [...new Set([...Object.keys(old), ...Object.keys(e)])].filter((k) => JSON.stringify(old[k]) !== JSON.stringify(e[k]));
    next.events[i] = e; updated.push({ e, changed, oldStatus: old.status });
  } else {
    if (typeof e.date === "string" && e.date < minDate) { problems.push(`new event "${e.id}" is dated ${e.date}, older than ${MAX_AGE_DAYS} days — only recent events can be added`); continue; }
    next.events.push(e); byId.set(e.id, next.events.length - 1); added.push(e);
  }
}
if (added.length > MAX_NEW) problems.push(`${added.length} new events in one run (limit ${MAX_NEW}) — looks wrong, refusing`);
if (updated.length > MAX_UPDATED) problems.push(`${updated.length} updated events in one run (limit ${MAX_UPDATED}) — looks wrong, refusing`);
next.events.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));

// Stats (by label)
const statIdx = new Map(next.stats.map((f, i) => [f.label, i]));
let statsAdded = 0, statsUpdated = 0;
for (const f of inStats) {
  if (!f || typeof f.label !== "string") { problems.push("an incoming stat has no label"); continue; }
  if (statIdx.has(f.label)) { const i = statIdx.get(f.label); if (JSON.stringify(next.stats[i]) !== JSON.stringify(f)) { next.stats[i] = f; statsUpdated++; } }
  else { next.stats.push(f); statIdx.set(f.label, next.stats.length - 1); statsAdded++; }
}

// Meta
const changedAnything = added.length || updated.length || statsAdded || statsUpdated;
next.meta.lastUpdated = now.iso;
const start = (cur.meta.coverage || "").slice(0, 10) || next.events[0].date;
const end = next.events.reduce((m, e) => (typeof e.date === "string" && e.date > m ? e.date : m), "");
next.meta.coverage = `${start} to ${end}`;
if (Array.isArray(inc.notes) && inc.notes.length) next.meta.notes = inc.notes.slice(0, MAX_NOTES);

const v = validate(next, cfg, { today: now.day });
problems.push(...v.errors);
const warnings = [...v.warnings.filter((w) => !cur.sources.some((s) => w.includes(`"${s.id}"`)))];
if (!problems.length && LINKS && newSourceUrls.length) {
  const l = await checkLinks(newSourceUrls);
  problems.push(...l.errors); warnings.push(...l.warnings);
}
if (problems.length) fail(problems, warnings);

const lines = [`## ${now.human} — OK${changedAnything ? "" : " (no new information)"}`];
if (added.length) lines.push(`- Added ${added.length} event(s):`, ...added.map((e) => `  - \`${e.id}\` ${e.date} [${e.status}] ${e.title}`));
if (updated.length) lines.push(`- Updated ${updated.length} event(s):`, ...updated.map((u) => `  - \`${u.e.id}\` changed ${u.changed.join(", ")}${u.oldStatus !== u.e.status ? ` (status ${u.oldStatus} → ${u.e.status})` : ""}`));
if (statsAdded || statsUpdated) lines.push(`- Stats: ${statsUpdated} updated, ${statsAdded} added`);
if (newSourceUrls.length) lines.push(`- ${newSourceUrls.length} new source link(s)`);
lines.push(`- Totals: ${next.events.length} events, ${next.stats.length} stats, ${next.sources.length} sources; coverage ${next.meta.coverage}`);
warnings.slice(0, 15).forEach((w) => lines.push(`- warning: ${w}`));

if (!DRY) {
  fs.writeFileSync(dataFile, JSON.stringify(next, null, 1) + "\n");
  fs.rmSync(inFile, { force: true });
}
log(lines);
console.log(lines.join("\n"));
