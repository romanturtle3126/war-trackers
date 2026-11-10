# Data schema (version 1)

Each map has one data file, `data/<map>.json` (`data/ukraine.json`, `data/middle-east.json`), plus an optional headline feed `data/<map>-feed.json`.
The map's settings (region list, allowed coordinate box, default view) live in `web/maps.json`.
`node scripts/validate.mjs data/ukraine.json` checks a file against everything below. The daily update is refused if it fails.

## File layout

```json
{
  "schemaVersion": 1,
  "map": "ukraine",
  "meta": { "lastUpdated": "2026-11-09T06:12:00-05:00", "coverage": "2026-10-10 to 2026-11-08", "notes": ["..."] },
  "events":  [ /* Event */ ],
  "stats":   [ /* Stat */ ],
  "sources": [ /* Source */ ]
}
```

| Field | Meaning |
|---|---|
| `meta.lastUpdated` | When the data last changed (ISO date-time with offset). Shown in the app as "Data updated". |
| `meta.coverage` | First and last event date, `"YYYY-MM-DD to YYYY-MM-DD"`. |
| `meta.notes` | Honest notes about the latest refresh (what was read, what was missing). Shown on the Sources tab. |

## Event

```json
{
  "id": "kharkiv-1101",
  "date": "2026-11-01",
  "region": "north",
  "oblast": "Kharkiv",
  "front": "Kharkiv",
  "type": "drone",
  "status": "CONFIRMED",
  "title": "Drone strike on Kharkiv apartment block",
  "caption": "What happened, in one to three plain sentences, with numbers as reported and claims attributed.",
  "lat": 49.99, "lon": 36.23,
  "coordPrecision": "city",
  "place": "Kharkiv",
  "sources": [ { "id": "ki_1101", "title": "Kyiv Independent: ...", "url": "https://..." } ],
  "numbers": { "label": "...", "ukraine": {"value": "...", "source": "id or null"}, "russia": {"value": "...", "source": "id or null"}, "independent": {"value": "...", "source": "id"} }
}
```

| Field | Required | Rules |
|---|---|---|
| `id` | yes | Unique. Lowercase letters, digits, dashes, 3–64 chars. Convention: `place-MMDD`, add `-2`, `-3` for more than one per place and day. Never reused for a different event. |
| `date` | yes | `YYYY-MM-DD`, the day it happened (Kyiv time). Not in the future. Cannot be changed later. |
| `region` | yes | One of the ids in `web/maps.json` → `regions` (Ukraine: `north`, `donbas`, `south`, `crimea-sea`, `rear`, `russia`; Middle East: `gaza`, `westbank`, `lebanon`, `syria`, `israel`, `iran-war`, `gulf`, `yemen`, `iraq`, `iran-internal`). Drives the filter chips. |
| `oblast` | yes | Province/area name, e.g. `Kharkiv`, `Crimea (occupied)`, `Belgorod Oblast, Russia`. |
| `front` | yes | Finer grouping, e.g. `Pokrovsk / Dobropillia`, `Rear (Kyiv)`. Reuse existing names. |
| `type` | yes | `missile`, `drone`, `airstrike`, `artillery`, `energy`, `deep-strike`, `frontline`, `claim`, `ceasefire`, `naval`, `ground`, `diplomacy`, `unrest`, `other`. `diplomacy` events also appear in the Stats tab's diplomacy timeline. |
| `status` | yes | See below. |
| `title` | yes | Short headline, max 140 chars. |
| `caption` | yes | "What happened", max 1500 chars. |
| `lat`, `lon` | yes | Numbers inside the map's `bounds` (Ukraine: lat 40–62, lon 18–62; Middle East: lat 5–44, lon 22–68). Never invented: use the named place's coordinates and set `coordPrecision`. |
| `place` | new events | The town/village the position is based on, as found by `node scripts/place.mjs "<name>"` (GeoNames list in `scripts/geo-data/places.json`). The marker must be within 15 km (`city`), 40 km (`approx`) or 200 km (`oblast`) of it. Required for events added by the daily update; older events may lack it. |
| `coordPrecision` | yes | `city` (the named town/city), `approx` (somewhere near the named place), `oblast` (only the province is known; marker sits at its centre). |
| `sources` | yes | At least one `{id, title, url}`. Every `id` must also be in the top-level `sources` list with the same url. |
| `numbers` | no | Ukraine/Russia figures side by side for a contested count. |
| `claims` | no | "Who says what": `[{"who": "Ukraine's Air Force", "says": "...", "source": "<source id, optional>"}]`, one entry per party. Expected for `DISPUTED` events and useful whenever the sides say different things. |
| `read` | no | `full` if a cited article was read in full, `snippet` if only a headline/preview was available. Shown as a source-quality tag; X/Telegram-only sourcing is detected from the URLs. |
| `dateNote` | no | Only when the exact day isn't known, e.g. `"Week of Oct 6-12"`; shown instead of the date. |

