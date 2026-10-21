import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import * as CONFIG from "./config.js?v=202610212300";
const { SUPABASE_URL, SUPABASE_ANON_KEY } = CONFIG;
import { t, lang, locale, setLang, errText, dec, SYN, TYPES } from "./i18n.js?v=202610212300";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ───────────── state ───────────── */
const S = {
  session: null, member: null, org: null,
  stores: [], products: [], inv: new Map(), sales: [], people: new Map(),
  storeId: null, q: "", type: "all", open: null, view: "loading",
  pending: new Map(), timers: new Map(), sale: null, channel: null,
  employees: [], empTableMissing: false, busyLogin: false, redraw: null,
};
try { S.storeId = localStorage.getItem("storeId"); } catch (_) {}
/* catalog code: from a shared link (?c=xxxx), remembered on this device, or CATALOG_CODE in config.js
   (then anyone opening the main link sees the products first) */
S.catalog = new URLSearchParams(location.search).get("c");
try { if (S.catalog) localStorage.setItem("catalog", S.catalog); else S.catalog = localStorage.getItem("catalog"); } catch (_) {}
S.catalog ||= CONFIG.CATALOG_CODE || null;

/* ───────────── helpers ───────────── */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(Number(n) || 0);
const key = (pid, sid) => pid + ":" + sid;
const qtyOf = (pid, sid) => (S.inv.get(key(pid, sid)) || 0) + (S.pending.get(key(pid, sid)) || 0);
const product = (id) => S.products.find((p) => p.id === id);
const store = (id) => S.stores.find((s) => s.id === id);
const photoUrl = (p) => (p?.photo_path ? `${SUPABASE_URL}/storage/v1/object/public/product-photos/${p.photo_path}` : "");
/* no photo: an icon for the kind of accessory plus a short model code (16PM, S24, 20W) */
const thumb = (p, cls = "thumb") => photoUrl(p)
  ? `<img class="${cls}" src="${esc(photoUrl(p))}" alt="" loading="lazy">`
  : `<span class="${cls} ph" aria-hidden="true">${ICON[typeOf(p)]}${modelCode(p?.name) ? `<span class="code">${esc(modelCode(p.name))}</span>` : ""}</span>`;
const isOwner = () => S.member?.role === "owner";
const time = (iso) => new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
const left = (n) => (n ? t("nLeft", { n }) : t("soldOut"));
const localErr = (k) => Object.assign(new Error(t(k)), { local: true });
function toast(msg) {
  $("#toastRoot").innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(S.toastT); S.toastT = setTimeout(() => ($("#toastRoot").innerHTML = ""), 2800);
}
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
function setStore(id) {
  S.storeId = id; S.q = "";
  try { id ? localStorage.setItem("storeId", id) : localStorage.removeItem("storeId"); } catch (_) {}
}
/* ───────────── finding items ─────────────
   Search ignores case and accents, understands Spanish words for each kind of accessory
   (funda = case, mica = glass…, see SYN in i18n.js) and short model names (16pm = 16 pro max). */
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const tokens = (name) => norm(name).split(/[^a-z0-9+]+/).filter(Boolean);
const SHORT = [[/(\d+)\s*(pm|promax)\b/g, "$1 pro max"], [/\bpromax\b/g, "pro max"]];
function queryWords(q) {
  let s = norm(q);
  for (const [re, to] of SHORT) s = s.replace(re, to);
  return s.split(/[\s,]+/).filter(Boolean);
}
function typeOf(p) {
  for (const tk of tokens(p?.name)) for (const ty of TYPES) if (SYN[ty].includes(tk)) return ty;
  return "other";
}
function matches(p, words) {
  const n = norm(p.name), tk = tokens(p.name);
  return words.every((w) => n.includes(w) || (w.length >= 3 && Object.values(SYN).some((g) =>
    g.some((s) => s.startsWith(w)) && g.some((s) => tk.includes(s)))));
}
const findItems = (items, q, type = "all") => {
  const words = queryWords(q);
  return items.filter((p) => (type === "all" || typeOf(p) === type) && matches(p, words));
};
function modelCode(name) {
  const parts = String(name ?? "").split(/\s+/), i = parts.findIndex((w) => /\d/.test(w));
  if (i < 0) return "";
  const suf = { pro: "P", max: "M", plus: "+", ultra: "U", mini: "m" };
  let code = parts[i].toUpperCase();
  for (const w of parts.slice(i + 1)) { const s = suf[norm(w)]; if (!s) break; code += s; }
  return code.slice(0, 5);
}
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  case: svg('<rect x="6" y="2.5" width="12" height="19" rx="3"/><circle cx="14.5" cy="6.2" r="1.2"/>'),
  glass: svg('<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M9.5 10l5-5M9.5 15l5-5"/>'),
  charger: svg('<path d="M9.5 2.5v4M14.5 2.5v4"/><rect x="6.5" y="6.5" width="11" height="9" rx="2"/><path d="M12 15.5v6"/>'),
  cable: svg('<rect x="9" y="2.5" width="6" height="6" rx="1"/><path d="M12 8.5v3.5c0 4-5 3-5 7v2.5"/>'),
  other: svg('<path d="M3.5 12V4.5h7.5l9.5 9.5-7 7z"/><circle cx="7.8" cy="8.5" r="1.3"/>'),
};
/* type chips: only the kinds this business actually has; none when everything is one kind */
function chips(items, current, act) {
  const present = [...TYPES, "other"].filter((ty) => items.some((p) => typeOf(p) === ty));
  if (present.length < 2) return "";
  return `<div class="chips" role="group" aria-label="${t("filterLabel")}">${["all", ...present].map((ty) =>
    `<button type="button" class="chip" data-act="${act}" data-type="${ty}" aria-pressed="${ty === current}">${t("ty_" + ty)}</button>`).join("")}</div>`;
}
const noMatch = (q, type, act) => `<div class="empty">${q.trim() ? t("noMatchQ", { q: esc(q.trim()) }) : t("noMatch")}
  ${type !== "all" || q.trim() ? `<br><button type="button" class="link" data-act="${act}">${t("showAll")}</button>` : ""}</div>`;

/* EN / ES switch, shown on sign-in, store picker, settings and the catalog */
const langSwitch = () => `<div class="langs" role="group" aria-label="${t("langLabel")}">
  <button type="button" data-act="lang" data-lang="en" lang="en" aria-pressed="${lang === "en"}">English</button>
  <button type="button" data-act="lang" data-lang="es" lang="es" aria-pressed="${lang === "es"}">Español</button></div>`;
function labelBar() {
  $("#bar .sell").textContent = t("sell");
  $("#bar [data-act=add]").textContent = t("add");
}

