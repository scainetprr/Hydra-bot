const guildId = location.pathname.split("/").pop();
let schema = [], config = {}, meta = { channels: [], roles: [] }, info = {}, ME = null;
let activeModule = "overview";

// Los errores de JavaScript en el panel eran invisibles: el modulo se quedaba
// en blanco o en "Cargando..." sin decir por que. Ahora se avisa arriba.
window.addEventListener("error", (ev) => {
  console.error("Error en el panel:", ev.error || ev.message);
  mostrarAviso("❌ Error en el panel: " + (ev.error && ev.error.message ? ev.error.message : ev.message));
});
window.addEventListener("unhandledrejection", (ev) => {
  const r = ev.reason;
  console.error("Promesa rechazada en el panel:", r);
  mostrarAviso("❌ Error en el panel: " + (r && r.message ? r.message : String(r)));
});
function mostrarAviso(txt) {
  let b = document.getElementById("errbanner");
  if (!b) {
    b = document.createElement("div");
    b.id = "errbanner";
    b.style.cssText = "position:fixed;left:16px;right:16px;top:12px;z-index:9999;padding:10px 14px;border-radius:12px;background:#3a1114;border:1px solid #ed4245;color:#ffd9dc;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.4)";
    document.body.appendChild(b);
  }
  b.textContent = txt;
  b.onclick = () => b.remove();
}

function toast(msg, ok = true) {
  const t2 = document.getElementById("toast");
  t2.textContent = msg;
  t2.style.display = "block";
  t2.style.borderColor = ok ? "var(--ok)" : "var(--bad)";
  clearTimeout(t2._h);
  t2._h = setTimeout(() => (t2.style.display = "none"), 2600);
}
function getPath(o, d) { return d.split(".").reduce((a, k) => (a && typeof a === "object" ? a[k] : undefined), o); }

async function init() {
  try { if (localStorage.getItem("hydra-dense") === "1") document.body.classList.add("dense"); } catch {}
  const me = await fetch("/api/me").then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!me) { location.href = "/login"; return; }
  ME = me;
  document.getElementById("langbox").innerHTML = langSelector();
  document.getElementById("userbox").innerHTML =
    `<img src="${me.avatar || ""}" onerror="this.style.display='none'"><b>${me.username}</b><a class="btn ghost small" href="/logout">${t("logout")}</a>`;
  const [sch, g, m] = await Promise.all([
    fetch("/api/schema").then(r => r.json()),
    fetch(`/api/guild/${guildId}`).then(r => (r.ok ? r.json() : null)),
    fetch(`/api/guild/${guildId}/meta`).then(r => (r.ok ? r.json() : { channels: [], roles: [] })),
  ]);
  if (!g) { document.getElementById("main").innerHTML = `<div class="panel"><h2>${t("no_access_t")}</h2><p class="desc">${t("no_access_d")}</p></div>`; applyI18n(); return; }
  schema = sch; config = g.config; meta = m; info = g;
  document.getElementById("gname").textContent = g.name;
  document.getElementById("gicon").src = g.icon || "https://cdn.discordapp.com/embed/avatars/0.png";
  applyI18n();
  buildNav();
  show("overview");
}

const GROUPS = [
  { id: "intro", icon: "📥", key: "intro_group", modules: ["welcome", "goodbye", "verification", "invites"] },
  { id: "events", icon: "🎪", key: "events_group", modules: ["events", "eventos", "equipos", "inscriptions"] },
  { id: "utils", icon: "⚙️", key: "utils_group", modules: ["botmode", "socials", "suggestions", "reactionroles", "joinranks", "mediaonly", "mcserver", "webhooks"] },
  { id: "fun", icon: "🎯", key: "fun_group", modules: ["giveaways", "clips", "stats", "polls", "starboard", "afk", "tempvoice", "musica", "confesiones"] },
  { id: "manage", icon: "🔧", key: "manage_group", modules: ["auditlog", "antinuke", "autorespond", "sticky", "embedbuilder", "quickactions", "mensajes", "tickets", "roles", "servicios", "promociones"] },
  { id: "mod", icon: "🛡️", key: "mod_group", modules: ["automod", "lockdown", "joins", "logging", "sanctions", "cmdperms"] },
];
const INTRO_GROUP = GROUPS[0].modules;
const EVENTS_GROUP = GROUPS[1].modules;
const UTILS_GROUP = GROUPS[2].modules;
const FUN_GROUP = GROUPS[3].modules;
const MANAGE_GROUP = GROUPS[4].modules;
const MOD_GROUP = GROUPS[5].modules;
const NAV_OPEN = { intro: false, events: false, utils: false, fun: false, manage: false, mod: false, extras: false };
let navQ = "";
function normTxt(s) {
  return (s == null ? "" : String(s)).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function navFilter(v) {
  navQ = v || "";
  buildNav();
}
function toggleGroup(id) { NAV_OPEN[id] = !NAV_OPEN[id]; buildNav(); }
function groupOpen(id) { return !!navQ || !!NAV_OPEN[id]; }
function toggleDensity() {
  const on = document.body.classList.toggle("dense");
  try { localStorage.setItem("hydra-dense", on ? "1" : "0"); } catch {}
  paintDensity();
}
function paintDensity() {
  const b = document.getElementById("densitybtn");
  if (b) b.textContent = document.body.classList.contains("dense") ? "⤢ " + t("density_wide") : "⤡ " + t("density_compact");
  const n = document.getElementById("sidenote");
  if (n) n.textContent = t("sidebar_hint");
  const s = document.getElementById("navsearch");
  if (s && s.placeholder !== t("nav_search")) s.placeholder = t("nav_search");
  const g = document.getElementById("gsub");
  if (g) g.textContent = info.memberCount != null ? `${info.memberCount} ${t("members")}` : "";
}
// Páginas propias del panel (no viven en el schema, pero sí en la navegación)
const CUSTOM_PAGES = [
  { module: "modulesw", icon: "🔘", key: "msw_t", group: "mod" },
  { module: "permits", icon: "🪪", key: "permits_t", group: "mod" },
  { module: "rescue", icon: "🆘", key: "rescue_t", group: "manage" },
  { module: "premium", icon: "💎", key: "prem_t", group: "manage" },
];
function customPage(mod) { return CUSTOM_PAGES.find(p => p.module === mod); }
function buildNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const vis = schema.filter(s => !s.hideNav && (!s.ownerOnly || (ME && ME.isOwner)));
  const q = normTxt(navQ);
  const hits = s => !q || normTxt(L(s, "title")).includes(q) || normTxt(s.module).includes(q) || normTxt(s.icon).includes(q);
  const item = s => `<button class="navitem ${s.module === activeModule ? "active" : ""}" onclick="show('${s.module}')"><span class="ic">${s.icon || "•"}</span><span class="tx">${L(s, "title")}</span></button>`;
  const plainItem = (mod, icon, title) => `<button class="navitem ${mod === activeModule ? "active" : ""}" onclick="show('${mod}')"><span class="ic">${icon}</span><span class="tx">${title}</span></button>`;
  // Paginas que van plegadas dentro de su grupo en vez de sueltas
  const NAV_FOLD = new Set(["permits", "rescue"]);
  const navCustomItem = (p) => {
    const boton = plainItem(p.module, p.icon, t(p.key));
    if (!NAV_FOLD.has(p.module)) return boton;
    return `<details class="navfold"><summary>${p.icon} ${t(p.key)}</summary><div class="navfoldbody">${boton}</div></details>`;
  };
  const inGroup = m => GROUPS.some(g => g.modules.includes(m));
  let html = "";
  const showOverview = !q || "overview".includes(q) || normTxt(t("overview")).includes(q);
  if (showOverview) html += plainItem("overview", "ℹ️", t("overview"));
  const wst = wizState();
  if (!q || "wizard".includes(q) || normTxt(t("wiz_t")).includes(q)) {
    html += `<button class="navitem ${activeModule === "wizard" ? "active" : ""}" onclick="show('wizard')"><span class="ic">🧙</span><span class="tx">${t("wiz_t")}</span>${wst.pending.length ? `<span class="badge-mini">${wst.pending.length}</span>` : `<span class="badge-mini" style="color:var(--ok)">✓</span>`}</button>`;
  }
  for (const g of GROUPS) {
    const items = vis.filter(s => g.modules.includes(s.module) && hits(s));
    const custom = CUSTOM_PAGES.filter(p => p.group === g.id && (!q || normTxt(t(p.key)).includes(q) || normTxt(p.module).includes(q)));
    if (q && !items.length && !custom.length && !normTxt(t(g.key)).includes(q)) continue;
    if (!items.length && !custom.length) continue;
    const open = groupOpen(g.id);
    const n = items.length + custom.length;
    html += `<button class="navgroup ${open ? "open" : ""}" onclick="toggleGroup('${g.id}')"><span class="ic">${g.icon}</span><span class="tx">${t(g.key)}</span><span class="navcount">${n}</span><span class="cv">▶</span></button>`;
    if (open) html += `<div class="navsub">${items.map(item).join("")}${custom.map(p => navCustomItem(p)).join("")}</div>`;
  }
  const looseCustom = CUSTOM_PAGES.filter(p => !p.group && hits({ module: p.module, title: t(p.key), icon: p.icon }))
    .map(p => plainItem(p.module, p.icon, t(p.key)));
  const loose = [...vis.filter(s => !inGroup(s.module) && hits(s)).map(item), ...looseCustom];
  if (loose.length) {
    const open = groupOpen("extras");
    html += `<button class="navgroup ${open ? "open" : ""}" onclick="toggleGroup('extras')"><span class="ic">🧩</span><span class="tx">${t("extras_group")}</span><span class="navcount">${loose.length}</span><span class="cv">▶</span></button>`;
    if (open) html += `<div class="navsub">${loose.join("")}</div>`;
  }
  if (!q) html += plainItem("staff", "👮", t("staff"));
  if (!html) html = `<div class="navempty">${t("nav_none")}</div>`;
  nav.innerHTML = html;
  paintDensity();
}

function show(mod) {
  const sec0 = schema.find(s => s.module === mod);
  if (sec0 && sec0.ownerOnly && !(ME && ME.isOwner)) mod = "overview";
  activeModule = mod;
  buildNav();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  if (mod === "overview") return renderOverview();
  if (mod === "staff") return renderStaff();
  if (mod === "lockdown") return renderLockdown();
  if (mod === "eventos") return renderEventos();
  if (mod === "equipos") return renderEquipos();
  if (mod === "auditlog") return renderAuditLog();
  if (mod === "embedbuilder") return renderEmbedBuilder();
  if (mod === "quickactions") return renderQuickActions();
  if (mod === "suggestions") return renderSuggestions();
  if (mod === "starboard") return renderStarboard();
  if (mod === "sticky") return renderSticky();
  if (mod === "afk") return renderAfk();
  if (mod === "reactionroles") return renderReactionroles();
  if (mod === "antinuke") return renderAntinuke();
  if (mod === "autorespond") return renderAutorespond();
  if (mod === "tempvoice") return renderTempvoice();
  if (mod === "joinranks") return renderJoinranks();
  if (mod === "mediaonly") return renderMediaonly();
  if (mod === "sanctions") return renderSanctions();
  if (mod === "cmdperms") return renderCmdPerms();
  if (mod === "modulesw") return renderModuleSw();
  if (mod === "permits") return renderPermits();
  if (mod === "rescue") return renderRescue();
  if (mod === "premium") return renderPremium();
  if (mod === "wizard") return renderWizard();
  const section = schema.find(s => s.module === mod);
  if (section) return renderModule(section);
}

const MODBAR_SPECIAL = {
  overview: { icon: "ℹ️" }, staff: { icon: "👮" }, lockdown: { icon: "🔒" },
  eventos: { icon: "🎪" }, equipos: { icon: "🎪" }, auditlog: { icon: "📜" },
  embedbuilder: { icon: "🧱" }, quickactions: { icon: "⚡" }, suggestions: { icon: "💡" },
  starboard: { icon: "⭐" }, sticky: { icon: "📌" }, afk: { icon: "💤" },
  reactionroles: { icon: "🎭" }, antinuke: { icon: "🛡️" }, autorespond: { icon: "🤖" },
  tempvoice: { icon: "🎙️" }, joinranks: { icon: "🏅" }, mediaonly: { icon: "🖼️" },
  sanctions: { icon: "📋" }, cmdperms: { icon: "🔐" }, modulesw: { icon: "🔘" },   permits: { icon: "🪪" }, rescue: { icon: "🆘" }, premium: { icon: "💎" },
};
function modbarMeta(mod) {
  const s = schema.find(x => x.module === mod);
  if (s) return { icon: s.icon || "•", title: L(s, "title"), save: true };
  const sp = MODBAR_SPECIAL[mod];
  const fallback = { overview: t("overview"), staff: t("staff") };
  return { icon: (sp && sp.icon) || "•", title: fallback[mod] || mod, save: false };
}
function injectModBar() {
  const main = document.getElementById("main");
  if (!main || main.querySelector(".modbar") || !main.querySelector(".panel")) return;
  const m = modbarMeta(activeModule);
  const bar = document.createElement("div");
  bar.className = "modbar";
  bar.innerHTML = `<div class="mb-l"><span class="mb-ic">${m.icon}</span>
    <div><div class="mb-title">${m.title}</div><div class="mb-sub">${t("changes_for")} ${info.name}</div></div></div>
    <div class="mb-r">${m.save ? `<button class="btn" onclick="saveModule('${activeModule}')">💾 ${t("save")}</button><span class="status" id="mbstatus"></span>` : `<a class="btn ghost small" href="/servers">← Servers</a>`}${infoBtn("mod", activeModule)}</div>`;
  main.prepend(bar);
  const dk = activeModule + "_d";
  if (t(dk) !== dk) {
    const intro = document.createElement("div");
    intro.className = "modintro";
    intro.textContent = t(dk);
    bar.after(intro);
  }
}
function watchMain() {
  const main = document.getElementById("main");
  if (!main) return;
  new MutationObserver(injectModBar).observe(main, { childList: true, subtree: true });
}

async function renderLockdown() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>🔒 ${t("lockdown_t")}</h2>
    <p class="desc">${t("lockdown_d")}</p>
    <button class="btn danger" onclick="lockAction('lockdown')">🔒 ${t("lockdown_on")}</button>
    <button class="btn ghost" onclick="lockAction('unlock')">🔓 ${t("lockdown_off")}</button>
    <span class="status" id="lockstatus"></span></div>`;
}
async function lockAction(action) {
  const st = document.getElementById("lockstatus");
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + (action === "lockdown" ? t("lockdown_on") : t("lockdown_off"));
    st.className = "status ok";
    toast("✅ " + (action === "lockdown" ? t("lockdown_on") : t("lockdown_off")));
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}

async function renderEventos() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>🎪 ${t("events_mgmt")}</h2><div id="evlist">${t("staff_loading")}</div></div>
  <div class="panel"><h2>➕ ${t("ev_create")}</h2>
    <div class="field"><label>${t("ev_name")}</label><input type="text" id="evn_nombre" maxlength="100"></div>
    <div class="field"><label>${t("ev_desc")}</label><textarea id="evn_desc" rows="3" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text);font-size:14px;resize:vertical"></textarea></div>
    <div class="field"><label>${t("ev_mode")}</label><input type="text" id="evn_modo" maxlength="100"></div>
    <div class="field"><label>${t("ev_slots")}</label><input type="number" id="evn_cupos" value="50" min="1" max="10000"></div>
    <div class="field"><label>${t("ev_prize")}</label><input type="text" id="evn_premio" maxlength="500"></div>
    <div class="field"><label>${t("ev_date")}</label><input type="date" id="evn_fecha" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text)"></div>
    <div class="field"><label>${t("ev_time")}</label><input type="time" id="evn_hora" value="18:00" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text)"></div>
    <div class="field"><label>${t("test_channel")}</label><select id="evn_ch">${(meta.channels || []).filter(c => c.type === 0).map(c => `<option value="${c.id}"># ${c.name}</option>`).join("")}</select></div>
    <button class="btn" onclick="evCreate()">➕ ${t("ev_create")}</button>
    <span class="status" id="evn_status"></span></div>`;
  const list = await fetch(`/api/guild/${guildId}/events`).then(r => r.json()).catch(() => []);
  const box = document.getElementById("evlist");
  if (!list.length) { box.innerHTML = `<p class="desc">${t("no_results")}</p>`; return; }
  box.innerHTML = list.map(e => `
    <div class="rowline" style="flex-wrap:wrap">
      <span><b>${escHtml(e.nombre)}</b> <small style="color:var(--muted)">${e.id} • ${e.status} • 👥 ${e.count}/${e.cupos}</small></span>
      <span>
        <button class="btn small ghost" onclick="evDetail('${e.id}')">${t("ev_view")}</button>
        ${e.status !== "abierto" ? `<button class="btn small" onclick="evStatus('${e.id}','abierto')">${t("ev_open")}</button>` : ""}
        ${e.status === "abierto" ? `<button class="btn small ghost" onclick="evStatus('${e.id}','cerrado')">${t("ev_close")}</button>` : ""}
        ${e.status !== "finalizado" ? `<button class="btn small ghost" onclick="evStatus('${e.id}','finalizado')">${t("ev_finish")}</button>` : ""}
        <button class="btn small danger" onclick="evDelete('${e.id}')">${t("ev_delete")}</button>
      </span>
    </div><div id="evd_${e.id}"></div>`).join("");
}
async function evDetail(id) {
  const box = document.getElementById("evd_" + id);
  if (!box) return;
  if (box.innerHTML) { box.innerHTML = ""; return; }
  const e = await fetch(`/api/guild/${guildId}/events/${id}`).then(r => r.json()).catch(() => null);
  if (!e || e.error) return;
  box.innerHTML = `<div style="padding:8px 0 8px 12px;font-size:13px;color:var(--muted)">
    🎮 ${escHtml(e.modo || "")} • 📅 ${e.fechaTs ? new Date(e.fechaTs * 1000).toLocaleString() : "?"} • 🏆 ${escHtml(e.premio || "—")}<br>
    👥 ${(e.participants || []).slice(0, 20).map(p => escHtml(p.nick || p.userId)).join(", ") || "—"}
    ${(e.participants || []).length > 20 ? ` (+${e.participants.length - 20})` : ""}</div>
    <div style="padding:8px 0 8px 12px;display:grid;gap:8px;max-width:520px">
      <input type="text" id="eve_nombre_${e.id}" value="${escHtml(e.nombre || "").replace(/"/g, "&quot;")}" maxlength="100" placeholder="${t("ev_name")}" style="padding:8px 10px;border-radius:8px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text)">
      <textarea id="eve_desc_${e.id}" rows="2" placeholder="${t("ev_desc")}" style="padding:8px 10px;border-radius:8px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text);resize:vertical">${escHtml(e.desc || "")}</textarea>
      <div style="display:flex;gap:8px">
        <input type="text" id="eve_modo_${e.id}" value="${escHtml(e.modo || "").replace(/"/g, "&quot;")}" maxlength="100" placeholder="${t("ev_mode")}" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text)">
        <input type="number" id="eve_cupos_${e.id}" value="${e.cupos || 50}" min="1" max="10000" placeholder="${t("ev_slots")}" style="width:110px;padding:8px 10px;border-radius:8px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text)">
      </div>
      <input type="text" id="eve_premio_${e.id}" value="${escHtml(e.premio || "").replace(/"/g, "&quot;")}" maxlength="500" placeholder="${t("ev_prize")}" style="padding:8px 10px;border-radius:8px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text)">
      <div><button class="btn small" onclick="evSave('${e.id}')">💾 ${t("save")}</button></div>
    </div>`;
}
async function evCreate() {
  const st = document.getElementById("evn_status");
  const body = {
    nombre: document.getElementById("evn_nombre").value.trim(),
    desc: document.getElementById("evn_desc").value.trim(),
    modo: document.getElementById("evn_modo").value.trim(),
    cupos: Number(document.getElementById("evn_cupos").value) || 50,
    premio: document.getElementById("evn_premio").value.trim(),
    fecha: document.getElementById("evn_fecha").value,
    hora: document.getElementById("evn_hora").value,
    channelId: document.getElementById("evn_ch").value,
  };
  if (!body.nombre) { st.textContent = "❌ " + t("ev_name"); return; }
  if (!body.channelId) { st.textContent = "❌"; return; }
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/events`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + data.id;
    st.className = "status ok";
    toast("✅ " + data.id);
    renderEventos();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}
async function evSave(id) {
  const body = {
    nombre: document.getElementById("eve_nombre_" + id).value,
    desc: document.getElementById("eve_desc_" + id).value,
    modo: document.getElementById("eve_modo_" + id).value,
    cupos: Number(document.getElementById("eve_cupos_" + id).value) || undefined,
    premio: document.getElementById("eve_premio_" + id).value,
  };
  const r = await fetch(`/api/guild/${guildId}/events/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (r.ok) { toast(t("saved_ok")); renderEventos(); }
  else toast("❌ error", false);
}
async function evStatus(id, status) {
  await fetch(`/api/guild/${guildId}/events/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
  });
  renderEventos();
}
async function evDelete(id) {
  await fetch(`/api/guild/${guildId}/events/${id}`, { method: "DELETE" });
  renderEventos();
}

async function renderEquipos() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>👥 ${t("teams_mgmt")}</h2><div id="teamlist">${t("staff_loading")}</div></div>`;
  const list = await fetch(`/api/guild/${guildId}/teams`).then(r => r.json()).catch(() => []);
  const box = document.getElementById("teamlist");
  if (!list.length) { box.innerHTML = `<p class="desc">${t("no_results")}</p>`; return; }
  box.innerHTML = list.map((tm, ix) => `
    <div class="rowline"><span><b>${escHtml(tm.name)}</b> <small style="color:var(--muted)">👥 ${tm.members} • ${escHtml(tm.specialty || "")}</small></span>
    <span><button class="btn small ghost" onclick="teamRenameUI(${ix},'${escHtml(tm.name).replace(/'/g, "\\'")}')">${t("team_rename")}</button>
    <button class="btn small danger" onclick="teamDelete('${encodeURIComponent(tm.name)}')">${t("ev_delete")}</button></span></div>
    <div id="tmr_${ix}"></div>`).join("");
}
function teamRenameUI(ix, oldName) {
  const box = document.getElementById("tmr_" + ix);
  if (!box) return;
  if (box.innerHTML) { box.innerHTML = ""; return; }
  box.innerHTML = `<div style="padding:8px 0 8px 12px;display:flex;gap:8px;max-width:420px">
    <input type="text" id="tmr_inp_${ix}" value="${oldName.replace(/"/g, "&quot;")}" maxlength="50" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text)">
    <button class="btn small" onclick="teamRenameGo(${ix},'${oldName.replace(/'/g, "\\'")}')">💾 ${t("save")}</button></div>`;
}
async function teamRenameGo(ix, oldName) {
  const nuevo = document.getElementById("tmr_inp_" + ix).value.trim();
  if (!nuevo) return;
  const r = await fetch(`/api/guild/${guildId}/teams/${encodeURIComponent(oldName)}/rename`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nuevo }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return toast("❌ " + (data.error || "error"), false);
  toast(t("saved_ok"));
  renderEquipos();
}
async function teamDelete(name) {
  await fetch(`/api/guild/${guildId}/teams/${name}`, { method: "DELETE" });
  renderEquipos();
}

// Estado real de cada módulo del schema (sin filas fantasma)
function moduleStateOf(sec) {
  const c = config || {};
  const en = sec.fields.find(f => f.type === "bool" && /Enabled$/.test(f.key));
  if (en) return { on: !!getPath(c, en.key), kind: "toggle" };
  const filled = sec.fields.filter(f => {
    const v = getPath(c, f.key);
    return v !== undefined && v !== null && v !== "" && v !== false && v !== 0;
  }).length;
  return { on: filled > 0, kind: "setup", filled, total: sec.fields.length };
}
function moduleStatusRows() {
  return schema.map(sec => {
    const st = moduleStateOf(sec);
    return { sec, st };
  });
}

function modStatusFilter(q) {
  const nq = normTxt(q);
  for (const el of document.querySelectorAll("#modstatus .modcell"))
    el.style.display = !nq || normTxt(el.dataset.s).includes(nq) ? "" : "none";
}

