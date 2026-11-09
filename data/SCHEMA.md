# Data schema (version 1)

Each map has one data file, `data/<map>.json` (for example `data/ukraine.json`), plus an optional headline feed `data/<map>-feed.json`.
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
  "sources": [ { "id": "ki_1101", "title": "Kyiv Independent: ...", "url": "https://..." } ],
  "numbers": { "label": "...", "ukraine": {"value": "...", "source": "id or null"}, "russia": {"value": "...", "source": "id or null"}, "independent": {"value": "...", "source": "id"} }
}
```

| Field | Required | Rules |
|---|---|---|
| `id` | yes | Unique. Lowercase letters, digits, dashes, 3–64 chars. Convention: `place-MMDD`, add `-2`, `-3` for more than one per place and day. Never reused for a different event. |
| `date` | yes | `YYYY-MM-DD`, the day it happened (Kyiv time). Not in the future. Cannot be changed later. |
| `region` | yes | One of the ids in `web/maps.json` → `regions` (Ukraine: `north`, `donbas`, `south`, `crimea-sea`, `rear`, `russia`). Drives the filter chips. |
| `oblast` | yes | Province/area name, e.g. `Kharkiv`, `Crimea (occupied)`, `Belgorod Oblast, Russia`. |
| `front` | yes | Finer grouping, e.g. `Pokrovsk / Dobropillia`, `Rear (Kyiv)`. Reuse existing names. |
| `type` | yes | `missile`, `drone`, `airstrike`, `artillery`, `energy`, `deep-strike`, `frontline`, `claim`, `ceasefire`, `naval`, `other`. Sets marker colour. |
| `status` | yes | See below. |
| `title` | yes | Short headline, max 140 chars. |
| `caption` | yes | "What happened", max 1500 chars. |
| `lat`, `lon` | yes | Numbers inside the map's `bounds` (Ukraine: lat 40–62, lon 18–62). Never invented: use the named place's coordinates and set `coordPrecision`. |
| `coordPrecision` | yes | `city` (the named town/city), `approx` (somewhere near the named place), `oblast` (only the province is known; marker sits at its centre). |
| `sources` | yes | At least one `{id, title, url}`. Every `id` must also be in the top-level `sources` list with the same url. |
| `numbers` | no | Side-by-side figures for a contested count. Required in spirit for `DISPUTED` events. |

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

`category`: `casualties`, `equipment`, `shootdowns`, `territory`, `other`. `asOf` is a real date, not in the future. `label` is the key the daily update uses to replace a stat, so keep labels stable. Never merge the two sides' numbers into one value.

## Source

`{ "id": "ki_1101", "title": "Kyiv Independent: headline (Nov 1)", "url": "https://..." }`. Ids are unique; letters, digits, `_ . -`. Every source id used by an event or stat must be listed here. An existing id never changes its url.

## Headline feed (`data/<map>-feed.json`)

Written automatically by `scripts/fetch-feeds.mjs`: `{ "meta": {"lastUpdated", "note", "feeds": [...]}, "items": [ {"headline", "source", "link", "date"} ] }`. Always shown as UNVERIFIED.

## Daily update input (`data/incoming/<map>.json`)

What the daily research job writes; `scripts/merge-update.mjs` merges it:

```json
{ "map": "ukraine", "notes": ["..."], "events": [ /* new or corrected events */ ], "stats": [ /* changed stats */ ], "sources": [ /* extra sources used by stats */ ] }
```

Events merge by `id` (new id = added, existing id = replaced). Stats merge by `label`. Nothing is deleted. Limits: 40 new and 30 changed events per run; new events must be dated within the last 10 days. Any failure leaves `data/` untouched and writes the reason to `UPDATE_LOG.md`.

## Adding another map later

1. Add an entry to `web/maps.json` (id, title, `data`, `geo`, `bounds`, `home`, `regions`, labels).
2. Add `data/<id>.json` following this schema (`"map": "<id>"`), and a geometry file in `web/geo/` (`scripts/build-geo.mjs`).
3. The app shows a map switcher automatically once there is more than one map.
