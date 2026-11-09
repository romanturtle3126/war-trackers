# Daily update instructions (Ukraine Ops Map)

The scheduled Claude routine reads this file every morning and follows it exactly. Edit this file to change what it researches; nothing else needs to change.

You are updating `data/ukraine.json`, the data behind a public map of the Russia-Ukraine war. Accuracy matters more than volume. A day with three well-sourced events is better than a day with fifteen shaky ones. **Never invent anything.**

## 0. Setup

1. Work in the repository root. Run `node --version` (Node 18+ is needed; no `npm install` is required).
2. Read `data/SCHEMA.md` (the format and rules) and look at the newest ~20 events in `data/ukraine.json` to match their style, ids, `front` names and `region` values.
3. Note `meta.lastUpdated`. Your research window is from 24 hours before that time until now, plus any obvious gap since then.

## 1. Research (web search and fetch)

Look for events in the window. Open every page you cite; only cite URLs you actually opened.

Preferred sources, in roughly this order:
- **ISW** Russian Offensive Campaign Assessment (understandingwar.org; if blocked, the same text on criticalthreats.org). Use it for front-line movements, geolocated footage, and assessed advances.
- **Wire services and major outlets:** Reuters, AP, AFP, BBC, The Guardian, Kyiv Independent, Ukrainska Pravda, Meduza, Mediazona, UN News / OHCHR (HRMMU).
- **Official statements = that side's claim:** Ukraine's General Staff, Air Force, regional governors, State Emergency Service; Russia's Ministry of Defence (or TASS/RIA relaying it).
- Geolocated footage reports: only if an outlet or ISW describes the geolocation.

What to add: major missile/drone attacks (with the attacker's launch numbers and the defender's interception claims), strikes with casualties, attacks on energy infrastructure, Ukrainian strikes inside Russia/occupied areas, front-line changes assessed by ISW, territorial claims by either side, naval/Black Sea events, ceasefire or humanitarian news (prisoner exchanges, evacuations). Skip routine diplomacy unless it changes the fighting.

Also check whether any existing event from the last 7 days needs correcting (casualty totals revised, a claim confirmed or refuted). Correct it by re-using its `id` with updated fields and say what changed in a note.

Also refresh `stats` whose figures have new numbers (General Staff daily loss tally, Russian MoD shoot-down claims, UN civilian casualty reports). Keep each stat's `label` exactly the same so it replaces the old one.

## 2. Labels: be conservative

- `CONFIRMED`: reported by authorities **and** at least one independent outlet (wire service, major newspaper, Kyiv Independent, BBC, UN, ISW geolocation). The validator rejects CONFIRMED events whose sources are all official, state-media or social posts.
- `ONE_PARTY`: only Ukraine or only Russia says it.
- `DISPUTED`: the sides' claims conflict. Add a `numbers` block with both claims side by side.
- `UNVERIFIED`: reported but not confirmed, or it is only an analyst's assessment.
- When unsure, pick the weaker label. Attribute claims in the caption ("Ukraine's Air Force says…", "Russia's MoD claims…").

## 3. Positions: never invent coordinates

- Use the coordinates of the named city/town/village from a gazetteer you know well (city centre). Set `coordPrecision: "city"`.
- If the report names only a district or "near X", use X's coordinates with `"approx"`.
- If only the province is known, use the province's main city or centre with `"oblast"`.
- Never place a marker at a precise spot the sources don't give. Coordinates must be inside lat 40–62, lon 18–62.

## 4. Write the incoming file

Create `data/incoming/ukraine.json` (create the folder if needed):

```json
{
  "map": "ukraine",
  "notes": [
    "Refreshed <date> (<time> Toronto) from <which sources were read>.",
    "<Anything missing, e.g. 'ISW assessment for <date> not yet published'>",
    "Coordinates are city-level or approximate (see coordPrecision); markers flagged 'oblast' are not geolocated.",
    "Casualty figures are as reported by the cited outlet at time of writing and may have been revised."
  ],
  "events": [ /* only NEW events and CORRECTED existing events, in the exact event format from data/SCHEMA.md */ ],
  "stats":  [ /* only stats with new figures, full objects, same labels */ ],
  "sources": [ /* registry entries for any source id used by stats that is not already in data/ukraine.json */ ]
}
```

Rules:
- New ids follow `place-MMDD` (lowercase, dashes), e.g. `odesa-1109`; add `-2` if taken. Check existing ids first.
- Source ids follow `<outlet>_<MMDD>` or similar (e.g. `ki_1109`, `isw_1108`, `reuters_kharkiv_1109`). A new id must not already exist with a different URL.
- Each event needs: id, date, region, oblast, front, type, status, title, caption, lat, lon, coordPrecision, sources (and optionally numbers). No other fields.
- `region` values: `north` (Sumy, Chernihiv, Kharkiv incl. Kupiansk), `donbas` (Donetsk, Luhansk), `south` (Zaporizhzhia, Dnipropetrovsk, Kherson, Mykolaiv, Odesa), `crimea-sea` (Crimea, Black Sea, Sea of Azov), `rear` (Kyiv and all other Ukrainian regions), `russia` (anywhere in Russia incl. border oblasts).
- `date` is the day the event happened (Kyiv time), not the publication day.
- If you found nothing new, write the file with `"events": []` and an honest note. That is a valid result.

## 5. Merge and validate (do NOT edit `data/ukraine.json` yourself)

Run:

```
node scripts/merge-update.mjs data/incoming/ukraine.json
```

- It merges by id, never deletes, checks every rule, checks that new links are not dead, bumps "Data updated", and appends to `UPDATE_LOG.md`.
- If it prints `UPDATE REJECTED`, read the reasons, fix `data/incoming/ukraine.json` (fix or drop the bad item; do not weaken labels to get past a check, and never invent a replacement URL), and run it again. Try at most 3 times. If it still fails, stop. The log already records why, and the old data stays untouched.
- Then run `node scripts/validate.mjs` as a final check.

## 6. Commit and push

Only these files may change: `data/ukraine.json`, `UPDATE_LOG.md` (and the incoming file, which the merge deletes). Do not touch anything else.

```
git checkout -b claude/data-$(date -u +%Y-%m-%d)
git add data/ukraine.json UPDATE_LOG.md data/incoming
git commit -m "Daily data update $(date -u +%Y-%m-%d)"
git push -u origin HEAD
```

If the merge failed, still commit and push `UPDATE_LOG.md` alone on the same branch name so the failure is recorded. A GitHub workflow re-validates the branch, merges it into `main` and publishes it. If the branch name already exists, add `-2`.

## 7. Report

End with a short summary: how many events were added or updated (ids and labels), which stats changed, what you could not read, and whether the merge passed.