async function renderOverview() {
  const main = document.getElementById("main");
  let counts = {};
  try { counts = await fetch(`/api/guild/${guildId}/overview`).then(r => r.json()); } catch {}
  const vis = schema.filter(s => !s.hideNav && (!s.ownerOnly || (ME && ME.isOwner)));
  const enabled = [
    ["welcome", config.welcomeEnabled && config.welcomeChannelId],
    ["verification", config.verificationEnabled && config.verificationChannelId],
    ["tickets", !!config.ticketCategoryId],
    ["mcserver", !!(config.mcServer && config.mcServer.host)],
    ["inscriptions", !!config.inscriptionChannelId],
    ["moderation", !!config.antiLinkEnabled],
  ];
  const onCount = enabled.filter(([, on]) => on).length;
  const quickOf = m => (m === "staff" ? { module: "staff", icon: "👮", title: t("staff") } : schema.find(s => s.module === m));
  const quickModules = ["welcome", "tickets", "automod", "suggestions", "giveaways", "staff"];
  const quickCards = quickModules.map(m => quickOf(m)).filter(Boolean).map(s => {
    const on = m => (m === "welcome" ? (config.welcomeEnabled && config.welcomeChannelId)
      : m === "tickets" ? !!config.ticketCategoryId
      : m === "automod" ? !!config.antiLinkEnabled
      : m === "suggestions" ? !!config.suggestionsEnabled
      : m === "giveaways" ? !!config.giveawayEnabled
      : true);
    const isOn = on(s.module);
    return `<div class="quickcard" onclick="show('${s.module}')">
      <div class="qic">${s.icon || "•"}</div>
      <div style="min-width:0"><div class="qt">${L(s, "title")}</div>
      <div class="qs">${isOn ? '<span style="color:var(--ok)">● ' + t("active") + '</span>' : '<span style="color:var(--muted)">○ ' + t("off") + '</span>'}</div></div>
    </div>`;
  }).join("");
  main.innerHTML = `
    <div class="modbar"><div class="mb-l"><span class="mb-ic">ℹ️</span>
      <div><div class="mb-title">${t("overview")}</div><div class="mb-sub">${info.name}</div></div></div>
      <div class="mb-r"><a class="btn ghost small" href="/servers">← Servers</a></div></div>
    <div class="statgrid">
      <div class="statcard"><div class="sk">${t("members_l")}</div><div class="sv">${info.memberCount ?? "?"}</div><div class="sd">${t("members")}</div></div>
      <div class="statcard"><div class="sk">${t("modules")}</div><div class="sv">${onCount}/${enabled.length}</div><div class="sd">${t("active")}</div></div>
      <div class="statcard"><div class="sk">${t("events_l")}</div><div class="sv">${counts.events ?? "?"}</div><div class="sd">${t("details")}</div></div>
      <div class="statcard"><div class="sk">${t("teams_l")}</div><div class="sv">${counts.teams ?? "?"}</div><div class="sd">${t("details")}</div></div>
      <div class="statcard"><div class="sk">${t("tickets_l")}</div><div class="sv">${counts.tickets ?? "?"}</div><div class="sd">${t("details")}</div></div>
    </div>
    <div class="panel"><h2>${t("quick_links")}</h2><p class="desc">${t("modules_sub")}</p>
      <div class="quickgrid">${quickCards}</div></div>
    <div class="panel"><h2>🗺️ ${t("om_map")}</h2><p class="desc">${t("om_map_d")}</p>
      <div class="fields">${GROUPS.map(g => {
        const items = g.modules.map(m => schema.find(s => s.module === m)).filter(s => s && !s.hideNav && (!s.ownerOnly || (ME && ME.isOwner)));
        const extra = m => (m === "staff" ? `<button class="toc" onclick="show('staff')">👮 ${t("staff")}</button>` : m === "wizard" ? `<button class="toc" onclick="show('wizard')">🧙 ${t("wiz_t")}</button>` : "");
        if (!items.length) return "";
        return `<div class="subpanel" style="margin:0">
          <div class="cp-adv-h" style="margin-bottom:8px">${g.icon} ${t(g.key)}</div>
          <div class="toc">${items.map(s => `<a href="#${s.module}" onclick="show('${s.module}');return false">${s.icon || "•"} ${L(s, "title")}</a>`).join("")}</div></div>`;
      }).join("")}</div></div>
    <div class="panel"><h2>${t("details")}</h2>
      <div class="kv">
        <div class="cell"><div class="k">${t("server")}</div><div class="v">${info.name}</div></div>
        <div class="cell"><div class="k">${t("server_id")}</div><div class="v" style="font-size:12px">${info.id}</div></div>
        <div class="cell"><div class="k">${t("members_l")}</div><div class="v">${info.memberCount ?? "?"}</div></div>
        <div class="cell"><div class="k">${t("events_l")}</div><div class="v">${counts.events ?? "?"}</div></div>
        <div class="cell"><div class="k">${t("teams_l")}</div><div class="v">${counts.teams ?? "?"}</div></div>
        <div class="cell"><div class="k">${t("tickets_l")}</div><div class="v">${counts.tickets ?? "?"}</div></div>
      </div>
    </div>
    <div class="panel"><h2>${t("modules")}</h2><p class="desc">${t("modules_sub")}</p>
      <div id="modstatus" class="modstatus"></div>
    </div>`;
  const st = document.getElementById("modstatus");
  const rows = moduleStatusRows();
  const modsOn = rows.filter(r => r.st.on).length;
  st.innerHTML = `<div class="cp-info" style="margin-bottom:12px">
      <span class="navcount">${modsOn}/${rows.length} ${t("active").toLowerCase()}</span>
      <span class="navcount">${schema.length} ${t("modules").toLowerCase()}</span>
      <input id="modq" type="text" placeholder="${t("g_filter")}" oninput="modStatusFilter(this.value)" style="flex:1;min-width:160px;max-width:260px;padding:7px 11px;border-radius:10px;border:1px solid var(--card-border);background:rgba(0,0,0,.4);color:var(--text);font-size:13px">
    </div>
    <div class="modgrid">${rows.map(r => `<button class="modcell ${r.st.on ? "on" : ""}" data-s="${escHtml((L(r.sec, "title") || "") + " " + r.sec.module)}" onclick="show('${r.sec.module}')">
        <span class="mi">${r.sec.icon || "•"}</span>
        <span class="mt">${escHtml(L(r.sec, "title") || r.sec.module)}</span>
        <span class="ms">${r.st.kind === "toggle"
          ? (r.st.on ? "● " + t("active") : "○ " + t("off"))
          : `${r.st.filled || 0}/${r.st.total} ${t("cases_filled")}`}</span>
      </button>`).join("")}</div>`;
}

const MULTILINE_SUFFIX = ["Desc", "Message", "Expired", "Already"];
// Textos por defecto reales del bot (solo visual, como placeholder)
const DEFAULTS = {
  verifyTitle: "🔐 Verificación Requerida",
  verifyDesc: "Para acceder al servidor, completa la verificación.\n\nHaz clic en el botón de abajo y escribe el código que veas.",
  verifyButton: "Verificarme", verifyColor: "#5865F2",
  captchaTitle: "🔐 Tu Captcha", captchaDesc: "Escribe el código:",
  verifySuccessTitle: "✅ Verificado", verifySuccessDesc: "¡Disfruta el servidor!",
  verifyFailTitle: "❌ Incorrecto", verifyFailDesc: "Intenta de nuevo.",
  verifyExpiredMsg: "⏰ Captcha expirado. Haz clic en el botón de nuevo.",
  verifyAlreadyMsg: "✅ Ya estás verificado.", verifyTimeoutSec: "120",
  welcomeTitle: "✨ ¡Bienvenido/a, {member}! ✨",
  welcomeDesc: "",
  welcomeColor: "#5865F2", welcomeFooter: "🎉 ¡Disfruta tu estadía en {server}!",
  welcomeMessage: "", welcomeHelp: "Por favor, lee nuestras reglas antes de comenzar.\n\n💎 **¿Quieres participar en eventos?**\n¡Has llegado al lugar correcto!",
  goodbyeTitle: "😢 {member} salió del servidor",
  goodbyeDesc: "Ya no está con nosotros. ¡Le deseamos lo mejor!",
  goodbyeColor: "#FF5555", goodbyeFooter: "", goodbyeHelp: "Gracias por haber sido parte de **{server}**.",
  ticketTitle: "🎫 Ticket Abierto — {categoria}",
  ticketDesc: "Hola {user}, bienvenido a tu ticket de **{categoria}**.\n\n{staff} Un miembro del staff te atenderá pronto.\n**Por favor describe tu problema con detalle.**",
  ticketColor: "#00FF00", ticketFooter: "{server} • Soporte",
  ticketPanelTitle: "{server} Support Area",
  ticketPanelDesc: "¡Bienvenido al centro de soporte de **{server}**! 🐉\n\nAquí podrás acceder a diferentes tipos de tickets para obtener ayuda, reportar problemas o solicitar información.\n\n📌 **Lee detenidamente las instrucciones de cada categoría** antes de abrir un ticket para agilizar tu atención.\n\n🔥 **Nuestro equipo de staff está listo para ayudarte.**\n\n> *La paciencia y el respeto son fundamentales para un buen servicio.*",
  ticketPanelColor: "#00FF00", ticketPanelFooter: "{server} • Soporte",
  welcomeHelpFooter: "", goodbyeHelpFooter: "",
  verifyAuthorName: "", verifyAuthorIcon: "", verifyFooterIcon: "",
  welcomeAuthorName: "", welcomeAuthorIcon: "", welcomeFooterIcon: "",
  goodbyeAuthorName: "", goodbyeAuthorIcon: "", goodbyeFooterIcon: "",
  ticketAuthorName: "", ticketAuthorIcon: "", ticketFooterIcon: "",
  spotifyUserId: "", musicVolume: "100", confChannelId: "",
  badwords: "ej: spam, estafa, http",
  whitelistRoles: "IDs separadas por coma", whitelistUsers: "IDs separadas por coma",
  whitelistChannels: "IDs separadas por coma",
  antiLinkAllowChannels: "IDs separadas por coma", antiLinkAllowCategories: "IDs separadas por coma",
  bypassLinksRoles: "IDs separadas por coma", bypassImagesRoles: "IDs separadas por coma",
  bypassVideosRoles: "IDs separadas por coma",
  joinGateMinAge: "7", antiRaidCount: "5", antiRaidSeconds: "15",
  capsMinLen: "10", capsPercent: "70", spamCount: "5", spamSeconds: "10",
  emojiMax: "5", automodTimeoutMin: "10",
  "mcServer.host": "localhost", "mcServer.port": "25565",
};
function phFor(key) {
  const v = DEFAULTS[key];
  if (v === undefined || v === "") return "";
  return String(v).replace(/\n/g, " ").slice(0, 140);
}
function inputFor(f) {
  const val = getPath(config, f.key);
  if (f.type === "text" && MULTILINE_SUFFIX.some(s => f.key.endsWith(s))) {
    return `<textarea id="f_${f.key.replace(/\./g, "_")}" rows="6" placeholder="${escHtml(phFor(f.key)).replace(/"/g, "&quot;")}" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text);font-size:14px;font-family:inherit;resize:vertical">${escHtml(val ?? "")}</textarea>`;
  }
  const id = `f_${f.key.replace(/\./g, "_")}`;
  if (f.type === "bool") {
    return `<label class="switch"><input type="checkbox" id="${id}" ${val ? "checked" : ""}><span class="slider"></span></label>`;
  }
  if (f.type === "channel") {
    const opts = `<option value="">${t("none_opt")}</option>` + meta.channels.map(c =>
      `<option value="${c.id}" ${c.id === val ? "selected" : ""}>${c.type === 4 ? "📁 " : "# "}${c.name}</option>`).join("");
    return `<select id="${id}">${opts}</select>`;
  }
  if (f.type === "role") {
    const opts = `<option value="">${t("none_opt")}</option>` + meta.roles.map(r =>
      `<option value="${r.id}" ${r.id === val ? "selected" : ""}>${r.name}</option>`).join("");
    return `<select id="${id}">${opts}</select>`;
  }
  if (f.type === "number") {
    return `<input type="number" id="${id}" value="${val ?? ""}" min="1" max="65535" placeholder="${escHtml(phFor(f.key)).replace(/"/g, "&quot;")}">`;
  }
  if (f.type === "seconds") {
    return `<input type="number" id="${id}" value="${val ?? ""}" min="10" max="3600" step="1" placeholder="${escHtml(phFor(f.key)).replace(/"/g, "&quot;")}">`;
  }
  if (f.type === "color") {
    return `<input type="text" id="${id}" value="${escHtml(val ?? "")}" maxlength="7" placeholder="${escHtml(phFor(f.key)).replace(/"/g, "&quot;")}">`;
  }
  if (f.type === "select") {
    const opts = (f.options || []).map(o =>
      `<option value="${o.value}" ${o.value === (val || "") ? "selected" : ""}>${escHtml(L(o, "label") || o.value || "—")}</option>`).join("");
    return `<select id="${id}">${opts}</select>`;
  }
  return `<input type="text" id="${id}" value="${(val ?? "").toString().replace(/"/g, "&quot;")}" placeholder="${escHtml(phFor(f.key)).replace(/"/g, "&quot;")}">`;
}

// ===== Agrupación de campos en tarjetas por tema (estructura legible) =====
// Textos detallados y personalizados para "ⓘ Qué hace" (ES, con fallback en el resto de idiomas)
const HELP = {
  g_state: {
    t: "Interruptores y activación",
    d: "Activa o desactiva cada parte del módulo sin perder lo configurado.",
    e: "Ejemplo: en Bienvenidas, apaga «Activar bienvenida» mientras pruebas el texto; todo lo demás (canal, imagen, variables) se conserva y vuelve a funcionar al encenderlo.",
  },
  g_act: {
    t: "Qué castigo se aplica",
    d: "Qué hace el bot ante una infracción: borrar, avisar, aislar, expulsar o banear.",
    e: "Ejemplo: si tu servidor es pequeño, usa «Advertir» + «Aislar». Si quieres limpiar spam rápido, «Borrar» y «Expulsar» sin llegar a banear.",
  },
  g_filters: {
    t: "Filtros de contenido",
    d: "Reglas que revisa el bot en cada mensaje: palabras, mayúsculas, flood, enlaces, menciones.",
    e: "Ejemplo: filtro de palabras con «badwords: spam,spam-fraud, estafa, estafa» y mayúsculas activado con 15 letras y 70 %: así «HOLA» no salta, pero un párrafo entero en mayúsculas sí.",
  },
  g_links: {
    t: "Enlaces y adjuntos",
    d: "Controla los enlaces, las invitaciones de Discord y los archivos. Puedes permitir que sí se compartan imágenes o vídeos, o exemptar canales o categorías concretas (por ejemplo, un canal de memes).",
    e: "Ejemplo: en un servidor con mucho arte, activa «Permitir imágenes» para que el bot no borre los paintings de los miembros.",
  },
  g_except: {
    t: "Excepciones (nadie es intocable)",
    d: "Define a quién el AutoMod **nunca** toca, aunque infrinja las reglas. Es la lista de protección: roles del staff, bots de confianza, VIP o tu cuenta personal. Puedes combinar varias por commas.",
    e: "Ejemplo: «bypassLinksRoles: 123456789, 987654321» para que los roles de Staff y Partner puedan publicar enlaces sin que el bot los borre.",
  },
  g_design: {
    t: "Diseño del embed",
    d: "Color, imagen, icono del autor y pie del mensaje.",
    e: "Ejemplo: color #7C4DFF, icono del autor con el logo de tu comunidad y pie «ZeroCloud · desde 2020».",
  },
  g_content: {
    t: "Mensajes y textos",
    d: "Títulos, descripciones y textos, con variables entre llaves.",
    e: "Ejemplo de título: «✨ ¡Bienvenido/a, {user}! ✨». Con variables, el mismo texto sirve para todos los miembros nuevos sin editarlo cada vez.",
  },
  g_ch: {
    t: "Canales y categorías",
    d: "Dónde envía el bot cada cosa.",
    e: "Ejemplo: Bienvenidas → #Bienvenidas; Tickets → categoría «SOPORTE»; registro de acciones → #registros.",
  },
  g_roles: {
    t: "Roles",
    d: "Qué rol se entrega, se quita o se necesita.",
    e: "Ejemplo: verificación → rol @Verificado (se entrega al superar el captcha); tickets → @Ticket (se entrega al abrir y se retira al cerrar).",
  },
  g_limits: {
    t: "Límites y números",
    d: "Cantidades, tiempos y porcentajes que evitan falsos positivos.",
    e: "Ejemplo: flood con 6 mensajes en 10 segundos; aislamiento de 10 minutos; 3 ganadores por sorteo.",
  },
  g_extra: {
    t: "Ajustes propios de esta función",
    d: "Opciones propias de este módulo.",
    e: "Ejemplo: aquí verás el canal de entrance de las inscripciones o el mensaje de entrada, cosas que no encajan en ningún bloque general.",
  },


};
// Descripciones Extendidas por módulo (se muestran en el ⓘ del módulo)
// Mapa tipo de campo -> bloque de ayuda con el que se explica
const TYPE_HELP = {
  bool: "g_state", channel: "g_ch", multichannel: "g_ch", role: "g_roles", multirole: "g_roles",
  user: "g_roles", color: "g_design", image: "g_design", attachment: "g_design",
  text: "g_content", textarea: "g_content", select: "g_extra", multselect: "g_extra", idlist: "g_extra",
  number: "g_limits", seconds: "g_limits", time: "g_limits", duration: "g_limits",
};
const MOD_HELP = {
  welcome: "Saluda a cada miembro nuevo con mensaje, imagen o DM.",
  goodbye: "Avisa cuando alguien abandona el servidor.",
  verification: "Captcha: el usuario escribe un código y recibe el rol verificado.",
  tickets: "Canales privados de soporte con roles, categorías y transcripciones.",
  roles: "Quién es staff, miembro, participante o creador del servidor.",
  inscriptions: "Apúndate a un evento y recibe un rol temporal.",
  events: "Eventos de Minecraft con fecha, rol y lista de confirmación.",
  musica: "Reproduce música en el canal de voz.",
  confesiones: "Publicaciones anónimas con revisión del staff y votos.",
  mcserver: "Estado, perfiles y skins de tu servidor de Minecraft.",
  webhooks: "Configura el webhook de changelogs y avisos globales del bot.",
  promociones: "Activa descuentos temporales en planes Premium para este servidor.",
  automod: "Filtra mensajes: enlaces, palabras, mayúsculas, flood, menciones y más.",
  lockdown: "Cierra todos los canales del servidor de un clic.",
  sanctions: "El **registro de sanciones** guarda cada aviso, aislamiento, expulsión y baneo con su motivo, pruebas, duración, moderador y número de caso. Puedes buscar, filtrar y exportar a CSV o TXT, además de elegir el canal donde se publica el panel completo de cada sanción.",
  joins: "Filtra quién entra: cuentas nuevas y ráfagas de bots.",
  logging: "Guarda en un canal todo lo que pasa en el servidor.",
  spotify: "Muestra qué escucha el bot y avisa cuando hay directo.",
  botmode: "Presencia del bot: jugando, escuchando o estado personalizado.",
  socials: "Avisa de directos y vídeos de YouTube, Twitch y Kick.",
  suggestions: "Ideas de la comunidad con votación y revisión del staff.",
  giveaways: "Sorteos con contador en vivo y ganadores al terminar.",
  clips: "Registra los mejores mensajes de un canal.",
  stats: "Experiencia, niveles y clasificación del servidor.",
  polls: "Encuestas con duración y resultados al terminar.",
  auditlog: "Registro de kicks, baneos, roles y ediciones de canales.",
  embedbuilder: "Monta mensajes con título, color, imagen y campos.",
  quickactions: "Vacío, slowmode, clonar o aislar en un canal concreto.",
  mensajes: "Todos los textos que envía el bot: errores, avisos y respuestas.",
  starboard: "Destaca los mensajes con más reacciones.",
  sticky: "Mensajes fijos que el bot repone si alguien los borra.",
  afk: "Marca a los miembros como ausentes y responde por ellos.",
  reactionroles: "Entrega roles con un clic o una reacción.",
  antinuke: "Detecta y revierte cambios masivos de roles o canales.",
  autorespond: "Contesta automáticamente cuando alguien escribe una palabra clave.",
  tempvoice: "Crea un canal de voz personal al entrar y lo borra al salir.",
  joinranks: "Roles que se entregan por reacción o menú.",
  mediaonly: "Canales donde solo se permiten imágenes, vídeos y archivos.",
  cmdperms: "Quién puede usar cada comando, dónde y con qué alias.",
  invites: "Cuenta a quién trajo cada miembro y cuántas veces usó su invitación.",
  eventos: "Eventos de Minecraft con fecha, rol y confirmaciones.",
  equipos: "Grupos de participantes con rol y color propios.",
  premiumextras: "Ajustes de las funciones Premium de este servidor.",
  servicios: "El sistema de **servicios y freelancers** conecta a quien ofrece un servicio con quien lo compra. Los freelancers tienen perfil con disponibilidad, horario y servicios; los clientes dejan **reseñas con estrellas**; y todo se factura con **comisiones**, **retiros** y **facturas** (Stripe, PayPal o QR de cripto). Es Premium y **viene desactivado por defecto**.",
};

