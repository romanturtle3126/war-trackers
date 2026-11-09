# Daily update instructions (Ukraine Ops Map)

The scheduled Claude routine reads this file every morning and follows it exactly. Edit this file to change what it researches; nothing else needs to change.

You are updating `data/ukraine.json`, the data behind a public map of the Russia-Ukraine war. Accuracy matters more than volume. A day with three well-sourced events is better than a day with fifteen shaky ones. **Never invent anything.**

## 0. Setup

1. Work in the repository root. Run `node --version` (Node 18+ is needed; no `npm install` is required).
2. Read `data/SCHEMA.md` (the format and rules) and look at the newest ~20 events in `data/ukraine.json` to match their style, ids, `front` names and `region` values.
3. Note `meta.lastUpdated`. Your research window is from 24 hours before that time until now, plus any obvious gap since then.

## 1. Research (web search and fetch)

Look for events in the window. Open every page you cite; only cite URLs you actually opened.

**Start with the leads list.** `data/ukraine-feed.json` holds 100+ headlines pulled from news RSS feeds about 30 minutes before this run (Kyiv Independent, Ukrinform, Ukrainska Pravda, Guardian, BBC, UN News, Al Jazeera, UK MoD). Read every item from the research window and treat each as a *lead*: open the article itself before using it. A headline alone is never a source.

**Official statements on X and Telegram.** Each side's officials post first on X and Telegram. Check them for overnight attack numbers, interception claims, governors' casualty reports and MoD claims:
- Ukraine: Air Force `@KpsZSU` (Telegram `kpszsu`), General Staff `@GeneralStaffUA` (Telegram `GeneralStaffZSU`), Ministry of Defence `@DefenceU`, President `@ZelenskyyUa`, State Emergency Service `@DSNSgovua`, regional governors (e.g. Kharkiv `synegubov`, Dnipropetrovsk `dnipropetrovskaODA`, Zaporizhzhia `zoda_gov_ua`, Odesa `odeskaODA`, Sumy `Sumy_news_ODA`).
- Russia: Ministry of Defence (Telegram `mod_russia`, X `@mod_russia`), governors of Belgorod (`vvgladkov`), Kursk, Bryansk (`avbogomaz`), Rostov, Krasnodar operational HQ.
- Monitors and outlets: `@KyivIndependent`, `@Reuters`, `@AP`, `@ISWResearch`.

How to read them (X usually blocks direct reading):
1. Find posts with web search, e.g. `site:x.com KpsZSU drones November 9`.
2. Read a single X post through the public embed service (no login needed), with Bash: `curl -sL "https://publish.x.com/oembed?url=https%3A%2F%2Fx.com%2F<account>%2Fstatus%2F<id>"`. The JSON's `html` field contains the post text and date.
3. Read Telegram channels through their public preview, with Bash: `curl -sL -A "Mozilla/5.0" https://t.me/s/<channel>` (e.g. `kpszsu`). Each post sits in a `tgme_widget_message_text` block, with its number in `data-post="<channel>/<n>"` and its time in a `datetime` attribute. Cite the single post as `https://t.me/<channel>/<n>`.
**Minimum checklist, every run (report each as read / not read):**
- [ ] Telegram `kpszsu` (Ukraine Air Force: overnight launch and interception numbers)
- [ ] Telegram `GeneralStaffZSU` (General Staff: losses tally, strikes on Russia)
- [ ] Telegram `mod_russia` (Russian MoD: shoot-down claims, territorial claims)
- [ ] At least two X searches (`site:x.com ...`) for the night's main attacks, with any useful post read through the embed service
- [ ] ISW / Critical Threats latest assessment
- [ ] The headline leads file

**Nationwide overnight attacks** (e.g. "Russia launched 317 drones and 6 missiles") have no single location. Don't skip them: update the stat `"Russian drones and missiles launched at Ukraine (latest night)"` (category `shootdowns`, same label every day) with Ukraine's Air Force launched/downed numbers in `ukraine` and the Russian MoD's claim in `russia`. Separately, add map events only for named places that were hit.

4. Cite the X or Telegram post URL itself. These are **that side's claim**: an event whose only sources are X/Telegram/official sites must be `ONE_PARTY` (or `DISPUTED`), never `CONFIRMED`. The validator enforces this.

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

Always take coordinates from the built-in place list (48,000 towns and villages from GeoNames), never from memory:

```
node scripts/place.mjs "Pokrovsk" "Kupiansk" "Kirishi"
```

It prints matching places, biggest first, with their lat/lon. Many villages share a name, so pick the one in the right oblast.

- Every new event needs `"place"`: the town or village its position is based on, spelled as the lookup accepts it. Copy that place's `lat`/`lon` (rounded to 2–4 decimals).
- `coordPrecision: "city"` when the source names that town; the marker must be within 15 km of it.
- `"approx"` when the source says "near X" or names only a district or area: use X, within 40 km.
- `"oblast"` when only the province is known: use the province's main city, within 200 km.
- If a place is "NOT FOUND", try the Ukrainian transliteration or another spelling, or use the nearest larger town with `"approx"`.
- The merge rejects new events with a missing or unknown `place`, or a marker too far from it.

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
- Each new event needs: id, date, region, oblast, front, type, status, title, caption, lat, lon, coordPrecision, place, sources (and optionally numbers). No other fields.
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

## 7. Alert and report

**If anything failed**, send one phone notification with the `PushNotification` tool, starting with `Ukraine Ops Map update FAILED:` and the reason in one short sentence. This covers: the merge still rejected after 3 tries, `git push` refused, or you could not reach any news source. If everything worked, send no notification.

Then end with a short summary: how many events were added or updated (ids and labels), which stats changed, which sources (including X/Telegram) you could or could not read, and whether the merge passed.
