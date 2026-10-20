import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ───────────── state ───────────── */
const S = {
  session: null, member: null, org: null,
  stores: [], products: [], inv: new Map(), sales: [], people: new Map(),
  storeId: null, q: "", view: "loading",
  pending: new Map(), timers: new Map(), sale: null, channel: null,
  employees: [], empTableMissing: false, busyLogin: false,
};
try { S.storeId = localStorage.getItem("storeId"); } catch (_) {}
/* catalog code: from a shared link (?c=xxxx) or remembered on this device */
S.catalog = new URLSearchParams(location.search).get("c");
try { if (S.catalog) localStorage.setItem("catalog", S.catalog); else S.catalog = localStorage.getItem("catalog"); } catch (_) {}

/* ───────────── helpers ───────────── */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + (Number(n) || 0).toFixed(2);
const key = (pid, sid) => pid + ":" + sid;
const qtyOf = (pid, sid) => (S.inv.get(key(pid, sid)) || 0) + (S.pending.get(key(pid, sid)) || 0);
const product = (id) => S.products.find((p) => p.id === id);
const store = (id) => S.stores.find((s) => s.id === id);
const photoUrl = (p) => (p?.photo_path ? `${SUPABASE_URL}/storage/v1/object/public/product-photos/${p.photo_path}` : "");
const thumb = (p, cls = "thumb") => photoUrl(p)
  ? `<img class="${cls}" src="${esc(photoUrl(p))}" alt="" loading="lazy">`
  : `<span class="${cls} ph" aria-hidden="true">${esc((p?.name || "?").trim().slice(0, 1).toUpperCase())}</span>`;
const isOwner = () => S.member?.role === "owner";
const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const errText = (e) => (e?.message || "Something went wrong").replace(/^.*?ERROR:\s*/, "");
function toast(msg) {
  $("#toastRoot").innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
  clearTimeout(S.toastT); S.toastT = setTimeout(() => ($("#toastRoot").innerHTML = ""), 2800);
}
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
function setStore(id) {
  S.storeId = id; S.q = "";
  try { id ? localStorage.setItem("storeId", id) : localStorage.removeItem("storeId"); } catch (_) {}
}

/* ───────────── data ───────────── */
async function loadMembership() {
  const { data, error } = await sb.from("members").select("org_id, role, display_name, orgs(*)")
    .eq("user_id", S.session.user.id).limit(1);
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
    const { data, error } = await sb.from("employees").select("id, login_id, name, active").eq("org_id", org).order("name");
    S.employees = data || []; S.empTableMissing = !!error;
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
  let t;
  const refresh = () => { clearTimeout(t); t = setTimeout(async () => { try { await loadAll(); if (S.view !== "settings") render(); } catch (_) {} }, 400); };
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
    if (!S.member && S.session.user.is_anonymous) { await sb.auth.signOut(); return renderAuth("emp", "Your access changed. Sign in again."); }
    if (!S.member) return renderOnboarding();
    await loadAll();
    listenLive();
  } catch (e) {
    $("#app").innerHTML = `<div class="card"><h2>Can't connect</h2><p class="muted">${esc(errText(e))}</p><button class="btn" data-act="retry">Try again</button></div>`;
    return;
  }
  render();
}
function render() {
  if (S.view === "settings") return renderSettings();
  if (!S.storeId) return renderPicker();
  renderStore();
}