const FIELD_GROUPS = [
  { id: "state", icon: "⚡", key: "g_state", help: "g_state_d", test: (k, f) => f.type === "bool" },
  { id: "act", icon: "⚖️", key: "g_act", help: "g_act_d", test: (k) => /Action$|^inviteFilterEnabled$|^linkWhitelistEnabled$/.test(k) },
  { id: "filters", icon: "🧪", key: "g_filters", help: "g_filters_d", test: (k, f) => f.type !== "role" && f.type !== "channel" && /(badwords|caps|spam|mention|emoji[A-Z]|domains|Whitelist|Bypass|Allow(Channels|Categories|Images|Videos)|Filters?$|Anonymous)/i.test(k) },
  { id: "design", icon: "🎨", key: "g_design", help: "g_design_d", test: (k, f) => f.type === "color" || (!/Id$/.test(k) && /(Color$|Image$|Layout$|Icon$|Author|Emoji$|Embed|Thumbnail)/.test(k)) },
  { id: "content", icon: "💬", key: "g_content", help: "g_content_d", test: (k) => /(Title$|Desc$|Message$|Msg$|Content$|Footer$|Help$|Reason$|Label$|Text$|Layout$)/.test(k) },
  { id: "ch", icon: "📍", key: "g_ch", help: "g_ch_d", test: (k, f) => f.type === "channel" || /(Channel|Category)Id$/.test(k) },
  { id: "roles", icon: "🎭", key: "g_roles", help: "g_roles_d", test: (k, f) => f.type === "role" || /(RoleId|Role[A-Z]|Roles$|RoleRequirements|RoleRewards)/.test(k) },
  { id: "limits", icon: "⏱️", key: "g_limits", help: "g_limits_d", test: (k) => /(Timeout|Min[A-Z]|Max[A-Z]|Count$|Limit|Seconds|Percent|Cooldown|Days|Duration|Winners|Volume|MinLen|Ip$)/.test(k) },
  { id: "extra", icon: "🧩", key: "g_extra", help: "g_extra_d", test: () => true },
];
const AUTOMOD_GROUPS = [
  { id: "am_state", icon: "⚡", key: "g_state", help: "g_state_d", keys: ["autoModEnabled", "antiLinkEnabled", "inviteFilterEnabled", "linkWhitelistEnabled", "automodWarnDM"] },
  { id: "am_content", icon: "🔤", key: "g_filters", help: "g_filters_d", keys: ["capsEnabled", "capsMinLen", "capsPercent", "capsAction", "spamEnabled", "spamCount", "spamSeconds", "spamAction", "mentionSpamEnabled", "mentionSpamMax", "mentionAction", "emojiEnabled", "emojiMax", "emojiAction", "badwords", "badwordsAction"] },
  { id: "am_links", icon: "🔗", key: "g_links", help: "g_links_d", keys: ["antiLinkAction", "linkWhitelistDomains", "domainAction", "antiLinkAllowChannels", "antiLinkAllowCategories", "antiLinkAllowImages", "antiLinkAllowVideos"] },
  { id: "am_punish", icon: "⚖️", key: "g_act", help: "g_act_d", keys: ["automodAction", "automodTimeoutMin"] },
  { id: "am_except", icon: "🛡️", key: "g_except", help: "g_except_d", keys: ["whitelistRoles", "whitelistUsers", "whitelistChannels", "bypassLinksRoles", "bypassImagesRoles", "bypassVideosRoles"] },
];
// Distintivo de Premium en la cabecera de cada seccion
function premiumBadge(sec) {
  if (!sec || !sec.premium) return "";
  return '<span class="prembadge" title="Seccion Premium">💎 Premium</span>';
}
function groupFields(section) {
  const defs = section.module === "automod" ? AUTOMOD_GROUPS : FIELD_GROUPS;
  if (section.module === "automod") {
    const used = new Set(defs.flatMap(g => g.keys));
    const rest = section.fields.filter(f => !used.has(f.key));
    const out = defs.map(g => ({ ...g, fields: g.keys.map(k => section.fields.find(f => f.key === k)).filter(Boolean) })).filter(g => g.fields.length);
    if (rest.length) out.push({ id: "am_extra", icon: "🧩", key: "g_extra", help: "g_extra_d", fields: rest });
    return out;
  }
  const buckets = defs.map(g => ({ ...g, fields: [] }));
  for (const f of section.fields) {
    const g = buckets.find(b => b.test(f.key, f)) || buckets[buckets.length - 1];
    g.fields.push(f);
  }
  return buckets.filter(b => b.fields.length);
}
const CARD_OPEN = {};
function cardOpen(id) { const k = activeModule + ":" + id; return CARD_OPEN[k] === undefined ? true : CARD_OPEN[k]; }
function toggleCard(id) { const k = activeModule + ":" + id; CARD_OPEN[k] = !cardOpen(id); const el = document.getElementById("card_" + id); if (el) el.classList.toggle("closed", !cardOpen(id)); }
function toggleAllCards(v) {
  for (const el of document.querySelectorAll("#cards .gcard")) {
    const id = el.id.replace("card_", "");
    CARD_OPEN[activeModule + ":" + id] = v;
    el.classList.toggle("closed", !v);
  }
}
function filterFields(q) {
  const nq = normTxt(q);
  for (const el of document.querySelectorAll("#cards .gcard")) {
    let hit = 0;
    for (const f of el.querySelectorAll(".field")) {
      const ok = !nq || normTxt(f.dataset.s).includes(nq);
      f.style.display = ok ? "" : "none";
      if (ok) hit++;
    }
    el.style.display = hit ? "" : "none";
    if (hit) el.classList.remove("closed");
  }
  const toc = document.getElementById("toc");
  if (toc) for (const a of toc.querySelectorAll("a")) {
    const target = document.getElementById(a.dataset.target);
    a.style.display = target && target.style.display !== "none" ? "" : "none";
  }
}
let MOD_DIRTY = false;
function markDirty(v) {
  MOD_DIRTY = v;
  const d = document.getElementById("mbdirty");
  if (d) d.style.display = v ? "" : "none";
}
function jumpCard(id) {
  const el = document.getElementById("card_" + id);
  if (!el) return;
  if (el.classList.contains("closed")) toggleCard(id);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
function fieldHtml(section, f) {
  const isWide = f.type === "text" && MULTILINE_SUFFIX.some(s => f.key.endsWith(s));
  return `<div class="field ${isWide ? "wide" : ""} ${f.type === "bool" ? "bool" : ""}" data-s="${escHtml((L(f, "label") || "") + " " + f.key)}">
    <label for="f_${f.key.replace(/\./g, "_")}">${L(f, "label")}</label>
    ${inputFor(f)}
    <div class="fieldtools">
      ${f.type === "text" ? `<button type="button" class="btn small ghost" onclick="varsModal('${section.module}')">{} ${t("vars_btn")}</button>` : ""}
      ${infoBtn("field", f.key)}
    </div></div>`;
}
// ---- Panel de servicios ----
async function loadServicios() {
  const [fl, rv, cm, wd, iv] = await Promise.all([
    fetch(`/api/guild/${guildId}/freelancers`).then(r => r.json()).catch(() => ({ list: [] })),
    fetch(`/api/guild/${guildId}/reviews`).then(r => r.json()).catch(() => ({ list: [] })),
    fetch(`/api/guild/${guildId}/commissions`).then(r => r.json()).catch(() => ({ list: [] })),
    fetch(`/api/guild/${guildId}/withdraws`).then(r => r.json()).catch(() => ({ list: [] })),
    fetch(`/api/guild/${guildId}/invoices`).then(r => r.json()).catch(() => ({ list: [] })),
  ]);
  const L = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
  L("flist", (fl.list || []).map(f => `<div class="catrow"><span class="ce">${f.available ? "🟢" : "🔴"}</span><span class="cn"><b>${escHtml(f.userId)}</b><small>${escHtml(f.hours || "")} · ${escHtml(f.bio || "")}</small></span></div>`).join("") || '<p class="desc">Sin freelancers.</p>');
  L("rlist", (rv.list || []).map(r => `<div class="catrow"><span class="ce">${"⭐".repeat(r.stars || 0)}</span><span class="cn"><b>${escHtml(r.to)}</b><small>${escHtml(r.text || "")}</small></span></div>`).join("") || '<p class="desc">Sin reseñas.</p>');
  L("cmlist", (cm.list || []).map(c => `<div class="catrow"><span class="ce">${c.status === "paid" ? "✅" : c.status === "cancelled" ? "❌" : "⏳"}</span><span class="cn"><b>${escHtml(c.service || "")}</b><small>${escHtml(c.freelancer)} → ${escHtml(c.client)} · ${c.amount}</small></span><button class="btn small ghost" onclick="cmResolve('${c.id}','paid')">Pagada</button><button class="btn small ghost" onclick="cmResolve('${c.id}','cancelled')">Cancelar</button></div>`).join("") || '<p class="desc">Sin comisiones.</p>');
  L("wlist", (wd.list || []).map(w => `<div class="catrow"><span class="ce">${w.status === "paid" ? "✅" : w.status === "denied" ? "❌" : "⏳"}</span><span class="cn"><b>${escHtml(w.user)}</b><small>${escHtml(w.mail || "")} · ${w.amount}</small></span><button class="btn small ghost" onclick="wResolve('${w.id}',true)">Aceptar</button><button class="btn small ghost" onclick="wResolve('${w.id}',false)">Denegar</button></div>`).join("") || '<p class="desc">Sin retiros.</p>');
  L("inlist", (iv.list || []).map(i => `<div class="catrow"><span class="ce">${i.status === "paid" ? "✅" : "⏳"}</span><span class="cn"><b>${escHtml(i.id)}</b><small>${escHtml(i.service || "")} · ${i.amount} · ${escHtml(i.method || "")}</small></span></div>`).join("") || '<p class="desc">Sin facturas.</p>');
}
async function flSave() {
  const st = document.getElementById("flstatus");
  const data = { user: document.getElementById("fl_user").value.trim(), available: document.getElementById("fl_avail").checked, hours: document.getElementById("fl_hours").value.trim(), bio: document.getElementById("fl_bio").value.trim(), services: document.getElementById("fl_services").value.split(",").map(x => x.trim()).filter(Boolean) };
  if (!data.user) { if (st) { st.textContent = "❌ Falta el usuario."; st.className = "status err"; } return; }
  try {
    const r = await fetch(`/api/guild/${guildId}/freelancers/${encodeURIComponent(data.user)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    if (st) { st.textContent = "✅ Freelancer guardado."; st.className = "status ok"; }
    loadServicios();
  } catch (e) { if (st) { st.textContent = "❌ " + e.message; st.className = "status err"; } }
}
async function cmAdd() {
  const st = document.getElementById("cmstatus");
  const data = { freelancer: document.getElementById("cm_fl").value.trim(), client: document.getElementById("cm_cl").value.trim(), service: document.getElementById("cm_sv").value.trim(), amount: Number(document.getElementById("cm_am").value) || 0 };
  if (!data.freelancer || !data.client) { if (st) { st.textContent = "❌ Faltan datos."; st.className = "status err"; } return; }
  try {
    const r = await fetch(`/api/guild/${guildId}/commissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    if (st) { st.textContent = "✅ Comisión creada."; st.className = "status ok"; }
    loadServicios();
  } catch (e) { if (st) { st.textContent = "❌ " + e.message; st.className = "status err"; } }
}
async function cmResolve(id, status) {
  await fetch(`/api/guild/${guildId}/commissions/${id}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid: status === "paid" }) });
  loadServicios();
}
async function wResolve(id, accept) {
  await fetch(`/api/guild/${guildId}/withdraws/${id}/${accept ? "accept" : "deny"}`, { method: "POST" });
  loadServicios();
}
async function inAdd() {
  const st = document.getElementById("instatus");
  const data = { seller: document.getElementById("in_seller").value.trim(), client: document.getElementById("in_client").value.trim(), service: document.getElementById("in_service").value.trim(), amount: Number(document.getElementById("in_amount").value) || 0, method: document.getElementById("in_method").value };
  if (!data.seller || !data.client) { if (st) { st.textContent = "❌ Faltan datos."; st.className = "status err"; } return; }
  try {
    const r = await fetch(`/api/guild/${guildId}/invoices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    if (st) { st.textContent = "✅ Factura " + (j.id || "") + " creada."; st.className = "status ok"; }
    loadServicios();
  } catch (e) { if (st) { st.textContent = "❌ " + e.message; st.className = "status err"; } }
}
// ---- Gestion de categorias de tickets ----
let catEditId = null;
async function loadCats() {
  const box = document.getElementById("catlist");
  if (!box) return;
  try {
    const j = await fetch(`/api/guild/${guildId}/ticketcats`).then(r => r.json());
    const list = j.list || [];
    if (!list.length) { box.innerHTML = '<p class="desc">No hay categorias. Crea la primera.</p>'; return; }
    box.innerHTML = list.map(c => `<div class="catrow" data-id="${c.id}">
      <span class="ce">${c.emoji || "🏷"}</span>
      <span class="cn"><b>${escHtml(c.label)}</b><small>${escHtml(c.desc || "")} · ${(c.questions || []).length} preguntas</small></span>
      <button class="btn small ghost" onclick="catEdit('${c.id}')">Editar</button>
    </div>`).join("");
  } catch { box.innerHTML = '<p class="desc">Error al cargar.</p>'; }
}
function catEdit(id) {
  const row = document.querySelector('.catrow[data-id="' + id + '"]');
  if (!row) return;
  catEditId = id;
  const j = row.querySelector("b").textContent;
  document.getElementById("cat_label").value = j;
  document.getElementById("cat_emoji").value = row.querySelector(".ce").textContent;
  document.getElementById("cat_desc").value = (row.querySelector("small").textContent || "").split("·")[0].trim();
  document.getElementById("catstatus").textContent = "Editando: " + j;
}
function catReset() {
  catEditId = null;
  ["cat_label", "cat_emoji", "cat_desc", "cat_prefix", "cat_questions"].forEach(id => document.getElementById(id).value = "");
  const st = document.getElementById("catstatus"); if (st) st.textContent = "";
}
async function catSave() {
  const st = document.getElementById("catstatus");
  const data = {
    id: catEditId || undefined,
    label: document.getElementById("cat_label").value.trim(),
    emoji: document.getElementById("cat_emoji").value.trim(),
    desc: document.getElementById("cat_desc").value.trim(),
    prefix: document.getElementById("cat_prefix").value.trim(),
    questions: document.getElementById("cat_questions").value.split("\n").map(x => x.trim()).filter(Boolean),
  };
  if (!data.label) { if (st) { st.textContent = "❌ El nombre es obligatorio."; st.className = "status err"; } return; }
  try {
    const r = await fetch(`/api/guild/${guildId}/ticketcats`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    catReset();
    loadCats();
    if (st) { st.textContent = "✅ Categoría guardada."; st.className = "status ok"; }
  } catch (e) { if (st) { st.textContent = "❌ " + e.message; st.className = "status err"; } }
}
async function catDelete() {
  if (!catEditId) { const st = document.getElementById("catstatus"); if (st) { st.textContent = "Selecciona una categoría primero (Editar)."; st.className = "status err"; } return; }
  if (!confirm("¿Borrar esta categoría?")) return;
  try {
    const r = await fetch(`/api/guild/${guildId}/ticketcats/${catEditId}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    catReset(); loadCats();
    const st = document.getElementById("catstatus"); if (st) { st.textContent = "✅ Categoría borrada."; st.className = "status ok"; }
  } catch (e) { const st = document.getElementById("catstatus"); if (st) { st.textContent = "❌ " + e.message; st.className = "status err"; } }
}
function renderModule(section) {
  const main = document.getElementById("main");
  const modDescKey = section.module + "_d";
  const modDesc = t(modDescKey);
  markDirty(false);
  const groups = groupFields(section);
  main.innerHTML = `
    <div class="modbar"><div class="mb-l"><span class="mb-ic">${section.icon || "•"}</span>
      <div><div class="mb-title">${L(section, "title")}</div>
      <div class="mb-sub">${t("changes_for")} ${info.name} · ${t("apply_instant")} <span id="mbdirty" class="dirty" style="display:none">● ${t("g_dirty")}</span></div></div>
      ${infoBtn("mod", section.module)}</div>
      <div class="mb-r">
        <button class="btn ghost small" onclick="toggleAllCards(true)">${t("g_openall")}</button>
        <button class="btn ghost small" onclick="toggleAllCards(false)">${t("g_closeall")}</button>
        <button class="btn" onclick="saveModule('${section.module}')">💾 ${t("save")}</button><span class="status" id="mbstatus"></span></div></div>
    <div class="modtools">
      <input id="modfilter" type="text" placeholder="${t("g_filter")}" oninput="filterFields(this.value)" autocomplete="off">
      <nav class="toc" id="toc">${groups.map(g => `<a data-target="card_${g.id}" href="#card_${g.id}" onclick="jumpCard('${g.id}')">${g.icon} ${t(g.key)}</a>`).join("")}</nav>
    </div>
    ${modDesc !== modDescKey ? `<div class="modintro">${modDesc}</div>` : ""}
    <div id="cards">${groups.map(g => `<section class="gcard ${cardOpen(g.id) ? "" : "closed"}" id="card_${g.id}">
      <header class="ghead" onclick="toggleCard('${g.id}')">
        <span class="gic">${g.icon}</span>
        <span class="gtx">${t(g.key)} <small>${t(g.help)}</small></span>
        ${premiumBadge(section)}
        ${infoBtn("group", g.id)}
        <span class="gcount">${g.fields.length}</span>
        <span class="gcv">▾</span>
      </header>
      <div class="gbody"><div class="fields">${g.fields.map(f => fieldHtml(section, f)).join("")}</div></div>
    </section>`).join("")}</div>
    ${section.module === "verification" ? verifyExtras() : ""}
    ${section.module === "welcome" ? `<div class="panel panel-soft"><h2>👁️ ${t("vpreview")}</h2><div id="wprev"></div></div><div id="wprev_anchor"></div>` : ""}
    ${section.module === "goodbye" ? `<div class="panel panel-soft"><h2>👁️ ${t("vpreview")}</h2><div id="gprev"></div></div>` : ""}
    ${section.module === "invites" ? `<div class="panel panel-soft"><h2>👁️ ${t("vpreview")}</h2><div id="iprev"></div></div>` : ""}
    ${section.module === "tickets" ? `<div class="panel panel-soft"><h2>👁️ ${t("vpreview")}</h2><div id="tprev"></div></div>
    <div class="panel panel-soft"><h2>🎛 ${t("tpanel_title")}</h2>
    <p class="desc">${t("tpanel_sub")}</p>
    <div class="panel" style="margin:0 0 12px"><div id="tpprev"></div></div>
    <div class="field"><label>${t("vsend_channel")}</label>
    <select id="tpsend_ch">${(meta.channels || []).filter(c => c.type === 0).map(c => `<option value="${c.id}"># ${c.name}</option>`).join("")}</select></div>
    <button class="btn" onclick="sendTickets()">📨 ${t("vsend_btn")}</button>
    <span class="status" id="tpsend_status"></span></div>
    <div id="tbanner_panel_anchor"></div><div id="tbanner_msg_anchor"></div>` : ""}
    ${section.module === "tickets" ? `<div class="panel panel-soft"><h2>📋 Gestionar categorias</h2>
      <p class="desc">Crea, renombra, modifica y borra las categorias de los tickets. Cada una puede tener sus propias preguntas.</p>
      <div id="catlist">${t("staff_loading")}</div>
      <div class="subpanel" style="margin-top:12px">
        <div class="fields">
          <div class="field"><label>Nombre</label><input id="cat_label" maxlength="60" placeholder="Soporte General"></div>
          <div class="field"><label>Emoji</label><input id="cat_emoji" maxlength="8" placeholder="💡"></div>
          <div class="field"><label>Descripcion</label><input id="cat_desc" maxlength="120" placeholder="Dudas y preguntas"></div>
          <div class="field"><label>Prefijo</label><input id="cat_prefix" maxlength="20" placeholder="gen"></div>
          <div class="field wide"><label>Preguntas (una por linea, maximo 5)</label><textarea id="cat_questions" rows="3" placeholder="¿En qué te ayudamos?"></textarea></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn" onclick="catSave()">💾 Guardar categoria</button>
          <button class="btn ghost" onclick="catReset()">Limpiar</button>
          <button class="btn danger" onclick="catDelete()">🗑️ Borrar seleccionada</button>
        </div>
        <span class="status" id="catstatus"></span>
      </div></div>` : ""}
    ${section.module === "servicios" ? `<div class="panel panel-soft"><h2>💼 Freelancers</h2>
      <p class="desc">Perfiles de freelancers: disponibilidad, horario y servicios. Todo Premium.</p>
      <div id="flist">${t("staff_loading")}</div>
      <div class="subpanel" style="margin-top:12px">
        <div class="fields">
          <div class="field"><label>Usuario (ID o @mención)</label><input id="fl_user" placeholder="123456789"></div>
          <div class="field"><label>Disponible</label><label class="switch"><input type="checkbox" id="fl_avail"><span class="slider"></span></label></div>
          <div class="field"><label>Horario</label><input id="fl_hours" maxlength="100" placeholder="L-V 9:00-17:00"></div>
          <div class="field wide"><label>Bio</label><input id="fl_bio" maxlength="500" placeholder="Describe tus servicios"></div>
          <div class="field wide"><label>Servicios (separados por comas)</label><input id="fl_services" placeholder="Diseño, Edición, Programación"></div>
        </div>
        <button class="btn" onclick="flSave()" style="margin-top:10px">💾 Guardar freelancer</button>
        <span class="status" id="flstatus"></span>
      </div></div>
    <div class="panel panel-soft"><h2>📋 Reseñas</h2><div id="rlist">${t("staff_loading")}</div></div>
    <div class="panel panel-soft"><h2>💰 Comisiones</h2>
      <div class="subpanel"><div class="fields">
        <div class="field"><label>Freelancer</label><input id="cm_fl" placeholder="ID"></div>
        <div class="field"><label>Cliente</label><input id="cm_cl" placeholder="ID"></div>
        <div class="field"><label>Servicio</label><input id="cm_sv" placeholder="Diseño de logo"></div>
        <div class="field"><label>Importe (USD)</label><input id="cm_am" type="number" min="0" placeholder="50"></div>
      </div><button class="btn" onclick="cmAdd()" style="margin-top:8px">💾 Crear comision</button><span class="status" id="cmstatus"></span></div>
      <div id="cmlist">${t("staff_loading")}</div></div>
    <div class="panel panel-soft"><h2>💵 Retiros</h2><div id="wlist">${t("staff_loading")}</div></div>
    <div class="panel panel-soft"><h2>🧾 Facturas</h2>
      <div class="subpanel"><div class="fields">
        <div class="field"><label>Vendedor</label><input id="in_seller" placeholder="ID"></div>
        <div class="field"><label>Cliente</label><input id="in_client" placeholder="ID"></div>
        <div class="field"><label>Servicio</label><input id="in_service" placeholder="Diseño"></div>
        <div class="field"><label>Importe (USD)</label><input id="in_amount" type="number" min="0" placeholder="50"></div>
        <div class="field"><label>Método</label><select id="in_method"><option value="crypto">Cripto (QR)</option><option value="paypal">PayPal</option><option value="stripe">Stripe</option></select></div>
      </div><button class="btn" onclick="inAdd()" style="margin-top:8px">💾 Crear factura</button><span class="status" id="instatus"></span></div>
      <div id="inlist">${t("staff_loading")}</div></div>` : ""}
    ${section.module === "automod" ? "" : ""}
    ${section.module === "socials" ? `<div class="panel panel-soft"><h2>📡 ${t("sw_t")}</h2>
    <p class="desc">${t("sw_d")}</p>
    <div id="swadd" class="subpanel"></div>
    <div id="swlist">${t("staff_loading")}</div></div>` : ""}
    ${["welcome", "goodbye", "verification", "tickets", "invites"].includes(section.module) ? `
    <div class="panel panel-soft"><h2>🧪 ${t("test_title")}</h2>
    <p class="desc">${t("test_sub")}</p>
    <div class="field"><label>${t("test_channel")}</label>
    <select id="test_ch">${(meta.channels || []).filter(c => c.type === 0).map(c => `<option value="${c.id}"># ${c.name}</option>`).join("")}</select></div>
    <button class="btn" onclick="testSend('${section.module}')">🧪 ${t("test_btn")}</button>
    <span class="status" id="test_status"></span></div>` : ""}`;
  if (!main.dataset.dirtyHook) { main.addEventListener("input", () => markDirty(true)); main.dataset.dirtyHook = "1"; }

  if (section.module === "verification") {
    updateVerifyPreview();
  }
  if (section.module === "welcome") {
    renderBannerBlock();
    updateWelcomePreview();
  }
  if (section.module === "goodbye") {
    updateGoodbyePreview();
  }
  if (section.module === "invites") {
    updateInvitePreview();
  }
  if (section.module === "automod") {
    // el heat vive ahora en la página Premium
  }
  if (section.module === "socials") {
    loadSocialWatch();
  }
  if (section.module === "servicios") {
    loadServicios();
  }
  if (section.module === "tickets") {
    loadCats();
    updateTicketPreview();
    updateTicketPanelPreview();
    renderBannerSlotBlock("ticketpanel", "tbanner_panel_anchor", t("banner_slot_panel_t"), t("banner_slot_d"));
    renderBannerSlotBlock("ticket", "tbanner_msg_anchor", t("banner_slot_msg_t"), t("banner_slot_d"));
  }
  if (section.module === "tickets") {
    ["ticketPanelTitle", "ticketPanelDesc", "ticketPanelColor", "ticketPanelFooter", "ticketPanelImage", "ticketImage"].forEach(k => {
      const el = document.getElementById("f_" + k);
      if (el) el.addEventListener("input", updateTicketPanelPreview);
    });
  }
  const liveUpdaters = { verification: updateVerifyPreview, welcome: updateWelcomePreview, goodbye: updateGoodbyePreview, tickets: updateTicketPreview, invites: updateInvitePreview };
  const liveFn = liveUpdaters[section.module];
  if (liveFn) main.addEventListener("input", liveFn);
}

function ticketBannerPreviewUrl(mode, slot) {
  if (mode === "propio") {
    const f = slot === "ticketpanel" ? config.bannerTicketPanelFile : config.bannerTicketFile;
    return f ? `/banners/${f}?t=${bannerTs}` : "";
  }
  if (mode === "banner") return currentBannerUrl();
  return "";
}
function contentPreviewHtml(text) {
  const t = String(text || "").trim();
  return t ? `<div style="font-size:13px;color:#dbdee1;margin-bottom:8px;max-width:520px">${escHtml(t)}</div>` : "";
}
function updateTicketPanelPreview() {
  const box = document.getElementById("tpprev");
  if (!box) return;
  box.innerHTML = contentPreviewHtml(fieldVal("ticketPanelContent", "")) + embedMock({
    title: fieldVal("ticketPanelTitle", (info.name || "{server}") + " Support Area"),
    desc: fieldVal("ticketPanelDesc", "¡Bienvenido al centro de soporte de **" + (info.name || "{server}") + "**! 🐉\n\nAquí podrás acceder a diferentes tipos de tickets para obtener ayuda, reportar problemas o solicitar información.\n\n📌 **Lee detenidamente las instrucciones de cada categoría** antes de abrir un ticket para agilizar tu atención.\n\n🔥 **Nuestro equipo de staff está listo para ayudarte.**\n\n> *La paciencia y el respeto son fundamentales para un buen servicio.*"),
    color: fieldVal("ticketPanelColor", "#00FF00"),
    footer: fieldVal("ticketPanelFooter", (info.name || "{server}") + " • Soporte"),
    image: ticketBannerPreviewUrl((document.getElementById("f_ticketPanelImage") || {}).value || "", "ticketpanel"),
  });
}
async function sendTickets() {
  const st = document.getElementById("tpsend_status");
  const channelId = (document.getElementById("tpsend_ch") || {}).value || "";
  if (!channelId) { st.textContent = "❌"; return; }
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send-tickets", channelId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("vsent_ok");
    st.className = "status ok";
    toast(t("vsent_ok"));
  } catch (e) {
    st.textContent = "❌ " + e.message;
    st.className = "status err";
  }
}

const VAR_COMMON = [
  { v: "{user}", d: "vars_d_user" }, { v: "{user-mention}", d: "vars_d_user" },
  { v: "{username}", d: "vars_d_username" }, { v: "{member}", d: "vars_d_member" },
  { v: "{server}", d: "vars_d_server" }, { v: "{server-name}", d: "vars_d_server" },
  { v: "{members}", d: "vars_d_members" }, { v: "{role-id}", d: "vars_d_roleid" },
];
const VAR_TICKET = [
  { v: "{categoria}", d: "vars_d_categoria" },
  { v: "{ticket-name}", d: "vars_d_ticketname" }, { v: "{ticket-number}", d: "vars_d_ticketnumber" },
  { v: "{staff}", d: "vars_d_staff" }, { v: "{staff-mention:ID}", d: "vars_d_staff" },
];
const VAR_MAP = {
  verification: [...VAR_COMMON],
  welcome: [...VAR_COMMON, { v: "{verify}", d: "vars_d_verify" }],
  goodbye: [...VAR_COMMON],
  tickets: [...VAR_COMMON, ...VAR_TICKET],
  socials: [...VAR_COMMON, { v: "{platform}", d: "vars_d_platform" }, { v: "{url}", d: "vars_d_url" }],
  suggestions: [...VAR_COMMON],
  giveaways: [...VAR_COMMON, { v: "{winner}", d: "vars_d_winner" }, { v: "{premio}", d: "vars_d_premio" }],
  clips: [...VAR_COMMON],
  stats: [...VAR_COMMON, { v: "{level}", d: "vars_d_level" }, { v: "{xp}", d: "vars_d_xp" }, { v: "{rank}", d: "vars_d_rank" }],
  polls: [...VAR_COMMON],
  invites: [...VAR_COMMON, { v: "{inviter}", d: "vars_d_inviter" }, { v: "{invites}", d: "vars_d_invites" }],
  mensajes: [...VAR_COMMON,
    { v: "{reason}", d: "vars_d_reason" }, { v: "{target}", d: "vars_d_target" },
    { v: "{channel}", d: "vars_d_channel" }, { v: "{name}", d: "vars_d_name" },
    { v: "{limit}", d: "vars_d_limit" }, { v: "{region}", d: "vars_d_region" },
    { v: "{cmd}", d: "vars_d_cmd" },
  ],
  botmode: [],
  music: [],
  confesiones: [],
  automod: [],
  lockdown: [],
  joins: [],
  logging: [],
  roles: [],
  inscriptions: [],
  events: [],
  eventos: [],
  equipos: [],
  mcserver: [],
  spotify: [],
};
let _currentVarsModule = "welcome";
function varsModal(mod) {
  _currentVarsModule = mod || "welcome";
  const vars = VAR_MAP[_currentVarsModule] || VAR_COMMON;
  closeVarsModal();
  const ov = document.createElement("div");
  ov.id = "vars_modal";
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99;display:flex;align-items:center;justify-content:center;padding:20px";
  ov.onclick = e => { if (e.target === ov) closeVarsModal(); };
  ov.innerHTML = `<div style="background:#0d0f16;border:1px solid var(--card-border);border-radius:16px;padding:22px;max-width:520px;width:100%;max-height:80vh;overflow:auto">
    <h2 style="margin-top:0">{} ${t("vars_title")}</h2><p class="desc">${t("vars_sub")}</p>
    ${vars.length === 0 ? `<p style="color:var(--muted)">${t("vars_none")}</p>` : vars.map((x, i) => `<div class="rowline"><code style="background:rgba(88,101,242,.2);padding:3px 8px;border-radius:6px">${x.v}</code><span style="color:var(--muted);font-size:13px">${t(x.d)}</span><button class="btn small ghost" onclick="copyVar(${i})">${t("vars_copy")}</button></div>`).join("")}
    <div style="margin-top:14px;text-align:right"><button class="btn small" onclick="closeVarsModal()">OK</button></div></div>`;
  document.body.appendChild(ov);
}
function closeVarsModal() { const m = document.getElementById("vars_modal"); if (m) m.remove(); }
function copyVar(i) {
  const vars = VAR_MAP[_currentVarsModule] || VAR_COMMON;
  const v = vars[i]?.v || "";
  const done = () => toast(t("vars_copied"));
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done).catch(done);
  else { const ta = document.createElement("textarea"); ta.value = v; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); done(); }
}

function updateTicketPreview() {
  const box = document.getElementById("tprev");
  if (!box) return;
  box.innerHTML = contentPreviewHtml(fieldVal("ticketContent", "")) + embedMock({
    title: fieldVal("ticketTitle", "🎫 Ticket Abierto — Soporte General"),
    desc: fieldVal("ticketDesc", "Hola {user}, bienvenido a tu ticket de **Soporte General**.\n\n{staff} Un miembro del staff te atenderá pronto.\n**Por favor describe tu problema con detalle.**"),
    color: fieldVal("ticketColor", "#00FF00"),
    footer: fieldVal("ticketFooter", (info.name || "Servidor") + " • Soporte"),
    image: ticketBannerPreviewUrl((document.getElementById("f_ticketImage") || {}).value || "", "ticket"),
  });
}

function embedMock(o) {
  let color = o.color || "#5865F2";
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = "#5865F2";
  return `
    <div style="background:#2b2d31;border-radius:8px;padding:12px;max-width:520px">
      <div style="background:#111214;border-left:4px solid ${color};border-radius:4px;padding:12px 14px">
        <div style="font-weight:800;font-size:15px;margin-bottom:6px">${escHtml(o.title || "")}</div>
        <div style="font-size:13px;color:#dbdee1;line-height:1.5">${mdPreview(o.desc || "")}</div>
        ${o.image ? `<div style="margin-top:10px"><img src="${o.image}" style="max-width:100%;border-radius:6px"></div>` : ""}
        ${o.footer ? `<div style="font-size:11px;color:#949ba4;margin-top:8px">${escHtml(o.footer)}</div>` : ""}
      </div>
      ${o.button ? `<div style="margin-top:10px"><span style="background:#248046;color:#fff;font-size:13px;font-weight:600;padding:8px 16px;border-radius:4px;display:inline-block">${escHtml(o.button)}</span></div>` : ""}
    </div>`;
}
let bannerTs = Date.now(); // anti-caché para <img> del banner tras subirlo
function currentBannerUrl() {
  return config.bannerFile ? `/banners/${config.bannerFile}?t=${bannerTs}` : "";
}
function updateWelcomePreview() {
  const box = document.getElementById("wprev");
  if (!box) return;
  const imgMode = (document.getElementById("f_welcomeImage") || {}).value || "";
  const layout = (document.getElementById("f_welcomeLayout") || {}).value || "";
  const main = embedMock({
    title: fieldVal("welcomeTitle", "✨ ¡Bienvenido/a! ✨"),
    desc: fieldVal("welcomeDesc", fieldVal("welcomeMessage", "¡Hola {user}! Nos alegra que te unas a **{server}** 🏆\n\n✅ Dirígete a {verify} para verificarte y leer las reglas antes de comenzar.\n\n💎 **¿Quieres participar en eventos?**\n¡Has llegado al lugar correcto!")),
    color: fieldVal("welcomeColor", "#5865F2"),
    footer: fieldVal("welcomeFooter", ""),
    image: imgMode === "banner" && layout !== "secciones" ? currentBannerUrl() : "",
  });
  if (layout === "secciones") {
    const bUrl = currentBannerUrl();
    box.innerHTML = (bUrl ? `<div style="margin-bottom:10px"><img src="${bUrl}" style="max-width:520px;width:100%;border-radius:8px"></div>` : "") +
      main +
      embedMock({ title: "💎 " + (info.name || ""), desc: fieldVal("welcomeHelp", "Por favor, lee nuestras reglas antes de comenzar.\n\n💎 **¿Quieres participar en eventos?**\n¡Has llegado al lugar correcto!"), color: fieldVal("welcomeColor", "#5865F2") });
  } else {
    box.innerHTML = main;
  }
}
function updateGoodbyePreview() {
  const box = document.getElementById("gprev");
  if (!box) return;
  const imgMode = (document.getElementById("f_goodbyeImage") || {}).value || "";
  const layout = (document.getElementById("f_goodbyeLayout") || {}).value || "";
  const main = embedMock({
    title: fieldVal("goodbyeTitle", "😢 Alguien salió del servidor"),
    desc: fieldVal("goodbyeDesc", "Ya no está con nosotros. ¡Le deseamos lo mejor!"),
    color: fieldVal("goodbyeColor", "#FF5555"),
    footer: fieldVal("goodbyeFooter", ""),
    image: imgMode === "banner" && layout !== "secciones" ? currentBannerUrl() : "",
  });
  if (layout === "secciones") {
    const bUrl = currentBannerUrl();
    box.innerHTML = (bUrl ? `<div style="margin-bottom:10px"><img src="${bUrl}" style="max-width:520px;width:100%;border-radius:8px"></div>` : "") +
      main +
      embedMock({ title: "", desc: fieldVal("goodbyeHelp", "Gracias por haber sido parte de **{server}**."), color: fieldVal("goodbyeColor", "#FF5555") });
  } else {
    box.innerHTML = main;
  }
}
function updateInvitePreview() {
  const box = document.getElementById("iprev");
  if (!box) return;
  const demoDesc = fieldVal("invDesc", "<@123> se unió al servidor.\n\n📧 Invitado por: {inviter}\n🔢 Invites de {inviter}: **{invites}**")
    .replace(/\{inviter\}/gi, "@invitador-demo").replace(/\{invites\}/gi, "3");
  box.innerHTML = embedMock({
    title: fieldVal("invTitle", "📨 Nuevo Miembro"),
    desc: demoDesc,
    color: fieldVal("invColor", "#00FF00"),
    footer: fieldVal("invFooter", ""),
  });
}
function renderBannerBlock() {
  const anchor = document.getElementById("wprev_anchor");
  if (!anchor) return;
  const cur = currentBannerUrl();
  anchor.innerHTML = `
    <div class="panel"><h2>🖼️ ${t("banner_title")}</h2>
    <p class="desc">${t("banner_sub")}</p>
    ${cur ? `<div style="margin-bottom:12px"><img src="${cur}" style="max-width:420px;border-radius:10px;border:1px solid var(--card-border)"></div>` : ""}
    <div class="field"><input type="file" id="banner_file" accept="image/jpeg,image/png,image/webp,image/gif"></div>
    <button class="btn" id="banner_btn" onclick="uploadBanner()">⬆️ ${t("banner_upload")}</button>
    <span class="status" id="banner_status"></span></div>`;
}
// Reduce PNG/JPG/WEBP en el navegador (max 1600x900, JPEG) para que la subida
// sea rápida y nunca supere el límite. Los GIF se envían tal cual (animación).
async function processBannerFile(file, maxW, maxH, quality) {
  if ((file.type || "").toLowerCase() === "image/gif") return { blob: file, mime: file.type };
  let img = null, w = 0, h = 0;
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(file);
      img = bmp; w = bmp.width; h = bmp.height;
    }
  } catch {}
  let objUrl = "";
  if (!img) {
    objUrl = URL.createObjectURL(file);
    img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("decode"));
      im.src = objUrl;
    });
    w = img.naturalWidth || img.width; h = img.naturalHeight || img.height;
  }
  try {
    const scale = Math.min(1, maxW / w, maxH / h);
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const cv = document.createElement("canvas");
    cv.width = cw; cv.height = ch;
    cv.getContext("2d").drawImage(img, 0, 0, cw, ch);
    const blob = await new Promise(res => cv.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("encode");
    return { blob, mime: "image/jpeg" };
  } finally {
    try { if (img && img.close) img.close(); } catch {}
    if (objUrl) URL.revokeObjectURL(objUrl);
  }
}
function readAsDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error("read"));
    fr.readAsDataURL(blob);
  });
}
async function uploadBanner() {
  const st = document.getElementById("banner_status");
  const btn = document.getElementById("banner_btn");
  const inp = document.getElementById("banner_file");
  const file = inp && inp.files && inp.files[0];
  if (!file) { st.textContent = "❌ " + t("banner_err") + ": " + t("banner_no_file"); st.className = "status err"; return; }
  const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!okTypes.includes(file.type)) { st.textContent = "❌ " + t("banner_bad_type"); st.className = "status err"; return; }
  if (file.size > 20 * 1024 * 1024) { st.textContent = "❌ " + t("banner_too_big"); st.className = "status err"; return; }
  st.className = "status";
  if (btn) btn.disabled = true;
  const ctl = new AbortController();
  const timer = setTimeout(() => { try { ctl.abort(); } catch {} }, 90000);
  try {
    // 1) Procesar en local (rápido, sin red)
    st.textContent = t("banner_processing");
    let mime = file.type, blob = file;
    try {
      const p1 = await processBannerFile(file, 1600, 900, 0.85);
      blob = p1.blob; mime = p1.mime;
      if (blob.size > 3 * 1024 * 1024 && mime !== "image/gif") {
        const p2 = await processBannerFile(file, 1280, 720, 0.7);
        blob = p2.blob; mime = p2.mime;
      }
    } catch { blob = file; mime = file.type; } // si falla el canvas, se envía el original
    if (blob.size > 3 * 1024 * 1024) throw new Error(t("banner_too_big"));
    // 2) Subir (con timeout: nunca se queda colgado para siempre)
    st.textContent = t("saving");
    const dataUrl = await readAsDataURL(blob);
    const r = await fetch(`/api/guild/${guildId}/banner`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime, data: String(dataUrl) }),
      signal: ctl.signal,
    });
    // Leer como texto primero: si el servidor/proxy devuelve HTML (413, 502...),
    // r.json() lanzaría "Unexpected token '<'" y ocultaría el error real.
    const raw = await r.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!r.ok) throw new Error((data && data.error) || (data && data.details ? data.details.join(", ") : "") || `error ${r.status}`);
    if (!data || !data.file) throw new Error(t("banner_err"));
    config.bannerFile = data.file;
    bannerTs = Date.now();
    // Persistir "Con banner" para que la vista previa y el bot lo usen también tras recargar
    try {
      const imgSel = document.getElementById("f_welcomeImage");
      if (!fieldVal("welcomeImage", "") || (imgSel && !imgSel.value)) {
        const r2 = await fetch(`/api/guild/${guildId}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ welcomeImage: "banner" }) });
        const d2 = await r2.json().catch(() => null);
        if (r2.ok && d2) Object.assign(config, { welcomeImage: "banner" });
        if (imgSel) imgSel.value = "banner";
      }
    } catch {}
    st.textContent = "✅ " + t("banner_ok");
    st.className = "status ok";
    toast(t("banner_ok"));
    renderBannerBlock();
    updateWelcomePreview();
    updateGoodbyePreview();
  } catch (e) {
    const msg = (e && e.name === "AbortError") ? t("banner_timeout") : (e.message || t("banner_err"));
    st.textContent = "❌ " + msg;
    st.className = "status err";
  } finally {
    clearTimeout(timer);
    if (btn) btn.disabled = false;
  }
}

// Banners propios por sección (slots: ticketpanel | ticket). Reusa el mismo
// procesado que el banner principal; el servidor guarda banner<Slot>File.
function currentBannerUrlFor(slot) {
  const f = slot === "ticketpanel" ? config.bannerTicketPanelFile : slot === "ticket" ? config.bannerTicketFile : config.bannerFile;
  return f ? `/banners/${f}?t=${bannerTs}` : "";
}
function renderBannerSlotBlock(slot, anchorId, title, sub) {
  const anchor = document.getElementById(anchorId);
  if (!anchor) return;
  const cur = currentBannerUrlFor(slot);
  anchor.innerHTML = `
    <div class="panel"><h2>🖼️ ${title}</h2>
    <p class="desc">${sub}</p>
    ${cur ? `<div style="margin-bottom:12px"><img src="${cur}" style="max-width:420px;border-radius:10px;border:1px solid var(--card-border)"></div>` : ""}
    <div class="field"><input type="file" id="banner_file_${slot}" accept="image/jpeg,image/png,image/webp,image/gif"></div>
    <button class="btn" id="banner_btn_${slot}" onclick="uploadBannerSlot('${slot}')">⬆️ ${t("banner_upload")}</button>
    <span class="status" id="banner_status_${slot}"></span></div>`;
}
async function uploadBannerSlot(slot) {
  const st = document.getElementById("banner_status_" + slot);
  const btn = document.getElementById("banner_btn_" + slot);
  const inp = document.getElementById("banner_file_" + slot);
  const file = inp && inp.files && inp.files[0];
  if (!file) { st.textContent = "❌ " + t("banner_err") + ": " + t("banner_no_file"); st.className = "status err"; return; }
  const okTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!okTypes.includes(file.type)) { st.textContent = "❌ " + t("banner_bad_type"); st.className = "status err"; return; }
  if (file.size > 20 * 1024 * 1024) { st.textContent = "❌ " + t("banner_too_big"); st.className = "status err"; return; }
  st.className = "status";
  if (btn) btn.disabled = true;
  const ctl = new AbortController();
  const timer = setTimeout(() => { try { ctl.abort(); } catch {} }, 90000);
  try {
    st.textContent = t("banner_processing");
    let mime = file.type, blob = file;
    try {
      const p1 = await processBannerFile(file, 1600, 900, 0.85);
      blob = p1.blob; mime = p1.mime;
      if (blob.size > 3 * 1024 * 1024 && mime !== "image/gif") {
        const p2 = await processBannerFile(file, 1280, 720, 0.7);
        blob = p2.blob; mime = p2.mime;
      }
    } catch { blob = file; mime = file.type; }
    if (blob.size > 3 * 1024 * 1024) throw new Error(t("banner_too_big"));
    st.textContent = t("saving");
    const dataUrl = await readAsDataURL(blob);
    const r = await fetch(`/api/guild/${guildId}/banner`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime, data: String(dataUrl), slot }),
      signal: ctl.signal,
    });
    const raw = await r.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!r.ok) throw new Error((data && data.error) || (data && data.details ? data.details.join(", ") : "") || `error ${r.status}`);
    if (!data || !data.file) throw new Error(t("banner_err"));
    if (slot === "ticketpanel") config.bannerTicketPanelFile = data.file;
    else if (slot === "ticket") config.bannerTicketFile = data.file;
    bannerTs = Date.now();
    st.textContent = "✅ " + t("banner_ok");
    st.className = "status ok";
    toast(t("banner_ok"));
    renderBannerSlotBlock("ticketpanel", "tbanner_panel_anchor", t("banner_slot_panel_t"), t("banner_slot_d"));
    renderBannerSlotBlock("ticket", "tbanner_msg_anchor", t("banner_slot_msg_t"), t("banner_slot_d"));
    updateTicketPreview();
    updateTicketPanelPreview();
  } catch (e) {
    const msg = (e && e.name === "AbortError") ? t("banner_timeout") : (e.message || t("banner_err"));
    st.textContent = "❌ " + msg;
    st.className = "status err";
  } finally {
    clearTimeout(timer);
    if (btn) btn.disabled = false;
  }
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function mdPreview(s) {
  let h = escHtml(s);
  h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  h = h.replace(/<#(\d+)>/g, "<span style='background:rgba(88,101,242,.3);padding:0 4px;border-radius:4px'>#canal</span>");
  h = h.replace(/<@&(\d+)>/g, "<span style='background:rgba(88,101,242,.3);padding:0 4px;border-radius:4px'>@rol</span>");
  h = h.replace(/<@!?(\d+)>/g, "<span style='background:rgba(88,101,242,.3);padding:0 4px;border-radius:4px'>@usuario</span>");
  h = h.replace(/@everyone|@here/g, "<span style='background:rgba(240,178,60,.3);padding:0 4px;border-radius:4px'>$&</span>");
  h = h.replace(/\{user\}/g, "<span style='background:rgba(88,101,242,.3);padding:0 4px;border-radius:4px'>@usuario</span>");
  h = h.replace(/\{server\}/g, info.name || "Servidor");
  return h.replace(/\n/g, "<br>");
}
function fieldVal(k, fb) {
  const el = document.getElementById("f_" + k);
  const v = el ? el.value.trim() : "";
  return v || fb;
}
function verifyExtras() {
  const chans = (meta.channels || []).filter(c => c.type === 0)
    .map(c => `<option value="${c.id}"># ${c.name}</option>`).join("");
  return `<div class="panel"><h2>👁️ ${t("vpreview")}</h2>
    <div id="vprev"></div></div>
    <div class="panel"><h2>📨 ${t("vsend")}</h2>
    <p class="desc">${t("vsend_sub")}</p>
    <div class="field"><label>${t("vsend_channel")}</label>
    <select id="vsend_ch">${chans || `<option value="">—</option>`}</select></div>
    <button class="btn" onclick="sendVerify()">📨 ${t("vsend_btn")}</button>
    <span class="status" id="vsend_status"></span></div>`;
}
function updateVerifyPreview() {
  const box = document.getElementById("vprev");
  if (!box) return;
  const title = fieldVal("verifyTitle", "🔐 Verificación Requerida");
  const desc = fieldVal("verifyDesc", "Para acceder al servidor, completa la verificación.");
  let color = fieldVal("verifyColor", "#5865F2");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = "#5865F2";
  const btn = fieldVal("verifyButton", "Verificarme") || "Verificarme";
  box.innerHTML = `
    <div style="background:#2b2d31;border-radius:8px;padding:12px;max-width:520px">
      <div style="background:#111214;border-left:4px solid ${color};border-radius:4px;padding:12px 14px">
        <div style="font-weight:800;font-size:15px;margin-bottom:6px">${escHtml(title)}</div>
        <div style="font-size:13px;color:#dbdee1;line-height:1.5">${mdPreview(desc)}</div>
        <div style="font-size:11px;color:#949ba4;margin-top:8px">HYDRA Bot</div>
      </div>
      <div style="margin-top:10px"><span style="background:#248046;color:#fff;font-size:13px;font-weight:600;padding:8px 16px;border-radius:4px;display:inline-block">${escHtml(btn)}</span></div>
    </div>`;
}
async function testSend(mod) {
  const st = document.getElementById("test_status");
  const channelId = (document.getElementById("test_ch") || {}).value || "";
  if (!channelId) { st.textContent = "❌"; return; }
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test-send", module: mod, channelId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("test_ok");
    st.className = "status ok";
    toast(t("test_ok"));
  } catch (e) {
    st.textContent = "❌ " + e.message;
    st.className = "status err";
  }
}
async function sendVerify() {
  const st = document.getElementById("vsend_status");
  const channelId = (document.getElementById("vsend_ch") || {}).value || "";
  if (!channelId) { st.textContent = "❌"; return; }
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send-verify", channelId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("vsent_ok");
    st.className = "status ok";
    toast(t("vsent_ok"));
  } catch (e) {
    st.textContent = "❌ " + e.message;
    st.className = "status err";
  }
}

