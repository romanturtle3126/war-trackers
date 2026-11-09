# Ukraine Ops Map

A map of recent events in the Russia-Ukraine war. Every event is sourced and labelled **Confirmed**, **One party's claim**, **Disputed** or **Unverified**. It runs as an Android app (and as a web page), and its data updates itself every morning.

- **App download (latest APK):** https://github.com/romanturtle3126/war-trackers/releases/latest
- **Web version:** https://romanturtle3126.github.io/war-trackers/
- **Live data file:** https://romanturtle3126.github.io/war-trackers/data/ukraine.json
- **What changed each day:** [`UPDATE_LOG.md`](UPDATE_LOG.md)

## Install on your Samsung Galaxy S23+

1. On the phone, open **Chrome** and go to `github.com/romanturtle3126/war-trackers/releases/latest`.
2. Under **Assets**, tap the file named `UkraineOpsMap-1.<number>.apk`. If Chrome warns that the file may be harmful, tap **Download anyway**.
3. When the download finishes, tap **Open**. (Or open the **My Files** app → **Downloads** → tap the `.apk`.)
4. The first time, Android says *"For your security, your phone is not allowed to install unknown apps from this source."* Tap **Settings**, turn on **Allow from this source** for Chrome (or My Files), then press Back.
5. Tap **Install**. If **Google Play Protect** shows *"Unsafe app blocked"* or *"Scan app?"*, tap **More details → Install anyway** (or **Install without scanning**). It warns because the app isn't from the Play Store.
6. Tap **Open**. The "Ukraine Ops Map" icon (dark radar) is now in your app drawer.

**Updating the app:** you only need a new APK when the app itself changes, not for daily data. Repeat the steps above and tap **Update**. It installs over the old one and keeps your settings. Afterwards you can turn **Install unknown apps** back off (Settings → Apps → ⋮ → Special access → Install unknown apps → Chrome).

## Using it

- **Region chips** under the tabs filter the map and the timeline. Tap several to combine them; tap **All** to reset.
- **Tap a dot** for the event card with sources. Swipe it down, tap ×, or press Back to close it.
- **▶** replays events day by day; untick *cumulative* to see one day at a time.
- **"N events outside view · Show all"** zooms out to include events deep in Russia.
- **Refresh:** tap ⟳ in the top-right, or pull down on the Timeline, Stats, Feed or Sources tab. The app also refreshes itself when you reopen it.
- The header shows **Data updated &lt;date&gt;**. If it says *offline: saved copy* or *offline: built-in copy*, the phone couldn't reach the internet, so you're seeing the last copy it had.

## How the daily update works

| When (Toronto) | What | Where |
|---|---|---|
| ~6:00 AM | A **Claude cloud routine** researches the past ~24 h (ISW, Reuters, AP, BBC, Kyiv Independent, official statements of both sides), writes new and corrected events, and runs `scripts/merge-update.mjs`. That script validates everything and only changes the data if it all passes. | claude.ai/code/routines |
| right after | GitHub workflow **Accept daily data update** checks that only data files changed, re-validates, merges into `main` and publishes. | GitHub → Actions |
| ~6:45 AM | GitHub workflow **Publish data and website** pulls free news headlines (Feed tab), validates, and publishes the site and data. | GitHub → Actions |

Safety rules built into the merge: events are merged by id and **never deleted**; at most 40 new and 30 changed events per day; new events must be dated within the last 10 days; no invented or out-of-area coordinates; every event needs a source; "Confirmed" needs an independent (non-government, non-social) source; dead links are rejected. If anything fails, the old data stays as it was and the reason is written to `UPDATE_LOG.md`.

The research instructions live in [`UPDATE_PROMPT.md`](UPDATE_PROMPT.md). Edit that file to change what it looks for.

### How to tell the daily update ran

- **In the app:** the header's *Data updated* date should be today, after about 6:15 AM.
- **On GitHub:** open [`UPDATE_LOG.md`](UPDATE_LOG.md). Each morning adds a section at the top: **OK** (with the events it added) or **FAILED** (with the reason; the data was left unchanged).
- **The routine itself:** https://claude.ai/code/routines → *Ukraine Ops Map daily update* → recent runs.

### How to pause it

- **Pause the research:** https://claude.ai/code/routines → the routine → switch it **off** (switch back on to resume).
- **Pause the headline feed:** GitHub → repo → **Actions** → *Publish data and website* → **⋯ → Disable workflow**.
- The app keeps working either way; it just shows the last data.

## What it costs

| Item | Cost |
|---|---|
| GitHub repo, Actions (APK builds, headlines), Pages hosting | **$0** (public repo) |
| Daily research (Claude cloud routine, Sonnet 5.5) | **$0 extra**. It uses your Claude Pro/Max plan's usage allowance, about one routine run a day. Heavy usage days may share limits with your own Claude use. |
| Android app | $0 (sideloaded, no Play Store fee) |

No paid API keys are used. If you ever switch to the Anthropic API instead of the routine, expect roughly $20–30/month (Sonnet 5.5 + ~20 web searches a day).

## Signing key: back it up!

The APK is signed with a private key. **Android only installs an update if it's signed with the same key.** If the key is lost, you'd have to uninstall the app and install a fresh one.

- The key and its password are in `Desktop\war-trackers-SIGNING-KEY-BACKUP` on the PC that set this up (`ukraineopsmap-release.p12` + `KEY-INFO-KEEP-SECRET.txt`). **Copy that folder to a USB stick and a private cloud drive.** Never put it in this repository.
- GitHub holds a copy as four Actions secrets (repo → Settings → Secrets and variables → Actions): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. GitHub never lets anyone read them back, which is why the backup matters.

## For developers

```
web/                 the app (index.html, css, js, maps.json = per-map settings, geo/ = borders)
data/ukraine.json    events + stats + sources (format: data/SCHEMA.md)
data/ukraine-feed.json  auto-pulled headlines
scripts/validate.mjs     node scripts/validate.mjs [file] [--links]
scripts/merge-update.mjs merges data/incoming/<map>.json safely (used by the routine)
scripts/fetch-feeds.mjs  pulls RSS headlines
scripts/build-web.mjs    assembles www/ (app + bundled data) for Pages and Android
scripts/serve.mjs        local preview at http://127.0.0.1:8765
android/             Capacitor Android project (app id com.aaron.ukraineopsmap)
.github/workflows/   build-apk.yml, site.yml, accept-update.yml
```

The app always tries the live data on GitHub Pages first, then the last copy saved on the phone, then the copy built into the APK, so it works offline.
Adding the Middle East map later: add an entry to `web/maps.json` plus `data/middle-east.json` (same schema). The app shows a map switcher automatically. See the end of `data/SCHEMA.md`.

Map borders: Natural Earth (public domain), with Crimea shown as part of Ukraine. The red dashed front line is illustrative only.
