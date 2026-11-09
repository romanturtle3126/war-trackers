#!/usr/bin/env node
// Assemble the site into www/: everything in web/ plus data/*.json (bundled offline copy).
// Used for GitHub Pages and for the Android app (Capacitor webDir).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, process.argv[2] || "www");
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, "web"), OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, "data"))) if (f.endsWith(".json")) fs.copyFileSync(path.join(ROOT, "data", f), path.join(OUT, "data", f));
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
console.log("built", path.relative(ROOT, OUT));