async function saveModule(mod) {
  const section = schema.find(s => s.module === mod);
  const patch = {};
  for (const f of section.fields) {
    const el = document.getElementById(`f_${f.key.replace(/\./g, "_")}`);
    if (f.type === "bool") patch[f.key] = el.checked;
    else if (f.type === "number") patch[f.key] = Number(el.value);
    else patch[f.key] = el.value.trim();
  }
  const status = (txt, cls) => {
    const st = document.getElementById("savestatus");
    if (st) { st.textContent = txt; st.className = "status " + (cls || ""); }
    const mb = document.getElementById("mbstatus");
    if (mb) { mb.textContent = txt.replace(/^[^\w]+/, ""); mb.className = "status " + (cls || ""); }
    const pm = document.getElementById("pmstatus3");
    if (pm) { pm.textContent = txt.replace(/^[^\w]+/, ""); pm.className = "status " + (cls || ""); }
  };
  status(t("saving"), "");
  try {
    const r = await fetch(`/api/guild/${guildId}/config`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    const data = await r.json();
    if (!r.ok) throw new Error((data.details || [data.error]).join("; "));
    config = data.config;
    markDirty(false);
    status("✅ " + t("saved"), "ok");
    toast(t("saved_ok"));
  } catch (e) {
    status("❌ " + e.message, "err");
  }
}

async function renderStaff() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>👮 ${t("staff")}</h2><p class="desc">${t("staff_sub")}</p><div id="stafflist">${t("staff_loading")}</div>
    <div class="field"><label>${t("staff_add_label")}</label>
    <select id="stype"><option value="user">${t("user_opt")}</option><option value="role">${t("role_opt")}</option></select></div>
    <div class="field"><input type="text" id="sid" placeholder="${t("staff_id_ph")}"></div>
    <button class="btn" onclick="addStaff()">➕ ${t("staff_add")}</button></div>`;
  const data = await fetch(`/api/guild/${guildId}/staff-full`).then(r => r.json()).catch(() => ({}));
  const list = data.explicit || data;
  const box = document.getElementById("stafflist");
  const rows = [
    ...Object.entries(list.users || {}).map(([id, v]) => ({ type: "user", id, name: v.tag || id })),
    ...Object.entries(list.roles || {}).map(([id, v]) => ({ type: "role", id, name: v.name || id })),
  ];
  let html = rows.length ? rows.map(r =>
    `<div class="rowline"><span>${r.type === "user" ? "👤" : "🎭"} ${r.name} <small style="color:var(--muted)">${r.id}</small></span>
    <button class="btn danger small" onclick="delStaff('${r.type}','${r.id}')">${t("staff_remove")}</button></div>`
  ).join("") : `<p class='desc'>${t("staff_empty")}</p>`;
  if (data.admins && data.admins.length) {
    html += `<h3 style="margin-top:16px;font-size:14px">👑 ${t("staff_admins")}</h3>` + data.admins.map(a =>
      `<div class="rowline"><span>👤 ${escHtml(a.tag)} <small style="color:var(--muted)">${a.id}</small></span>
      <button class="btn small ghost" onclick="addStaffId('user','${a.id}')">${t("staff_add")}</button></div>`
    ).join("");
  }
  box.innerHTML = html;
}

async function addStaffId(type, id) {
  const r = await fetch(`/api/guild/${guildId}/staff`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id }),
  });
  const data = await r.json();
  if (!r.ok) return toast("❌ " + (data.error || "error"), false);
  toast(t("staff_updated"));
  renderStaff();
}
async function addStaff() {
  const type = document.getElementById("stype").value;
  const id = document.getElementById("sid").value.trim();
  const r = await fetch(`/api/guild/${guildId}/staff`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id }),
  });
  const data = await r.json();
  if (!r.ok) return toast("❌ " + (data.error || "error"), false);
  toast(t("staff_updated"));
  renderStaff();
}

async function delStaff(type, id) {
  const r = await fetch(`/api/guild/${guildId}/staff?type=${type}&id=${id}`, { method: "DELETE" });
  if (!r.ok) return toast("❌ " + t("staff_err"), false);
  toast(t("staff_removed"));
  renderStaff();
}

function refreshLang() {
  applyI18n();
  buildNav();
  show(activeModule);
}
document.addEventListener("hydra-lang", refreshLang);

let sugFilter = "pending";
function sugFilterBar() {
  return ["pending", "accepted", "rejected", "closed", "all"].map(f =>
    `<button class="btn small ${sugFilter === f ? "" : "ghost"}" onclick="sugSetFilter('${f}')">${t("sug_f_" + f)}</button>`
  ).join("") + ` <button class="btn small ghost" onclick="sugReload()">🔄</button>`;
}
function sugSetFilter(f) {
  sugFilter = f;
  const bar = document.getElementById("sugfilters");
  if (bar) bar.innerHTML = sugFilterBar();
  sugReload();
}
async function renderSuggestions() {
  const main = document.getElementById("main");
  const section = schema.find(s => s.module === "suggestions");
  main.innerHTML = `
    <div class="panel"><h2>🔍 ${t("sug_review_t")} <span id="sugreview_count"></span></h2>
    <p class="desc">${t("sug_review_d")}</p>
    <div class="field"><label>${t("sug_reason_ph")}</label><input type="text" id="sug_review_reason" maxlength="500"></div>
    <div id="sugreview">${t("staff_loading")}</div>
    <span class="status" id="sugreview_status"></span></div>
    <div class="panel"><h2>💡 ${t("sug_panel_t")}</h2>
    <p class="desc">${t("sug_panel_d")}</p>
    <div id="sugfilters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${sugFilterBar()}</div>
    <div class="field"><label>${t("sug_reason_ph")}</label><input type="text" id="sug_reason" maxlength="500"></div>
    <div id="suglist">${t("staff_loading")}</div>
    <span class="status" id="sugstatus"></span></div>
    <div class="panel"><h2>${section.icon} ${L(section, "title")}</h2>
    <p class="desc">${t("changes_for")} <b>${info.name}</b>. ${t("apply_instant")}</p>
    ${section.fields.map(f => `
      <div class="field"><label for="f_${f.key.replace(/\./g, "_")}">${L(f, "label")}</label>
      ${inputFor(f)}
      ${f.type === "text" ? `<div style="margin-top:6px"><button type="button" class="btn small ghost" onclick="varsModal('${section.module}')">{} ${t("vars_btn")}</button></div>` : ""}</div>`).join("")}
    <button class="btn" onclick="saveModule('suggestions')">💾 ${t("save")}</button>
    <span class="status" id="savestatus"></span></div>`;
  sugReload();
  sugReviewReload();
}
function sugBadge(st) {
  const map = { pending: ["🕐", "sug_st_pending", "#f0b23c"], accepted: ["✅", "sug_st_accepted", "#3ba55d"], rejected: ["❌", "sug_st_rejected", "#ed4245"], closed: ["🔒", "sug_st_closed", "#949ba4"] };
  const m = map[st] || map.pending;
  return `<span style="background:${m[2]}22;color:${m[2]};border:1px solid ${m[2]}66;padding:2px 8px;border-radius:8px;font-size:12px;font-weight:700">${m[0]} ${t(m[1])}</span>`;
}
function sugRowHtml(s, panel) {
  return `
    <div class="rowline" style="flex-wrap:wrap;align-items:flex-start">
      <span style="flex:1;min-width:220px"><b>${escHtml(s.id)}</b> — ${escHtml(s.titulo)} ${sugBadge(s.status)}<br>
      <small style="color:var(--muted)">${t("sug_by")} ${escHtml(s.authorTag || "?")} • 👍 ${s.up || 0} • 👎 ${s.down || 0}${s.total ? ` • total ${s.total}` : ""}${s.decidedByTag ? ` • ${t("sug_managed_by")} ${escHtml(s.decidedByTag)}` : ""}</small><br>
      <small style="color:var(--muted)">${escHtml((s.desc || "").slice(0, 160))}${(s.desc || "").length > 160 ? "…" : ""}</small></span>
      <span style="display:flex;gap:6px;flex-wrap:wrap">
        ${s.status === "pending" ? `<button class="btn small" onclick="sugDecide('${escHtml(s.id)}','aceptar','${panel}')">👍 ${t("sug_accept")}</button>
        <button class="btn small danger" onclick="sugDecide('${escHtml(s.id)}','rechazar','${panel}')">👎 ${t("sug_reject")}</button>` : ""}
        <button class="btn small ghost" onclick="sugDelete('${escHtml(s.id)}','${panel}')">🗑️ ${t("sug_delete")}</button>
      </span>
    </div>`;
}
async function sugReviewReload() {
  const box = document.getElementById("sugreview");
  if (!box) return;
  box.innerHTML = t("staff_loading");
  const list = await fetch(`/api/guild/${guildId}/suggestions`).then(r => r.json()).catch(() => []);
  const rows = list.filter(s => s.status === "pending");
  const cnt = document.getElementById("sugreview_count");
  if (cnt) cnt.textContent = rows.length ? `(${rows.length})` : "";
  if (!rows.length) { box.innerHTML = `<p class="desc">${t("sug_review_empty")}</p>`; return; }
  box.innerHTML = rows.map(s => sugRowHtml(s, "rev")).join("");
}
async function sugReload() {
  const box = document.getElementById("suglist");
  if (!box) return;
  box.innerHTML = t("staff_loading");
  const list = await fetch(`/api/guild/${guildId}/suggestions`).then(r => r.json()).catch(() => []);
  const rows = list.filter(s => sugFilter === "all" || s.status === sugFilter);
  if (!rows.length) { box.innerHTML = `<p class="desc">${t("sug_empty")}</p>`; return; }
  box.innerHTML = rows.map(s => sugRowHtml(s, "hist")).join("");
}
function sugReasonFor(panel) {
  const id = panel === "rev" ? "sug_review_reason" : "sug_reason";
  return ((document.getElementById(id) || {}).value || "").slice(0, 500);
}
function sugStatusEl(panel) {
  return document.getElementById(panel === "rev" ? "sugreview_status" : "sugstatus");
}
function sugRefreshAll() { sugReload(); sugReviewReload(); }
async function sugDecide(id, action, panel) {
  const st = sugStatusEl(panel || "hist");
  st.textContent = t("saving");
  const reason = sugReasonFor(panel || "hist");
  try {
    const r = await fetch(`/api/guild/${guildId}/suggestions/${encodeURIComponent(id)}/decision`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("sug_decided_ok");
    st.className = "status ok";
    toast("✅ " + t("sug_decided_ok"));
    sugRefreshAll();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}
async function sugDelete(id, panel) {
  if (!confirm(t("sug_confirm_delete"))) return;
  const st = sugStatusEl(panel || "hist");
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/suggestions/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("sug_deleted_ok");
    st.className = "status ok";
    toast("✅ " + t("sug_deleted_ok"));
    sugRefreshAll();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}

async function renderAuditLog() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>📋 ${t("auditlog_t")}</h2><p class="desc">${t("auditlog_d")}</p>
    <div class="field"><label>${t("audit_channel")}</label><select id="auditCh">${meta.channels.map(c => `<option value="${c.id}" ${(config.auditChannelId || "") === c.id ? "selected" : ""}>#${c.name}</option>`).join("")}</select></div>
    <div class="field"><label><input type="checkbox" id="auditEnabled" ${config.auditEnabled ? "checked" : ""}> ${t("audit_enable")}</label></div>
    <div class="field"><label><input type="checkbox" id="auditKicks" ${config.auditLogKicks !== false ? "checked" : ""}> ${t("audit_kicks")}</label></div>
    <div class="field"><label><input type="checkbox" id="auditBans" ${config.auditLogBans !== false ? "checked" : ""}> ${t("audit_bans")}</label></div>
    <div class="field"><label><input type="checkbox" id="auditTimeouts" ${config.auditLogTimeouts !== false ? "checked" : ""}> ${t("audit_timeouts")}</label></div>
    <div class="field"><label><input type="checkbox" id="auditRoles" ${config.auditLogRoleChanges !== false ? "checked" : ""}> ${t("audit_roles")}</label></div>
    <div class="field"><label><input type="checkbox" id="auditChannels" ${config.auditLogChannelEdits !== false ? "checked" : ""}> ${t("audit_channels")}</label></div>
    <div class="field"><label><input type="checkbox" id="auditChannelsCreate" ${config.auditLogChannels !== false ? "checked" : ""}> ${t("audit_channels_create")}</label></div>
    <button class="btn" onclick="saveAuditLog()">💾 ${t("save")}</button> <span class="status" id="auditStatus"></span></div>`;
}

async function saveAuditLog() {
  const st = document.getElementById("auditStatus");
  st.textContent = t("saving");
  const patch = {
    auditEnabled: document.getElementById("auditEnabled").checked,
    auditChannelId: document.getElementById("auditCh").value,
    auditLogKicks: document.getElementById("auditKicks").checked,
    auditLogBans: document.getElementById("auditBans").checked,
    auditLogTimeouts: document.getElementById("auditTimeouts").checked,
    auditLogRoleChanges: document.getElementById("auditRoles").checked,
    auditLogChannelEdits: document.getElementById("auditChannels").checked,
    auditLogChannels: document.getElementById("auditChannelsCreate").checked,
  };
  try {
    const r = await fetch(`/api/guild/${guildId}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || (data.details || []).join(", ") || "error");
    Object.assign(config, patch);
    st.textContent = "✅ " + t("saved_ok");
    toast(t("saved_ok"));
  } catch (e) { st.textContent = "❌ " + e.message; }
}

