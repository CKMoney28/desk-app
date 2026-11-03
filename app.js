// Grok Bot desk app. Plan B: polls encrypted JSON under /d/{dir}/ (dir and key derived from DATA_PATH in #d=).
(() => {
"use strict";
const $ = s => document.querySelector(s), view = $("#view"), sheet = $("#sheet"), errBar = $("#err");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const POLL_S = 15;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const usd = v => v == null ? "–" : (Math.abs(v) >= 1e6 ? "$" + (v/1e6).toFixed(2) + "M" : Math.abs(v) >= 1e4 ? "$" + (v/1e3).toFixed(1) + "K" : "$" + Number(v).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}));
const px = v => v == null ? "–" : "$" + (v >= 1 ? v.toFixed(4) : v.toPrecision(4));
const tm = ts => new Date(ts * 1000).toLocaleTimeString([], {hour: "numeric", minute: "2-digit"});
const short = m => m ? m.slice(0, 4) + "..." + m.slice(-3) : "";

// ---- secret path from fragment -> localStorage; never sent anywhere ----
const frag = new URLSearchParams(location.hash.slice(1));
if (frag.get("d")) { localStorage.setItem("desk_d", frag.get("d")); history.replaceState(null, "", location.pathname + location.search); }
const DP = localStorage.getItem("desk_d");
let DIR = null, KEY = null;
async function sha(s) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
async function init() {
  if (!DP) return;
  DIR = Array.from(await sha("dir:" + DP)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
  KEY = await crypto.subtle.importKey("raw", await sha("key:" + DP), "AES-GCM", false, ["decrypt"]);
}
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function get(name) {
  const r = await fetch(`d/${DIR}/${name}?t=${Date.now()}`, {cache: "no-store"});
  if (!r.ok) throw Object.assign(new Error("http " + r.status), {status: r.status});
  const j = await r.json();
  const pt = await crypto.subtle.decrypt({name: "AES-GCM", iv: b64(j.iv)}, KEY, b64(j.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---- store ----
const S = {state: null, chart: null, activity: null, account: null, settings: null, decisions: null, lastOk: null, failing: false, retryIn: 0, range: "LIVE", tab: "home", prevPts: null, readPush: +localStorage.getItem("desk_read") || 0};
async function refresh() {
  try {
    const [st, ch, ac, acc, se, de] = await Promise.all(["state.json", "chart.json", "activity.json", "account.json", "settings.json", "decisions.json"].map(get));
    Object.assign(S, {state: st, chart: ch, activity: ac, account: acc, settings: se, decisions: de, lastOk: Date.now()});
    const stale = Date.now() / 1000 - st.updatedAt > (se.values["desk.publish_s"] * 2 + 120);
    S.failing = stale; S.staleSince = st.updatedAt;
  } catch (e) { S.failing = true; }
  S.retryIn = POLL_S; renderErr(); render();
}
function renderErr() {
  if (!S.failing && S.lastOk) { errBar.hidden = true; document.body.classList.remove("offline"); return; }
  if (!DP) { errBar.hidden = true; return; }
  const last = S.state ? tm(S.state.updatedAt) : "never";
  document.body.classList.add("offline"); errBar.hidden = false; errBar.textContent = `Desk offline · retrying in ${S.retryIn}s · last update ${last}`;
}
setInterval(() => { if (S.retryIn > 0) S.retryIn--; if (S.failing) renderErr(); if (S.retryIn === 0) refresh(); }, 1000);

// ---- odometer ----
function odo(el, text) {
  const old = el.dataset.v || "";
  if (reduce || !old || old.length !== text.length) { el.innerHTML = [...text].map(ch => /\d/.test(ch) ? `<span class="odo"><span style="transform:translateY(-${ch}0%)">${[...Array(10).keys()].join("<br>")}</span></span>` : `<span>${esc(ch)}</span>`).join(""); el.dataset.v = text; fixOdo(el, text, false); return; }
  el.dataset.v = text; fixOdo(el, text, true);
}
function fixOdo(el, text, anim) {
  const spans = [...el.children]; let k = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    const inner = spans[i].firstElementChild; if (!inner) continue;
    const d = +text[i]; inner.style.lineHeight = "1.05em";
    inner.style.transition = anim ? `transform 600ms cubic-bezier(.2,.8,.2,1) ${k * 30}ms` : "none";
    inner.style.transform = `translateY(-${d * 1.05}em)`; k++;
  }
}

// ---- routing ----
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b)); closeSheet(); render(); scrollTo(0, 0); });
function closeSheet() { sheet.hidden = true; sheet.innerHTML = ""; S.sheet = null; }
window.addEventListener("click", e => {
  const a = e.target.closest("[data-coin],[data-audit],[data-tab-go],[data-range],[data-back]");
  if (!a) return;
  if (a.dataset.back !== undefined) return closeSheet();
  if (a.dataset.range) { S.range = a.dataset.range; render(); return; }
  if (a.dataset.tabGo) { document.querySelector(`.tabs button[data-tab=${a.dataset.tabGo}]`).click(); return; }
  if (a.dataset.coin) openCoin(a.dataset.coin); else if (a.dataset.audit) openAudit(a.dataset.audit);
});