/* ───────────── data ───────────── */
async function loadMembership() {
  const { data, error } = await sb.from("members").select("org_id, role, display_name, orgs(*)")
    .eq("user_id", S.session.user.id).order("created_at", { ascending: true }).limit(1);
  if (error) throw error;
  S.member = data?.[0] || null;
  S.org = S.member?.orgs || null;
  if (S.org?.catalog_code) { S.catalog = S.org.catalog_code; try { localStorage.setItem("catalog", S.catalog); } catch (_) {} }
}
async function loadAll() {
  const org = S.org.id;
  const [st, pr, inv, mem] = await Promise.all([
    sb.from("stores").select("*").eq("org_id", org).order("created_at"),
    sb.from("products").select("*").eq("org_id", org).order("name"),
    sb.from("inventory").select("product_id, store_id, qty").eq("org_id", org),
    sb.from("members").select("user_id, display_name, role").eq("org_id", org),
  ]);
  for (const r of [st, pr, inv, mem]) if (r.error) throw r.error;
  S.stores = st.data; S.products = pr.data;
  S.inv = new Map(inv.data.map((r) => [key(r.product_id, r.store_id), r.qty]));
  S.people = new Map(mem.data.map((m) => [m.user_id, m.display_name]));
  if (S.storeId && !store(S.storeId)) setStore(null);
  if (S.member.role === "owner") {
    let r;
    for (const cols of ["id, login_id, name, active, created_at, last_login_at, pin_code", "id, login_id, name, active, created_at, last_login_at", "id, login_id, name, active, created_at"]) {
      r = await sb.from("employees").select(cols).eq("org_id", org).order("name");
      if (!r.error) break;
    }
    S.employees = r.data || []; S.empTableMissing = !!r.error;
  }
  await loadSales();
}
async function loadSales() {
  if (!S.storeId) { S.sales = []; return; }
  const { data, error } = await sb.from("sales").select("*").eq("store_id", S.storeId)
    .gte("created_at", startOfToday()).order("created_at", { ascending: false });
  if (!error) S.sales = data;
}
function listenLive() {
  if (S.channel) sb.removeChannel(S.channel);
  const f = `org_id=eq.${S.org.id}`;
  let timer;
  const refresh = () => { clearTimeout(timer); timer = setTimeout(async () => { try { await loadAll(); if (S.view !== "settings" && S.view !== "employees") render(); } catch (_) {} }, 400); };
  S.channel = sb.channel("org-" + S.org.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "inventory", filter: f }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: f }, refresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: f }, refresh)
    .subscribe();
}

/* ───────────── routing ───────────── */
async function route() {
  $("#bar").hidden = true;
  if (!S.session) return S.catalog ? renderCatalog() : renderAuth();
  try {
    await loadMembership();
    if (!S.member && S.session.user.is_anonymous) { await sb.auth.signOut(); return renderAuth("emp", t("accessChanged")); }
    if (!S.member) return renderOnboarding();
    await loadAll();
    listenLive();
  } catch (e) {
    S.redraw = route;
    $("#app").innerHTML = `<div class="card"><h2>${t("cantConnect")}</h2><p class="muted">${esc(errText(e))}</p><button class="btn" data-act="retry">${t("tryAgain")}</button></div>`;
    return;
  }
  render();
}
function render() {
  S.redraw = render;
  if (S.view === "settings") return renderSettings();
  if (S.view === "employees") return renderEmployees();
  if (!S.storeId) return renderPicker();
  renderStore();
}

/* ───────────── sign in ───────────── */
function renderAuth(mode = "emp", msg = "") {
  S.redraw = () => renderAuth(mode);
  if (mode === "emp") {
    $("#app").innerHTML = `
      <div><span class="eyebrow">${t("appName")}</span><h1>${t("empTitle")}</h1></div>
      <form class="card" id="empForm" novalidate>
        <label>${t("signInId")}<input id="e-id" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" placeholder="maria"></label>
        <label>${t("codePin")}<input id="e-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" placeholder="••••"></label>
        <p class="err" id="a-err" role="alert">${esc(msg)}</p>
        <button class="btn wide" type="submit">${t("signIn")}</button>
      </form>
      <button class="link" data-act="toSignIn">${t("imOwner")}</button>
      ${S.catalog ? `<button class="link" data-act="toCatalog">${t("backToCatalog")}</button>` : ""}
      ${langSwitch()}`;
    return;
  }
  $("#app").innerHTML = `
    <div><span class="eyebrow">${t("owner")}</span><h1>${mode === "in" ? t("ownerSignIn") : t("createOwner")}</h1></div>
    <form class="card" id="authForm" data-mode="${mode}" novalidate>
      <label>${t("email")}<input id="a-email" type="email" autocomplete="email" inputmode="email" required></label>
      <label>${t("password")}<input id="a-pass" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}" minlength="6" required></label>
      <p class="err" id="a-err" role="alert">${esc(msg)}</p>
      <button class="btn wide" type="submit">${mode === "in" ? t("signIn") : t("createAccount")}</button>
    </form>
    <button class="link" data-act="${mode === "in" ? "toSignUp" : "toSignIn"}">${mode === "in" ? t("newOwner") : t("haveAccount")}</button>
    <button class="link" data-act="toEmp">${t("empLink")}</button>
    ${S.catalog ? `<button class="link" data-act="toCatalog">${t("backToCatalog")}</button>` : ""}
    ${langSwitch()}`;
}
async function submitAuth(form) {
  const email = $("#a-email").value.trim(), password = $("#a-pass").value, mode = form.dataset.mode;
  if (!email || password.length < 6) { $("#a-err").textContent = t("errEmailPass"); return; }
  form.querySelector("[type=submit]").disabled = true;
  const { data, error } = mode === "in"
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });
  form.querySelector("[type=submit]").disabled = false;
  if (error) { $("#a-err").textContent = errText(error); return; }
  if (mode === "up" && !data.session) renderAuth("in", t("checkEmail"));
}
async function submitEmp(form) {
  const id = $("#e-id").value.trim(), pin = $("#e-pin").value.trim();
  if (!id || !pin) { $("#a-err").textContent = t("errIdCode"); return; }
  const btn = form.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = t("signingIn");
  S.busyLogin = true;
  try {
    if (!S.session) { const { data, error } = await sb.auth.signInAnonymously(); if (error) throw error; S.session = data.session; }
    const { error } = await sb.rpc("employee_login", { p_login: id, p_pin: pin });
    if (error) { await sb.auth.signOut(); S.session = null; throw error; }
    S.busyLogin = false; $("#app").innerHTML = ""; route();
  } catch (e) {
    S.busyLogin = false;
    $("#a-err").textContent = /anonymous/i.test(e?.message || "") ? t("empOff") : errText(e);
    btn.disabled = false; btn.textContent = t("signIn");
  }
}

/* ───────────── public catalog (no login) ───────────── */
async function renderCatalog() {
  S.redraw = renderCatalog;
  $("#bar").hidden = true;
  $("#app").innerHTML = `<div class="empty">${t("loading")}</div>`;
  const { data, error } = await sb.rpc("get_catalog", { p_code: S.catalog });
  if (S.session) return;                          // signed in while loading
  if (error || !data) {
    if (!error) { try { localStorage.removeItem("catalog"); } catch (_) {} S.catalog = null; }
    return renderAuth();
  }
  S.cat = data; S.catQ = "";
  $("#app").innerHTML = `
    <div class="cathead"><div style="min-width:0"><span class="eyebrow">${t("accessories")}</span><h1>${esc(data.business)}</h1>
      ${data.stores.length ? `<p class="muted" style="font-size:14px">${data.stores.map(esc).join(" · ")}</p>` : ""}</div>
      <button class="btn ghost" data-act="toEmp">${t("staffSignIn")}</button></div>
    <input id="cq" type="search" placeholder="${t("catSearch")}" aria-label="${t("catSearch")}" autocomplete="off">
    <div class="catgrid" id="cgrid"></div>
    <p class="muted" style="font-size:13px;text-align:center">${t("askUs")}</p>
    ${langSwitch()}`;
  $("#cq").addEventListener("input", (e) => { S.catQ = e.target.value; drawCatalog(); });
  drawCatalog();
}
function drawCatalog() {
  const items = findItems(S.cat.items, S.catQ)
    .sort((a, b) => (b.in_stock - a.in_stock) || a.name.localeCompare(b.name, locale));
  $("#cgrid").innerHTML = items.length ? items.map((p) => `<div class="citem ${p.in_stock ? "" : "out"}">
      ${thumb(p, "cimg")}
      <div class="cbody"><b>${esc(p.name)}</b>
        <div class="cmeta">${p.price != null ? `<span class="price">${money(p.price)}</span>` : ""}
        <span class="avail">${p.in_stock ? t("available") : t("soldOutCat")}</span></div></div></div>`).join("")
    : `<div class="empty" style="grid-column:1/-1">${S.catQ.trim() ? t("noMatchQ", { q: esc(S.catQ.trim()) }) : t("noMatch")}</div>`;
}

