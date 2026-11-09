/* Ukraine Ops Map - vanilla JS, no build step. Runs as a web page (GitHub Pages) and inside the Android app (Capacitor). */
(function () {
  "use strict";

  /* ---------- Data source: live GitHub Pages copy → saved copy → copy bundled in the app ---------- */
  var PAGES = "https://romanturtle3126.github.io/war-trackers/";
  var CAP = window.Capacitor;
  var NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  var params = new URLSearchParams(location.search);
  var REMOTE = NATIVE || params.get("remote") === "1" ? PAGES : "";
  var STALE_MS = 30 * 60 * 1000;

  var STATUS = { CONFIRMED: "CONFIRMED", ONE_PARTY: "ONE PARTY", DISPUTED: "DISPUTED", UNVERIFIED: "UNVERIFIED" };
  var STATUS_TEXT = {
    CONFIRMED: "Credible outlet or monitor with independent corroboration (imagery, footage or several outlets).",
    ONE_PARTY: "Stated only by Ukrainian or Russian officials or their media; no independent confirmation.",
    DISPUTED: "The sides, or a side and an independent assessor, give conflicting accounts.",
    UNVERIFIED: "Reported, but not confirmed by a primary outlet."
  };
  var TYPE_NAME = { missile: "missile", drone: "drone", airstrike: "air strike", artillery: "shelling", energy: "energy", "deep-strike": "deep strike", frontline: "front line", claim: "territorial claim", ceasefire: "humanitarian", naval: "naval", other: "other" };
  var CATS = { casualties: "CASUALTIES", equipment: "EQUIPMENT", shootdowns: "SHOOTDOWNS", territory: "TERRITORY", other: "OTHER" };

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : "#"; }
  function badge(st) { return '<span class="badge b-' + esc(st) + '">' + esc(STATUS[st] || st) + "</span>"; }
  function fmtDate(d) { return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
  function fmtStamp(s) { var t = new Date(s); return isNaN(t) ? String(s) : t.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function localDay() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  var S = { maps: [], cfg: null, doc: null, from: "", fetchedAt: 0, srcById: {}, groups: new Set(), newIds: new Set(), loading: false };
  var GROUP = {}; // region id -> group
  function groupOf(e) { return GROUP[e.region] || { id: "x", label: e.region, color: "#9ca3af" }; }

  /* ---------- Loading ---------- */
  function fetchJSON(url, opts) {
    var ctl = window.AbortController ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, 15000);
    return fetch(url, Object.assign({ cache: "no-store", signal: ctl && ctl.signal }, opts || {}))
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .finally(function () { if (t) clearTimeout(t); });
  }
  function looksLikeData(d) { return d && Array.isArray(d.events) && d.events.length && d.meta && d.meta.lastUpdated && Array.isArray(d.sources); }
  function stampOf(d) { var t = Date.parse((d && d.meta && d.meta.lastUpdated) || ""); return isNaN(t) ? 0 : t; }
  function loadOne(path, ok) {
    var key = "cache:" + path;
    var live = fetchJSON(REMOTE + path + (REMOTE ? "?t=" + Date.now() : "")).then(function (d) { if (!ok(d)) throw new Error("bad data"); return d; });
    return live.then(function (d) { store(key, { doc: d, at: Date.now() }); return { doc: d, from: "live" }; }, function () {
      var saved = store(key);
      var bundled = REMOTE ? fetchJSON(path).then(function (d) { return ok(d) ? d : null; }, function () { return null; }) : Promise.resolve(null);
      return bundled.then(function (b) {
        var s = saved && ok(saved.doc) ? saved.doc : null;
        if (s && (!b || stampOf(s) >= stampOf(b))) return { doc: s, from: "saved" };
        if (b) return { doc: b, from: "built-in" };
        throw new Error("No data yet. Connect to the internet and tap ⟳.");
      });
    });
  }

  function boot() {
    initTabs(); initPanZoom(); initSheet(); initReplay(); initRefresh(); initLinks(); initBack(); initModal();
    fetchJSON("maps.json").then(function (m) {
      S.maps = m.maps;
      var want = store("map") || S.maps[0].id;
      setCfg(S.maps.filter(function (x) { return x.id === want; })[0] || S.maps[0]);
      var sw = $("#mapswitch");
      if (S.maps.length > 1) {
        sw.hidden = false;
        sw.innerHTML = S.maps.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + "</option>"; }).join("");
        sw.value = S.cfg.id;
        sw.onchange = function () { setCfg(S.maps.filter(function (x) { return x.id === sw.value; })[0]); store("map", S.cfg.id); S.doc = null; geo = null; vb = null; refresh(false); };
      }
      applyRoute();
      return refresh(false);
    }).catch(function (e) { $("#updated").textContent = "Failed to start: " + e.message; });
  }
  function setCfg(cfg) {
    S.cfg = cfg; GROUP = {};
    cfg.groups.forEach(function (g) { g.regions.forEach(function (r) { GROUP[r] = g; }); });
  }

  function refresh(manual) {
    if (S.loading) return Promise.resolve();
    S.loading = true; $("#refresh").classList.add("spin");
    var oldStamp = stampOf(S.doc), first = !S.doc;
    return Promise.all([loadOne(S.cfg.data, looksLikeData), loadGeo(S.cfg)])
      .then(function (r) {
        S.doc = r[0].doc; S.from = r[0].from; S.fetchedAt = Date.now();
        var before = S.newIds.size;
        markNew();
        if (first || manual || stampOf(S.doc) !== oldStamp) renderAll(first);
        else renderUpdated();
        if (manual) {
          var n = S.newIds.size - before;
          toast(S.from === "live" ? (n > 0 ? n + " NEW EVENT" + (n > 1 ? "S" : "") : "UP TO DATE") : "OFFLINE · " + (S.from === "saved" ? "SAVED" : "BUILT-IN") + " COPY");
        }
      })
      .catch(function (e) { $("#updated").textContent = e.message; if (manual) toast("COULD NOT REFRESH"); })
      .finally(function () { S.loading = false; $("#refresh").classList.remove("spin"); });
  }
  // Events not seen on a previous visit get a NEW tag and a cyan glow for this session.
  function markNew() {
    var key = "seen:" + S.cfg.id, seen = store(key), ids = S.doc.events.map(function (e) { return e.id; });
    if (Array.isArray(seen)) { var set = new Set(seen); ids.forEach(function (id) { if (!set.has(id)) S.newIds.add(id); }); }
    store(key, ids);
  }

  function renderAll(first) {
    S.srcById = {};
    S.doc.sources.forEach(function (s) { S.srcById[s.id] = s; });
    S.groups = new Set((store("groups:" + S.cfg.id) || []).filter(function (g) { return S.cfg.groups.some(function (x) { return x.id === g; }); }));
    $("#apptitle").textContent = S.cfg.title.toUpperCase(); document.title = S.cfg.title;
    renderUpdated(); renderChips(); drawMap(first); renderPresets(); setupReplay(); renderFeed(); renderStats();
    applyRoute();
  }
  function renderUpdated() {
    var tag = S.from === "live" ? "" : ' · <span class="off">OFFLINE</span>';
    $("#updated").innerHTML = "Data updated " + esc(fmtStamp(S.doc.meta.lastUpdated)) + tag;
  }
  function toast(msg) {
    var t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; $("#app").appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2400);
  }

  /* ---------- Routing (#/map, #/feed, #/stats, #/map/<event id>). Android Back walks this history. ---------- */
  var TABS = ["map", "feed", "stats"];
  function route() { var m = (location.hash || "").replace(/^#\/?/, "").split("/"); return { tab: TABS.indexOf(m[0]) >= 0 ? m[0] : "map", ev: m[1] ? decodeURIComponent(m[1]) : null }; }
  var flyNext = false;
  function nav(tab, ev, replace, fly) {
    var h = "#/" + tab + (ev ? "/" + encodeURIComponent(ev) : "");
    flyNext = !!fly;
    if (location.hash === h) return applyRoute();
    var depth = (history.state && history.state.depth) || 0;
    if (replace) history.replaceState({ depth: depth }, "", h); else history.pushState({ depth: depth + 1 }, "", h);
    applyRoute();
  }
  var curTab = null;
  function applyRoute() {
    var r = route();
    $$("#tabs button").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === r.tab); });
    $$(".tab").forEach(function (t) { t.classList.toggle("active", t.id === "tab-" + r.tab); });
    $("#chips").hidden = r.tab === "stats";
    if (r.tab !== curTab) { curTab = r.tab; if (r.tab === "stats") animateBars(); if (r.tab === "map" && gMk) requestAnimationFrame(function () { if (S.needFit) { vb = boxTarget(HOME); S.needFit = false; } setVB(); }); }
    if (r.ev && S.doc) showIncident(r.ev, flyNext); else hideSheet();
    flyNext = false;
  }
  function initTabs() {
    $$("#tabs button").forEach(function (b) { b.onclick = function () { var r = route(); if (r.tab !== b.dataset.tab || r.ev) nav(b.dataset.tab, null, false); }; });
    window.addEventListener("popstate", applyRoute);
    if (!location.hash) history.replaceState({ depth: 0 }, "", "#/map");
  }
  function initBack() {
    var App = NATIVE && CAP.Plugins && CAP.Plugins.App;
    if (!App) return;
    App.addListener("backButton", function (e) {
      if (!$("#modal").hidden) return closeModal();
      if (e && e.canGoBack) history.back(); else App.exitApp();
    });
    App.addListener("resume", function () { if (Date.now() - S.fetchedAt > STALE_MS) refresh(false); });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && S.cfg && Date.now() - S.fetchedAt > STALE_MS) refresh(false); });
  function initLinks() {
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a || !/^https?:/i.test(a.getAttribute("href"))) return;
      e.stopPropagation();
      if (!NATIVE) { a.target = "_blank"; a.rel = "noopener"; return; }
      e.preventDefault();
      var B = CAP.Plugins && CAP.Plugins.Browser;
      if (B && B.open) B.open({ url: a.href, toolbarColor: "#0c0e12" }).catch(function () { location.href = a.href; });
      else location.href = a.href;
    }, true);
  }

  /* ---------- Chips (by front) ---------- */
  function passes(e) { return !S.groups.size || S.groups.has(groupOf(e).id); }
  function renderChips() {
    var h = '<button class="chip' + (S.groups.size ? "" : " on") + '" data-g=""><span class="d"></span>All</button>';
    S.cfg.groups.forEach(function (g) {
      h += '<button class="chip' + (S.groups.has(g.id) ? " on" : "") + '" data-g="' + esc(g.id) + '" style="--c:' + esc(g.color) + '" aria-pressed="' + S.groups.has(g.id) + '"><span class="d"></span>' + esc(g.label) + "</button>";
    });
    var el = $("#chips"), sl = el.scrollLeft;
    el.innerHTML = h; el.scrollLeft = sl; el.classList.toggle("filtered", S.groups.size > 0);
    $$("#chips .chip").forEach(function (c) {
      c.onclick = function () {
        var g = c.dataset.g;
        if (!g) S.groups.clear(); else if (S.groups.has(g)) S.groups.delete(g); else S.groups.add(g);
        if (S.groups.size === S.cfg.groups.length) S.groups.clear();
        store("groups:" + S.cfg.id, Array.from(S.groups));
        renderChips(); applyDay(true); renderFeed();
      };
    });
  }

  /* ---------- Map ---------- */
  var svg = $("#map"), gMk, gLbl, geo = null, geoFor = null, vb = null, FULL, HOME, PRJ, marks = [], gridLbls = [];
  var NS = "http://www.w3.org/2000/svg";
  function P(lon, lat) { return [(lon - PRJ.lon0) * PRJ.kx, (PRJ.lat0 - lat) * PRJ.ky]; }
  function rect(b) { var a = P(b.minLon, b.maxLat), c = P(b.maxLon, b.minLat); return { x: a[0], y: a[1], w: c[0] - a[0], h: c[1] - a[1] }; }
  function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function loadGeo(cfg) { if (geo && geoFor === cfg.geo) return Promise.resolve(geo); return fetchJSON(cfg.geo, { cache: "default" }).then(function (g) { geo = g; geoFor = cfg.geo; return g; }); }
  function pathOf(rings) { return rings.map(function (r) { return "M" + r.map(function (p) { var q = P(p[0], p[1]); return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("L") + "Z"; }).join(""); }
  function inRing(pt, ring) { var c = false; for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) { var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; }

  function drawMap(first) {
    var cfg = S.cfg; PRJ = cfg.projection; FULL = rect(cfg.bounds); HOME = rect(cfg.home);
    if (!vb) { vb = Object.assign({}, HOME); S.needFit = true; }
    svg.innerHTML = "";
    var defs = el("defs", {}, svg), pat = el("pattern", { id: "hatch", patternUnits: "userSpaceOnUse", width: 1.6, height: 1.6, patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 1.6, height: 1.6, fill: "#0e1626" }, pat); el("line", { x1: 0, y1: 0, x2: 0, y2: 1.6, stroke: "#22324d", "stroke-width": 0.7 }, pat);
    el("rect", { x: FULL.x - 600, y: FULL.y - 600, width: FULL.w + 1200, height: FULL.h + 1200, class: "sea" }, svg);
    // graticule
    var gs = cfg.grid || 3, d = "", lons = [], lats = [];
    for (var lo = Math.ceil((cfg.bounds.minLon - 9) / gs) * gs; lo <= cfg.bounds.maxLon + 9; lo += gs) { var a = P(lo, cfg.bounds.maxLat + 6), b = P(lo, cfg.bounds.minLat - 6); d += "M" + a[0] + "," + a[1] + "V" + b[1]; lons.push(lo); }
    for (var la = Math.ceil((cfg.bounds.minLat - 6) / gs) * gs; la <= cfg.bounds.maxLat + 6; la += gs) { var c1 = P(cfg.bounds.minLon - 9, la), c2 = P(cfg.bounds.maxLon + 9, la); d += "M" + c1[0] + "," + c1[1] + "H" + c2[0]; lats.push(la); }
    el("path", { d: d, class: "grid" }, svg);
    geo.countries.forEach(function (c) { el("path", { d: pathOf(c.rings), class: c.a3 === cfg.highlight ? "ua" : "land" }, svg); });
    var hl = geo.countries.filter(function (c) { return c.a3 === cfg.highlight; })[0];
    (cfg.occupied || []).forEach(function (o) {
      var rings = hl ? hl.rings.filter(function (r) { return inRing(o.inside, r); }) : [];
      if (rings.length) el("path", { d: pathOf(rings), class: "occ" }, svg);
    });
    gLbl = el("g", {}, svg);
    (cfg.countryLabels || []).forEach(function (l) { var p = P(l[1], l[2]); el("text", { x: p[0], y: p[1], class: "clbl" }, gLbl).textContent = l[0]; });
    (cfg.occupied || []).forEach(function (o) { var p = P(o.at[0], o.at[1]); el("text", { x: p[0], y: p[1], class: "olbl" }, gLbl).textContent = o.label; });
    (cfg.seaLabels || []).forEach(function (l) { var p = P(l[1], l[2]); el("text", { x: p[0], y: p[1], class: "slbl" }, gLbl).textContent = l[0]; });
    var gCity = el("g", {}, svg); S.cityEls = [];
    (cfg.cities || []).forEach(function (c) { var p = P(c[1], c[2]); S.cityEls.push({ x: p[0], y: p[1], dot: el("circle", { cx: p[0], cy: p[1], class: "cdot" }, gCity), t: el("text", { class: "cty" }, gCity) }); S.cityEls[S.cityEls.length - 1].t.textContent = c[0]; });
    gridLbls = [];
    lons.forEach(function (lo) { gridLbls.push({ k: "lon", v: P(lo, 0)[0], t: el("text", { class: "glbl", "text-anchor": "middle" }, svg), s: lo + "°E" }); });
    lats.forEach(function (la) { gridLbls.push({ k: "lat", v: P(0, la)[1], t: el("text", { class: "glbl" }, svg), s: la + "°N" }); });
    gridLbls.forEach(function (g) { g.t.textContent = g.s; });

    // Markers: one <g> per event, drawn at a constant on-screen size. Events at (almost) the same spot fan out in a ring.
    gMk = el("g", {}, svg); marks = [];
    var groups = {};
    S.doc.events.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (i) { var k = Math.round(i.lat * 20) + "," + Math.round(i.lon * 20); (groups[k] = groups[k] || []).push(i); });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      g.forEach(function (i, n) {
        var p = P(i.lon, i.lat), col = groupOf(i).color, w = el("g", { class: "mk", "data-id": i.id }, gMk);
        el("circle", { r: 16, class: "hit" }, w);
        el("circle", { r: 11, class: "halo", stroke: col }, w);
        el("circle", { r: 6, class: "ring r1", stroke: col }, w);
        el("circle", { r: 6, class: "ring r2", stroke: col }, w);
        if (i.status === "DISPUTED") el("circle", { r: 10, class: "disp" }, w);
        if (S.newIds.has(i.id)) { el("circle", { r: 13, class: "newg" }, w); w.classList.add("isnew"); }
        el("circle", { r: 9.5, class: "sel" }, w);
        var core = el("g", { class: "core" }, w);
        el("circle", { r: 6, class: "dot", fill: col }, core);
        el("title", {}, w).textContent = fmtDate(i.date) + " · " + i.title;
        marks.push({ i: i, g: w, core: core, x: p[0], y: p[1], n: g.length, k: n, a: g.length > 1 ? (2 * Math.PI * n) / g.length - Math.PI / 2 : 0, shown: false });
      });
    });
    if (S.needFit && svg.getBoundingClientRect().width) { vb = boxTarget(HOME); S.needFit = false; }
    setVB();
    if (first) { // markers pop in on first open, oldest first
      marks.forEach(function (m, idx) { m.core.style.animationDelay = Math.min(idx * 7, 700) + "ms"; });
    }
  }

  function view() {
    var r = svg.getBoundingClientRect(); if (!r.width) return { x: vb.x, y: vb.y, w: vb.w, h: vb.h, s: 0.2, r: r };
    var s = Math.max(vb.w / r.width, vb.h / r.height), w = r.width * s, h = r.height * s;
    return { x: vb.x - (w - vb.w) / 2, y: vb.y - (h - vb.h) / 2, w: w, h: h, s: s, r: r };
  }
  function setVB() {
    if (!gMk) return;
    svg.setAttribute("viewBox", [vb.x, vb.y, vb.w, vb.h].join(" "));
    var v = view(), s = v.s, zoom = HOME.w / vb.w, px = Math.max(0.85, Math.min(1.5, Math.pow(zoom, 0.22)));
    svg.style.setProperty("--u", s + "px");
    marks.forEach(function (m) {
      var ring = m.n > 1 ? 6 * px * Math.max(1.35, m.n * 0.5) : 0;
      m.cx = m.x + Math.cos(m.a) * ring * s; m.cy = m.y + Math.sin(m.a) * ring * s;
      m.g.setAttribute("transform", "translate(" + m.cx.toFixed(3) + " " + m.cy.toFixed(3) + ") scale(" + (s * px).toFixed(4) + ")");
    });
    (S.cityEls || []).forEach(function (c) { c.dot.setAttribute("r", (2.2 * s).toFixed(3)); c.t.setAttribute("x", (c.x + 5 * s).toFixed(2)); c.t.setAttribute("y", (c.y - 4 * s).toFixed(2)); });
    gridLbls.forEach(function (g) {
      if (g.k === "lon") { g.t.setAttribute("x", g.v.toFixed(2)); g.t.setAttribute("y", (v.y + 12 * s).toFixed(2)); }
      else { g.t.setAttribute("x", (v.x + 5 * s).toFixed(2)); g.t.setAttribute("y", (g.v - 3 * s).toFixed(2)); }
    });
    updateOffscreen();
  }
  function updateOffscreen() {
    var v = view(), out = marks.filter(function (m) { return m.shown && (m.cx < v.x || m.cx > v.x + v.w || m.cy < v.y || m.cy > v.y + v.h); }).length, b = $("#offscreen");
    b.hidden = !out || HOME.w / vb.w > 1.4; b.textContent = "+" + out + " off-map";
  }

  // Smooth camera moves (buttons, FIT, presets, fly-to). Pinch, drag and wheel stay immediate.
  var anim = null;
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function animateTo(t, ms, bump) {
    if (anim) cancelAnimationFrame(anim);
    var f = Object.assign({}, vb), t0 = performance.now(); ms = ms || 450; bump = bump || 0;
    function step(now) {
      var k = Math.min(1, (now - t0) / ms), e = easeInOut(k), cx = f.x + f.w / 2 + (t.x + t.w / 2 - f.x - f.w / 2) * e, cy = f.y + f.h / 2 + (t.y + t.h / 2 - f.y - f.h / 2) * e;
      var w = f.w + (t.w - f.w) * e + bump * Math.sin(Math.PI * k), h = w * (f.h + (t.h - f.h) * e) / (f.w + (t.w - f.w) * e);
      vb = { x: cx - w / 2, y: cy - h / 2, w: w, h: h }; setVB();
      anim = k < 1 ? requestAnimationFrame(step) : null;
    }
    anim = requestAnimationFrame(step);
  }
  function clampW(w) { return Math.min(FULL.w * 1.4, Math.max(HOME.w / 16, w)); }
  function zoomTarget(f, cx, cy) {
    var nw = clampW(vb.w / f), nh = vb.h * nw / vb.w;
    if (cx == null) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2; }
    return { x: cx - (cx - vb.x) * nw / vb.w, y: cy - (cy - vb.y) * nh / vb.h, w: nw, h: nh };
  }
  // Fit a map box into the part of the screen not covered by the replay card (bottom ~110px).
  function boxTarget(b, padPx) {
    var r = svg.getBoundingClientRect(), pad = padPx || 0, card = 110;
    if (!r.width) return { x: b.x, y: b.y, w: b.w, h: b.h };
    var availW = r.width - 2 * pad, availH = Math.max(80, r.height - card - 2 * pad);
    var sc = Math.max(b.w / availW, b.h / availH), w = r.width * sc, h = r.height * sc;
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    return { x: cx - w / 2, y: cy - h / 2 + (card / 2) * sc, w: w, h: h };
  }
  function flyToMark(m) {
    var v = view(), targetW = Math.min(vb.w, HOME.w / 3.2), sc = targetW / vb.w, h = vb.h * sc;
    var t = { w: targetW, h: h, x: m.x - targetW / 2, y: m.y - h * 0.28 };
    var dist = Math.hypot(m.x - (vb.x + vb.w / 2), m.y - (vb.y + vb.h / 2));
    animateTo(t, 900, Math.min(dist * 0.6, HOME.w * 0.5));
  }
  function ensureVisibleAboveSheet(m) {
    var v = view();
    var topZone = v.y + v.h * 0.36;
    if (m.cy > topZone || m.cx < v.x + v.w * 0.08 || m.cx > v.x + v.w * 0.92) animateTo({ x: m.x - vb.w / 2, y: m.y - vb.h * 0.25, w: vb.w, h: vb.h }, 500);
  }

  function initPanZoom() {
    $("#zin").onclick = function () { animateTo(zoomTarget(1.6), 380); };
    $("#zout").onclick = function () { animateTo(zoomTarget(1 / 1.6), 380); };
    $("#zfit").onclick = function () { animateTo(boxTarget(HOME), 600); };
    $("#offscreen").onclick = function () {
      var vis = marks.filter(function (m) { return m.shown; }); if (!vis.length) return;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      vis.forEach(function (m) { x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y); x1 = Math.max(x1, m.x); y1 = Math.max(y1, m.y); });
      animateTo(boxTarget({ x: x0 - 4, y: y0 - 4, w: x1 - x0 + 8, h: y1 - y0 + 8 }, 20), 700);
    };
    window.addEventListener("resize", function () { if (gMk) setVB(); });
    svg.addEventListener("wheel", function (e) { e.preventDefault(); if (anim) { cancelAnimationFrame(anim); anim = null; } var p = toSvg(e.clientX, e.clientY), t = zoomTarget(e.deltaY < 0 ? 1.2 : 1 / 1.2, p[0], p[1]); vb = t; setVB(); }, { passive: false });
    var pts = {}, pinch = null, start = null;
    svg.addEventListener("pointerdown", function (e) {
      if (anim) { cancelAnimationFrame(anim); anim = null; }
      var g = e.target.closest && e.target.closest("g.mk");
      start = Object.keys(pts).length ? null : { x: e.clientX, y: e.clientY, id: g ? g.getAttribute("data-id") : null, moved: false };
      svg.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY]; svg.classList.add("drag");
    });
    svg.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return; var prev = pts[e.pointerId]; pts[e.pointerId] = [e.clientX, e.clientY]; var ids = Object.keys(pts);
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) start.moved = true;
      if (ids.length === 2) {
        if (start) start.moved = true;
        var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) { var m = toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); vb = zoomTarget(d / pinch, m[0], m[1]); setVB(); } pinch = d; return;
      }
      var s = view().s; vb.x -= (e.clientX - prev[0]) * s; vb.y -= (e.clientY - prev[1]) * s; setVB();
    });
    function up(e) {
      delete pts[e.pointerId]; pinch = null;
      if (!Object.keys(pts).length) {
        svg.classList.remove("drag");
        if (e.type === "pointerup" && start && !start.moved) { if (start.id) nav("map", start.id, !!route().ev, false); else if (route().ev) closeSheet(); }
        start = null;
      }
    }
    svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  }
  function renderPresets() {
    var box = $("#presets"); box.innerHTML = "";
    (S.cfg.presets || []).forEach(function (p) {
      var b = document.createElement("button"); b.textContent = p.label; b.setAttribute("aria-label", "Zoom to " + p.label.toLowerCase());
      b.onclick = function () { animateTo(boxTarget(rect(p.box)), 700); };
      box.appendChild(b);
    });
  }
  function toSvg(px, py) { var v = view(); return [v.x + (px - v.r.left) * v.s, v.y + (py - v.r.top) * v.s]; }

  /* ---------- Replay ---------- */
  var days = [], timer = null;
  function initReplay() {
    var s = $("#day");
    s.oninput = function () { stop(); applyDay(false); };
    $("#play").onclick = function () {
      if (timer) { stop(); return; }
      if (+s.value >= days.length - 1) { s.value = 0; marks.forEach(function (m) { m.shown = false; }); }
      $("#play").classList.add("on"); $("#play").innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>'; $("#play").setAttribute("aria-label", "Pause replay");
      applyDay(false);
      timer = setInterval(function () { if (+s.value >= days.length - 1) { stop(); return; } s.value = +s.value + 1; applyDay(false); }, 1100);
    };
  }
  function setupReplay() {
    stop();
    days = Array.from(new Set(S.doc.events.map(function (i) { return i.date; }))).sort();
    var s = $("#day"); s.max = days.length - 1; s.value = days.length - 1;
    $("#dayfirst").textContent = fmtDate(days[0]).replace(/, \d{4}$/, "").toUpperCase();
    $("#daylast").textContent = fmtDate(days[days.length - 1]).replace(/, \d{4}$/, "").toUpperCase();
    applyDay(true);
  }
  function stop() { clearInterval(timer); timer = null; var p = $("#play"); p.classList.remove("on"); p.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'; p.setAttribute("aria-label", "Play replay"); }
  function applyDay(quiet) {
    if (!gMk || !days.length) return;
    var s = $("#day"), d = days[+s.value], onDay = 0, shown = 0, last = +s.value === days.length - 1;
    s.style.setProperty("--p", (days.length > 1 ? (100 * s.value) / (days.length - 1) : 100) + "%");
    $("#daylabel").textContent = fmtDate(d).toUpperCase() + (last ? (d === localDay() ? " · TODAY" : " · LATEST") : "");
    marks.forEach(function (m) {
      var show = passes(m.i) && m.i.date <= d, today = show && m.i.date === d;
      if (show && !m.shown) { m.g.classList.remove("pop"); void m.g.getBoundingClientRect(); m.g.classList.add("pop"); }
      m.shown = show; m.g.classList.toggle("gone", !show); m.g.classList.toggle("today", today);
      if (show) shown++; if (today) onDay++;
    });
    $("#daycount").textContent = onDay + " on day · " + shown + " shown";
    updateOffscreen();
  }

  /* ---------- Detail sheet ---------- */
  function srcList(list) { return '<ul class="srcs">' + list.map(function (s) { s = S.srcById[s.id] || s; return '<li><a href="' + esc(safeUrl(s.url)) + '">' + esc(s.title) + "</a></li>"; }).join("") + "</ul>"; }
  function srcLink(id) { if (!id || !S.srcById[id]) return ""; return ' · <a href="' + esc(safeUrl(S.srcById[id].url)) + '">source</a>'; }
  function claimsBlock(n, ind) {
    var h = '<div class="claims"><div class="claim ua"><div class="who">UKRAINE SAYS</div>' + esc(n.ukraine.value) + srcLink(n.ukraine.source) + "</div>" +
      '<div class="claim ru"><div class="who">RUSSIA SAYS</div>' + esc(n.russia.value) + srcLink(n.russia.source) + "</div>";
    (ind || []).forEach(function (x) { h += '<div class="claim ind"><div class="who">INDEPENDENT</div>' + esc(x.value) + srcLink(x.source) + "</div>"; });
    return h + "</div>";
  }
  function showIncident(id, fly) {
    var i = S.doc.events.filter(function (x) { return x.id === id; })[0]; if (!i) return hideSheet();
    var g = groupOf(i);
    var m = marks.filter(function (x) { return x.i.id === id; })[0];
    marks.forEach(function (x) { x.g.classList.toggle("selected", x === m); });
    if (m) {
      gMk.appendChild(m.g);
      if (!passes(i)) { S.groups.clear(); store("groups:" + S.cfg.id, []); renderChips(); renderFeed(); }
      if (!m.shown || !passes(i)) { stop(); $("#day").value = days.length - 1; applyDay(true); }
    }
    var h = '<div class="shead"><span class="d" style="background:' + esc(g.color) + '"></span>' + esc(g.label) + " · " + esc(TYPE_NAME[i.type] || i.type) + " " + badge(i.status) + (S.newIds.has(i.id) ? '<span class="new">NEW</span>' : "") + '<button class="close" aria-label="Close">×</button></div>' +
      "<h2>" + esc(i.title) + '</h2><div class="smeta">' + esc(fmtDate(i.date)) + " · " + esc(i.oblast) + " · " + esc(i.front) + " · position: " + esc(i.coordPrecision) + "</div>" +
      '<div class="slab">WHAT HAPPENED</div><p>' + esc(i.caption) + "</p>";
    if (i.numbers) h += '<div class="slab">' + esc(i.numbers.label).toUpperCase() + "</div>" + claimsBlock(i.numbers, i.numbers.independent ? [i.numbers.independent] : []);
    h += '<div class="slab">SOURCES</div>' + srcList(i.sources);
    $("#sheetbody").innerHTML = h; $(".close").onclick = closeSheet;
    var sh = $("#sheet"); sh.style.transform = ""; sh.classList.add("open"); sh.setAttribute("aria-hidden", "false"); sh.scrollTop = 0;
    if (m) requestAnimationFrame(function () { if (fly) flyToMark(m); else ensureVisibleAboveSheet(m); });
  }
  function hideSheet() { var sh = $("#sheet"); sh.classList.remove("open"); sh.style.transform = ""; sh.setAttribute("aria-hidden", "true"); marks.forEach(function (m) { m.g.classList.remove("selected"); }); }
  function closeSheet() { if (!route().ev) return hideSheet(); if ((history.state && history.state.depth) > 0) history.back(); else nav(route().tab, null, true); }
  function initSheet() {
    var g = $(".grip"), sh = $("#sheet"), y0 = null;
    g.addEventListener("pointerdown", function (e) { y0 = e.clientY; g.setPointerCapture(e.pointerId); sh.style.transition = "none"; });
    g.addEventListener("pointermove", function (e) { if (y0 == null) return; sh.style.transform = "translateY(" + Math.max(0, e.clientY - y0) + "px)"; });
    g.addEventListener("pointerup", function (e) { if (y0 == null) return; var dy = e.clientY - y0; y0 = null; sh.style.transition = ""; if (dy > 70) closeSheet(); else sh.style.transform = ""; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (!$("#modal").hidden) closeModal(); else closeSheet(); } });
  }

  /* ---------- Feed ---------- */
  function renderFeed() {
    var list = S.doc.events.filter(passes).sort(function (a, b) { return a.date === b.date ? 0 : a.date < b.date ? 1 : -1; });
    $("#feed").innerHTML = list.map(function (i, n) {
      return '<article class="fcard" data-id="' + esc(i.id) + '" style="--c:' + esc(groupOf(i).color) + ";animation-delay:" + Math.min(n * 35, 500) + 'ms"><div class="fmeta"><span>' +
        esc(fmtDate(i.date)) + " · " + esc(TYPE_NAME[i.type] || i.type) + " · " + esc(i.oblast) + "</span><span>" + badge(i.status) + (S.newIds.has(i.id) ? '<span class="new">NEW</span>' : "") + "</span></div><h3>" + esc(i.title) + "</h3><p>" + esc(i.caption) + "</p>" + srcList(i.sources) + "</article>";
    }).join("") || '<div class="empty">No events for this filter.</div>';
    $$(".fcard").forEach(function (c) { c.onclick = function () { nav("map", c.dataset.id, false, true); }; });
  }

  /* ---------- Stats ---------- */
  function renderStats() {
    var counts = {}, total = 0;
    S.doc.events.forEach(function (e) { counts[e.status] = (counts[e.status] || 0) + 1; total++; });
    var max = Math.max.apply(null, Object.keys(STATUS).map(function (k) { return counts[k] || 0; })) || 1;
    var colors = { CONFIRMED: "var(--confirmed)", ONE_PARTY: "var(--oneparty)", DISPUTED: "var(--disputed)", UNVERIFIED: "var(--unverified)" };
    var h = '<div class="scard"><h3>Events on the map by label</h3><div class="bars">' + Object.keys(STATUS).map(function (k) {
      return '<div class="row">' + badge(k) + '<div class="track"><div class="fill" data-w="' + (100 * (counts[k] || 0) / max).toFixed(1) + '" style="background:' + colors[k] + '"></div></div><span class="n">' + (counts[k] || 0) + "</span></div>";
    }).join("") + "</div></div>";
    var byCat = {};
    S.doc.stats.forEach(function (f) { (byCat[f.category] = byCat[f.category] || []).push(f); });
    Object.keys(CATS).forEach(function (c) {
      if (!byCat[c]) return;
      h += '<div class="sect">' + CATS[c] + "</div>" + byCat[c].map(function (f) {
        return '<div class="scard"><h3>' + esc(f.label) + '</h3><div class="asof">as of ' + esc(fmtDate(f.asOf)) + "</div>" + claimsBlock(f, f.independent) + "</div>";
      }).join("");
    });
    $("#stats").innerHTML = h;
    if (route().tab === "stats") animateBars();
  }
  function animateBars() {
    var f = $$("#stats .fill"); f.forEach(function (x) { x.style.transition = "none"; x.style.width = "0"; });
    requestAnimationFrame(function () { requestAnimationFrame(function () { f.forEach(function (x, n) { x.style.transition = ""; x.style.transitionDelay = n * 90 + "ms"; x.style.width = x.dataset.w + "%"; }); }); });
  }

  /* ---------- Labels modal ---------- */
  function initModal() {
    $("#labelsbtn").onclick = function () {
      var g = S.cfg ? S.cfg.groups : [];
      $("#modalbody").innerHTML = "<h3>What the labels mean</h3>" + Object.keys(STATUS).map(function (k) { return '<div class="lrow"><span>' + badge(k) + "</span><span>" + esc(STATUS_TEXT[k]) + "</span></div>"; }).join("") +
        '<div class="mkey">' + g.map(function (x) { return '<span><i class="dd" style="background:' + esc(x.color) + '"></i>' + esc(x.label) + "</span>"; }).join("") +
        '<span><i class="dd" style="border:1.6px dashed #f87171"></i>Dashed red ring: disputed</span>' +
        '<span><i class="dd" style="border:1.6px solid #9ca3af"></i>Expanding rings: events on the selected day</span>' +
        '<span><i class="dd" style="border:2px solid var(--cyan)"></i>Cyan glow: new since your last visit</span>' +
        "<span>Crimea (shaded, dashed) is occupied Ukrainian territory. No front line is drawn.</span></div>";
      $("#modal").hidden = false;
    };
    $("#modalclose").onclick = closeModal;
    $("#modal").onclick = function (e) { if (e.target.id === "modal") closeModal(); };
  }
  function closeModal() { $("#modal").hidden = true; }

  /* ---------- Refresh: button + pull down on Feed/Stats ---------- */
  function initRefresh() {
    $("#refresh").onclick = function () { refresh(true); };
    ["#tab-feed", "#tab-stats"].forEach(function (sel) {
      var t = $(sel), y0 = null, dy = 0;
      t.addEventListener("touchstart", function (e) { y0 = t.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
      t.addEventListener("touchmove", function (e) { if (y0 != null) dy = e.touches[0].clientY - y0; }, { passive: true });
      t.addEventListener("touchend", function () { if (y0 != null && dy > 80) refresh(true); y0 = null; dy = 0; });
    });
  }

  boot();
})();