/* ───────────── sign in ───────────── */
function renderAuth(mode = "emp", msg = "") {
  if (mode === "emp") {
    $("#app").innerHTML = `
      <div><span class="eyebrow">Accessory Inventory</span><h1>Employee sign in</h1></div>
      <form class="card" id="empForm" novalidate>
        <label>Employee ID<input id="e-id" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" placeholder="maria"></label>
        <label>Code<input id="e-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="current-password" placeholder="••••"></label>
        <p class="err" id="a-err" role="alert">${esc(msg)}</p>
        <button class="btn wide" type="submit">Sign in</button>
      </form>
      <button class="link" data-act="toSignIn">I'm the owner</button>
      ${S.catalog ? `<button class="link" data-act="toCatalog">← Back to catalog</button>` : ""}`;
    return;
  }
  $("#app").innerHTML = `
    <div><span class="eyebrow">Owner</span><h1>${mode === "in" ? "Owner sign in" : "Create owner account"}</h1></div>
    <form class="card" id="authForm" data-mode="${mode}" novalidate>
      <label>Email<input id="a-email" type="email" autocomplete="email" inputmode="email" required></label>
      <label>Password<input id="a-pass" type="password" autocomplete="${mode === "in" ? "current-password" : "new-password"}" minlength="6" required></label>
      <p class="err" id="a-err" role="alert">${esc(msg)}</p>
      <button class="btn wide" type="submit">${mode === "in" ? "Sign in" : "Create account"}</button>
    </form>
    <button class="link" data-act="${mode === "in" ? "toSignUp" : "toSignIn"}">${mode === "in" ? "New owner? Create an account" : "Already have an account? Sign in"}</button>
    <button class="link" data-act="toEmp">Employee? Sign in with ID and code</button>
    ${S.catalog ? `<button class="link" data-act="toCatalog">← Back to catalog</button>` : ""}`;
}
async function submitAuth(form) {
  const email = $("#a-email").value.trim(), password = $("#a-pass").value, mode = form.dataset.mode;
  if (!email || password.length < 6) { $("#a-err").textContent = "Enter your email and a password of at least 6 characters."; return; }
  form.querySelector("[type=submit]").disabled = true;
  const { data, error } = mode === "in"
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });
  form.querySelector("[type=submit]").disabled = false;
  if (error) { $("#a-err").textContent = error.message; return; }
  if (mode === "up" && !data.session) renderAuth("in", "Check your email and tap the confirmation link, then sign in.");
}
async function submitEmp(form) {
  const id = $("#e-id").value.trim(), pin = $("#e-pin").value.trim();
  if (!id || !pin) { $("#a-err").textContent = "Enter your ID and code."; return; }
  const btn = form.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "Signing in…";
  S.busyLogin = true;
  try {
    if (!S.session) { const { data, error } = await sb.auth.signInAnonymously(); if (error) throw error; S.session = data.session; }
    const { error } = await sb.rpc("employee_login", { p_login: id, p_pin: pin });
    if (error) { await sb.auth.signOut(); S.session = null; throw error; }
    S.busyLogin = false; $("#app").innerHTML = ""; route();
  } catch (e) {
    S.busyLogin = false;
    const m = errText(e);
    $("#a-err").textContent = /anonymous/i.test(m) ? "Employee sign in is off. The owner must turn on anonymous sign-ins in Supabase." : m;
    btn.disabled = false; btn.textContent = "Sign in";
  }
}

/* ───────────── public catalog (no login) ───────────── */
async function renderCatalog() {
  $("#bar").hidden = true;
  $("#app").innerHTML = `<div class="empty">Loading…</div>`;
  const { data, error } = await sb.rpc("get_catalog", { p_code: S.catalog });
  if (S.session) return;                          // signed in while loading
  if (error || !data) {
    if (!error) { try { localStorage.removeItem("catalog"); } catch (_) {} S.catalog = null; }
    return renderAuth();
  }
  S.cat = data; S.catQ = "";
  $("#app").innerHTML = `
    <div class="cathead"><div style="min-width:0"><span class="eyebrow">Accessories</span><h1>${esc(data.business)}</h1>
      ${data.stores.length ? `<p class="muted" style="font-size:14px">${data.stores.map(esc).join(" · ")}</p>` : ""}</div>
      <button class="btn ghost" data-act="toEmp">Staff sign in</button></div>
    <input id="cq" type="search" placeholder="Search: case 16, charger…" autocomplete="off">
    <div class="catgrid" id="cgrid"></div>
    <p class="muted" style="font-size:13px;text-align:center">Ask us in the store for anything you don't see.</p>`;
  $("#cq").addEventListener("input", (e) => { S.catQ = e.target.value; drawCatalog(); });
  drawCatalog();
}
function drawCatalog() {
  const words = S.catQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const items = S.cat.items.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)))
    .sort((a, b) => (b.in_stock - a.in_stock) || a.name.localeCompare(b.name));
  $("#cgrid").innerHTML = items.length ? items.map((p) => `<div class="citem ${p.in_stock ? "" : "out"}">
      ${thumb(p, "cimg")}
      <div class="cbody"><b>${esc(p.name)}</b>
        <div class="cmeta">${p.price != null ? `<span class="price">${money(p.price)}</span>` : ""}
        <span class="avail">${p.in_stock ? "Available" : "Sold out"}</span></div></div></div>`).join("")
    : `<div class="empty" style="grid-column:1/-1">Nothing matches your search.</div>`;
}

