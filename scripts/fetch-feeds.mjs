#!/usr/bin/env node
// Pull headlines from open RSS/Atom feeds into data/<map>-feed.json. No dependencies.
// Headlines are auto-pulled and shown as UNVERIFIED in the app's Feed tab.
// Usage: node scripts/fetch-feeds.mjs [ukraine]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEEDS = {
  ukraine: {
    keywords: /ukrain|russia|kyiv|kremlin|zelensk|putin|crimea|donetsk|kharkiv|black sea|moscow/i,
    feeds: [
      { name: "Kyiv Independent", url: "https://kyivindependent.com/news-archive/rss/", filter: false },
      { name: "Ukrinform", url: "https://www.ukrinform.net/rss/block-lastnews", filter: false },
      { name: "Ukrainska Pravda", url: "https://www.pravda.com.ua/eng/rss/", filter: false },
      { name: "The Guardian (Ukraine)", url: "https://www.theguardian.com/world/ukraine/rss", filter: false },
      { name: "BBC News Europe", url: "https://feeds.bbci.co.uk/news/world/europe/rss.xml", filter: true },
      { name: "UN News Europe", url: "https://news.un.org/feed/subscribe/en/news/region/europe/feed/rss.xml", filter: true },
      { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", filter: true },
      { name: "UK Ministry of Defence (GOV.UK)", url: "https://www.gov.uk/government/organisations/ministry-of-defence.atom", filter: true },
    ],
  },
};

const decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")); return m ? decode(m[1]) : null; };
const toIso = (s) => { if (!s) return null; const t = Date.parse(s); return isNaN(t) ? null : new Date(t).toISOString(); };

async function fetchFeed(f, kw) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(f.url, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (war-trackers feed bot)" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const xml = await r.text(), out = [];
    for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) out.push([tag(m[0], "title"), tag(m[0], "link"), tag(m[0], "pubDate") || tag(m[0], "dc:date")]);
    for (const m of xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)) { const l = m[0].match(/<link[^>]*href="([^"]+)"/i); out.push([tag(m[0], "title"), l && l[1].replace(/&amp;/g, "&"), tag(m[0], "updated") || tag(m[0], "published")]); }
    return out.filter(([t, l]) => t && l && (!f.filter || kw.test(t))).slice(0, 25).map(([t, l, d]) => ({ headline: t, source: f.name, link: l.trim(), date: toIso(d) }));
  } finally { clearTimeout(t); }
}

const mapId = process.argv[2] || "ukraine";
const cfg = FEEDS[mapId];
const OUT = path.join(ROOT, `data/${mapId}-feed.json`);
const entries = [], status = [];
for (const f of cfg.feeds) {
  try { const got = await fetchFeed(f, cfg.keywords); entries.push(...got); status.push({ source: f.name, ok: true, count: got.length }); }
  catch (ex) { status.push({ source: f.name, ok: false, error: String(ex.message || ex).slice(0, 120) }); console.warn("WARN", f.name, ex.message); }
}
const seen = new Set(), items = entries.filter((e) => !seen.has(e.link) && seen.add(e.link)).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 150);
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
if (!items.length) { console.log("no headlines fetched; keeping old feed"); process.exit(0); }
if (JSON.stringify(old.items) === JSON.stringify(items)) { console.log("feed unchanged"); process.exit(0); }
fs.writeFileSync(OUT, JSON.stringify({ meta: { lastUpdated: new Date().toISOString().replace(/\.\d+Z$/, "+00:00"), note: "Auto-pulled headlines. Unverified until reviewed.", feeds: status }, items }, null, 1) + "\n");
console.log(`wrote ${items.length} headlines to ${path.relative(ROOT, OUT)}`);