/* ───────────── first-time setup ───────────── */
function renderOnboarding() {
  S.redraw = renderOnboarding;
  $("#app").innerHTML = `
    <div><span class="eyebrow">${t("welcome")}</span><h1>${t("setupTitle")}</h1></div>
    <form class="card" id="orgForm" novalidate>
      <h3>${t("iOwn")}</h3>
      <label>${t("businessName")}<input id="o-name" placeholder="Barajas Wireless"></label>
      <label>${t("yourName")}<input id="o-you" placeholder="Johan"></label>
      <div class="stack" id="o-stores">
        <label>${t("storeN", { n: 1 })}<input class="o-store" placeholder="1087 Southern Blvd"></label>
        <label>${t("storeN", { n: 2 })}<input class="o-store" placeholder="116 E Fordham Rd"></label>
      </div>
      <button type="button" class="link" data-act="addStoreField">${t("addStoreField")}</button>
      <p class="err" id="o-err" role="alert"></p>
      <button class="btn wide" type="submit">${t("create")}</button>
    </form>
    <p class="muted">${t("empNoAccount")}</p>
    <button class="link" data-act="signOut">${t("signOut")}</button>
    ${langSwitch()}`;
}
async function submitOrg() {
  const name = $("#o-name").value.trim(), you = $("#o-you").value.trim();
  const stores = [...document.querySelectorAll(".o-store")].map((i) => i.value.trim()).filter(Boolean);
  if (!name) return ($("#o-err").textContent = t("errBizName"));
  if (!stores.length) return ($("#o-err").textContent = t("errOneStore"));
  if (S.creatingOrg) return;                       // ignore double taps
  S.creatingOrg = true;
  const btn = $("#orgForm [type=submit]"); btn.disabled = true; btn.textContent = t("creating");
  const { error } = await sb.rpc("create_org", { p_name: name, p_stores: stores, p_display_name: you });
  S.creatingOrg = false;
  if (error) { btn.disabled = false; btn.textContent = t("create"); return ($("#o-err").textContent = errText(error)); }
  route();
}