function render() {
  if (!DP) { view.innerHTML = `<div class="nav"><span class="title">Grok Bot</span></div><div class="card">Open this app once with the private link the desk gave you (it ends in <span class="mono">#d=…</span>). It is kept on this device only.</div>`; return; }
  if (!S.state) { view.innerHTML = skeleton(); return; }
  ({home, agents, activity, account})[S.tab]();
  if (S.sheet) S.sheet.refresh && S.sheet.refresh();
}
const skeleton = () => `<div class="nav"></div><div class="skel" style="height:72px;width:70%;margin:8px 0"></div><div class="skel" style="height:20px;width:40%"></div><div class="skel" style="height:220px;margin:16px 0"></div><div class="skel" style="height:320px"></div>`;
const paperBadge = () => S.state.mode === "PAPER" ? `<span class="pill paper">PAPER</span>` : "";

// ---- HOME ----
function home() {
  const st = S.state, unread = (st.pushes || []).some(p => p.ts > S.readPush);
  if (!view.querySelector("#home")) {
    view.innerHTML = `<div id="home"><div class="nav"><button class="avatar" data-tab-go="account">${esc((S.account.fomo_handle || "G")[0].toUpperCase())}</button><span class="title">Grok Bot ›</span>
      <button class="navbtn" id="bell" aria-label="Pushes">🔔<i class="dot" id="dot"></i></button></div>
      <input class="search" id="q" placeholder="Search name, symbol or mint" autocomplete="off"><div id="qres" class="list"></div>
      <div class="bal"><div class="big" id="bal"></div><span id="pb"></span></div>
      <div class="sub"><span id="today"></span><span class="pill mult" id="mult"></span></div>
      <canvas class="chart" id="line"></canvas>
      <div class="ranges">${["LIVE","1H","4H","1D","1W","ALL"].map(r => `<button data-range="${r}">${r}</button>`).join("")}</div>
      <h2><span id="agcount">Agents</span></h2><div class="carousel" id="cards"></div>
      <h2>Activity <button data-tab-go="activity">See all</button></h2><div class="list" id="act5"></div></div>`;
    $("#q").oninput = search; $("#bell").onclick = showPushes;
  }
  odo($("#bal"), "$" + st.balance.toFixed(2)); $("#pb").innerHTML = paperBadge();
  $("#today").className = st.todayPct >= 0 ? "up" : "down"; $("#today").textContent = (st.todayPct >= 0 ? "+" : "") + st.todayPct.toFixed(2) + "%";
  $("#mult").textContent = st.multiplier.toFixed(2) + "×"; $("#dot").hidden = !unread;
  document.querySelectorAll(".ranges button").forEach(b => b.classList.toggle("on", b.dataset.range === S.range));
  const ch = S.chart[S.range] || {points: [], marks: []};
  Charts.line($("#line"), ch, S.prevPts); S.prevPts = JSON.stringify(ch.points);
  const running = Object.values(st.agents).filter(a => !a.paused).length;
  $("#agcount").textContent = `Agents · ${running} running`;
  $("#cards").innerHTML = agentCards(st.agents);
  const ring = $("#ring"); if (ring) Charts.ring(ring, st.agents.analyst.last && st.agents.analyst.last.score, st.agents.analyst.minScore);
  $("#act5").innerHTML = actRows(S.activity.rows.slice(0, 5)) || `<div class="empty">Nothing yet tonight</div>`;
}
function search() {
  const q = $("#q").value.trim().toLowerCase(); const out = $("#qres");
  if (!q) { out.innerHTML = ""; return; }
  const seen = new Map();
  [...S.activity.rows, ...Object.values(S.decisions).flatMap(d => d.rows)].forEach(r => { if (r.mint && !seen.has(r.mint)) seen.set(r.mint, r.name || r.title || r.mint); });
  const hits = [...seen].filter(([m, n]) => m.toLowerCase().includes(q) || String(n).toLowerCase().includes(q)).slice(0, 6);
  out.innerHTML = hits.map(([m, n]) => `<a class="row" data-coin="${esc(m)}"><span class="ic">◎</span><span class="mid"><div class="t">${esc(n)}</div><div class="s mono">${esc(short(m))}</div></span></a>`).join("") || `<div class="empty">No coin matches</div>`;
}
function showPushes() {
  S.readPush = Date.now() / 1000; localStorage.setItem("desk_read", S.readPush);
  const ps = S.state.pushes || [];
  S.sheet = {}; sheet.hidden = false;
  sheet.innerHTML = `<div class="nav"><button class="back" data-back>‹ Back</button><span class="title">Pushes</span></div><div class="list">${ps.map(p => `<a class="row" href="${esc(p.url)}" target="_blank" rel="noopener"><span class="mid"><div class="s">Grok Bot · ${tm(p.ts)}</div><div class="t">${esc(p.text.split("\n")[0])}</div></span></a>`).join("") || `<div class="empty">Nothing yet tonight</div>`}</div>`;
}
function agentCards(a) {
  const sc = a.scanner, au = a.auditor, an = a.analyst, ex = a.executor, ri = a.risk;
  const strips = (au.last.layers || []);
  const layerStrips = [...Array(8).keys()].map(i => { const l = strips[i]; return `<i class="strip ${l ? (l.pass === 1 || l.pass === true ? "ok" : l.pass === 0 || l.pass === false ? "no" : "") : ""}"></i>`; }).join("");
  const red = strips.find(l => l.pass === 0 || l.pass === false);
  const auLine = !au.last.mint ? "No coin taken apart yet" : strips.length < 8 && !red ? "taking apart..." : red ? esc(red.value) : "8/8 → Executor";
  return `
  <div class="acard"><div class="h"><span style="color:var(--cyan)">Scanner</span><span class="sec">${sc.paused ? "paused" : "running"}</span></div>
    <div class="count">${sc.pools} pools</div><div class="feed">${sc.feed.length ? sc.feed.map(f => f.verdict === "kill" ? `<div class="r killed" data-coin="${esc(f.mint)}"><span class="n">${esc(f.name)}</span><span class="down">${esc(f.reason)}</span></div>` : `<div class="r" data-coin="${esc(f.mint)}"><span>${esc(f.name)} · liq ${usd(f.liq)}</span><span class="up">→ auditor</span></div>`).join("") : `<div class="sec">Listening for graduations</div>`}</div></div>
  <div class="acard"><div class="h"><span>Auditor</span><span class="sec">${au.rejected} rejected</span></div>
    <div class="count">${au.takenApart} taken apart</div><div class="strips">${layerStrips}</div><div ${au.last.mint ? `data-audit="${esc(au.last.mint)}"` : ""}>${esc(au.last.name || "")} ${auLine}</div></div>
  <div class="acard"><div class="h"><span style="color:var(--yellow)">Analyst${an.mode === "rules" ? " (rules)" : ""}</span><span class="sec">Scoring</span></div>
    <canvas class="ring" id="ring"></canvas><div>${an.last ? `${esc(an.last.name)} · ${an.last.pass ? "passed" : esc(an.last.reason)}` : `<span class="sec">No coin scored yet</span>`}</div><div class="sec">${an.scored} scored</div></div>
  <div class="acard"><div class="h"><span style="color:var(--green)">Executor</span><span class="sec">${ex.paused ? "paused" : "running"}</span></div>
    <div class="count">${ex.trades} trades</div>${ex.last ? `<div>${usd(ex.last.sizeUsd)} · ${ex.last.stackPct}% of stack</div><div class="bar"><i style="width:100%"></i></div><div class="up">✓ Filled</div>` : `<div class="sec">${ex.stackPct}% of stack per ticket</div>`}</div>
  <div class="acard"><div class="h"><span style="color:var(--pink)">Risk</span><span class="sec">${ri.open ? "Guarding" : "Idle"}</span></div>
    <div class="count">${ri.open} open</div><div>${ri.lastExit ? (ri.lastExit.reason === "trail" ? "Trailed out" : ri.lastExit.reason === "stop" ? "Stopped" : esc(ri.lastExit.reason)) + " · " + esc(ri.lastExit.name) : `<span class="sec">No exits yet</span>`}</div>
    <div style="display:flex;gap:8px"><span class="pill mono" style="background:rgba(255,69,58,.16);color:var(--red)">stop -${ri.stopPct}%</span><span class="pill mono" style="background:rgba(0,211,90,.16);color:var(--green)">trail ${ri.trailPct}%</span></div></div>`;
}
const ICON = {bought: ["＋", "var(--blue)"], sold: ["✓", "var(--green)"], stopped: ["↓", "var(--red)"], rejected: ["✕", "var(--t3)"]};
function actRows(rows) {
  return rows.map(r => `<a class="row" ${r.kind === "rejected" ? `data-audit="${esc(r.mint)}"` : `data-coin="${esc(r.mint)}"`}><span class="ic" style="color:${ICON[r.kind][1]}">${ICON[r.kind][0]}</span>
    <span class="mid"><div class="t">${esc(r.title)}</div><div class="s">${esc(r.subtitle)}</div></span><span class="v ${r.kind === "sold" && !String(r.value).startsWith("-") ? "up" : r.kind === "stopped" || String(r.value).startsWith("-") ? "down" : r.kind === "rejected" ? "sec" : ""}">${esc(r.value)}</span></a>`).join("");
}

