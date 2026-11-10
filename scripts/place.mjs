#!/usr/bin/env node
// Look up a town's coordinates: node scripts/place.mjs "Pokrovsk" ["Kharkiv" ...]
// Middle East map:            node scripts/place.mjs --map=middle-east "Khan Younis" "Bandar Abbas"
// Prints matches (biggest first) so events can use real coordinates instead of guesses.
import { lookup } from "./lib/places.mjs";
const args = process.argv.slice(2);
const map = (args.find((a) => a.startsWith("--map=")) || "--map=ukraine").slice(6);
for (const q of args.filter((a) => !a.startsWith("--"))) {
  const hits = lookup(q, map);
  if (!hits.length) { console.log(`${q}: NOT FOUND (try another spelling or transliteration, or the nearest larger town)`); continue; }
  console.log(`${q}:`);
  hits.slice(0, 8).forEach((p) => console.log(`  ${p.name} [${p.cc}] lat ${p.lat}, lon ${p.lon}${p.pop ? ` (pop ${p.pop.toLocaleString("en")})` : ""}`));
  if (hits.length > 8) console.log(`  …and ${hits.length - 8} more places with this name`);
}
