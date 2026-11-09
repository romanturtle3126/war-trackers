#!/usr/bin/env node
// Validate a map data file. Exit code 1 if there are errors.
// Usage: node scripts/validate.mjs [data/ukraine.json] [--links]   (--links also checks every source URL; slow)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, checkLinks } from "./lib/validate-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const file = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(ROOT, "data/ukraine.json"));
const maps = JSON.parse(fs.readFileSync(path.join(ROOT, "web/maps.json"), "utf8")).maps;

let doc;
try { doc = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (ex) { console.error(`ERROR ${file}: not valid JSON: ${ex.message}`); process.exit(1); }
const cfg = maps.find((m) => m.id === doc.map);
if (!cfg) { console.error(`ERROR ${file}: "map" must be one of ${maps.map((m) => m.id).join(", ")}`); process.exit(1); }

const r = validate(doc, cfg);
if (args.includes("--links")) {
  const urls = (doc.sources || []).map((s) => s.url);
  const l = await checkLinks(urls);
  r.errors.push(...l.errors); r.warnings.push(...l.warnings);
}
r.warnings.forEach((w) => console.log("warning:", w));
r.errors.forEach((e) => console.error("ERROR:", e));
console.log(`${path.relative(ROOT, file)}: ${doc.events?.length ?? 0} events, ${doc.stats?.length ?? 0} stats, ${doc.sources?.length ?? 0} sources — ${r.errors.length} error(s), ${r.warnings.length} warning(s)`);
process.exit(r.errors.length ? 1 : 0);