// ---- AGENTS ----
function agents() {
  const a = S.state.agents, names = ["scanner", "auditor", "analyst", "executor", "risk"];
  const count = {scanner: a.scanner.pools, auditor: a.auditor.takenApart, analyst: a.analyst.scored, executor: a.executor.trades, risk: a.risk.open};
  view.innerHTML = `<div class="nav"><span class="title">Agents</span></div>` + names.map(n => `<div class="card">
    <div style="display:flex;align-items:center;gap:8px"><b style="flex:1;font-size:17px">${n[0].toUpperCase() + n.slice(1)}</b>
    <span style="width:8px;height:8px;border-radius:50%;background:${a[n].paused ? "var(--orange)" : a[n].alive ? "var(--green)" : "var(--red)"}"></span><span class="sec">${a[n].paused ? "paused" : "running"} · ${count[n]} today</span>
    <span class="switch ${a[n].paused ? "" : "on"}" title="Pause/resume via Telegram: pause ${n}${n === "risk" && a.risk.locked ? " (locked: position open)" : ""}"></span></div>
    <div class="s sec" style="margin:6px 0">Pause/resume: send “${a[n].paused ? "resume" : "pause"} ${n}” to your Telegram bot${n === "risk" && a.risk.locked ? " · locked while a position is open" : ""}.</div>
    <div class="list">${(S.decisions[n].rows || []).map(r => `<a class="row" href="${esc(r.coin_url)}" target="_blank" rel="noopener" style="min-height:44px"><span class="mid"><div class="t">${esc(r.name)}</div><div class="s">${tm(r.ts)} · ${esc(r.reason ?? "")}</div></span><span class="v ${/pass|bought|trail/.test(r.verdict) ? "up" : /kill|reject|stop|skip|miss/.test(r.verdict) ? "down" : "sec"}">${esc(r.verdict)}</span></a>`).join("") || `<div class="empty">${n === "scanner" ? "Listening for graduations" : "Nothing yet tonight"}</div>`}</div>
    <button class="sec" data-tab-go="account">Settings ›</button></div>`).join("");
}