No other fields are allowed.

### Status labels

| Value | Meaning |
|---|---|
| `CONFIRMED` | Reported by authorities **and** independent outlets, or verified by imagery/geolocation. Must cite at least one source that is not an official, state-media or social-media source of either side (see `PARTY_DOMAINS` in `scripts/lib/validate-core.mjs`). |
| `ONE_PARTY` | Only Ukraine or only Russia asserts it; no independent confirmation found. |
| `DISPUTED` | The two sides' claims conflict. Use `numbers` to show both. |
| `UNVERIFIED` | Reported but not confirmed, or attribution is only an analyst's assessment. |

When in doubt, use the weaker label.

## Stat

```json
{
  "label": "Russian military personnel losses (cumulative)",
  "category": "casualties",
  "asOf": "2026-11-07",
  "ukraine": {"value": "...", "source": "ki_gs_1107"},
  "russia":  {"value": "No official figure published", "source": null},
  "independent": [ {"value": "...", "source": "bbcru_losses"} ]
}
```

`category`: `casualties`, `humanitarian`, `equipment`, `shootdowns`, `territory`, `diplomacy`, `economy`, `other`.

Optional on any stat: `status` (the four labels, shown as a badge; every new or changed stat should have one), `asOfNote` (shown instead of the date, e.g. `"Oct 10-27, 2026"`), `headline` and `sub` (a big figure such as `"$114.88"`), `tone` (hex colour for the headline), `series` (`[{"label": "Oct 29", "value": 114.88}]`, drawn as a small chart), `text`, `note`, and `sources` (list of source ids).

**Multi-party form** (Middle East): instead of `ukraine`/`russia`, give `rows: [{"who": "UN OCHA", "value": "...", "source": "<id, optional>"}]`, one row per party or counter. A stat with neither needs a `headline` or `text`. `asOf` is a real date, not in the future. `label` is the key the daily update uses to replace a stat, so keep labels stable. Never merge the two sides' numbers into one value.

## Lane (Middle East)

Top-level optional `lanes`: shipping lanes drawn as moving dashed lines.

```json
{ "id": "hormuz-lane", "name": "Strait of Hormuz", "status": "DISPUTED", "text": "Current status in plain words.", "color": "#ff4d6d", "points": [[lon, lat], ...], "sources": [ {"id", "title", "url"} ], "claims": [ ... ] }
```

The daily update may change `status`, `text`, `sources` and `claims` by sending the lane with the same `id`; `points` and `color` never change. Only an `UNVERIFIED` context lane may have no sources.

## Source

`{ "id": "ki_1101", "title": "Kyiv Independent: headline (Nov 1)", "url": "https://..." }`. Ids are unique; letters, digits, `_ . -`. Every source id used by an event or stat must be listed here. An existing id never changes its url.

## Headline feed (`data/<map>-feed.json`)

Written automatically by `scripts/fetch-feeds.mjs`: `{ "meta": {"lastUpdated", "note", "feeds": [...]}, "items": [ {"headline", "source", "link", "date"} ] }`. Always shown as UNVERIFIED.

## Daily update input (`data/incoming/<map>.json`)

What the daily research job writes; `scripts/merge-update.mjs` merges it:

```json
{ "map": "ukraine", "notes": ["..."], "events": [ /* new or corrected events */ ], "stats": [ /* changed stats */ ], "lanes": [ /* changed lanes (Middle East) */ ], "sources": [ /* extra sources used by stats */ ] }
```

Events merge by `id` (new id = added, existing id = replaced). Stats merge by `label`. Nothing is deleted. Limits: 40 new and 30 changed events per run; new events must be dated within the last 10 days. Any failure leaves `data/` untouched and writes the reason to `UPDATE_LOG.md`.

## Adding another map later

1. Add an entry to `web/maps.json` (id, title, `data`, `feed`, `geo`, `bounds`, `home`, `minDate`, `regions`, `groups`, `statusText`, `mapNote`, labels).
2. Add `data/<id>.json` following this schema (`"map": "<id>"`), a geometry file in `web/geo/` (`scripts/build-geo.mjs`), a place list (`scripts/build-places.mjs`, registered in `scripts/lib/places.mjs`) and headline feeds (`scripts/fetch-feeds.mjs`).
3. Add the file to the validate steps in `.github/workflows/*.yml` and to the allowed list in `accept-update.yml`.
4. The map switcher at the top lists every map in `web/maps.json`.