/* ───────────── first-time setup ───────────── */
function renderOnboarding() {
  $("#app").innerHTML = `
    <div><span class="eyebrow">Welcome</span><h1>Set up your stores</h1></div>
    <form class="card" id="orgForm" novalidate>
      <h3>I own the stores</h3>
      <label>Business name<input id="o-name" placeholder="Barajas Wireless"></label>
      <label>Your name<input id="o-you" placeholder="Johan"></label>
      <div class="stack" id="o-stores">
        <label>Store 1<input class="o-store" placeholder="1087 Southern Blvd"></label>
        <label>Store 2<input class="o-store" placeholder="116 E Fordham Rd"></label>
      </div>
      <button type="button" class="link" data-act="addStoreField">+ Add another store</button>
      <p class="err" id="o-err" role="alert"></p>
      <button class="btn wide" type="submit">Create</button>
    </form>
    <p class="muted">Employees don't need an account: the owner creates their ID and code in Settings.</p>
    <button class="link" data-act="signOut">Sign out</button>`;
}
async function submitOrg() {
  const name = $("#o-name").value.trim(), you = $("#o-you").value.trim();
  const stores = [...document.querySelectorAll(".o-store")].map((i) => i.value.trim()).filter(Boolean);
  if (!name) return ($("#o-err").textContent = "Enter the business name.");
  if (!stores.length) return ($("#o-err").textContent = "Add at least one store.");
  const { error } = await sb.rpc("create_org", { p_name: name, p_stores: stores, p_display_name: you });
  if (error) return ($("#o-err").textContent = errText(error));
  route();
}