async function renderEmbedBuilder() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>📝 ${t("embed_builder_t")}</h2><p class="desc">${t("embed_builder_d")}</p>
    <div class="field"><label>${t("embed_channel")}</label><select id="ebCh">${meta.channels.map(c => `<option value="${c.id}">#${c.name}</option>`).join("")}</select></div>
    <div class="field"><label>${t("embed_title")}</label><input type="text" id="ebTitle" placeholder="Título del embed"></div>
    <div class="field"><label>${t("embed_desc")}</label><textarea id="ebDesc" rows="4" placeholder="Descripción del embed"></textarea></div>
    <div class="field"><label>${t("embed_color")}</label><input type="color" id="ebColor" value="#5865F2"></div>
    <div class="field"><label>${t("embed_footer")}</label><input type="text" id="ebFooter" placeholder="Pie del embed"></div>
    <div class="field"><label>${t("embed_image")}</label><input type="text" id="ebImage" placeholder="URL de imagen (opcional)"></div>
    <div class="field"><label>${t("embed_author")}</label><input type="text" id="ebAuthor" placeholder="Nombre del autor"></div>
    <div style="margin-top:12px"><button class="btn" onclick="previewEmbed()">👁️ ${t("vpreview")}</button> <button class="btn" onclick="sendEmbed()">📤 ${t("send")}</button></div>
    <div id="ebPreview" style="margin-top:16px"></div>
    <span class="status" id="ebStatus"></span></div>`;
}

function previewEmbed() {
  const box = document.getElementById("ebPreview");
  box.innerHTML = embedMock({
    title: document.getElementById("ebTitle").value || "",
    desc: document.getElementById("ebDesc").value || "",
    color: document.getElementById("ebColor").value || "#5865F2",
    footer: document.getElementById("ebFooter").value || "",
  });
}

async function sendEmbed() {
  const st = document.getElementById("ebStatus");
  st.textContent = t("saving");
  const channelId = document.getElementById("ebCh").value;
  if (!channelId) { st.textContent = "❌ " + t("embed_channel"); return; }
  const payload = {
    action: "send-embed",
    channelId,
    title: document.getElementById("ebTitle").value,
    description: document.getElementById("ebDesc").value,
    color: document.getElementById("ebColor").value,
    footer: document.getElementById("ebFooter").value,
    imageUrl: document.getElementById("ebImage").value,
    authorName: document.getElementById("ebAuthor").value,
  };
  try {
    const r = await fetch(`/api/guild/${guildId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("sent");
    toast("✅ " + t("sent"));
  } catch (e) { st.textContent = "❌ " + e.message; }
}

async function renderQuickActions() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>⚡ ${t("quick_actions_t")}</h2><p class="desc">${t("quick_actions_d")}</p>
    <div class="field"><label>${t("qa_channel")}</label><select id="qaCh">${meta.channels.map(c => `<option value="${c.id}">#${c.name}</option>`).join("")}</select></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn ghost" onclick="qaAction('slowmode')">⏱️ ${t("qa_slowmode")}</button>
      <button class="btn danger" onclick="qaAction('nuke')">💥 ${t("qa_nuke")}</button>
      <button class="btn ghost" onclick="qaAction('clone')">📋 ${t("qa_clone")}</button>
      <button class="btn ghost" onclick="qaAction('purge')">🗑️ ${t("qa_purge")}</button>
    </div>
    <div class="field" style="margin-top:12px"><label>${t("qa_slowmode_secs")}</label><input type="number" id="qaSlowmode" value="0" min="0" max="21600"></div>
    <div class="field"><label>${t("qa_purge_count")}</label><input type="number" id="qaPurgeCount" value="50" min="1" max="100"></div>
    <span class="status" id="qaStatus"></span></div>`;
}

async function qaAction(action) {
  const st = document.getElementById("qaStatus");
  st.textContent = t("saving");
  const channelId = document.getElementById("qaCh").value;
  if (!channelId) { st.textContent = "❌"; return; }
  const payload = { action: "quick-" + action, channelId };
  if (action === "slowmode") payload.seconds = parseInt(document.getElementById("qaSlowmode").value) || 0;
  if (action === "purge") payload.count = parseInt(document.getElementById("qaPurgeCount").value) || 50;
  try {
    const r = await fetch(`/api/guild/${guildId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅";
    toast("✅");
  } catch (e) { st.textContent = "❌ " + e.message; }
}

async function renderStarboard() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>⭐ Starboard</h2>
    <p class="desc">${t("starboard_d")}</p>
    <div class="field"><label><input type="checkbox" id="sbEnabled" ${config.starboardEnabled ? "checked" : ""}> ${t("enable")}</label></div>
    <div class="field"><label>Canal</label><select id="sbCh">${meta.channels.map(c => `<option value="${c.id}" ${(config.starboardChannelId || "") === c.id ? "selected" : ""}>#${c.name}</option>`).join("")}</select></div>
    <div class="field"><label>Mínimo de estrellas</label><input type="number" id="sbMin" value="${config.starboardMinStars || 5}" min="1" max="50"></div>
    <div class="field"><label>Emoji</label><input type="text" id="sbEmoji" value="${config.starboardEmoji || "⭐"}"></div>
    <button class="btn" onclick="saveStarboard()">💾 ${t("save")}</button> <span class="status" id="sbStatus"></span></div>`;
}

async function saveStarboard() {
  const st = document.getElementById("sbStatus");
  st.textContent = t("saving");
  const patch = {
    starboardEnabled: document.getElementById("sbEnabled").checked,
    starboardChannelId: document.getElementById("sbCh").value,
    starboardMinStars: parseInt(document.getElementById("sbMin").value) || 5,
    starboardEmoji: document.getElementById("sbEmoji").value || "⭐",
  };
  try {
    const r = await fetch(`/api/guild/${guildId}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || (data.details || []).join(", ") || "error");
    Object.assign(config, patch);
    st.textContent = "✅ " + t("saved_ok"); toast(t("saved_ok"));
  } catch (e) { st.textContent = "❌ " + e.message; }
}

async function renderSticky() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>📌 ${t("sticky_t")}</h2>
    <p class="desc">${t("sticky_d")}</p>
    <div class="field"><label><input type="checkbox" id="stickyEnabled" ${config.stickyEnabled ? "checked" : ""}> ${t("enable")}</label></div>
    <button class="btn" onclick="saveStickyEnable()">💾 ${t("save")}</button> <span class="status" id="stickyStatus"></span>
    <p class="desc" style="margin-top:16px">Usa <code>/sticky agregar</code> y <code>/sticky quitar</code> desde Discord para gestionar stickies.</p></div>`;
}

async function saveStickyEnable() {
  const st = document.getElementById("stickyStatus");
  st.textContent = t("saving");
  const patch = { stickyEnabled: document.getElementById("stickyEnabled").checked };
  try {
    const r = await fetch(`/api/guild/${guildId}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || (data.details || []).join(", ") || "error");
    Object.assign(config, patch);
    st.textContent = "✅ " + t("saved_ok"); toast(t("saved_ok"));
  } catch (e) { st.textContent = "❌ " + e.message; }
}

async function renderAfk() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>💤 ${t("afk_t")}</h2>
    <p class="desc">${t("afk_d")}</p>
    <div class="field"><label><input type="checkbox" id="afkEnabled" ${config.afkEnabled ? "checked" : ""}> ${t("enable")}</label></div>
    <button class="btn" onclick="saveAfk()">💾 ${t("save")}</button> <span class="status" id="afkStatus"></span>
    <p class="desc" style="margin-top:16px">Los usuarios pueden escribir <code>!afk [razón]</code> para ponerse AFK. El bot remueve AFK automáticamente al escribir y notifica cuando mencionan a alguien AFK.</p></div>`;
}

async function saveAfk() {
  const st = document.getElementById("afkStatus");
  st.textContent = t("saving");
  const patch = { afkEnabled: document.getElementById("afkEnabled").checked };
  try {
    const r = await fetch(`/api/guild/${guildId}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || (data.details || []).join(", ") || "error");
    Object.assign(config, patch);
    st.textContent = "✅ " + t("saved_ok"); toast(t("saved_ok"));
  } catch (e) { st.textContent = "❌ " + e.message; }
}

async function renderReactionroles() {
  const main = document.getElementById("main");
  const chans = (meta.channels || []).filter(c => c.type === 0);
  main.innerHTML = `<div class="panel"><h2>🎭 ${t("reactionroles_t")}</h2>
    <p class="desc">${t("reactionroles_d")}</p>
    <div id="rrlist">${t("staff_loading")}</div>
    <span class="status" id="rrstatus"></span></div>
    <div class="panel"><h2>➕ ${t("rr_add_t")}</h2>
    <div class="field"><label>${t("rr_channel")}</label><select id="rr_channel">${chans.map(c => `<option value="${c.id}"># ${c.name}</option>`).join("")}</select></div>
    <div class="field"><label>${t("rr_message")}</label><input type="text" id="rr_message" maxlength="20" placeholder="123456789012345678"></div>
    <div class="field"><label>${t("rr_emoji")}</label><input type="text" id="rr_emoji" maxlength="50" placeholder="👍"></div>
    <div class="field"><label>${t("rr_role")}</label><select id="rr_role">${(meta.roles || []).map(r => `<option value="${r.id}">${escHtml(r.name)}</option>`).join("")}</select></div>
    <div class="field"><label>${t("rr_type")}</label><select id="rr_type"><option value="normal">${t("rr_type_normal")}</option><option value="toggle">${t("rr_type_toggle")}</option></select></div>
    <button class="btn" onclick="rrAdd()">➕ ${t("ar_add_btn")}</button>
    <span class="status" id="rradd_status"></span></div>`;
  rrReload();
}
async function rrReload() {
  const box = document.getElementById("rrlist");
  if (!box) return;
  box.innerHTML = t("staff_loading");
  const list = await fetch(`/api/guild/${guildId}/reactionroles`).then(r => r.json()).catch(() => []);
  if (!list.length) { box.innerHTML = `<p class="desc">${t("rr_empty")}</p>`; return; }
  box.innerHTML = list.map(a => {
    const rn = ((meta.roles || []).find(r => r.id === a.roleId) || {}).name || a.roleId;
    return `
    <div class="rowline" style="flex-wrap:wrap;align-items:flex-start">
      <span style="flex:1;min-width:220px"><b>${escHtml(a.emoji)}</b> → <b>${escHtml(rn)}</b> <small style="color:var(--muted)">(${escHtml(a.type || "normal")})</small><br>
      <small style="color:var(--muted)">💬 ${escHtml(a.messageId)}</small></span>
      <span><button class="btn small danger" onclick="rrDelete('${escHtml(a.messageId)}','${escHtml(a.emoji).replace(/'/g, "\\'")}')">🗑️ ${t("sug_delete")}</button></span>
    </div>`;
  }).join("");
}

async function rrAdd() {
  const st = document.getElementById("rradd_status");
  st.textContent = t("saving");
  const payload = {
    channelId: document.getElementById("rr_channel").value,
    messageId: document.getElementById("rr_message").value.trim(),
    emoji: document.getElementById("rr_emoji").value.trim(),
    roleId: document.getElementById("rr_role").value,
    type: document.getElementById("rr_type").value,
  };
  try {
    const r = await fetch(`/api/guild/${guildId}/reactionroles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    document.getElementById("rr_message").value = "";
    document.getElementById("rr_emoji").value = "";
    st.textContent = "✅ " + t("rr_added") + (data.reacted ? "" : " (" + t("rr_no_react") + ")");
    st.className = "status ok";
    toast("✅ " + t("rr_added"));
    rrReload();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}
async function rrDelete(messageId, emoji) {
  if (!confirm(t("rr_confirm"))) return;
  const st = document.getElementById("rrstatus");
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/reactionroles/${encodeURIComponent(messageId)}/${encodeURIComponent(emoji)}`, { method: "DELETE" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("rr_deleted");
    st.className = "status ok";
    toast("✅ " + t("rr_deleted"));
    rrReload();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}

async function renderAntinuke() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>🛡️ ${t("antinuke_t")}</h2>
    <p class="desc">${t("antinuke_d")}</p>
    <div class="field"><label><input type="checkbox" id="anEnabled" ${config.antiNukeEnabled ? "checked" : ""}> ${t("enable")}</label></div>
    <div class="field"><label>Bans por min (límite)</label><input type="number" id="anBanLimit" value="${config.antiNukeBanLimit || 5}" min="1" max="50"></div>
    <div class="field"><label>Kicks por min (límite)</label><input type="number" id="anKickLimit" value="${config.antiNukeKickLimit || 5}" min="1" max="50"></div>
    <div class="field"><label>Acción</label><select id="anAction">
      <option value="timeout" ${config.antiNukeAction === "timeout" ? "selected" : ""}>Timeout 1h</option>
      <option value="kick" ${config.antiNukeAction === "kick" ? "selected" : ""}>Kick</option>
      <option value="ban" ${config.antiNukeAction === "ban" ? "selected" : ""}>Ban</option>
    </select></div>
    <button class="btn" onclick="saveAntiNuke()">💾 ${t("save")}</button> <span class="status" id="anStatus"></span></div>`;
}

async function saveAntiNuke() {
  const st = document.getElementById("anStatus");
  st.textContent = t("saving");
  const patch = {
    antiNukeEnabled: document.getElementById("anEnabled").checked,
    antiNukeBanLimit: parseInt(document.getElementById("anBanLimit").value) || 5,
    antiNukeKickLimit: parseInt(document.getElementById("anKickLimit").value) || 5,
    antiNukeAction: document.getElementById("anAction").value,
  };
  try {
    const r = await fetch(`/api/guild/${guildId}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || (data.details || []).join(", ") || "error");
    Object.assign(config, patch);
    st.textContent = "✅ " + t("saved_ok"); toast(t("saved_ok"));
  } catch (e) { st.textContent = "❌ " + e.message; }
}

async function renderAutorespond() {
  const main = document.getElementById("main");
  const chans = (meta.channels || []).filter(c => c.type === 0);
  main.innerHTML = `<div class="panel"><h2>🤖 ${t("autorespond_t")}</h2>
    <p class="desc">${t("autorespond_d")}</p>
    <div id="arlist">${t("staff_loading")}</div>
    <span class="status" id="arstatus"></span></div>
    <div class="panel"><h2>➕ ${t("ar_add_t")}</h2>
    <div class="field"><label>${t("ar_trigger")}</label><input type="text" id="ar_trigger" maxlength="100"></div>
    <div class="field"><label>${t("ar_response")}</label><textarea id="ar_response" rows="5" maxlength="2000" style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--card-border);background:rgba(0,0,0,0.4);color:var(--text);font-size:14px;font-family:inherit;resize:vertical"></textarea></div>
    <div class="field"><label>${t("ar_channel")}</label><select id="ar_channel"><option value="">${t("ar_all_channels")}</option>${chans.map(c => `<option value="${c.id}"># ${c.name}</option>`).join("")}</select></div>
    <div class="field"><label><input type="checkbox" id="ar_mention"> ${t("ar_mention")}</label></div>
    <div class="field"><label><input type="checkbox" id="ar_mentionuser" checked> Mencionar al autor en la respuesta</label></div>
    <div class="field"><label><input type="checkbox" id="ar_del"> ${t("ar_deltrigger")}</label></div>
    <div class="field"><label>${t("ar_match")}</label><select id="ar_match"><option value="contains">${t("ar_match_contains")}</option><option value="exact">${t("ar_match_exact")}</option></select></div>
    <button class="btn" onclick="arAdd()">➕ ${t("ar_add_btn")}</button>
    <span class="status" id="aradd_status"></span></div>`;
  arReload();
}
async function arReload() {
  const box = document.getElementById("arlist");
  if (!box) return;
  box.innerHTML = t("staff_loading");
  const list = await fetch(`/api/guild/${guildId}/autoresponses`).then(r => r.json()).catch(() => []);
  if (!list.length) { box.innerHTML = `<p class="desc">${t("ar_empty")}</p>`; return; }
  box.innerHTML = list.map(a => `
    <div class="rowline" style="flex-wrap:wrap;align-items:flex-start">
      <span style="flex:1;min-width:220px"><b>"${escHtml(a.trigger)}"</b> <small style="color:var(--muted)">(${a.matchType === "exact" ? t("ar_match_exact") : t("ar_match_contains")}${a.channelIds && a.channelIds.length ? ` • #${(meta.channels.find(c => c.id === a.channelIds[0]) || {}).name || "?"}` : ""}${a.requiresMention ? " • @bot" : ""}${a.deleteTrigger ? " • 🗑️" : ""})</small><br>
      <small style="color:var(--muted)">→ ${escHtml(a.response || "")}</small>${a.mentionUser === false ? '' : ' • @autor'}</span>
      <span style="display:flex;gap:6px"><button class="btn small ghost" onclick="arEdit('${escHtml(a.trigger).replace(/'/g, "\\'")}')">✏️ Editar</button><button class="btn small danger" onclick="arDelete('${escHtml(a.trigger).replace(/'/g, "\\'")}')">🗑️ ${t("sug_delete")}</button></span>
    </div>`).join("");
}
let arEditTrigger = null;
function arEdit(trigger) {
  fetch(`/api/guild/${guildId}/autoresponses`).then(r => r.json()).then(list => {
    const a = (list || []).find(x => x.trigger === trigger);
    if (!a) return;
    arEditTrigger = a.trigger;
    document.getElementById("ar_trigger").value = a.trigger;
    document.getElementById("ar_response").value = a.response || "";
    document.getElementById("ar_channel").value = (a.channelIds && a.channelIds[0]) || "";
    document.getElementById("ar_mention").checked = !!a.requiresMention;
    document.getElementById("ar_mentionuser").checked = a.mentionUser !== false;
    document.getElementById("ar_del").checked = !!a.deleteTrigger;
    document.getElementById("ar_match").value = a.matchType === "exact" ? "exact" : "contains";
    document.getElementById("ar_trigger").scrollIntoView({ behavior: "smooth", block: "center" });
    const st = document.getElementById("aradd_status");
    if (st) { st.textContent = "✏️ Editando: " + a.trigger; st.className = "status"; }
  }).catch(() => {});
}
async function arAdd() {
  const st = document.getElementById("aradd_status");
  st.textContent = t("saving");
  const payload = {
    trigger: document.getElementById("ar_trigger").value,
    response: document.getElementById("ar_response").value,
    channelId: document.getElementById("ar_channel").value || "",
    requiresMention: document.getElementById("ar_mention").checked,
    deleteTrigger: document.getElementById("ar_del").checked,
    matchType: document.getElementById("ar_match").value,
    mentionUser: document.getElementById("ar_mentionuser").checked,
    oldTrigger: arEditTrigger || undefined,
  };
  try {
    const r = await fetch(`/api/guild/${guildId}/autoresponses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    arEditTrigger = null;
    document.getElementById("ar_trigger").value = "";
    document.getElementById("ar_response").value = "";
    st.textContent = "✅ " + t("ar_added");
    st.className = "status ok";
    toast("✅ " + t("ar_added"));
    arReload();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}
async function arDelete(trigger) {
  if (!confirm(t("ar_confirm"))) return;
  const st = document.getElementById("arstatus");
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/autoresponses/${encodeURIComponent(trigger)}`, { method: "DELETE" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("ar_deleted");
    st.className = "status ok";
    toast("✅ " + t("ar_deleted"));
    arReload();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}

async function renderTempvoice() {
  const main = document.getElementById("main");
  const catChannels = meta.channels.filter(c => c.type === 4);
  const voiceChannels = meta.channels.filter(c => c.type === 2);
  main.innerHTML = `<div class="panel"><h2>🔊 ${t("tempvoice_t")}</h2>
    <p class="desc">${t("tempvoice_d")}</p>
    <div class="field"><label><input type="checkbox" id="tvEnabled" ${config.tempVoiceEnabled ? "checked" : ""}> ${t("enable")}</label></div>
    <div class="field"><label>Canal creador</label><select id="tvCreator">${voiceChannels.map(c => `<option value="${c.id}" ${(config.tempVoiceCreatorChannelId || "") === c.id ? "selected" : ""}>#${c.name}</option>`).join("")}</select></div>
    <div class="field"><label>Categoría</label><select id="tvCat">${catChannels.map(c => `<option value="${c.id}" ${(config.tempVoiceCategoryId || "") === c.id ? "selected" : ""}>${c.name}</option>`).join("")}</select></div>
    <button class="btn" onclick="saveTempVoice()">💾 ${t("save")}</button> <span class="status" id="tvStatus"></span></div>`;
}

async function saveTempVoice() {
  const st = document.getElementById("tvStatus");
  st.textContent = t("saving");
  const patch = {
    tempVoiceEnabled: document.getElementById("tvEnabled").checked,
    tempVoiceCreatorChannelId: document.getElementById("tvCreator").value,
    tempVoiceCategoryId: document.getElementById("tvCat").value,
  };
  try {
    const r = await fetch(`/api/guild/${guildId}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || (data.details || []).join(", ") || "error");
    Object.assign(config, patch);
    st.textContent = "✅ " + t("saved_ok"); toast(t("saved_ok"));
  } catch (e) { st.textContent = "❌ " + e.message; }
}

async function renderJoinranks() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>🏅 ${t("joinranks_t")}</h2>
    <p class="desc">${t("joinranks_d")}</p>
    <div id="jrlist">${t("staff_loading")}</div>
    <span class="status" id="jrstatus"></span></div>
    <div class="panel"><h2>➕ ${t("jr_add_t")}</h2>
    <div class="field"><label>${t("jr_emoji")}</label><input type="text" id="jr_emoji" maxlength="50" placeholder="⚔️"></div>
    <div class="field"><label>${t("jr_role")}</label><select id="jr_role">${(meta.roles || []).map(r => `<option value="${r.id}">${escHtml(r.name)}</option>`).join("")}</select></div>
    <button class="btn" onclick="jrAdd()">➕ ${t("ar_add_btn")}</button>
    <span class="status" id="jradd_status"></span></div>`;
  jrReload();
}
async function jrReload() {
  const box = document.getElementById("jrlist");
  if (!box) return;
  box.innerHTML = t("staff_loading");
  const list = await fetch(`/api/guild/${guildId}/joinranks`).then(r => r.json()).catch(() => []);
  if (!list.length) { box.innerHTML = `<p class="desc">${t("jr_empty")}</p>`; return; }
  box.innerHTML = list.map(a => `
    <div class="rowline" style="flex-wrap:wrap;align-items:flex-start">
      <span style="flex:1;min-width:220px"><b>${escHtml(a.emoji)}</b> → <b>${escHtml(a.name || a.roleId)}</b><br>
      <small style="color:var(--muted)">/joinrank ${escHtml(a.emoji)}</small></span>
      <span><button class="btn small danger" onclick="jrDelete('${escHtml(a.emoji).replace(/'/g, "\\'")}')">🗑️ ${t("sug_delete")}</button></span>
    </div>`).join("");
}
async function jrAdd() {
  const st = document.getElementById("jradd_status");
  st.textContent = t("saving");
  const payload = { emoji: document.getElementById("jr_emoji").value.trim(), roleId: document.getElementById("jr_role").value };
  try {
    const r = await fetch(`/api/guild/${guildId}/joinranks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    document.getElementById("jr_emoji").value = "";
    st.textContent = "✅ " + t("jr_added");
    st.className = "status ok";
    toast("✅ " + t("jr_added"));
    jrReload();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}
async function jrDelete(emoji) {
  if (!confirm(t("jr_confirm"))) return;
  const st = document.getElementById("jrstatus");
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/joinranks/${encodeURIComponent(emoji)}`, { method: "DELETE" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("jr_deleted");
    st.className = "status ok";
    toast("✅ " + t("jr_deleted"));
    jrReload();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}

async function renderMediaonly() {
  const main = document.getElementById("main");
  const channels = meta.channels.filter(c => c.type === 0);
  const current = config.mediaOnlyChannels || [];
  main.innerHTML = `<div class="panel"><h2>📸 ${t("mediaonly_t")}</h2>
    <p class="desc">${t("mediaonly_d")}</p>
    <div class="field"><label>Canales solo media (selecciona varios con Ctrl)</label>
      <select id="moCh" multiple style="height:200px">${channels.map(c => `<option value="${c.id}" ${current.includes(c.id) ? "selected" : ""}>#${c.name}</option>`).join("")}</select>
    </div>
    <button class="btn" onclick="saveMediaOnly()">💾 ${t("save")}</button> <span class="status" id="moStatus"></span></div>`;
}

async function saveMediaOnly() {
  const st = document.getElementById("moStatus");
  st.textContent = t("saving");
  const sel = document.getElementById("moCh");
  const channels = Array.from(sel.selectedOptions).map(o => o.value);
  const patch = { mediaOnlyChannels: channels };
  try {
    const r = await fetch(`/api/guild/${guildId}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || (data.details || []).join(", ") || "error");
    Object.assign(config, patch);
    st.textContent = "✅ " + t("saved_ok"); toast(t("saved_ok"));
  } catch (e) { st.textContent = "❌ " + e.message; }
}