/* ───────────── store picker & settings ───────────── */
function renderPicker() {
  $("#bar").hidden = true;
  const units = (sid) => S.products.reduce((a, p) => a + qtyOf(p.id, sid), 0);
  const low = (sid) => S.products.filter((p) => qtyOf(p.id, sid) < p.low_stock_threshold).length;
  $("#app").innerHTML = `
    <div><span class="eyebrow">${esc(S.org.name)}</span><h1>${t("whichStore")}</h1></div>
    <div class="stack">${S.stores.map((s) => `
      <button class="store" data-store="${s.id}"><span><b>${esc(s.name)}</b>
      <span class="sub">${t("units", { n: units(s.id) })}${low(s.id) ? ` · <span style="color:var(--bad)">${t("toReorder", { n: low(s.id) })}</span>` : ""}</span></span><span class="arrow">→</span></button>`).join("")}
    </div>
    <button class="link" data-act="settings">${isOwner() ? t("settingsLink") : t("account")}</button>
    <button class="btn ghost wide" data-act="signOut">${S.member?.display_name ? t("logOutName", { name: esc(S.member.display_name) }) : t("logOut")}</button>
    ${langSwitch()}`;
}
function renderSettings() {
  $("#bar").hidden = true;
  $("#app").innerHTML = `
    <div class="line" style="display:flex;justify-content:space-between;align-items:center"><h1>${isOwner() ? t("settings") : t("account")}</h1><button class="link" data-act="back">${t("done")}</button></div>
    ${isOwner() ? `
    <button class="store" data-act="employees"><span><b>${t("employees")}</b><span class="sub">${S.empTableMissing ? t("runEmpSql") : t("empCount", { n: S.employees.length })}</span></span><span class="arrow">→</span></button>
    <form class="card" id="storesForm" novalidate><h3>${t("stores")}</h3>
      ${S.stores.map((s) => `<label>${t("store")}<input data-sid="${s.id}" value="${esc(s.name)}"></label>`).join("")}
      <label>${t("addStore")}<input id="newStore" placeholder="${t("newStorePh")}"></label>
      <button class="btn" type="submit">${t("saveStores")}</button></form>
` : ""}
    ${isOwner() ? (S.org.catalog_code ? `<div class="card"><h3>${t("catalogTitle")}</h3>
      <p class="muted">${t("catalogNote")}</p>
      <div class="linkbox num" id="catLink">${esc(location.origin + location.pathname + "?c=" + S.org.catalog_code)}</div>
      <div class="grid2"><button class="btn" data-act="copyCat">${t("copyLink")}</button><a class="btn ghost" style="text-align:center;text-decoration:none;display:grid;place-items:center" href="?c=${esc(S.org.catalog_code)}" target="_blank" rel="noopener">${t("open")}</a></div></div>`
      : `<div class="card"><h3>${t("catalogTitle")}</h3><p class="err">${t("runCatSql")}</p></div>`) : ""}
    <div class="card"><h3>${t("langLabel")}</h3>${langSwitch()}</div>
    <div class="card"><p class="muted">${t("signedInAs", { who: esc(S.session.user.email || S.member.display_name) })}</p><button class="btn ghost" data-act="signOut">${t("signOut")}</button></div>`;
}
/* ───────────── employees (owner) ───────────── */
async function loadEmpStats() {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  let r = await sb.from("sales").select("employee_id, seller_name, qty, unit_price, created_at").eq("org_id", S.org.id).gte("created_at", since);
  if (r.error) r = await sb.from("sales").select("seller_name, qty, unit_price, created_at").eq("org_id", S.org.id).gte("created_at", since);
  S.empSales = r.data || [];
}
function empStats(e) {
  const today = startOfToday();
  const mine = S.empSales.filter((x) => x.employee_id ? x.employee_id === e.id : x.seller_name === e.name);
  const sum = (arr) => ({ n: arr.reduce((a, x) => a + x.qty, 0), t: arr.reduce((a, x) => a + x.qty * x.unit_price, 0) });
  return { week: sum(mine), today: sum(mine.filter((x) => x.created_at >= today)) };
}
function when(iso) {
  if (!iso) return t("never");
  const d = new Date(iso), td = new Date(); td.setHours(0, 0, 0, 0);
  const day = d >= td ? t("today") : d >= new Date(td - 864e5) ? t("yesterday") : d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  return `${day}, ${time(iso)}`;
}
async function renderEmployees() {
  $("#bar").hidden = true;
  if (!S.empSales) { $("#app").innerHTML = `<div class="empty">${t("loading")}</div>`; await loadEmpStats(); if (S.view !== "employees") return; }
  const E = S.employees, active = E.filter((e) => e.active).length;
  const team = E.reduce((a, e) => { const st = empStats(e).week; return { n: a.n + st.n, t: a.t + st.t }; }, { n: 0, t: 0 });
  $("#app").innerHTML = `
    <div class="line" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h1>${t("employees")}</h1><button class="link" data-act="back">${t("done")}</button></div>
    ${S.empTableMissing ? `<div class="card"><p class="err">${t("runEmpSql")}</p></div>` : `
    <div class="empsum"><div class="sumbox"><span>${t("employees")}</span><b>${E.length}</b></div><div class="sumbox"><span>${t("canSignIn")}</span><b>${active}</b></div>
      <div class="sumbox"><span>${t("teamSales7")}</span><b>${money(team.t)}</b></div></div>
    <details class="card addemp" ${E.length ? "" : "open"}><summary><b>${t("addEmployee")}</b></summary>
      <form id="empAddForm" class="stack" novalidate>
        <label>${t("name")}<input id="n-name" placeholder="Maria Lopez"></label>
        <div class="grid2"><label>${t("signInIdUser")}<input id="n-id" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="${t("idPh")}"></label>
        <label>${t("codePin46")}<input id="n-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="1234"></label></div>
        <p class="muted" style="font-size:13px">${t("empHowTo")}</p>
        <p class="err" id="n-err" role="alert"></p>
        <button class="btn" type="submit">${t("addEmployeeBtn")}</button></form></details>
    ${E.length ? E.map((e) => { const st = empStats(e); return `<div class="card empcard">
      <div class="emphead"><div style="min-width:0"><h3>${esc(e.name)}</h3></div>
        <span class="pill ${e.active ? "on" : "off"}">${e.active ? t("active") : t("accessOff")}</span></div>
      <dl class="facts">
        <div><dt>${t("signInId")}</dt><dd class="num">${esc(e.login_id)}</dd></div>
        <div><dt>${t("codePin")}</dt><dd class="num">${e.pin_code ? `<b class="pin">${esc(e.pin_code)}</b>` : `<span class="muted" style="font-family:var(--f-body);font-size:13px">${t("pinHidden")}</span>`}</dd></div>
        <div><dt>${t("addedOn")}</dt><dd>${e.created_at ? new Date(e.created_at).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" }) : "—"}</dd></div>
        <div><dt>${t("lastSignIn")}</dt><dd>${"last_login_at" in e ? when(e.last_login_at) : "—"}</dd></div>
        <div><dt>${t("salesToday")}</dt><dd>${st.today.n} · ${money(st.today.t)}</dd></div>
        <div><dt>${t("sales7")}</dt><dd>${st.week.n} · ${money(st.week.t)}</dd></div>
      </dl>
      <div class="grid2"><button class="btn ghost" data-act="editEmp" data-id="${e.id}">${t("edit")}</button>
        <button class="btn ghost danger-text" data-act="askDelEmpInline" data-id="${e.id}">${t("remove")}</button></div>
      <div id="del-${e.id}"></div></div>`; }).join("") : `<div class="empty">${t("noEmployees")}</div>`}
    <p class="muted" style="font-size:13px">${t("codesPrivate")}</p>`}`;
}
async function submitEmpAdd() {
  const name = $("#n-name").value.trim(), id = $("#n-id").value.trim().toLowerCase(), pin = $("#n-pin").value.trim();
  if (!name) return ($("#n-err").textContent = t("errEmpName"));
  if (!/^[a-z0-9._-]{3,20}$/.test(id)) return ($("#n-err").textContent = t("errId"));
  if (!/^[0-9]{4,6}$/.test(pin)) return ($("#n-err").textContent = t("errCode"));
  const { error } = await sb.rpc("add_employee", { p_login: id, p_name: name, p_pin: pin });
  if (error) return ($("#n-err").textContent = errText(error));
  await loadAll(); render();
  toast(t("empCanSignIn", { name, id, pin }));
}
function openEmp(id) {
  const e = S.employees.find((x) => x.id === id); if (!e) return;
  $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><form class="sheet" id="empEditForm" data-id="${e.id}" novalidate>
    <h2>${t("editEmployee")}</h2>
    <label>${t("name")}<input id="m-name" value="${esc(e.name)}"></label>
    <label>${t("signInIdUser")}<input id="m-login" value="${esc(e.login_id)}" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
    <label>${t("codePin")}<input id="m-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" value="${esc(e.pin_code || "")}" placeholder="${e.pin_code ? "" : t("pinPh")}"></label>
    <label class="check"><input id="m-active" type="checkbox" ${e.active ? "checked" : ""}> ${t("canSignInOne")}</label>
    <p class="muted" style="font-size:13px">${t("changeSignsOut")}</p>
    <p class="err" id="m-err" role="alert"></p><div id="delZone"></div>
    <div class="foot"><button type="button" class="btn ghost danger-text" data-act="askDelEmp" data-id="${e.id}">${t("remove")}</button>
      <span class="right"><button type="button" class="btn ghost" data-act="close">${t("cancel")}</button><button class="btn" type="submit">${t("save")}</button></span></div>
  </form></div>`;
}
async function submitEmpEdit(form) {
  const id = form.dataset.id, e = S.employees.find((x) => x.id === id);
  const name = $("#m-name").value.trim(), login = $("#m-login").value.trim().toLowerCase(), active = $("#m-active").checked;
  const typed = $("#m-pin").value.trim(), pin = typed && typed !== e.pin_code ? typed : "";
  if (!name) return ($("#m-err").textContent = t("errEmpName"));
  if (!/^[a-z0-9._-]{3,20}$/.test(login)) return ($("#m-err").textContent = t("errLogin"));
  if (pin && !/^[0-9]{4,6}$/.test(pin)) return ($("#m-err").textContent = t("errCode"));
  let { error } = await sb.rpc("edit_employee", { p_id: id, p_name: name, p_login: login, p_pin: pin || null, p_active: active });
  if (error && /edit_employee|function/i.test(error.message || "")) {
    if (login !== e.login_id) return ($("#m-err").textContent = t("needSql006"));
    ({ error } = await sb.rpc("update_employee", { p_id: id, p_name: name, p_pin: pin || null, p_active: active }));
  }
  if (error) return ($("#m-err").textContent = errText(error));
  closeSheet(); await loadAll(); render();
  toast(pin ? t("empSavedPin", { name, login, pin }) : t("empSaved", { name, login }));
}
async function submitStores() {
  try {
    for (const i of document.querySelectorAll("[data-sid]")) {
      const s = store(i.dataset.sid), v = i.value.trim();
      if (s && v && v !== s.name) { const { error } = await sb.from("stores").update({ name: v }).eq("id", s.id); if (error) throw error; }
    }
    const n = $("#newStore").value.trim();
    if (n) { const { error } = await sb.from("stores").insert({ org_id: S.org.id, name: n }); if (error) throw error; }
    await loadAll(); toast(t("storesSaved")); renderSettings();
  } catch (e) { toast(errText(e)); }
}

/* ───────────── store screen ───────────── */
function renderStore() {
  $("#bar").hidden = false;
  if (!$("#q")) {
    $("#app").innerHTML = `
      <div class="head">
        <h2 class="storeh"><button class="storebtn" data-act="menu" aria-haspopup="dialog"><span class="nm" id="storeName"></span><span class="sr">, ${t("storeMenu")}</span>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></h2>
        <input id="q" type="search" placeholder="${t("search")}" aria-label="${t("searchLabel")}" autocomplete="off"></div>
      <div class="stats">
        <button type="button" class="stat" id="tToday" data-act="panel" data-panel="today" aria-controls="pToday" aria-expanded="false"></button>
        <div id="tLowWrap"></div></div>
      <div class="panel" id="pToday" hidden></div>
      <div class="panel low" id="pLow" hidden></div>
      <div class="secthead"><h3>${t("inventory")}</h3><span class="muted num" id="invCount"></span></div>
      <div id="chips"></div><div class="list" id="plist"></div>`;
    $("#q").value = S.q;
    $("#q").addEventListener("input", (e) => { S.q = e.target.value; renderList(); });
  }
  $("#storeName").textContent = store(S.storeId)?.name || "";
  renderToday(); renderList();
}
function renderToday() {
  const tot = S.sales.reduce((a, s) => a + s.unit_price * s.qty, 0);
  const n = S.sales.reduce((a, s) => a + s.qty, 0);
  $("#tToday").innerHTML = `<span class="lbl">${t("todaysSales")}</span><b>${money(tot)}</b><span class="sub">${t("itemsN", { n })}</span>`;
  $("#pToday").innerHTML = (S.sales.length
    ? S.sales.map((s) => `<div class="sale"><div style="min-width:0"><div>${s.qty} × ${esc(s.product_name)}</div>
        <div class="meta">${time(s.created_at)} · ${t("each", { price: money(s.unit_price) })}${(s.seller_name || S.people.get(s.sold_by)) ? " · " + esc(s.seller_name || S.people.get(s.sold_by)) : ""}</div></div>
        <span class="amt">${money(s.unit_price * s.qty)}</span><button class="undo" data-act="voidSale" data-id="${s.id}">${t("void")}</button></div>`).join("")
    : `<div class="empty">${t("noSalesToday")}</div>`)
    + `<div class="tools"><button class="btn ghost wide" data-act="summary">${t("copySummary")}</button></div>`;
}
function renderList() {
  const sid = S.storeId;
  const low = S.products.filter((p) => qtyOf(p.id, sid) < p.low_stock_threshold).sort((a, b) => qtyOf(a.id, sid) - qtyOf(b.id, sid));
  if (S.open === "low" && !low.length) S.open = null;
  $("#tLowWrap").innerHTML = low.length
    ? `<button type="button" class="stat warn" data-act="panel" data-panel="low" aria-controls="pLow" aria-expanded="${S.open === "low"}"><span class="lbl">${t("reorderLbl")}</span><b>${low.length}</b><span class="sub">${t("runningLow")}</span></button>`
    : `<div class="stat ok"><span class="lbl">${t("reorderLbl")}</span><b>0</b><span class="sub">${t("allStocked")}</span></div>`;
  $("#pLow").innerHTML = low.map((p) => `<div class="lowitem"><span>${esc(p.name)}</span><b class="num">${left(qtyOf(p.id, sid))}</b></div>`).join("");
  showPanels();
  if (!S.products.length) { $("#chips").innerHTML = ""; $("#invCount").textContent = "";
    $("#plist").innerHTML = `<div class="empty">${t("emptyInv")}${isOwner() ? `<br><button type="button" class="link" data-act="import">${t("importTitle")}</button>` : ""}</div>`; return; }
  $("#chips").innerHTML = chips(S.products, S.type, "listType");
  const list = findItems(S.products, S.q, S.type);
  $("#invCount").textContent = list.length;
  $("#plist").innerHTML = list.length ? list.map((p) => {
    const q = qtyOf(p.id, sid);
    return `<div class="row">${thumb(p)}<div class="info">
      <button class="name" data-act="edit" data-id="${p.id}">${esc(p.name)}</button>
      <div class="meta">${p.price != null ? `<span class="num">${money(p.price)}</span>` : `<span class="muted">${t("noPrice")}</span>`}${isOwner() ? `<span class="costm">${t("cost")} ${money(p.cost)}</span>` : ""}</div></div>
      <div class="stepper"><button data-act="dec" data-id="${p.id}" aria-label="${esc(t("removeOne", { name: p.name }))}">−</button>
      <span class="q ${q < p.low_stock_threshold ? "low" : ""}">${q}</span>
      <button data-act="inc" data-id="${p.id}" aria-label="${esc(t("addOne", { name: p.name }))}">+</button></div></div>`;
  }).join("") : noMatch(S.q, S.type, "listAll");
}

/* today's sales / reorder: two tiles on top, each opens its list below (one at a time) */
function showPanels() {
  for (const [k, tile, panel] of [["today", "#tToday", "#pToday"], ["low", "#tLowWrap .stat", "#pLow"]]) {
    const open = S.open === k;
    if ($(panel)) $(panel).hidden = !open;
    $(tile)?.setAttribute("aria-expanded", String(open));
  }
}

/* store menu: tapping the store name opens a bottom sheet to switch store, reach owner tools, or log out */
function openMenu() {
  const units = (sid) => S.products.reduce((a, p) => a + qtyOf(p.id, sid), 0);
  $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="menuTitle">
    <h2 id="menuTitle">${t("stores")}</h2>
    <div class="picks">${S.stores.map((s) => s.id === S.storeId
      ? `<button type="button" class="pick" data-act="close" aria-current="true"><b>${esc(s.name)}</b><span class="left here">${t("youreHere")}</span></button>`
      : `<button type="button" class="pick" data-store="${s.id}"><b>${esc(s.name)}</b><span class="left">${t("units", { n: units(s.id) })}</span></button>`).join("")}</div>
    <div class="menulist">
      ${isOwner() ? `<button type="button" class="menuitem" data-act="import">${t("importTitle")}</button>
      <button type="button" class="menuitem" data-act="employees">${t("employees")}</button>` : ""}
      <button type="button" class="menuitem" data-act="settings">${isOwner() ? t("settings") : t("account")}</button>
      <button type="button" class="menuitem logout" data-act="signOut">${S.member?.display_name ? t("logOutName", { name: esc(S.member.display_name) }) : t("logOut")}</button>
    </div>
    ${langSwitch()}
    <button type="button" class="btn ghost wide" data-act="close">${t("close")}</button></div></div>`;
  $("#sheetRoot .pick")?.focus({ preventScroll: true });
}