/* ───────────── store picker & settings ───────────── */
function renderPicker() {
  $("#bar").hidden = true;
  const units = (sid) => S.products.reduce((a, p) => a + qtyOf(p.id, sid), 0);
  const low = (sid) => S.products.filter((p) => qtyOf(p.id, sid) < p.low_stock_threshold).length;
  $("#app").innerHTML = `
    <div><span class="eyebrow">${esc(S.org.name)}</span><h1>Which store are you in?</h1></div>
    <div class="stack">${S.stores.map((s) => `
      <button class="store" data-store="${s.id}"><span><b>${esc(s.name)}</b>
      <span class="sub">${units(s.id)} units${low(s.id) ? ` · <span style="color:var(--bad)">${low(s.id)} to reorder</span>` : ""}</span></span><span class="arrow">→</span></button>`).join("")}
    </div>
    <button class="link" data-act="settings">${isOwner() ? "Settings, employees and store names" : "Account"}</button>`;
}
function renderSettings() {
  $("#bar").hidden = true;
  $("#app").innerHTML = `
    <div class="line" style="display:flex;justify-content:space-between;align-items:center"><h1>${isOwner() ? "Settings" : "Account"}</h1><button class="link" data-act="back">Done</button></div>
    ${isOwner() ? `
    <div class="card"><h3>Employees</h3>
      <p class="muted">Employees sign in with their ID and code. No email needed.</p>
      ${S.empTableMissing ? `<p class="err">Run supabase/003_employees.sql in Supabase to turn this on.</p>` : `
      <div class="emplist">${S.employees.length ? S.employees.map((e) => `<div class="emp"><div style="min-width:0"><b>${esc(e.name)}</b>
        <div class="muted" style="font-size:14px">ID <span class="num">${esc(e.login_id)}</span>${e.active ? "" : " · <span style='color:var(--bad)'>access off</span>"}</div></div>
        <button class="link" data-act="editEmp" data-id="${e.id}">Edit</button></div>`).join("") : `<div class="muted">No employees yet.</div>`}</div>
      <form id="empAddForm" class="stack" novalidate><h3>Add employee</h3>
        <label>Name<input id="n-name" placeholder="Maria Lopez"></label>
        <div class="grid2"><label>ID<input id="n-id" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="maria"></label>
        <label>Code (4–6 numbers)<input id="n-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="1234"></label></div>
        <p class="err" id="n-err" role="alert"></p>
        <button class="btn" type="submit">Add employee</button></form>`}</div>
    <form class="card" id="storesForm" novalidate><h3>Stores</h3>
      ${S.stores.map((s) => `<label>Store<input data-sid="${s.id}" value="${esc(s.name)}"></label>`).join("")}
      <label>Add a store<input id="newStore" placeholder="New store address"></label>
      <button class="btn" type="submit">Save stores</button></form>
` : ""}
    ${isOwner() ? (S.org.catalog_code ? `<div class="card"><h3>Customer catalog</h3>
      <p class="muted">Photos, names and prices only — never units or cost. Share this link or open it on the store tablet.</p>
      <div class="linkbox num" id="catLink">${esc(location.origin + location.pathname + "?c=" + S.org.catalog_code)}</div>
      <div class="grid2"><button class="btn" data-act="copyCat">Copy link</button><a class="btn ghost" style="text-align:center;text-decoration:none;display:grid;place-items:center" href="?c=${esc(S.org.catalog_code)}" target="_blank" rel="noopener">Open</a></div></div>`
      : `<div class="card"><h3>Customer catalog</h3><p class="err">Run supabase/004_catalog.sql in Supabase to turn this on.</p></div>`) : ""}
    <div class="card"><p class="muted">Signed in as ${esc(S.session.user.email || S.member.display_name)}</p><button class="btn ghost" data-act="signOut">Sign out</button></div>`;
}
async function submitEmpAdd() {
  const name = $("#n-name").value.trim(), id = $("#n-id").value.trim().toLowerCase(), pin = $("#n-pin").value.trim();
  if (!name) return ($("#n-err").textContent = "Enter the employee's name.");
  if (!/^[a-z0-9._-]{3,20}$/.test(id)) return ($("#n-err").textContent = "ID: 3–20 letters or numbers, no spaces.");
  if (!/^[0-9]{4,6}$/.test(pin)) return ($("#n-err").textContent = "Code: 4 to 6 numbers.");
  const { error } = await sb.rpc("add_employee", { p_login: id, p_name: name, p_pin: pin });
  if (error) return ($("#n-err").textContent = errText(error));
  await loadAll(); renderSettings();
  toast(`${name} can now sign in with ID ${id} and code ${pin}`);
}
function openEmp(id) {
  const e = S.employees.find((x) => x.id === id); if (!e) return;
  $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><form class="sheet" id="empEditForm" data-id="${e.id}" novalidate>
    <h2>${esc(e.name)}</h2><p class="muted">ID <span class="num">${esc(e.login_id)}</span></p>
    <label>Name<input id="m-name" value="${esc(e.name)}"></label>
    <label>New code (leave empty to keep it)<input id="m-pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="••••"></label>
    <label class="check"><input id="m-active" type="checkbox" ${e.active ? "checked" : ""}> Can sign in</label>
    <p class="err" id="m-err" role="alert"></p><div id="delZone"></div>
    <div class="foot"><button type="button" class="btn ghost" data-act="askDelEmp" data-id="${e.id}">Remove</button>
      <span class="right"><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn" type="submit">Save</button></span></div>
  </form></div>`;
}
async function submitEmpEdit(form) {
  const pin = $("#m-pin").value.trim();
  if (pin && !/^[0-9]{4,6}$/.test(pin)) return ($("#m-err").textContent = "Code: 4 to 6 numbers.");
  const { error } = await sb.rpc("update_employee", { p_id: form.dataset.id, p_name: $("#m-name").value.trim(), p_pin: pin || null, p_active: $("#m-active").checked });
  if (error) return ($("#m-err").textContent = errText(error));
  closeSheet(); await loadAll(); renderSettings(); toast(pin ? `Saved. New code: ${pin}` : "Saved");
}
async function submitStores() {
  try {
    for (const i of document.querySelectorAll("[data-sid]")) {
      const s = store(i.dataset.sid), v = i.value.trim();
      if (s && v && v !== s.name) { const { error } = await sb.from("stores").update({ name: v }).eq("id", s.id); if (error) throw error; }
    }
    const n = $("#newStore").value.trim();
    if (n) { const { error } = await sb.from("stores").insert({ org_id: S.org.id, name: n }); if (error) throw error; }
    await loadAll(); toast("Stores saved"); renderSettings();
  } catch (e) { toast(errText(e)); }
}

/* ───────────── store screen ───────────── */
function renderStore() {
  $("#bar").hidden = false;
  if (!$("#q")) {
    $("#app").innerHTML = `
      <div class="head"><div class="line"><div><span class="eyebrow">You're at</span><h2 id="storeName"></h2></div>
        <div class="headlinks">${isOwner() ? `<button class="link" data-act="settings">⚙ Employees</button>` : ""}<button class="link" data-act="changeStore">Change store</button></div></div>
        <input id="q" type="search" placeholder="Search: case 16, cable…" autocomplete="off"></div>
      <div id="lowBox"></div>
      <details class="today" id="today"><summary id="todaySum"></summary><div id="todayList"></div></details>
      <h3>Inventory</h3><div class="list" id="plist"></div>`;
    $("#q").addEventListener("input", (e) => { S.q = e.target.value; renderList(); });
  }
  $("#storeName").textContent = store(S.storeId)?.name || "";
  renderToday(); renderList();
}
function renderToday() {
  const tot = S.sales.reduce((a, s) => a + s.unit_price * s.qty, 0);
  const n = S.sales.reduce((a, s) => a + s.qty, 0);
  $("#todaySum").innerHTML = `<span><span class="eyebrow">Today's sales</span><br><span class="muted" style="font-size:14px">${n} ${n === 1 ? "item" : "items"} · tap to see</span></span><span class="tot">${money(tot)}</span>`;
  $("#todayList").innerHTML = (S.sales.length
    ? S.sales.map((s) => `<div class="sale"><div style="min-width:0"><div>${s.qty} × ${esc(s.product_name)}</div>
        <div class="meta">${time(s.created_at)} · ${money(s.unit_price)} each${(s.seller_name || S.people.get(s.sold_by)) ? " · " + esc(s.seller_name || S.people.get(s.sold_by)) : ""}</div></div>
        <span class="amt">${money(s.unit_price * s.qty)}</span><button class="undo" data-act="voidSale" data-id="${s.id}">Void</button></div>`).join("")
    : `<div class="empty">No sales yet today in this store.</div>`)
    + `<div class="tools"><button class="btn ghost wide" data-act="summary">Copy day summary for WhatsApp</button></div>`;
}
function renderList() {
  const sid = S.storeId;
  const low = S.products.filter((p) => qtyOf(p.id, sid) < p.low_stock_threshold).sort((a, b) => qtyOf(a.id, sid) - qtyOf(b.id, sid));
  $("#lowBox").innerHTML = low.length ? `<div class="lowbox"><div class="lowhead"><span class="eyebrow">Reorder · running low</span><b class="num">${low.length}</b></div>
    ${low.map((p) => `<div class="lowitem"><span>${esc(p.name)}</span><b class="num">${qtyOf(p.id, sid) ? qtyOf(p.id, sid) + " left" : "sold out"}</b></div>`).join("")}</div>` : "";
  if (!S.products.length) { $("#plist").innerHTML = `<div class="empty">Nothing here yet. Tap <b>+ Add</b> to add your first accessory.</div>`; return; }
  const words = S.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = S.products.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
  $("#plist").innerHTML = list.length ? list.map((p) => {
    const q = qtyOf(p.id, sid);
    return `<div class="row">${thumb(p)}<div style="min-width:0">
      <button class="name" data-act="edit" data-id="${p.id}">${esc(p.name)}</button>
      <div class="cost">Cost <b>${money(p.cost)}</b>${p.price != null ? ` · Price <b>${money(p.price)}</b>` : ""}
        · <button class="editlink" data-act="edit" data-id="${p.id}">Edit</button></div></div>
      <div class="stepper"><button data-act="dec" data-id="${p.id}" aria-label="Remove one">−</button>
      <span class="q ${q < p.low_stock_threshold ? "low" : ""}">${q}</span>
      <button data-act="inc" data-id="${p.id}" aria-label="Add one">+</button></div></div>`;
  }).join("") : `<div class="empty">Nothing matches your search.</div>`;
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
    if (error) toast("Didn't save. Check your connection."); else S.inv.set(k, data);
    renderList();
  }, 700));
}