let sancFilter = "active";
function sancFilterBar() {
  return ["active", "tempban", "ban", "warn", "closed", "all"].map(f =>
    `<button class="btn small ${sancFilter === f ? "" : "ghost"}" onclick="sancSetFilter('${f}')">${t("sanc_f_" + f)}</button>`
  ).join("") + ` <button class="btn small ghost" onclick="sancReload()">🔄</button>`;
}
function sancSetFilter(f) {
  sancFilter = f;
  const bar = document.getElementById("sancfilters");
  if (bar) bar.innerHTML = sancFilterBar();
  sancReload();
}
async function renderSanctions() {
  const main = document.getElementById("main");
  main.innerHTML = `
    <div class="panel"><h2>🔨 ${t("sanc_t")}</h2>
    <p class="desc">${t("sanc_d")}</p>
    <div id="sancfilters" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">${sancFilterBar()}
      <input type="text" id="sancq" placeholder="${t("sanc_search_ph")}" oninput="sancSearch(this.value)" style="flex:1;min-width:180px;max-width:280px;padding:8px 12px;border-radius:10px;border:1px solid var(--card-border);background:rgba(0,0,0,.4);color:var(--text);font-size:13px">
      <select id="sancTypeF" onchange="sancTypeFilter(this.value)" style="padding:8px 10px;border-radius:10px;border:1px solid var(--card-border);background:rgba(0,0,0,.4);color:var(--text);font-size:13px">
        <option value="">${t("sanc_type_any")}</option>
        ${["ban", "tempban", "softban", "kick", "timeout", "warn"].map(x => `<option value="${x}">${sancTypeLabel({ type: x })}</option>`).join("")}
      </select>
      <button class="btn small ghost" onclick="sancExport('csv')">⬇ ${t("sanc_csv")}</button>
      <button class="btn small ghost" onclick="sancExport('txt')">⬇ ${t("sanc_txt")}</button>
      <span id="sancinfo" class="cp-info"></span>
    </div>
    <div id="sanclist">${t("staff_loading")}</div>
    <span class="status" id="sancstatus"></span></div>
    <div class="panel"><h2>➕ ${t("sanc_add_t")}</h2>
    <div class="field"><label>${t("sanc_user")}</label><input type="text" id="sanc_user" maxlength="20" placeholder="123456789012345678"></div>
    <div class="field"><label>${t("sanc_type")}</label><select id="sanc_type" onchange="document.getElementById('sanc_dur_wrap').style.display = this.value === 'tempban' ? '' : 'none'"><option value="tempban">${t("sanc_tempban")}</option><option value="ban">${t("sanc_permaban")}</option></select></div>
    <div class="field" id="sanc_dur_wrap"><label>${t("sanc_dur")}</label><input type="text" id="sanc_dur" maxlength="10" placeholder="10m / 2h / 7d"></div>
    <div class="field"><label>${t("sanc_reason")}</label><input type="text" id="sanc_reason" maxlength="400"></div>
    <button class="btn" onclick="sancAdd()">🔨 ${t("sanc_add_btn")}</button>
    <span class="status" id="sancadd_status"></span></div>
    <div class="panel"><h2>📢 ${t("sanc_ch_t")}</h2>
    <p class="desc">${t("sanc_ch_d")}</p>
    <div class="subpanel" style="margin:0 0 14px">
      <div class="field" style="margin:0"><label>🧾 ${t("sanc_ch_embed")}</label>
        <select id="sancEmbedCh"><option value="">—</option>${(meta.channels || []).filter(c => c.type === 0).map(c => `<option value="${c.id}" ${(config.sancEmbedChannelId || "") === c.id ? "selected" : ""}># ${c.name}</option>`).join("")}</select>
        <div class="help">${t("sanc_ch_embed_d")}</div></div>
    </div>
    <div class="field"><label>${t("sanc_ch_temp")}</label><select id="sancTempCh"><option value="">—</option>${(meta.channels || []).filter(c => c.type === 0).map(c => `<option value="${c.id}" ${(config.sancTempChannelId || "") === c.id ? "selected" : ""}># ${c.name}</option>`).join("")}</select></div>
    <div class="field"><label>${t("sanc_ch_perma")}</label><select id="sancPermaCh"><option value="">—</option>${(meta.channels || []).filter(c => c.type === 0).map(c => `<option value="${c.id}" ${(config.sancPermaChannelId || "") === c.id ? "selected" : ""}># ${c.name}</option>`).join("")}</select></div>
    <div class="field"><label>${t("sanc_ch_warn")}</label><select id="sancWarnCh"><option value="">—</option>${(meta.channels || []).filter(c => c.type === 0).map(c => `<option value="${c.id}" ${(config.sancWarnChannelId || "") === c.id ? "selected" : ""}># ${c.name}</option>`).join("")}</select></div>
    <button class="btn" onclick="saveSancChannels()">💾 ${t("save")}</button>
    <span class="status" id="sancch_status"></span></div>`;
  sancReload();
}
async function saveSancChannels() {
  const st = document.getElementById("sancch_status");
  st.textContent = t("saving");
  const patch = {
    sancEmbedChannelId: document.getElementById("sancEmbedCh").value || "",
    sancTempChannelId: document.getElementById("sancTempCh").value || "",
    sancPermaChannelId: document.getElementById("sancPermaCh").value || "",
    sancWarnChannelId: document.getElementById("sancWarnCh").value || "",
  };
  try {
    const r = await fetch(`/api/guild/${guildId}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || (data.details || []).join(", ") || "error");
    Object.assign(config, patch);
    st.textContent = "✅ " + t("saved_ok");
    st.className = "status ok";
    toast(t("saved_ok"));
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}
function sancBadge(s) {
  if (s.type === "warn" && s.active) return `<span style="background:#5865f222;color:#8b9bff;border:1px solid #5865f266;padding:2px 8px;border-radius:8px;font-size:12px;font-weight:700">⚠️ WARN</span>`;
  if (!s.active) return `<span style="background:#949ba422;color:#949ba4;border:1px solid #949ba466;padding:2px 8px;border-radius:8px;font-size:12px;font-weight:700">🔒 ${t("sanc_closed")}</span>`;
  if (s.type === "tempban") {
    const left = (s.expiresAt || 0) - Date.now();
    const txt = left > 0 ? t("sanc_left") + " " + sancFmtDur(left) : t("sanc_expired");
    return `<span style="background:#f0b23c22;color:#f0b23c;border:1px solid #f0b23c66;padding:2px 8px;border-radius:8px;font-size:12px;font-weight:700">⏳ TEMP • ${txt}</span>`;
  }
  return `<span style="background:#ed424522;color:#ed4245;border:1px solid #ed424566;padding:2px 8px;border-radius:8px;font-size:12px;font-weight:700">🔨 PERMA</span>`;
}
function sancFmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}min`;
  if (m) return `${m}min`;
  return `${s}s`;
}
let sancData = [];
let sancQ = "";
let sancTypeF = "";
async function sancReload() {
  const box = document.getElementById("sanclist");
  if (!box) return;
  box.innerHTML = t("staff_loading");
  sancData = await fetch(`/api/guild/${guildId}/sanctions`).then(r => r.json()).catch(() => []);
  sancPaint();
}
function sancMatch(s) {
  if (sancFilter === "active" && !s.active) return false;
  if (sancFilter === "closed" && s.active) return false;
  if (sancFilter === "all") { /* todos */ }
  else if (sancFilter === "warn") { if (s.type !== "warn") return false; }
  else if (sancFilter === "active" || sancFilter === "closed") { /* ya filtrado */ }
  else if (s.active && s.type !== sancFilter) return false;
  if (sancTypeF && s.type !== sancTypeF) return false;
  if (sancQ) {
    const q = normTxt(sancQ);
    const hay = [s.id, s.userId, s.userTag, s.reason, s.moderatorTag, s.type, s.evidenceUrl, s.evidence ? "pruebas si" : "pruebas no"].join(" ");
    if (!normTxt(hay).includes(q)) return false;
  }
  return true;
}
function sancDur(s) {
  if (s.type === "ban" || s.type === "softban") return "Permanente";
  if (!s.durationMs) return s.type === "kick" ? "Instantáneo" : "—";
  const m = Math.round(s.durationMs / 60000);
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " h" + (m % 60 ? ` ${m % 60} min` : "");
  const d = Math.floor(h / 24);
  return d + " d" + (h % 24 ? ` ${h % 24} h` : "");
}
function sancTypeLabel(s) {
  return ({ ban: "🔨 Ban permanente", tempban: "⏳ Ban temporal", softban: "🧹 Softban", kick: "👢 Expulsión", timeout: "🔇 Aislado", warn: "⚠️ Advertencia" })[s.type] || s.type;
}
function sancPaint() {
  const box = document.getElementById("sanclist");
  if (!box) return;
  const rows = sancData.filter(sancMatch);
  const info = document.getElementById("sancinfo");
  if (info) info.innerHTML = `<span class="navcount">${rows.length}/${sancData.length}</span>`;
  if (!rows.length) { box.innerHTML = `<p class="desc">${t("sanc_empty")}</p>`; return; }
  box.innerHTML = rows.map(s => `
    <div class="rowline" style="flex-wrap:wrap;align-items:flex-start">
      <span style="flex:1;min-width:240px"><b>${escHtml(s.id)}</b> — <@${s.userId}> ${escHtml(s.userTag || "")} ${sancBadge(s)}<br>
      <small style="color:var(--muted)"><b>${sancTypeLabel(s)}</b> · ⏱️ ${escHtml(sancDur(s))} · 🧾 ${s.evidence ? `<a href="${escHtml(s.evidenceUrl)}" target="_blank" rel="noopener">${t("sanc_ev_yes")}</a>` : t("sanc_ev_no")}</small><br>
      <small style="color:var(--muted)">${t("sanc_reason")}: ${escHtml(s.reason || "—")} • ${t("sanc_by")} ${escHtml(s.moderatorTag || "?")} • <t:${Math.floor((s.createdAt || 0) / 1000)}:f></small></span>
      <span style="display:flex;gap:6px;flex-wrap:wrap">
        ${s.active && s.type !== "warn" ? `<button class="btn small" onclick="sancUnban('${escHtml(s.id)}')">✅ ${t("sanc_unban")}</button>` : ""}
        ${s.active && s.type === "warn" ? `<button class="btn small" onclick="sancUnban('${escHtml(s.id)}')">✅ ${t("sanc_delwarn")}</button>` : ""}
        <button class="btn small ghost" onclick="sancDelete('${escHtml(s.id)}')">🗑️ ${t("sug_delete")}</button>
      </span>
    </div>`).join("");
}
function sancSearch(v) { sancQ = v; sancPaint(); }
function sancTypeFilter(v) { sancTypeF = v; sancPaint(); }
function sancExport(kind) {
  const rows = sancData.filter(sancMatch);
  if (!rows.length) { toast(t("sanc_empty"), false); return; }
  const head = ["Caso", "Usuario", "Tag", "Tipo", "Razon", "Pruebas", "Enlace", "Tiempo_ms", "Moderador", "Fecha", "Activo"];
  const cell = v => `"${String(v == null ? "" : v).replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const data = rows.map(s => [s.id, s.userId, s.userTag, s.type, s.reason, s.evidence ? "si" : "no", s.evidenceUrl || "", s.durationMs || 0, s.moderatorTag, new Date(s.createdAt || 0).toISOString(), s.active ? "si" : "no"]);
  let text, mime, name;
  if (kind === "csv") {
    text = "\uFEFF" + [head, ...data].map(r => r.map(cell).join(";")).join("\r\n");
    mime = "text/csv;charset=utf-8";
    name = `sanciones_${info.id}.csv`;
  } else {
    const lines = [`Casos de ${info.name} — ${new Date().toLocaleString()}`, ""];
    for (const r of data) lines.push(`${r[0]} | <@${r[1]}> ${r[2]} | ${sancTypeLabel({ type: r[3] })} | ${sancDur({ type: r[3], durationMs: r[7] })} | pruebas: ${r[5]}${r[6] ? " (" + r[6] + ")" : ""} | ${r[4]} | mod: ${r[8]} | ${r[9]}${r[10] === "si" ? "" : " (cerrado)"}`);
    text = lines.join("\n");
    mime = "text/plain;charset=utf-8";
    name = `sanciones_${info.id}.txt`;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(t("sanc_exported"));
}
async function sancAdd() {
  const st = document.getElementById("sancadd_status");
  st.textContent = t("saving");
  const payload = {
    userId: document.getElementById("sanc_user").value.trim(),
    type: document.getElementById("sanc_type").value,
    duration: document.getElementById("sanc_dur").value.trim(),
    reason: document.getElementById("sanc_reason").value.trim(),
  };
  try {
    const r = await fetch(`/api/guild/${guildId}/sanctions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    document.getElementById("sanc_user").value = "";
    document.getElementById("sanc_reason").value = "";
    st.textContent = "✅ " + t("sanc_added") + ` (${data.id})`;
    st.className = "status ok";
    toast("✅ " + t("sanc_added"));
    sancReload();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}
async function sancUnban(id) {
  const st = document.getElementById("sancstatus");
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/sanctions/${encodeURIComponent(id)}/unban`, { method: "POST" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("sanc_unbanned");
    st.className = "status ok";
    toast("✅ " + t("sanc_unbanned"));
    sancReload();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}
async function sancDelete(id) {
  if (!confirm(t("sanc_confirm_delete"))) return;
  const st = document.getElementById("sancstatus");
  st.textContent = t("saving");
  try {
    const r = await fetch(`/api/guild/${guildId}/sanctions/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    st.textContent = "✅ " + t("sug_deleted_ok");
    st.className = "status ok";
    sancReload();
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}

let heatData = { cfg: null, list: [], actions: ["none", "warn", "timeout", "kick", "ban"] };
function loadHeat() {
  // se pinta ya con los valores por defecto: la caja nunca se queda en "Cargando..."
  heatPaint();
  return fetch(`/api/guild/${guildId}/heat`)
    .then(r => r.json())
    .then(d => {
      if (d && !d.error) heatData = { cfg: d.cfg || null, list: d.list || [], actions: d.actions || heatData.actions };
      else if (d && d.error) console.warn("heat:", d.error);
    })
    .catch(e => console.warn("heat: no se pudo cargar", e))
    .then(heatPaint);
}
function heatPaint() {
  const box = document.getElementById("heatbox");
  if (!box) return;
  try { return pintarHeat(box); }
  catch (e) {
    console.error("heatPaint:", e);
    box.innerHTML = `<p class="desc">❌ No se pudo pintar la configuración del heat: ${escHtml(String(e && e.message || e))}</p>`;
  }
}
function pintarHeat(box) {
  const c = heatData.cfg || {};
  const acts = heatData.actions || [];
  const actOpts = (sel) => acts.map(a => `<option value="${a}" ${a === sel ? "selected" : ""}>${t("heat_act_" + a)}</option>`).join("");
  const tiers = (c.tiers && c.tiers.length ? c.tiers : [{ heat: 25, action: "warn", minutes: 0, reset: false }]);
  box.innerHTML = `
    <div class="fields">
      <div class="field bool"><label>${t("heat_enabled")}</label><label class="switch"><input type="checkbox" id="ht_en" ${c.enabled ? "checked" : ""}><span class="slider"></span></label></div>
      <div class="field"><label>${t("heat_per")}</label><input type="number" id="ht_per" min="1" max="500" value="${c.perViolation || 10}"></div>
      <div class="field"><label>${t("heat_decay")}</label><input type="number" id="ht_decay" min="1" max="720" value="${c.decayHours || 24}"></div>
      <div class="field bool"><label>${t("heat_onautomod")}</label><label class="switch"><input type="checkbox" id="ht_om" ${c.onAutomod ? "checked" : ""}><span class="slider"></span></label></div>
      <div class="field bool"><label>${t("heat_onwarn")}</label><label class="switch"><input type="checkbox" id="ht_ow" ${c.onWarn ? "checked" : ""}><span class="slider"></span></label></div>
      <div class="field bool"><label>${t("heat_dm")}</label><label class="switch"><input type="checkbox" id="ht_dm" ${c.dmUser ? "checked" : ""}><span class="slider"></span></label></div>
      <div class="field bool wide"><label>${t("heat_replace")}</label><label class="switch"><input type="checkbox" id="ht_rp" ${c.replaceFilter ? "checked" : ""}><span class="slider"></span></label></div>
    </div>
    <div class="cp-adv-h">📈 ${t("heat_ladder")}</div>
    <div id="ht_tiers">${heatTierRows(tiers, actOpts)}</div>
    <button class="btn small ghost" onclick="heatAddTier()">➕ ${t("heat_addtier")}</button>
    <div class="sf-row" style="display:flex;gap:8px;margin-top:14px">
      <button class="btn" onclick="heatSave()">💾 ${t("save")}</button><span class="status" id="heatstatus"></span></div>
    <div class="cp-adv-h" style="margin-top:18px">👥 ${t("heat_list")}</div>
    <div id="ht_list">${heatListHtml()}</div>`;
}
function heatTierRows(tiers, actOpts) {
  return `<div class="fields">${tiers.map((tr, i) => `<div class="subpanel" style="margin:0">
    <div class="fields" style="margin:0">
      <div class="field"><label>${t("heat_th")}</label><input type="number" class="ht_th" min="1" value="${tr.heat}"></div>
      <div class="field"><label>${t("heat_action")}</label><select class="ht_ac">${actOpts(tr.action)}</select></div>
      <div class="field"><label>${t("heat_min")}</label><input type="number" class="ht_mn" min="0" max="40320" value="${tr.minutes || 0}"></div>
      <div class="field bool"><label>${t("heat_reset")}</label><label class="switch"><input type="checkbox" class="ht_rs" ${tr.reset ? "checked" : ""}><span class="slider"></span></label></div>
      <div class="field"><label>&nbsp;</label><button class="btn danger small" onclick="heatDelTier(${i})">🗑️</button></div>
    </div></div>`).join("")}</div>`;
}
function heatAddTier() {
  const box = document.getElementById("ht_tiers");
  if (!box) return;
  const c = heatData.cfg || {};
  const tiers = heatReadTiers();
  tiers.push({ heat: (tiers.length ? tiers[tiers.length - 1].heat : 0) + 40, action: "timeout", minutes: 10, reset: true });
  box.innerHTML = heatTierRows(tiers, (heatData.actions || []).map(a => `<option value="${a}">${t("heat_act_" + a)}</option>`).join(""));
}
function heatDelTier(i) {
  const tiers = heatReadTiers();
  tiers.splice(i, 1);
  const box = document.getElementById("ht_tiers");
  box.innerHTML = heatTierRows(tiers, (heatData.actions || []).map(a => `<option value="${a}">${t("heat_act_" + a)}</option>`).join(""));
}
function heatReadTiers() {
  const rows = document.querySelectorAll("#ht_tiers .subpanel");
  const out = [];
  rows.forEach(r => {
    out.push({
      heat: Number(r.querySelector(".ht_th").value) || 0,
      action: r.querySelector(".ht_ac").value,
      minutes: Number(r.querySelector(".ht_mn").value) || 0,
      reset: r.querySelector(".ht_rs").checked,
    });
  });
  return out.filter(x => x.heat > 0);
}
function heatListHtml() {
  const list = heatData.list || [];
  if (!list.length) return `<p class="desc">${t("heat_empty")}</p>`;
  return `<div class="fields" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${list.map(r => {
    const c = (heatData.cfg || {}).tiers || [];
    const ti = r.tier - 1;
    const tierName = ti >= 0 && c[ti] ? t("heat_act_" + c[ti].action) : "—";
    return `<div class="subpanel" style="margin:0">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="min-width:0"><b><@${r.userId}></b> <span class="cp-tag">🔥 ${r.points}</span>
          <div style="font-size:12px;color:var(--muted)">${tierName}${r.lastAt ? ` · <t:${Math.floor(r.lastAt / 1000)}:R>` : ""}</div></div>
        <div style="display:flex;gap:6px">
          <button class="btn ghost small" onclick="heatReset('${r.userId}',true)">${t("heat_full")}</button>
          <button class="btn ghost small" onclick="heatReset('${r.userId}',false)">${t("heat_onlyheat")}</button>
        </div></div></div>`;
  }).join("")}</div>`;
}
async function heatSave() {
  const st = document.getElementById("heatstatus");
  st.className = "status";
  st.textContent = t("saving");
  const body = {
    enabled: document.getElementById("ht_en").checked,
    perViolation: Number(document.getElementById("ht_per").value) || 10,
    decayHours: Number(document.getElementById("ht_decay").value) || 24,
    onAutomod: document.getElementById("ht_om").checked,
    onWarn: document.getElementById("ht_ow").checked,
    dmUser: document.getElementById("ht_dm").checked,
    replaceFilter: document.getElementById("ht_rp").checked,
    tiers: heatReadTiers(),
  };
  try {
    const r = await fetch(`/api/guild/${guildId}/heat`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    heatData.cfg = j.cfg; heatData.list = j.list || [];
    heatPaint();
    st.textContent = "✅ " + t("saved_ok");
    st.className = "status ok";
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}
async function heatReset(userId, full) {
  try {
    const r = await fetch(`/api/guild/${guildId}/heat/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, full }) });
    const j = await r.json();
    heatData.list = j.list || [];
    const box = document.getElementById("ht_list");
    if (box) box.innerHTML = heatListHtml();
    toast(t("saved_ok"));
  } catch (e) { toast(String(e.message), false); }
}