// ---- ACTIVITY ----
function activity() { view.innerHTML = `<div class="nav"><span class="title">Activity</span></div><div class="list">${actRows(S.activity.rows) || `<div class="empty">Nothing yet tonight</div>`}</div>`; }

// ---- ACCOUNT ----
function account() {
  const acc = S.account, se = S.settings;
  const groups = {};
  Object.keys(se.values).forEach(k => { const g = k.split(".")[0] + (k.startsWith("analyst.rules") ? " (rules)" : ""); (groups[g] = groups[g] || []).push(k); });
  view.innerHTML = `<div class="nav"><span class="title">Account</span></div>
   <div class="card"><div class="seg"><button class="${acc.mode === "PAPER" ? "on" : ""}">PAPER</button><button class="${acc.mode === "LIVE" ? "on" : ""}">LIVE</button></div>
   <div class="s sec" style="margin-top:8px">Read-only on this hosting. Switch with “paper” / “live” (then type LIVE) in Telegram. LIVE needs 1 full PAPER night.</div>
   <div class="lrow"><span>Stack</span><span>${usd(acc.stack)}</span></div>${acc.ticket.message ? `<div class="s" style="color:${acc.ticket.level === "warn" ? "var(--red)" : "var(--orange)"}">${esc(acc.ticket.message)}</div>` : ""}</div>
   <div class="card list"><a class="row" href="${esc(acc.profile_url)}" target="_blank" rel="noopener"><span class="mid"><div class="t">Your FOMO profile</div><div class="s">@${esc(acc.fomo_handle)}</div></span>›</a>
   <a class="row" id="invite"><span class="mid"><div class="t">Invite a friend</div><div class="s" id="invs">10% off fees for life</div></span>›</a></div>
   <div class="card"><div class="lrow"><span>Telegram</span><span class="${acc.telegram ? "up" : "down"}">${acc.telegram ? "connected" : "not connected"}</span></div>
   <div class="s sec">Send test push: text “status” to your bot. ${esc(acc.webpush)}.</div></div>
   ${Object.entries(groups).map(([g, ks]) => `<div class="card"><b>${esc(g[0].toUpperCase() + g.slice(1))}</b>${ks.map(k => setRow(k, se.values[k], se.ranges[k])).join("")}</div>`).join("")}
   <div class="s sec" style="padding:0 0 20px">Settings change through Telegram here (“set stop to -8%”). Values shown are live from the desk.</div>`;
  $("#invite").onclick = async () => { const url = acc.signup_url; try { if (navigator.share) await navigator.share({url, title: "Join FOMO"}); else throw 0; } catch (e) { try { await navigator.clipboard.writeText(url); $("#invs").textContent = "Link copied"; } catch (_) {} } };
}
function setRow(k, v, r) {
  const label = k.split(".").pop().replace(/_/g, " ");
  if (typeof v === "number" && typeof r[0] === "number") return `<div class="set"><div class="l"><span>${esc(label)}</span><input type="number" value="${v}" disabled></div><input type="range" min="${r[0]}" max="${r[1]}" step="any" value="${v}" disabled></div>`;
  if (typeof v === "boolean") return `<div class="set"><div class="l"><span>${esc(label)}</span><span class="switch ${v ? "on" : ""}"></span></div></div>`;
  return `<div class="set"><div class="l"><span>${esc(label)}</span><input type="text" value="${esc(v)}" disabled></div></div>`;
}