/* ───────────── sell ───────────── */
function openSale() { S.sale = { pid: null, q: "" }; drawSale(); }
function drawSale() {
  const sid = S.storeId, p = S.sale.pid && product(S.sale.pid);
  if (!p) {
    const words = S.sale.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = S.products.filter((x) => words.every((w) => x.name.toLowerCase().includes(w)));
    const picks = list.length ? list.map((x) => { const n = qtyOf(x.id, sid);
      return `<button type="button" class="pick" data-act="pickSale" data-id="${x.id}" ${n ? "" : "disabled"}><span class="pickname">${thumb(x, "thumb sm")}<b>${esc(x.name)}</b></span><span class="left">${n ? n + " left" : "sold out"}</span></button>`; }).join("")
      : `<div class="empty">Not on the list. Add it first with + Add.</div>`;
    if ($("#picks")) { $("#picks").innerHTML = picks; return; }
    $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><form class="sheet" id="saleForm" novalidate>
      <h2>What did you sell?</h2>
      <input id="s-q" type="search" placeholder="Search: case 16" autocomplete="off">
      <div class="picks" id="picks">${picks}</div>
      <div class="foot"><span></span><button type="button" class="btn ghost" data-act="close">Cancel</button></div></form></div>`;
    $("#s-q").addEventListener("input", (e) => { S.sale.q = e.target.value; drawSale(); });
    return;
  }
  const max = qtyOf(p.id, sid);
  $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><form class="sheet" id="saleForm" novalidate>
    <h2>Record a sale</h2>
    <div class="chosen"><div class="pickname">${thumb(p)}<div><b>${esc(p.name)}</b><div class="cost">${max} left at ${esc(store(sid)?.name)}</div></div></div>
      <button type="button" class="link" data-act="repick">Change</button></div>
    <label>Sale price (each, USD)<input id="s-price" type="number" step="0.01" min="0" inputmode="decimal" value="${p.price ?? ""}" placeholder="0.00"></label>
    <label>Quantity<div class="qtyrow"><button type="button" data-act="sq" data-d="-1" aria-label="Less">−</button>
      <input id="s-qty" type="number" min="1" max="${max}" inputmode="numeric" value="1">
      <button type="button" data-act="sq" data-d="1" aria-label="More">+</button></div></label>
    <div class="total"><span>Total</span><b id="s-total">${money(p.price || 0)}</b></div>
    <p class="err" id="s-err" role="alert"></p>
    <div class="foot"><button type="button" class="btn ghost" data-act="close">Cancel</button>
      <button class="btn" type="submit" style="flex:1">Sell and update stock</button></div></form></div>`;
  const upd = () => ($("#s-total").textContent = money((parseFloat($("#s-price").value) || 0) * (parseInt($("#s-qty").value, 10) || 0)));
  $("#s-price").addEventListener("input", upd); $("#s-qty").addEventListener("input", upd);
  if (p.price == null) setTimeout(() => $("#s-price").focus(), 50);
}
async function submitSale(form) {
  const p = product(S.sale.pid), sid = S.storeId;
  const price = parseFloat($("#s-price").value), qty = parseInt($("#s-qty").value, 10), have = qtyOf(p.id, sid);
  if (!(price >= 0) || $("#s-price").value === "") return ($("#s-err").textContent = "Enter the price you sold it for.");
  if (!(qty > 0)) return ($("#s-err").textContent = "Quantity must be 1 or more.");
  if (qty > have) return ($("#s-err").textContent = `Only ${have} left in this store.`);
  form.querySelector("[type=submit]").disabled = true;
  const { error } = await sb.rpc("record_sale", { p_product: p.id, p_store: sid, p_qty: qty, p_price: price });
  if (error) { form.querySelector("[type=submit]").disabled = false; $("#s-err").textContent = errText(error); return; }
  closeSheet(); await loadAll(); render();
  toast(`Sold ${qty} × ${p.name}. ${qtyOf(p.id, sid)} left.`);
}
async function voidSale(id, btn) {
  if (btn.dataset.sure !== "1") {
    btn.dataset.sure = "1"; btn.textContent = "Sure?";
    setTimeout(() => { if (btn.isConnected) { btn.dataset.sure = ""; btn.textContent = "Void"; } }, 3000);
    return;
  }
  const { error } = await sb.rpc("void_sale", { p_sale: id });
  if (error) return toast(errText(error));
  await loadAll(); render(); toast("Sale voided. Units returned to stock.");
}
async function copySummary() {
  const s = store(S.storeId), tot = S.sales.reduce((a, x) => a + x.unit_price * x.qty, 0);
  const profit = S.sales.reduce((a, x) => a + (x.unit_price - x.unit_cost) * x.qty, 0);
  const n = S.sales.reduce((a, x) => a + x.qty, 0);
  const low = S.products.filter((p) => qtyOf(p.id, S.storeId) < p.low_stock_threshold);
  const date = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const text = [`📍 ${s.name} — ${date}`, `Accessories sold: ${n}`, `Total: ${money(tot)}`, `Profit: ${money(profit)}`,
    ...(S.sales.length ? ["", ...S.sales.slice().reverse().map((x) => `• ${x.qty} × ${x.product_name} — ${money(x.unit_price * x.qty)}`)] : []),
    ...(low.length ? ["", "Reorder:", ...low.map((p) => `• ${p.name} (${qtyOf(p.id, S.storeId)} left)`)] : [])].join("\n");
  try { await navigator.clipboard.writeText(text); toast("Copied. Paste it in the WhatsApp group."); }
  catch (_) {
    $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><div class="sheet"><h2>Day summary</h2>
      <p class="muted">Select all and copy it into the WhatsApp group.</p><textarea readonly>${esc(text)}</textarea>
      <button class="btn" data-act="close">Done</button></div></div>`;
  }
}

/* ───────────── add / edit ───────────── */
function openEdit(id) {
  const p = id ? product(id) : { name: "", cost: "", low_stock_threshold: 3 };
  const sname = store(S.storeId)?.name || "";
  S.photo = { file: null, remove: false };
  $("#sheetRoot").innerHTML = `<div class="sheetbg" data-act="closeBg"><form class="sheet" id="pform" data-id="${id || ""}" novalidate>
    <h2>${id ? "Edit" : "Add to inventory"}</h2>
    <label>Name<input id="f-name" value="${esc(p.name)}" placeholder="Case iPhone 16"></label>
    <div class="photoBox"><span class="phlabel">Photo (optional)</span>
      <div class="photoField"><div id="f-prev">${thumb(p, "thumb big")}</div>
        <div class="photoBtns">
          <label class="btn ghost filebtn">Take photo<input id="f-cam" type="file" accept="image/*" capture="environment" hidden></label>
          <label class="btn ghost filebtn">Choose<input id="f-photo" type="file" accept="image/*" hidden></label>
          <button type="button" class="btn ghost filebtn" data-act="pastePhoto">Paste</button>
        </div></div>
      <p class="muted" id="f-phint" style="font-size:13px">On a computer you can also press Ctrl+V (⌘V on Mac) to paste a copied image.</p>
      <button type="button" class="link" data-act="rmPhoto" id="f-rm" ${p.photo_path ? "" : "hidden"}>Remove photo</button></div>
    <div class="grid2"><label>Cost (USD)<input id="f-cost" type="number" step="0.01" min="0" inputmode="decimal" value="${p.cost}"></label>
      <label>Sale price (USD)<input id="f-price" type="number" step="0.01" min="0" inputmode="decimal" value="${p.price ?? ""}" placeholder="Shown to customers"></label></div>
    <div class="grid2"><label>Stock at ${esc(sname)}<input id="f-stock" type="number" min="0" inputmode="numeric" value="${id ? qtyOf(id, S.storeId) : 0}"></label>
      <label>Alert when fewer than<input id="f-low" type="number" min="0" inputmode="numeric" value="${p.low_stock_threshold}"></label></div>
    <p class="err" id="f-err" role="alert"></p><div id="delZone"></div>
    <div class="foot">${id && isOwner() ? `<button type="button" class="btn ghost" data-act="askDel" data-id="${id}">Delete</button>` : ""}
      <span class="right"><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn" type="submit">Save</button></span></div>
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
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) { const blob = await item.getType(type); return setPhoto(new File([blob], "pasted." + type.split("/")[1], { type })); }
    }
    $("#f-err").textContent = "There's no image copied. Copy a photo first, then tap Paste.";
  } catch (_) {
    $("#f-err").textContent = "This browser can't read the clipboard from a button. Press Ctrl+V (⌘V) here, or use Take photo / Choose.";
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
  if (!img) img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That file isn't a photo we can read.")); i.src = URL.createObjectURL(file); });
  const sc = Math.min(1, 480 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
}
async function submitEdit(form) {
  const id = form.dataset.id, sid = S.storeId, name = $("#f-name").value.trim();
  if (!name) return ($("#f-err").textContent = "Enter a name, for example: Case iPhone 16.");
  const priceTxt = $("#f-price").value.trim();
  const fields = { name, cost: parseFloat($("#f-cost").value) || 0, price: priceTxt === "" ? null : parseFloat(priceTxt) || 0,
    low_stock_threshold: parseInt($("#f-low").value, 10) || 0 };
  const want = parseInt($("#f-stock").value, 10) || 0;
  const btn = form.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "Saving…";
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
    closeSheet(); await loadAll(); render(); toast(id ? "Saved" : "Added");
  } catch (e) { $("#f-err").textContent = errText(e); btn.disabled = false; btn.textContent = "Save"; }
}
function closeSheet() { $("#sheetRoot").innerHTML = ""; S.sale = null; }