/* quick +/−: taps are grouped and saved together */
function bump(pid, d) {
  const sid = S.storeId, k = key(pid, sid);
  if (qtyOf(pid, sid) + d < 0) return;
  S.pending.set(k, (S.pending.get(k) || 0) + d); renderList();
  clearTimeout(S.timers.get(k));
  S.timers.set(k, setTimeout(async () => {
    const delta = S.pending.get(k) || 0; if (!delta) return;
    const { data, error } = await sb.rpc("adjust_stock", { p_product: pid, p_store: sid, p_delta: delta });
    S.pending.set(k, (S.pending.get(k) || 0) - delta);
    if (!S.pending.get(k)) S.pending.delete(k);
    if (error) toast(t("didntSave")); else S.inv.set(k, data);
    renderList();
  }, 700));
}

/* ───────────── sell ───────────── */
function openSale() { S.sale = { pid: null, q: "", type: "all" }; drawSale(); }
function drawSale() {
  const sid = S.storeId, p = S.sale.pid && product(S.sale.pid);
  if (!p) {
    // in stock first, sold out at the end
    const list = findItems(S.products, S.sale.q, S.sale.type).sort((a, b) => !qtyOf(a.id, sid) - !qtyOf(b.id, sid));
    const picks = list.length ? list.map((x) => { const n = qtyOf(x.id, sid);
      return `<button type="button" class="pick" data-act="pickSale" data-id="${x.id}" ${n ? "" : "disabled"}><span class="pickname">${thumb(x, "thumb sm")}<b>${esc(x.name)}</b></span><span class="left">${x.price != null && n ? `<b class="num">${money(x.price)}</b> · ` : ""}${left(n)}</span></button>`; }).join("")
      : (S.products.length ? noMatch(S.sale.q, S.sale.type, "saleAll") : `<div class="empty">${t("notOnList")}</div>`);
    const ch = chips(S.products, S.sale.type, "saleType");
    if ($("#picks")) { $("#picks").innerHTML = picks; $("#schips").innerHTML = ch; return; }
    $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><form class="sheet" id="saleForm" novalidate>
      <h2>${t("whatSold")}</h2>
      <input id="s-q" type="search" placeholder="${t("saleSearch")}" aria-label="${t("searchLabel")}" autocomplete="off" value="${esc(S.sale.q)}">
      <div id="schips">${ch}</div>
      <div class="picks" id="picks">${picks}</div>
      <div class="foot"><span></span><button type="button" class="btn ghost" data-act="close">${t("cancel")}</button></div></form></div>`;
    $("#s-q").addEventListener("input", (e) => { S.sale.q = e.target.value; drawSale(); });
    $("#s-q").focus();                              // ready to type as soon as Sell is tapped
    return;
  }
  const max = qtyOf(p.id, sid);
  $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><form class="sheet" id="saleForm" novalidate>
    <h2>${t("recordSale")}</h2>
    <div class="chosen"><div class="pickname">${thumb(p)}<div><b>${esc(p.name)}</b><div class="cost">${t("leftAt", { n: max, store: esc(store(sid)?.name) })}</div></div></div>
      <button type="button" class="link" data-act="repick">${t("change")}</button></div>
    <label>${t("salePrice")}<input id="s-price" type="text" inputmode="decimal" autocomplete="off" value="${p.price ?? ""}" placeholder="0.00"></label>
    <label>${t("quantity")}<div class="qtyrow"><button type="button" data-act="sq" data-d="-1" aria-label="${t("less")}">−</button>
      <input id="s-qty" type="number" min="1" max="${max}" inputmode="numeric" value="1">
      <button type="button" data-act="sq" data-d="1" aria-label="${t("more")}">+</button></div></label>
    <div class="total"><span>${t("total")}</span><b id="s-total">${money(p.price || 0)}</b></div>
    <p class="err" id="s-err" role="alert"></p>
    <div class="foot"><button type="button" class="btn ghost" data-act="close">${t("cancel")}</button>
      <button class="btn" type="submit" style="flex:1">${t("sellAndUpdate")}</button></div></form></div>`;
  const upd = () => ($("#s-total").textContent = money((dec($("#s-price").value) || 0) * (parseInt($("#s-qty").value, 10) || 0)));
  $("#s-price").addEventListener("input", upd); $("#s-qty").addEventListener("input", upd);
  if (p.price == null) setTimeout(() => $("#s-price").focus(), 50);
}
async function submitSale(form) {
  const p = product(S.sale.pid), sid = S.storeId;
  const price = dec($("#s-price").value), qty = parseInt($("#s-qty").value, 10), have = qtyOf(p.id, sid);
  if (!(price >= 0)) return ($("#s-err").textContent = t("errPrice"));
  if (!(qty > 0)) return ($("#s-err").textContent = t("errQty"));
  if (qty > have) return ($("#s-err").textContent = t("onlyLeft", { n: have }));
  form.querySelector("[type=submit]").disabled = true;
  const { error } = await sb.rpc("record_sale", { p_product: p.id, p_store: sid, p_qty: qty, p_price: price });
  if (error) { form.querySelector("[type=submit]").disabled = false; $("#s-err").textContent = errText(error); return; }
  closeSheet(); await loadAll(); render();
  toast(t("soldToast", { q: qty, name: p.name, left: qtyOf(p.id, sid) }));
}
async function voidSale(id, btn) {
  if (btn.dataset.sure !== "1") {
    btn.dataset.sure = "1"; btn.textContent = t("sure");
    setTimeout(() => { if (btn.isConnected) { btn.dataset.sure = ""; btn.textContent = t("void"); } }, 3000);
    return;
  }
  const { error } = await sb.rpc("void_sale", { p_sale: id });
  if (error) return toast(errText(error));
  await loadAll(); render(); toast(t("voided"));
}
async function copySummary() {
  const s = store(S.storeId), tot = S.sales.reduce((a, x) => a + x.unit_price * x.qty, 0);
  const profit = S.sales.reduce((a, x) => a + (x.unit_price - x.unit_cost) * x.qty, 0);
  const n = S.sales.reduce((a, x) => a + x.qty, 0);
  const low = S.products.filter((p) => qtyOf(p.id, S.storeId) < p.low_stock_threshold);
  const date = new Date().toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
  const text = [`📍 ${s.name} — ${date}`, t("sumSold", { n }), t("sumTotal", { v: money(tot) }), t("sumProfit", { v: money(profit) }),
    ...(S.sales.length ? ["", ...S.sales.slice().reverse().map((x) => `• ${x.qty} × ${x.product_name} — ${money(x.unit_price * x.qty)}`)] : []),
    ...(low.length ? ["", t("sumReorder"), ...low.map((p) => `• ${p.name} ${t("sumLeft", { n: qtyOf(p.id, S.storeId) })}`)] : [])].join("\n");
  try { await navigator.clipboard.writeText(text); toast(t("copiedWA")); }
  catch (_) {
    $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><div class="sheet"><h2>${t("daySummary")}</h2>
      <p class="muted">${t("selectCopy")}</p><textarea readonly>${esc(text)}</textarea>
      <button class="btn" data-act="close">${t("done")}</button></div></div>`;
  }
}

/* ───────────── add / edit ───────────── */
function openEdit(id) {
  const p = id ? product(id) : { name: "", cost: "", low_stock_threshold: 3 };
  const sname = store(S.storeId)?.name || "";
  S.photo = { file: null, remove: false };
  $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><form class="sheet" id="pform" data-id="${id || ""}" novalidate>
    <h2>${id ? t("editTitle") : t("addTitle")}</h2>
    <label>${t("name")}<input id="f-name" value="${esc(p.name)}" placeholder="${t("namePh")}"></label>
    <div class="photoBox"><span class="phlabel">${t("photoOpt")}</span>
      <div class="photoField"><div id="f-prev">${thumb(p, "thumb big")}</div>
        <div class="photoBtns">
          <label class="btn ghost filebtn">${t("takePhoto")}<input id="f-cam" type="file" accept="image/*" capture="environment" hidden></label>
          <label class="btn ghost filebtn">${t("choose")}<input id="f-photo" type="file" accept="image/*" hidden></label>
          <button type="button" class="btn ghost filebtn" data-act="pastePhoto">${t("paste")}</button>
        </div></div>
      <p class="muted" id="f-phint" style="font-size:13px">${t("pasteHint")}</p>
      <button type="button" class="link" data-act="rmPhoto" id="f-rm" ${p.photo_path ? "" : "hidden"}>${t("removePhoto")}</button></div>
    <div class="grid2"><label>${t("costUsd")}<input id="f-cost" type="text" inputmode="decimal" autocomplete="off" value="${esc(p.cost)}"></label>
      <label>${t("priceUsd")}<input id="f-price" type="text" inputmode="decimal" autocomplete="off" value="${p.price ?? ""}" placeholder="${t("shownToCustomers")}"></label></div>
    <div class="grid2"><label>${t("stockAt", { store: esc(sname) })}<input id="f-stock" type="number" min="0" inputmode="numeric" value="${id ? qtyOf(id, S.storeId) : 0}"></label>
      <label>${t("alertBelow")}<input id="f-low" type="number" min="0" inputmode="numeric" value="${p.low_stock_threshold}"></label></div>
    <p class="err" id="f-err" role="alert"></p><div id="delZone"></div>
    <div class="foot">${id && isOwner() ? `<button type="button" class="btn ghost" data-act="askDel" data-id="${id}">${t("delete")}</button>` : ""}
      <span class="right"><button type="button" class="btn ghost" data-act="close">${t("cancel")}</button><button class="btn" type="submit">${t("save")}</button></span></div>
  </form></div>`;
  for (const i of ["#f-photo", "#f-cam"]) $(i).addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) setPhoto(f); e.target.value = ""; });
  if (!id) setTimeout(() => $("#f-name").focus(), 50);
}
function setPhoto(file) {
  if (!$("#f-prev")) return;
  S.photo = { file, remove: false };
  $("#f-prev").innerHTML = `<img class="thumb big" src="${URL.createObjectURL(file)}" alt="">`;
  $("#f-rm").hidden = false; $("#f-err").textContent = "";
}
/* "Paste" button: reads an image the person copied (phone or computer) */
async function pastePhoto() {
  try {
    if (!navigator.clipboard?.read) throw new Error("unsupported");
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((x) => x.startsWith("image/"));
      if (type) { const blob = await item.getType(type); return setPhoto(new File([blob], "pasted." + type.split("/")[1], { type })); }
    }
    $("#f-err").textContent = t("noImage");
  } catch (_) {
    $("#f-err").textContent = t("noClipboard");
  }
}
/* Ctrl+V / ⌘V while the add/edit sheet is open */
document.addEventListener("paste", (e) => {
  if (!$("#f-prev")) return;
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/"));
  if (f) { e.preventDefault(); setPhoto(f); }
});
/* make photos small before upload (max 480px, JPEG) so they load fast on phones */
async function shrink(file) {
  let img = await createImageBitmap(file).catch(() => null);
  if (!img) img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(localErr("notPhoto")); i.src = URL.createObjectURL(file); });
  const sc = Math.min(1, 480 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
}
async function submitEdit(form) {
  const id = form.dataset.id, sid = S.storeId, name = $("#f-name").value.trim();
  if (!name) return ($("#f-err").textContent = t("errName"));
  const costTxt = $("#f-cost").value.trim(), priceTxt = $("#f-price").value.trim();
  const cost = costTxt === "" ? 0 : dec(costTxt), price = priceTxt === "" ? null : dec(priceTxt);
  if (Number.isNaN(cost) || Number.isNaN(price)) return ($("#f-err").textContent = t("errNumber"));
  const fields = { name, cost, price, low_stock_threshold: parseInt($("#f-low").value, 10) || 0 };
  const want = parseInt($("#f-stock").value, 10) || 0;
  const btn = form.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = t("saving");
  try {
    let pid = id;
    if (id) { const { error } = await sb.from("products").update(fields).eq("id", id); if (error) throw error; }
    else { const { data, error } = await sb.from("products").insert({ ...fields, org_id: S.org.id }).select("id").single(); if (error) throw error; pid = data.id; }
    const delta = want - (id ? qtyOf(id, sid) : 0);
    if (delta) { const { error } = await sb.rpc("adjust_stock", { p_product: pid, p_store: sid, p_delta: delta }); if (error) throw error; }
    const old = id ? product(id)?.photo_path : null;
    if (S.photo.file) {
      const blob = await shrink(S.photo.file), path = `${S.org.id}/${pid}-${Date.now()}.jpg`;
      const up = await sb.storage.from("product-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const { error } = await sb.from("products").update({ photo_path: path }).eq("id", pid); if (error) throw error;
      if (old) sb.storage.from("product-photos").remove([old]);
    } else if (S.photo.remove && old) {
      const { error } = await sb.from("products").update({ photo_path: null }).eq("id", pid); if (error) throw error;
      sb.storage.from("product-photos").remove([old]);
    }
    closeSheet(); await loadAll(); render(); toast(id ? t("saved") : t("added"));
  } catch (e) { $("#f-err").textContent = errText(e); btn.disabled = false; btn.textContent = t("save"); }
}
/* ───────────── paste a list (owner) ─────────────
   One product per line: name, cost, price, quantity. Columns split by tab (pasted from Excel or
   Google Sheets), ";" or "|", otherwise ",". Quantity goes to the store you're in. Names that
   already exist are skipped so pasting the same list twice doesn't duplicate anything. */
function parseList(text) {
  const have = new Set(S.products.map((p) => norm(p.name).trim()));
  const seen = new Set();
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, i) => {
    const sep = line.includes("\t") ? "\t" : /[;|]/.test(line) ? /[;|]/ : ",";
    const [name = "", cost = "", price = "", qty = ""] = line.split(sep).map((x) => x.trim().replace(/^\$/, ""));
    const row = { line: i + 1, name, cost: cost === "" ? 0 : dec(cost), price: price === "" ? null : dec(price), qty: qty === "" ? 0 : Number(qty) };
    const key = norm(name).trim();
    if (i === 0 && /^(name|nombre|producto|product)$/i.test(name)) row.skip = "header";
    else if (!name) row.err = t("imErrName");
    else if (Number.isNaN(row.cost) || Number.isNaN(row.price)) row.err = t("imErrPrice");
    else if (!Number.isInteger(row.qty) || row.qty < 0) row.err = t("imErrQty");
    else if (have.has(key) || seen.has(key)) row.skip = "exists";
    seen.add(key);
    return row;
  }).filter((r) => r.skip !== "header");
}
function openImport(text = "") {
  $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><form class="sheet" id="importForm" novalidate role="dialog" aria-modal="true" aria-labelledby="imTitle">
    <h2 id="imTitle">${t("importTitle")}</h2>
    <p class="muted" style="font-size:14px">${t("imHelp", { store: esc(store(S.storeId)?.name || "") })}</p>
    <pre class="imexample">${t("imExample")}</pre>
    <label>${t("imPaste")}<textarea id="im-text" spellcheck="false" autocapitalize="off" placeholder="${t("imPh")}">${esc(text)}</textarea></label>
    <p class="err" id="im-err" role="alert"></p>
    <div class="foot"><button type="button" class="btn ghost" data-act="close">${t("cancel")}</button>
      <button class="btn" type="submit" style="flex:1">${t("imReview")}</button></div></form></div>`;
  if (!text) setTimeout(() => $("#im-text").focus(), 50);
}
function reviewImport() {
  const text = $("#im-text").value;
  const rows = parseList(text);
  if (!rows.length) return ($("#im-err").textContent = t("imEmpty"));
  S.importRows = rows; S.importText = text;
  const ok = rows.filter((r) => !r.err && !r.skip), skip = rows.filter((r) => r.skip), bad = rows.filter((r) => r.err);
  $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="imTitle">
    <h2 id="imTitle">${t("imCheck")}</h2>
    <p class="imsum"><b>${t("imNew", { n: ok.length })}</b>${skip.length ? ` · ${t("imExists", { n: skip.length })}` : ""}${bad.length ? ` · <span class="danger-text">${t("imBad", { n: bad.length })}</span>` : ""}</p>
    <div class="picks imrows">${rows.map((r) => `<div class="imrow ${r.err ? "bad" : r.skip ? "skip" : ""}">
      <div style="min-width:0"><b>${esc(r.name || "—")}</b>
        <div class="meta">${r.err ? `<span class="danger-text">${t("imLine", { n: r.line })}: ${r.err}</span>`
          : r.skip ? `<span>${t("imSkip")}</span>`
          : `${t("cost")} <span class="num">${money(r.cost)}</span> · ${r.price != null ? `${t("price")} <span class="num">${money(r.price)}</span>` : t("noPrice")}`}</div></div>
      ${!r.err && !r.skip ? `<span class="num imqty">${r.qty}</span>` : ""}</div>`).join("")}</div>
    <p class="err" id="im-err" role="alert"></p>
    <div class="foot"><button type="button" class="btn ghost" data-act="imBack">${t("imBack")}</button>
      <button type="button" class="btn" data-act="imSave" style="flex:1" ${ok.length ? "" : "disabled"}>${t("imSave", { n: ok.length })}</button></div></div></div>`;
}
async function saveImport(btn) {
  const rows = S.importRows.filter((r) => !r.err && !r.skip), sid = S.storeId;
  btn.disabled = true; btn.textContent = t("saving");
  try {
    const { data, error } = await sb.from("products").insert(rows.map((r) => ({ org_id: S.org.id, name: r.name, cost: r.cost, price: r.price, low_stock_threshold: 3 }))).select("id");
    if (error) throw error;
    let failed = 0;
    for (const [i, r] of rows.entries()) {               // stock for the store you're in
      if (!r.qty || !data?.[i]?.id) continue;
      btn.textContent = t("imSaving", { i: i + 1, n: rows.length });
      const { error: e } = await sb.rpc("adjust_stock", { p_product: data[i].id, p_store: sid, p_delta: r.qty });
      if (e) failed++;
    }
    closeSheet(); S.importRows = null; await loadAll(); render();
    toast(failed ? t("imDoneStockErr", { n: rows.length, f: failed }) : t("imDone", { n: rows.length }));
  } catch (e) { $("#im-err").textContent = errText(e); btn.disabled = false; btn.textContent = t("imSave", { n: rows.length }); }
}

