#!/usr/bin/env node
// Local preview: node scripts/serve.mjs [port]  →  http://127.0.0.1:8765  (serves web/, with /data from data/)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = +process.argv[2] || 8765;
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  const base = u.startsWith("/data/") ? ROOT : path.join(ROOT, "web");
  let p = path.normalize(path.join(base, u));
  if (!p.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  if (u.endsWith("/")) p = path.join(p, "index.html");
  fs.readFile(p, (e, b) => { if (e) { r.writeHead(404); return r.end("not found"); } r.writeHead(200, { "Content-Type": T[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" }); r.end(b); });
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/`));
