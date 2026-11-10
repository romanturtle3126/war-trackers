# Daily update instructions (Mideast Ops Map)

A scheduled Claude routine can read this file every morning and follow it exactly. Edit this file to change what it researches.

You are updating `data/middle-east.json`, the data behind a public map of the Middle East wars (Gaza and the West Bank, Lebanon and Syria, the Iran war with the Gulf, Hormuz, Yemen and the Red Sea, Iraq and Iran's internal security). Accuracy matters more than volume. **Never invent anything.**

## 0. Setup

1. Work in the repository root. Run `node --version` (Node 18+; no `npm install` needed).
2. Read `data/SCHEMA.md` and look at the newest ~20 events in `data/middle-east.json` to match their style, `region`, `oblast` (country/area) and `front` names.
3. Note `meta.lastUpdated`. Research from 24 hours before that until now, plus any obvious gap (only events from the last 10 days can be added).

## 1. Research

Open every page you cite; only cite URLs you opened.

**Leads:** `data/middle-east-feed.json` holds headlines pulled about 30 minutes before this run (Al Jazeera, BBC, Times of Israel, UN News, Guardian, France 24, Al-Monitor, Middle East Eye). Treat each as a lead and open the article. A headline alone is never a source.

**Preferred sources, roughly in order:**
- Independent monitors and UN bodies: UN OCHA (ochaopt.org), OHCHR, IOM DTM, UNHCR, **UKMTO** (ukmto.org) for shipping incidents, IAEA.
- Wires and major outlets: Reuters, AP, AFP, BBC, Al Jazeera, Times of Israel, Haaretz, Guardian, Al-Monitor, Arab News, CNBC (oil).
- Analysts: ISW/CTP Iran Update (understandingwar.org / criticalthreats.org).
- **Each party's official channels are that party's claim:** IDF, Israeli PMO, Gaza Ministry of Health / government media office, Wafa, Hezbollah, IRGC/Tasnim/IRNA, Houthi media (Saba, Al-Masirah), Saudi-led coalition / SPA, CENTCOM, Lebanese Ministry of Public Health.

**Official statements on X and Telegram.** Each party's officials post first on X and Telegram. Check them for overnight strikes, launch and interception claims, casualty reports and denials:
- Israel: IDF (`@IDF` on X), Prime Minister's Office (`@IsraeliPM`).
- US: CENTCOM (`@CENTCOM`).
- Palestinian side: Gaza Ministry of Health and Gaza government media office (official Telegram channels), Wafa.
- Lebanon / Hezbollah: Lebanese Ministry of Public Health; Hezbollah's media statements (often relayed by Al-Manar).
- Iran: IRGC statements via Tasnim / IRNA (Telegram and X).
- Yemen: the Houthi military spokesman's statements (Telegram, relayed by Al-Masirah / Saba); the Saudi-led coalition via SPA.
- Monitors and outlets: UKMTO, UN OCHA oPt (`@ochaopt`), IAEA (`@iaeaorg`), `@AJEnglish`, `@Reuters`, `@AP`, `@ISWResearch`.

Handles change; if one above is wrong or dead, find the official account with a web search and name the one you used in `notes`.

How to read them (X usually blocks direct reading), exactly as for the Ukraine map:
1. Find posts with web search, e.g. `site:x.com CENTCOM Houthi November 9` or `site:t.me tasnim Hormuz`.
2. Read a single X post through the public embed service with Bash: `curl -sL "https://publish.x.com/oembed?url=https%3A%2F%2Fx.com%2F<account>%2Fstatus%2F<id>"`. The JSON's `html` field holds the post text and date.
3. Read a public Telegram channel's preview with Bash: `curl -sL -A "Mozilla/5.0" https://t.me/s/<channel>`. Each post sits in a `tgme_widget_message_text` block, numbered in `data-post="<channel>/<n>"`, with its time in a `datetime` attribute. Cite the single post as `https://t.me/<channel>/<n>`.
4. Cite the X or Telegram post URL itself. These are **that party's claim**: an event whose only sources are X/Telegram/official sites must be `ONE_PARTY` (or `DISPUTED`), never `CONFIRMED`. The validator enforces this.

**Minimum checklist, every run (report each as read / not read):**
- [ ] UKMTO advisories (shipping attacks in Hormuz / Red Sea / Gulf of Aden)
- [ ] UN OCHA oPt latest situation report or flash update
- [ ] ISW/CTP Iran Update (latest)
- [ ] IDF and CENTCOM statements (X)
- [ ] At least one Telegram channel from the other side (Houthi spokesman, IRGC/Tasnim or Gaza MoH)
- [ ] At least two X searches (`site:x.com ...`) for the night's main events, with any useful post read through the embed service
- [ ] The headline leads file

What to add: strikes with casualties, missile/drone attacks (with the attacker's claim and the defender's interception claim), ship attacks, ground operations, settler violence, major diplomacy that changes the fighting (ceasefire talks, mediation, IAEA access) as `type: "diplomacy"`.

Also correct any event from the last 7 days whose facts changed (reuse its `id`), and refresh:
- **stats** with new figures (Gaza MoH totals, Lebanon MoPH totals, IOM displacement, Brent settle price, Hormuz traffic). Keep the `label` exactly the same so it replaces the old one. For the Brent stat, append the new settle to `series` (keep the last ~8 points), update `headline`, `sub`, `asOf` and `sources`. Every stat needs `status` and a current `asOf`; keep the multi-party `rows` form (one row per party, never summed).
- **lanes** (`hormuz-lane`, `red-sea-lane`, `suez-canal-lane`): send the lane with the same `id` and updated `status`, `text`, `sources`, `claims`. Do not change `points` or `color`.

## 2. Labels: be conservative

- `CONFIRMED`: an independent monitor or several independent outlets report it and nobody contests it. Needs at least one source that is not a party's own channel or a social post (the validator checks).
- `ONE_PARTY`: only one party or its officials/state media say it.
- `DISPUTED`: parties give conflicting accounts. **Must** include `claims`, one entry per party.
- `UNVERIFIED`: a single report you could not confirm, or one you could only read as a snippet.
- When unsure, pick the weaker label. Attribute claims in the caption ("Israel says…", "the Houthis claim…"). No adjectives that take a side.

## 3. Positions: never invent coordinates

```
node scripts/place.mjs --map=middle-east "Khan Younis" "Bandar Abbas" "Ras Tanura"
```

- Every new event needs `"place"`: the town the position is based on, spelled as the lookup accepts it. Copy its `lat`/`lon`.
- `coordPrecision`: `city` (within 15 km of that town), `approx` ("near X", within 40 km), `oblast` (only the province/area or a sea area is known, within 200 km). For ship attacks "20 nm off Khasab", use the coastal town and `approx` or `oblast`.
- Camps and neighbourhoods (Maghazi, Jabalia, Shuja'iyya) may be missing: use the nearest town (Deir al-Balah, Gaza) with `approx` and name the exact spot in the title.

## 4. Write the incoming file

Create `data/incoming/middle-east.json`:

```json
{
  "map": "middle-east",
  "notes": ["Refreshed <date> (<time> Toronto) from <sources read>.", "<anything missing>", "Marker positions are approximate (see coordPrecision)."],
  "events": [ /* new and corrected events */ ],
  "stats": [ /* changed stats, full objects, same labels */ ],
  "lanes": [ /* changed lanes */ ],
  "sources": [ /* registry entries for source ids used by stats */ ]
}
```

- Event ids: `place-MMDD` (e.g. `khan-younis-1109`), add `-2` if taken. Source ids: `<outlet>_<MMDD>` (e.g. `aj_1109`, `ukmto_1109`, `x_centcom_1109`).
- Each new event needs: id, date, region, oblast, front, type, status, title, caption, lat, lon, coordPrecision, place, sources, `read` (`full` or `snippet`); `claims` where parties differ.
- `region` → `front`: `gaza`, `westbank` → "Gaza & West Bank"; `lebanon`, `syria` → "Lebanon & Syria"; `israel`, `iran-war`, `gulf` (Saudi, UAE, Qatar, Bahrain, Oman, Hormuz), `yemen` (incl. Red Sea / Bab el-Mandeb) → "Iran war / Gulf / Yemen"; `iraq`, `iran-internal` → "Iraq & Iran internal".
- `date` is the day it happened (local time). If you found nothing new, write `"events": []` with an honest note.

## 5. Merge and validate (do NOT edit `data/middle-east.json` yourself)

```
node scripts/merge-update.mjs data/incoming/middle-east.json
node scripts/validate.mjs data/middle-east.json
```

If it prints `UPDATE REJECTED`, fix or drop the bad item (never weaken a label to get past a check, never invent a URL) and retry, at most 3 times.

## 6. Commit and push

Only `data/middle-east.json`, `UPDATE_LOG.md` and the incoming file may change.

```
git checkout -b claude/data-me-$(date -u +%Y-%m-%d)
git add data/middle-east.json UPDATE_LOG.md data/incoming
git commit -m "Daily Middle East data update $(date -u +%Y-%m-%d)"
git push -u origin HEAD
```

If the merge failed, still push `UPDATE_LOG.md` alone on that branch. The **Accept daily data update** workflow re-validates, merges into `main` and publishes.

## 7. Alert and report

If anything failed, send one `PushNotification` starting `Mideast Ops Map update FAILED:` with the reason in one sentence. Otherwise send none. End with a short summary: events added/updated (ids and labels), stats and lanes changed, which checklist sources you could or could not read, and whether the merge passed.