function closeSheet() { $("#sheetRoot").innerHTML = ""; S.sale = null; }

/* ───────────── events ───────────── */
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act],[data-store]"); if (!el) return;
  if (el.dataset.store) { closeSheet(); setStore(el.dataset.store); $("#app").innerHTML = ""; await loadSales(); render(); scrollTo(0, 0); return; }
  const a = el.dataset.act, id = el.dataset.id;
  if (a === "closeBg" && e.target !== el) return;
  const actions = {
    lang: () => { if (el.dataset.lang === lang) return; setLang(el.dataset.lang); labelBar();
      closeSheet(); $("#app").innerHTML = ""; (S.redraw || route)(); },
    toCatalog: () => renderCatalog(),
    copyCat: async () => { const txt = $("#catLink").textContent;
      try { await navigator.clipboard.writeText(txt); toast(t("linkCopied")); }
      catch (_) { const r = document.createRange(); r.selectNodeContents($("#catLink")); getSelection().removeAllRanges(); getSelection().addRange(r); toast(t("linkSelected")); } },
    retry: route, toSignUp: () => renderAuth("up"), toSignIn: () => renderAuth("in"), toEmp: () => renderAuth("emp"),
    editEmp: () => openEmp(id),
    askDelEmp: () => ($("#delZone").innerHTML = `<div class="confirm">${t("removeEmpQ")} <button type="button" class="btn danger" data-act="doDelEmp" data-id="${id}">${t("yesRemove")}</button></div>`),
    doDelEmp: async () => { const { error } = await sb.rpc("delete_employee", { p_id: id }); if (error) return toast(errText(error));
      closeSheet(); await loadAll(); render(); toast(t("empRemoved")); },
    askDelEmpInline: () => ($(`#del-${id}`).innerHTML = `<div class="confirm">${t("removeNamedQ", { name: esc(S.employees.find((x) => x.id === id)?.name || "") })} <button type="button" class="btn danger" data-act="doDelEmp" data-id="${id}">${t("yesRemove")}</button> <button type="button" class="btn ghost" data-act="cancelDel" data-id="${id}">${t("cancel")}</button></div>`),
    cancelDel: () => ($(`#del-${id}`).innerHTML = ""),
    menu: openMenu,
    import: () => openImport(),
    imBack: () => openImport(S.importText),
    imSave: () => saveImport(el),
    employees: () => { closeSheet(); S.view = "employees"; S.empSales = null; $("#app").innerHTML = ""; render(); scrollTo(0, 0); },
    signOut: async () => { if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
      setStore(null); S.view = "main"; S.member = null; S.org = null; closeSheet(); $("#bar").hidden = true;
      await sb.auth.signOut(); toast(t("loggedOut")); },
    addStoreField: () => { const n = document.querySelectorAll(".o-store").length + 1;
      $("#o-stores").insertAdjacentHTML("beforeend", `<label>${t("storeN", { n })}<input class="o-store"></label>`); },
    settings: () => { closeSheet(); S.view = "settings"; $("#app").innerHTML = ""; render(); scrollTo(0, 0); }, back: () => { S.view = "main"; $("#app").innerHTML = ""; render(); },
    inc: () => bump(id, 1), dec: () => bump(id, -1),
    edit: () => openEdit(id), add: () => openEdit(null), sell: openSale,
    panel: () => { S.open = S.open === el.dataset.panel ? null : el.dataset.panel; showPanels(); },
    listType: () => { S.type = el.dataset.type; renderList(); },
    listAll: () => { S.type = "all"; S.q = ""; $("#q").value = ""; renderList(); },
    saleType: () => { S.sale.type = el.dataset.type; drawSale(); },
    saleAll: () => { S.sale.type = "all"; S.sale.q = ""; $("#s-q").value = ""; drawSale(); },
    pickSale: () => { S.sale.pid = id; drawSale(); },
    repick: () => { S.sale.pid = null; $("#sheetRoot").innerHTML = ""; drawSale(); },
    sq: () => { const i = $("#s-qty"), max = +i.max || 1; i.value = Math.min(max, Math.max(1, (parseInt(i.value, 10) || 1) + +el.dataset.d)); i.dispatchEvent(new Event("input")); },
    voidSale: () => voidSale(id, el), summary: copySummary,
    close: closeSheet, closeBg: closeSheet,
    askDel: () => ($("#delZone").innerHTML = `<div class="confirm">${t("deleteQ")} <button type="button" class="btn danger" data-act="doDel" data-id="${id}">${t("yesDelete")}</button></div>`),
    rmPhoto: () => { S.photo = { file: null, remove: true }; $("#f-prev").innerHTML = thumb({ name: $("#f-name").value }, "thumb big"); $("#f-rm").hidden = true; },
    pastePhoto,
    doDel: async () => { const old = product(id)?.photo_path; const { error } = await sb.from("products").delete().eq("id", id);
      if (error) return toast(errText(error)); if (old) sb.storage.from("product-photos").remove([old]); closeSheet(); await loadAll(); render(); toast(t("deleted")); },
  };
  actions[a]?.();
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  ({ authForm: () => submitAuth(f), empForm: () => submitEmp(f), orgForm: submitOrg, storesForm: submitStores,
     empAddForm: submitEmpAdd, empEditForm: () => submitEmpEdit(f), importForm: reviewImport,
     saleForm: () => S.sale?.pid && submitSale(f), pform: () => submitEdit(f) })[f.id]?.();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

/* ───────────── start ───────────── */
labelBar();
if (SUPABASE_URL.includes("YOUR-PROJECT")) {
  $("#app").innerHTML = `<div class="card"><h2>${t("almostThere")}</h2><p class="muted">${t("configMsg")}</p></div>`;
} else {
  $("#app").innerHTML = `<div class="empty">${t("loading")}</div>`;
  const { data } = await sb.auth.getSession();
  S.session = data.session; route();
  sb.auth.onAuthStateChange((evt, session) => {
    const changed = (session?.user?.id || null) !== (S.session?.user?.id || null);
    S.session = session;
    if (changed && !S.busyLogin) { $("#app").innerHTML = ""; route(); }
  });
}