/* ───────────── events ───────────── */
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act],[data-store]"); if (!el) return;
  if (el.dataset.store) { setStore(el.dataset.store); $("#app").innerHTML = ""; await loadSales(); render(); scrollTo(0, 0); return; }
  const a = el.dataset.act, id = el.dataset.id;
  if (a === "closeBg" && e.target !== el) return;
  const actions = {
    toCatalog: () => renderCatalog(),
    copyCat: async () => { const t = $("#catLink").textContent;
      try { await navigator.clipboard.writeText(t); toast("Link copied"); }
      catch (_) { const r = document.createRange(); r.selectNodeContents($("#catLink")); getSelection().removeAllRanges(); getSelection().addRange(r); toast("Selected. Copy it with your phone's Copy button."); } },
    retry: route, toSignUp: () => renderAuth("up"), toSignIn: () => renderAuth("in"), toEmp: () => renderAuth("emp"),
    editEmp: () => openEmp(id),
    askDelEmp: () => ($("#delZone").innerHTML = `<div class="confirm">Remove this employee? Their past sales stay. <button type="button" class="btn danger" data-act="doDelEmp" data-id="${id}">Yes, remove</button></div>`),
    doDelEmp: async () => { const { error } = await sb.rpc("delete_employee", { p_id: id }); if (error) return toast(errText(error));
      closeSheet(); await loadAll(); renderSettings(); toast("Employee removed"); },
    signOut: async () => { await sb.auth.signOut(); setStore(null); S.view = "main"; },
    addStoreField: () => { const n = document.querySelectorAll(".o-store").length + 1;
      $("#o-stores").insertAdjacentHTML("beforeend", `<label>Store ${n}<input class="o-store"></label>`); },
    settings: () => { S.view = "settings"; $("#app").innerHTML = ""; render(); scrollTo(0, 0); }, back: () => { S.view = "main"; $("#app").innerHTML = ""; render(); },
    changeStore: () => { setStore(null); $("#app").innerHTML = ""; render(); },
    inc: () => bump(id, 1), dec: () => bump(id, -1),
    edit: () => openEdit(id), add: () => openEdit(null), sell: openSale,
    pickSale: () => { S.sale.pid = id; drawSale(); },
    repick: () => { S.sale.pid = null; $("#sheetRoot").innerHTML = ""; drawSale(); },
    sq: () => { const i = $("#s-qty"), max = +i.max || 1; i.value = Math.min(max, Math.max(1, (parseInt(i.value, 10) || 1) + +el.dataset.d)); i.dispatchEvent(new Event("input")); },
    voidSale: () => voidSale(id, el), summary: copySummary,
    close: closeSheet, closeBg: closeSheet,
    askDel: () => ($("#delZone").innerHTML = `<div class="confirm">Delete it from every store? <button type="button" class="btn danger" data-act="doDel" data-id="${id}">Yes, delete</button></div>`),
    rmPhoto: () => { S.photo = { file: null, remove: true }; $("#f-prev").innerHTML = thumb({ name: $("#f-name").value }, "thumb big"); $("#f-rm").hidden = true; },
    pastePhoto,
    doDel: async () => { const old = product(id)?.photo_path; const { error } = await sb.from("products").delete().eq("id", id);
      if (error) return toast(errText(error)); if (old) sb.storage.from("product-photos").remove([old]); closeSheet(); await loadAll(); render(); toast("Deleted"); },
  };
  actions[a]?.();
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  ({ authForm: () => submitAuth(f), empForm: () => submitEmp(f), orgForm: submitOrg, storesForm: submitStores,
     empAddForm: submitEmpAdd, empEditForm: () => submitEmpEdit(f),
     saleForm: () => S.sale?.pid && submitSale(f), pform: () => submitEdit(f) })[f.id]?.();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

/* ───────────── start ───────────── */
if (SUPABASE_URL.includes("YOUR-PROJECT")) {
  $("#app").innerHTML = `<div class="card"><h2>Almost there</h2><p class="muted">Open <b>config.js</b> and paste your Supabase URL and anon key.</p></div>`;
} else {
  const { data } = await sb.auth.getSession();
  S.session = data.session; route();
  sb.auth.onAuthStateChange((evt, session) => {
    const changed = (session?.user?.id || null) !== (S.session?.user?.id || null);
    S.session = session;
    if (changed && !S.busyLogin) { $("#app").innerHTML = ""; route(); }
  });
}
