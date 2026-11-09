/* Ukraine Ops Map - vanilla JS, no build step. Works as a web page (GitHub Pages) and inside the Android app (Capacitor). */
(function () {
  "use strict";

  /* ---------- Where data comes from ---------- */
  // The app always tries the live copy on GitHub Pages first, then the last saved copy, then the copy bundled in the app.
  var PAGES = "https://romanturtle3126.github.io/war-trackers/";
  var CAP = window.Capacitor;
  var NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  var params = new URLSearchParams(location.search);
  var REMOTE = NATIVE || params.get("remote") === "1" ? PAGES : ""; // "" = same site (GitHub Pages itself, or local preview)
  var STALE_MS = 30 * 60 * 1000; // refresh on resume if older than this

  var STATUS = { CONFIRMED: "Confirmed", ONE_PARTY: "One party's claim", DISPUTED: "Disputed", UNVERIFIED: "Unverified" };
  var TYPES = {
    missile: ["Missile strike", "#ff7b72"], drone: ["Drone strike", "#ffa657"], airstrike: ["Glide bomb / air strike", "#f2cc60"],
    artillery: ["Shelling / mixed attacks", "#d2a8ff"], energy: ["Energy infrastructure", "#79c0ff"],
    "deep-strike": ["Ukrainian strike in Russia/occupied", "#3fb950"], frontline: ["Frontline movement (ISW)", "#56d4dd"],
    claim: ["Territorial claim", "#f85149"], ceasefire: ["Ceasefire / humanitarian", "#ffffff"], naval: ["Naval / Black Sea", "#1f6feb"], other: ["Other", "#8b949e"]
  };
  var PRECISION = { city: "city-level", approx: "approximate", oblast: "province only (not geolocated)" };

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : "#"; }
  function badge(st) { return '<span class="badge b-' + esc(st) + '">' + esc((STATUS[st] || st).toUpperCase()) + "</span>"; }
  function fmtDate(d) { return new Date(d + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  function fmtStamp(s) { var t = new Date(s); return isNaN(t) ? String(s) : t.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function typeOf(i) { return TYPES[i.type] || TYPES.other; }

  var S = { maps: [], cfg: null, doc: null, feed: null, from: "", fetchedAt: 0, srcById: {}, regions: new Set(), loading: false };

  /* ---------- Loading ---------- */
  function fetchJSON(url, opts) {
    var ctl = window.AbortController ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, 15000);
    return fetch(url, Object.assign({ cache: "no-store", signal: ctl && ctl.signal }, opts || {}))
      .then(function (r) { if (!r.ok) throw new Error(url + " → HTTP " + r.status); return r.json(); })
      .finally(function () { if (t) clearTimeout(t); });
  }
  function looksLikeData(d) { return d && Array.isArray(d.events) && d.events.length && d.meta && d.meta.lastUpdated && Array.isArray(d.sources); }
  function looksLikeFeed(d) { return d && Array.isArray(d.items); }
  function stampOf(d) { var t = Date.parse((d && d.meta && d.meta.lastUpdated) || ""); return isNaN(t) ? 0 : t; }

  // Returns {doc, from: "live"|"saved"|"built-in"}; never rejects if any copy exists.
  function loadOne(path, ok) {
    var key = "cache:" + path;
    var live = fetchJSON(REMOTE + path + (REMOTE ? "?t=" + Date.now() : "")).then(function (d) { if (!ok(d)) throw new Error("bad data"); return d; });
    return live.then(function (d) { store(key, { doc: d, at: Date.now() }); return { doc: d, from: "live" }; }, function () {
      var saved = store(key);
      var bundled = REMOTE ? fetchJSON(path).then(function (d) { return ok(d) ? d : null; }, function () { return null; }) : Promise.resolve(null);
      return bundled.then(function (b) {
        var s = saved && ok(saved.doc) ? saved.doc : null;
        if (s && (!b || stampOf(s) >= stampOf(b))) return { doc: s, from: "saved", at: saved.at };
        if (b) return { doc: b, from: "built-in" };
        throw new Error("No data available (offline and nothing saved yet).");
      });
    });
  }

  function boot() {
    initTabs(); initPanZoom(); initSheet(); initReplay(); initRefresh(); initLinks(); initBack();
    fetchJSON("maps.json").then(function (m) {
      S.maps = m.maps;
      var want = store("map") || S.maps[0].id;
      S.cfg = S.maps.filter(function (x) { return x.id === want; })[0] || S.maps[0];
      var sw = $("#mapswitch");
      if (S.maps.length > 1) {
        sw.hidden = false;
        sw.innerHTML = S.maps.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.name) + "</option>"; }).join("");
        sw.value = S.cfg.id;
        sw.onchange = function () { S.cfg = S.maps.filter(function (x) { return x.id === sw.value; })[0]; store("map", S.cfg.id); geo = null; vb = null; refresh(false); };
      }
      applyRoute();
      return refresh(false);
    }).catch(function (e) { $("#updated").textContent = "Failed to start: " + e.message; });
  }

  function refresh(manual) {
    if (S.loading) return Promise.resolve();
    S.loading = true; $("#refresh").classList.add("spin");
    var oldIds = S.doc && S.doc.map === S.cfg.id ? new Set(S.doc.events.map(function (e) { return e.id; })) : null;
    var oldStamp = stampOf(S.doc);
    var cfg = S.cfg;
    return Promise.all([loadOne(cfg.data, looksLikeData), loadOne(cfg.feed, looksLikeFeed).catch(function () { return { doc: { meta: {}, items: [] } }; }), loadGeo(cfg)])
      .then(function (r) {
        S.doc = r[0].doc; S.from = r[0].from; S.savedAt = r[0].at; S.feed = r[1].doc; S.fetchedAt = Date.now();
        if (manual || !oldIds || stampOf(S.doc) !== oldStamp) renderAll();
        else renderUpdated();
        if (manual) {
          var n = oldIds ? S.doc.events.filter(function (e) { return !oldIds.has(e.id); }).length : 0;
          toast(S.from === "live" ? (n ? n + " new event" + (n > 1 ? "s" : "") : "Up to date") : "Offline. Showing " + (S.from === "saved" ? "saved" : "built-in") + " copy");
        }
      })
      .catch(function (e) { $("#updated").textContent = e.message; if (manual) toast(e.message); })
      .finally(function () { S.loading = false; $("#refresh").classList.remove("spin"); });
  }

  function renderAll() {
    S.srcById = {};
    S.doc.sources.forEach(function (s) { S.srcById[s.id] = s; });
    S.regions = new Set((store("regions:" + S.cfg.id) || []).filter(function (r) { return S.cfg.regions.some(function (x) { return x.id === r; }); }));
    $("#apptitle").textContent = S.cfg.title; document.title = S.cfg.title;
    renderUpdated(); renderChips(); drawMap(); setupReplay(); renderTimeline(); renderStats(); renderFeed(); renderSources();
    applyRoute();
  }
  function renderUpdated() {
    var tag = S.from === "live" ? "" : S.from === "saved" ? ' · <span class="off">offline: saved copy</span>' : ' · <span class="off">offline: built-in copy</span>';
    $("#updated").innerHTML = "Data updated <b>" + esc(fmtStamp(S.doc.meta.lastUpdated)) + "</b> · " + S.doc.events.length + " events" + tag;
  }
  function toast(msg) {
    var t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; $("#app").appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ---------- Routing: #/tab or #/tab/eventId. Android Back walks this history. ---------- */
  var TABS = ["map", "timeline", "stats", "feed", "sources"];
  function route() { var m = (location.hash || "").replace(/^#\/?/, "").split("/"); return { tab: TABS.indexOf(m[0]) >= 0 ? m[0] : "map", ev: m[1] ? decodeURIComponent(m[1]) : null }; }
  function nav(tab, ev, replace) {
    var h = "#/" + tab + (ev ? "/" + encodeURIComponent(ev) : "");
    if (location.hash === h) return applyRoute();
    var depth = (history.state && history.state.depth) || 0;
    if (replace) history.replaceState({ depth: depth }, "", h); else history.pushState({ depth: depth + 1 }, "", h);
    applyRoute();
  }
  function applyRoute() {
    var r = route();
    $$("#tabs button").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === r.tab); });
    $$(".tab").forEach(function (t) { t.classList.toggle("active", t.id === "tab-" + r.tab); });
    $("#chips").hidden = !(r.tab === "map" || r.tab === "timeline");
    if (r.ev && S.doc) showIncident(r.ev); else hideSheet();
  }
  function initTabs() {
    $$("#tabs button").forEach(function (b) { b.onclick = function () { if (route().tab !== b.dataset.tab || route().ev) nav(b.dataset.tab, null, false); }; });
    window.addEventListener("popstate", applyRoute);
    if (!location.hash) history.replaceState({ depth: 0 }, "", "#/map");
  }
  function initBack() {
    var App = NATIVE && CAP.Plugins && CAP.Plugins.App;
    if (!App) return;
    App.addListener("backButton", function (e) { if (e && e.canGoBack) history.back(); else App.exitApp(); });
    App.addListener("resume", function () { if (Date.now() - S.fetchedAt > STALE_MS) refresh(false); });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && S.cfg && Date.now() - S.fetchedAt > STALE_MS) refresh(false); });

  function initLinks() {
    // In the app, open source links in Chrome (Custom Tab) instead of inside the app.
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a || !/^https?:/i.test(a.getAttribute("href"))) return;
      if (!NATIVE) { a.target = "_blank"; a.rel = "noopener"; return; }
      e.preventDefault();
      var B = CAP.Plugins && CAP.Plugins.Browser;
      if (B && B.open) B.open({ url: a.href, toolbarColor: "#161b22" }).catch(function () { location.href = a.href; });
      else location.href = a.href; // Capacitor hands non-app URLs to the system browser
    });
  }

  /* ---------- Region filter chips ---------- */
  function passes(e) { return !S.regions.size || S.regions.has(e.region); }
  function renderChips() {
    var counts = {};
    S.doc.events.forEach(function (e) { counts[e.region] = (counts[e.region] || 0) + 1; });
    var h = '<button class="chip' + (S.regions.size ? "" : " on") + '" data-r="">All<span class="n">' + S.doc.events.length + "</span></button>";
    S.cfg.regions.forEach(function (r) {
      h += '<button class="chip' + (S.regions.has(r.id) ? " on" : "") + '" data-r="' + esc(r.id) + '" aria-pressed="' + S.regions.has(r.id) + '">' + esc(r.label) + '<span class="n">' + (counts[r.id] || 0) + "</span></button>";
    });
    $("#chips").innerHTML = h;
    $$("#chips .chip").forEach(function (c) {
      c.onclick = function () {
        var r = c.dataset.r;
        if (!r) S.regions.clear(); else if (S.regions.has(r)) S.regions.delete(r); else S.regions.add(r);
        if (S.regions.size === S.cfg.regions.length) S.regions.clear();
        store("regions:" + S.cfg.id, Array.from(S.regions));
        renderChips(); applyDay(); renderTimeline();
      };
    });
  }

  /* ---------- Map ---------- */
  var svg = $("#map"), gMk, geo = null, geoFor = null, vb = null, FULL, HOME, PRJ, marks = [];
  function P(lon, lat) { return [(lon - PRJ.lon0) * PRJ.kx, (PRJ.lat0 - lat) * PRJ.ky]; }
  function rect(b) { var a = P(b.minLon, b.maxLat), c = P(b.maxLon, b.minLat); return { x: a[0], y: a[1], w: c[0] - a[0], h: c[1] - a[1] }; }
  function el(tag, attrs, parent) { var e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function loadGeo(cfg) { if (geo && geoFor === cfg.geo) return Promise.resolve(geo); return fetchJSON(cfg.geo, { cache: "default" }).then(function (g) { geo = g; geoFor = cfg.geo; return g; }); }
  function path(rings) { return rings.map(function (r) { return "M" + r.map(function (p) { var q = P(p[0], p[1]); return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("L") + "Z"; }).join(""); }

  function drawMap() {
    var cfg = S.cfg; PRJ = cfg.projection; FULL = rect(cfg.bounds); HOME = rect(cfg.home);
    if (!vb) vb = Object.assign({}, HOME);
    svg.innerHTML = "";
    el("rect", { x: FULL.x - 400, y: FULL.y - 400, width: FULL.w + 800, height: FULL.h + 800, class: "sea" }, svg);
    geo.countries.forEach(function (c) { el("path", { d: path(c.rings), class: c.a3 === cfg.highlight ? "ua" : "land" }, svg); });
    if (cfg.frontLine) el("polyline", { points: cfg.frontLine.map(function (p) { return P(p[0], p[1]).map(function (n) { return n.toFixed(1); }).join(","); }).join(" "), class: "front" }, svg);
    (cfg.bigLabels || []).forEach(function (l) { var p = P(l[1], l[2]); el("text", { x: p[0], y: p[1], class: "lbl big" }, svg).textContent = l[0]; });
    (cfg.areaLabels || []).forEach(function (l) { var p = P(l[1], l[2]); el("text", { x: p[0], y: p[1], class: "lbl" }, svg).textContent = l[0]; });
    (cfg.cities || []).forEach(function (c) { var p = P(c[1], c[2]); el("circle", { cx: p[0], cy: p[1], r: 0.7, class: "dot" }, svg); el("text", { x: p[0] + 1.3, y: p[1] - 0.9, class: "cty" }, svg).textContent = c[0]; });

    // Markers. Events sharing (almost) the same spot are fanned out in a small ring so each can be tapped.
    gMk = el("g", {}, svg); marks = [];
    var groups = {};
    S.doc.events.forEach(function (i) { var k = Math.round(i.lat * 20) + "," + Math.round(i.lon * 20); (groups[k] = groups[k] || []).push(i); });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      g.forEach(function (i, n) {
        var p = P(i.lon, i.lat), wrap = el("g", { "data-id": i.id }, gMk);
        var hit = el("circle", { class: "hit" }, wrap), dot = el("circle", { fill: typeOf(i)[1], class: "mk" }, wrap);
        el("title", {}, wrap).textContent = i.date + " · " + i.title;
        marks.push({ i: i, g: wrap, hit: hit, dot: dot, x: p[0], y: p[1], n: g.length, a: g.length > 1 ? (2 * Math.PI * n) / g.length - Math.PI / 2 : 0 });
      });
    });
    var used = Object.keys(TYPES).filter(function (t) { return S.doc.events.some(function (i) { return i.type === t; }); });
    $("#legend").innerHTML = "<details" + (window.innerWidth > 700 ? " open" : "") + "><summary>Legend</summary><h4>Event type</h4>" +
      used.map(function (t) { return '<div class="row"><span class="sw" style="background:' + TYPES[t][1] + '"></span>' + TYPES[t][0] + "</div>"; }).join("") +
      "<h4>Status labels</h4>" + Object.keys(STATUS).map(function (s) { return '<div class="row">' + badge(s) + "</div>"; }).join("") +
      '<div class="row"><span class="sw" style="background:none;border-top:2px dashed #f85149;border-radius:0;height:0"></span>Front line (illustrative only)</div>' +
      '<div class="row meta">Borders: Natural Earth</div></details>';
    setVB();
  }
  function view() { // the area actually visible (the SVG letterboxes the viewBox)
    var r = svg.getBoundingClientRect(); if (!r.width) return { x: vb.x, y: vb.y, w: vb.w, h: vb.h, s: 1, r: r };
    var s = Math.max(vb.w / r.width, vb.h / r.height), w = r.width * s, h = r.height * s;
    return { x: vb.x - (w - vb.w) / 2, y: vb.y - (h - vb.h) / 2, w: w, h: h, s: s, r: r };
  }
  function setVB() {
    if (!gMk) return;
    svg.setAttribute("viewBox", [vb.x, vb.y, vb.w, vb.h].join(" "));
    var v = view(), z = FULL.w / vb.w, rad = 2.4 / Math.sqrt(z), minHit = 12 * v.s; // ≥12px finger radius
    marks.forEach(function (m) {
      var ring = m.n > 1 ? rad * Math.max(1.25, m.n * 0.42) : 0, cx = m.x + Math.cos(m.a) * ring, cy = m.y + Math.sin(m.a) * ring;
      m.cx = cx; m.cy = cy;
      m.dot.setAttribute("cx", cx.toFixed(2)); m.dot.setAttribute("cy", cy.toFixed(2)); m.dot.setAttribute("r", rad.toFixed(2));
      m.hit.setAttribute("cx", cx.toFixed(2)); m.hit.setAttribute("cy", cy.toFixed(2)); m.hit.setAttribute("r", Math.max(rad * 1.3, Math.min(minHit, rad * 3)).toFixed(2));
    });
    updateOffscreen();
  }
  function shown(m) { return m.g.style.display !== "none"; }
  function updateOffscreen() {
    var v = view(), out = marks.filter(function (m) { return shown(m) && (m.cx < v.x || m.cx > v.x + v.w || m.cy < v.y || m.cy > v.y + v.h); }).length, b = $("#offscreen");
    b.hidden = !out; b.textContent = out + " event" + (out > 1 ? "s" : "") + " outside view · Show all";
  }
  function fitShown() {
    var vis = marks.filter(shown); if (!vis.length) return;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    vis.forEach(function (m) { x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y); x1 = Math.max(x1, m.x); y1 = Math.max(y1, m.y); });
    var pad = 8, w = Math.max(x1 - x0 + 2 * pad, 40), h = Math.max(y1 - y0 + 2 * pad, 30);
    vb = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w: w, h: h }; setVB();
  }
  function zoomAt(f, cx, cy) {
    var nw = Math.min(FULL.w * 1.5, Math.max(FULL.w / 14, vb.w / f)), nh = vb.h * nw / vb.w;
    if (cx == null) { cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2; }
    vb.x = cx - (cx - vb.x) * nw / vb.w; vb.y = cy - (cy - vb.y) * nh / vb.h; vb.w = nw; vb.h = nh; setVB();
  }
  function toSvg(px, py) { var v = view(); return [v.x + (px - v.r.left) * v.s, v.y + (py - v.r.top) * v.s, v.s]; }
  function initPanZoom() {
    $("#zin").onclick = function () { zoomAt(1.5); }; $("#zout").onclick = function () { zoomAt(1 / 1.5); };
    $("#zreset").onclick = function () { vb = Object.assign({}, HOME); setVB(); };
    $("#offscreen").onclick = fitShown;
    window.addEventListener("resize", function () { if (gMk) setVB(); });
    svg.addEventListener("wheel", function (e) { e.preventDefault(); var p = toSvg(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, p[0], p[1]); }, { passive: false });
    var pts = {}, pinch = null, start = null;
    svg.addEventListener("pointerdown", function (e) {
      var g = e.target.closest && e.target.closest("g[data-id]");
      start = Object.keys(pts).length ? null : { x: e.clientX, y: e.clientY, id: g ? g.getAttribute("data-id") : null, moved: false };
      svg.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY]; svg.classList.add("drag");
    });
    svg.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return; var prev = pts[e.pointerId]; pts[e.pointerId] = [e.clientX, e.clientY]; var ids = Object.keys(pts);
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) start.moved = true;
      if (ids.length === 2) {
        if (start) start.moved = true;
        var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) { var m = toSvg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); zoomAt(d / pinch, m[0], m[1]); } pinch = d; return;
      }
      var s = view().s; vb.x -= (e.clientX - prev[0]) * s; vb.y -= (e.clientY - prev[1]) * s; setVB();
    });
    function up(e) {
      delete pts[e.pointerId]; pinch = null;
      if (!Object.keys(pts).length) {
        svg.classList.remove("drag");
        if (e.type === "pointerup" && start && !start.moved) { if (start.id) nav(route().tab, start.id, !!route().ev); else if (route().ev) closeSheet(); }
        start = null;
      }
    }
    svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  }

  /* ---------- Replay ---------- */
  var days = [], timer = null;
  function initReplay() {
    var s = $("#day");
    s.oninput = applyDay; $("#cumul").onchange = applyDay;
    $("#play").onclick = function () {
      if (timer) { stop(); return; }
      if (+s.value >= days.length - 1) s.value = 0;
      $("#play").textContent = "❚❚"; $("#play").setAttribute("aria-label", "Pause replay"); applyDay();
      timer = setInterval(function () { if (+s.value >= days.length - 1) { stop(); return; } s.value = +s.value + 1; applyDay(); }, 900);
    };
  }
  function setupReplay() {
    stop();
    days = Array.from(new Set(S.doc.events.map(function (i) { return i.date; }))).sort();
    var s = $("#day"); s.max = days.length - 1; s.value = days.length - 1;
    applyDay();
  }
  function stop() { clearInterval(timer); timer = null; $("#play").textContent = "▶"; $("#play").setAttribute("aria-label", "Play replay"); }
  function applyDay() {
    if (!gMk || !days.length) return;
    var d = days[+$("#day").value], cum = $("#cumul").checked;
    $("#daylabel").textContent = (cum ? "≤ " : "") + fmtDate(d);
    marks.forEach(function (m) { var cd = m.i.date, show = passes(m.i) && (cum ? cd <= d : cd === d); m.g.style.display = show ? "" : "none"; m.g.style.opacity = cd === d ? 1 : 0.55; });
    updateOffscreen();
  }

  /* ---------- Detail sheet ---------- */
  function srcList(list) { return '<ol class="src">' + list.map(function (s) { s = S.srcById[s.id] || s; return '<li><a href="' + esc(safeUrl(s.url)) + '">' + esc(s.title) + "</a></li>"; }).join("") + "</ol>"; }
  function srcLink(id) { if (!id || !S.srcById[id]) return '<span class="meta">no source</span>'; return '<a href="' + esc(safeUrl(S.srcById[id].url)) + '">source</a>'; }
  function claimsBlock(n, ind) {
    var h = '<div class="claims"><div class="claim ua"><div class="who">UKRAINE CLAIMS</div>' + esc(n.ukraine.value) + " · " + srcLink(n.ukraine.source) + "</div>" +
      '<div class="claim ru"><div class="who">RUSSIA CLAIMS</div>' + esc(n.russia.value) + " · " + srcLink(n.russia.source) + "</div>";
    (ind || []).forEach(function (x) { h += '<div class="claim ind"><div class="who">INDEPENDENT ESTIMATE</div>' + esc(x.value) + " · " + srcLink(x.source) + "</div>"; });
    return h + "</div>";
  }
  function regionLabel(id) { var r = S.cfg.regions.filter(function (x) { return x.id === id; })[0]; return r ? r.label : id; }
  function showIncident(id) {
    var i = S.doc.events.filter(function (x) { return x.id === id; })[0]; if (!i) return hideSheet();
    marks.forEach(function (m) { m.dot.classList.toggle("sel", m.i.id === id); });
    var h = '<button class="close" aria-label="Close">×</button>' + badge(i.status) + ' <span class="meta">' + esc(fmtDate(i.date)) + " · " + esc(regionLabel(i.region)) + " · " + esc(i.front) + " · " + esc(i.oblast) + "</span>" +
      "<h3>" + esc(i.title) + "</h3><p>" + esc(i.caption) + "</p>" +
      '<p class="meta">Type: ' + esc(typeOf(i)[0]) + " · Location: " + esc(PRECISION[i.coordPrecision] || i.coordPrecision) + "</p>";
    if (i.numbers) h += "<div>" + (i.numbers.disputed ? badge("DISPUTED") + " " : "") + "<b>" + esc(i.numbers.label) + "</b>" + claimsBlock(i.numbers, i.numbers.independent ? [i.numbers.independent] : []) + "</div>";
    h += "<h4>Sources</h4>" + srcList(i.sources);
    $("#sheetbody").innerHTML = h; $(".close").onclick = closeSheet;
    var sh = $("#sheet"); sh.style.transform = ""; sh.classList.add("open"); sh.setAttribute("aria-hidden", "false"); sh.scrollTop = 0;
  }
  function hideSheet() { var sh = $("#sheet"); sh.classList.remove("open"); sh.style.transform = ""; sh.setAttribute("aria-hidden", "true"); marks.forEach(function (m) { m.dot.classList.remove("sel"); }); }
  function closeSheet() { if (!route().ev) return hideSheet(); if ((history.state && history.state.depth) > 0) history.back(); else nav(route().tab, null, true); }
  function initSheet() {
    var g = $(".grip"), sh = $("#sheet"), y0 = null;
    g.addEventListener("pointerdown", function (e) { y0 = e.clientY; g.setPointerCapture(e.pointerId); sh.style.transition = "none"; });
    g.addEventListener("pointermove", function (e) { if (y0 == null) return; var dy = Math.max(0, e.clientY - y0); sh.style.transform = "translateY(" + dy + "px)"; });
    g.addEventListener("pointerup", function (e) { if (y0 == null) return; var dy = e.clientY - y0; y0 = null; sh.style.transition = ""; if (dy > 80) closeSheet(); else sh.style.transform = ""; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
  }

  /* ---------- Timeline / Stats / Feed / Sources ---------- */
  function renderTimeline() {
    var h = "", last = null, list = S.doc.events.filter(passes).sort(function (a, b) { return b.date.localeCompare(a.date); });
    list.forEach(function (i) {
      if (i.date !== last) { h += '<div class="tl-day">' + esc(fmtDate(i.date)) + "</div>"; last = i.date; }
      h += '<div class="tl-item" role="button" tabindex="0" data-id="' + esc(i.id) + '" style="border-color:' + typeOf(i)[1] + '">' + badge(i.status) + " <b>" + esc(i.title) + '</b><div class="meta">' + esc(i.oblast) + " · " + esc(typeOf(i)[0]) + " · " + i.sources.length + " source(s)</div></div>";
    });
    $("#timeline").innerHTML = h || '<div class="empty">No events in the selected regions.</div>';
    $$(".tl-item").forEach(function (t) { t.onclick = function () { nav("timeline", t.dataset.id, false); }; });
  }
  function renderStats() {
    $("#stats").innerHTML = S.doc.stats.map(function (f) {
      return '<div class="card">' + badge("DISPUTED") + ' <span class="meta">' + esc(f.category) + " · as of " + esc(fmtDate(f.asOf)) + "</span><h3>" + esc(f.label) + "</h3>" + claimsBlock(f, f.independent) + "</div>";
    }).join("");
  }
  function renderFeed() {
    var m = S.feed.meta || {}, it = S.feed.items || [];
    $("#feedmeta").textContent = m.lastUpdated ? "Headlines pulled " + fmtStamp(m.lastUpdated) + " · " + it.length + " headlines" : "No headlines yet.";
    $("#feed").innerHTML = it.map(function (x) { return '<div class="feed-item"><a href="' + esc(safeUrl(x.link)) + '">' + esc(x.headline) + '</a><div class="meta">' + esc(x.source) + (x.date ? " · " + esc(fmtStamp(x.date)) : "") + " · " + badge("UNVERIFIED") + "</div></div>"; }).join("");
  }
  function renderSources() {
    var m = S.doc.meta;
    $("#notes").innerHTML = '<div class="card"><b>About this data</b><p class="meta">Coverage: ' + esc(m.coverage) + " · Data updated " + esc(fmtStamp(m.lastUpdated)) +
      (S.from !== "live" ? " · offline copy" + (S.savedAt ? " saved " + esc(fmtStamp(S.savedAt)) : "") : "") + "</p><ul>" + (m.notes || []).map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") +
      '</ul><p class="meta">Status legend: ' + Object.keys(STATUS).map(badge).join(" ") + '</p><p class="meta">The map outline uses Natural Earth borders. The red dashed front line is illustrative only. Positions marked approximate or province-only are not geolocated.</p></div>';
    $("#sources").innerHTML = S.doc.sources.map(function (s) { return '<li><a href="' + esc(safeUrl(s.url)) + '">' + esc(s.title) + "</a></li>"; }).join("");
  }

  /* ---------- Refresh button + pull-to-refresh on list tabs ---------- */
  function initRefresh() {
    $("#refresh").onclick = function () { refresh(true); };
    var y0 = null, dy = 0, ptr = $("#ptr");
    $$(".tab").forEach(function (t) {
      if (t.id === "tab-map") return;
      t.addEventListener("touchstart", function (e) { y0 = t.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
      t.addEventListener("touchmove", function (e) {
        if (y0 == null) return; dy = e.touches[0].clientY - y0;
        if (dy > 10 && t.scrollTop <= 0) { ptr.classList.add("show"); ptr.classList.toggle("go", dy > 70); ptr.textContent = dy > 70 ? "↻ Release to refresh" : "↓ Pull to refresh"; }
        else ptr.classList.remove("show");
      }, { passive: true });
      t.addEventListener("touchend", function () { if (y0 != null && dy > 70) refresh(true); y0 = null; dy = 0; ptr.classList.remove("show", "go"); });
    });
  }

  boot();
})();