// ---- COIN SCREEN ----
async function openCoin(mint) {
  S.sheet = {refresh: () => openCoin(mint)}; sheet.hidden = false;
  if (!sheet.innerHTML) sheet.innerHTML = `<div class="nav"><button class="back" data-back>‹ Back</button></div><div class="skel" style="height:60px"></div><div class="skel" style="height:240px;margin-top:12px"></div>`;
  let c; try { c = await get(`coin/${mint}.json`); } catch (e) {
    if (S.coinShown === mint && sheet.querySelector("#cdl")) return;   // offline: keep the last good numbers
    sheet.innerHTML = `<div class="nav"><button class="back" data-back>‹ Back</button></div><div class="empty">This coin isn't in the latest desk update.</div>`; return; }
  const p = c.position && !c.position.closed_at ? c.position : null;
  const ageH = c.migratedAt ? Math.floor((Date.now() / 1000 - c.migratedAt) / 3600) : null;
  const since = p && c.price ? (c.price / p.entry_price - 1) * 100 : null;
  S.coinShown = mint;
  sheet.innerHTML = `<div class="nav"><button class="back" data-back>‹ Back</button><span class="title"></span>${paperBadge()}</div>
    <h2 style="margin-top:4px">${esc(c.name || short(mint))}<span class="chip" data-audit="${esc(mint)}">🛡 ${esc(c.shield)}</span></h2>
    <div class="sec">${esc(c.symbol || "")} · Solana · ${ageH == null ? "–" : ageH < 1 ? Math.floor((Date.now()/1000 - c.migratedAt)/60) + "m" : ageH + "h"} old</div>
    <div class="big" style="font-size:44px;margin-top:8px">${px(c.price)}</div>
    ${since != null ? `<div class="${since >= 0 ? "up" : "down"}">${since >= 0 ? "▲" : "▼"} ${Math.abs(since).toFixed(2)}% since entry</div>` : ""}
    <canvas class="chart" id="cdl" style="height:240px;margin:12px 0"></canvas>
    <div class="stats"><div><span class="sec">Market cap</span><b>${usd(c.stats.marketCap)}</b></div><div><span class="sec">Liquidity</span><b>${usd(c.stats.liquidity)}</b></div>
    <div><span class="sec">24h volume</span><b>${usd(c.stats.volume24h)}</b></div><div><span class="sec">Holders</span><b>${c.stats.holders ?? "n/a"}</b></div></div>
    ${p ? `<h2>Your position</h2><div class="card"><div>${usd(p.size_usd)} in · Executor</div>
      <div class="lrow"><span class="down">Stop -${p.stop_pct}%</span><span>${px(c.exit.stop)}</span></div>
      <div class="lrow"><span class="up">Trail</span><span>${c.exit.trail ? px(c.exit.trail) : `starts at +${S.settings.values["risk.trail_start_pct"]}%`}</span></div>
      <div class="lrow"><span>Time left to timeout</span><span>${Math.max(0, Math.round((c.exit.timeoutAt - Date.now()/1000) / 60))}m</span></div></div>` : ""}
    <a class="cta ${p ? "sell" : ""}" href="${esc(c.coin_url)}" target="_blank" rel="noopener">${p ? "Sell on FOMO" : "Buy on FOMO"}</a>`;
  Charts.candles($("#cdl"), c.candles, c.exit && c.exit.line);
}

