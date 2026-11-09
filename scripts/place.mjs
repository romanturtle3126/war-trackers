#!/usr/bin/env node
// Look up a town's coordinates: node scripts/place.mjs "Pokrovsk" ["Kharkiv" ...]
// Prints matches (biggest first) so events can use real coordinates instead of guesses.
import { lookup } from "./lib/places.mjs";
for (const q of process.argv.slice(2)) {
  const hits = lookup(q);
  if (!hits.length) { console.log(`${q}: NOT FOUND (try another spelling, e.g. Ukrainian transliteration, or the nearest larger town)`); continue; }
  console.log(`${q}:`);
  hits.slice(0, 8).forEach((p) => console.log(`  ${p.name} [${p.cc}] lat ${p.lat}, lon ${p.lon}${p.pop ? ` (pop ${p.pop.toLocaleString("en")})` : ""}`));
  if (hits.length > 8) console.log(`  …and ${hits.length - 8} more places with this name`);
}