let swData = { platforms: [], entries: [] };
const SW_MODES = { all: "sw_mode_all", live: "sw_mode_live", video: "sw_mode_video" };
function swPlat(id) { return (swData.platforms || []).find(p => p.id === id) || { id, name: id, icon: "🔗" }; }
async function loadSocialWatch() {
  try { swData = await fetch(`/api/guild/${guildId}/socialwatch`).then(r => r.json()); } catch { swData = { platforms: [], entries: [] }; }
  swPaintAdd();
  swPaintList();
}
function swPaintAdd() {
  const box = document.getElementById("swadd");
  if (!box) return;
  const chOpts = `<option value="">${t("none_opt")}</option>` + (meta.channels || []).filter(c => c.type === 0)
    .map(c => `<option value="${c.id}"># ${escHtml(c.name)}</option>`).join("");
  const roleOpts = `<option value="">${t("none_opt")}</option>` + (meta.roles || []).map(r => `<option value="${r.id}">${escHtml(r.name)}</option>`).join("");
  box.innerHTML = `<div class="cp-adv-h">➕ ${t("sw_add")}</div>
    <div class="fields">
      <div class="field"><label>${t("sw_platform")}</label>
        <select id="sw_plat">${(swData.platforms || []).map(p => `<option value="${p.id}">${p.icon} ${escHtml(p.name)}</option>`).join("")}</select>
        <div class="help" id="sw_hint"></div></div>
      <div class="field"><label>${t("sw_handle")}</label><input type="text" id="sw_handle" placeholder="@canal / URL"></div>
      <div class="field"><label>${t("sw_mode")}</label>
        <select id="sw_mode">${Object.entries(SW_MODES).map(([k, v]) => `<option value="${k}">${t(v)}</option>`).join("")}</select></div>
      <div class="field"><label>${t("sw_notify")}</label><select id="sw_ch">${chOpts}</select></div>
      <div class="field"><label>${t("sw_role")}</label><select id="sw_role">${roleOpts}</select></div>
    </div>
    <button class="btn small" onclick="swAdd()">${t("sw_add")}</button>`;
  const up = () => { const p = swPlat(document.getElementById("sw_plat").value); const el = document.getElementById("sw_hint"); if (el) el.textContent = p.hint || ""; };
  document.getElementById("sw_plat").addEventListener("change", up);
  up();
}
function swPaintList() {
  const box = document.getElementById("swlist");
  if (!box) return;
  const list = swData.entries || [];
  if (!list.length) { box.innerHTML = `<p class="desc">${t("sw_empty")}</p>`; return; }
  const chName = (id) => { const c = (meta.channels || []).find(x => x.id === id); return c ? "#" + c.name : t("none_opt"); };
  box.innerHTML = list.map(e => {
    const p = swPlat(e.platform);
    return `<div class="cp-card ${e.enabled ? "" : "is-off"}" style="margin-top:10px">
      <div class="cp-head">
        <div class="cp-name"><b>${p.icon} ${escHtml(e.handle || "?")}</b>
          <span class="cp-tag alt">${escHtml(p.name)}</span>
          <span class="cp-tag">${t(SW_MODES[e.mode] || "sw_mode_all")}</span>
          ${e.lastError ? `<span class="cp-tag" style="background:rgba(255,93,93,.15);border-color:rgba(255,93,93,.4);color:#ff9a9a">${escHtml(e.lastError)}</span>` : ""}
          <small>${t("sw_notify")}: ${escHtml(chName(e.notifyChannelId))}${e.roleId ? ` · <@&${e.roleId}>` : ""}${e.lastCheck ? ` · ${t("sw_checked")} <t:${Math.floor(e.lastCheck / 1000)}:R>` : ""}</small></div>
        <div class="cp-quick">
          <label class="switch"><input type="checkbox" onchange="swPatch('${e.id}',{enabled:this.checked})" ${e.enabled ? "checked" : ""}><span class="slider"></span></label>
          <button class="btn ghost small" onclick="swTest('${e.id}')">🧪</button>
          <button class="btn danger small" onclick="swDel('${e.id}')">🗑️</button>
        </div></div></div>`;
  }).join("");
}
async function swSaveList() {
  const r = await fetch(`/api/guild/${guildId}/socialwatch`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(swData.entries) });
  const j = await r.json();
  if (!r.ok) { toast(j.error || "error", false); return false; }
  swData.entries = j.entries || swData.entries;
  return true;
}
async function swAdd() {
  const platform = document.getElementById("sw_plat").value;
  const handle = document.getElementById("sw_handle").value.trim();
  const notifyChannelId = document.getElementById("sw_ch").value;
  if (!handle) { toast(t("sw_badhandle"), false); return; }
  if (!notifyChannelId) { toast(t("sw_badch"), false); return; }
  swData.entries.push({
    id: "s" + Date.now(), platform, handle,
    notifyChannelId, mode: document.getElementById("sw_mode").value,
    roleId: document.getElementById("sw_role").value, enabled: true,
  });
  if (await swSaveList()) { swPaintList(); toast(t("sw_added")); }
}
async function swPatch(id, patch) {
  const e = (swData.entries || []).find(x => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  await swSaveList();
  swPaintList();
}
async function swDel(id) {
  swData.entries = (swData.entries || []).filter(x => x.id !== id);
  if (await swSaveList()) { swPaintList(); toast(t("sw_removed")); }
}
async function swTest(id) {
  const e = (swData.entries || []).find(x => x.id === id);
  if (!e) return;
  toast(t("saving"));
  try {
    const r = await fetch(`/api/guild/${guildId}/socialwatch/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    toast(`${j.sent ? "✅" : "❌"} ${j.state || ""}`, !!j.sent);
    loadSocialWatch();
  } catch (e) { toast(String(e.message), false); }
}

// ============== ASISTENTE DE CONFIGURACIÓN (checklist con progreso) ==============
const WIZ_STEPS = [
  { mod: "roles", lvl: 0, ok: c => !!(c.staffRoleId && c.miembroRoleId) },
  { mod: "welcome", lvl: 0, ok: c => !!(c.welcomeEnabled && c.welcomeChannelId) },
  { mod: "verification", lvl: 0, ok: c => !!(c.verificationEnabled && c.verificationChannelId && c.verifiedRoleId) },
  { mod: "tickets", lvl: 0, ok: c => !!(c.ticketCategoryId && c.ticketClosedCategoryId && c.ticketRoleId) },
  { mod: "automod", lvl: 0, ok: c => !!(c.autoModEnabled || c.antiLinkEnabled) },
  { mod: "logging", lvl: 0, ok: c => !!(c.logEnabled && c.logChannelId) },
  { mod: "goodbye", lvl: 1, ok: c => !!(c.goodbyeEnabled && c.goodbyeChannelId) },
  { mod: "joins", lvl: 1, ok: c => !!(c.joinGateEnabled || c.antiRaidEnabled) },
  { mod: "invites", lvl: 1, ok: c => !!(c.invEnabled && c.invitesChannelId) },
  { mod: "inscriptions", lvl: 1, ok: c => !!c.inscriptionChannelId },
  { mod: "socials", lvl: 2, ok: c => !!(c.socialTwitchChannel || c.socialYoutubeChannel || c.socialKickChannel || c.socialTiktokChannel || c.socialXChannel || c.socialInstagramChannel) },
  { mod: "confesiones", lvl: 2, ok: c => !!(c.confEnabled && c.confChannelId) },
  { mod: "suggestions", lvl: 2, ok: c => !!c.sugIntakeChannelId },
  { mod: "polls", lvl: 2, ok: c => !!c.pollChannelId },
  { mod: "starboard", lvl: 2, ok: c => !!c.starboardEnabled },
  { mod: "afk", lvl: 2, ok: c => !!c.afkEnabled },
  { mod: "tempvoice", lvl: 2, ok: c => !!c.tempVoiceEnabled },
  { mod: "mcserver", lvl: 2, ok: c => !!(c.mcServer && c.mcServer.host) },
];
const WIZ_TITLES = { socials: "wiz_socials", confesiones: "wiz_conf", tempvoice: "wiz_tv" };
function wizTitle(mod) {
  const s = schema.find(x => x.module === mod);
  if (s) return L(s, "title");
  return (WIZ_TITLES[mod] && t(WIZ_TITLES[mod])) || mod;
}
function wizState() {
  const c = config || {};
  let done = 0, total = 0, pending = [];
  for (const s of WIZ_STEPS) {
    if (s.lvl > 0) continue;
    total++;
    if (s.ok(c)) done++; else pending.push(s);
  }
  return { done, total, pending };
}
function renderWizard() {
  const main = document.getElementById("main");
  const st = wizState();
  const pct = Math.round((st.done / st.total) * 100);
  const groups = [
    { lvl: 0, key: "wiz_ess" },
    { lvl: 1, key: "wiz_rec" },
    { lvl: 2, key: "wiz_opt" },
  ];
  const block = (lvl, key) => {
    const steps = WIZ_STEPS.filter(s => s.lvl === lvl);
    if (!steps.length) return "";
    return `<div class="panel"><h2>${t(key)}</h2><div class="fields">${steps.map(s => {
      const ok = !!s.ok(config || {});
      return `<div class="subpanel ${ok ? "" : "pending"}" style="margin:0;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="min-width:0"><b style="color:${ok ? "var(--ok)" : "var(--warn)"}">${ok ? "✅" : "⭕"} ${escHtml(wizTitle(s.mod))}</b>
          <div style="font-size:12px;color:var(--muted)">${ok ? t("wiz_done") : t("wiz_pending")}</div></div>
        <button class="btn small ${ok ? "ghost" : ""}" onclick="show('${s.mod}')">${t("wiz_go")} →</button></div>`;
    }).join("")}</div></div>`;
  };
  main.innerHTML = `
    <div class="modbar"><div class="mb-l"><span class="mb-ic">🧙</span>
      <div><div class="mb-title">${t("wiz_t")}</div><div class="mb-sub">${info.name}</div></div></div>
      <div class="mb-r">${st.pending.length ? `<button class="btn" onclick="show('${st.pending[0].mod}')">${t("wiz_next")} →</button>` : `<span class="status ok">✅ ${t("wiz_all_done")}</span>`}</div></div>
    <div class="panel"><h2>${t("wiz_prog")}</h2><p class="desc">${t("wiz_d")}</p>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px;height:14px;border-radius:20px;background:rgba(255,255,255,.08);overflow:hidden">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#e02636,#35d07f)"></div></div>
        <b style="font-size:20px">${st.done}/${st.total}</b><span style="color:var(--muted)">${pct}%</span>
      </div></div>
    ${block(0, "wiz_ess")}${block(1, "wiz_rec")}${block(2, "wiz_opt")}`;
}

let rescueData = {};
async function renderRescue() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>🆘 ${t("rescue_t")}</h2><p class="desc">${t("staff_loading")}</p></div>`;
  try { rescueData = await fetch(`/api/guild/${guildId}/rescue`).then(r => r.json()); } catch { rescueData = {}; }
  rescuePaint();
}
function rescuePaint() {
  const main = document.getElementById("main");
  const d = rescueData || {};
  main.innerHTML = `
    <div class="modbar"><div class="mb-l"><span class="mb-ic">🆘</span>
      <div><div class="mb-title">${t("rescue_t")}</div><div class="mb-sub">${t("rescue_d")}</div></div></div>
      <div class="mb-r"><span class="status" id="resstatus"></span></div></div>
    <div class="panel"><h2>🔑 ${t("rescue_key_t")}</h2><p class="desc">${t("rescue_key_d")}</p>
      <div class="subpanel">
        <div class="rowline"><span>${t("rescue_state")}</span>
          <b style="color:${d.keyActive ? "var(--ok)" : "var(--muted)"}">${d.keyActive ? "🟢 " + t("rescue_active") : "⚪ " + t("rescue_inactive")}</b></div>
        ${d.keyActive ? `<div class="rowline"><span>${t("rescue_hint")}</span><code>${escHtml(d.keyHint || "")}</code></div>
        <div class="rowline"><span>${t("rescue_expires")}</span><b><t:${Math.floor((d.expiresAt || 0) / 1000)}:R></b></div>
        <div class="rowline"><span>${t("rescue_uses")}</span><b>${d.usesLeft}</b></div>` : ""}
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          ${d.keyActive ? `<button class="btn danger small" onclick="rescueAct({action:'revoke'})">${t("rescue_revoke")}</button>` : ""}
          <span style="color:var(--muted);font-size:12px">${t("rescue_cmd_hint")}</span>
        </div>
      </div></div>
    <div class="panel"><h2>🎖️ ${t("rescue_coown_t")}</h2><p class="desc">${t("rescue_coown_d")}</p>
      <div class="field" style="max-width:520px"><label>${t("rescue_coown_add")}</label>
        <div style="display:flex;gap:8px"><input type="text" id="res_uid" placeholder="123456789012345678">
        <button class="btn small" onclick="rescueAct({action:'coowner',add:true,userId:document.getElementById('res_uid').value})">➕</button></div></div>
      <div class="field" style="max-width:520px"><label>${t("rescue_role")}</label>
        <select id="res_role"><option value="">${t("none_opt")}</option>${(meta.roles || []).map(r => `<option value="${r.id}" ${d.rescueRoleId === r.id ? "selected" : ""}>${escHtml(r.name)}</option>`).join("")}</select>
        <button class="btn small ghost" style="margin-top:8px" onclick="rescueAct({roleId:document.getElementById('res_role').value})">💾 ${t("save")}</button>
        <div class="help">${t("rescue_role_d")}</div></div>
      <div id="res_coown">${rescueUserList()}</div></div>
    <div class="panel"><h2>🆘 ${t("rescue_grants_t")}</h2><p class="desc">${t("rescue_grants_d")}</p>
      <div id="res_grants">${rescueGrantList()}</div></div>`;
}
function rescueUserList() {
  const list = rescueData.coOwners || [];
  if (!list.length) return `<p class="desc">${t("rescue_empty")}</p>`;
  return `<div class="chipbox">${list.map(u => `<span class="mchip on">👮 <@${u}></span><button class="btn danger small" style="margin-right:6px" onclick="rescueAct({action:'coowner',add:false,userId:'${u}'})">✕</button>`).join("")}</div>`;
}
function rescueGrantList() {
  const list = rescueData.grants || [];
  if (!list.length) return `<p class="desc">${t("rescue_empty")}</p>`;
  return `<div class="fields" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${list.map(g => `<div class="subpanel" style="margin:0;display:flex;justify-content:space-between;align-items:center;gap:8px">
    <div><b><@${g.userId}></b><div style="font-size:12px;color:var(--muted)"><t:${Math.floor((g.at || 0) / 1000)}:R></div></div>
    <button class="btn danger small" onclick="rescueAct({action:'revokeGrant',userId:'${g.userId}'})">${t("rescue_revoke_grant")}</button></div>`).join("")}</div>`;
}
async function rescueAct(body) {
  const st = document.getElementById("resstatus");
  if (st) { st.textContent = t("saving"); st.className = "status"; }
  try {
    const r = await fetch(`/api/guild/${guildId}/rescue`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    rescueData = j;
    rescuePaint();
    toast(t("saved_ok"));
  } catch (e) { if (st) { st.textContent = "❌ " + e.message; st.className = "status err"; } }
}

let premData = { active: false, plans: [], whiteLabel: false, keys: [], features: [], plansInfo: {}, brand: {} };
const PREM_LABEL = {
  perpetual: "🎟️ Licencia perpetua", sub: "♻️ Suscripción mensual", boost: "⚡ Boost", white: "👑 Licencia por marca", donate: "💛 Donante",
};
const PREM_PRICE = { perpetual: "$54.99", sub: "$4.99/mes", boost: "+$2.99", white: "$199–$999/mes", donate: "$3.99+" };
const PREM_ICON = { perpetual: "🎟️", sub: "♻️", boost: "⚡", white: "👑", donate: "💛" };
async function renderPremium() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>💎 ${t("prem_t")}</h2><p class="desc">${t("staff_loading")}</p></div>`;
  try { premData = await fetch(`/api/guild/${guildId}/premium`).then(r => r.json()); } catch { premData = { features: [] }; }
  premPaint();
}
function premPaint() {
  const main = document.getElementById("main");
  const d = premData || {};
  const feats = d.features || [];
  const isOwner = !!(ME && ME.isOwner);
  const featRow = (f) => `<div class="premrow">
      <div class="pmi ${f.unlocked ? "on" : "off"}">${f.unlocked ? "🔓" : "🔒"}</div>
      <div class="pmt"><b>${escHtml(f.name)}</b><small>${f.plans.length ? t("prem_in") + " " + f.plans.map(p => PREM_LABEL[p] || p).join(" · ") : t("prem_in_all")}</small></div>
      ${isOwner ? `<label class="pmsw" title="${f.enabled ? t("prem_sw_on") : t("prem_sw_off")}"><input type="checkbox" ${f.enabled ? "checked" : ""} onchange="premFeature('${f.id}',this.checked)"><span></span></label>` : ""}
      <span class="pmstate ${f.unlocked ? "ok" : "no"}">${f.unlocked ? "✅ " + t("prem_unlocked") : "🔒 " + t("prem_locked")}</span>
    </div>`;
  const plansCard = (id) => {
    const list = feats.filter(f => (f.plans || []).includes(id));
    return `<div class="gcard plan">
      <div class="ghead" style="cursor:default">
        <span class="gic">${PREM_ICON[id] || "•"}</span>
        <span class="gtx">${PREM_LABEL[id] || id}<small>${PREM_PRICE[id] || ""}</small></span>
        <span class="gcount">${(d.plans || []).includes(id) ? "✅" : ""}</span>
      </div>
      <div class="gbody"><ul class="planfeats">${list.map(f => `<li>✓ ${escHtml(f.name)}</li>`).join("") || `<li>✓ ${t("prem_in_all")}</li>`}</ul></div>
    </div>`;
  };
  main.innerHTML = `
    <div class="modbar"><div class="mb-l"><span class="mb-ic">💎</span>
      <div><div class="mb-title">${t("prem_t")}</div><div class="mb-sub">${t("prem_sub_t")}</div></div></div>
      <div class="mb-r"><a class="btn ghost small" href="${t("prem_link")}" target="_blank" rel="noopener">${t("prem_buy")}</a></div></div>
    <div class="panel"><h2>${t("prem_status_t")}</h2><p class="desc">${t("prem_status_d")}</p>
      <div class="statgrid">
        <div class="statcard"><div class="sk">${t("prem_state")}</div><div class="sv" style="font-size:20px;color:${d.active ? "var(--ok)" : "var(--muted)"}">${d.active ? (d.ownerAll ? "👑 " + t("prem_owner_short") : "🟢 Activa") : "⚪ Inactiva"}</div></div>
        <div class="statcard"><div class="sk">${t("prem_plans")}</div><div class="sv" style="font-size:18px">${d.ownerAll ? t("prem_owner_short") : (d.plans && d.plans.length ? d.plans.map(p => PREM_LABEL[p] || p).join(" · ") : "—")}</div></div>
        <div class="statcard"><div class="sk">${t("prem_keys")}</div><div class="sv">${(d.keys || []).length}</div></div>
        <div class="statcard"><div class="sk">${t("prem_feats_unlocked")}</div><div class="sv">${feats.filter(f => f.unlocked).length}/${feats.length}</div></div>
      </div>
      ${d.ownerAll ? `<div class="subpanel" style="margin-top:12px;border-left:3px solid var(--ok)"><b>👑 ${t("prem_owner_all_t")}</b>
        <p class="desc">${t("prem_owner_all_d")}</p>
        ${isOwner ? `<label style="display:inline-flex;gap:8px;align-items:center;cursor:pointer"><span class="pmsw"><input type="checkbox" checked onchange="premAct({action:'ownerAll',on:this.checked})"><span></span></span> <small>${t("prem_owner_sw")}</small></label>` : ""}</div>` : ""}
      ${(d.keys || []).length ? `<div class="subpanel" style="margin-top:12px"><b>${t("prem_active_keys")}</b>
        ${(d.keys || []).map(k => `<div class="rowline"><code>${escHtml(k.key)}</code><span>${PREM_LABEL[k.plan] || k.plan}</span><span>${k.expiresAt ? `<t:${Math.floor(k.expiresAt / 1000)}:R>` : t("prem_forever")}</span>${isOwner ? `<button class="btn danger small" onclick="premAct({action:'revoke',key:'${k.key}'})">${t("prem_revoke")}</button>` : ""}</div>`).join("")}</div>` : ""}
    </div>
    ${isOwner ? `<details class="drop" open><summary>🔑 ${t("prem_issue_t")}</summary><div class="dbody">
      <p class="desc">${t("prem_issue_d")}</p>
      <div class="fields">
        <div class="field"><label>${t("prem_plan")}</label>
          <select id="pm_plan">${Object.keys(d.plansInfo || {}).map(p => `<option value="${p}">${PREM_LABEL[p] || p} · ${PREM_PRICE[p] || ""}</option>`).join("")}</select></div>
        <div class="field"><label>${t("prem_days")}</label><input type="number" id="pm_days" min="0" max="3650" value="0"><div class="help">0 = perpetua</div></div>
        <div class="field"><label>${t("prem_key")}</label><input type="text" id="pm_key" placeholder="HYDRA-XXXX-XXXX-XXXX-XXXX" maxlength="40"><div class="help">${t("prem_key_d")}</div></div>
      </div>
      <button class="btn" onclick="premAct({action:'grant',plan:document.getElementById('pm_plan').value,dias:Number(document.getElementById('pm_days').value)||0,key:document.getElementById('pm_key').value})">✅ ${t("prem_issue")}</button>
      <span class="status" id="pmstatus"></span></div></details>` : ""}
    <details class="drop" ${d.whiteLabel ? "open" : ""}>
      <summary>👑 ${t("prem_brand_t")} ${d.whiteLabel ? `<span class="pmstate ok">✅</span>` : `<span class="pmstate no">🔒</span>`}</summary>
      <div class="dbody">
        <p class="desc">${t("prem_brand_d")}</p>
        <div class="fields">
          <div class="field"><label>${t("prem_brand_name")}</label><input type="text" id="pb_name" maxlength="40" value="${escHtml((d.brand || {}).name || "")}" placeholder="Nombre de tu marca"></div>
          <div class="field"><label>${t("prem_brand_color")}</label><input type="text" id="pb_color" value="${escHtml((d.brand || {}).color || "")}" placeholder="#5865F2"></div>
          <div class="field"><label>${t("prem_brand_icon")}</label><input type="text" id="pb_icon" value="${escHtml((d.brand || {}).icon || "")}" placeholder="https://…/icono.png"></div>
          <div class="field"><label>${t("prem_brand_footer")}</label><input type="text" id="pb_footer" maxlength="200" value="${escHtml((d.brand || {}).footer || "")}" placeholder="Pie de los embeds"></div>
        </div>
        ${isOwner ? `<button class="btn" onclick="premAct({action:'brand',name:document.getElementById('pb_name').value,color:document.getElementById('pb_color').value,icon:document.getElementById('pb_icon').value,footer:document.getElementById('pb_footer').value})">💾 ${t("save")}</button><span class="status" id="pmstatus2"></span>` : `<p class="desc">${t("prem_brand_owner")}</p>`}
      </div>
    </details>
    <details class="drop">
      <summary>⚙️ ${t("prem_manage_t")}</summary>
      <div class="dbody"><p class="desc">${t("prem_manage_d")}</p><div id="premlists">${t("staff_loading")}</div></div>
    </details>
    <details class="drop" open>
      <summary>🎛️ ${t("prem_opts_t")}</summary>
      <div class="dbody">
        <p class="desc">${t("prem_opts_d")}</p>
        <div class="fields">${premExtraFields()}</div>
        <button class="btn" onclick="saveModule('premiumextras')">💾 ${t("save")}</button><span class="status" id="pmstatus3"></span>
      </div>
    </details>
    <div class="panel"><h2>📦 ${t("prem_plans_t")}</h2><p class="desc">${t("prem_plans_d")}</p>
      <div class="fields" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${Object.keys(d.plansInfo || {}).map(plansCard).join("")}</div></div>
    <div class="panel"><h2>🔓 ${t("prem_features_t")}</h2><p class="desc">${t("prem_features_d")}</p>
      <div class="premlist">${(() => {
        const G = { comunidad: "👥 Comunidad", moderacion: "🛡️ Moderación y datos", servicios: "💼 Servicios", marca: "👑 Marca" };
        const porGrupo = {};
        for (const f of feats) { const g = f.grupo || "comunidad"; if (!porGrupo[g]) porGrupo[g] = []; porGrupo[g].push(f); }
        return Object.keys(G).filter(g => porGrupo[g]).map(g =>
          `<details class="drop" open><summary>${G[g]} <span class="pmstate">${porGrupo[g].filter(x => x.unlocked).length}/${porGrupo[g].length}</span></summary><div class="dbody">${porGrupo[g].map(featRow).join("")}</div></details>`
        ).join("");
      })()}</div>
      <div class="dbody" style="margin-top:16px"><b>🔥 ${t("heat_t")}</b>
        <p class="desc">${t("heat_d")}</p>
        <div id="heatbox">${t("staff_loading")}</div>
      </div></div>`;
  premLoadLists();
  loadHeat();
}
async function premLoadLists() {
  const box = document.getElementById("premlists");
  if (!box) return;
  try {
    const [tm, em, co] = await Promise.all([
      fetch(`/api/guild/${guildId}/timers`).then(r => r.json()).catch(() => ({ list: [] })),
      fetch(`/api/guild/${guildId}/entrymsgs`).then(r => r.json()).catch(() => ({ list: [] })),
      fetch(`/api/guild/${guildId}/counters`).then(r => r.json()).catch(() => ({ list: [] })),
    ]);
    const ts = (tm.list || []).map(x => `<div class="rowline"><code>${escHtml(x.id)}</code><span>${escHtml(String(x.text || "").slice(0, 40))}</span><span><t:${Math.floor((x.at || 0) / 1000)}:R></span><button class="btn danger small" onclick="premTimerDel('${x.id}')">🗑️</button></div>`).join("") || `<p class="desc">${t("prem_no_timers")}</p>`;
    const es = (em.list || []).map(x => `<div class="rowline"><b>${x.kind === "join" ? "🟢 Entrada" : "🔴 Salida"}</b><span>#${escHtml(((meta.channels || []).find(c => c.id === x.channelId) || {}).name || x.channelId)}</span><button class="btn danger small" onclick="premEntryDel('${x.kind}','${x.channelId}')">🗑️</button></div>`).join("") || `<p class="desc">${t("prem_no_entry")}</p>`;
    const cs = (co.list || []).map(x => `<div class="rowline"><b>${({ members: "👥 Miembros", online: "🟢 En línea", voice: "🔊 En voz", bots: "🤖 Bots" })[x.kind] || x.kind}</b><span>#${escHtml(((meta.channels || []).find(c => c.id === x.channelId) || {}).name || x.channelId)}</span><button class="btn danger small" onclick="premCounterDel('${x.id}')">🗑️</button></div>`).join("") || `<p class="desc">${t("prem_no_counters")}</p>`;
    box.innerHTML = `<div class="subpanel"><b>⏰ ${t("prem_timers_t")}</b>${ts}</div>
      <div class="subpanel"><b>📝 ${t("prem_entry_t")}</b>${es}</div>
      <div class="subpanel"><b>📊 ${t("prem_counters_t")}</b>${cs}</div>`;
  } catch { box.innerHTML = `<p class="desc">—</p>`; }
}
async function premTimerDel(id) {
  await fetch(`/api/guild/${guildId}/timers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "del", id }) });
  premLoadLists(); toast(t("saved_ok"));
}
async function premEntryDel(kind, channelId) {
  const cur = await fetch(`/api/guild/${guildId}/entrymsgs`).then(r => r.json()).catch(() => ({ list: [] }));
  const list = (cur.list || []).filter(x => !(x.kind === kind && x.channelId === channelId));
  await fetch(`/api/guild/${guildId}/entrymsgs`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list }) });
  premLoadLists(); toast(t("saved_ok"));
}
async function premCounterDel(id) {
  await fetch(`/api/guild/${guildId}/counters`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "del", id }) });
  premLoadLists(); toast(t("saved_ok"));
}
function premExtraFields() {
  const sec = schema.find(s => s.module === "premiumextras");
  if (!sec) return "";
  return groupFields(sec).map(g => `<div class="gsub"><b>${g.icon} ${(HELP[g.key] && HELP[g.key].t) || t(g.key)}</b>
      <p class="desc">${(HELP[g.key] && HELP[g.key].d) || t(g.help)}</p>
      <div class="fields">${g.fields.map(f => fieldHtml(sec, f)).join("")}</div></div>`).join("");
}
async function premFeature(feature, on) {
  try {
    const r = await fetch(`/api/guild/${guildId}/premium`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "feature", feature, on }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    premData = j;
    premPaint();
    toast(t("saved_ok"));
  } catch (e) { toast(String(e.message), false); }
}
async function premAct(body) {
  const st = document.getElementById("pmstatus") || document.getElementById("pmstatus2");
  if (st) { st.textContent = t("saving"); st.className = "status"; }
  try {
    const r = await fetch(`/api/guild/${guildId}/premium`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    premData = j;
    premPaint();
    toast(t("saved_ok"));
  } catch (e) {
    if (st) { st.textContent = "❌ " + e.message; st.className = "status err"; }
    else toast(String(e.message), false);
  }
}

let permitData = { enabled: false, permits: [], modules: [] };
let permitMs = [];
async function loadPermits() {
  try { permitData = await fetch(`/api/guild/${guildId}/permits`).then(r => r.json()); } catch { permitData = { enabled: false, permits: [], modules: [] }; }
  permitMs = permitData.modules || [];
  permitPaint();
}
function permitChip(m, on) {
  const p = (permitMs || []).find(x => x.id === m) || { id: m, icon: "•", name: m, cmds: 0 };
  return `<button type="button" class="mchip ${on ? "on" : ""}" data-mod="${m}" onclick="permitChipToggle(this)">${p.icon || "•"} ${escHtml(p.name)}</button>`;
}
function permitChipToggle(btn) {
  btn.classList.toggle("on");
  const box = btn.closest(".permit");
  const n = box.querySelectorAll(".mchip.on").length;
  const lab = box.querySelector(".pmods_count");
  if (lab) lab.textContent = n;
}
async function renderPermits() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>🪪 ${t("permits_t")}</h2><p class="desc">${t("staff_loading")}</p></div>`;
  await loadPermits();
}
function permitPaint() {
  const main = document.getElementById("main");
  const list = permitData.permits || [];
  main.innerHTML = `
    <div class="modbar"><div class="mb-l"><span class="mb-ic">🪪</span>
      <div><div class="mb-title">${t("permits_t")}</div><div class="mb-sub">${t("permits_d")}</div></div></div>
      <div class="mb-r"><button class="btn" onclick="permitSave()">💾 ${t("save")}</button><span class="status" id="pstatus"></span></div></div>
    <div class="panel"><h2>${t("permits_on")}</h2><p class="desc">${t("permits_on_d")}</p>
      <div class="field bool" style="max-width:420px"><label>${t("permits_enabled")}</label>
        <label class="switch"><input type="checkbox" id="perm_en" ${permitData.enabled ? "checked" : ""}><span class="slider"></span></label></div>
      <p class="desc" style="margin-top:10px">${t("permits_prio")}</p>
      <button class="btn small ghost" onclick="permitAdd()">➕ ${t("permits_add")}</button>
      <span class="status" id="pstatus2"></span></div>
    <div id="permits">${list.length ? list.map((p, i) => permitCard(p, i, list.length)).join("") : `<div class="panel"><p class="desc">${t("permits_empty")}</p></div>`}</div>`;
  applyI18n();
}
function permitCard(p, i, total) {
  const mods = p.modules || [];
  return `<div class="panel permit" data-id="${escHtml(p.id || "")}">
    <div class="ghead" style="padding:0 0 12px;cursor:default">
      <span class="gic" style="background:${escHtml(p.color || "#5865F2")}33;border-color:${escHtml(p.color || "#5865F2")}66">${i + 1}</span>
      <span class="gtx"><input type="text" class="pname" maxlength="40" value="${escHtml(p.name || t("permits_default_name") + " " + (i + 1))}" style="font-family:var(--font-head);font-size:17px;font-weight:700;text-transform:uppercase;letter-spacing:1px;background:transparent;border:none;border-bottom:1px dashed var(--card-border);color:var(--text);padding:4px 2px;width:min(320px,100%)">
        <small>${t("permits_rank")} #${i + 1} · <span class="pmods_count">${mods.length}</span> ${t("permits_mods")}</small></span>
      <span class="cf-row">
        <input type="color" class="pcolor" value="${escHtml(p.color || "#5865F2")}" title="${t("permits_color")}">
        <button class="btn ghost small" onclick="permitMove(${i},-1)" ${i === 0 ? "disabled" : ""}>⬆</button>
        <button class="btn ghost small" onclick="permitMove(${i},1)" ${i === total - 1 ? "disabled" : ""}>⬇</button>
        <button class="btn danger small" onclick="permitDel(${i})">🗑️</button>
      </span>
    </div>
    <div class="fields">
      <div class="field wide"><label>${t("permits_roles")}</label>
        <select class="proles" multiple size="6">${(meta.roles || []).map(r => `<option value="${r.id}" ${(p.roles || []).includes(r.id) ? "selected" : ""}>${escHtml(r.name)}</option>`).join("")}</select>
        <div class="help">${t("permits_roles_d")}</div></div>
    </div>
    <div class="cp-adv-h" style="margin:4px 0 8px">🎖️ ${t("permits_mods")}</div>
    <div class="chipbox">${(permitMs || []).map(m => permitChip(m.id, mods.includes(m.id))).join("")}</div>
  </div>`;
}
function permitAdd() {
  permitData.permits = permitData.permits || [];
  permitData.permits.push({ id: "p" + Date.now(), name: t("permits_default_name") + " " + (permitData.permits.length + 1), color: "#5865F2", roles: [], modules: [] });
  permitPaint();
  const st = document.getElementById("pstatus2");
  if (st) { st.textContent = t("permits_unsaved"); st.className = "status err"; }
}
function permitDel(i) {
  permitData.permits.splice(i, 1);
  permitPaint();
}
function permitMove(i, dir) {
  const j = i + dir;
  const list = permitData.permits;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  permitPaint();
}
function permitRead() {
  const cards = [...document.querySelectorAll("#permits .permit")];
  return cards.map(c => ({
    id: c.dataset.id || "p" + Math.random().toString(36).slice(2, 8),
    name: c.querySelector(".pname").value.trim(),
    color: c.querySelector(".pcolor").value,
    roles: Array.from(c.querySelector(".proles").selectedOptions).map(o => o.value),
    modules: [...c.querySelectorAll(".mchip.on")].map(b => b.dataset.mod),
  }));
}
async function permitSave() {
  const st = document.getElementById("pstatus");
  st.className = "status";
  st.textContent = t("saving");
  const body = { enabled: document.getElementById("perm_en").checked, permits: permitRead() };
  try {
    const r = await fetch(`/api/guild/${guildId}/permits`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    permitData.enabled = j.enabled; permitData.permits = j.permits || [];
    permitPaint();
    const s2 = document.getElementById("pstatus");
    if (s2) { s2.textContent = "✅ " + t("saved_ok"); s2.className = "status ok"; }
    toast(t("saved_ok"));
  } catch (e) {
    const s2 = document.getElementById("pstatus");
    if (s2) { s2.textContent = "❌ " + e.message; s2.className = "status err"; }
  }
}

// ===== Modal de información (explica qué hace un bloque, sección o comando) =====
function infoModal(title, html) {
  const old = document.getElementById("info_modal");
  if (old) old.remove();
  const el = document.createElement("div");
  el.id = "info_modal";
  el.className = "info-modal";
  el.innerHTML = `<div class="info-box" onclick="event.stopPropagation()">
    <button class="info-close" onclick="closeInfo()">✕</button>
    <h3>${title}</h3>
    <div class="info-body">${html}</div>
  </div>`;
  el.addEventListener("click", closeInfo);
  document.body.appendChild(el);
}
function closeInfo() { const el = document.getElementById("info_modal"); if (el) el.remove(); }
// Botón ⓘ compacto, con el mismo aspecto que el botón de variables
function infoBtn(kind, id, label) {
  return `<button type="button" class="btn small ghost info-btn" title="${t("info_t")}" onclick="event.stopPropagation();infoOpen('${kind}','${id}')">ⓘ ${label || t("info_btn")}</button>`;
}
function infoOpen(kind, id) {
  if (kind === "cmd") return infoCommand(id);
  if (kind === "field") return infoField(id);
  if (kind === "group") {
    const sec = schema.find(s => s.module === activeModule);
    if (!sec) return;
    const g = groupFields(sec).find(x => x.id === id);
    if (!g) return;
    const h = HELP[g.key] || null;
    const dMod = MOD_HELP[activeModule] || "";
    return infoModal(`${g.icon} ${(h && h.t) || t(g.key)}`, `
      ${dMod ? `<p class="lead">${dMod}</p>` : ""}
      ${h ? `<p>${h.d}</p>` : `<p>${t(g.help)}</p>`}
      ${h && h.e ? `<p class="example"><b>Ejemplo</b><br>${h.e}</p>` : ""}`);
  }
  if (kind === "mod") {
    const s = schema.find(x => x.module === id);
    const title = s ? `${s.icon} ${L(s, "title")}` : (customPage(id) ? t(customPage(id).key) : id);
    const dk = id + "_d";
    const ext = MOD_HELP[id] || "";
    const sec2 = schema.find(x => x.module === id);
    const gs = sec2 ? groupFields(sec2) : [];
    return infoModal(title, `
      <p class="lead">${ext || (t(dk) !== dk ? t(dk) : t("info_mod_nod"))}</p>
      ${gs.length ? `<p><b>${t("info_blocks")}</b></p><ul>${gs.map(g => {
        const h = HELP[g.key];
        return `<li>${g.icon} <b>${(h && h.t) || t(g.key)}</b> — ${h ? h.d : t(g.help)}</li>`;
      }).join("")}</ul>` : ""}`);
  }
}
const FIELD_HELP = {
  welcomeChannelId: "Canal donde el bot saluda a los miembros nuevos. Sin canal, la bienvenida no se envía.",
  goodbyeChannelId: "Canal donde el bot despede a quien sale del servidor.",
  rulesChannelId: "Canal de reglas: el bot puede publicarlas y enlazarlas en la bienvenida.",
  verificationChannelId: "Canal donde está el panel de verificación. Al enviarlo, el bot reacciona con ✅ a quien ya esté verificado.",
  verifiedRoleId: "Rol que se entrega al pasar la verificación. Si no se entrega, el usuario sigue sin acceso.",
  unverifiedRoleId: "Rol que se retira al verificarse. Útil para quitar el acceso hasta superar la verificación.",
  ticketCategoryId: "Categoría donde se crean los canales de ticket. Elige una categoría vacía yexclusive para este bot.",
  ticketClosedCategoryId: "Categoría donde se mueven los tickets cerrados. Si no la configuras, el ticket se queda donde estaba.",
  ticketTranscriptChannelId: "Canal donde se guarda la transcripción .txt de cada ticket cerrado.",
  ticketRoleId: "Rol que recibe el usuario al abrir un ticket y que se quita al cerrarlo (si no tiene más tickets).",
  staffRoleId: "Rol de staff: se respeta en el logger, los tickets, el panel y varios comandos.",
  anticord: "x",
  confChannelId: "Canal donde se publica cada confesión anónima.",
  confReviewChannelId: "Canal privado de staff donde llegan las confesiones pendientes de aprobar o rechazar.",
  logChannelId: "Canal general de registro (respaldo si no hay canales por tipo de sanción).",
  auditChannelId: "Canal donde se guardan los eventos del registro de acciones: entradas, roles, canales, mensajes editados.",
  sugChannelId: "Canal de sugerencias: es donde se publican las sugerencias aprobadas por el staff.",
  sugIntakeChannelId: "Canal de entrada: todo lo que se escriba ahí se convierte en una sugerencia automáticamente.",
  sugReviewChannelId: "Canal donde el staff revisa y acepta o rechaza las sugerencias.",
  gwDefaultChannelId: "Canal por defecto de los sorteos cuando el moderador no indica otro.",
  giveawayChannelId: "Canal de sorteos.",
  pollChannelId: "Canal por defecto de las encuestas.",
  eventsCategoryId: "Categoría donde se crean los canales de los eventos de Minecraft.",
  mentionRoleId: "Rol que se menciona al empezar un evento.",
  musicDJRole: "Rol que puede saltar canciones, cambiar el volumen o usar el modo DJ.",
  sponsorshipRoleId: "Rol de_PATROCINADOR",
  mcServer: "Host y puerto del servidor de Minecraft que se consulta en /server y en los comandos de la guild.",
  verificationTimeoutSec: "Segundos que dura el código del captcha antes de expirar. Por defecto 120.",
  verifyTimeoutSec: "Segundos que dura el código del captcha antes de expirar. Por defecto 120.",
  antiLinkAllowImages: "Si está activo, el AutoMod no borra mensajes que solo contienen imágenes.",
  antiLinkAllowVideos: "Si está activo, el AutoMod no borra mensajes que solo contienen vídeos.",
  antiLinkAllowChannels: "Canales exentos del filtro de enlaces (IDs separados por comas).",
  antiLinkAllowCategories: "Categorías exentas del filtro de enlaces (IDs separados por comas).",
  bypassLinksRoles: "Roles cuyo enlazado no se filtra.",
  bypassImagesRoles: "Roles cuyas imágenes no se filtran.",
  bypassVideosRoles: "Roles cuyos vídeos no se filtran.",
  whitelistRoles: "Roles exentos de todos los filtros (IDs separados por comas).",
  whitelistUsers: "Usuarios exentos de todos los filtros (IDs separados por comas).",
  whitelistChannels: "Canales exentos de todos los filtros (IDs separados por comas).",
  badwords: "Lista de palabras bloqueadas, separadas por comas.",
  linkWhitelistDomains: "Dominios permitidos aunque contengan enlaces.",
  joinGateMinAge: "Días de antigüedad mínima de la cuenta para poder entrar. 0 desactiva el filtro.",
  antiRaidCount: "Número de entradas o acciones sospechosas que activan el bloqueo.",
  antiRaidSeconds: "Ventana de tiempo (segundos) en la que se cuentan esas acciones.",
  automodTimeoutMin: "Minutos de aislamiento cuando el castigo global es timeout.",
  automodAction: "Castigo global cuando un filtro se activa sin castigo propio: borrar, aislar, expulsar o banear.",
  capsMinLen: "Longitud mínima del mensaje para que se comprueben las mayúsculas.",
  capsPercent: "Porcentaje de mayúsculas que dispara el filtro.",
  spamCount: "Mensajes en la ventana de tiempo que cuentan como flood.",
  spamSeconds: "Ventana de segundos para detectar flood.",
  mentionSpamMax: "Máximo de menciones por mensaje antes de considerarlo spam.",
  emojiMax: "Máximo de emojis personalizados por mensaje.",
  staffRoleId2: "x",
  eventCategoryId: "Categoría de los canales de evento.",
  inscripcionChannelId: "Canal de inscripciones: se crea un rol temporal a quien se inscribe.",
  socialLiveRole: "Rol que se entrega mientras el canal está en directo (gestión automática del vigilador).",
  changelogWebhook: "URL completa del webhook de Discord donde el bot publica los avisos de actualización (changelogs). Crea el webhook en Ajustes del servidor → Integraciones → Webhooks y pega aquí la URL que empieza por https://discord.com/api/webhooks/...",
  musicProxy: "Proxy HTTP(S) que usa yt-dlp para descargar audio. Déjalo vacío para conectar directo. Útil si YouTube bloquea la IP del host. Ejemplo: http://user:pass@host:8080",
  musicSoundcloudFallback: "Si está activo, cuando YouTube no deja traer audio se busca la misma canción en SoundCloud (respaldo automático).",
  musicVolume: "Volumen de reproducción (1-150). 100 es el volumen normal de Discord.",
  streamingUrl: "URL del canal de directo (Twitch o YouTube). El bot comprueba periódicamente si estás en directo.",
  spotifyUserId: "ID de usuario de Spotify (no el nombre): aparece en tu perfil de Spotify o en la URL spotify.com/user/TU_ID.",
  stripeKey: "Clave secreta de Stripe (empieza por sk_live_...). Se usa para cobros Premium. Nunca la compartas.",
  paypalEmail: "Correo de PayPal donde se envían los pagos de servicios y comisiones.",
  cryptoAddress: "Dirección de cripto para recibir pagos (BTC, ETH, USDT...). Copia la dirección completa de tu wallet.",
  sugUpvoteEmoji: "Emoji que los miembros ponen para votar a favor una sugerencia. Por defecto 👍.",
  sugDownvoteEmoji: "Emoji que los miembros ponen para votar en contra una sugerencia. Por defecto 👎.",
  gwJoinEmoji: "Emoji que se reacciona para participar en el sorteo. Por defecto 🎉.",
  starboardEmoji: "Emoji que destaca un mensaje en el canal de starboard. Por defecto ⭐.",
  activityText: "Texto de la presencia del bot (lo que aparece junto a «Escuchando/Playing»).",
  invoicePrefix: "Prefijo de los números de factura (por defecto INV). Los invoices salen como INV-0001, INV-0002...",
  promoCode: "Código que los usuarios escriben para aplicar el descuento. Déjalo vacío si no quieres código.",
  promoStart: "Fecha y hora de inicio de la promoción en formato ISO. Ejemplo: 2026-12-20T00:00:00Z",
  promoEnd: "Fecha y hora de fin de la promoción en formato ISO. Ejemplo: 2027-01-10T23:59:59Z",
};
function infoField(key) {
  // se busca en el modulo activo y, si no esta, en todos los demas
  // (los campos Premium viven en "premiumextras" pero se pintan en la pagina Premium)
  let sec = schema.find(s => s.module === activeModule);
  let f = sec ? (sec.fields || []).find(x => x.key === key) : null;
  if (!f) for (const s2 of schema) { const hit = (s2.fields || []).find(x => x.key === key); if (hit) { f = hit; sec = s2; break; } }
  const title = f ? L(f, "label") : key;
  const specific = FIELD_HELP[key] || "";
  const gh = f ? HELP[TYPE_HELP[f.type] || ""] || null : null;
  let help = specific;
  if (!help && gh) help = gh.d;
  if (!help && f) {
    const k = typeGroup(f.type);
    const txt = t(k);
    help = txt && txt !== k ? txt : "";
  }
  if (!help) help = t("info_field_generic");
  // El ejemplo del bloque genérico (p. ej. el de bienvenida) solo se muestra si
  // el campo no tiene ayuda propia: si no, confunde (un webhook no es un título).
  const ejemplo = specific ? "" : (gh && gh.e ? gh.e : "");
  const dMod = MOD_HELP[(sec && sec.module) || activeModule] || "";
  return infoModal(title, `
    ${dMod ? `<p class="lead">${dMod}</p>` : ""}
    <p>${help}</p>
    ${ejemplo ? `<p class="example"><b>Ejemplo</b><br>${ejemplo}</p>` : ""}`);
}
function typeGroup(type) {
  return type === "channel" ? "g_ch_d" : type === "role" ? "g_roles_d" : type === "color" ? "g_design_d" : type === "bool" ? "g_state_d" : "g_extra_d";
}
function infoCommand(cmd) {
  const c = (cmdpermData.commands || []).find(x => x.cmd === cmd);
  if (!c) return;
  const desc = (LANG === "en" && c.desc_en) || c.desc || "";
  let html = `<p>${escHtml(desc)}</p>`;
  html += `<p><b>${t("info_usage")}</b> <code>/${escHtml(c.cmd)}${c.subs && c.subs.length ? " <sub>subcomando</sub>" : ""}</code></p>`;
  if (c.ctx) html += `<p>${t("info_ctx")}</p>`;
  if (c.subs && c.subs.length) {
    html += `<p><b>${t("info_subs")}</b></p><ul>` +
      c.subs.map(s => `<li><code>${escHtml(s.name)}</code> — ${escHtml(s.desc || "")}</li>`).join("") + "</ul>";
  }
  if (c.args && c.args.length) {
    html += `<p><b>${t("info_args")}</b></p><ul>` +
      c.args.map(a => `<li><code>${escHtml(a.name)}</code>${a.req ? ` <b>(${t("info_required")})</b>` : ""} — ${escHtml(a.desc || "")}</li>`).join("") + "</ul>";
  }
  html += `<p class="muted">${t("info_perms")}</p>`;
  infoModal(`/${escHtml(c.cmd)}`, html);
}

let modswData = { modules: [], states: [] };
const MSW_TITLES = { confesar: "msw_conf", music: "msw_music", fun: "msw_fun", utility: "msw_util", staff: "staff" };
function mswTitle(id) {
  const s = schema.find(x => x.module === id);
  if (s) return L(s, "title");
  const k = MSW_TITLES[id];
  return k ? t(k) : id;
}
async function renderModuleSw() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>🔘 ${t("msw_t")}</h2>
    <p class="desc">${t("msw_d")}</p>
    <div class="sf-row" style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn small ghost" onclick="mswAll(true)">${t("msw_all_on")}</button>
      <button class="btn small ghost" onclick="mswAll(false)">${t("msw_all_off")}</button>
      <button class="btn" onclick="mswSave()">💾 ${t("save")}</button>
      <span class="status" id="mswstatus"></span>
    </div>
    <div id="mswlist">${t("staff_loading")}</div></div>`;
  try { modswData = await fetch(`/api/guild/${guildId}/modulesw`).then(r => r.json()); } catch { modswData = { modules: [], states: [] }; }
  mswPaint();
}
function mswState(id) {
  const s = (modswData.states || []).find(x => x.id === id);
  return s ? s.on !== false : true;
}
function mswPaint() {
  const box = document.getElementById("mswlist");
  if (!box) return;
  const mods = modswData.modules || [];
  if (!mods.length) { box.innerHTML = `<p class="desc">${t("cp_empty")}</p>`; return; }
  box.innerHTML = `<div class="fields" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${mods.map(m => {
    const on = mswState(m.id);
    const cmds = (m.commands || []).map(c => `<span class="cp-tag alt">/${c}</span>`).join(" ");
    return `<div class="subpanel" style="margin:0">
      <div class="cp-head" style="padding:0 0 8px">
        <div class="cp-name"><b>${m.icon || "•"} ${escHtml(mswTitle(m.id))}</b>
          <small>${(m.commands || []).length} ${t("msw_cmds")}</small></div>
        <label class="switch"><input type="checkbox" id="msw_${m.id}" ${on ? "checked" : ""}><span class="slider"></span></label>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${cmds || `<span class="cp-tag">—</span>`}</div>
    </div>`;
  }).join("")}</div>`;
}
function mswAll(v) {
  for (const m of (modswData.modules || [])) {
    const el = document.getElementById("msw_" + m.id);
    if (el) el.checked = v;
  }
}
async function mswSave() {
  const st = document.getElementById("mswstatus");
  st.className = "status";
  st.textContent = t("saving");
  const data = {};
  for (const m of (modswData.modules || [])) {
    const el = document.getElementById("msw_" + m.id);
    data[m.id] = el ? el.checked : true;
  }
  try {
    const r = await fetch(`/api/guild/${guildId}/modulesw`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "error");
    modswData.states = j.states || modswData.states;
    st.textContent = "✅ " + t("saved_ok");
    st.className = "status ok";
    toast(t("saved_ok"));
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}

let cmdpermData = { commands: [], perms: {} };
let cpAliasMax = 5;
function cpDesc(c) {
  try { if (typeof LANG !== "undefined" && LANG === "en" && c.desc_en) return c.desc_en; } catch {}
  return c.desc || c.cmd;
}
function cpEntry(cmd) { return (cmdpermData.perms || {})[cmd] || {}; }
function cpRoleOpts(sel) {
  return (meta.roles || []).map(r => `<option value="${r.id}" ${(sel || []).includes(r.id) ? "selected" : ""}>${escHtml(r.name)}</option>`).join("");
}
function cpChOpts(sel) {
  return (meta.channels || []).map(c => `<option value="${c.id}" ${(sel || []).includes(c.id) ? "selected" : ""}>${c.type === 4 ? "📁 " : "# "}${escHtml(c.name)}</option>`).join("");
}
function cpSel(id) { const el = document.getElementById(id); return el ? Array.from(el.selectedOptions).map(o => o.value) : []; }
function cpIds(id) { const el = document.getElementById(id); return el ? el.value.split(/[,\s]+/).map(s => s.trim()).filter(s => /^\d{17,20}$/.test(s)) : []; }
function cpAdvHtml(c) {
  const p = cpEntry(c.cmd);
  const usersVal = (arr) => escHtml((arr || []).join(", "));
  const permBlock = c.mod ? `
    <div class="subpanel"><div class="cp-adv-h">🔐 ${t("cp_adv_perm")}</div>
      <div class="fields">
        <div class="field"><label>✅ ${t("cp_allow_roles")}</label><select id="cp_ar_${c.cmd}" multiple size="6">${cpRoleOpts(p.allowRoles)}</select></div>
        <div class="field"><label>✅ ${t("cp_allow_users")}</label><input type="text" id="cp_au_${c.cmd}" value="${usersVal(p.allowUsers)}" placeholder="123..., 456..."></div>
        <div class="field"><label>🚫 ${t("cp_deny_roles")}</label><select id="cp_dr_${c.cmd}" multiple size="6">${cpRoleOpts(p.denyRoles)}</select></div>
        <div class="field"><label>🚫 ${t("cp_deny_users")}</label><input type="text" id="cp_du_${c.cmd}" value="${usersVal(p.denyUsers)}" placeholder="123..., 456..."></div>
      </div></div>` : "";
  return `${permBlock}
    <div class="subpanel"><div class="cp-adv-h">#️⃣ ${t("cp_adv_ch")}</div>
      <div class="fields">
        <div class="field"><label>✅ ${t("cp_allow_channels")}</label><select id="cp_ac_${c.cmd}" multiple size="6">${cpChOpts(p.allowChannels)}</select></div>
        <div class="field"><label>🚫 ${t("cp_deny_channels")}</label><select id="cp_dc_${c.cmd}" multiple size="6">${cpChOpts(p.denyChannels)}</select></div>
      </div></div>
    <div class="subpanel"><div class="cp-adv-h">🧹 ${t("cp_adv_del")}</div>
      <div class="fields">
        <div class="field bool"><label>${t("cp_del_invoke")}</label>
          <label class="switch"><input type="checkbox" id="cp_di_${c.cmd}" ${p.deleteInvoke ? "checked" : ""}><span class="slider"></span></label></div>
        <div class="field"><label>${t("cp_del_reply")}</label>
          <input type="number" id="cp_dr2_${c.cmd}" min="0" max="3600" value="${Number(p.deleteReplySec) || 0}"></div>
        <div class="field bool wide"><label>${t("cp_del_on_del")}</label>
          <label class="switch"><input type="checkbox" id="cp_dod_${c.cmd}" ${p.deleteOnSourceDelete ? "checked" : ""}><span class="slider"></span></label></div>
      </div></div>`;
}
function cpToggleAdv(cmd) {
  const box = document.getElementById("cp_adv_" + cmd);
  if (!box) return;
  if (box.dataset.loaded) { box.style.display = box.style.display === "none" ? "grid" : "none"; return; }
  const c = (cmdpermData.commands || []).find(x => x.cmd === cmd);
  if (!c) return;
  box.innerHTML = cpAdvHtml(c);
  box.dataset.loaded = "1";
  box.style.display = "grid";
}
function cpFilter(v) {
  const q = normTxt(v);
  for (const card of document.querySelectorAll("#cplist .cp-card")) {
    card.style.display = !q || normTxt(card.dataset.name).includes(q) ? "" : "none";
  }
}
function cpCard(c) {
  const p = cpEntry(c.cmd);
  const off = p.enabled === false;
  return `<div class="cp-card ${off ? "is-off" : ""}" id="cp_card_${c.cmd}" data-name="${escHtml(cpDesc(c) + " " + c.cmd)}">
    <div class="cp-head">
      <div class="cp-name"><b>/${escHtml(c.cmd)}</b>
        ${c.mod ? `<span class="cp-tag">${t("cp_mod")}</span>` : ""}
        ${c.ctx ? `<span class="cp-tag alt">${t("info_ctx_short")}</span>` : ""}
        ${c.sub ? `<span class="cp-tag alt">${t("cp_group")}</span>` : ""}
        <small>${escHtml(cpDesc(c))}</small></div>
      <div class="cp-quick">
        <span class="cp-al">${t("cp_alias")}</span>
        <input type="text" id="cp_al_${c.cmd}" class="cp-alias" maxlength="32" value="${escHtml(p.alias || "")}" placeholder="${t("cp_alias_ph")}">
        <label class="switch"><input type="checkbox" id="cp_en_${c.cmd}" ${off ? "" : "checked"}><span class="slider"></span></label>
        <button class="btn ghost small" onclick="cpToggleAdv('${c.cmd}')">⚙️ ${t("cp_adv")}</button>
        ${infoBtn("cmd", c.cmd)}
      </div></div>
    <div class="cp-adv" id="cp_adv_${c.cmd}" style="display:none"></div></div>`;
}
async function renderCmdPerms() {
  const main = document.getElementById("main");
  main.innerHTML = `<div class="panel"><h2>🔑 ${t("cp_t")}</h2>
    <p class="desc">${t("cp_d")}</p>
    <div class="filter" style="margin:0 0 12px"><input id="cpsearch" type="text" placeholder="${t("cp_search_ph")}" oninput="cpFilter(this.value)"></div>
    <div id="cpinfo" class="cp-info"></div>
    <div id="cplist">${t("staff_loading")}</div>
    <button class="btn" onclick="cpSave()">💾 ${t("save")}</button>
    <span class="status" id="cpstatus"></span></div>`;
  try {
    cmdpermData = await fetch(`/api/guild/${guildId}/cmdperms`).then(r => r.json());
  } catch { cmdpermData = { commands: [], perms: {} }; }
  const box = document.getElementById("cplist");
  if (!box) return;
  const cmds = cmdpermData.commands || [];
  if (!cmds.length) { box.innerHTML = `<p class="desc">${t("cp_empty")}</p>`; return; }
  box.innerHTML = cmds.map(c => cpCard(c)).join("");
  cpInfo();
}
function cpInfo() {
  const box = document.getElementById("cpinfo");
  if (!box) return;
  const cmds = cmdpermData.commands || [];
  const off = cmds.filter(c => (cmdpermData.perms || {})[c.cmd] && cmdpermData.perms[c.cmd].enabled === false).length;
  const al = cmds.filter(c => ((cmdpermData.perms || {})[c.cmd] || {}).alias).length;
  box.innerHTML = `<span class="navcount">${cmds.length}</span> <span class="navcount">${off} ${t("cp_off_count")}</span>
    <span class="navcount">${t("cp_alias_slots")}: ${al}/${cpAliasMax}</span>`;
}
async function cpSave() {
  const st = document.getElementById("cpstatus");
  st.className = "status";
  st.textContent = t("saving");
  const perms = {};
  const cmds = cmdpermData.commands || [];
  const aliasNames = new Set();
  for (const c of cmds) {
    const old = cpEntry(c.cmd);
    const en = document.getElementById("cp_en_" + c.cmd);
    const al = document.getElementById("cp_al_" + c.cmd);
    const alias = (al ? al.value : old.alias || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const e = { ...old, enabled: en ? en.checked : old.enabled !== false, alias };
    const fieldMap = [
      ["allowRoles", "cp_ar_", "sel"], ["allowUsers", "cp_au_", "ids"],
      ["denyRoles", "cp_dr_", "sel"], ["denyUsers", "cp_du_", "ids"],
      ["allowChannels", "cp_ac_", "sel"], ["denyChannels", "cp_dc_", "sel"],
    ];
    for (const [k, prefix, kind] of fieldMap) {
      if (document.getElementById(prefix + c.cmd)) e[k] = kind === "sel" ? cpSel(prefix + c.cmd) : cpIds(prefix + c.cmd);
    }
    if (document.getElementById("cp_di_" + c.cmd)) e.deleteInvoke = document.getElementById("cp_di_" + c.cmd).checked;
    const dr2 = document.getElementById("cp_dr2_" + c.cmd);
    if (dr2) e.deleteReplySec = Math.max(0, Math.min(3600, Number(dr2.value) || 0));
    if (document.getElementById("cp_dod_" + c.cmd)) e.deleteOnSourceDelete = document.getElementById("cp_dod_" + c.cmd).checked;
    if (alias) aliasNames.add(alias);
    perms[c.cmd] = e;
  }
  try {
    const r = await fetch(`/api/guild/${guildId}/cmdperms`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(perms) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "error");
    if (data.maxAliases) cpAliasMax = data.maxAliases;
    cmdpermData.perms = data.perms || perms;
    cpInfo();
    st.textContent = "✅ " + t("saved_ok");
    st.className = "status ok";
    toast(t("saved_ok"));
    if (data.aliasState && data.aliasState.ok === false) { st.textContent += " ⚠️ " + t("cp_alias_fail"); st.className = "status err"; }
    else if (aliasNames.size > cpAliasMax) { st.textContent += ` ⚠️ ${cpAliasMax}`; st.className = "status err"; }
    document.querySelectorAll("#cplist .cp-card").forEach(el => {
      const c = cpEntry(el.id.replace("cp_card_", ""));
      el.classList.toggle("is-off", c.enabled === false);
    });
  } catch (e) { st.textContent = "❌ " + e.message; st.className = "status err"; }
}

watchMain();
init();