// ---- AUDITOR SCREEN ----
async function openAudit(mint) {
  S.sheet = {}; sheet.hidden = false;
  sheet.innerHTML = `<div class="nav"><button class="back" data-back>‹ Back</button></div><div class="skel" style="height:220px"></div>`;
  let a; try { a = await get(`audit/${mint}.json`); } catch (e) { a = null; }
  if (!a || !a.layers.length) { sheet.innerHTML = `<div class="nav"><button class="back" data-back>‹ Back</button></div><div class="empty">No coin taken apart yet</div>`; return; }
  const name = esc(a.name);
  sheet.innerHTML = `<div class="nav"><button class="back" data-back>‹ Back</button><span class="title">Auditor</span></div><h2>${name}</h2>
    <div class="discs">${a.layers.map(l => `<div class="disc" data-n="${l.n}"></div>`).join("")}</div>
    <div class="list">${a.layers.map(l => `<div class="lrow" data-row="${l.n}"><span><span class="st"></span> ${l.n} ${esc(l.name)}</span><span class="sec">…</span></div>`).join("")}</div>
    <div class="card" id="verdict" style="margin-top:12px" hidden></div>
    <div class="lrow"><span>Take apart before buying</span><span class="switch ${a.enabled ? "on" : ""}" title="Change with Telegram: set auditor.enabled to false"></span></div>
    <a class="cta" href="${esc(a.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>`;
  const show = l => { const d = sheet.querySelector(`.disc[data-n="${l.n}"]`), r = sheet.querySelector(`[data-row="${l.n}"]`);
    d.className = "disc " + (l.pass === true ? "ok" : l.pass === false ? "no" : ""); r.querySelector(".st").textContent = l.pass === true ? "✓" : l.pass === false ? "✕" : "·";
    r.lastElementChild.textContent = l.value; r.lastElementChild.className = l.pass === false ? "down" : l.pass === null ? "ter" : ""; };
  for (const l of a.layers) {           // beam reads only layers the server sent
    if (!reduce && l.pass !== null) { sheet.querySelector(`.disc[data-n="${l.n}"]`).className = "disc beam"; await new Promise(r => setTimeout(r, 350)); await new Promise(r => setTimeout(r, 150)); }
    show(l);
  }
  const v = $("#verdict"); v.hidden = false;
  v.innerHTML = a.passed ? `<b class="up">Cleared · 8/8 parts</b><div>${a.sentUsd ? "Sent to Executor · " + usd(a.sentUsd) : "Sent to Executor"}</div>` : `<b class="down">Rejected · ${esc(a.reason)}</b><div class="sec">Grok Bot won't buy ${name}</div>`;
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
init().then(() => { render(); if (DP) refresh(); });
})();
