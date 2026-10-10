require("dotenv").config();

// ============== ERROR HANDLERS (PREVENT CRASH) ==============
// Contador de errores para la tarjeta de salud del panel + registro en DB.
let PROCESS_ERRORS = 0;
let LAST_FATAL = null;
function noteError(kind, err) {
  PROCESS_ERRORS++;
  LAST_FATAL = { kind, msg: String((err && err.message) || err).slice(0, 300), at: Date.now() };
  try { db.miscSet("processHealth", { errors: PROCESS_ERRORS, last: LAST_FATAL, boot: process.env.HYDRA_BOOT_ID || null, healthy: PROCESS_ERRORS < 25 }); } catch {}
}
process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ Unhandled Rejection:", reason?.message || reason);
  noteError("unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error("⚠️ Uncaught Exception:", err.message);
  noteError("uncaughtException", err);
});
process.on("uncaughtExceptionMonitor", (err) => {
  console.error("⚠️ Uncaught Monitor:", err.message);
});

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  Events, Partials, AttachmentBuilder, SlashCommandBuilder, REST, Routes,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, LinkButtonBuilder,
  ContextMenuCommandBuilder, ApplicationCommandType, ComponentType,
  PermissionFlagsBits, ChannelType, PermissionsBitField, ActivityType, MessageFlags,
} = require("discord.js");
const voice = require("@discordjs/voice");
const play = require("play-dl");
const ytdl = require("@distube/ytdl-core");
const ffmpegPath = require("ffmpeg-static");
const { exec } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const BOOT_TS = Date.now();
process.env.HYDRA_BOOT_ID = crypto.randomBytes(3).toString("hex");
const path = require("path");
const db = require("./db.js"); // SQLite persistence (per-guild tables)

// Set ffmpeg path for prism-media
process.env.FFMPEG_PATH = ffmpegPath;

// Detector de ffmpeg: en el host el instalador de npm suele estar bloqueado y el
// binario no existe; si falta, la música avisa con un mensaje claro en vez de
// fallar callado dentro del spawn.
let FFMPEG_OK = null; // null = sin comprobar, true/false = resultado
function ffmpegDisponible() {
  if (FFMPEG_OK !== null) return FFMPEG_OK;
  try {
    const p = ffmpegPath || process.env.FFMPEG_BIN || "";
    FFMPEG_OK = !!p && fs.existsSync(p);
    if (!FFMPEG_OK) console.error("⚠️ ffmpeg no encontrado en:", p || "(ruta vacía)", "— la música no funcionará. Sube el binario o define FFMPEG_BIN.");
  } catch (e) {
    FFMPEG_OK = false;
    console.error("⚠️ Error comprobando ffmpeg:", e.message);
  }
  return FFMPEG_OK;
}

const { createCanvas } = require("@napi-rs/canvas");

function generateTweetImage({ displayName, username, avatarUrl, content, time }) {
  const W = 600, H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background - pure black like X
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);

  // Avatar (48px circle at position 24,24)
  const avatarSize = 48;
  const avatarX = 24, avatarY = 24;
  ctx.fillStyle = "#1D9BF0";
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.fill();
  // Initial letter if no avatar
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText((displayName || "?")[0].toUpperCase(), avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 8);
  ctx.textAlign = "left";

  // Display name (bold, white, 15px)
  const textX = 84;
  ctx.fillStyle = "#E7E9EA";
  ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(displayName, textX, 42);

  // Verified badge (small blue circle with check)
  const dnW = ctx.measureText(displayName).width;
  const badgeX = textX + dnW + 6;
  ctx.fillStyle = "#1D9BF0";
  ctx.beginPath();
  ctx.arc(badgeX + 7, 38, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("✓", badgeX + 7, 42);
  ctx.textAlign = "left";

  // @username (gray, 15px)
  ctx.fillStyle = "#71767B";
  ctx.font = "15px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(`@${username}`, textX, 60);

  // Tweet content (white, 15px, wrap)
  ctx.fillStyle = "#E7E9EA";
  ctx.font = "15px -apple-system, BlinkMacSystemFont, sans-serif";
  const lines = wrapText(ctx, content, W - 110);
  lines.forEach((line, i) => {
    ctx.fillText(line, 24, 100 + i * 22);
  });

  // Timestamp
  const contentBottom = 100 + lines.length * 22 + 8;
  ctx.fillStyle = "#71767B";
  ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(time || "8:19 PM · Jul 3, 2026", 24, contentBottom);

  // Separator line
  const sepY = contentBottom + 14;
  ctx.strokeStyle = "#2F3336";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, sepY);
  ctx.lineTo(W - 24, sepY);
  ctx.stroke();

  // Stats line - "366 likes · 130 tweets · 75 replies"
  const statsY = sepY + 22;
  const replies = Math.floor(Math.random() * 100 + 2);
  const retweets = Math.floor(Math.random() * 200 + 5);
  const likes = Math.floor(Math.random() * 500 + 10);

  let statsX = 24;
  ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#E7E9EA";
  ctx.fillText(`${replies}`, statsX, statsY);
  statsX += ctx.measureText(`${replies}`).width;
  ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#71767B";
  ctx.fillText(" replies", statsX, statsY);
  statsX += ctx.measureText(" replies").width;

  ctx.fillText(" · ", statsX, statsY);
  statsX += ctx.measureText(" · ").width;

  ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#E7E9EA";
  ctx.fillText(`${retweets}`, statsX, statsY);
  statsX += ctx.measureText(`${retweets}`).width;
  ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#71767B";
  ctx.fillText(" tweets", statsX, statsY);
  statsX += ctx.measureText(" tweets").width;

  ctx.fillText(" · ", statsX, statsY);
  statsX += ctx.measureText(" · ").width;

  ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#E7E9EA";
  ctx.fillText(`${likes}`, statsX, statsY);
  statsX += ctx.measureText(`${likes}`).width;
  ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#71767B";
  ctx.fillText(" likes", statsX, statsY);

  // Separator line 2
  const sep2Y = statsY + 14;
  ctx.beginPath();
  ctx.moveTo(24, sep2Y);
  ctx.lineTo(W - 24, sep2Y);
  ctx.stroke();

  // Action icons (5 icons evenly spaced)
  const iconY = sep2Y + 24;
  const iconSpacing = (W - 48) / 5;
  ctx.strokeStyle = "#71767B";
  ctx.lineWidth = 1.5;

  // Comment icon (speech bubble)
  drawCommentIcon(ctx, 36, iconY - 8);
  // Retweet icon (arrows)
  drawRetweetIcon(ctx, 36 + iconSpacing, iconY - 8);
  // Heart icon
  drawHeartIcon(ctx, 36 + iconSpacing * 2, iconY - 8);
  // Views icon (bar chart)
  drawViewsIcon(ctx, 36 + iconSpacing * 3, iconY - 8);
  // Share/bookmark icon
  drawShareIcon(ctx, 36 + iconSpacing * 4, iconY - 8);

  return canvas.toBuffer("image/png");
}

function drawCommentIcon(ctx, x, y) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x, y - 8, x + 10, y - 12, x + 16, y - 12);
  ctx.bezierCurveTo(x + 22, y - 12, x + 28, y - 8, x + 28, y);
  ctx.bezierCurveTo(x + 28, y + 4, x + 24, y + 8, x + 18, y + 10);
  ctx.lineTo(x + 14, y + 14);
  ctx.lineTo(x + 12, y + 8);
  ctx.bezierCurveTo(x + 6, y + 6, x, y + 4, x, y);
  ctx.stroke();
}

function drawRetweetIcon(ctx, x, y) {
  // Two curved arrows
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 2);
  ctx.lineTo(x + 20, y + 2);
  ctx.lineTo(x + 18, y - 2);
  ctx.moveTo(x + 24, y + 10);
  ctx.lineTo(x + 8, y + 10);
  ctx.lineTo(x + 10, y + 14);
  ctx.stroke();
  // Arrow heads
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 2);
  ctx.lineTo(x + 17, y - 1);
  ctx.moveTo(x + 20, y + 2);
  ctx.lineTo(x + 17, y + 5);
  ctx.moveTo(x + 8, y + 10);
  ctx.lineTo(x + 11, y + 13);
  ctx.moveTo(x + 8, y + 10);
  ctx.lineTo(x + 11, y + 7);
  ctx.stroke();
}

function drawHeartIcon(ctx, x, y) {
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 14);
  ctx.bezierCurveTo(x + 14, y + 12, x + 4, y + 4, x + 4, y);
  ctx.bezierCurveTo(x + 4, y - 4, x + 8, y - 6, x + 11, y - 4);
  ctx.bezierCurveTo(x + 13, y - 2, x + 14, y + 2, x + 14, y + 4);
  ctx.bezierCurveTo(x + 14, y + 2, x + 15, y - 2, x + 17, y - 4);
  ctx.bezierCurveTo(x + 20, y - 6, x + 24, y - 4, x + 24, y);
  ctx.bezierCurveTo(x + 24, y + 4, x + 14, y + 12, x + 14, y + 14);
  ctx.stroke();
}

function drawViewsIcon(ctx, x, y) {
  // Bar chart
  ctx.beginPath();
  ctx.moveTo(x, y + 14);
  ctx.lineTo(x + 28, y + 14);
  ctx.stroke();
  // Bars
  ctx.fillStyle = "#71767B";
  ctx.fillRect(x + 2, y + 6, 4, 8);
  ctx.fillRect(x + 9, y + 2, 4, 12);
  ctx.fillRect(x + 16, y + 8, 4, 6);
  ctx.fillRect(x + 23, y + 4, 4, 10);
}

function drawShareIcon(ctx, x, y) {
  // Share arrow
  ctx.beginPath();
  ctx.moveTo(x + 14, y);
  ctx.lineTo(x + 14, y + 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 4);
  ctx.lineTo(x + 14, y);
  ctx.lineTo(x + 18, y + 4);
  ctx.stroke();
  // Book shape
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 4);
  ctx.lineTo(x + 4, y + 14);
  ctx.lineTo(x + 24, y + 14);
  ctx.lineTo(x + 24, y + 4);
  ctx.lineTo(x + 19, y + 4);
  ctx.lineTo(x + 19, y + 14);
  ctx.moveTo(x + 9, y + 4);
  ctx.lineTo(x + 9, y + 14);
  ctx.stroke();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = words[0] || "";
  for (let i = 1; i < words.length; i++) {
    const test = current + " " + words[i];
    if (ctx.measureText(test).width <= maxWidth) current = test;
    else { lines.push(current); current = words[i]; }
  }
  lines.push(current);
  return lines;
}

const BOT_ID = "1530017627756298394";
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildPresences,
    // Sin estos intents Discord NO envia los eventos y los listeners nunca se ejecutan:
    GatewayIntentBits.GuildMessageReactions,   // reaction roles, starboard, votos
    GatewayIntentBits.GuildModeration,          // baneos y timeouts
    GatewayIntentBits.GuildBans,                // cache de baneos
    GatewayIntentBits.GuildInvites,             // tracking de invitaciones
    GatewayIntentBits.GuildScheduledEvents,     // eventos programados
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User, Partials.GuildMember],
});

const CONFIG = {
  guildId: process.env.GUILD_ID,
  verifiedRoleId: process.env.ROLE_VERIFIED,
  unverifiedRoleId: process.env.ROLE_UNVERIFIED,
  verificationChannelId: process.env.CHANNEL_VERIFICATION,
  inscriptionChannelId: "1523514700384440320",
  inscriptionEmbedId: "1523512153829806192",
  spotifyUserId: "1307246359895740448",
  welcomeChannelId: "1522475608981114995",
};

let botSuspended = false;
const processingInscriptions = new Set();

// ============== WELCOME BANNER ==============
function generateWelcomeBanner(displayName, avatarUrl, guildId) {
  const fs = require("fs");
  const custom = guildId ? guildBannerPath(guildId) : null;
  if (custom) {
    try { return fs.readFileSync(custom); } catch {}
  }
  const localBanner = require("path").join(__dirname, "hydrabanner.jpg");
  const legacyBanner = "C:\\Users\\WinterOS\\Pictures\\HYDRABANNER.jpg";
  for (const bannerPath of [localBanner, legacyBanner]) {
    try {
      if (fs.existsSync(bannerPath)) {
        return fs.readFileSync(bannerPath);
      }
    } catch {}
  }
  // Fallback: banner negro con texto
  const W = 800, H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#5865f2";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, W - 4, H - 4);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.fillText("HYDRA STUDIO", W / 2, H / 2 - 20);
  ctx.font = "18px Arial";
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText("Bienvenido a nuestra comunidad", W / 2, H / 2 + 15);
  return canvas.toBuffer("image/png");
}

// ============== MUSIC STATE ==============
const musicQueues = new Map();
const musicPlayers = new Map();

function getQueue(guildId) {
  if (!musicQueues.has(guildId)) {
    const gc = getGuildConfig(guildId);
    const vol = Math.min(150, Math.max(1, Number(gc.musicVolume) || 100));
    musicQueues.set(guildId, { songs: [], connection: null, player: null, volume: vol, looping: false, textChannelId: null, ffmpeg: null, busy: false });
  }
  return musicQueues.get(guildId);
}

// Limpieza centralizada de la cola de música: corta ffmpeg, destruye la
// conexión de voz y borra la cola. Lo usan /stop, el botón stop y la salida
// del bot del canal, para no dejar procesos ni conexiones zombis.
function destroyMusicQueue(guildId, motivo = "") {
  const q = musicQueues.get(guildId);
  if (!q) return;
  try { if (q.ffmpeg && !q.ffmpeg.killed) q.ffmpeg.kill("SIGTERM"); } catch {}
  try { if (q.player) q.player.stop(); } catch {}
  try { if (q.connection && q.connection.state.status !== "destroyed") q.connection.destroy(); } catch {}
  musicQueues.delete(guildId);
  if (motivo) console.log(`🎵 Cola de música cerrada en ${guildId} (${motivo})`);
  try { client.restoreBotmode(); } catch {}
}

// ============== CAPTCHA ==============
function genCaptcha(len) {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = ""; for (let i = 0; i < len; i++) r += c[Math.floor(Math.random() * c.length)]; return r;
}

async function captchaImage(text) {
  const w = 400, h = 150, canvas = require("@napi-rs/canvas").createCanvas(w, h), ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#1a1a2e"); g.addColorStop(0.5, "#16213e"); g.addColorStop(1, "#0f3460");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 10; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.random()*0.15})`; ctx.lineWidth = Math.random()*2+0.5;
    ctx.beginPath(); ctx.moveTo(Math.random()*w, Math.random()*h); ctx.lineTo(Math.random()*w, Math.random()*h); ctx.stroke();
  }
  for (let i = 0; i < 150; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.3})`;
    ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, Math.random()*2, 0, Math.PI*2); ctx.fill();
  }
  const colors = ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD"];
  ctx.font = "bold 55px Arial"; ctx.textBaseline = "middle";
  const tw = text.length * 41.25, sx = (w-tw)/2+22;
  for (let i = 0; i < text.length; i++) {
    ctx.save(); ctx.translate(sx+i*41.25, h/2+(Math.random()-0.5)*20);
    ctx.rotate((Math.random()-0.5)*0.4); ctx.fillStyle = colors[i%colors.length];
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.fillText(text[i], 0, 0); ctx.restore();
  }
  return canvas.toBuffer("image/png");
}

const pendingCaptchas = new Map();
const pendingAnuncios = new Map();
  const pendingSorteos = new Map();
  const pendingEvents = new Map();

// ============== EVENT SYSTEM ==============
const events = new Map();
let eventCounter = 0;
const eventDisplayIntervals = new Map();
const EVENTS_FILE = __dirname + "/events.json";
let eventsLoaded = false;

function loadEvents() {
  try {
    for (const [id, ev] of db.getEvents()) events.set(id, ev);
    const c = db.miscGet("eventCounter", null);
    if (typeof c === "number") eventCounter = c;
    console.log(`📅 Loaded ${events.size} events`);

      for (const [id, ev] of events) {
        if (ev.messageId && ev.channelId && ev.status === "abierto") {
          const interval = setInterval(async () => {
            try {
              const ch = client.channels.cache.get(ev.channelId);
              if (!ch) return;
              const m = await ch.messages.fetch(ev.messageId);
              if (!m) return;
              const updatedEmbed = buildEventDisplayEmbed(ev, ch.guild);
              const components = m.components.length > 0 ? m.components : [
                new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId(`evento_info_${id}`).setLabel("📋 Info").setStyle(ButtonStyle.Secondary),
                  new ButtonBuilder().setCustomId(`evento_join_${id}`).setLabel("✅ Unirse").setStyle(ButtonStyle.Success),
                  new ButtonBuilder().setCustomId(`evento_leave_${id}`).setLabel("🚪 Salir").setStyle(ButtonStyle.Danger),
                )
  ];


              await m.edit({ embeds: [updatedEmbed], components });
            } catch {}
          }, 30000);
          eventDisplayIntervals.set(id, interval);
          console.log(`🔄 Auto-refresh (30s) started for ${id}`);
        }
      }
  } catch {}
  eventsLoaded = true;
}

async function safeSendDM(member, content, components, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const dm = await member.createDM();
      await dm.send({ content, components });
      return true;
    } catch (err) {
      if (err.httpStatus === 429 || err.message.includes("rate")) {
        const retryAfter = err.retryAfter || 5000;
        console.log(`  ⏳ Rate limited on ${member.user.tag}, retry in ${retryAfter}ms...`);
        await new Promise(r => setTimeout(r, retryAfter));
        continue;
      }
      throw err;
    }
  }
  return false;
}

function saveEvents() {
  if (!eventsLoaded) return;
  try {
    const ids = new Set(events.keys());
    for (const [id] of db.getEvents()) if (!ids.has(id)) db.delEvent(id);
    for (const [id, ev] of events) db.setEvent(id, ev.guildId || "", ev);
    db.miscSet("eventCounter", eventCounter);
  } catch (e) { console.error("Error saving events:", e.message); }
}

// ============== TEAM SYSTEM ==============
const teams = new Map();
const TEAMS_FILE = __dirname + "/teams.json";
let teamsLoaded = false;

// Team map keys are namespaced: `${guildId}:${nameLower}` (no cross-guild collisions)
const teamKeyOf = (guildId, name) => `${guildId}:${(name || "").toLowerCase()}`;
function teamGet(guildId, name) { return teams.get(teamKeyOf(guildId, name)); }
function teamSet(guildId, name, obj) {
  obj.guildId = guildId;
  teams.set(teamKeyOf(guildId, name), obj);
  saveTeams();
}
function teamDel(guildId, name) {
  teams.delete(teamKeyOf(guildId, name));
  saveTeams();
}
function teamsOf(guildId) {
  return [...teams.entries()].filter(([, t]) => (t && t.guildId) === guildId);
}

function loadTeams() {
  try {
    for (const [nameLower, t] of db.getTeams()) {
      const gid = (t && t.guildId) || "";
      teams.set(`${gid}:${nameLower}`, t);
    }
    console.log(`👥 Loaded ${teams.size} teams`);
  } catch (e) { noteError("loadTeams", e); console.error("⚠️ loadTeams error:", e.message); }
  teamsLoaded = true;
}

function saveTeams() {
  if (!teamsLoaded) return;
  try {
    const keys = new Set(teams.keys());
    for (const [key, t] of teams) {
      const i = key.indexOf(":");
      const gid = key.slice(0, i), nameLower = key.slice(i + 1);
      db.setTeam(gid, nameLower, t);
    }
    // Remove rows that no longer exist in memory
    for (const [nameLower, t] of db.getTeams()) {
      const gid = (t && t.guildId) || "";
      if (!keys.has(`${gid}:${nameLower}`)) db.delTeam(gid, nameLower);
    }
  } catch (e) { console.error("Error saving teams:", e.message); }
}

// ============== SERVER STATUS (per-guild, stored in guild config) ==============
function getMC(guildId) {
  const gc = getGuildConfig(guildId);
  return (gc && gc.mcServer) || { host: "localhost", port: 25565 };
}

function setMC(guildId, host, port) {
  const gc = getGuildConfig(guildId);
  gc.mcServer = { host, port };
  saveGuilds();
  console.log(`🖥️ [${guildId}] MC server set: ${host}:${port}`);
}

function loadServerConfig() { /* legacy: migrated to SQLite on import */ }
function saveServerConfig() { /* legacy: per-guild saves go through saveGuilds() */ }

// ============== BOTMODE PERSISTENCE ==============
const BOTMODE_FILE = __dirname + "/botmode.json";
let botmodeConfig = { mode: "playing", text: "Hydra Studio", status: "online", streamingUrl: "" };
let spotifySyncEnabled = false;

function loadBotmode() {
  try {
    const fs = require("fs");
    if (fs.existsSync(BOTMODE_FILE)) {
      botmodeConfig = JSON.parse(fs.readFileSync(BOTMODE_FILE, "utf8"));
      if (botmodeConfig.mode === "spotify") spotifySyncEnabled = true;
      console.log(`🤖 Loaded botmode: ${botmodeConfig.mode} ${botmodeConfig.text}`);
    }
  } catch {}
}

function saveBotmode() {
  try {
    const fs = require("fs");
    fs.writeFileSync(BOTMODE_FILE, JSON.stringify(botmodeConfig, null, 2));
  } catch {}
}

// ===== MC NICKS DATABASE (per-guild, SQLite; keys `${guildId}:${userId}`) =====
let mcNicks = {};

function loadMcNicks() {
  try {
    for (const [gid, uid, nick] of db.getAllMcNicks()) mcNicks[`${gid}:${uid}`] = nick;
    // Sync nicks from events (per-guild)
    let synced = 0;
    for (const [id, ev] of events) {
      if (ev.participants) {
        for (const p of ev.participants) {
          if (p.userId && p.nick && ev.guildId && !mcNicks[`${ev.guildId}:${p.userId}`]) {
            mcNicks[`${ev.guildId}:${p.userId}`] = p.nick;
            synced++;
          }
        }
      }
    }
    if (synced > 0) saveMcNicks();
    console.log(`⛏️ Loaded ${Object.keys(mcNicks).length} MC nicks (${synced} synced from events)`);
  } catch (e) { console.error("❌ mc-nick load error:", e.message); }
}

function saveMcNicks() {
  try {
    for (const [key, nick] of Object.entries(mcNicks)) {
      const i = key.indexOf(":");
      if (i > 0) db.setMcNick(key.slice(0, i), key.slice(i + 1), nick);
    }
  } catch (e) { console.error("❌ mc-nick save error:", e.message); }
}

function getMcNick(guildId, userId) {
  return mcNicks[`${guildId}:${userId}`] || null;
}

function setMcNick(guildId, userId, nick) {
  mcNicks[`${guildId}:${userId}`] = nick;
  saveMcNicks();
}

const serverStatusIntervals = new Map();

// ============== PREDICTIONS ==============
const predictions = new Map();

// ============== SOCIAL LINKS ==============
const socialLinks = new Map();
const socialNotifChannels = new Map();

// ============== STATS (per-guild, SQLite; keys `${guildId}:${userId}`) ==============
const memberStats = new Map();
let statsLoaded = false;

function statKey(guildId, userId) { return `${guildId}:${userId}`; }
function getStats(guildId, userId) {
  return memberStats.get(statKey(guildId, userId)) || { eventsParticipated: 0, eventsWon: 0, eventsCreated: 0 };
}
function bumpStat(guildId, userId, field, by = 1) {
  const s = getStats(guildId, userId);
  s[field] = (s[field] || 0) + by;
  memberStats.set(statKey(guildId, userId), s);
  saveStats();
}
function loadStats() {
  try {
    for (const [gid, uid, s] of db.getAllStats()) memberStats.set(statKey(gid, uid), s);
    console.log(`📊 Loaded stats for ${memberStats.size} members`);
  } catch (e) { console.error("loadStats error:", e.message); }
  statsLoaded = true;
}
function saveStats() {
  if (!statsLoaded) return;
  try {
    for (const [key, s] of memberStats) {
      const i = key.indexOf(":");
      if (i > 0) db.setStat(key.slice(0, i), key.slice(i + 1), s);
    }
  } catch (e) { console.error("Error saving stats:", e.message); }
}

// ============== POLLS ==============
const activePolls = new Map(); // messageId -> poll (persistidas en SQLite)

function loadPolls() {
  try {
    let n = 0;
    for (const [, p] of db.getPolls()) {
      if (!p || !p.guildId || !p.id || !p.messageId) continue;
      activePolls.set(p.messageId, p);
      n++;
    }
    console.log(`📊 Loaded ${n} polls`);
  } catch (e) { noteError("loadPolls", e); console.error("loadPolls error:", e.message); }
}
function savePoll(p) {
  try { db.setPoll(p.guildId, p.id, p); } catch (e) { console.error("savePoll error:", e.message); }
}
function findPoll(guildId, ref) {
  ref = String(ref || "").trim();
  if (!ref) return null;
  const byMsg = activePolls.get(ref);
  if (byMsg && (byMsg.guildId || "") === guildId) return byMsg;
  const upper = ref.toUpperCase();
  for (const [, p] of activePolls) {
    if ((p.guildId || "") !== guildId) continue;
    if (String(p.id).toUpperCase() === upper || p.messageId === ref) return p;
  }
  return null;
}

// ============== SUGGESTIONS ==============
const activeSuggestions = new Map(); // `${guildId}:${sugId}` -> sug (persistida en SQLite)
const SUG_NEUTRAL = "🤝";

function loadSuggestions() {
  try {
    let n = 0;
    for (const [, s] of db.getSuggestions()) {
      if (!s || !s.guildId || !s.id) continue;
      activeSuggestions.set(`${s.guildId}:${s.id}`, s);
      n++;
    }
    console.log(`💡 Loaded ${n} suggestions`);
  } catch (e) { noteError("loadSuggestions", e); console.error("loadSuggestions error:", e.message); }
}
function saveSuggestion(s) {
  try { db.setSuggestion(s.guildId, s.id, s); } catch (e) { console.error("saveSuggestion error:", e.message); }
}
function findSuggestion(guildId, ref) {
  ref = String(ref || "").trim();
  if (!ref) return null;
  const direct = activeSuggestions.get(`${guildId}:${ref.toUpperCase()}`);
  if (direct) return direct;
  for (const [, s] of activeSuggestions) {
    if ((s.guildId || "") !== guildId) continue;
    if (s.messageId === ref || s.reviewMessageId === ref || String(s.id).toUpperCase() === ref.toUpperCase()) return s;
  }
  return null;
}
function parseSugEmoji(raw) {
  const m = String(raw || "").match(/<(a)?:\w+:(\d+)>/);
  if (m) return { id: m[2] };
  return { name: String(raw || "") };
}
async function countSugVotes(guild, sug) {
  const out = { up: 0, neutral: 0, down: 0, total: 0 };
  try {
    const gc = getGuildConfig(guild.id);
    const upRef = parseSugEmoji(sug.upEmoji || gc.sugUpvoteEmoji || "👍");
    const downRef = parseSugEmoji(sug.downEmoji || gc.sugDownvoteEmoji || "👎");
    const ch = await guild.channels.fetch(sug.channelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return out;
    const msg = await ch.messages.fetch(sug.messageId).catch(() => null);
    if (!msg) return out;
    for (const [, r] of msg.reactions.cache) {
      const n = Math.max(0, (r.count || 1) - 1); // -1 voto del bot
      const isUp = (upRef.id && r.emoji.id === upRef.id) || (!upRef.id && r.emoji.name === upRef.name);
      const isDown = (downRef.id && r.emoji.id === downRef.id) || (!downRef.id && r.emoji.name === downRef.name);
      if (isUp) out.up += n;
      else if (isDown) out.down += n;
      else if (r.emoji.name === SUG_NEUTRAL) out.neutral += n;
    }
    out.total = out.up + out.neutral + out.down;
  } catch {}
  return out;
}
function buildSuggestionEmbed(sug, gc, guild) {
  const anon = !!gc.sugAnonymous;
  const embed = new EmbedBuilder()
    .setTitle("📥 NUEVA SUGERENCIA")
    .setDescription(`${anon ? "Se ha enviado una sugerencia anónima" : `<@${sug.authorId}> ha enviado una sugerencia`}\n\n**SUGERENCIA:**\n${sug.desc}`)
    .setColor(parseColor(gc.sugEmbedColor || "#00BFFF"))
    .setFooter({ text: `${sug.id} • ${new Date(sug.createdAt).toLocaleString("es-ES")}` })
    .setTimestamp(sug.createdAt);
  const icon = guild ? guild.iconURL() : null;
  if (icon) embed.setThumbnail(icon);
  applyEmbedExtras(embed, gc, "sug", null);
  return embed;
}
function buildReviewRow(sugKey) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sugdecide_${sugKey}`)
      .setPlaceholder("Selecciona una decisión para esta sugerencia...")
      .addOptions([
        { label: "Aceptar Sugerencia", value: "aceptar", emoji: "👍" },
        { label: "Rechazar Sugerencia", value: "rechazar", emoji: "👎" },
        { label: "Eliminar Sugerencia", value: "eliminar", emoji: "❌" },
      ])
  );
}
// Crea una sugerencia completa (embed + votos + revisión + hilo). Usada por
// /sugerencia y por el canal intake. Lanza Error si algo falla.
async function createSuggestion(guild, targetCh, authorUser, authorMember, titulo, desc) {
  const gcSug = getGuildConfig(guild.id);
  if (!targetCh || !targetCh.isTextBased()) throw new Error("Canal de sugerencias no configurado.");
  const t = String(titulo || "").trim().slice(0, 100) || "Sugerencia";
  const d = String(desc || "").trim().slice(0, 1500);
  if (!d) throw new Error("Texto vacío.");
  const ck = `sugCounter_${guild.id}`;
  const n = (db.miscGet(ck, 0) || 0) + 1;
  db.miscSet(ck, n);
  const sugId = `SUG-${n}`;
  const sug = {
    id: sugId, guildId: guild.id,
    authorId: authorUser.id, authorTag: authorUser.tag,
    titulo: t, desc: d, channelId: targetCh.id, messageId: "",
    reviewChannelId: "", reviewMessageId: "", status: "pending",
    upEmoji: gcSug.sugUpvoteEmoji || "👍", downEmoji: gcSug.sugDownvoteEmoji || "👎",
    createdAt: Date.now(),
  };
  const msg = await targetCh.send({ content: msgContent(gcSug, "sugContent", authorMember), embeds: [buildSuggestionEmbed(sug, gcSug, guild)] });
  for (const em of [sug.upEmoji, SUG_NEUTRAL, sug.downEmoji]) { try { await msg.react(em); } catch {} }
  sug.messageId = msg.id;
  activeSuggestions.set(`${sug.guildId}:${sug.id}`, sug);
  saveSuggestion(sug);
  if (gcSug.sugReviewChannelId) {
    const rch = await guild.channels.fetch(gcSug.sugReviewChannelId).catch(() => null);
    if (rch && rch.isTextBased()) {
      const rembed = new EmbedBuilder()
        .setTitle(`📥 ${sugId}: ${t}`.slice(0, 256))
        .setDescription(`${d}\n\n👤 ${authorUser.tag} • <#${targetCh.id}>`.slice(0, 4000))
        .setColor(parseColor(gcSug.sugEmbedColor || "#00BFFF"))
        .setFooter({ text: `${sugId} • pendiente de revisión` })
        .setTimestamp();
      const rmsg = await rch.send({ embeds: [rembed], components: [buildReviewRow(`${sug.guildId}:${sug.id}`)] }).catch(() => null);
      if (rmsg) { sug.reviewChannelId = rch.id; sug.reviewMessageId = rmsg.id; saveSuggestion(sug); }
    }
  }
  if (gcSug.sugThreadCreation) {
    try { await msg.startThread({ name: `💡 ${t}`.slice(0, 100), autoArchiveDuration: 1440 }).catch(() => {}); } catch {}
  }
  return { sug, msg, targetCh };
}
async function decideSuggestion(guild, sug, action, reason, decider) {
  const gc = getGuildConfig(guild.id);
  const accepted = action === "aceptar";
  const votes = await countSugVotes(guild, sug);
  const pct = (n) => (votes.total > 0 ? ((n / votes.total) * 100).toFixed(2) : "0.00");
  const decTag = (decider && decider.tag) || String((decider && decider.username) || decider || "staff");
  const resultEmbed = new EmbedBuilder()
    .setTitle(accepted ? "🎉 SUGERENCIA ACEPTADA" : "❌ SUGERENCIA RECHAZADA")
    .setDescription(`La sugerencia de <@${sug.authorId}> ha cambiado de estado.\n\n**SUGERENCIA**\n${sug.desc}\n\n**VOTOS**\nPositivos ${votes.up} (${pct(votes.up)}%)\nNegativos ${votes.down} (${pct(votes.down)}%)${reason ? `\n\n**Razón:** ${reason}` : ""}`)
    .setColor(accepted ? 0x00FF00 : 0xFF0000)
    .setFooter({ text: `Gestionada por ${decTag} • ${new Date().toLocaleString("es-ES")}` })
    .setTimestamp();
  const icon = guild.iconURL();
  if (icon) resultEmbed.setThumbnail(icon);
  // 1) Publicar en canal de aceptadas/rechazadas
  const destId = accepted ? gc.sugAcceptChannelId : gc.sugRejectChannelId;
  if (destId) {
    const dest = await guild.channels.fetch(destId).catch(() => null);
    if (dest && dest.isTextBased()) await dest.send({ embeds: [resultEmbed] }).catch(() => {});
  }
  // 2) Marcar mensaje original
  try {
    const ch = await guild.channels.fetch(sug.channelId).catch(() => null);
    const msg = ch && ch.isTextBased() ? await ch.messages.fetch(sug.messageId).catch(() => null) : null;
    if (msg && msg.embeds.length) {
      const orig = EmbedBuilder.from(msg.embeds[0]);
      orig.setColor(accepted ? 0x00FF00 : 0xFF0000);
      orig.setFooter({ text: `${sug.id} • ${accepted ? "Aceptada" : "Rechazada"} por ${decTag}` });
      await msg.edit({ embeds: [orig] }).catch(() => {});
    }
  } catch {}
  // 3) Borrar mensaje de revisión
  try {
    if (sug.reviewChannelId && sug.reviewMessageId) {
      const rch = await guild.channels.fetch(sug.reviewChannelId).catch(() => null);
      const rmsg = rch && rch.isTextBased() ? await rch.messages.fetch(sug.reviewMessageId).catch(() => null) : null;
      if (rmsg && rmsg.deletable) await rmsg.delete().catch(() => {});
    }
  } catch {}
  // 4) Log de decisiones
  if (gc.sugDecisionChannelId) {
    try {
      const log = await guild.channels.fetch(gc.sugDecisionChannelId).catch(() => null);
      if (log && log.isTextBased()) await log.send({ embeds: [resultEmbed] }).catch(() => {});
    } catch {}
  }
  // 5) DM al autor
  if (gc.sugDmNotify !== false) {
    try {
      const u = await client.users.fetch(sug.authorId).catch(() => null);
      if (u) await u.send({ embeds: [resultEmbed] }).catch(() => {});
    } catch {}
  }
  // 6) Persistir
  sug.status = accepted ? "accepted" : "rejected";
  sug.decidedBy = (decider && decider.id) || "";
  sug.decidedByTag = decTag;
  sug.reason = reason || "";
  sug.decidedAt = Date.now();
  sug.up = votes.up; sug.down = votes.down; sug.neutral = votes.neutral; sug.total = votes.total;
  saveSuggestion(sug);
  return votes;
}
async function deleteSuggestion(guild, sug) {
  for (const [chId, msgId] of [[sug.channelId, sug.messageId], [sug.reviewChannelId, sug.reviewMessageId]]) {
    try {
      if (!chId || !msgId) continue;
      const ch = await guild.channels.fetch(chId).catch(() => null);
      const msg = ch && ch.isTextBased() ? await ch.messages.fetch(msgId).catch(() => null) : null;
      if (msg && msg.deletable) await msg.delete().catch(() => {});
      if (msg && msg.thread && !msg.thread.archived) await msg.thread.setArchived(true).catch(() => {});
    } catch {}
  }
  activeSuggestions.delete(`${sug.guildId}:${sug.id}`);
  try { db.delSuggestion(sug.guildId, sug.id); } catch (e) { console.error("delSuggestion error:", e.message); }
}

// ============== STAFF SYSTEM (per-guild) ==============
const STAFF_FILE = __dirname + "/staff.json";
let staffData = {};
let staffLoaded = false;

function loadStaff() {
  try {
    let userCount = 0, roleCount = 0;
    for (const g of db.allGuilds()) {
      const data = db.getStaff(g.guildId);
      if (data) {
        staffData[g.guildId] = data;
        if (data.users) userCount += Object.keys(data.users).length;
        if (data.roles) roleCount += Object.keys(data.roles).length;
      }
    }
    console.log(`👮 Loaded staff: ${userCount} users, ${roleCount} roles across ${Object.keys(staffData).length} guilds`);
  } catch (e) { console.error("loadStaff error:", e.message); }
  staffLoaded = true;
}

function saveStaff() {
  if (!staffLoaded) return;
  try {
    for (const [gid, gdata] of Object.entries(staffData)) db.setStaff(gid, gdata);
  } catch (e) { console.error("Error saving staff:", e.message); }
}

function getGuildStaff(guildId) {
  if (!staffData[guildId]) staffData[guildId] = { users: {}, roles: {} };
  if (!staffData[guildId].users) staffData[guildId].users = {};
  if (!staffData[guildId].roles) staffData[guildId].roles = {};
  return staffData[guildId];
}

function isStaff(member) {
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (isBotAdmin(member.guild.id, member.id)) return true;
  const gs = getGuildStaff(member.guild.id);
  if (gs.users[member.id]) return true;
  for (const roleId of Object.keys(gs.roles)) {
    if (member.roles.cache.has(roleId)) return true;
  }
  return false;
}

// ============== PERMISOS POR COMANDO DE MODERACIÓN (deny por defecto) ==============
// Solo el dueño del servidor y el dueño del bot pueden usarlos sin autorización.
// El resto necesita rol/usuario explícito en el panel (módulo Permisos).
const BOT_OWNER_ID = process.env.BOT_OWNER_ID || "1307246359895740448";
// Única persona que puede emitir, quitar o editar licencias Premium.
// Por ahora es manual; más adelante se automatizará al detectar el pago.
function isBotOwner(userId) { return String(userId) === BOT_OWNER_ID; }
const MOD_COMMANDS = [
  { cmd: "sancionar", desc: "Panel de sanción completo (advertir, aislar, expulsar, banear…)", desc_en: "Full sanction panel (warn, timeout, kick, ban…)" },
  { cmd: "Advertir", desc: "Menú contextual: advertir", desc_en: "Context menu: warn", ctx: true },
  { cmd: "Aislar", desc: "Menú contextual: aislar (timeout)", desc_en: "Context menu: timeout", ctx: true },
  { cmd: "Expulsar", desc: "Menú contextual: expulsar", desc_en: "Context menu: kick", ctx: true },
  { cmd: "Banear", desc: "Menú contextual: banear", desc_en: "Context menu: ban", ctx: true },
  { cmd: "ban", desc: "Tipo de /sancionar: ban permanente", desc_en: "/sancionar type: permanent ban" },
  { cmd: "tempban", desc: "Tipo de /sancionar: ban temporal", desc_en: "/sancionar type: temporary ban" },
  { cmd: "unban", desc: "Tipo de /sancionar: levantar baneo", desc_en: "/sancionar type: unban" },
  { cmd: "kick", desc: "Tipo de /sancionar: expulsar", desc_en: "/sancionar type: kick" },
  { cmd: "softban", desc: "Tipo de /sancionar: softban (borra mensajes)", desc_en: "/sancionar type: softban" },
  { cmd: "timeout", desc: "Tipo de /sancionar: aislar (timeout)", desc_en: "/sancionar type: timeout" },
  { cmd: "warn", desc: "Tipo de /sancionar: advertencia (registra caso)", desc_en: "/sancionar type: warn" },
  { cmd: "warns", desc: "Ver advertencias", desc_en: "View warnings" },
  { cmd: "delwarn", desc: "Tipo de /sancionar: quitar advertencia", desc_en: "/sancionar type: remove warning" },
  { cmd: "clear", desc: "Borrar mensajes", desc_en: "Clear messages" },
  { cmd: "purge", desc: "Purgar con filtro", desc_en: "Purge with filter" },
  { cmd: "slowmode", desc: "Slowmode", desc_en: "Slowmode" },
  { cmd: "lock", desc: "Bloquear canal", desc_en: "Lock channel" },
  { cmd: "unlock", desc: "Desbloquear canal", desc_en: "Unlock channel" },
  { cmd: "nuke", desc: "Nukear canal", desc_en: "Nuke channel" },
  { cmd: "setnick", desc: "Cambiar apodo", desc_en: "Change nickname" },
  { cmd: "vmute", desc: "Mutear en voz", desc_en: "Voice mute" },
  { cmd: "vockick", desc: "Desconectar de voz", desc_en: "Voice disconnect" },
];
const MODULE_COMMANDS = {
  moderation: ["sancionar", "Advertir", "Aislar", "Expulsar", "Banear", "clear", "slowmode", "lock", "unlock", "nuke", "timeout", "ban", "tempban", "unban", "kick", "softban", "warn", "warns", "delwarn", "purge", "setnick", "vmute", "vockick", "clonar"],
  verification: ["setup-verification", "captcha-test"],
  tickets: ["ticket-setup", "ticket"],
  giveaways: ["sorteo"],
  polls: ["encuesta"],
  suggestions: ["sugerencia"],
  confesar: ["confesar", "borrar", "responder", "reportar", "apelar", "confesion"],
  events: ["evento", "equipo"],
  stats: ["stats", "leaderboard"],
  clips: ["clip"],
  music: ["play", "pause", "resume", "stop", "skip", "queue", "nowplaying", "volumen", "loop"],
  tempvoice: ["tempvoice-setup"],
  afk: ["afk"],
  reactionroles: ["reactionrole"],
  joinranks: ["joinrank"],
  autorespond: ["autorespond"],
  sticky: ["sticky"],
  invites: ["invite"],
  embedbuilder: ["anuncio", "mensaje-bot"],
  mcserver: ["server", "predecir", "enlazar", "redes", "skin", "mcprofile", "mcstatus", "mc-nick"],
  botmode: ["status"],
  socials: ["tweet"],
  fun: ["meme", "random", "ship", "8ball", "momo", "img", "clima", "traducir", "cuenta-regresiva", "recordatorio", "aporte", "bot", "md"],
  utility: ["ping", "ayuda", "userinfo", "avatar", "channelinfo", "boosters", "serverinfo", "role"],
};
const MODULE_META = [
  { id: "moderation", name: "Moderación", icon: "🛡️" }, { id: "verification", name: "Verificación", icon: "🔐" }, { id: "tickets", name: "Tickets", icon: "🎫" },
  { id: "suggestions", name: "Sugerencias", icon: "💡" }, { id: "polls", name: "Encuestas", icon: "📊" }, { id: "giveaways", name: "Sorteos", icon: "🎉" },
  { id: "confesar", name: "Confesiones", icon: "🕵️" }, { id: "events", name: "Eventos", icon: "🎪" }, { id: "staff", name: "Staff", icon: "👮" },
  { id: "automod", name: "AutoMod", icon: "🤖" }, { id: "joinranks", name: "Rangos", icon: "🏅" }, { id: "reactionroles", name: "Reaction Roles", icon: "🎭" },
  { id: "autorespond", name: "AutoRespuestas", icon: "💬" }, { id: "sticky", name: "Sticky", icon: "📌" }, { id: "embedbuilder", name: "Constructor de embeds", icon: "🧱" },
  { id: "invites", name: "Invitaciones", icon: "🔗" }, { id: "stats", name: "Estadísticas", icon: "📈" }, { id: "clips", name: "Clips", icon: "🎬" },
  { id: "mcserver", name: "Minecraft", icon: "⛏️" }, { id: "music", name: "Música", icon: "🎵" }, { id: "tempvoice", name: "TempVoice", icon: "🎙️" },
  { id: "afk", name: "AFK", icon: "💤" }, { id: "socials", name: "Redes Sociales", icon: "📱" }, { id: "botmode", name: "Presencia del bot", icon: "🟢" },
  { id: "fun", name: "Diversión", icon: "🎲" }, { id: "utility", name: "Utilidad", icon: "🔧" },
];
const COMMAND_MODULE = {};
for (const [m, list] of Object.entries(MODULE_COMMANDS)) for (const c of list) COMMAND_MODULE[c] = m;
// Botones / menús que pertenecen a un módulo (para que el interruptor también los corte)
const MODULE_BUTTONS = {
  ticket_: "tickets", verify_: "verification", conf_: "confesar",
  sug: "suggestions", evlist_: "events", evpart_: "events", evento_: "events", insc_: "events",
  music_: "music", clip_fav_: "clips", tv_: "tempvoice", poll_: "polls", giveaway_: "giveaways",
};
const MOD_SW_CACHE = new Map();
function getModuleSw(guildId) {
  const hit = MOD_SW_CACHE.get(guildId);
  if (hit && Date.now() - hit.ts < 30000) return hit.map;
  let map = {};
  try { map = db.getModSw(guildId) || {}; } catch {}
  MOD_SW_CACHE.set(guildId, { ts: Date.now(), map });
  return map;
}
function clearModuleSwCache(guildId) { if (guildId) MOD_SW_CACHE.delete(guildId); else MOD_SW_CACHE.clear(); }
function isModuleOff(guildId, mod) { return !!mod && getModuleSw(guildId)[mod] === false; }
function moduleOfInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) return COMMAND_MODULE[interaction.commandName] || null;
    const id = String(interaction.customId || "");
    if (!id) return null;
    for (const p of Object.keys(MODULE_BUTTONS)) if (id.startsWith(p)) return MODULE_BUTTONS[p];
  } catch {}
  return null;
}

// ============== PERMISOS JERÁRQUICOS (niveles tipo Wick) ==============
function permitCfg(guildId) {
  const raw = db.getPermits(guildId) || {};
  const valid = new Set(MODULE_META.map(m => m.id));
  const permits = (Array.isArray(raw.permits) ? raw.permits : []).slice(0, 20).map((p, i) => ({
    id: String(p.id || `p${i}`),
    name: String(p.name || `Nivel ${i + 1}`).slice(0, 40),
    color: /^#[0-9a-f]{6}$/i.test(String(p.color)) ? p.color : "#5865F2",
    rank: i,
    roles: (Array.isArray(p.roles) ? p.roles : []).map(String).filter(r => /^\d{17,20}$/.test(r)),
    modules: (Array.isArray(p.modules) ? p.modules : []).map(String).filter(m => valid.has(m)),
  }));
  return { enabled: !!raw.enabled && permits.length > 0, permits };
}
function permitFor(guildId, member) {
  const cfg = permitCfg(guildId);
  if (!cfg.enabled) return { configured: false, modules: null, name: "" };
  if (!member) return { configured: true, modules: new Set(), name: "" };
  if (member.id === BOT_OWNER_ID) return { configured: true, modules: new Set(MODULE_META.map(m => m.id)), name: "bot owner" };
  if (member.guild && member.id === member.guild.ownerId) return { configured: true, modules: new Set(MODULE_META.map(m => m.id)), name: "owner" };
  if (isBotAdmin(guildId, member.id)) return { configured: true, modules: new Set(MODULE_META.map(m => m.id)), name: "rescate" };
  const mods = new Set();
  let best = null, bestRank = Infinity;
  for (const p of cfg.permits) {
    if (!p.roles.some(r => member.roles.cache.has(r))) continue;
    if (p.rank < bestRank) { bestRank = p.rank; best = p; }
    for (const m of p.modules) mods.add(m);
  }
  return { configured: true, modules: mods, name: best ? best.name : "" };
}
function moduleTitle(id) {
  const m = MODULE_META.find(x => x.id === id);
  return m ? m.name || id : id;
}

// ============== RESCATE Y PROPIEDAD DEL BOT ==============
const RESCUE_TTL_MS = 24 * 3600 * 1000;
const RESCUE_MAX_USES = 1;
function rescueState(guildId) {
  const raw = db.getRescue(guildId) || {};
  const now = Date.now();
  const active = raw.keyHash && raw.expiresAt > now && (Number(raw.usesLeft) || 0) > 0;
  return {
    keyHash: raw.keyHash || "",
    keyHint: raw.keyHint || "",
    createdAt: Number(raw.createdAt) || 0,
    expiresAt: active ? Number(raw.expiresAt) : 0,
    usesLeft: active ? Number(raw.usesLeft) : 0,
    createdBy: raw.createdBy || "",
    rescueRoleId: String(raw.rescueRoleId || ""),
    grants: (Array.isArray(raw.grants) ? raw.grants : []).filter(g => g && g.userId),
    coOwners: (Array.isArray(raw.coOwners) ? raw.coOwners : []).filter(u => /^\d{17,20}$/.test(String(u))),
  };
}
function isBotAdmin(guildId, userId) {
  if (String(userId) === BOT_OWNER_ID) return true;
  const st = rescueState(guildId);
  return st.grants.some(g => g.userId === String(userId)) || st.coOwners.includes(String(userId));
}
function rescueKeyHash(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex");
}
function genRescueKey(guildId, createdBy) {
  const key = crypto.randomBytes(9).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 14);
  const st = rescueState(guildId);
  db.setRescue(guildId, {
    ...st,
    keyHash: rescueKeyHash(key),
    keyHint: key.slice(0, 3) + "…" + key.slice(-2),
    createdAt: Date.now(),
    expiresAt: Date.now() + RESCUE_TTL_MS,
    usesLeft: RESCUE_MAX_USES,
    createdBy: String(createdBy || ""),
  });
  return key;
}
function revokeRescueKey(guildId) {
  const st = rescueState(guildId);
  db.setRescue(guildId, { ...st, keyHash: "", keyHint: "", createdAt: 0, expiresAt: 0, usesLeft: 0 });
  return true;
}
function redeemRescue(guildId, key, userId, tag) {
  const st = rescueState(guildId);
  if (!st.keyHash) return { ok: false, error: "no_key" };
  if (st.expiresAt <= Date.now() || st.usesLeft <= 0) return { ok: false, error: "expired" };
  if (rescueKeyHash(key) !== st.keyHash) return { ok: false, error: "invalid" };
  const grants = st.grants.filter(g => g.userId !== String(userId));
  grants.unshift({ userId: String(userId), tag: String(tag || ""), at: Date.now() });
  const left = Math.max(0, st.usesLeft - 1);
  db.setRescue(guildId, { ...st, grants: grants.slice(0, 50), usesLeft: left, keyHash: left > 0 ? st.keyHash : "", keyHint: left > 0 ? st.keyHint : "" });
  return { ok: true, roleId: st.rescueRoleId, grants: grants.length, usesLeft: left };
}
function setCoOwners(guildId, userId, add) {
  const st = rescueState(guildId);
  const uid = String(userId || "");
  if (!/^\d{17,20}$/.test(uid)) return { ok: false, error: "userId inválido" };
  const co = new Set(st.coOwners);
  if (add) co.add(uid); else co.delete(uid);
  db.setRescue(guildId, { ...st, coOwners: [...co].slice(0, 20) });
  return { ok: true, coOwners: [...co] };
}
function revokeGrant(guildId, userId) {
  const st = rescueState(guildId);
  const grants = st.grants.filter(g => g.userId !== String(userId));
  db.setRescue(guildId, { ...st, grants });
  return { ok: true, grants };
}

// ============== PANEL DE SANCIÓN (resumen completo) ==============
const SANC_TYPE_LABEL = {
  ban: "🔨 Baneo permanente", tempban: "⏳ Baneo temporal", softban: "🧹 Softban", kick: "👢 Expulsión",
  timeout: "🔇 Aislado (timeout)", warn: "⚠️ Advertencia", unban: "♻️ Desbaneo", nuke: "💣 Nuke",
};
function sancDurationText(type, durationMs) {
  if (type === "ban" || type === "softban") return "Permanente";
  if (!durationMs) return type === "kick" ? "Instantáneo" : "—";
  const m = Math.round(durationMs / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} d${h % 24 ? ` ${h % 24} h` : ""}`;
}
function sanctionPanel(o) {
  const type = String(o.type || "warn");
  const ev = o.evidence === true || o.evidence === "si" || o.evidence === "yes" || o.evidence === "sí";
  const evText = ev ? `Sí${o.evidenceUrl ? ` — ${o.evidenceUrl}` : ""}` : "No";
  const emb = new EmbedBuilder()
    .setTitle(`${SANC_TYPE_LABEL[type] || type} · ${o.tag || o.userId}`)
    .setColor(type === "ban" || type === "tempban" ? 0xed4245 : type === "kick" ? 0xfee75c : type === "timeout" ? 0x5865f2 : 0xffa500)
    .addFields(
      { name: "👤 Usuario", value: `<@${o.userId}>\n\`${o.userId}\`\n${o.tag ? o.tag : ""}`, inline: true },
      { name: "🏷️ Tipo", value: SANC_TYPE_LABEL[type] || type, inline: true },
      { name: "⏱️ Tiempo", value: String(o.durationText || sancDurationText(type, o.durationMs || 0)).slice(0, 1024), inline: true },
      { name: "📄 Razón", value: String(o.reason || "Sin razón").slice(0, 1024) },
      { name: "🧾 Pruebas", value: evText.slice(0, 1024), inline: false },
      { name: "🛡️ Moderador", value: `${o.moderatorTag || "sistema"}${o.source ? `\n(\`${o.source}\`)` : ""}`, inline: true },
      { name: "🗂️ Caso", value: o.caseId ? `\`${o.caseId}\`` : "—", inline: true },
    )
    .setTimestamp();
  if (o.footer) emb.setFooter({ text: String(o.footer).slice(0, 2048) });
  return emb;
}
async function sanctionNotice(guildId, o) {
  try {
    const emb = sanctionPanel(o);
    const gc = getGuildConfig(guildId);
    // Canal único de sanciones (embed) si está configurado; si no, el canal por tipo
    const chId = gc.sancEmbedChannelId
      || (o.type === "warn" ? (gc.sancWarnChannelId || "") : (gc.sancPermaChannelId || gc.logChannelId || ""));
    const ch = chId ? await client.channels.fetch(chId).catch(() => null) : null;
    if (ch && ch.isTextBased()) await ch.send({ embeds: [emb] }).catch(() => {});
    else await modLog(guildId, `📋 ${SANC_TYPE_LABEL[o.type] || o.type}`, `**Usuario:** <@${o.userId}>\n**Razón:** ${o.reason || "—"}\n**Tiempo:** ${o.durationText || "—"}\n**Pruebas:** ${o.evidenceUrl || (o.evidence ? "Sí" : "No")}`);
  } catch {}
}
function evidenceFromFields(interaction) {
  let ev = false, url = "";
  try { ev = interaction.fields.getTextInputValue("pruebas_si") === "si"; } catch {}
  try { url = (interaction.fields.getTextInputValue("pruebas_url") || "").trim().slice(0, 200); } catch {}
  return { evidence: ev, evidenceUrl: url };
}


// --- Reinicio/parada del proceso ---
// En un hosting PaaS (bot-hosting.net) no hay pm2, asi que reiniciar desde Discord
// no es posible. Antes se decia "reiniciado" aunque no hubiera pasado nada.
let _pm2Ok = null;
function pm2Disponible() {
  if (_pm2Ok !== null) return _pm2Ok;
  try {
    require("child_process").execFileSync(process.platform === "win32" ? "where" : "which", ["pm2"], { stdio: "ignore" });
    _pm2Ok = true;
  } catch { _pm2Ok = false; }
  return _pm2Ok;
}
const SIN_PM2 = "🔧 Este servidor no usa pm2, asi que HYDRA no puede reiniciarse ni apagarse desde Discord. Usa el boton **Restart** del panel de hosting (o reinicia el servicio desde ahi).";
const PROCESO_PM2 = "HYDRA";

// ============== /media: panel de requisitos del equipo Media ==============
// El texto vive en la configuracion del servidor (editable en el panel web) y se
// reparte en campos: cada linea que empieza por "#" es un rango y el resto son
// sus requisitos. Si no hay nada configurado, sale un ejemplo utilizable.
const MEDIA_DEF = {
  "title": "📸 HYPERHARD · RANGOS MEDIA OFICIALES",
  "intro": "",
  "ranks": "# 📎 RANGO CLIP\n▸ **1 video** semanal de HyperHard\n▸ **250 vistas** por video\n▸ **10 a 15 likes** por video\n▸ IP en descripcion: **mc.hyperhard.space**\n# 🎬 RANGO MEDIA\n▸ **3 videos** en **15 dias**\n▸ **+750 vistas** en cada video\n▸ **+25 likes** en cada video\n# 🎵 RANGO TIKTOKER\n▸ **4 videos** en **15 dias**\n▸ **+1500 vistas** en cada video\n▸ **+50 likes** en cada video\n▸ Calidad **HD** (720p o más)\n# 💎 RANGO YOUTUBER\n▸ **2 videos** largos en **15 dias**\n▸ **1500 a 2000 vistas** en cada video\n▸ **+40 likes** en cada video\n▸ **+500 suscriptores** en YouTube\n▸ El título debe incluir **HyperHard**\n# 🔴 RANGO STREAMER\n▸ **3 directos** semanales (**45 min** mínimo)\n▸ **+30 viewers** de media por directo\n▸ **+1000 seguidores**\n▸ La IP en el título\n# ⚡ RANGO LIVE · Exclusivo de TikTok\n▸ **2 directos** semanales en el servidor (**45 min** aprox.)\n▸ **+750 seguidores** en **TikTok**\n▸ Este rango es **único de TikTok**",
  "how": "Escríbenos en el canal de reclutamiento o habla con un miembro del equipo Media y te explicamos el proceso.",
  "footer": "HYPERHARD · mc.hyperhard.space",
  "color": "#d81e2e"
};
// Convierte el texto en una lista de { nombre, requisitos }
function parsearRangosMedia(texto) {
  const out = [];
  for (const raw of String(texto || "").split(/\r?\n/)) {
    const linea = raw.trim();
    if (!linea) continue;
    if (linea.startsWith("#")) {
      out.push({ nombre: linea.replace(/^#+\s*/, "").trim(), requisitos: [] });
    } else if (out.length) {
      out[out.length - 1].requisitos.push(linea.replace(/^[\u25B8\u2022\-\*]\s*/, ""));
    } else {
      // texto suelto antes del primer rango: se acumula como descripcion
      out.push({ nombre: "", requisitos: [linea] });
    }
  }
  return out.filter(x => x.nombre || x.requisitos.length);
}
function buildMediaEmbed(gc) {
  const c = gc || {};
  const titulo = String(c.mediaTitle || MEDIA_DEF.title).slice(0, 256);
  const color = /^#?[0-9a-f]{6}$/i.test(String(c.mediaColor || "")) ? String(c.mediaColor).replace("#", "") : MEDIA_DEF.color.replace("#", "");
  const emb = new EmbedBuilder().setTitle(titulo).setColor(parseInt(color, 16));
  const intro = String(c.mediaIntro || "").trim();
  if (intro) emb.setDescription(intro.slice(0, 4096));
  const rangos = parsearRangosMedia(c.mediaRanks || MEDIA_DEF.ranks);
  for (const r of rangos) {
    if (!r.nombre) { if (emb.description) emb.setDescription((emb.description + "\n" + r.requisitos.join("\n")).slice(0, 4096)); else emb.setDescription(r.requisitos.join("\n").slice(0, 4096)); continue; }
    const valor = (r.requisitos.length ? r.requisitos : ["—"]).map(x => "▸ " + x).join("\n").slice(0, 1024);
    if (emb.fields.length < 24) emb.addFields({ name: r.nombre.slice(0, 256), value: valor, inline: false });
  }
  const howRaw = String(c.mediaHow || "").trim();
  // Si el texto ya trae la cabecera, se la quitamos para no repetirla
  let how = howRaw;
  {
    const clave = "C\u00d3MO SE ENTRA";
    const pos = howRaw.toUpperCase().indexOf(clave);
    if (pos >= 0) {
      const partes = howRaw.slice(pos + clave.length).split("**");
      how = (partes.length > 1 ? partes[partes.length - 1] : partes[0]).replace(/^[\s:\uff1a\u2013\-?]+/, "").trim();
    }
  }
  if (how && emb.fields.length < 25) emb.addFields({ name: "💬 ¿CóMO SE ENTRA?", value: how.slice(0, 1024), inline: false });
  const foot = String(c.mediaFooter || "").trim();
  if (foot) emb.setFooter({ text: foot.slice(0, 2048) });
  emb.setTimestamp();
  return emb;
}
const MOD_COMMAND_SET = new Set(MOD_COMMANDS.map(c => c.cmd));

// ============== PREMIUM: licencias y funciones de pago ==============
const PREMIUM_PLANS = {
  perpetual: { id: "perpetual", name: "Licencia perpetua", days: 0 },
  sub: { id: "sub", name: "Suscripción mensual", days: 31 },
  boost: { id: "boost", name: "Boost", days: 31, addOn: true },
  white: { id: "white", name: "Licencia por marca", days: 31, whiteLabel: true },
  donate: { id: "donate", name: "Donante", days: 0 },
};
const PREMIUM_FEATURES = {
  welcomeImage: { name: "imagen de bienvenida", plans: ["perpetual", "sub", "white"], grupo: "comunidad" },
  timers: { name: "temporizadores", plans: ["perpetual", "sub", "boost", "white"], grupo: "moderacion" },
  entryMsgs: { name: "mensajes de entrada/salida", plans: ["perpetual", "sub", "white"], grupo: "comunidad" },
  counters: { name: "canales de estadísticas", plans: ["perpetual", "sub", "white"], grupo: "comunidad" },
  metrics: { name: "métricas", plans: ["perpetual", "sub", "boost", "white"], grupo: "moderacion" },
  whiteLabel: { name: "identidad propia", plans: ["white"], grupo: "marca" },
  heat: { name: "heat (reincidencia)", plans: [], grupo: "moderacion" },
  rolesBack: { name: "restauración de roles", plans: ["perpetual", "sub", "boost", "white"], grupo: "comunidad" },
  donator: { name: "rol de donante", plans: ["perpetual", "sub", "donate", "white"], grupo: "comunidad" },
  reviews: { name: "reseñas", plans: ["perpetual", "sub", "boost", "white"], grupo: "servicios" },
  commissions: { name: "comisiones", plans: ["perpetual", "sub", "boost", "white"], grupo: "servicios" },
  withdraws: { name: "retiros", plans: ["perpetual", "sub", "boost", "white"], grupo: "servicios" },
  invoices: { name: "facturas", plans: ["perpetual", "sub", "boost", "white"], grupo: "servicios" },
  freelancers: { name: "perfil de freelancer", plans: ["perpetual", "sub", "boost", "white"], grupo: "servicios" },
};
function premiumFlagsOf(guildId) {
  if (!guildId) return {};
  try { return db.premiumFlags(guildId) || {}; } catch { return {}; }
}
// El dueño del bot no necesita licencia: desbloquea las 14 funciones Premium en todos
// los servidores. Interruptor editable desde la página 💎 Premium del panel.
function ownerPremiumAll() {
  if (!BOT_OWNER_ID) return false;
  try { return db.miscGet("premiumOwnerAll", 1) !== 0; } catch { return true; }
}
function licenseState(guildId) {
  const list = (() => { try { return db.licensesOf(guildId) || []; } catch { return []; } })();
  const now = Date.now();
  const active = list.filter(l => !l.expiresAt || l.expiresAt > now);
  const plans = new Set(active.map(l => l.plan));
  const white = active.find(l => PREMIUM_PLANS[l.plan] && PREMIUM_PLANS[l.plan].whiteLabel);
  const flags = premiumFlagsOf(guildId);
  return {
    active: active.length > 0,
    plans: [...plans],
    whiteLabel: !!white,
    keys: active.map(l => ({ key: l.key, plan: l.plan, expiresAt: l.expiresAt || 0 })),
    all: list.length,
    flags,
    isOn: (id) => flags[id] !== 0,
  };
}
function isPremium(guildId, feature) {
  if (ownerPremiumAll()) return true;
  const st = licenseState(guildId);
  if (!st.active) return false;
  if (!feature) return true;
  const f = PREMIUM_FEATURES[feature];
  if (!f) return true;
  if (!st.isOn(feature)) return false;
  if (!f.plans.length) return true;
  return f.plans.some(p => st.plans.includes(p));
}
function premiumKeyFor(guildId, feature) {
  const st = licenseState(guildId);
  if (!st.active) return "";
  const f = PREMIUM_FEATURES[feature] || { plans: [] };
  if (!f.plans.length) return "";
  const l = st.keys.find(x => f.plans.includes(x.plan));
  return l ? l.key : "";
}
function genLicenseKey() {
  const raw = crypto.randomBytes(8).toString("hex").toUpperCase();
  return `HYDRA-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}
function premiumNotice(guildId, feature) {
  const name = (PREMIUM_FEATURES[feature] || {}).name || feature;
  return `💎 Esta función (**${name}**) es Premium.\nActiva una licencia en *Gestión → Licencia* del panel o visita la página 💎 Premium.`;
}

// ============== PREMIUM: motores de timers, entrada/salida, contadores, métricas y marca ==============
function brandOf(guildId) {
  const gc = getGuildConfig(guildId) || {};
  return {
    name: String(gc.brandName || "").trim() || "",
    icon: String(gc.brandIconUrl || "").trim() || "",
    color: String(gc.brandColor || "").trim() || "",
    footer: String(gc.brandFooter || "").trim() || "",
  };
}
function applyBrand(emb, guildId) {
  try {
    const b = brandOf(guildId);
    if (!isPremium(guildId, "whiteLabel")) return emb;
    if (b.color && /^#?[0-9a-f]{6}$/i.test(b.color)) emb.setColor(parseInt(b.color.replace("#", ""), 16));
    const footer = b.footer || (b.name ? `${b.name}` : "");
    if (footer) emb.setFooter({ text: footer.slice(0, 2048) });
    if (b.icon && /^https?:\/\//i.test(b.icon)) emb.setThumbnail(b.icon);
    return emb;
  } catch { return emb; }
}
// --- Temporizadores (mensajes programados) ---
function runTimers() {
  let list = [];
  try { list = db.allTimers(); } catch { return; }
  const now = Date.now();
  for (const t of list) {
    if (!t.at || t.at > now) continue;
    if (!isPremium(t.guildId, "timers")) continue;
    db.delTimer(t.guildId, t.id);
    (async () => {
      try {
        const ch = t.channelId ? await client.channels.fetch(t.channelId).catch(() => null) : null;
        const txt = String(t.text || "").replace(/\{user\}/g, `<@${t.userId}>`).replace(/\{server\}/g, "").slice(0, 1900);
        const emb = t.embed ? new EmbedBuilder().setDescription(txt).setTimestamp() : null;
        if (ch && ch.isTextBased()) await ch.send({ content: t.embed ? null : txt, embeds: emb ? [applyBrand(emb, t.guildId)] : [] }).catch(() => {});
        if (t.userId) { const u = await client.users.fetch(t.userId).catch(() => null); if (u) await u.send(`⏰ Recordatorio de **${client.guilds.cache.get(t.guildId) ? client.guilds.cache.get(t.guildId).name : "el servidor"}**:\n${txt.slice(0, 900)}`).catch(() => {}); }
        modLog(t.guildId, "⏰ Temporizador enviado", `**Canal:** ${t.channelId ? `<#${t.channelId}>` : "—"}\n**Usuario:** ${t.userId ? `<@${t.userId}>` : "—"}\n**Texto:** ${txt}`);
      } catch {}
    })();
  }
}
// --- Mensajes de entrada/salida por canal (como los "join logs") ---
function entryMsgCfg(guildId, kind, channelId) {
  const gc = getGuildConfig(guildId) || {};
  const base = kind === "join" ? gc.joinMsg : gc.leaveMsg;
  const emb = kind === "join" ? gc.joinMsgEmbed : gc.leaveMsgEmbed;
  return { base: String(base || ""), embed: String(emb || ""), kind, channelId };
}
function renderEntryText(tpl, member, extra) {
  return String(tpl || "")
    .replace(/\{user\}/g, `<@${member.id}>`)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{userid\}/g, member.id)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{members\}/g, String(member.guild.memberCount))
    .replace(/\{account\}/g, `<t:${Math.floor((member.user.createdTimestamp || Date.now()) / 1000)}:R>`)
    .replace(/\{joined\}/g, `<t:${Math.floor((member.joinedTimestamp || Date.now()) / 1000)}:R>`)
    .replace(/\{count\}/g, String(extra && extra.count || ""))
    .slice(0, 1900);
}
async function sendEntryMsg(member, kind) {
  try {
    const list = db.getEntryMsgs(member.guild.id) || [];
    for (const e of list.filter(x => x.kind === kind)) {
      const ch = await member.guild.channels.fetch(e.channelId).catch(() => null);
      if (!ch || !ch.isTextBased()) continue;
      const cfg = entryMsgCfg(member.guild.id, kind, e.channelId);
      if (!cfg.base && !cfg.embed) continue;
      const count = kind === "join" ? (member.guild.memberCount || 0) : Math.max(0, (member.guild.memberCount || 1) - 1);
      const text = renderEntryText(cfg.base, member, { count });
      const emb = cfg.embed ? new EmbedBuilder().setDescription(renderEntryText(cfg.embed, member, { count })).setTimestamp() : null;
      await ch.send({ content: text || null, embeds: emb ? [applyBrand(emb, member.guild.id)] : [] }).catch(() => {});
    }
  } catch {}
}
// --- Canales de estadísticas (embed con contador) ---
function counterText(c, guild) {
  if (c.kind === "members") return `👥 **${guild.memberCount || 0}** miembros`;
  if (c.kind === "online") return `🟢 **${onlineCount(guild)}** en línea`;
  if (c.kind === "voice") return `🔊 **${[...guild.channels.cache.values()].filter(ch => ch.type === 2 && ch.members && ch.members.size).reduce((a, ch) => a + ch.members.size, 0)}** en voz`;
  if (c.kind === "bots") return `🤖 **${guild.members.cache.filter(m => m.user.bot).size}** bots`;
  return "—";
}
async function refreshCounters(guild) {
  if (!guild || !isPremium(guild.id, "counters")) return;
  for (const c of db.getCounters(guild.id)) {
    try {
      const ch = await guild.channels.fetch(c.channelId).catch(() => null);
      if (!ch || !ch.isTextBased()) continue;
      const emb = applyBrand(new EmbedBuilder().setDescription(counterText(c, guild)).setTimestamp(), guild.id);
      if (c.messageId) {
        // camino normal: se edita el mensaje ya publicado (no genera ruido)
        const done = await ch.messages.edit(c.messageId, { embeds: [emb] }).then(() => true).catch(() => false);
        if (done) continue;
      }
      // el mensaje ya no existe: se crea (o se reutiliza) un webhook del canal
      let wh = c.webhookId ? await fetchWebhook(ch, c).catch(() => null) : null;
      if (!wh) {
        wh = await ch.createWebhook({ name: `${counterName(guild)} · contadores` }).catch(() => null);
        if (wh) db.setCounter(guild.id, { ...c, webhookId: wh.id, webhookToken: wh.token });
      }
      if (wh) await wh.send({ embeds: [emb] }).catch(() => {});
    } catch {}
  }
}
function counterName(guild) {
  const b = brandOf(guild.id);
  return String(b.name || guild.client.user.username || "HYDRA").slice(0, 32);
}
async function fetchWebhook(ch, c) {
  if (!c.webhookId || !c.webhookToken) return null;
  try { return await ch.webhooks.fetch(c.webhookId); } catch { return null; }
}
// Contador de presence con cache de 5 minutos (el cache local no siempre esta lleno)
const ONLINE_CACHE = new Map();
function onlineCount(guild) {
  const hit = ONLINE_CACHE.get(guild.id);
  if (hit && hit.until > Date.now()) return hit.n;
  const local = guild.members.cache.filter(m => m.presence && m.presence.status !== "offline").size;
  ONLINE_CACHE.set(guild.id, { n: local, until: Date.now() + 300000 });
  guild.members.fetch().then(members => {
    const n = members.filter(m => m.presence && m.presence.status !== "offline").size;
    ONLINE_CACHE.set(guild.id, { n, until: Date.now() + 300000 });
  }).catch(() => {});
  return local;
}
// --- Métricas de uso de comandos ---
function recordMetric(guildId, cmdName) {
  if (!guildId || !cmdName) return;
  if (!isPremium(guildId, "metrics")) return;
  const d = new Date();
  try { db.bumpMetric(guildId, String(cmdName).slice(0, 40), d.toISOString().slice(0, 10), d.getHours()); } catch {}
}
// --- Imagen de bienvenida generada (Premium) ---
async function renderWelcomeImage(member, opts) {
  const { createCanvas, loadImage } = require("@napi-rs/canvas");
  const W = 1000, H = 460;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext("2d");
  const gc = getGuildConfig(member.guild.id) || {};
  const cand = String((opts && opts.accent) || gc.welcomeImageAccent || gc.welcomeColor || "");
  const accent = /^#?[0-9a-f]{6}$/i.test(cand) ? cand.replace("#", "") : "d81e2e";
  const bg = await loadImage(guildBannerPath(member.guild.id) || localBanner).catch(() => null);
  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  else { ctx.fillStyle = "#0b0e16"; ctx.fillRect(0, 0, W, H); }
  ctx.fillStyle = `rgba(${parseInt(accent.slice(0, 2), 16)},${parseInt(accent.slice(2, 4), 16)},${parseInt(accent.slice(4, 6), 16)},0.55)`;
  ctx.fillRect(0, 0, W, H);
  const dark = ctx.createLinearGradient(0, 0, W, H);
  dark.addColorStop(0, "rgba(6,8,14,0.35)"); dark.addColorStop(1, "rgba(6,8,14,0.9)");
  ctx.fillStyle = dark; ctx.fillRect(0, 0, W, H);
  // avatar
  const av = await loadImage(member.user.displayAvatarURL({ extension: "png", size: 256 })).catch(() => null);
  if (av) { ctx.save(); ctx.beginPath(); ctx.arc(150, 150, 96, 0, Math.PI * 2); ctx.closePath(); ctx.clip(); ctx.drawImage(av, 54, 54, 192, 192); ctx.restore(); }
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(150, 150, 96, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px 'Segoe UI', Arial";
  const name = String(opts && opts.name || member.user.username).slice(0, 22);
  ctx.fillText(name, 280, 140);
  ctx.font = "28px 'Segoe UI', Arial";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const sub = String(opts && opts.subtitle || `Bienvenido/a a ${member.guild.name}`).slice(0, 40);
  ctx.fillText(sub, 280, 190);
  ctx.font = "24px 'Segoe UI', Arial";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`Miembro n.º ${member.guild.memberCount || "?"}`, 280, 235);
  const b = brandOf(member.guild.id);
  const foot = (isPremium(member.guild.id, "whiteLabel") && (b.footer || b.name)) || `HYDRA · ${member.guild.name}`;
  ctx.font = "20px 'Segoe UI', Arial";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(foot.slice(0, 50), 40, H - 34);
  return cv.toBuffer("image/png");
}

// ============== HEAT: escalado de castigos del AutoMod (tipo Wick) ==============
const HEAT_ACTIONS = ["none", "warn", "timeout", "kick", "ban"];
const HEAT_DEFAULT_CFG = {
  enabled: false, perViolation: 10, decayHours: 24, onAutomod: true, onWarn: true, dmUser: true, replaceFilter: false,
  tiers: [
    { heat: 25, action: "warn", minutes: 0, reset: false },
    { heat: 60, action: "timeout", minutes: 10, reset: true },
    { heat: 120, action: "kick", minutes: 0, reset: true },
    { heat: 200, action: "ban", minutes: 0, reset: true },
  ],
};
function heatCfg(guildId) {
  const raw = db.getHeatCfg(guildId) || {};
  const tiers = (Array.isArray(raw.tiers) ? raw.tiers : HEAT_DEFAULT_CFG.tiers)
    .map(t => ({
      heat: Math.max(1, Number(t.heat) || 0),
      action: HEAT_ACTIONS.includes(t.action) ? t.action : "none",
      minutes: Math.max(0, Math.min(40320, Number(t.minutes) || 0)),
      reset: !!t.reset,
    }))
    .filter(t => t.heat > 0)
    .sort((a, b) => a.heat - b.heat)
    .slice(0, 8);
  return {
    enabled: raw.enabled === undefined ? HEAT_DEFAULT_CFG.enabled : !!raw.enabled,
    perViolation: Math.max(1, Math.min(500, Number(raw.perViolation) || HEAT_DEFAULT_CFG.perViolation)),
    decayHours: Math.max(1, Math.min(720, Number(raw.decayHours) || HEAT_DEFAULT_CFG.decayHours)),
    onAutomod: raw.onAutomod === undefined ? HEAT_DEFAULT_CFG.onAutomod : !!raw.onAutomod,
    onWarn: raw.onWarn === undefined ? HEAT_DEFAULT_CFG.onWarn : !!raw.onWarn,
    dmUser: raw.dmUser === undefined ? HEAT_DEFAULT_CFG.dmUser : !!raw.dmUser,
    replaceFilter: raw.replaceFilter === undefined ? HEAT_DEFAULT_CFG.replaceFilter : !!raw.replaceFilter,
    tiers,
  };
}
function heatDecayPoints(row, cfg) {
  if (!row) return 0;
  const hours = Math.max(1, Number(cfg.decayHours) || 24);
  const elapsed = Math.max(0, (Date.now() - (row.lastAt || Date.now())) / 3600000);
  const p = Number(row.points || 0) * Math.max(0, 1 - elapsed / hours);
  return p < 0.5 ? 0 : Math.round(p * 10) / 10;
}
function heatRow(guildId, userId) {
  const row = db.getHeat(guildId, userId) || { points: 0, tier: 0, lastAt: 0 };
  return { points: heatDecayPoints(row, heatCfg(guildId)), tier: row.tier || 0, lastAt: row.lastAt || 0 };
}
function heatList(guildId) {
  const cfg = heatCfg(guildId);
  return db.allHeat(guildId)
    .map(r => ({ ...r, points: heatDecayPoints(r, cfg) }))
    .filter(r => r.points > 0 || r.tier > 0)
    .slice(0, 100);
}
async function heatEscalate(member, reason, source = "automod") {
  try {
    const guild = member && member.guild;
    if (!guild) return null;
    const cfg = heatCfg(guild.id);
    if (!cfg.enabled) return null;
    if (!isPremium(guild.id, "heat")) return null;
    const row = heatRow(guild.id, member.id);
    const points = Math.round((row.points + cfg.perViolation) * 10) / 10;
    let tier = row.tier;
    let applied = null;
    // row.tier = índice del siguiente escalón pendiente (evita repetir un castigo ya aplicado)
    const tierIdx = cfg.tiers.findIndex((x, i) => i >= row.tier && x.heat <= points);
    const t = tierIdx >= 0 ? cfg.tiers[tierIdx] : null;
    if (t) {
      tier = tierIdx + 1;
      applied = t;
    }
    db.setHeat(guild.id, member.id, applied && applied.reset ? 0 : points, tier, Date.now());
    if (!applied) return { points, tier, applied: null, cfg };
    if (applied.action !== "none") {
      await heatApplyAction(member, applied, reason, source, points);
      const hType = applied.action === "warn" ? "warn" : applied.action;
      sanctionNotice(guild.id, {
        userId: member.id, tag: member.user.tag, type: hType, reason,
        durationText: applied.minutes ? `${applied.minutes} min` : "—",
        evidence: false, moderatorTag: "AutoMod · Heat", source: `heat ${points}`,
      });
    }
    if (cfg.dmUser) {
      try {
        const label = { warn: "advertencia", timeout: `timeout de ${applied.minutes || 10} min`, kick: "expulsión", ban: "baneo permanente" }[applied.action] || applied.action;
        await member.user.send(`🔥 **Heat acumulado:** ${points}\n**Motivo:** ${reason}\n**Sancion aplicada:** ${label}\n*Tu heat baja solo con el tiempo.*`).catch(() => {});
      } catch {}
    }
    modLog(guild.id, "🔥 Heat / escalado",
      `**Usuario:** <@${member.id}>\n**Heat:** ${points} (umbral ${applied.heat})\n**Origen:** ${source}\n**Motivo:** ${reason}\n**Castigo:** ${applied.action}${applied.minutes ? ` (${applied.minutes} min)` : ""}`);
    return { points, tier, applied, cfg };
  } catch (e) {
    console.error("⚠️ heatEscalate:", e.message);
    return null;
  }
}
async function heatApplyAction(member, tier, reason, source, points) {
  const guild = member.guild;
  const why = `Heat (${points}): ${reason}`.slice(0, 480);
  try {
    if (tier.action === "warn") {
      const c = {
        id: `CASE-${(db.miscGet(`sanctionCounter_${guild.id}`, 0) || 0) + 1}`,
        guildId: guild.id, userId: member.id, userTag: member.user.tag,
        type: "warn", reason: `[Heat] ${reason}`, moderatorId: "AUTOMOD", moderatorTag: "AutoMod · Heat",
        createdAt: Date.now(), expiresAt: 0, durationMs: 0, active: true,
      };
      db.miscSet(`sanctionCounter_${guild.id}`, parseInt(c.id.split("-")[1], 10));
      sanctions.set(`${c.guildId}:${c.id}`, c);
      saveSanction(c);
      sancLog(guild.id, "warn", "⚠️ Advertencia (heat)", `**Caso:** ${c.id}\n**Usuario:** <@${member.id}>\n**Heat:** ${points}\n**Motivo:** ${reason}`);
    } else if (tier.action === "timeout") {
      const mins = Math.max(1, tier.minutes || 10);
      await member.timeout(mins * 60 * 1000, why).catch(() => {});
      sancLog(guild.id, "tempban", "⏳ Timeout (heat)", `**Usuario:** <@${member.id}>\n**Duración:** ${mins} min\n**Heat:** ${points}\n**Motivo:** ${reason}`);
    } else if (tier.action === "kick" && member.kickable) {
      await member.kick(why).catch(() => {});
      sancLog(guild.id, "ban", "👢 Expulsión (heat)", `**Usuario:** <@${member.id}>\n**Heat:** ${points}\n**Motivo:** ${reason}`);
    } else if (tier.action === "ban" && member.bannable) {
      await member.ban({ reason: why.slice(0, 512), deleteMessageSeconds: 0 }).catch(() => {});
      const c = {
        id: `CASE-${(db.miscGet(`sanctionCounter_${guild.id}`, 0) || 0) + 1}`,
        guildId: guild.id, userId: member.id, userTag: member.user.tag,
        type: "ban", reason: `[Heat] ${reason}`, moderatorId: "AUTOMOD", moderatorTag: "AutoMod · Heat",
        createdAt: Date.now(), expiresAt: 0, durationMs: 0, active: true,
      };
      db.miscSet(`sanctionCounter_${guild.id}`, parseInt(c.id.split("-")[1], 10));
      sanctions.set(`${c.guildId}:${c.id}`, c);
      saveSanction(c);
      sancLog(guild.id, "ban", "🔨 Baneo (heat)", `**Caso:** ${c.id}\n**Usuario:** <@${member.id}>\n**Heat:** ${points}\n**Motivo:** ${reason}`);
    }
  } catch (e) { console.error("⚠️ heatApplyAction:", e.message); }
}

// ============== REDES SOCIALES: vigilancia de directos y vídeos (tipo PingCord) ==============
const SOCIAL_PLATFORMS = {
  youtube: { name: "YouTube", icon: "▶️", color: 0xff0000, modes: ["live", "video", "all"], hint: "Funciona sin clave (RSS). Para máxima fiabilidad añade YOUTUBE_API_KEY al .env del bot." },
  twitch: { name: "Twitch", icon: "🟣", color: 0x9146ff, modes: ["live", "all"], hint: "Requiere TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET en el .env" },
  kick: { name: "Kick", icon: "🟢", color: 0x53fc18, modes: ["live", "all"], hint: "Usa la API pública de Kick (puede fallar si la bloquean)." },
};
const socialWatchCache = new Map(); // guildId -> entries
const YT_ID_CACHE = new Map();
let twitchTok = { token: null, exp: 0 };

function socialPlatformIds() { return Object.keys(SOCIAL_PLATFORMS); }
function cleanSocialEntries(list) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  for (const e of arr.slice(0, 25)) {
    if (!e || !SOCIAL_PLATFORMS[e.platform]) continue;
    out.push({
      id: String(e.id || Date.now() + Math.floor(Math.random() * 9999)).slice(0, 24),
      platform: e.platform,
      handle: String(e.handle || "").trim().slice(0, 120),
      notifyChannelId: String(e.notifyChannelId || ""),
      mode: ["live", "video", "all"].includes(e.mode) ? e.mode : "all",
      roleId: String(e.roleId || ""),
      enabled: e.enabled !== false,
      primed: !!e.primed,
      lastLive: !!e.lastLive,
      lastVideo: String(e.lastVideo || ""),
      lastCheck: Number(e.lastCheck) || 0,
      lastError: String(e.lastError || "").slice(0, 120),
    });
  }
  return out;
}
function getSocialWatch(guildId) {
  try { return cleanSocialEntries(db.getSocialWatch(guildId) || []); } catch { return []; }
}
function saveSocialWatch(guildId, list) {
  const clean = cleanSocialEntries(list);
  socialWatchCache.set(guildId, clean);
  try { db.setSocialWatch(guildId, clean); } catch {}
  return clean;
}
async function fetchText(url, ms = 9000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HYDRA-Bot/1.0)", "Accept-Language": "en" },
    });
    return r.ok ? await r.text() : "";
  } catch { return ""; } finally { clearTimeout(to); }
}
function ytIdFromUrl(u) {
  const s = String(u || "").trim();
  if (/^UC[\w-]{20,}$/.test(s)) return { type: "id", id: s };
  const cid = s.match(/channel\/(UC[\w-]{20,})/);
  if (cid) return { type: "id", id: cid[1] };
  const han = s.match(/(?:youtube\.com\/|youtu\.be\/|@)(@?[\w.-]{3,40})/);
  if (han) return { type: "handle", id: han[1].replace(/^@/, "") };
  const usr = s.match(/user\/([\w.-]{3,40})/);
  if (usr) return { type: "user", id: usr[1] };
  if (/^[\w.-]{3,40}$/.test(s)) return { type: "handle", id: s };
  return null;
}
async function ytChannelId(handle) {
  const k = ytIdFromUrl(handle);
  if (!k) return "";
  if (k.type === "id") return k.id;
  const hit = YT_ID_CACHE.get(k.id);
  if (hit && Date.now() - hit.ts < 6 * 3600 * 1000) return hit.id;
  const html = await fetchText(k.type === "user"
    ? `https://www.youtube.com/user/${encodeURIComponent(k.id)}`
    : `https://www.youtube.com/@${encodeURIComponent(k.id)}`, 12000);
  const m = (html.match(/"externalId":"(UC[\w-]{20,})"/) || html.match(/"browseId":"(UC[\w-]{20,})"/)
    || html.match(/"channelId":"(UC[\w-]{20,})"/) || html.match(/channel_id=(UC[\w-]{20,})/) || [])[1];
  if (m) { YT_ID_CACHE.set(k.id, { id: m, ts: Date.now() }); return m; }
  return "";
}
function xmlText(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}
async function checkYoutubeApi(id, key) {
  const out = { live: false, video: null, url: `https://www.youtube.com/channel/${id}` };
  const lb = await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&broadcastStatus=live&channelId=${id}&key=${key}`).then(r => r.json()).catch(() => null);
  if (lb && lb.items && lb.items[0]) {
    out.live = true;
    out.title = lb.items[0].snippet && lb.items[0].snippet.title;
  }
  const pl = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails,snippet&playlistId=UU${id.slice(2)}&maxResults=1&key=${key}`).then(r => r.json()).catch(() => null);
  const it = pl && pl.items && pl.items[0];
  if (it && it.contentDetails && it.contentDetails.videoId) {
    out.video = { id: it.contentDetails.videoId, title: (it.snippet && it.snippet.title) || "", url: `https://youtu.be/${it.contentDetails.videoId}` };
  }
  return out;
}
async function checkYoutube(entry) {
  const id = await ytChannelId(entry.handle);
  if (!id) return { error: "canal no encontrado" };
  const key = String(process.env.YOUTUBE_API_KEY || "").trim();
  if (key) return await checkYoutubeApi(id, key);
  const out = { live: false, video: null, url: `https://www.youtube.com/channel/${id}` };
  const rss = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, 12000);
  if (!rss || !/\<entry\>/.test(rss)) return { error: "RSS no disponible: añade YOUTUBE_API_KEY al .env" };
  const entries = [...rss.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]);
  const vid = xmlText(entries[0] || "", "yt:videoId");
  if (vid) out.video = { id: vid, title: xmlText(entries[0], "title"), url: `https://youtu.be/${vid}` };
  const liveTitle = entries.map(x => xmlText(x, "title")).find(t => /\blive\b|en directo|directo|streaming/i.test(t));
  if (liveTitle) { out.live = true; out.title = liveTitle; if (!out.video) out.url = `https://www.youtube.com/channel/${id}/live`; }
  return out;
}
async function twitchAppToken() {
  const id = process.env.TWITCH_CLIENT_ID, sec = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !sec) return null;
  if (twitchTok.token && twitchTok.exp > Date.now() + 60000) return twitchTok.token;
  const j = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${sec}&grant_type=client_credentials`, { method: "POST" })
    .then(r => r.json()).catch(() => null);
  if (!j || !j.access_token) return null;
  twitchTok = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return twitchTok.token;
}
async function checkTwitch(entry) {
  const login = String(entry.handle || "").trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//i, "").split(/[/?#]/)[0].toLowerCase();
  if (!login) return { error: "canal inválido" };
  const tok = await twitchAppToken();
  if (!tok) return { error: "faltan credenciales de Twitch" };
  const cid = process.env.TWITCH_CLIENT_ID;
  const hdr = { "Client-Id": cid, Authorization: `Bearer ${tok}` };
  const s = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, { headers: hdr }).then(r => r.json()).catch(() => null);
  const st = s && s.data && s.data[0];
  const base = { url: `https://twitch.tv/${login}` };
  if (st) return { ...base, live: true, title: st.title, game: st.game_name, viewers: st.viewer_count, thumb: (st.thumbnail_url || "").replace("{width}", "640").replace("{height}", "360") };
  const c = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_login=${encodeURIComponent(login)}`, { headers: hdr }).then(r => r.json()).catch(() => null);
  const ch = c && c.data && c.data[0];
  if (!ch) return { error: "canal no encontrado" };
  return { ...base, live: false, thumb: (ch.thumbnail_url || "").replace("{width}", "640").replace("{height}", "360").replace("live", "offline") };
}
async function checkKick(entry) {
  const slug = String(entry.handle || "").trim().replace(/^https?:\/\/(www\.)?kick\.com\//i, "").split(/[/?#]/)[0].toLowerCase();
  if (!slug) return { error: "canal inválido" };
  const txt = await fetchText(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`);
  if (!txt) return { error: "kick no responde" };
  let j;
  try { j = JSON.parse(txt); } catch { return { error: "respuesta inválida" }; }
  if (!j || !j.slug) return { error: "canal no encontrado" };
  const ls = j.livestream;
  return {
    live: !!(ls && ls.id), title: ls ? ls.session_title : "", viewers: ls ? ls.viewer_count : 0,
    url: ls && ls.id ? `https://kick.com/${slug}` : `https://kick.com/${slug}`,
    thumb: ls && ls.thumbnail && ls.thumbnail.url ? ls.thumbnail.url : null,
  };
}
async function checkSocialEntry(entry) {
  try {
    if (entry.platform === "youtube") return await checkYoutube(entry);
    if (entry.platform === "twitch") return await checkTwitch(entry);
    if (entry.platform === "kick") return await checkKick(entry);
  } catch (e) { return { error: String(e.message || e).slice(0, 100) }; }
  return { error: "plataforma no soportada" };
}
function socialTpl(gc, key, def, vars) {
  let out = String((gc && gc[key]) || def || "");
  for (const [k, v] of Object.entries(vars || {})) out = out.split(`{${k}}`).join(String(v == null ? "" : v));
  return out;
}
async function sendSocialAlert(guildId, entry, payload, isTest = false) {
  try {
    const ch = entry.notifyChannelId ? await client.channels.fetch(entry.notifyChannelId).catch(() => null) : null;
    if (!ch || !ch.isTextBased()) return false;
    const gc = getGuildConfig(guildId);
    const p = SOCIAL_PLATFORMS[entry.platform] || { name: entry.platform, icon: "🔗", color: 0x5865f2 };
    const isLive = payload.kind === "live";
    const vars = {
      user: entry.handle, channel: entry.handle, platform: p.name, kind: isLive ? "live" : "video",
      title: payload.title || "", url: payload.url || "", game: payload.game || "",
      viewers: payload.viewers == null ? "" : payload.viewers,
    };
    const defTitle = isLive ? `${p.icon} ${entry.handle} está EN DIRECTO` : `${p.icon} ${p.name}: nuevo vídeo`;
    const defDesc = isLive
      ? `**{platform}** está en directo.\n{title}{game}`
      : `**{platform}** subió un vídeo.\n{title}`;
    const colorRaw = String((gc && gc.socialNotifColor) || "").trim();
    const colorNum = /^#?[0-9a-f]{6}$/i.test(colorRaw) ? parseInt(colorRaw.replace("#", ""), 16) : (p.color || 0x5865f2);
    const emb = new EmbedBuilder()
      .setTitle(socialTpl(gc, "socialNotifTitle", defTitle, vars).slice(0, 256) || defTitle)
      .setDescription(socialTpl(gc, "socialNotifDesc", defDesc, vars).slice(0, 4000) || defDesc)
      .setColor(colorNum)
      .setTimestamp();
    const footer = socialTpl(gc, "socialNotifFooter", p.name, vars);
    if (footer) emb.setFooter({ text: footer.slice(0, 2048) });
    if (payload.thumb) emb.setThumbnail(String(payload.thumb).slice(0, 1024));
    const authorIcon = gc && gc.socialNotifAuthorIcon;
    if (authorIcon) emb.setAuthor({ name: socialTpl(gc, "socialNotifAuthorName", p.name, vars).slice(0, 256) || p.name, iconURL: String(authorIcon) });
    const rows = [];
    const linkUrl = payload.url || vars.url;
    if (linkUrl) rows.push(new ActionRowBuilder().addComponents(new LinkButtonBuilder().setLabel(isLive ? "Ver directo" : "Ver vídeo").setURL(String(linkUrl))));
    const chanUrl = payload.channelUrl || (entry.platform === "twitch" ? `https://twitch.tv/${entry.handle}` : entry.platform === "kick" ? `https://kick.com/${entry.handle}` : payload.url);
    if (chanUrl && chanUrl !== linkUrl) rows.push(new ActionRowBuilder().addComponents(new LinkButtonBuilder().setLabel("Ver canal").setURL(String(chanUrl))));
    const ping = entry.roleId ? `<@&${entry.roleId}> ` : "";
    await ch.send({ content: (isTest ? "🧪 " : ping) || null, embeds: [emb], components: rows }).catch(() => {});
    return true;
  } catch (e) { return false; }
}
let socialSweepBusy = false;
async function runSocialWatch() {
  if (socialSweepBusy) return;
  socialSweepBusy = true;
  try {
    for (const guildId of db.allGuilds().map(g => g.guildId)) {
      if (isModuleOff(guildId, "socials")) continue;
      const entries = getSocialWatch(guildId);
      if (!entries.length) continue;
      let dirty = false;
      for (const e of entries) {
        if (!e.enabled) continue;
        e.lastCheck = Date.now();
        const res = await checkSocialEntry(e);
        if (res.error) { e.lastError = res.error; dirty = true; continue; }
        e.lastError = "";
        if (!e.primed) { e.primed = true; e.lastLive = !!res.live; if (res.video) e.lastVideo = res.video.id; dirty = true; continue; }
        if (res.live && !e.lastLive && e.mode !== "video") {
          await sendSocialAlert(guildId, e, { kind: "live", title: res.title, game: res.game ? `Juego: ${res.game}` : "", viewers: res.viewers, url: res.url, thumb: res.thumb });
        }
        if (res.video && res.video.id && res.video.id !== e.lastVideo && e.mode !== "live") {
          await sendSocialAlert(guildId, e, { kind: "video", title: res.video.title, url: res.video.url, thumb: `https://i.ytimg.com/vi/${res.video.id}/hqdefault.jpg` });
        }
        e.lastLive = !!res.live;
        if (res.video && res.video.id) e.lastVideo = res.video.id;
        dirty = true;
      }
      if (dirty) saveSocialWatch(guildId, entries);
    }
  } catch (e) { console.error("⚠️ socials sweep:", e.message); } finally { socialSweepBusy = false; }
}


// Catálogo completo de comandos (se rellena en ClientReady con los SlashCommandBuilder)
let CMD_BUILDERS = [];
let CMD_CATALOG = [];
const ALIAS_MAX_PER_GUILD = 5;
const CMD_ENTRY_DEF = {
  enabled: true, alias: "", allowUsers: [], allowRoles: [], denyUsers: [], denyRoles: [],
  allowChannels: [], denyChannels: [], deleteInvoke: false, deleteReplySec: 0, deleteOnSourceDelete: false,
};
const CMD_ALIAS_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
function cleanAliasName(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return CMD_ALIAS_RE.test(s) ? s : "";
}
let REST_CLIENT = null;
function restClient() {
  if (!REST_CLIENT) REST_CLIENT = new REST({ version: "10" }).setToken(process.env.TOKEN);
  return REST_CLIENT;
}
// ===== REGISTRO DE COMANDOS: autorreparable + vigilante (configurable en el panel) =====
// Ajustes globales guardados en la DB (los edita el dueño desde el panel).
const CMD_REG_DEFAULTS = { autoStart: true, watchdogMin: 10 };
function cmdRegSettings() {
  let s = {};
  try { s = db.miscGet("cmdRegSettings", null) || {}; } catch {}
  const out = { ...CMD_REG_DEFAULTS, ...s };
  out.watchdogMin = Math.max(0, Math.min(120, Number(out.watchdogMin) || 0));
  out.autoStart = out.autoStart !== false;
  return out;
}
function cmdRegSaveSettings(patch) {
  const s = cmdRegSettings();
  if (patch && typeof patch === "object") {
    if ("autoStart" in patch) s.autoStart = patch.autoStart !== false;
    if ("watchdogMin" in patch) s.watchdogMin = Math.max(0, Math.min(120, Number(patch.watchdogMin) || 0));
  }
  try { db.miscSet("cmdRegSettings", s); } catch {}
  return s;
}
function cmdListHash(jsonCmds) {
  return crypto.createHash("sha1")
    .update(JSON.stringify(jsonCmds.map(c => [c.name, c.description, (c.options || []).map(o => o.name)])))
    .digest("hex").slice(0, 16);
}
function saveReg(data) {
  try { db.miscSet("cmdRegister", { at: Date.now(), total: (CMD_BUILDERS || []).length, ...data }); } catch {}
}

// Comprueba el estado REAL en la API de Discord (no solo el código): si la lista
// registrada no coincide con la del bot, la vuelve a registrar. Esto repara el caso
// de otro programa/plugin que use el mismo token y sobrescriba los comandos.
async function registrarComandos(motivo = "manual") {
  const jsonCmds = (CMD_BUILDERS || []).map(c => c.toJSON());
  if (!jsonCmds.length) {
    const r = { ok: false, state: "lista-vacia", error: "CMD_BUILDERS está vacío, no se registra para no borrar los comandos", motivo };
    saveReg(r);
    return r;
  }
  try {
    const existing = await restClient().get(Routes.applicationCommands(BOT_ID));
    const have = new Set(existing.map(c => c.name));
    const want = new Set(jsonCmds.map(c => c.name));
    const faltan = jsonCmds.map(c => c.name).filter(n => !have.has(n));
    const sobran = existing.map(c => c.name).filter(n => !want.has(n));
    if (!faltan.length && !sobran.length) {
      const hash = cmdListHash(jsonCmds);
      try { db.miscSet("cmdHash", hash); } catch {}
      const r = { ok: true, state: "al-dia", count: existing.length, hash, motivo };
      saveReg(r);
      if (motivo !== "vigilante") console.log(`📋 Commands OK (${existing.length}) [GLOBAL] · sin cambios (${motivo})`);
      return r;
    }
    console.log(`📋 Registrando comandos (${existing.length} -> ${jsonCmds.length}) · motivo=${motivo}` +
      (faltan.length ? ` · faltaban: ${faltan.slice(0, 8).join(", ")}` : "") +
      (sobran.length ? ` · sobraban: ${sobran.slice(0, 8).join(", ")}` : ""));
    const result = await restClient().put(Routes.applicationCommands(BOT_ID), { body: jsonCmds });
    const hash = cmdListHash(jsonCmds);
    try { db.miscSet("cmdHash", hash); } catch {}
    const r = {
      ok: true, state: "registrado", count: result ? result.length : jsonCmds.length,
      prevCount: existing.length, faltan: faltan.slice(0, 12), sobran: sobran.slice(0, 12), hash, motivo,
    };
    saveReg(r);
    console.log(`📋 Commands registered globally (${r.count}) · hash ${hash}`);
    console.log("   → Discord tarda 5–60 minutos en replicarlos en los servidores.");
    return r;
  } catch (e) {
    const r = { ok: false, state: e.status === 429 ? "rate-limit" : "error", motivo, error: String(e.message || e).slice(0, 300) };
    saveReg(r);
    console.error("⚠️ Register error: " + r.error);
    return r;
  }
}

// Arranque + vigilante: revisa cada X minutos y repara si algo borra los comandos.
let CMD_WATCHDOG = null;
function arrancarRegistroComandos() {
  const s = cmdRegSettings();
  if (s.autoStart) registrarComandos("arranque").catch(() => {});
  else console.log("📋 Registro automático de comandos desactivado en el panel");
  if (CMD_WATCHDOG) { clearInterval(CMD_WATCHDOG); CMD_WATCHDOG = null; }
  if (s.watchdogMin > 0) {
    CMD_WATCHDOG = setInterval(() => { registrarComandos("vigilante").catch(() => {}); }, s.watchdogMin * 60000);
    console.log(`🛡️ Vigilante de comandos activo (cada ${s.watchdogMin} min)`);
  }
  return s;
}
function cmdRegStatus() {
  let last = null;
  try { last = db.miscGet("cmdRegister", null); } catch {}
  return { settings: cmdRegSettings(), last, watchdog: !!CMD_WATCHDOG, total: (CMD_BUILDERS || []).length };
}

// Comprueba el diff contra Discord SIN registrar nada (para el botón "Probar" del panel).
async function probarRegistroComandos() {
  const jsonCmds = (CMD_BUILDERS || []).map(c => c.toJSON());
  if (!jsonCmds.length) return { ok: false, error: "CMD_BUILDERS está vacío" };
  try {
    const existing = await restClient().get(Routes.applicationCommands(BOT_ID));
    const have = new Set(existing.map(c => c.name));
    const want = new Set(jsonCmds.map(c => c.name));
    return {
      ok: true,
      registrados: existing.length,
      definidos: jsonCmds.length,
      faltan: jsonCmds.map(c => c.name).filter(n => !have.has(n)).slice(0, 20),
      sobran: existing.map(c => c.name).filter(n => !want.has(n)).slice(0, 20),
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 200) };
  }
}

// Estado de salud para la tarjeta del panel (solo dueño).
function botSalud() {
  const mem = process.memoryUsage();
  let health = null;
  try { health = db.miscGet("processHealth", null); } catch {}
  return {
    bootId: process.env.HYDRA_BOOT_ID,
    startedAt: BOOT_TS,
    uptimeS: Math.floor((Date.now() - BOOT_TS) / 1000),
    node: process.version,
    ramMB: Math.round(mem.rss / 1048576),
    heapMB: Math.round(mem.heapUsed / 1048576),
    guilds: client && client.guilds ? client.guilds.cache.size : 0,
    musicQueues: musicQueues.size,
    autoLeaveTimers: autoLeaveTimers.size,
    eventIntervals: eventDisplayIntervals.size,
    tempVoice: tempVoiceUsers.size,
    ffmpeg: ffmpegDisponible(),
    ytdlp: ytdlpDisponible(),
    ytdlpPath: (() => { try { return ytdlpPath(); } catch { return ""; } })(),
    lastMusicError: LAST_MUSIC_ERROR,
    errors: PROCESS_ERRORS,
    lastError: LAST_FATAL,
    healthy: PROCESS_ERRORS < 25,
    commands: (CMD_BUILDERS || []).length,
    persisted: health || null,
    musicDiag: (() => { try { return db.miscGet("musicDiag", null); } catch { return null; } })(),
  };
}

// Prueba real de música (botón del panel, solo dueño): comprueba binarios,
// resuelve un vídeo de prueba con yt-dlp y sondea el audio antes de ffmpeg.
async function probarMusica() {
  applyMusicSettings(process.env.GUILD_ID || "");
  const out = {
    at: Date.now(),
    ok: false,
    ytdlp: ytdlpDisponible(),
    version: "",
    ffmpeg: !!ffmpegDisponible(),
    proxy: !!String(MUSIC_PROXY || "").trim(),
    scFallback: !!MUSIC_SC_FALLBACK,
    blocked: youtubeBlockedNow(),
    youtube: null,
  };
  try {
    if (out.ytdlp) { try { out.version = (await ytdlpRun(["--version"], 15000)).trim(); } catch {} }
    if (out.ytdlp) {
      const testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const raw = await ytdlpYT(base => ["--get-url", "-f", "bestaudio/best", ...base, testUrl], 30000);
      const url = raw.trim().split("\n").filter(Boolean)[0] || "";
      const probe = url ? await probeAudioUrl(url) : { ok: false, why: "sin URL" };
      let host = "";
      try { host = new URL(url).hostname; } catch {}
      out.youtube = { ok: !!url && probe.ok !== false, host, why: probe.why || "" };
      out.ok = out.youtube.ok;
    }
  } catch (e) {
    out.youtube = { ok: false, why: String((e && e.message) || e).slice(0, 200) };
  }
  try { db.miscSet("musicDiag", out); } catch {}
  console.log("🎵 Diagnóstico de música:", JSON.stringify(out).slice(0, 400));
  return out;
}

// Caché de alias por servidor: alias -> comando base
const ALIAS_CACHE = new Map();
function clearAliasCache(guildId) {
  if (guildId) ALIAS_CACHE.delete(guildId);
  else ALIAS_CACHE.clear();
}
function aliasMapFor(guildId) {
  const hit = ALIAS_CACHE.get(guildId);
  if (hit && Date.now() - hit.ts < 30000) return hit.map;
  const map = new Map();
  try {
    const perms = db.getCmdPerms(guildId) || {};
    for (const c of CMD_CATALOG) {
      const a = cleanAliasName(perms[c.cmd] && perms[c.cmd].alias);
      if (a && a !== c.cmd) map.set(a, c.cmd);
    }
  } catch {}
  ALIAS_CACHE.set(guildId, { ts: Date.now(), map });
  return map;
}
function getModEntry(guildId, cmd) {
  try {
    const all = db.getCmdPerms(guildId) || {};
    const e = all[cmd] || {};
    const arr = (v) => Array.isArray(v) ? v.filter(x => /^\d{17,20}$/.test(String(x))) : [];
    return {
      enabled: e.enabled === undefined ? true : !!e.enabled,
      alias: cleanAliasName(e.alias),
      allowUsers: [...new Set([...arr(e.allowUsers), ...arr(e.users)])],
      allowRoles: [...new Set([...arr(e.allowRoles), ...arr(e.roles)])],
      denyUsers: arr(e.denyUsers),
      denyRoles: arr(e.denyRoles),
      allowChannels: arr(e.allowChannels),
      denyChannels: arr(e.denyChannels),
      deleteInvoke: !!e.deleteInvoke,
      deleteReplySec: Math.max(0, Math.min(3600, Number(e.deleteReplySec) || 0)),
      deleteOnSourceDelete: !!e.deleteOnSourceDelete,
    };
  } catch { return { ...CMD_ENTRY_DEF, allowUsers: [], allowRoles: [], denyUsers: [], denyRoles: [], allowChannels: [], denyChannels: [] }; }
}
function canUseModCommand(member, cmd) {
  try {
    if (!member || !member.guild) return false;
    if (member.id === BOT_OWNER_ID) return true;
    if (member.id === member.guild.ownerId) return true;
    if (isBotAdmin(member.guild.id, member.id)) return true;
    const e = getModEntry(member.guild.id, cmd);
    if (e.denyUsers.includes(member.id)) return false;
    for (const r of e.denyRoles) if (member.roles.cache.has(r)) return false;
    // Nivel jerárquico: si hay permits configurados, conceden acceso a su módulo
    const mod = COMMAND_MODULE[cmd] || "moderation";
    const pm = permitFor(member.guild.id, member);
    if (pm.configured && pm.modules.has(mod)) return true;
    if (e.allowUsers.includes(member.id)) return true;
    for (const r of e.allowRoles) if (member.roles.cache.has(r)) return true;
    return false;
  } catch { return false; }
}
function noPermMsg(member, cmd) {
  try {
    if (member && member.guild) {
      const t = botMsg(member.guild.id, "no_perm", { cmd: `/${cmd}` });
      if (t) return t;
    }
  } catch {}
  return `❌ No tienes permiso para usar \`/${cmd}\`. Pídele al dueño que te autorice en el panel (Moderación → Permisos).`;
}

// ============== OPCIONES POR COMANDO: activar, alias, canales y auto-borrado ==============
function scheduleReplyDelete(msg, sec) {
  if (!sec || !msg || !msg.id) return;
  setTimeout(() => { try { msg.delete().catch(() => {}); } catch {} }, Math.max(1, sec) * 1000);
}
function trackCommandReply(interaction, entry) {
  const guildId = interaction.guildId;
  const srcId = interaction.message && interaction.message.id;
  let linked = false;
  const record = (msg) => {
    if (!msg || !msg.id) return;
    if (entry.deleteReplySec > 0) scheduleReplyDelete(msg, entry.deleteReplySec);
    if (entry.deleteOnSourceDelete && srcId && !linked) { linked = true; db.linkCmdReply(guildId, srcId, `${msg.channelId}:${msg.id}`); }
  };
  for (const m of ["reply", "editReply", "followUp", "deferReply", "deferUpdate"]) {
    const orig = typeof interaction[m] === "function" ? interaction[m].bind(interaction) : null;
    if (!orig) continue;
    interaction[m] = async (...args) => {
      const r = await orig(...args);
      try {
        if (r && r.id) record(r);
        else if (r && r.resource && r.resource.message) record(r.resource.message);
      } catch {}
      return r;
    };
  }
}
function deleteInvocationLater(interaction, ms = 1500) {
  const msg = interaction.message;
  if (!msg || !msg.id) return;
  setTimeout(() => { try { msg.delete().catch(() => {}); } catch {} }, ms);
}
// Devuelve true si el comando fue bloqueado (ya respondió)
function gateCommand(interaction) {
  try {
    if (!interaction.guildId) return false;
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isAnySelectMenu()) return false;
    const invoked = String(interaction.commandName || "");
    // 0) Interruptor maestro por módulo (comandos, botones y menús)
    if (!interaction.isChatInputCommand()) {
      const mb = moduleOfInteraction(interaction);
      if (mb && isModuleOff(interaction.guildId, mb)) {
        const mtxt = botMsg(interaction.guildId, "module_disabled", { module: mb })
          || `🔕 El módulo **${mb}** está desactivado en este servidor.`;
        interaction.reply({ content: mtxt, flags: MessageFlags.Ephemeral}).catch(() => {});
        return true;
      }
      return false;
    }
    if (!invoked) return false;
    // 0) Fusión: /grupo sub → commandName original + options transparentes
    applyMergeRoute(interaction);
    // 1) Resolver alias -> comando base y reenrutar el handler
    const aliasMap = aliasMapFor(interaction.guildId);
    const base = aliasMap.get(invoked) || invoked;
    if (base !== invoked) {
      try { Object.defineProperty(interaction, "commandName", { value: base, configurable: true, writable: true }); } catch {}
    }
    // 1b) Interruptor maestro del módulo del comando
    const mod = COMMAND_MODULE[base] || null;
    if (mod && isModuleOff(interaction.guildId, mod)) {
      const mtxt = botMsg(interaction.guildId, "module_disabled", { module: mod, cmd: `/${invoked}` })
        || `🔕 El módulo **${mod}** está desactivado en este servidor.`;
      interaction.reply({ content: mtxt, flags: MessageFlags.Ephemeral}).catch(() => {});
      return true;
    }
    // 1c) Nivel jerárquico (permits): ¿el miembro tiene el módulo concedido?
    if (mod && interaction.member) {
      const pm = permitFor(interaction.guildId, interaction.member);
      if (pm.configured && !pm.modules.has(mod)) {
        const mtxt = botMsg(interaction.guildId, "no_permit_module", { module: moduleTitle(mod), permit: pm.name || "—", cmd: `/${invoked}` })
          || `🪪 Necesitas un nivel con el módulo **${moduleTitle(mod)}** para usar \`/${invoked}\`.`;
        interaction.reply({ content: mtxt, flags: MessageFlags.Ephemeral}).catch(() => {});
        return true;
      }
    }
    const entry = getModEntry(interaction.guildId, base);
    // 2) Comando desactivado
    if (!entry.enabled) {
      const msg = botMsg(interaction.guildId, "cmd_disabled", { cmd: `/${invoked}` })
        || `🔕 El comando \`/${invoked}\` está desactivado en este servidor.`;
      interaction.reply({ content: msg, flags: MessageFlags.Ephemeral}).catch(() => {});
      return true;
    }
    // 3) Canales permitidos / bloqueados
    const cid = String(interaction.channelId || interaction.channel && interaction.channel.id || "");
    if (cid) {
      const denied = entry.denyChannels.includes(cid) || (entry.allowChannels.length > 0 && !entry.allowChannels.includes(cid));
      if (denied) {
        const msg = botMsg(interaction.guildId, "cmd_channel_denied", { cmd: `/${invoked}` })
          || `🔒 El comando \`/${invoked}\` no se puede usar en este canal.`;
        interaction.reply({ content: msg, flags: MessageFlags.Ephemeral}).catch(() => {});
        return true;
      }
    }
    // 4) Auto-borrado
    if (entry.deleteInvoke) deleteInvocationLater(interaction);
    if (entry.deleteReplySec > 0 || entry.deleteOnSourceDelete) trackCommandReply(interaction, entry);
    // 5) Premium: registrar métrica de uso
    recordMetric(interaction.guildId, base);
    return false;
  } catch (e) {
    console.error("⚠️ gateCommand:", e.message);
    return false;
  }
}
// Registra los alias del servidor como comandos de ámbito de servidor (ocultos para el resto)
async function syncGuildAliases(guildId) {
  if (!guildId || !CMD_BUILDERS.length) return { ok: false, error: "bot no listo" };
  try {
    const perms = db.getCmdPerms(guildId) || {};
    const taken = new Set(CMD_CATALOG.map(c => c.cmd));
    const wanted = [];
    const rejected = {};
    for (const c of CMD_CATALOG) {
      const raw = cleanAliasName(perms[c.cmd] && perms[c.cmd].alias);
      if (!raw || raw === c.cmd) { rejected[c.cmd] = ""; continue; }
      if (taken.has(raw)) { rejected[c.cmd] = "duplicate"; continue; }
      const b = CMD_BUILDERS.find(x => x.name === c.cmd);
      if (!b) { rejected[c.cmd] = "unavailable"; continue; }
      taken.add(raw);
      const j = JSON.parse(JSON.stringify(b.toJSON()));
      j.name = raw;
      wanted.push(j);
      rejected[c.cmd] = raw;
      if (wanted.length >= ALIAS_MAX_PER_GUILD) break;
    }
    const rest = restClient();
    const cur = await rest.get(Routes.applicationGuildCommands(BOT_ID, guildId));
    const curNames = (cur || []).map(c => c.name);
    if (curNames.length === wanted.length && wanted.every((w, i) => curNames[i] === w.name)) {
      return { ok: true, aliases: wanted.map(w => w.name), rejected };
    }
    const res = await rest.put(Routes.applicationGuildCommands(BOT_ID, guildId), { body: wanted });
    console.log(`🔤 Alias ${guildId}: ${(res || []).length} registrados`);
    return { ok: true, aliases: (res || []).map(c => c.name), rejected };
  } catch (e) {
    console.error("⚠️ syncGuildAliases:", e.message);
    return { ok: false, error: e.message, code: e.code || null };
  }
}
function scheduledAliasSync(guildId) {
  setTimeout(() => { syncGuildAliases(guildId).catch(() => {}); }, 4000 + Math.floor(Math.random() * 4000));
}
// Mensaje del bot editable desde el panel (módulo Mensajes): botMsg(gid, key, vars)
// Mensaje del bot en el contexto de una interacción (rescate / menú contextual)
function t2(interaction, key, vars) {
  try {
    const t = botMsg(interaction.guildId, key, vars || {});
    if (t) return t;
  } catch {}
  const fb = {
    ctx_bot: "🤖 No puedes aplicar esto a otro bot.",
    ctx_owner: "👑 No puedes moderar al dueño del servidor.",
    ctx_reason_ph: "Escribe aquí el motivo",
    res_no_perm: "❌ Solo el dueño del servidor o un rescate pueden hacer esto.",
    res_no_key: "🆘 No hay ninguna clave de rescate activa en este servidor.",
    res_expired: "⌛ Esa clave de rescate caducó o ya se usó.",
    res_invalid: "❌ Clave de rescate incorrecta.",
    res_dm_fail: "⚠️ Si no te llegó la clave por DM, comprueba que los mensajes privados estén abiertos.",
  };
  return fb[key] || "";
}

function botMsg(guildId, key, vars) {  try {
    const entry = (db.BOTMSGS || []).find(b => b.key === key);
    if (!entry) return "";
    const gc = guildId ? getGuildConfig(guildId) : null;
    const tpl = (gc && gc["msg_" + key]) || entry.def;
    let out = String(tpl || "");
    for (const [k, v] of Object.entries(vars || {})) out = out.split(`{${k}}`).join(String(v ?? ""));
    return out;
  } catch { return ""; }
}

// ============== MULTI-GUILD CONFIG ==============
const GUILDS_FILE = __dirname + "/guilds.json";
const guildConfigs = {};
let guildsLoaded = false;

const DEFAULT_GUILD_CONFIG = {
  name: "",
  ownerId: "",
  welcomeChannelId: "",
  welcomeEnabled: true,
  welcomeRoleId: "",
  autoRoleId: "",
  welcomeMessage: "",
  welcomeTitle: "",
  welcomeDesc: "",
  welcomeColor: "",
  welcomeFooter: "",
  welcomeImage: "",
  welcomeLayout: "",
  welcomeHelp: "",
  welcomeHelpFooter: "",
  welcomeDmEnabled: false,
  welcomeDmMessage: "",
  welcomeContent: "",
  rulesAutoPost: false,
  welcomeAuthorName: "",
  welcomeAuthorIcon: "",
  welcomeTimestamp: true,
  welcomeFooterIcon: "",
  goodbyeEnabled: false,
  goodbyeChannelId: "",
  goodbyeTitle: "",
  goodbyeDesc: "",
  goodbyeColor: "",
  goodbyeFooter: "",
  goodbyeImage: "",
  goodbyeLayout: "",
  goodbyeHelp: "",
  goodbyeHelpFooter: "",
  goodbyeAuthorName: "",
  goodbyeAuthorIcon: "",
  goodbyeTimestamp: true,
  goodbyeFooterIcon: "",
  goodbyeContent: "",
  bannerFile: "",
  bannerTicketPanelFile: "",
  bannerTicketFile: "",
  verifiedRoleId: "",
  unverifiedRoleId: "",
  verificationChannelId: "",
  verificationEnabled: false,
  verifyTitle: "",
  verifyDesc: "",
  verifyButton: "",
  verifyColor: "",
  captchaTitle: "",
  captchaDesc: "",
  verifySuccessTitle: "",
  verifySuccessDesc: "",
  verifyFailTitle: "",
  verifyFailDesc: "",
  verifyExpiredMsg: "",
  verifyAlreadyMsg: "",
  verifyTimeoutSec: 120,
  verifyAuthorName: "",
  verifyAuthorIcon: "",
  verifyFooterIcon: "",
  verifyContent: "",
  inscriptionChannelId: "",
  staffRoleId: "",
  miembroRoleId: "",
  directivosRoleId: "",
  participanteRoleId: "",
  creatorRoleId: "",
  colaboradorRoleId: "",
  mediaTeamRoleId: "",
  antiLinkEnabled: false,
  autoModEnabled: false,
  antiLinkAction: "",
  inviteFilterEnabled: false,
  inviteFilterAction: "",
  capsAction: "",
  spamAction: "",
  badwordsAction: "",
  emojiAction: "",
  mentionAction: "",
  domainAction: "",
  antiLinkAllowChannels: "",
  antiLinkAllowCategories: "",
  antiLinkAllowDomains: "spotify.com,open.spotify.com,youtube.com,youtu.be,soundcloud.com,music.apple.com,tidal.com,deezer.com,bandcamp.com,mixcloud.com,discord.com,discordapp.net,giphy.com,tenor.com",
  antiLinkAllowImages: true,
  antiLinkAllowVideos: true,
  bypassLinksRoles: "",
  bypassImagesRoles: "",
  bypassVideosRoles: "",
  automodAction: "",
  automodTimeoutMin: 0,
  automodWarnDM: true,
  capsEnabled: false,
  capsMinLen: 10,
  capsPercent: 70,
  spamEnabled: false,
  spamCount: 5,
  spamSeconds: 10,
  mentionSpamEnabled: false,
  mentionSpamMax: 5,
  linkWhitelistEnabled: false,
  linkWhitelistDomains: "",
  emojiEnabled: false,
  emojiMax: 5,
  badwords: "",
  whitelistRoles: "",
  whitelistUsers: "",
  whitelistChannels: "",
  logEnabled: false,
  logChannelId: "",
  joinGateEnabled: false,
  joinGateMinAge: 7,
  antiRaidEnabled: false,
  antiRaidCount: 5,
  antiRaidSeconds: 15,
  musicVolume: 100,
  musicAutoLeave: true,
  musicDJRole: "",
  musicProxy: "",
  musicSoundcloudFallback: true,
  confEnabled: true,
  confChannelId: "",
  confReviewChannelId: "",
  confVoting: true,
  invitesChannelId: "",
  // ---- Invites (mensaje customizable estilo bienvenidas) ----
  invEnabled: true,
  invTitle: "",
  invDesc: "",
  invColor: "",
  invFooter: "",
  invAuthorName: "",
  invAuthorIcon: "",
  invTimestamp: true,
  invFooterIcon: "",
  invContent: "",
  // ---- per-guild IDs (previously hardcoded for a single server) ----
  ticketCategoryId: "",
  ticketClosedCategoryId: "",
  ticketTranscriptChannelId: "",
  ticketRoleId: "",
  ticketTitle: "",
  ticketDesc: "",
  ticketColor: "",
  ticketFooter: "",
  ticketImage: "",
  ticketContent: "",
  ticketPanelTitle: "",
  ticketPanelDesc: "",
  ticketPanelColor: "",
  ticketPanelFooter: "",
  ticketPanelImage: "",
  ticketPanelContent: "",
  ticketCounter: 0,
  ticketAuthorName: "",
  ticketAuthorIcon: "",
  ticketTimestamp: true,
  ticketFooterIcon: "",
  verifyTimestamp: true,
  patrocinadorRoleId: "",
  patrocinadorCategoryId: "",
  eventosCategoryId: "",
  rulesChannelId: "",
  mentionRoleId: "",
  spotifyUserId: "",
  inscriptionEmbedId: "",
  mcServer: null, // { host, port } — null = not configured
  // ---- Botmode / Presence ----
  activityMode: "",
  activityText: "",
  botStatus: "",
  streamingUrl: "",
  spotifySync: false,
  // ---- Social Links ----
  socialTwitchChannel: "",
  socialYoutubeChannel: "",
  socialKickChannel: "",
  socialTiktokChannel: "",
  socialXChannel: "",
  socialInstagramChannel: "",
  socialNotifTitle: "",
  socialNotifDesc: "",
  socialNotifColor: "",
  socialNotifFooter: "",
  socialLiveRole: "",
  socialNotifAuthorName: "",
  socialNotifAuthorIcon: "",
  socialNotifTimestamp: true,
  socialNotifFooterIcon: "",
  // ---- Suggestions ----
  sugEnabled: false,
  sugChannelId: "",
  sugIntakeChannelId: "",
  sugUpvoteEmoji: "👍",
  sugDownvoteEmoji: "👎",
  sugMinVotes: 3,
  sugAnonymous: false,
  sugDecisionChannelId: "",
  sugReviewChannelId: "",
  sugAcceptChannelId: "",
  sugRejectChannelId: "",
  sugDmNotify: true,
  sugThreadCreation: false,
  sugEmbedColor: "",
  sugAnonTitle: "",
  sugAuthorName: "",
  sugAuthorIcon: "",
  sugTimestamp: true,
  sugFooterIcon: "",
  sugContent: "",
  // ---- Giveaways ----
  gwDefaultChannelId: "",
  gwDefaultWinners: 1,
  gwEmbedTitle: "",
  gwEmbedColor: "",
  gwJoinEmoji: "🎉",
  gwEndTitle: "",
  gwEndColor: "",
  gwNoWinnersMsg: "",
  gwWinnerAnnounce: "",
  gwLiveDesc: "",
  gwEndDesc: "",
  gwFooter: "",
  gwRoleRequirement: "",
  gwMinAccountAge: 0,
  gwAuthorName: "",
  gwAuthorIcon: "",
  gwTimestamp: true,
  gwFooterIcon: "",
  gwContent: "",
  // ---- Clips ----
  clipsEnabled: false,
  clipsChannelId: "",
  clipsMaxPerUser: 0,
  clipsCategories: "",
  clipsAutoPublish: false,
  clipsColor: "",
  clipsMaxDuration: 0,
  clipAuthorName: "",
  clipAuthorIcon: "",
  clipTimestamp: true,
  clipFooterIcon: "",
  // ---- Stats ----
  statsEnabled: false,
  statsTrackVoice: false,
  statsTrackMessages: false,
  statsLeaderboardChannelId: "",
  statsLevelUpChannelId: "",
  statsLevelUpMsg: "",
  statsXpPerMsg: 5,
  statsVoiceXpPerMin: 5,
  statsXpCooldown: 60,
  statsBlacklistChannels: "",
  statsRoleRewards: "",
  statsAuthorName: "",
  statsAuthorIcon: "",
  statsTimestamp: true,
  statsFooterIcon: "",
  // ---- Polls ----
  pollEnabled: false,
  pollChannelId: "",
  pollDefaultDuration: 0,
  pollMaxOptions: 10,
  pollAnonymous: false,
  pollResultChannelId: "",
  pollColor: "",
  pollEndTitle: "",
  pollEndColor: "",
  pollAuthorName: "",
  pollAuthorIcon: "",
  pollTimestamp: true,
  pollFooterIcon: "",
  pollContent: "",
  // ---- Audit Log ----
  auditEnabled: false,
  auditChannelId: "",
  auditLogKicks: true,
  auditLogBans: true,
  auditLogTimeouts: true,
  auditLogRoleChanges: true,
  auditLogChannelEdits: true,
  auditLogChannels: true,
  auditLogMessages: false,
  // ---- Sanctions log channels (por tipo) ----
  sancTempChannelId: "",
  sancPermaChannelId: "",
  sancWarnChannelId: "",
  sancEmbedChannelId: "",
  // ---- Starboard ----
  starboardEnabled: false,
  starboardChannelId: "",
  starboardMinStars: 5,
  starboardEmoji: "⭐",
  // ---- Sticky Messages ----
  stickyEnabled: false,
  stickyMessages: [],
  // ---- AFK ----
  afkEnabled: true,
  // ---- Reaction Roles ----
  reactionRoles: [],
  // ---- Anti-Nuke ----
  antiNukeEnabled: false,
  antiNukeBanLimit: 5,
  antiNukeKickLimit: 5,
  antiNukeAction: "timeout",
  // ---- Auto-Responses ----
  autoResponses: [],
  // ---- Temp Voice ----
  tempVoiceEnabled: false,
  tempVoiceCreatorChannelId: "",
  tempVoiceCategoryId: "",
  // ---- Joinable Ranks ----
  joinableRoles: [],
  // ---- Media-Only Channels ----
  mediaOnlyChannels: [],
};

function loadGuilds() {
  try {
    for (const g of db.allGuilds()) {
      const raw = db.getGuildConfigRaw(g.guildId) || {};
      guildConfigs[g.guildId] = { ...DEFAULT_GUILD_CONFIG, ...raw };
      if (g.name && !guildConfigs[g.guildId].name) guildConfigs[g.guildId].name = g.name;
    }
    console.log(`🏠 Loaded ${Object.keys(guildConfigs).length} guild configs`);
  } catch (e) { console.error("loadGuilds error:", e.message); }
  guildsLoaded = true;
}

function saveGuilds() {
  if (!guildsLoaded) return;
  try {
    for (const [gid, cfg] of Object.entries(guildConfigs)) {
      db.setGuildConfig(gid, cfg, cfg.name || "");
    }
  } catch (e) { noteError("saveGuilds", e); console.error("Error saving guilds:", e.message); }
}

function getGuildConfig(guildId) {
  if (!guildId) return { ...DEFAULT_GUILD_CONFIG };
  if (!guildConfigs[guildId]) {
    const raw = db.getGuildConfigRaw(guildId);
    const merged = { ...DEFAULT_GUILD_CONFIG, ...(raw || {}) };
    // Asegurar que claves críticas tengan valor por defecto si vienen vacías del raw
    for (const k of Object.keys(DEFAULT_GUILD_CONFIG)) {
      const dv = DEFAULT_GUILD_CONFIG[k];
      const rv = merged[k];
      if (rv === "" || rv === null || rv === undefined) {
        if (typeof dv === "string" && dv !== "") merged[k] = dv;
        else if (typeof dv === "boolean") merged[k] = dv;
        else if (typeof dv === "number") merged[k] = dv;
      }
    }
    guildConfigs[guildId] = merged;
    if (!raw) db.ensureGuild(guildId);
  }
  return guildConfigs[guildId];
}

// Legacy Hydra Studio values: fill per-guild keys only when empty,
// so the main server keeps working exactly as before (new guilds get blanks).
function seedLegacyGuild() {
  try {
    const mainId = process.env.GUILD_ID || "";
    if (!mainId) return;
    const gc = getGuildConfig(mainId);
    const legacy = {
      ticketCategoryId: "1522490815195381860",
      ticketRoleId: "1522757576247214230",
      patrocinadorRoleId: "1522475608263622684",
      patrocinadorCategoryId: "1531173374359765042",
      eventosCategoryId: "1522738870184181941",
      rulesChannelId: "1522475609312198707",
      mentionRoleId: "1522475608263622681",
      spotifyUserId: "1307246359895740448",
      inscriptionChannelId: "1523514700384440320",
      inscriptionEmbedId: "1523512153829806192",
      welcomeChannelId: "1522475608981114995",
    };
    let changed = false;
    for (const [k, v] of Object.entries(legacy)) {
      if (!gc[k]) { gc[k] = v; changed = true; }
    }
    if (changed) { saveGuilds(); console.log(`🌱 Legacy Hydra values seeded for ${mainId}`); }
  } catch (e) { console.error("seedLegacyGuild error:", e.message); }
}

function getDirectivosRoleId(guildId) { return getGuildConfig(guildId).directivosRoleId; }
function isDirectivos(member) {
  if (member.id === "1307246359895740448") return true;
  const roleId = getDirectivosRoleId(member.guild.id);
  return roleId ? member.roles.cache.has(roleId) : false;
}

function getParticipanteRoleId(guildId) { return getGuildConfig(guildId).participanteRoleId; }

// ============== CLIPS ==============
const clips = new Map();
let clipCounter = 0;
const CLIPS_DIR = __dirname + "/Clips";

// ============== TICKETS ==============
// Categorias de tickets: se guardan en la BD y se pueden crear, renombrar,
// modificar y borrar desde el panel. Cada una tiene sus propias preguntas.
const TICKET_CAT_DEFAULTS = [
  { id: "soporte_general", label: "Soporte General", emoji: "💡", desc: "Dudas y preguntas generales del servidor", prefix: "gen", questions: ["¿En qué te ayudamos?"] },
  { id: "soporte_bugs", label: "Soporte Bugs", emoji: "🐛", desc: "Reportar fallos o bugs encontrados", prefix: "bug", questions: ["¿Qué fallo encontraste?", "¿Cómo se puede reproducir?"] },
  { id: "reportes_jugador", label: "Reportes Jugador", emoji: "⚠️", desc: "Reportar jugadores que cometieron falta", prefix: "rep", questions: ["¿Quién es el jugador?", "¿Qué hizo?"] },
  { id: "soporte_tienda", label: "Soporte Tienda", emoji: "🛒", desc: "Dudas sobre compras o la tienda", prefix: "tienda", questions: ["¿Sobre qué compra es?", "¿Tienes captura de la compra?"] },
  { id: "soporte_password", label: "Soporte Cuenta", emoji: "🔑", desc: "Ayuda con tu cuenta", prefix: "pass", questions: ["¿Cuál es tu usuario?", "¿Qué problema tienes?"] },
  { id: "soporte_apelaciones", label: "Soporte Apelaciones", emoji: "⚖️", desc: "Apelar sanciones o castigos", prefix: "apel", questions: ["¿Qué sanción apelas?", "¿Por qué crees que es injusta?"] },
  { id: "reportes_staff", label: "Reportes Staff", emoji: "👤", desc: "Reportar a un miembro del staff", prefix: "rstaff", questions: ["¿Quién es el miembro del staff?", "¿Qué hizo?"] },
  { id: "patrocinar", label: "Patrocinar", emoji: "🤝", desc: "Solicitar patrocinio o colaboración", prefix: "ali", questions: ["¿Qué propones?", "¿Tienes experiencia?"] },
];
// Nota media de un freelancer a partir de sus reseñas
function mediaResenas(guildId, userId) {
  const rs = db.getReviews(guildId).filter(r => r.to === userId);
  if (!rs.length) return { avg: 0, count: 0 };
  const avg = rs.reduce((a, r) => a + (Number(r.stars) || 0), 0) / rs.length;
  return { avg: Math.round(avg * 10) / 10, count: rs.length };
}
// Devuelve las categorias del servidor, sembrando las por defecto la primera vez
function ticketCats(guildId) {
  let cats = [];
  try { cats = db.getTicketCats(guildId) || []; } catch { cats = []; }
  if (!cats.length) {
    cats = TICKET_CAT_DEFAULTS.map(c => ({ ...c }));
    for (const c of cats) { try { db.setTicketCat(guildId, c.id, c); } catch {} }
  }
  return cats;
}
const openTickets = new Map();
let ticketsLoaded = false;

function saveTickets() {
  if (!ticketsLoaded) return;
  try {
    const ids = new Set(openTickets.keys());
    for (const [id] of db.getTickets()) if (!ids.has(id)) db.delTicket(id);
    for (const [id, t] of openTickets) db.setTicket(id, (t && t.guildId) || "", t);
  } catch (e) { console.error("Error saving tickets:", e.message); }
}

function loadTickets() {
  try {
    for (const [id, t] of db.getTickets()) openTickets.set(id, t);
    console.log(`📎 Loaded ${openTickets.size} open tickets`);
  } catch (e) { console.error("loadTickets error:", e.message); }
  ticketsLoaded = true;
}

function loadClips() {
  try {
    for (const [id, data] of db.getClips()) {
      clips.set(id, data);
      if (data.numericId > clipCounter) clipCounter = data.numericId;
    }
    console.log(`📎 Loaded ${clips.size} clips`);
  } catch (e) { console.error("loadClips error:", e.message); }
}

function saveClip(clip) {
  try {
    db.setClip(clip.id, clip.guildId || "", clip);
  } catch (e) { console.error("Error saving clip:", e.message); }
}

function deleteClipFile(clip) {
  try {
    if (clip && clip.id) db.delClip(clip.id);
  } catch {}
}

function buildClipEmbed(clip) {
  const gcClip = getGuildConfig(clip.guildId);
  const clipColor = parseColor(gcClip.clipsColor || "#FFD700");
  let desc = `**${clip.titulo}**\n`;
  if (clip.descripcion) desc += `\n${clip.descripcion}\n`;
  if (clip.link) {
    desc += `\n🔗 [Ver VOD](${clip.link})`;
    if (clip.inicio || clip.fin) {
      const timeRange = [];
      if (clip.inicio) timeRange.push(clip.inicio);
      if (clip.fin) timeRange.push(clip.fin);
      desc += ` (${timeRange.join(" → ")})`;
    }
  }
  if (clip.menciones) desc += `\n👥 ${clip.menciones}`;
  desc += `\n⭐ ${clip.favoritos.length} favoritos`;
  const embed = new EmbedBuilder()
    .setTitle(`📎 Clip #${clip.numericId}`)
    .setDescription(desc)
    .setColor(clipColor)
    .setFooter({ text: `Guardado por ${clip.autor} • ${new Date(clip.fecha).toLocaleDateString("es-ES")}` })
    .setTimestamp();
  applyEmbedExtras(embed, gcClip, "clip", null);
  return embed;
}

// ============== CONFESSIONS SYSTEM (per-guild, SQLite) ==============
const confessionsData = {};
let confessionsLoaded = false;

function loadConfessions() {
  try {
    for (const g of db.allGuilds()) {
      const data = db.getConfessions(g.guildId);
      if (data) confessionsData[g.guildId] = data;
    }
    console.log(`💌 Loaded confessions for ${Object.keys(confessionsData).length} guilds`);
  } catch (e) { console.error("loadConfessions error:", e.message); }
  confessionsLoaded = true;
}

function saveConfessions() {
  if (!confessionsLoaded) return;
  try {
    for (const [gid, gdata] of Object.entries(confessionsData)) db.setConfessions(gid, gdata);
  } catch (e) { console.error("Error saving confessions:", e.message); }
}

function getConfessionData(guildId) {
  if (!confessionsData[guildId]) {
    confessionsData[guildId] = { channelId: "", counter: 0, confessions: [], bans: [], reports: [] };
  }
  const d = confessionsData[guildId];
  if (!d.confessions) d.confessions = [];
  if (!d.bans) d.bans = [];
  if (!d.reports) d.reports = [];
  return d;
}

// Formato estilo Confessions-bot: "Confesión anónima (#N)" + texto entrecomillado,
// reacciones de voto 👍👎 y botones persistentes Enviar/Responder.
const CONF_COLORS = [0x9B59B6, 0x2ECC71, 0x3498DB, 0xE91E63, 0xF39C12, 0x1ABC9C];
function confColor(id) { return CONF_COLORS[Math.abs(Number(id) || 0) % CONF_COLORS.length]; }
function confButtons(msgId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("conf_new").setLabel("Enviar confesión").setEmoji("📩").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`conf_reply_${msgId}`).setLabel("Responder").setStyle(ButtonStyle.Secondary),
  )];
}
async function publishConfession(guild, ch, conf) {
  const embed = new EmbedBuilder()
    .setTitle(`💌 Confesión anónima (#${conf.id})`)
    .setDescription(`"${conf.content}"`)
    .setColor(confColor(conf.id))
    .setFooter({ text: `Confesión anónima • ${new Date(conf.date).toLocaleString("es-ES")}` })
    .setTimestamp(new Date(conf.date));
  const msg = await ch.send({ embeds: [embed], components: confButtons("pending") });
  // Reemplazar el botón Responder con el messageId real
  await msg.edit({ components: confButtons(msg.id) }).catch(() => {});
  if (getGuildConfig(guild.id).confVoting !== false) {
    try { await msg.react("👍"); await msg.react("👎"); } catch {}
  }
  return msg;
}

function parseRoles(guild, str) {
  if (!str) return "";
  return str.split(",").map(s => s.trim()).map(p => {
    const id = p.replace(/[<@&>]/g, "");
    let role = guild.roles.cache.get(id);
    if (!role) role = guild.roles.cache.find(r => r.name.toLowerCase() === p.toLowerCase());
    return role ? `<@&${role.id}>` : null;
  }).filter(Boolean).join(" ");
}

function formatDuration(ms) {
  const s = Math.floor((ms / 1000) % 60);
  const m = Math.floor((ms / 60000) % 60);
  const h = Math.floor(ms / 3600000);
  return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}` : `${m}:${s.toString().padStart(2,"0")}`;
}

function fmtParticipant(p, idx) {
  const icons = [];
  if (p.mic) icons.push("🎤");
  if (p.contenido) icons.push("🎬");
  if (p.streamLink) icons.push("🔗");
  return `${idx}. <@${p.userId}> | **${p.nick}** | ${p.edad} años${icons.length ? " | " + icons.join(" ") : ""}`;
}

function buildEditSelectPage(interaction, eventId, ev, page) {
  const PAGE_SIZE = 25;
  const total = ev.participants.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const slice = ev.participants.slice(start, start + PAGE_SIZE);
  const guild = interaction.guild;

  const options = slice.map((p, i) => {
    const member = guild.members.cache.get(p.userId);
    const dcName = member ? (member.displayName || member.user.username) : "??";
    return {
      label: `#${start + i + 1} | ${dcName} | ${p.nick}`.substring(0, 100),
      description: `${p.edad} años${p.mic ? " 🎤" : ""}${p.contenido ? " 🎬" : ""}`.substring(0, 100),
      value: String(start + i),
    };
  });

  const components = [];
  components.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`evlist_editselect_${eventId}_${page}`)
      .setPlaceholder(`Página ${page + 1}/${totalPages} — Selecciona un participante...`)
      .addOptions(options),
  ));

  if (totalPages > 1) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`evlist_editpage_${eventId}_${page - 1}`).setLabel("⬅️ Anterior").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`evlist_editpage_${eventId}_${page + 1}`).setLabel("➡️ Siguiente").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    ));
  }

  const replyObj = {
    content: `✏️ **Editar participante** — Página ${page + 1}/${totalPages} (${total} total)`,
    components,
    flags: MessageFlags.Ephemeral,
  };

  if (interaction.replied || interaction.deferred) {
    return interaction.editReply(replyObj);
  }
  return interaction.reply(replyObj);
}

async function updateEventDisplay(guild, ev) {
  if (!ev.displayMessageId || !ev.displayChannelId) return;
  try {
    const ch = guild.channels.cache.get(ev.displayChannelId);
    if (!ch) return;
    const msg = await ch.messages.fetch(ev.displayMessageId).catch(() => null);
    if (!msg) return;
    const updatedEmbed = buildEventDisplayEmbed(ev, guild);
    await msg.edit({ embeds: [updatedEmbed] });
  } catch {}
}

function buildEventDisplayEmbed(ev, guild) {
  const statusMap = { abierto: "🟢 Inscripciones Abiertas", cerrado: "🟡 Inscripciones Cerradas", en_curso: "🔴 EN CURSO", finalizado: "🏁 Finalizado" };
  const embed = new EmbedBuilder()
    .setTitle(`🎮 ${ev.nombre}`)
    .setColor(ev.status === "en_curso" ? 0xFF0000 : ev.status === "abierto" ? 0x00FF00 : 0xFFAA00)
    .setTimestamp();

  let count = 0;
  if (guild && ev.roleId) {
    const role = guild.roles.cache.get(ev.roleId);
    if (role) count = role.members.size;
  }

  const shortDesc = ev.desc.length > 150 ? ev.desc.slice(0, 150) + "..." : ev.desc;
  let desc = `**${shortDesc}**\n\n`;
  desc += `📅 **Fecha:** <t:${ev.fechaTs}:F> (<t:${ev.fechaTs}:R>)\n`;
  desc += `🎮 **Modo:** ${ev.modo}\n`;
  desc += `👥 **Cupos:** ${count}/${ev.cupos}\n`;
  desc += `📊 **Estado:** ${statusMap[ev.status] || ev.status}\n`;

  if (ev.eventTeams && ev.eventTeams.length > 0) {
    desc += `\n---\n**🏆 Equipos:**\n`;
    const maxTeams = 20;
    for (const t of ev.eventTeams.slice(0, maxTeams)) {
      const eliminated = ev.eliminatedTeams && ev.eliminatedTeams.includes(t.name);
      desc += eliminated ? `❌ ~~${t.name}~~ (Eliminado)\n` : `✅ **${t.name}** — ${t.specialty || "N/A"}\n`;
    }
    if (ev.eventTeams.length > maxTeams) {
      desc += `... y ${ev.eventTeams.length - maxTeams} equipos más\n`;
    }
  } else {
    desc += `\n---\n**🏆 Equipos:** Ninguno registrado aún\n`;
  }

  if (ev.eliminatedTeams && ev.eliminatedTeams.length > 0) {
    desc += `\n**Eliminados:** ${ev.eliminatedTeams.length}`;
  }

  embed.setDescription(desc.slice(0, 4096));
  if (ev.miniatura && ev.miniatura.startsWith("http")) embed.setThumbnail(ev.miniatura);
  for (const [eid, evData] of events) { if (evData === ev) { embed.setFooter({ text: ev.footer ? `${ev.footer} | ID: ${eid}` : `ID: ${eid}` }); break; } }
  return embed;
}

function parseColor(v) {
  if (typeof v === "number") return v;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(v || "").trim());
  return m ? parseInt(m[1], 16) : 0x5865F2;
}

// Reemplaza variables y deja pasar menciones <#id> <@&id> @everyone
function renderMsg(template, member, extra) {
  if (!template) return "";
  let out = String(template);
  out = out.replace(/\{staff-mention:(\d{17,20})\}/gi, "<@&$1>");
  if (extra) {
    if (extra.ticketName) out = out.replace(/\{ticket-name\}/gi, extra.ticketName);
    if (extra.ticketNumber !== undefined && extra.ticketNumber !== null) out = out.replace(/\{ticket-number\}/gi, String(extra.ticketNumber));
    if (extra.staffMention) out = out.replace(/\{staff\}/gi, extra.staffMention);
    if (extra.inviter) out = out.replace(/\{inviter\}/gi, extra.inviter);
    if (extra.invites !== undefined && extra.invites !== null) out = out.replace(/\{invites\}/gi, String(extra.invites));
    if (extra.verifyChannel) out = out.replace(/\{verify\}/gi, extra.verifyChannel);
  }
  if (member) {
    out = out.replace(/\{user-mention\}/gi, `<@${member.id}>`);
    out = out.replace(/\{user\}/g, `<@${member.id}>`);
    out = out.replace(/\{username\}/gi, member.user.username);
    out = out.replace(/\{member\}/g, member.displayName || member.user.username);
    if (member.guild) {
      out = out.replace(/\{server-name\}/gi, member.guild.name);
      out = out.replace(/\{server\}/g, member.guild.name);
      out = out.replace(/\{members\}/g, String(member.guild.memberCount || 0));
    }
  }
  return out;
}
// Texto fuera del embed (content): renderiza y devuelve undefined si está vacío
function msgContent(gc, key, member, extra) {
  try {
    const t = renderMsg((gc && gc[key]) || "", member, extra);
    return t ? t.substring(0, 2000) : undefined;
  } catch { return undefined; }
}
// Descripción de bienvenida por defecto + variable {verify} (mención al canal configurado)
const WELCOME_DEFAULT_DESC = "¡Hola {user}! Nos alegra que te unas a **{server}** 🏆\n\n✅ Dirígete a {verify} para verificarte y leer las reglas antes de comenzar.\n\n💎 **¿Quieres participar en eventos?**\n¡Has llegado al lugar correcto!";
function welcomeExtra(gc) {
  const vch = gc && gc.verificationChannelId ? `<#${gc.verificationChannelId}>` : "";
  return { verifyChannel: vch || "el canal de verificación" };
}

// Banner personalizado por servidor (subido desde el dashboard)
function guildBannerPath(guildId) {
  try {
    const gc = guildId ? getGuildConfig(guildId) : null;
    const f = gc && gc.bannerFile ? String(gc.bannerFile).split(/[/\\]/).pop() : "";
    if (!f || !/\.(jpg|jpeg|png|webp|gif)$/i.test(f)) return null;
    const p = require("path").join(__dirname, "banners", f);
    if (require("fs").existsSync(p)) return p;
  } catch {}
  return null;
}
// Banners propios por sección: slot "main" | "ticketpanel" | "ticket"
function bannerFileFor(guildId, slot) {
  try {
    const gc = guildId ? getGuildConfig(guildId) : null;
    const key = slot === "ticketpanel" ? "bannerTicketPanelFile" : slot === "ticket" ? "bannerTicketFile" : "bannerFile";
    const f = gc && gc[key] ? String(gc[key]).split(/[/\\]/).pop() : "";
    if (!f || !/\.(jpg|jpeg|png|webp|gif)$/i.test(f)) return null;
    const p = require("path").join(__dirname, "banners", f);
    if (require("fs").existsSync(p)) return p;
  } catch {}
  return null;
}
// mode: "" | "banner" (principal) | "propio" (de la sección)
function resolveTicketBanner(guildId, mode, slot) {
  if (mode === "propio") return bannerFileFor(guildId, slot);
  if (mode === "banner") return bannerFileFor(guildId, "main");
  return null;
}

// Aplica autor/timestamp/icono configurables a cualquier embed (message.style)
function applyEmbedExtras(embed, gc, prefix, member) {
  try {
    const an = gc[prefix + "AuthorName"];
    if (an) {
      const ai = gc[prefix + "AuthorIcon"];
      const icon = /^https?:\/\/.{1,500}$/i.test(ai || "") ? ai : undefined;
      embed.setAuthor({ name: renderMsg(an, member).substring(0, 256), iconURL: icon });
    }
    if (gc[prefix + "Timestamp"] === false && embed.data) delete embed.data.timestamp;
    const fi = gc[prefix + "FooterIcon"];
    if (fi && /^https?:\/\/.{1,500}$/i.test(fi) && embed.data && embed.data.footer) {
      embed.data.footer.icon_url = fi;
    }
  } catch {}
  return embed;
}

function buildVerifyPanel(guildId, member) {
  const gc = guildId ? getGuildConfig(guildId) : null;
  const g = (k, fb) => (gc && gc[k]) || fb;
  const embed = new EmbedBuilder()
    .setTitle(String(g("verifyTitle", "🔐 Verificación Requerida")).substring(0, 256))
    .setDescription(renderMsg(g("verifyDesc", "Para acceder al servidor, completa la verificación.\n\nHaz clic en el botón de abajo y escribe el código que veas."), member))
    .setColor(parseColor(g("verifyColor", "#5865F2")))
    .setFooter({ text: "HYDRA Bot" }).setTimestamp();
  applyEmbedExtras(embed, gc || {}, "verify", member);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("verify_start").setLabel(g("verifyButton", "Verificarme").substring(0, 80) || "Verificarme").setStyle(ButtonStyle.Success)
  );
  const out = { embeds: [embed], components: [row] };
  const vc = renderMsg((gc && gc.verifyContent) || "", member);
  if (vc) out.content = vc;
  return out;
}

function verifyEmbed(guildId) {
  return buildVerifyPanel(guildId).embeds[0];
}

// Panel de tickets reutilizable (dashboard + /ticket-setup)
function buildTicketPanel(guild, member) {
  const gc = getGuildConfig(guild.id);
  const embCfg = (gc.embeds || {}).tickets || {};
  const cats = ticketCats(guild.id);
  const embed = new EmbedBuilder()
    .setTitle(String(gc.ticketPanelTitle || embCfg.title || `${guild.name} Support Area`).substring(0, 256))
    .setDescription(renderMsg(gc.ticketPanelDesc || embCfg.description || `¡Bienvenido al centro de soporte de **${guild.name}**! 🐉\n\nAquí podrás acceder a diferentes tipos de tickets para obtener ayuda, reportar problemas o solicitar información.\n\n📌 **Lee detenidamente las instrucciones de cada categoría** antes de abrir un ticket para agilizar tu atención.\n\n🔥 **Nuestro equipo de staff está listo para ayudarte.**\n\n> *La paciencia y el respeto son fundamentales para un buen servicio.*`, member).replace(/\{server\}/gi, guild.name))
    .setColor(parseColor(gc.ticketPanelColor || embCfg.color || "#00FF00"))
    .setFooter({ text: renderMsg(gc.ticketPanelFooter || `${guild.name} • Soporte`, member).replace(/\{server\}/gi, guild.name) })
    .setTimestamp();
  applyEmbedExtras(embed, gc, "ticket", member);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("Click aquí para desplegar el menú!")
    .addOptions(cats.map(cat => ({
      label: cat.label,
      value: cat.value || cat.id,
      emoji: cat.emoji,
      description: cat.description || cat.desc,
    })));
  const row = new ActionRowBuilder().addComponents(menu);
  const sendOptions = { embeds: [embed], components: [row] };
  const panelContent = renderMsg(gc.ticketPanelContent || "", member);
  if (panelContent) sendOptions.content = panelContent;
  const fs = require("fs");
  const bannerPath = __dirname + "/ticket-banner.png";
  if (embCfg.image) {
    embed.setImage(embCfg.image);
  } else if (gc.ticketPanelImage) {
    const bp = resolveTicketBanner(guild.id, gc.ticketPanelImage, "ticketpanel");
    if (bp) {
      sendOptions.files = [new AttachmentBuilder(bp, { name: "ticket-panel-banner.png" })];
      embed.setImage("attachment://ticket-panel-banner.png");
    }
  } else if (fs.existsSync(bannerPath)) {
    sendOptions.files = [new AttachmentBuilder(bannerPath, { name: "ticket-banner.png" })];
    embed.setImage("attachment://ticket-banner.png");
  }
  return sendOptions;
}

// Envía la transcripción (.txt) al canal configurable de transcripts
async function sendTicketTranscript(guild, channel, ticketData, closerTag) {
  try {
    const gc = getGuildConfig(guild.id);
    const trChId = gc.ticketTranscriptChannelId || "";
    const trCh = trChId ? await guild.channels.fetch(trChId).catch(() => null) : null;
    if (!trCh || !trCh.isTextBased()) return;
    let messages;
    try { messages = await channel.messages.fetch({ limit: 100 }); } catch { messages = new Map(); }
    const lines = [];
    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).forEach(m => {
      const atts = m.attachments.size ? ` [${m.attachments.size} adjunto(s)]` : "";
      lines.push(`[${new Date(m.createdTimestamp).toLocaleString("es-ES")}] ${m.author.tag}: ${(m.content || "(embed/sistema)")}${atts}`);
    });
    const buf = Buffer.from(lines.join("\n") || "(sin mensajes)", "utf8");
    const emb = new EmbedBuilder()
      .setTitle(`📄 Transcript — #${channel.name}`)
      .setDescription(`**Ticket de:** <@${ticketData?.userId || "?"}>\n**Categoría:** ${ticketData?.category || "?"}\n**Gestionado por:** ${closerTag}\n**Mensajes:** ${lines.length}`)
      .setColor(0x5865F2).setTimestamp();
    await trCh.send({ embeds: [emb], files: [{ attachment: buf, name: `transcript-${channel.name}.txt` }] }).catch(() => {});
  } catch {}
}

// Construye una transcripcion en HTML con estilo Discord
function buildHtmlTranscript(messages, channel, ticketData) {
  const filas = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp).map(m => {
    const hora = new Date(m.createdTimestamp).toLocaleString("es-ES");
    const autor = m.author ? m.author.tag : "?";
    const avatar = m.author ? m.author.displayAvatarURL({ extension: "png", size: 64 }) : "";
    const contenido = String(m.content || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/\n/g, "<br>");
    const adjuntos = [...m.attachments.values()].map(a => `<div class="adj">📎 <a href="${a.url}">${a.name || a.url}</a></div>`).join("");
    return `<div class="msg"><img class="av" src="${avatar}" alt=""><div class="cuerpo"><div class="cab"><b>${autor}</b><span>${hora}</span></div><div class="txt">${contenido}</div>${adjuntos}</div></div>`;
  }).join("");
  const titulo = ticketData ? `${ticketData.category || "Ticket"} · #${channel.name}` : `#${channel.name}`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Transcripcion - ${titulo}</title><style>
body{margin:0;background:#313338;color:#dbdee1;font:14px/1.5 "Segoe UI",system-ui,sans-serif;padding:24px}
h1{font-size:18px;margin:0 0 4px}.meta{color:#949ba4;font-size:12px;margin-bottom:18px}
.msg{display:flex;gap:12px;padding:10px 0;border-top:1px solid #3f4147}
.av{width:40px;height:40px;border-radius:50%;flex:0 0 40px}
.cab b{color:#fff;margin-right:8px}.cab span{color:#949ba4;font-size:12px}
.txt{white-space:pre-wrap;word-break:break-word}.adj{margin-top:4px;font-size:12px}
.adj a{color:#00b0f4}.msg.bot .cab b{color:#5865f2}
</style></head><body><h1>Transcripcion de ${titulo}</h1><div class="meta">Generada el ${new Date().toLocaleString("es-ES")} · ${messages.size} mensajes</div>${filas}</body></html>`;
}
// Cierre de ticket compartido (botón 🔒 Cerrar y comando /cerrar).
// Devuelve { embed, components } para responder.
async function closeTicketCore(guild, channel, ticketData, closerUser) {
  const transcript = [];
  let messages;
  try { messages = await channel.messages.fetch({ limit: 100 }); } catch { messages = new Map(); }
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).forEach(m => {
    transcript.push(`[${new Date(m.createdTimestamp).toLocaleString("es-ES")}] ${m.author.tag}: ${m.content}`);
  });
  const fs = require("fs");
  const transcriptFile = `${__dirname}/Tickets/transcript-${channel.id}.txt`;
  try {
    if (!fs.existsSync(__dirname + "/Tickets")) fs.mkdirSync(__dirname + "/Tickets", { recursive: true });
    fs.writeFileSync(transcriptFile, transcript.join("\n"));
    try {
      const htmlFile = `${__dirname}/Tickets/transcript-${channel.id}.html`;
      fs.writeFileSync(htmlFile, buildHtmlTranscript(messages, channel, ticketData));
    } catch {}
  } catch {}

  await sendTicketTranscript(guild, channel, ticketData, `<@${closerUser.id}>`);

  ticketData.closed = true;
  ticketData.closedBy = closerUser.id;
  ticketData.closedAt = Date.now();
  openTickets.set(channel.id, ticketData);
  saveTickets();

  try {
    const stillOpen = [...openTickets.values()].some(t => t.userId === ticketData.userId && !t.closed);
    if (!stillOpen) {
      const ticketRole = guild.roles.cache.get(getGuildConfig(guild.id).ticketRoleId || "");
      if (ticketRole && ticketData.userId) {
        const member = await guild.members.fetch(ticketData.userId).catch(() => null);
        if (member) await member.roles.remove(ticketRole).catch(() => {});
      }
    }
  } catch {}

  const gcClose = getGuildConfig(guild.id);
  if (gcClose.ticketClosedCategoryId) {
    await channel.setParent(gcClose.ticketClosedCategoryId).catch(() => {});
  }
  await channel.setName(`cerrado-${channel.name.replace("cerrado-", "")}`).catch(() => {});
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, { SendMessages: false }).catch(() => {});

  const closedEmbed = new EmbedBuilder()
    .setTitle("🔒 Ticket Cerrado")
    .setDescription(`Cerrado por <@${closerUser.id}>.\nTranscript guardado.\n\n*Este canal ya no acepta mensajes.*`)
    .setColor(0xFF0000)
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_reopen").setLabel("🔓 Reabrir Ticket").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ticket_delete").setLabel("🗑️ Borrar Ticket").setStyle(ButtonStyle.Danger),
  );
  return { embed: closedEmbed, components: [row] };
}

// Construye el mensaje EXACTO que el bot enviaría (para pruebas desde el panel)
async function buildTestMessage(guildId, module, member) {
  const guild = member.guild;
  const gc = getGuildConfig(guildId);
  if (module === "verification") return buildVerifyPanel(guildId, member);
  if (module === "welcome") {
    const embColor = parseColor(gc.welcomeColor || "#5865F2");
    const wExT = welcomeExtra(gc);
    const embTitle = renderMsg(gc.welcomeTitle || `✨ ¡Bienvenido/a, {member}! ✨`, member, wExT).replace(/\{member\}/g, member.displayName);
    const embFooter = renderMsg(gc.welcomeFooter || `🎉 ¡Disfruta tu estadía en {server}!`, member, wExT);
    const resolvedDesc = renderMsg(gc.welcomeDesc || "", member, wExT);
    const customMsg = gc.welcomeMessage || "";
    const embed = new EmbedBuilder().setTitle(embTitle.substring(0, 256))
      .setDescription(resolvedDesc || renderMsg(customMsg, member, wExT) || renderMsg(WELCOME_DEFAULT_DESC, member, wExT))
      .setColor(embColor)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setTimestamp();
    if (embFooter) embed.setFooter({ text: embFooter });
    const files = [];
    if ((gc.welcomeImage || "").toLowerCase() === "banner" || (!customMsg && !resolvedDesc)) {
      const buf = generateWelcomeBanner(member.displayName, member.user.displayAvatarURL(), guildId);
      files.push(new AttachmentBuilder(buf, { name: "welcome-banner.png" }));
      embed.setImage("attachment://welcome-banner.png");
    }
    applyEmbedExtras(embed, gc, "welcome", member);
    const wLayout = (gc.welcomeLayout || "").toLowerCase();
    if (wLayout === "secciones" || wLayout === "bloques") {
      const helpTest = new EmbedBuilder()
        .setTitle(`💎 ${guild.name}`)
        .setDescription(renderMsg(gc.welcomeHelp || "", member, wExT))
        .setColor(parseColor(gc.welcomeColor || "#5865F2")).setTimestamp();
      const out = { embeds: [embed, helpTest], files };
      if (wLayout === "bloques") {
        const hf = renderMsg(gc.welcomeHelpFooter || "", member);
        if (hf) out.content = hf;
      }
      return out;
    }
    return { embeds: [embed], files };
  }
  if (module === "goodbye") {
    const embed = new EmbedBuilder()
      .setTitle(renderMsg(gc.goodbyeTitle || `😢 ${member.displayName} salió del servidor`, member).substring(0, 256))
      .setDescription(renderMsg(gc.goodbyeDesc || `**${member.user.tag}** ya no está con nosotros. ¡Le deseamos lo mejor!`, member))
      .setColor(parseColor(gc.goodbyeColor || "#FF5555"))
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setTimestamp();
    const foot = renderMsg(gc.goodbyeFooter || "", member);
    if (foot) embed.setFooter({ text: foot });
    const files = [];
    if ((gc.goodbyeImage || "").toLowerCase() === "banner") {
      const buf = generateWelcomeBanner(member.displayName, member.user.displayAvatarURL(), guildId);
      files.push(new AttachmentBuilder(buf, { name: "goodbye-banner.png" }));
      embed.setImage("attachment://goodbye-banner.png");
    }
    applyEmbedExtras(embed, gc, "goodbye", member);
    const gLayoutT = (gc.goodbyeLayout || "").toLowerCase();
    if (gLayoutT === "secciones" || gLayoutT === "bloques") {
      const helpTest = new EmbedBuilder()
        .setDescription(renderMsg(gc.goodbyeHelp || "", member))
        .setColor(parseColor(gc.goodbyeColor || "#FF5555")).setTimestamp();
      const out = { embeds: [embed, helpTest], files };
      if (gLayoutT === "bloques") {
        const hf = renderMsg(gc.goodbyeHelpFooter || "", member);
        if (hf) out.content = hf;
      }
      return out;
    }
    return { embeds: [embed], files };
  }
  if (module === "tickets") {
    const cat = ticketCats(guildId)[0];
    const withCat = (s) => String(s || "").replace(/\{categoria\}/gi, cat.label);
    const tExtra = { ticketName: "ticket-ejemplo", ticketNumber: (gc.ticketCounter || 0) + 1, staffMention: gc.staffRoleId ? `<@&${gc.staffRoleId}>` : "Staff" };
    const embed = new EmbedBuilder()
      .setTitle(String(gc.ticketTitle || `${cat.emoji} Ticket Abierto — ${cat.label}`).substring(0, 256))
      .setDescription(renderMsg(withCat(gc.ticketDesc || `Hola <@${member.id}>, bienvenido a tu ticket de **${cat.label}**.\n\n${cat.desc}\n\nUn miembro del staff te atenderá pronto.`), member, tExtra))
      .setColor(parseColor(gc.ticketColor || "#00FF00"))
      .setFooter({ text: renderMsg(withCat(gc.ticketFooter || `${guild.name} • Soporte`), member, tExtra) })
      .setTimestamp();
    applyEmbedExtras(embed, gc, "ticket", member);
    const out = { embeds: [embed] };
    const testContent = renderMsg(withCat(gc.ticketContent || ""), member, tExtra);
    if (testContent) out.content = testContent;
    if (gc.ticketImage) {
      const bp = resolveTicketBanner(guildId, gc.ticketImage, "ticket");
      if (bp) {
        out.files = [new AttachmentBuilder(bp, { name: "ticket-banner.png" })];
        embed.setImage("attachment://ticket-banner.png");
      }
    }
    return out;
  }
  if (module === "invites") {
    const invExtra = { inviter: member.user.tag, invites: 3 };
    const embed = new EmbedBuilder()
      .setTitle(renderMsg(gc.invTitle || "📨 Nuevo Miembro", member, invExtra).substring(0, 256) || "📨 Nuevo Miembro")
      .setDescription(renderMsg(gc.invDesc || `<@${member.id}> se unió al servidor.\n\n📧 Invitado por: {inviter}\n🔢 Invites de {inviter}: **{invites}**`, member, invExtra).substring(0, 4000))
      .setColor(parseColor(gc.invColor || "#00FF00"))
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setTimestamp();
    const invFoot = renderMsg(gc.invFooter || "", member, invExtra);
    if (invFoot) embed.setFooter({ text: invFoot.substring(0, 2048) });
    applyEmbedExtras(embed, gc, "inv", member);
    const invOut = { embeds: [embed] };
    const invContent = renderMsg(gc.invContent || "", member, invExtra);
    if (invContent) invOut.content = invContent;
    return invOut;
  }
  throw new Error("módulo desconocido");
}

// ============== FUSIÓN DE COMANDOS (grupos con subcomandos) ==============
// Unifica comandos con la misma temática bajo un comando padre para_no
// gastar los 100 slots de Discord. El manejador sigue siendo el antiguo:
// al recibir /grupo sub, se reescriben commandName y options para que el
// código existente funcione sin cambios.
const MERGE_GROUPS = {
  musica: {
    desc: "Música: reproduce, salta, volumen y cola",
    subs: { reproducir: "play", pausar: "pause", seguir: "resume", detener: "stop", saltar: "skip", cola: "queue", sonando: "nowplaying", volumen: "volumen", repetir: "loop" },
  },
  diversion: {
    desc: "Diversión: azar, memes, clima, traducciones y más",
    subs: { meme: "meme", azar: "random", ship: "ship", dado: "8ball", clima: "clima", traducir: "traducir", cuenta_regresiva: "cuenta-regresiva", recordatorio: "recordatorio", momo: "momo" },
  },
  info: {
    desc: "Información de usuarios, canales, roles y del servidor",
    subs: { avatar: "avatar", usuario: "userinfo", canal: "channelinfo", servidor: "serverinfo", boosters: "boosters", roles: "role" },
  },
  minecraft: {
    desc: "Minecraft: estado de servidores, skins y perfiles",
    subs: { estado: "server", detalle: "mcstatus", skin: "skin", perfil: "mcprofile", nick: "mc-nick", prediccion: "predecir" },
  },
  redes: {
    desc: "Redes sociales: enlaza y consulta cuentas",
    subs: { enlace: "enlazar", ver: "redes", tweet: "tweet" },
  },
  verificacion: {
    desc: "Verificación: publica el panel y prueba el captcha",
    subs: { panel: "setup-verification", captcha: "captcha-test" },
  },
  enviar: {
    desc: "Envía anuncios y mensajes como el bot",
    subs: { anuncio: "anuncio", mensaje: "mensaje-bot" },
  },
  estadisticas: {
    desc: "Estadísticas y clasificación de miembros",
    subs: { usuario: "stats", tabla: "leaderboard" },
  },
  paneles: {
    desc: "Publica los paneles de los módulos",
    subs: { tickets: "ticket-setup", reactions: "reactionrole", rangos: "joinrank", respuestas: "autorespond", sticky: "sticky", tempvoice: "tempvoice-setup" },
  },
};
function addJsonOption(target, o) {
  const name = o.name;
  const desc = String(o.description || "opción").slice(0, 100);
  const req = !!o.required && !o.autocomplete;
  const choices = Array.isArray(o.choices) ? o.choices : [];
  const mk = x => { x.setName(name).setDescription(desc); if (req) x.setRequired(true); if (o.autocomplete) x.setAutocomplete(true); return x; };
  switch (o.type) {
    case 3: return target.addStringOption(x => { const y = mk(x); for (const c of choices) y.addChoices({ name: String(c.name).slice(0, 100), value: String(c.value).slice(0, 100) }); if (o.min_length != null) y.setMinLength(o.min_length); if (o.max_length != null) y.setMaxLength(o.max_length); return y; });
    case 4: return target.addIntegerOption(x => { const y = mk(x); if (o.min != null || o.max != null) y.setMinValue(o.min != null ? o.min : -2147483648).setMaxValue(o.max != null ? o.max : 2147483647); return y; });
    case 10: return target.addNumberOption(x => { const y = mk(x); if (o.min != null) y.setMinValue(o.min); if (o.max != null) y.setMaxValue(o.max); return y; });
    case 5: return target.addBooleanOption(mk);
    case 6: return target.addUserOption(mk);
    case 7: return target.addChannelOption(mk);
    case 8: return target.addRoleOption(mk);
    case 9: return target.addMentionableOption(mk);
    case 11: return target.addAttachmentOption(mk);
    default: return target;
  }
}
function buildMergedCommand(groupName, byName) {
  const g = MERGE_GROUPS[groupName];
  if (!g || !Object.keys(g.subs).length || Object.keys(g.subs).length > 25) return null;
  const b = new SlashCommandBuilder().setName(groupName).setDescription(String(g.desc).slice(0, 100));
  for (const [sub, orig] of Object.entries(g.subs)) {
    const src = byName.get(orig);
    if (!src) continue;
    const j = src.toJSON();
    const subs = (j.options || []).filter(o => o.type === 1);
    // El comando original ya tenía subcomandos -> se usa un grupo de subcomandos
    if (subs.length) {
      b.addSubcommandGroup(gp => {
        const s2 = gp.setName(sub).setDescription(String(j.description || orig).slice(0, 100));
        for (const so of subs) s2.addSubcommand(s3 => { const t = s3.setName(so.name).setDescription(String(so.description || so.name).slice(0, 100)); for (const o of (so.options || [])) addJsonOption(t, o); return t; });
        return s2;
      });
    } else {
      b.addSubcommand(sc => {
        const s2 = sc.setName(sub).setDescription(String(j.description || orig).slice(0, 100));
        for (const o of (j.options || [])) addJsonOption(s2, o);
        return s2;
      });
    }
  }
  return b;
}
function applyMerges(list) {
  const byName = new Map(list.map(c => [c.name, c]));
  const out = [];
  const done = new Set();
  const consumed = new Set();
  for (const c of list) {
    if (consumed.has(c.name)) continue;
    const gName = Object.keys(MERGE_GROUPS).find(g => Object.values(MERGE_GROUPS[g].subs).includes(c.name));
    if (!gName) { out.push(c); continue; }
    if (!done.has(gName)) {
      const built = buildMergedCommand(gName, byName);
      if (built) { out.push(built); done.add(gName); }
      for (const orig of Object.values(MERGE_GROUPS[gName].subs)) consumed.add(orig);
      continue;
    }
    consumed.add(c.name);
  }
  return out;
}
function syncOptionValue(interaction, o) {
  const id = o.value;
  try {
    if (o.type === 6) {
      const m = interaction.guild && interaction.guild.members && interaction.guild.members.cache.get(id);
      if (m) return m.user;
      const u = interaction.client && interaction.client.users && interaction.client.users.cache.get(id);
      return u || { id, tag: id, username: id, bot: false, send: async () => {} };
    }
    if (o.type === 7) {
      const ch = interaction.guild && interaction.guild.channels && interaction.guild.channels.cache.get(id);
      return ch || { id, name: id, send: async () => {}, isTextBased: () => true };
    }
    if (o.type === 8) {
      const r = interaction.guild && interaction.guild.roles && interaction.guild.roles.cache.get(id);
      return r || { id, name: id, mentionable: true, members: new Map() };
    }
    if (o.type === 11) {
      const a = interaction.message && interaction.message.attachments && interaction.message.attachments.get(id);
      return a || { id, name: id, url: "" };
    }
  } catch {}
  return o.value;
}
function applyMergeRoute(interaction) {
  try {
    if (!interaction.isChatInputCommand()) return false;
    const g = MERGE_GROUPS[interaction.commandName];
    if (!g) return false;
    const data = interaction.options.data && interaction.options.data.options ? interaction.options.data.options : [];
    if (!data.length) return false;
    const first = data[0];
    const sub1 = first.name;
    const orig = g.subs[sub1];
    if (!orig) return false;
    let innerName = "";
    let optList = Array.isArray(first.options) ? first.options : [];
    // Grupo de subcomandos (tipo 2): el código antiguo espera getSubcommand()
    if (first.type === 2) {
      const inner = optList.filter(o => o.type === 1);
      if (!inner.length) return false;
      innerName = inner[0].name;
      optList = Array.isArray(inner[0].options) ? inner[0].options : [];
    }
    try { Object.defineProperty(interaction, "commandName", { value: orig, configurable: true, writable: true }); } catch {}
    const plain = optList.filter(o => o.type !== 1);
    const nestedNames = first.type === 2 ? optList.filter(o => o.type === 1).map(o => o.name) : [];
    const proxy = new Proxy({}, {
      get(_, prop) {
        if (prop === "getSubcommand") return () => innerName;
        if (prop === "getSubcommandGroup") return () => first.type === 2 ? sub1 : null;
        if (prop === "getSubcommands") return () => nestedNames;
        if (typeof prop === "string" && prop.startsWith("get")) {
          const wanted = { String: 3, Integer: 4, Number: 10, Boolean: 5, User: 6, Channel: 7, Role: 8, Mentionable: 9, Attachment: 11 }[prop.slice(3)];
          if (wanted) return (name) => {
            const o = plain.find(x => x.name === name && x.type === wanted);
            if (!o) return null;
            return syncOptionValue(interaction, o);
          };
        }
        if (prop === "data") return { options: plain };
        return undefined;
      },
    });
    try { Object.defineProperty(interaction, "options", { value: proxy, configurable: true, writable: true }); } catch {}
    return true;
  } catch (e) {
    console.error("⚠️ applyMergeRoute:", e.message);
    return false;
  }
}

// ============== READY ==============
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ HYDRA Bot online: ${c.user.tag} | Servidores: ${c.guilds.cache.size}`);

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  const cmds = [
    new SlashCommandBuilder().setName("ping").setDescription("Muestra la latencia del bot").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("ayuda").setDescription("Muestra todos los comandos del bot"),
    new SlashCommandBuilder().setName("setup-verification").setDescription("Envía el panel de verificación").setDefaultMemberPermissions(0n),
    new SlashCommandBuilder().setName("captcha-test").setDescription("Prueba el sistema de captcha").setDefaultMemberPermissions(0n),
    new SlashCommandBuilder().setName("anuncio").setDescription("Abre el panel de anuncios embed").setDefaultMemberPermissions(0n),
    new SlashCommandBuilder().setName("mensaje-bot").setDescription("Envía un mensaje como el bot").setDefaultMemberPermissions(0n)
      .addStringOption(o => o.setName("mensaje").setDescription("Mensaje").setRequired(true))
      .addChannelOption(o => o.setName("canal").setDescription("Canal destino").setRequired(true))
      .addStringOption(o => o.setName("roles").setDescription("Roles a mencionar").setRequired(false))
      .addAttachmentOption(o => o.setName("imagen").setDescription("Imagen").setRequired(false))
      .addBooleanOption(o => o.setName("spoiler").setDescription("Spoiler").setRequired(false)),
    new SlashCommandBuilder().setName("clear").setDescription("Borra mensajes del canal").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption(o => o.setName("cantidad").setDescription("Cantidad (max 100)").setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption(o => o.setName("usuario").setDescription("Solo mensajes de este usuario").setRequired(false)),
    new SlashCommandBuilder().setName("slowmode").setDescription("Activa/desactiva slowmode").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addIntegerOption(o => o.setName("segundos").setDescription("Segundos (0 = desactivar)").setRequired(true).setMinValue(0).setMaxValue(21600)),
    new SlashCommandBuilder().setName("userinfo").setDescription("Información de un usuario")
      .addUserOption(o => o.setName("usuario").setDescription("Usuario a investigar").setRequired(false)),
    new SlashCommandBuilder().setName("avatar").setDescription("Muestra el avatar de un usuario")
      .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(false)),
    new SlashCommandBuilder().setName("channelinfo").setDescription("Información de un canal")
      .addChannelOption(o => o.setName("canal").setDescription("Canal").setRequired(false)),
    new SlashCommandBuilder().setName("boosters").setDescription("Lista los boosters del servidor"),
    new SlashCommandBuilder().setName("tweet").setDescription("Tweakea como alguien")
      .addStringOption(o => o.setName("usuario").setDescription("Nombre del usuario").setRequired(true))
      .addStringOption(o => o.setName("mensaje").setDescription("Mensaje del tweet").setRequired(true)),
    new SlashCommandBuilder().setName("encuesta").setDescription("Sistema de encuestas").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("crear").setDescription("Crea una encuesta")
        .addStringOption(o => o.setName("pregunta").setDescription("Pregunta").setRequired(true))
        .addStringOption(o => o.setName("opciones").setDescription("Opciones separadas por coma").setRequired(true)))
      .addSubcommand(s => s.setName("finalizar").setDescription("Finaliza una encuesta y muestra resultados")
        .addStringOption(o => o.setName("id").setDescription("ID de la encuesta (POLL-...) o ID del mensaje").setRequired(true))),
    new SlashCommandBuilder().setName("sugerencia").setDescription("Sistema de sugerencias")
      .addSubcommand(s => s.setName("enviar").setDescription("Envía una sugerencia")
        .addStringOption(o => o.setName("titulo").setDescription("Título").setRequired(true))
        .addStringOption(o => o.setName("descripcion").setDescription("Descripción").setRequired(true)))
      .addSubcommand(s => s.setName("finalizar").setDescription("Finaliza una sugerencia y muestra resultados")
        .addStringOption(o => o.setName("id").setDescription("ID de la sugerencia (SUG-1) o del mensaje").setRequired(true)))
      .addSubcommand(s => s.setName("aceptar").setDescription("Acepta una sugerencia (staff)")
        .addStringOption(o => o.setName("id").setDescription("ID de la sugerencia (SUG-1) o del mensaje").setRequired(true))
        .addStringOption(o => o.setName("razon").setDescription("Razón de la decisión").setRequired(false)))
      .addSubcommand(s => s.setName("rechazar").setDescription("Rechaza una sugerencia (staff)")
        .addStringOption(o => o.setName("id").setDescription("ID de la sugerencia (SUG-1) o del mensaje").setRequired(true))
        .addStringOption(o => o.setName("razon").setDescription("Razón de la decisión").setRequired(false)))
      .addSubcommand(s => s.setName("eliminar").setDescription("Elimina una sugerencia (staff)")
        .addStringOption(o => o.setName("id").setDescription("ID de la sugerencia (SUG-1) o del mensaje").setRequired(true)))
      .addSubcommand(s => s.setName("ver").setDescription("Muestra el detalle de una sugerencia (staff)")
        .addStringOption(o => o.setName("id").setDescription("ID de la sugerencia (SUG-1) o del mensaje").setRequired(true))),
    new SlashCommandBuilder().setName("sorteo").setDescription("Sistema de sorteos").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("crear").setDescription("Crea un sorteo")
        .addStringOption(o => o.setName("premio").setDescription("Premio").setRequired(true))
        .addIntegerOption(o => o.setName("duracion").setDescription("Duración en minutos").setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName("ganadores").setDescription("Número de ganadores").setRequired(false).setMinValue(1).setMaxValue(10))
        .addChannelOption(o => o.setName("canal").setDescription("Canal del sorteo").setRequired(false)))
      .addSubcommand(s => s.setName("finalizar").setDescription("Finaliza un sorteo")
        .addStringOption(o => o.setName("id").setDescription("ID del mensaje del sorteo").setRequired(true)))
      .addSubcommand(s => s.setName("editar").setDescription("Edita el premio de un sorteo")
        .addStringOption(o => o.setName("id").setDescription("ID del mensaje").setRequired(true))
        .addStringOption(o => o.setName("nuevo_premio").setDescription("Nuevo premio").setRequired(true))),
    new SlashCommandBuilder().setName("play").setDescription("Reproduce una canción")
      .addStringOption(o => o.setName("cancion").setDescription("Nombre o URL de YouTube").setRequired(true)),
    new SlashCommandBuilder().setName("pause").setDescription("Pausa la música"),
    new SlashCommandBuilder().setName("resume").setDescription("Reanuda la música"),
    new SlashCommandBuilder().setName("stop").setDescription("Detiene la música y sale del canal"),
    new SlashCommandBuilder().setName("skip").setDescription("Salta a la siguiente canción"),
    new SlashCommandBuilder().setName("queue").setDescription("Muestra la cola de reproducción"),
    new SlashCommandBuilder().setName("nowplaying").setDescription("Muestra la canción actual"),
    new SlashCommandBuilder().setName("volumen").setDescription("Ajusta el volumen")
      .addIntegerOption(o => o.setName("nivel").setDescription("Volumen (0-150)").setRequired(true).setMinValue(0).setMaxValue(150)),
    new SlashCommandBuilder().setName("loop").setDescription("Activa/desactiva repetición"),
    // ===== EVENTOS =====
    new SlashCommandBuilder().setName("evento").setDescription("Sistema de eventos de Minecraft")
      .addSubcommand(s => s.setName("crear").setDescription("Crea un nuevo evento (abre panel)"))
      .addSubcommand(s => s.setName("listar").setDescription("Muestra todos los eventos o detalle de uno")
        .addStringOption(o => o.setName("id").setDescription("ID del evento (opcional)").setRequired(false)))
      .addSubcommand(s => s.setName("participantes").setDescription("Muestra participantes de un evento")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true)))
      .addSubcommand(s => s.setName("cerrar").setDescription("Cierra inscripciones de un evento")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true)))
      .addSubcommand(s => s.setName("finalizar").setDescription("Finaliza un evento")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true)))
      .addSubcommand(s => s.setName("iniciar").setDescription("Inicia un evento (en curso)")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true)))
      .addSubcommand(s => s.setName("mostrar").setDescription("Muestra panel del evento en un canal")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true))
        .addChannelOption(o => o.setName("canal").setDescription("Canal destino").setRequired(false)))
      .addSubcommand(s => s.setName("eliminar").setDescription("Elimina un evento")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true)))
      .addSubcommand(s => s.setName("actualizar").setDescription("Reenvía el embed del evento con botones actualizados")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true))
        .addChannelOption(o => o.setName("canal").setDescription("Canal destino").setRequired(false))
        .addStringOption(o => o.setName("mencion").setDescription("¿Mencionar @miembro?").addChoices({ name: "Sí", value: "si" }, { name: "No", value: "no" }).setRequired(false)))
      .addSubcommand(s => s.setName("nombre").setDescription("Cambia el nombre de un evento")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true))
        .addStringOption(o => o.setName("nuevo").setDescription("Nuevo nombre").setRequired(true)))
      .addSubcommand(s => s.setName("descripcion").setDescription("Cambia la descripción de un evento")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true))
        .addStringOption(o => o.setName("nueva").setDescription("Nueva descripción").setRequired(true)))
      .addSubcommand(s => s.setName("modo").setDescription("Cambia el modo de juego de un evento")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true))
        .addStringOption(o => o.setName("nuevo").setDescription("Nuevo modo de juego").setRequired(true)))
      .addSubcommand(s => s.setName("cupos").setDescription("Aumenta los cupos de un evento")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true))
        .addIntegerOption(o => o.setName("nuevos").setDescription("Nuevos cupos totales").setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName("abrir").setDescription("Reabre inscripciones de un evento finalizado o cerrado")
        .addStringOption(o => o.setName("id").setDescription("ID del evento").setRequired(true))),
    new SlashCommandBuilder().setName("status").setDescription("Configura la presencia del bot").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("set").setDescription("Configura manualmente la presencia del bot")
        .addStringOption(o => o.setName("estado").setDescription("Estado del bot").setRequired(true).addChoices(
          { name: "En linea", value: "online" },
          { name: "Ausente", value: "idle" },
          { name: "No molestar", value: "dnd" },
          { name: "Invisible", value: "invisible" },
        ))
        .addStringOption(o => o.setName("actividad").setDescription("Actividad del bot").setRequired(true).addChoices(
          { name: "Jugando", value: "playing" },
          { name: "Escuchando", value: "listening" },
          { name: "Mirando", value: "watching" },
          { name: "Compitiendo", value: "competing" },
          { name: "Transmitiendo", value: "streaming" },
          { name: "Spotify (auto)", value: "spotify" },
          { name: "Ninguna", value: "none" },
        ))
        .addStringOption(o => o.setName("texto").setDescription("Texto de la actividad").setRequired(false))
        .addStringOption(o => o.setName("url").setDescription("URL de Twitch/YouTube (solo streaming)").setRequired(false)))
      .addSubcommand(s => s.setName("reset").setDescription("Resetea la presencia del bot")),
    // ===== EQUIPOS =====
    new SlashCommandBuilder().setName("equipo").setDescription("Sistema de equipos")
      .addSubcommand(s => s.setName("crear").setDescription("Abre el panel para crear un equipo"))
      .addSubcommand(s => s.setName("listar").setDescription("Muestra todos los equipos"))
      .addSubcommand(s => s.setName("eliminar").setDescription("Elimina un equipo")
        .addStringOption(o => o.setName("nombre").setDescription("Nombre del equipo").setRequired(true)))
      .addSubcommand(s => s.setName("invitar").setDescription("Invita a un usuario a tu equipo")
        .addUserOption(o => o.setName("usuario").setDescription("Usuario a invitar").setRequired(true)))
      .addSubcommand(s => s.setName("expulsar").setDescription("Expulsa a un miembro del equipo")
        .addUserOption(o => o.setName("usuario").setDescription("Usuario a expulsar").setRequired(true)))
      .addSubcommand(s => s.setName("salir").setDescription("Sal de tu equipo actual"))
      .addSubcommand(s => s.setName("aceptar").setDescription("Acepta una invitación de equipo")
        .addStringOption(o => o.setName("equipo").setDescription("Nombre del equipo").setRequired(true)))
      .addSubcommand(s => s.setName("rechazar").setDescription("Rechaza una invitación de equipo")
        .addStringOption(o => o.setName("equipo").setDescription("Nombre del equipo").setRequired(true))),
    // ===== SERVER STATUS =====
    new SlashCommandBuilder().setName("server").setDescription("Estado del servidor Minecraft")
      .addSubcommand(s => s.setName("status").setDescription("Muestra el estado del servidor"))
      .addSubcommand(s => s.setName("edit").setDescription("Cambia la IP del servidor")
        .addStringOption(o => o.setName("ip").setDescription("IP del servidor").setRequired(true))
        .addIntegerOption(o => o.setName("puerto").setDescription("Puerto").setRequired(false))),
    // ===== PREDICCIONES =====
    new SlashCommandBuilder().setName("predecir").setDescription("Predice quién ganará un evento")
      .addRoleOption(o => o.setName("equipo").setDescription("Equipo que crees que ganará").setRequired(true))
      .addStringOption(o => o.setName("evento").setDescription("Nombre del evento").setRequired(true)),
    // ===== ENLAZAR REDES =====
    new SlashCommandBuilder().setName("enlazar").setDescription("Enlaza tu red social")
      .addSubcommand(s => s.setName("cuenta").setDescription("Enlaza una cuenta de red social")
        .addStringOption(o => o.setName("plataforma").setDescription("Plataforma").setRequired(true)
          .addChoices(
            { name: "Twitch", value: "twitch" }, { name: "YouTube", value: "youtube" },
            { name: "Kick", value: "kick" }, { name: "TikTok", value: "tiktok" },
            { name: "X (Twitter)", value: "x" }, { name: "Instagram", value: "instagram" },
          ))
        .addStringOption(o => o.setName("url").setDescription("URL o usuario").setRequired(true)))
      .addSubcommand(s => s.setName("canal").setDescription("Configura canal de notificaciones por plataforma")
        .addStringOption(o => o.setName("plataforma").setDescription("Plataforma").setRequired(true)
          .addChoices(
            { name: "Twitch", value: "twitch" }, { name: "YouTube", value: "youtube" },
            { name: "Kick", value: "kick" }, { name: "TikTok", value: "tiktok" },
            { name: "X (Twitter)", value: "x" }, { name: "Instagram", value: "instagram" },
          ))
        .addChannelOption(o => o.setName("canal").setDescription("Canal para notificaciones").setRequired(true)))
      .addSubcommand(s => s.setName("ver-canales").setDescription("Muestra los canales de notificación configurados")),
    new SlashCommandBuilder().setName("redes").setDescription("Muestra las redes de un usuario")
      .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(false)),
    // ===== STATS & LEADERBOARD =====
    new SlashCommandBuilder().setName("stats").setDescription("Estadísticas de un usuario")
      .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(false)),
    new SlashCommandBuilder().setName("leaderboard").setDescription("Clasificación de miembros"),
    // ===== STAFF =====
    new SlashCommandBuilder().setName("staff").setDescription("Gestionar lista de staff")
      .addSubcommand(s => s.setName("agregar").setDescription("Agrega un usuario o rol al staff")
        .addStringOption(o => o.setName("tipo").setDescription("¿Usuario o rol?").setRequired(true).addChoices({ name: "Usuario", value: "user" }, { name: "Rol", value: "role" }))
        .addStringOption(o => o.setName("id").setDescription("ID del usuario o rol").setRequired(true)))
      .addSubcommand(s => s.setName("quitar").setDescription("Quita un usuario o rol del staff")
        .addStringOption(o => o.setName("tipo").setDescription("¿Usuario o rol?").setRequired(true).addChoices({ name: "Usuario", value: "user" }, { name: "Rol", value: "role" }))
        .addStringOption(o => o.setName("id").setDescription("ID del usuario o rol").setRequired(true)))
      .addSubcommand(s => s.setName("listar").setDescription("Muestra la lista de staff")),
    // ===== BOTMODE =====
    // ===== CLIPS =====
    new SlashCommandBuilder().setName("clip").setDescription("Sistema de clips del server")
      .addSubcommand(s => s.setName("guardar").setDescription("Guarda un clip del server")
        .addStringOption(o => o.setName("titulo").setDescription("Título del momento").setRequired(true))
        .addStringOption(o => o.setName("descripcion").setDescription("Qué pasó exactamente").setRequired(false))
        .addStringOption(o => o.setName("link").setDescription("Link del VOD/stream (YouTube/Twitch/Kick)").setRequired(false))
        .addStringOption(o => o.setName("inicio").setDescription("Minuto de inicio (ej: 45:32)").setRequired(false))
        .addStringOption(o => o.setName("fin").setDescription("Minuto de fin (ej: 46:10)").setRequired(false))
        .addStringOption(o => o.setName("menciones").setDescription("¿Quiénes estaban? (@menciones)").setRequired(false)))
      .addSubcommand(s => s.setName("listar").setDescription("Muestra los clips más recientes"))
      .addSubcommand(s => s.setName("buscar").setDescription("Busca clips por término")
        .addStringOption(o => o.setName("termino").setDescription("Término de búsqueda").setRequired(true)))
      .addSubcommand(s => s.setName("favoritos").setDescription("Muestra los clips favoritos"))
      .addSubcommand(s => s.setName("eliminar").setDescription("Elimina un clip")
        .addStringOption(o => o.setName("id").setDescription("ID del clip").setRequired(true))),
    // ===== TICKETS =====
    new SlashCommandBuilder().setName("ticket-setup").setDescription("Envía el panel de tickets").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("ticket").setDescription("Gestionar el ticket actual").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("cerrar").setDescription("Cierra el ticket actual"))
      .addSubcommand(s => s.setName("reclamar").setDescription("Reclama el ticket (solo tú y el usuario podrán escribir)"))
      .addSubcommand(s => s.setName("renombrar").setDescription("Renombra el ticket actual")
        .addStringOption(o => o.setName("nombre").setDescription("Nuevo nombre para el canal").setRequired(true)))
      .addSubcommand(s => s.setName("escribir").setDescription("Permite a otro staff escribir en un ticket reclamado")
        .addUserOption(o => o.setName("staff").setDescription("Staff al que dar permiso de escritura").setRequired(true)))
      .addSubcommand(s => s.setName("agregar").setDescription("Agrega un usuario al ticket")
        .addUserOption(o => o.setName("usuario").setDescription("Usuario a agregar al ticket").setRequired(true))),
    // ===== MODERATION =====
    new SlashCommandBuilder().setName("lock").setDescription("Bloquea el canal (nadie puede escribir)").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder().setName("unlock").setDescription("Desbloquea el canal").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder().setName("warns").setDescription("Muestra las advertencias de un usuario").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario (vacío = tus warns)").setRequired(false)),
    // Sanciones clásicas: los manejadores llevaban aquí sin comando publicado
    new SlashCommandBuilder().setName("ban").setDescription("Banea a un usuario del servidor y abre su caso").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario a banear").setRequired(true))
      .addStringOption(o => o.setName("razon").setDescription("Motivo del baneo").setRequired(false))
      .addIntegerOption(o => o.setName("borrar_dias").setDescription("Borrar mensajes de los últimos días (0-7)").setMinValue(0).setMaxValue(7).setRequired(false)),
    new SlashCommandBuilder().setName("tempban").setDescription("Banea a un usuario durante un tiempo determinado").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario a banear").setRequired(true))
      .addStringOption(o => o.setName("duracion").setDescription("Duración: 10m, 2h, 7d...").setRequired(true))
      .addStringOption(o => o.setName("razon").setDescription("Motivo del baneo").setRequired(false)),
    new SlashCommandBuilder().setName("unban").setDescription("Levanta el baneo de un usuario").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption(o => o.setName("usuario").setDescription("ID del usuario a desbanear").setRequired(true))
      .addStringOption(o => o.setName("razon").setDescription("Motivo").setRequired(false)),
    new SlashCommandBuilder().setName("kick").setDescription("Expulsa a un usuario del servidor").setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario a expulsar").setRequired(true))
      .addStringOption(o => o.setName("razon").setDescription("Motivo de la expulsión").setRequired(false)),
    new SlashCommandBuilder().setName("softban").setDescription("Banea y desbanea al instante para borrar sus mensajes").setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
      .addStringOption(o => o.setName("razon").setDescription("Motivo").setRequired(false))
      .addIntegerOption(o => o.setName("borrar_dias").setDescription("Borrar mensajes de los últimos días (0-7)").setMinValue(0).setMaxValue(7).setRequired(false)),
    new SlashCommandBuilder().setName("warn").setDescription("Aplica una advertencia y abre su caso").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario a advertir").setRequired(true))
      .addStringOption(o => o.setName("razon").setDescription("Motivo de la advertencia").setRequired(false)),
    new SlashCommandBuilder().setName("delwarn").setDescription("Retira una advertencia por su caso (WARN-n)").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addStringOption(o => o.setName("caso").setDescription("Caso a retirar (ej: WARN-3)").setRequired(true)),
    new SlashCommandBuilder().setName("timeout").setDescription("Silencia a un usuario durante unos minutos").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario a silenciar").setRequired(true))
      .addIntegerOption(o => o.setName("minutos").setDescription("Minutos (1-40320 = 28 días)").setMinValue(1).setMaxValue(40320).setRequired(true)),
    new SlashCommandBuilder().setName("purge").setDescription("Borra mensajes con filtro").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption(o => o.setName("cantidad").setDescription("Cantidad a revisar (1-100)").setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption(o => o.setName("usuario").setDescription("Solo de este usuario").setRequired(false))
      .addStringOption(o => o.setName("texto").setDescription("Solo los que contengan este texto").setRequired(false)),
    new SlashCommandBuilder().setName("setnick").setDescription("Cambia el apodo de un usuario").setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
      .addStringOption(o => o.setName("nick").setDescription("Nuevo apodo (vacío = quitar)").setRequired(false)),
    new SlashCommandBuilder().setName("vmute").setDescription("Mutea/desmutea a alguien en voz").setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario en voz").setRequired(true)),
    new SlashCommandBuilder().setName("vockick").setDescription("Desconecta a alguien del canal de voz").setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario en voz").setRequired(true))
      .addStringOption(o => o.setName("razon").setDescription("Razón").setRequired(false)),
    // ===== UTILITY =====
    new SlashCommandBuilder().setName("recordatorio").setDescription("Te recuerdo algo por DM después de un tiempo")
      .addStringOption(o => o.setName("tiempo").setDescription("Ej: 10m, 2h, 1d").setRequired(true))
      .addStringOption(o => o.setName("mensaje").setDescription("¿Qué recordar?").setRequired(true)),
    new SlashCommandBuilder().setName("clima").setDescription("Muestra el clima de una ciudad")
      .addStringOption(o => o.setName("ciudad").setDescription("Nombre de la ciudad").setRequired(true)),
    new SlashCommandBuilder().setName("traducir").setDescription("Traduce un texto a otro idioma")
      .addStringOption(o => o.setName("texto").setDescription("Texto a traducir").setRequired(true))
      .addStringOption(o => o.setName("idioma").setDescription("Idioma destino (en, fr, pt, ja, ko, etc)").setRequired(true)),
    // ===== MINECRAFT =====
    new SlashCommandBuilder().setName("skin").setDescription("Muestra la skin de un jugador de Minecraft")
      .addStringOption(o => o.setName("jugador").setDescription("Nombre del jugador").setRequired(true)),
    new SlashCommandBuilder().setName("mcprofile").setDescription("Muestra el perfil de un jugador de Minecraft")
      .addStringOption(o => o.setName("jugador").setDescription("Nombre del jugador").setRequired(true)),
    // ===== EVENTS =====
    new SlashCommandBuilder().setName("cuenta-regresiva").setDescription("Muestra una cuenta regresiva para un evento")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre del evento").setRequired(true))
      .addStringOption(o => o.setName("fecha").setDescription("Fecha (YYYY-MM-DD)").setRequired(true))
      .addStringOption(o => o.setName("hora").setDescription("Hora (HH:MM)").setRequired(true)),
    // ===== FUN / SOCIAL =====
    new SlashCommandBuilder().setName("invite").setDescription("Muestra estadísticas de invitaciones del servidor"),
    new SlashCommandBuilder().setName("meme").setDescription("Muestra un meme aleatorio de Reddit"),
    new SlashCommandBuilder().setName("random").setDescription("Genera un número aleatorio")
      .addIntegerOption(o => o.setName("min").setDescription("Número mínimo").setRequired(true))
      .addIntegerOption(o => o.setName("max").setDescription("Número máximo").setRequired(true)),
    new SlashCommandBuilder().setName("ship").setDescription("Muestra la compatibilidad entre dos usuarios")
      .addUserOption(o => o.setName("usuario1").setDescription("Primer usuario").setRequired(true))
      .addUserOption(o => o.setName("usuario2").setDescription("Segundo usuario").setRequired(true)),
    new SlashCommandBuilder().setName("8ball").setDescription("Bola mágica 8 - haz tu pregunta")
      .addStringOption(o => o.setName("pregunta").setDescription("Tu pregunta").setRequired(true)),
    new SlashCommandBuilder().setName("serverinfo").setDescription("Muestra información del servidor"),
    new SlashCommandBuilder().setName("mcstatus").setDescription("Status detallado de un servidor Minecraft")
      .addStringOption(o => o.setName("ip").setDescription("IP del servidor (ej: hypixel.net)")
        .setRequired(true))
      .addIntegerOption(o => o.setName("puerto").setDescription("Puerto (default 25565)")
        .setRequired(false)),
    new SlashCommandBuilder().setName("img").setDescription("Efectos e imágenes")
      .addSubcommand(s => s.setName("bounce").setDescription("Genera un GIF del avatar de un usuario rebotando")
        .addUserOption(o => o.setName("usuario").setDescription("Usuario cuyo avatar rebotará").setRequired(false)))
      .addSubcommand(s => s.setName("globo").setDescription("Crea un globo de texto con tu mensaje")
        .addStringOption(o => o.setName("texto").setDescription("Texto del globo").setRequired(true)))
      .addSubcommand(s => s.setName("void").setDescription("Pone efecto void a tu imagen")
        .addAttachmentOption(o => o.setName("imagen").setDescription("Imagen a efecto void").setRequired(true)))
      .addSubcommand(s => s.setName("source").setDescription("Busca el source de una imagen")
        .addAttachmentOption(o => o.setName("imagen").setDescription("Imagen a buscar").setRequired(true))),
    new SlashCommandBuilder().setName("nuke").setDescription("Vacía un canal y lo duplica con los mismos permisos").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName("clonar").setDescription("Clona un canal a una categoría específica").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption(o => o.setName("canal").setDescription("Canal a clonar").setRequired(true))
      .addStringOption(o => o.setName("nombre").setDescription("Nuevo nombre del canal clonado").setRequired(true))
      .addChannelOption(o => o.setName("categoria").setDescription("Categoría destino (opcional)").setRequired(false)),
    new SlashCommandBuilder().setName("momo").setDescription("Momos del server")
      .addSubcommand(s => s.setName("ver").setDescription("Muestra un momo aleatorio"))
      .addSubcommand(s => s.setName("reciente").setDescription("Muestra el momo más reciente")),
    new SlashCommandBuilder().setName("aporte").setDescription("Aportes al bot")
      .addSubcommand(s => s.setName("enviar").setDescription("Aporta source images y videos al bot")
        .addStringOption(o => o.setName("url").setDescription("URL de la imagen/video").setRequired(true))
        .addStringOption(o => o.setName("descripcion").setDescription("Descripción del aporte").setRequired(false)))
      .addSubcommand(s => s.setName("estado").setDescription("Verifica el estado de tu aporte")),
    new SlashCommandBuilder().setName("bot").setDescription("Control del bot (dueño)").setDefaultMemberPermissions(0n)
      .addSubcommand(s => s.setName("testjoin").setDescription("Simula un usuario uniéndose (prueba de bienvenida)")
        .addUserOption(o => o.setName("usuario").setDescription("Usuario a simular que se une").setRequired(false)))
      .addSubcommand(s => s.setName("control").setDescription("Panel de control (apagar/reiniciar)"))
      .addSubcommand(s => s.setName("suspender").setDescription("Suspende el bot (solo eventos y control funcionan)"))
      .addSubcommand(s => s.setName("activar").setDescription("Reactiva el bot desde suspendido"))
      .addSubcommand(s => s.setName("apagar").setDescription("Apaga el bot completamente"))
      .addSubcommand(s => s.setName("reiniciar").setDescription("Reinicia el bot"))
      .addSubcommand(s => s.setName("iniciar").setDescription("Activa el bot"))
      .addSubcommand(s => s.setName("modo").setDescription("Cambia el estado/presencia del bot")
        .addStringOption(o => o.setName("modo").setDescription("Tipo de actividad").setRequired(true).addChoices(
          { name: "Jugando", value: "playing" },
          { name: "Escuchando", value: "listening" },
          { name: "Mirando", value: "watching" },
          { name: "Compitiendo", value: "competing" },
          { name: "Transmitiendo", value: "streaming" },
          { name: "Quitar actividad", value: "none" },
        ))
        .addStringOption(o => o.setName("texto").setDescription("Texto de la actividad").setRequired(false))),
    // ===== CONFESSIONS =====
    new SlashCommandBuilder().setName("confesar").setDescription("Envía una confesión anónima"),
    new SlashCommandBuilder().setName("borrar").setDescription("Elimina una confesión propia")
      .addStringOption(o => o.setName("enlace").setDescription("Enlace del mensaje de la confesión").setRequired(true)),
    new SlashCommandBuilder().setName("responder").setDescription("Responde anónimamente a una confesión")
      .addStringOption(o => o.setName("enlace").setDescription("Enlace del mensaje de la confesión").setRequired(true))
      .addStringOption(o => o.setName("respuesta").setDescription("Tu respuesta").setRequired(true)),
    new SlashCommandBuilder().setName("reportar").setDescription("Reporta una confesión por contenido inapropiado")
      .addStringOption(o => o.setName("enlace").setDescription("Enlace del mensaje de la confesión").setRequired(true))
      .addStringOption(o => o.setName("razon").setDescription("Razón del reporte").setRequired(true)),
    new SlashCommandBuilder().setName("apelar").setDescription("Apela un baneo de confesiones")
      .addStringOption(o => o.setName("razon").setDescription("Explica por qué deberías poder confesar de nuevo").setRequired(true)),
    new SlashCommandBuilder().setName("confesion").setDescription("Moderar confesiones").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("banear").setDescription("Banea a un usuario de confesar")
        .addUserOption(o => o.setName("usuario").setDescription("Usuario a banear").setRequired(true))
        .addStringOption(o => o.setName("razon").setDescription("Razón del baneo").setRequired(false)))
      .addSubcommand(s => s.setName("desbanear").setDescription("Desbanea a un usuario de confesiones")
        .addUserOption(o => o.setName("usuario").setDescription("Usuario a desbanear").setRequired(true)))
      .addSubcommand(s => s.setName("historial").setDescription("Muestra historial de confesiones")
        .addUserOption(o => o.setName("usuario").setDescription("Ver historial de otro usuario (solo staff)").setRequired(false)))
      .addSubcommand(s => s.setName("baneados").setDescription("Muestra la lista de usuarios baneados de confesar"))
      .addSubcommand(s => s.setName("limpiar").setDescription("Limpia toda la lista de baneos de confesiones")),
    new SlashCommandBuilder().setName("md").setDescription("DMs de inscripción a eventos").setDefaultMemberPermissions(0n)
      .addSubcommand(s => s.setName("mensaje").setDescription("Envía DM personalizado a un usuario o a todos con un rol"))
      .addSubcommand(s => s.setName("prueba").setDescription("Envía el DM de prueba a ti mismo")
        .addStringOption(o => o.setName("texto").setDescription("Texto del mensaje").setRequired(true))
        .addStringOption(o => o.setName("evento").setDescription("ID del evento (ej: EVT-5)").setRequired(false)))
      .addSubcommand(s => s.setName("limpiar").setDescription("Elimina los mensajes de inscripción enviados a todos los jugadores")
        .addStringOption(o => o.setName("evento").setDescription("ID del evento (ej: EVT-5)").setRequired(true)))
      .addSubcommand(s => s.setName("recordar").setDescription("Envía DM de recordatorio SOLO a quienes no han confirmado inscripción")
        .addStringOption(o => o.setName("evento").setDescription("ID del evento (ej: EVT-5)").setRequired(true))
        .addStringOption(o => o.setName("texto").setDescription("Texto del recordatorio (opcional)").setRequired(false))),
    new SlashCommandBuilder().setName("mc-nick").setDescription("Guarda o consulta tu nick de Minecraft")
      .addSubcommand(sub => sub.setName("guardar").setDescription("Guarda tu nick de Minecraft")
        .addStringOption(o => o.setName("nick").setDescription("Tu nick de Minecraft").setRequired(true)))
      .addSubcommand(sub => sub.setName("ver").setDescription("Ver el nick de un usuario")
        .addUserOption(o => o.setName("usuario").setDescription("Usuario a consultar").setRequired(false)))
      .addSubcommand(sub => sub.setName("lista").setDescription("Lista todos los nicks guardados")),
    new SlashCommandBuilder().setName("role").setDescription("Gestión masiva de roles")
      .addSubcommand(s => s.setName("giveall").setDescription("Da un rol a todos los miembros")
        .addRoleOption(o => o.setName("rol").setDescription("Rol a entregar").setRequired(true))
        .addBooleanOption(o => o.setName("solo-humanos").setDescription("Excluir bots (por defecto sí)").setRequired(false)))
      .addSubcommand(s => s.setName("removeall").setDescription("Quita un rol a todos los miembros")
        .addRoleOption(o => o.setName("rol").setDescription("Rol a quitar").setRequired(true))
        .addBooleanOption(o => o.setName("solo-humanos").setDescription("Excluir bots (por defecto sí)").setRequired(false)))
      .addSubcommand(s => s.setName("count").setDescription("Cuenta miembros con un rol")
        .addRoleOption(o => o.setName("rol").setDescription("Rol a contar").setRequired(true))),
    new SlashCommandBuilder().setName("afk").setDescription("Establece tu estado AFK")
      .addStringOption(o => o.setName("razon").setDescription("Razón del AFK (opcional)").setRequired(false)),
    new SlashCommandBuilder().setName("reactionrole").setDescription("Gestionar roles por reacción").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("agregar").setDescription("Añade un role-reaction")
        .addStringOption(o => o.setName("mensaje-id").setDescription("ID del mensaje").setRequired(true))
        .addStringOption(o => o.setName("emoji").setDescription("Emoji de la reacción").setRequired(true))
        .addRoleOption(o => o.setName("rol").setDescription("Rol a asignar").setRequired(true))
        .addStringOption(o => o.setName("tipo").setDescription("Tipo").addChoices({ name: "Normal", value: "normal" }, { name: "Toggle", value: "toggle" }).setRequired(false)))
      .addSubcommand(s => s.setName("quitar").setDescription("Elimina un role-reaction")
        .addStringOption(o => o.setName("mensaje-id").setDescription("ID del mensaje").setRequired(true))
        .addStringOption(o => o.setName("emoji").setDescription("Emoji").setRequired(true)))
      .addSubcommand(s => s.setName("lista").setDescription("Lista todos los reaction roles")),
    new SlashCommandBuilder().setName("autorespond").setDescription("Gestionar respuestas automáticas").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("agregar").setDescription("Añade una respuesta automática")
        .addStringOption(o => o.setName("trigger").setDescription("Texto que activa la respuesta").setRequired(true))
        .addStringOption(o => o.setName("respuesta").setDescription("Respuesta del bot").setRequired(true))
        .addStringOption(o => o.setName("canal").setDescription("Canal específico (dejar vacío = todos)").setRequired(false))
        .addBooleanOption(o => o.setName("mencion").setDescription("Requiere mencionar al bot").setRequired(false))
        .addBooleanOption(o => o.setName("eliminar-trigger").setDescription("Eliminar el mensaje que activó").setRequired(false)))
      .addSubcommand(s => s.setName("quitar").setDescription("Elimina una respuesta automática")
        .addStringOption(o => o.setName("trigger").setDescription("Trigger a eliminar").setRequired(true)))
      .addSubcommand(s => s.setName("lista").setDescription("Lista todas las respuestas automáticas")),
    new SlashCommandBuilder().setName("joinrank").setDescription("Auto-asigna un rol desde la lista de rangos")
      .addStringOption(o => o.setName("emoji").setDescription("Emoji del rol que quieres").setRequired(true)),
    new SlashCommandBuilder().setName("sticky").setDescription("Gestionar mensajes sticky").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("agregar").setDescription("Fija un mensaje sticky en un canal")
        .addChannelOption(o => o.setName("canal").setDescription("Canal destino").setRequired(true))
        .addStringOption(o => o.setName("mensaje").setDescription("Contenido del mensaje sticky").setRequired(true)))
      .addSubcommand(s => s.setName("quitar").setDescription("Elimina el sticky de un canal")
        .addChannelOption(o => o.setName("canal").setDescription("Canal").setRequired(true)))
      .addSubcommand(s => s.setName("lista").setDescription("Lista todos los stickies")),
    new SlashCommandBuilder().setName("tempvoice-setup").setDescription("Publica el panel de control de canales de voz").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption(o => o.setName("canal").setDescription("Canal donde publicar (vacío = aquí)").setRequired(false)),
    new SlashCommandBuilder().setName("rescate").setDescription("Rescate y propiedad del bot: claves de recuperación y co-propietarios").setDefaultMemberPermissions(0n)
      .addSubcommand(s => s.setName("generar").setDescription("Genera una clave de rescate de un solo uso (24 h)"))
      .addSubcommand(s => s.setName("usar").setDescription("Usa una clave de rescate para recuperar el control del bot")
        .addStringOption(o => o.setName("clave").setDescription("Clave de rescate").setRequired(true)))
      .addSubcommand(s => s.setName("revocar").setDescription("Revoca la clave de rescate activa"))
      .addSubcommand(s => s.setName("info").setDescription("Muestra la clave activa, los rescates y los co-propietarios")),
    new SlashCommandBuilder().setName("media").setDescription("Muestra los requisitos para entrar al equipo Media"),
    new SlashCommandBuilder().setName("perfil").setDescription("Tu perfil de freelancer: disponibilidad, horario y servicios")
      .addStringOption(o => o.setName("disponible").setDescription("¿Estás disponible?").setRequired(false)
        .addChoices({ name: "Sí, disponible", value: "si" }, { name: "No, no disponible", value: "no" }))
      .addStringOption(o => o.setName("horario").setDescription("Tu horario (ej: L-V 9:00-17:00)").setRequired(false))
      .addStringOption(o => o.setName("bio").setDescription("Descripción de tus servicios").setRequired(false))
      .addStringOption(o => o.setName("servicios").setDescription("Servicios, separados por comas").setRequired(false)),
    new SlashCommandBuilder().setName("resena").setDescription("Deja una reseña con estrellas a un freelancer")
      .addUserOption(o => o.setName("usuario").setDescription("Freelancer a valorar").setRequired(true))
      .addIntegerOption(o => o.setName("estrellas").setDescription("Estrellas (1-5)").setRequired(true).setMinValue(1).setMaxValue(5))
      .addStringOption(o => o.setName("comentario").setDescription("Comentario").setRequired(false)),
    new SlashCommandBuilder().setName("factura").setDescription("Crea una factura (Stripe, PayPal o QR de cripto)")
      .addStringOption(o => o.setName("vendedor").setDescription("ID del vendedor").setRequired(true))
      .addStringOption(o => o.setName("cliente").setDescription("ID del cliente").setRequired(true))
      .addStringOption(o => o.setName("servicio").setDescription("Servicio").setRequired(true))
      .addNumberOption(o => o.setName("importe").setDescription("Importe en USD").setRequired(true))
      .addStringOption(o => o.setName("metodo").setDescription("Método de pago").setRequired(true)
        .addChoices({ name: "Cripto (QR)", value: "crypto" }, { name: "PayPal", value: "paypal" }, { name: "Stripe", value: "stripe" })),
    new SlashCommandBuilder().setName("sancionar").setDescription("Abre el panel de sanción: elige el tipo, la razón, las pruebas y el tiempo").setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(o => o.setName("usuario").setDescription("Usuario a sancionar").setRequired(true))
      .addStringOption(o => o.setName("duracion").setDescription("Duración para aislar o ban temporal (10m, 2h, 7d)").setRequired(false)),
    new SlashCommandBuilder().setName("registrar").setDescription("Fuerza el registro de comandos en Discord (solo dueño)").setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName("licencia").setDescription("Gestiona la licencia Premium de este servidor").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("info").setDescription("Muestra el estado de la licencia"))
      .addSubcommand(s => s.setName("activar").setDescription("Activa una licencia en este servidor")
        .addStringOption(o => o.setName("clave").setDescription("Clave de licencia").setRequired(true))
        .addStringOption(o => o.setName("plan").setDescription("Plan de la licencia").setRequired(false)
          .addChoices({ name: "Licencia perpetua", value: "perpetual" }, { name: "Suscripción", value: "sub" },
            { name: "Boost", value: "boost" }, { name: "Licencia por marca", value: "white" }, { name: "Donante", value: "donate" }))
        .addIntegerOption(o => o.setName("dias").setDescription("Días de validez (0 = perpetua)").setRequired(false).setMinValue(0).setMaxValue(3650)))
      .addSubcommand(s => s.setName("quitar").setDescription("Quita una licencia de este servidor")
        .addStringOption(o => o.setName("clave").setDescription("Clave a quitar").setRequired(true))),
    new SlashCommandBuilder().setName("metricas").setDescription("Métricas de uso de comandos (Premium)").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addIntegerOption(o => o.setName("dias").setDescription("Días a mostrar (1-30)").setRequired(false).setMinValue(1).setMaxValue(30)),
    new SlashCommandBuilder().setName("contador").setDescription("Canales de estadísticas automáticas (Premium)").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("crear").setDescription("Crea un contador en un canal")
        .addChannelOption(o => o.setName("canal").setDescription("Canal donde publicarlo").setRequired(true))
        .addStringOption(o => o.setName("tipo").setDescription("Qué cuenta").setRequired(true)
          .addChoices({ name: "Miembros", value: "members" }, { name: "En línea", value: "online" },
            { name: "En voz", value: "voice" }, { name: "Bots", value: "bots" })))
      .addSubcommand(s => s.setName("actualizar").setDescription("Actualiza ahora todos los contadores"))
      .addSubcommand(s => s.setName("lista").setDescription("Lista los contadores")),
    new SlashCommandBuilder().setName("mensaje").setDescription("Mensajes automáticos de entrada y salida (Premium)").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("activar").setDescription("Activa los mensajes de entrada o salida en un canal")
        .addStringOption(o => o.setName("tipo").setDescription("Tipo de mensaje").setRequired(true)
          .addChoices({ name: "Entrada", value: "join" }, { name: "Salida", value: "leave" }))
        .addChannelOption(o => o.setName("canal").setDescription("Canal de registros").setRequired(true)))
      .addSubcommand(s => s.setName("desactivar").setDescription("Desactiva los mensajes en un canal")
        .addStringOption(o => o.setName("tipo").setDescription("Tipo").setRequired(true)
          .addChoices({ name: "Entrada", value: "join" }, { name: "Salida", value: "leave" }))
        .addChannelOption(o => o.setName("canal").setDescription("Canal").setRequired(true)))
      .addSubcommand(s => s.setName("lista").setDescription("Canales con mensajes activos")),
    new SlashCommandBuilder().setName("temporizador").setDescription("Programa un mensaje para más tarde (Premium)").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("crear").setDescription("Crea un temporizador")
        .addStringOption(o => o.setName("texto").setDescription("Mensaje a enviar").setRequired(true))
        .addStringOption(o => o.setName("cuando").setDescription("Cuándo (10m, 2h, mañana 18:00)").setRequired(true))
        .addChannelOption(o => o.setName("canal").setDescription("Canal destino").setRequired(true))
        .addUserOption(o => o.setName("usuario").setDescription("Enviarle además un DM").setRequired(false)))
      .addSubcommand(s => s.setName("lista").setDescription("Lista los temporizadores de este servidor"))
      .addSubcommand(s => s.setName("borrar").setDescription("Borra un temporizador")
        .addStringOption(o => o.setName("id").setDescription("ID del temporizador").setRequired(true))),
    new SlashCommandBuilder().setName("promocion").setDescription("Gestiona promociones y descuentos de planes Premium").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand(s => s.setName("ver").setDescription("Muestra la promoción activa y precios con descuento"))
      .addSubcommand(s => s.setName("activar").setDescription("Activa una promoción nueva")
        .addStringOption(o => o.setName("inicio").setDescription("Inicio ISO 8601 (ej. 2026-12-20T00:00:00Z)").setRequired(true))
        .addStringOption(o => o.setName("fin").setDescription("Fin ISO 8601 (ej. 2027-01-10T23:59:59Z)").setRequired(true))
        .addIntegerOption(o => o.setName("perpetual").setDescription("Descuento Perpetua (%)").setRequired(false).setMinValue(0).setMaxValue(100))
        .addIntegerOption(o => o.setName("sub").setDescription("Descuento Suscripción (%)").setRequired(false).setMinValue(0).setMaxValue(100))
        .addIntegerOption(o => o.setName("boost").setDescription("Descuento Boost (%)").setRequired(false).setMinValue(0).setMaxValue(100))
        .addIntegerOption(o => o.setName("white").setDescription("Descuento White-label (%)").setRequired(false).setMinValue(0).setMaxValue(100))
        .addIntegerOption(o => o.setName("donate").setDescription("Descuento Donante (%)").setRequired(false).setMinValue(0).setMaxValue(100))
        .addStringOption(o => o.setName("codigo").setDescription("Código promocional (opcional)").setRequired(false))
        .addStringOption(o => o.setName("nota").setDescription("Nota pública").setRequired(false)))
      .addSubcommand(s => s.setName("desactivar").setDescription("Desactiva la promoción actual")),
    new ContextMenuCommandBuilder().setName("Advertir").setType(ApplicationCommandType.User),
    new ContextMenuCommandBuilder().setName("Aislar").setType(ApplicationCommandType.User),
    new ContextMenuCommandBuilder().setName("Expulsar").setType(ApplicationCommandType.User),
    new ContextMenuCommandBuilder().setName("Banear").setType(ApplicationCommandType.User),
  ];

  // Cargar datos (SQLite; importa JSONs legacy solo la primera vez)
  try {
    const imp = db.importFromJson(__dirname, process.env.GUILD_ID || "");
    if (imp.imported) console.log(`🗄️ DB importada:`, JSON.stringify(imp.summary));
  } catch (e) { console.error("DB import error:", e.message); }
  loadClips();
  loadStaff();
  loadGuilds();
  loadEvents();
  loadTeams();
  loadTickets();
  loadServerConfig();
  loadInvites();
  loadBotmode();
  loadConfessions();
  loadMcNicks();
  loadStats();
  loadSuggestions();
  loadPolls();
  loadSanctions();
  loadTempVoiceMap();
  setInterval(checkTempbans, 60000);
  seedLegacyGuild();

  // ===== COMANDOS: catálogo + registro autorreparable contra la API de Discord =====
  // NOTA: antes este bloque estaba dentro de loadEvents(); ahí `cmds` no existía,
  // el ReferenceError lo tragaba el catch{} y por eso NADA se registraba (ni alias,
  // ni social watch, ni timers, ni contadores). Ahora vive en el scope correcto.
  const cmdsFinal = cmds;
  console.log(`🧩 Comandos: ${cmdsFinal.length} sueltos (fusión desactivada)`);

  // Catálogo completo para el panel de permisos por comando + registro de alias
  CMD_BUILDERS = cmdsFinal;
  CMD_CATALOG = cmdsFinal.map(c => {
    const j = c.toJSON();
    const opts = Array.isArray(j.options) ? j.options : [];
    return {
      cmd: j.name,
      desc: j.description,
      sub: opts.some(o => o.type === 1),
      mod: MOD_COMMAND_SET.has(j.name),
      group: COMMAND_MODULE[j.name] || null,
      subs: opts.filter(o => o.type === 1).map(o => ({ name: o.name, desc: o.description || "" })),
      args: opts.filter(o => o.type !== 1).map(o => ({ name: o.name, desc: o.description || "", req: !!o.required, type: o.type })),
    };
  });
  clearAliasCache();

  // Verifica contra la API y registra solo si la lista real difiere (arranque + vigilante)
  arrancarRegistroComandos();

  for (const g of client.guilds.cache.keys()) scheduledAliasSync(g);
  setInterval(() => { try { db.cleanCmdReplyLinks(); } catch {} }, 3600000);
  // Vigilancia de redes sociales (directos y vídeos nuevos)
  setTimeout(() => { runSocialWatch().catch(() => {}); }, 15000);
  setInterval(() => { runSocialWatch().catch(() => {}); }, 150000);
  // Premium: temporizadores y canales de estadísticas
  setTimeout(() => { runTimers(); }, 8000);
  setInterval(() => { runTimers(); }, 30000);
  setTimeout(() => { for (const g of client.guilds.cache.values()) refreshCounters(g).catch(() => {}); }, 20000);
  setInterval(() => { for (const g of client.guilds.cache.values()) refreshCounters(g).catch(() => {}); }, 300000);
  // Premium: refresco de contadores segun el intervalo elegido en el panel
  setInterval(() => {
    for (const g of client.guilds.cache.values()) {
      const mins = Number((getGuildConfig(g.id) || {}).counterRefresh || 300) / 60000;
      if (!mins || mins <= 0) continue;
      const stamp = Date.now() % (mins * 60000);
      if (stamp < 30000) refreshCounters(g).catch(() => {});
    }
  }, 60000);

  // Apply saved botmode (with delay to ensure gateway is ready)
  setTimeout(() => {
    const activityTypeMap = { playing: ActivityType.Playing, listening: ActivityType.Listening, watching: ActivityType.Watching, competing: ActivityType.Competing, streaming: ActivityType.Streaming };
    if (botmodeConfig.mode && botmodeConfig.mode !== "none" && botmodeConfig.text) {
      console.log(`🤖 Setting botmode: ${botmodeConfig.mode} "${botmodeConfig.text}"`);
      const activities = [{ name: botmodeConfig.text, type: activityTypeMap[botmodeConfig.mode] || ActivityType.Playing }];
      if (botmodeConfig.mode === "streaming") {
        activities[0].url = "https://twitch.tv/hydrastudio";
      }
      client.user.setPresence({ activities, status: "online" });
    } else {
      console.log("🤖 Setting default botmode: Playing Hydra Studio");
      client.user.setPresence({ activities: [{ name: "Hydra Studio", type: ActivityType.Playing }], status: "online" });
    }
  }, 2000);

  // Helper to restore bot activity to saved botmode
  function restoreBotmode() {
    const activityTypeMap = { playing: ActivityType.Playing, listening: ActivityType.Listening, watching: ActivityType.Watching, competing: ActivityType.Competing, streaming: ActivityType.Streaming };
    const mode = botmodeConfig.mode || "";
    const text = botmodeConfig.text || "";
    const status = botmodeConfig.status || "online";
    if (mode && mode !== "none" && text) {
      const activities = [{ name: text, type: activityTypeMap[mode] || ActivityType.Playing }];
      if (mode === "streaming") activities[0].url = botmodeConfig.streamingUrl || "https://twitch.tv/hydrastudio";
      client.user.setPresence({ activities, status });
    } else {
      client.user.setPresence({ activities: [{ name: "Hydra Studio", type: ActivityType.Playing }], status: "online" });
      }
    }
  // Cache invites for tracking (all guilds)
  try {
    for (const [gid, guild] of client.guilds.cache) {
      const guildInvites = await guild.invites.fetch();
      guildInvites.forEach((invite, code) => {
        inviteCache.set(code, { code, uses: invite.uses, inviterId: invite.inviter?.id });
      });
      console.log(`📨 Cached ${guildInvites.size} invites for ${guild.name}`);
    }
    console.log(`📨 Total cached invites: ${inviteCache.size}`);
  } catch (err) { console.error("Error caching invites:", err.message); }

  // ===== SET PATROCINADOR CATEGORY PERMISSIONS (per-guild) =====
  try {
    for (const [gid, guild] of client.guilds.cache) {
      const gc = getGuildConfig(gid);
      const catId = gc.patrocinadorCategoryId || "";
      const roleIds = [gc.patrocinadorRoleId, gc.colaboradorRoleId].filter(Boolean);
      if (!catId || !roleIds.length) continue;
      const cat = await guild.channels.fetch(catId).catch(() => null);
      if (cat) {
        for (const roleId of roleIds) {
          await cat.permissionOverwrites.edit(roleId, {
            AttachFiles: true,
            EmbedLinks: true,
          }).catch(() => {});
        }
        console.log(`✅ Patrocinador/colaborador role perms set in ${guild.name}`);
      }
    }
  } catch (err) { console.error("Error setting category perms:", err.message); }

  // ===== SYNC PARTICIPANTE ROLE + GHOST DETECTION (all guilds) =====
  try {
    for (const [gid, guild] of client.guilds.cache) {
      const gCfg = getGuildConfig(gid);
      if (!gCfg.participanteRoleId) continue;
      let fixed = 0;
      let ghosts = 0;
      for (const [id, ev] of events) {
        if (ev.roleId && ev.participants) {
          // Assign Participante to all in array
          for (const p of ev.participants) {
            try {
              const member = await guild.members.fetch(p.userId);
              if (member && !member.roles.cache.has(gCfg.participanteRoleId)) {
                await member.roles.add(gCfg.participanteRoleId);
                fixed++;
              }
            } catch {}
          }
          // Detect ghosts: members with event role but NOT in participants array
          const eventRole = guild.roles.cache.get(ev.roleId);
          if (eventRole) {
            for (const [memberId, member] of eventRole.members) {
              if (!ev.participants.find(p => p.userId === memberId)) {
                console.log(`👻 Ghost detected in ${ev.nombre}: ${member.user.tag} (${memberId}) — has role but not in participants array`);
                // Add to participants with defaults
                ev.participants.push({
                  userId: memberId,
                  nick: member.displayName,
                  edad: 0,
                  mic: false,
                  contenido: false,
                  streamLink: ""
                });
                ghosts++;
                // Assign Participante role
                try { await member.roles.add(gCfg.participanteRoleId); } catch {}
              }
            }
          }
        }
      }
      if (ghosts > 0) saveEvents();
      console.log(`👤 [${guild.name}] Participante role synced: ${fixed} assigned, ${ghosts} ghosts added to array`);
    }
  } catch (e) { console.error("❌ Participante sync error:", e.message); }

  // Spotify Activity Sync (modo global /botmode O interruptor por servidor en el panel)
  let lastSpotifyKey = "__init__";
  async function syncSpotify() {
    try {
      let anyPanel = false;
      for (const [gid] of client.guilds.cache) {
        if (getGuildConfig(gid).spotifySync) { anyPanel = true; break; }
      }
      if (!spotifySyncEnabled && !anyPanel) return;
      let found = null;
      for (const [gid, guild] of client.guilds.cache) {
        const gc = getGuildConfig(gid);
        if (!spotifySyncEnabled && !gc.spotifySync) continue;
        const spu = gc.spotifyUserId || "";
        if (!spu) continue;
        const member = await guild.members.fetch({ user: spu, withPresences: true }).catch(() => null);
        if (!member || !member.presence || !member.presence.activities || member.presence.activities.length === 0) continue;
        const spotify = member.presence.activities.find(a => a.type === 2 && a.name === "Spotify");
        if (spotify && spotify.details) {
          found = { song: spotify.details, artist: spotify.state || "Desconocido" };
          break;
        }
      }
      const key = found ? `${found.song} — ${found.artist}` : "";
      if (key !== lastSpotifyKey) {
        lastSpotifyKey = key;
        if (found) console.log(`🎶 Spotify: ${found.song} — ${found.artist}`);
        else console.log(`🎶 Spotify: no Spotify activity in any guild`);
      }
      if (found) {
        client.user.setPresence({
          activities: [{ name: "Spotify", state: `${found.song} — ${found.artist}`.slice(0, 128), type: ActivityType.Listening }],
          status: "online",
        });
      } else {
        const activityTypeMap = { playing: ActivityType.Playing, listening: ActivityType.Listening, watching: ActivityType.Watching, competing: ActivityType.Competing, streaming: ActivityType.Streaming };
        if (botmodeConfig.mode && botmodeConfig.mode !== "none" && botmodeConfig.text) {
          const activities = [{ name: botmodeConfig.text, type: activityTypeMap[botmodeConfig.mode] || ActivityType.Playing }];
          if (botmodeConfig.mode === "streaming") activities[0].url = "https://twitch.tv/hydrastudio";
          client.user.setPresence({ activities, status: "online" });
        } else {
          client.user.setPresence({ activities: [{ name: "Hydra Studio", type: ActivityType.Playing }] });
        }
      }
    } catch (e) { console.log(`🎶 Spotify error: ${e.message}`); }
  }
  setInterval(syncSpotify, 15000);
  syncSpotify();
});

// ============== INVITATIONS SYSTEM (per-guild, SQLite; keys `${guildId}:${userId}`) ==============
const invites = new Map(); // { `${guildId}:${userId}`: { total, invitedBy, invitedById } }
let invitesLoaded = false;

const invKey = (guildId, userId) => `${guildId}:${userId}`;
function invGet(guildId, userId) {
  return invites.get(invKey(guildId, userId)) || { total: 0, invitedBy: null, invitedById: null };
}
function invSet(guildId, userId, info) {
  invites.set(invKey(guildId, userId), info);
  saveInvites();
}

function loadInvites() {
  try {
    for (const [gid, uid, info] of db.getAllInvites()) invites.set(invKey(gid, uid), info);
    console.log(`📨 Loaded ${invites.size} invite records`);
  } catch (e) { console.error("loadInvites error:", e.message); }
  invitesLoaded = true;
}

function saveInvites() {
  if (!invitesLoaded) return;
  try {
    for (const [key, info] of invites) {
      const i = key.indexOf(":");
      if (i > 0) db.setInvite(key.slice(0, i), key.slice(i + 1), info);
    }
  } catch (e) { console.error("Error saving invites:", e.message); }
}

// ============== GUILD JOIN/LEAVE (auto-register, isolation-safe) ==============
client.on(Events.GuildCreate, async (guild) => {
  try {
    db.ensureGuild(guild.id, guild.name);
    if (!guildConfigs[guild.id]) guildConfigs[guild.id] = { ...DEFAULT_GUILD_CONFIG, name: guild.name };
    else if (!guildConfigs[guild.id].name) guildConfigs[guild.id].name = guild.name;
    console.log(`➕ Bot añadido a: ${guild.name} (${guild.id}) — config aislada creada`);
  } catch (e) { console.error("GuildCreate error:", e.message); }
});

// Cache invites on ready
const inviteCache = new Map();
const processedMembers = new Set();

// ============== NEW MEMBER ==============
client.on(Events.GuildMemberAdd, async (member) => {
  if (processedMembers.has(member.id)) return;
  processedMembers.add(member.id);
  setTimeout(() => processedMembers.delete(member.id), 10000);
  // Premium: recuperar roles al volver + mensajes de entrada + contadores
  setTimeout(() => {
    try {
      const back = db.popRolesBack(member.guild.id, member.id);
      if (back.length && member.manageable !== false) {
        const add = back.map(r => member.guild.roles.cache.get(r)).filter(r => r && r.id !== member.guild.id);
        if (add.length) member.roles.add(add, "Roles restaurados").catch(() => {});
      }
    } catch {}
    if (isPremium(member.guild.id, "entryMsgs") && !member.user.bot) sendEntryMsg(member, "join").catch(() => {});
    if (isPremium(member.guild.id, "counters")) refreshCounters(member.guild).catch(() => {});
  }, 4000);
  // Premium: imagen de bienvenida generada
  if (isPremium(member.guild.id, "donator")) {
    // el plan de donante marca automaticamente a los miembros con un rol propio
    const gcDon = getGuildConfig(member.guild.id) || {};
    if (gcDon.donatorRoleId && !member.roles.cache.has(gcDon.donatorRoleId) && !member.user.bot) {
      const donRole = member.guild.roles.cache.get(gcDon.donatorRoleId);
      if (donRole && !donRole.managed) setTimeout(() => member.roles.add(donRole).catch(() => {}), 1500);
    }
  }
  if (isPremium(member.guild.id, "welcomeImage") && !member.user.bot) {
    const gcImg = getGuildConfig(member.guild.id) || {};
    if (gcImg.welcomeImageMode === "generada" && gcImg.welcomeImageChannelId) {
      setTimeout(async () => {
        try {
          const ch = await member.guild.channels.fetch(gcImg.welcomeImageChannelId).catch(() => null);
          if (!ch || !ch.isTextBased()) return;
          const buf = await renderWelcomeImage(member, {
            name: gcImg.welcomeImageTitle || member.user.username,
            subtitle: gcImg.welcomeImageSubtitle || `${brandOf(member.guild.id).name || "Bienvenido/a a"} ${member.guild.name}`,
            accent: gcImg.welcomeImageAccent,
          });
          const att = new AttachmentBuilder(buf, { name: `bienvenida-${member.id}.png` });
          await ch.send({ files: [att], content: `<@${member.id}>` }).catch(() => {});
        } catch {}
      }, 3500);
    }
  }
  // Join Gate: kick accounts newer than X days
  try {
    const gcJ = getGuildConfig(member.guild.id);
    if (gcJ.joinGateEnabled && !member.user.bot) {
      const ageDays = (Date.now() - member.user.createdTimestamp) / 86400000;
      if (ageDays < (gcJ.joinGateMinAge || 7)) {
        try { await member.send(`⛔ Tu cuenta es muy nueva para entrar a **${member.guild.name}** (mínimo ${gcJ.joinGateMinAge || 7} días).`); } catch {}
        await member.kick("Join Gate: cuenta muy nueva").catch(() => {});
        modLog(member.guild.id, "🚪 Join Gate", `**Usuario:** <@${member.id}>\n**Acción:** Expulsado (cuenta de ${ageDays.toFixed(1)} días)`);
        return;
      }
    }
    // Anti-raid: burst lockdown
    if (gcJ.antiRaidEnabled && !member.user.bot) {
      const now = Date.now();
      const arr = (joinTrack.get(member.guild.id) || []).filter(t => now - t < (gcJ.antiRaidSeconds || 15) * 1000);
      arr.push(now);
      joinTrack.set(member.guild.id, arr);
      if (arr.length >= (gcJ.antiRaidCount || 5)) {
        joinTrack.set(member.guild.id, []);
        await setLockdown(member.guild, true);
        modLog(member.guild.id, "🚨 Anti-raid", `**${arr.length} entradas** en ${gcJ.antiRaidSeconds || 15}s.\n**Acción:** Bloqueo activado. Desactívalo desde el panel.`);
      }
    }
  } catch (e) { console.error("joingate error:", e.message); }
  try {
    const gc = getGuildConfig(member.guild.id);
    const verChId = gc.verificationChannelId || "";
    const unverifiedRoleId = gc.unverifiedRoleId || "";
    // Los bots no pasan verificación ni reciben rangos de usuario
    if (!member.user.bot) {
      const unverifiedRole = unverifiedRoleId ? member.guild.roles.cache.get(unverifiedRoleId) : null;
      if (unverifiedRole) await member.roles.add(unverifiedRole).catch(()=>{});
    }

    // Welcome DM (configurable; los bots no reciben DMs)
    if (gc.welcomeDmEnabled && !member.user.bot) {
      const dmMsg = gc.welcomeDmMessage || `👋 Bienvenido a **${member.guild.name}**!`;
      const resolved = renderMsg(dmMsg, member).replace(/\{user\}/g, `<@${member.id}>`).replace(/\{server\}/g, member.guild.name);
      await member.send({ embeds: [
        new EmbedBuilder().setTitle(`👋 Bienvenido a ${member.guild.name}`)
          .setDescription(resolved).setColor(0x5865f2)
      ]}).catch(()=>{});
    }

    // Rules auto-post
    if (gc.rulesAutoPost && gc.rulesChannelId) {
      const rulesCh = member.guild.channels.cache.get(gc.rulesChannelId);
      if (rulesCh && rulesCh.isTextBased()) {
        await rulesCh.send({ content: `${member} Lee las reglas del servidor antes de participar.` }).catch(()=>{});
      }
    }
  } catch {}

  // ============== WELCOME EMBED IN CHANNEL ==============
  try {
    const gc2 = getGuildConfig(member.guild.id);
    const welcomeChId = gc2.welcomeChannelId;
    if (!welcomeChId) return;
    const welcomeCh = member.guild.channels.cache.get(welcomeChId);
    if (!welcomeCh) return;

    if (gc2.welcomeEnabled === false) return;

    // Auto-role from guild config (solo humanos: los bots no reciben rangos de usuario)
    const autoRoleId = gc2.welcomeRoleId || "";
    if (autoRoleId && !member.user.bot) {
      const autoRole = member.guild.roles.cache.get(autoRoleId);
      if (autoRole) await member.roles.add(autoRole).catch(()=>{});
    }

    // Use custom welcome message from dashboard if set
    const customMsg = gc2.welcomeMessage || "";
    const embCfg = (gc2.embeds || {}).welcome || {};
    const embColor = parseColor(gc2.welcomeColor || embCfg.color || "#5865F2");
    const embTitle = renderMsg(gc2.welcomeTitle || embCfg.title || `✨ ¡Bienvenido/a, {member}! ✨`, member).replace(/\{member\}/g, member.displayName);
    const embFooter = renderMsg(gc2.welcomeFooter || embCfg.footer || `🎉 ¡Disfruta tu estadía en {server}!`, member);
    const resolvedDesc = renderMsg(gc2.welcomeDesc || embCfg.description || "", member);
    const imgMode = (gc2.welcomeImage || "").toLowerCase();
    const wContent = msgContent(gc2, "welcomeContent", member);

    const layout = (gc2.welcomeLayout || "").toLowerCase();
    if (layout === "secciones" || layout === "bloques") {
      // Estilo secciones/bloques: banner + embed principal + embed de ayuda (+ texto final en bloques)
      const bannerBuffer = generateWelcomeBanner(member.displayName, member.user.displayAvatarURL(), member.guild.id);
      await welcomeCh.send({ files: [new AttachmentBuilder(bannerBuffer, { name: "welcome-banner.png" })] }).catch(() => {});
      const mainEmbed = new EmbedBuilder()
        .setTitle(embTitle)
        .setDescription(resolvedDesc || renderMsg(customMsg, member, wEx) || renderMsg(WELCOME_DEFAULT_DESC, member, wEx))
        .setColor(embColor)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTimestamp();
      if (embFooter) mainEmbed.setFooter({ text: embFooter });
      applyEmbedExtras(mainEmbed, gc2, "welcome", member);
      await welcomeCh.send({ content: wContent, embeds: [mainEmbed] }).catch(() => {});
      const helpEmbed = new EmbedBuilder()
        .setTitle(`💎 ${member.guild.name}`)
        .setDescription(renderMsg(gc2.welcomeHelp || `Por favor, lee nuestras reglas antes de comenzar.\n\n💎 **¿Quieres participar en eventos?**\n¡Has llegado al lugar correcto!`, member, wEx))
        .setColor(embColor)
        .setTimestamp();
      await welcomeCh.send({ embeds: [helpEmbed] }).catch(() => {});
      if (layout === "bloques") {
        const footTxt = renderMsg(gc2.welcomeHelpFooter || "", member);
        if (footTxt) await welcomeCh.send({ content: footTxt }).catch(() => {});
      }
    } else if (customMsg || resolvedDesc) {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle(embTitle)
        .setDescription(resolvedDesc || renderMsg(customMsg, member, wEx) || renderMsg(WELCOME_DEFAULT_DESC, member, wEx))
        .setColor(embColor)
        .setTimestamp();

      if (embCfg.thumbnail === "user" || !embCfg.thumbnail) {
        welcomeEmbed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
      }
      if (embCfg.imageUrl) welcomeEmbed.setImage(embCfg.imageUrl);
      if (imgMode === "banner") {
        const bannerBuffer = generateWelcomeBanner(member.displayName, member.user.displayAvatarURL(), member.guild.id);
        const bannerAttachment = new AttachmentBuilder(bannerBuffer, { name: "welcome-banner.png" });
        welcomeEmbed.setImage("attachment://welcome-banner.png");
        if (embFooter) welcomeEmbed.setFooter({ text: embFooter });
        applyEmbedExtras(welcomeEmbed, gc2, "welcome", member);
        await welcomeCh.send({ content: wContent, embeds: [welcomeEmbed], files: [bannerAttachment] }).catch(()=>{});
      } else {
        if (embFooter) welcomeEmbed.setFooter({ text: embFooter });
        applyEmbedExtras(welcomeEmbed, gc2, "welcome", member);
        await welcomeCh.send({ content: wContent, embeds: [welcomeEmbed] }).catch(()=>{});
      }
    } else {
      // Fallback: generate banner image with default message
      const bannerBuffer = generateWelcomeBanner(member.displayName, member.user.displayAvatarURL(), member.guild.id);
      const bannerAttachment = new AttachmentBuilder(bannerBuffer, { name: "welcome-banner.png" });

      const welcomeEmbed = new EmbedBuilder()
        .setTitle(embTitle || `✨ ¡Bienvenido/a, ${member.displayName}! ✨`)
        .setDescription(
          resolvedDesc || renderMsg(WELCOME_DEFAULT_DESC, member, wEx)
        )
        .setColor(embColor)
        .setImage("attachment://welcome-banner.png")
        .setTimestamp();

      if (embCfg.thumbnail === "user" || !embCfg.thumbnail) {
        welcomeEmbed.setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }));
      }
      if (embFooter) welcomeEmbed.setFooter({ text: embFooter });
      applyEmbedExtras(welcomeEmbed, gc2, "welcome", member);

      await welcomeCh.send({ content: wContent, embeds: [welcomeEmbed], files: [bannerAttachment] }).catch(()=>{});
    }
  } catch (err) {
    console.error("Error sending welcome embed:", err.message);
  }

  // Track invitation
  try {
    const newInvites = await member.guild.invites.fetch();
    let usedInvite = null;

    for (const [code, invite] of newInvites) {
      const cached = inviteCache.get(code);
      if (cached && invite.uses > cached.uses) {
        usedInvite = { code, inviter: invite.inviter, uses: invite.uses };
        break;
      }
    }

    // Update cache
    newInvites.forEach((invite, code) => {
      inviteCache.set(code, { code, uses: invite.uses, inviterId: invite.inviter?.id });
    });

    // Record invite (per-guild)
    const gid = member.guild.id;
    const userData = invGet(gid, member.id);
    if (usedInvite && usedInvite.inviter) {
      userData.total = (userData.total || 0) + 1;
      userData.invitedBy = usedInvite.inviter.tag;
      userData.invitedById = usedInvite.inviter.id;
    }
    invSet(gid, member.id, userData);

    // Update inviter's total count
    if (usedInvite && usedInvite.inviter) {
      const inviterData = invGet(gid, usedInvite.inviter.id);
      inviterData.total = (inviterData.total || 0) + 1;
      invSet(gid, usedInvite.inviter.id, inviterData);
    }

    // Send to invites channel (mensaje customizable estilo bienvenidas)
    const gc3 = getGuildConfig(member.guild.id);
    const invitesChId = gc3.invitesChannelId || "";
    const ch = invitesChId ? member.guild.channels.cache.get(invitesChId) : null;
    if (ch && gc3.invEnabled !== false) {
      const inviterMention = usedInvite?.inviter ? `<@${usedInvite.inviter.id}>` : "Desconocido";
      const inviterTotal = (usedInvite?.inviter?.id ? invGet(member.guild.id, usedInvite.inviter.id).total : 0) || 0;
      const extra = { inviter: inviterMention, invites: inviterTotal };
      const embed = new EmbedBuilder()
        .setTitle(renderMsg(gc3.invTitle || "📨 Nuevo Miembro", member, extra).substring(0, 256) || "📨 Nuevo Miembro")
        .setDescription(renderMsg(gc3.invDesc || `<@${member.id}> se unió al servidor.\n\n📧 Invitado por: {inviter}\n🔢 Invites de {inviter}: **{invites}**`, member, extra).substring(0, 4000))
        .setColor(parseColor(gc3.invColor || "#00FF00"))
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp();
      const invFoot = renderMsg(gc3.invFooter || "", member, extra);
      if (invFoot) embed.setFooter({ text: invFoot.substring(0, 2048) });
      applyEmbedExtras(embed, gc3, "inv", member);
      await ch.send({ content: msgContent(gc3, "invContent", member, extra), embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error("Error tracking invite:", err.message);
  }
});

// ============== MEMBER LEAVE — CLEANUP EVENTS ==============
client.on(Events.GuildMemberRemove, async (member) => {
  // Premium: guardar roles para restaurarlos + mensaje de salida + contadores
  try {
    const roles = member.roles.cache.filter(r => r.id !== member.guild.id && !r.managed).map(r => r.id).slice(0, 30);
    if (isPremium(member.guild.id, "rolesBack") && (getGuildConfig(member.guild.id) || {}).rolesBackEnabled !== false && roles.length)
    db.setRolesBack(member.guild.id, member.id, roles);
  } catch {}
  if (isPremium(member.guild.id, "entryMsgs") && !member.user.bot) sendEntryMsg(member, "leave").catch(() => {});
  if (isPremium(member.guild.id, "counters")) setTimeout(() => refreshCounters(member.guild).catch(() => {}), 3000);

  const userId = member.id;
  let removed = false;

  for (const [id, ev] of events) {
    if ((ev.guildId || "") !== member.guild.id) continue;
    if (!ev.participants) continue;
    const idx = ev.participants.findIndex(p => p.userId === userId);
    if (idx !== -1) {
      ev.participants.splice(idx, 1);
      removed = true;
      console.log(`🚪 ${member.user.tag} removed from event ${ev.nombre} (${id})`);

      // Remove event role
      if (ev.roleId) {
        try { await member.roles.remove(ev.roleId); } catch {}
      }

      // Update event embed
      try {
        const ch = member.guild.channels.cache.get(ev.channelId);
        if (ch) {
          const msg = await ch.messages.fetch(ev.messageId).catch(() => null);
          if (msg && msg.embeds[0]) {
            const updatedEmbed = buildEventDisplayEmbed(ev, ch.guild);
            await msg.edit({ embeds: [updatedEmbed] });
          }
        }
      } catch {}

      // Notify inscription channel
      try {
        const gcI = getGuildConfig(member.guild.id);
        const inscCh = member.guild.channels.cache.get(gcI.inscriptionChannelId || CONFIG.inscriptionChannelId);
        if (inscCh) {
          await inscCh.send({ embeds: [new EmbedBuilder()
            .setTitle(`🚪 Participante eliminado — ${ev.nombre}`)
            .setDescription(`**${member.user.tag}** salió del servidor y fue eliminado de **${ev.nombre}**.`)
            .setColor(0xFF0000)
            .setTimestamp()
          ]});
        }
      } catch {}
    }
  }

  if (removed) saveEvents();

  // Remove Participante role
  try { const prId = getParticipanteRoleId(member.guild.id); if (prId) await member.roles.remove(prId).catch(() => {}); } catch {}

  // ============== GOODBYE EMBED ==============
  try {
    const gcB = getGuildConfig(member.guild.id);
    if (gcB.goodbyeEnabled && gcB.goodbyeChannelId) {
      const byeCh = member.guild.channels.cache.get(gcB.goodbyeChannelId);
      if (byeCh) {
        const gLayout = (gcB.goodbyeLayout || "").toLowerCase();
        const gTitle = renderMsg(gcB.goodbyeTitle || `😢 ${member.displayName} salió del servidor`, member).substring(0, 256);
        const gDesc = renderMsg(gcB.goodbyeDesc || `**${member.user.tag}** ya no está con nosotros. ¡Le deseamos lo mejor!`, member);
        const gColor = parseColor(gcB.goodbyeColor || "#FF5555");
        const gFooter = renderMsg(gcB.goodbyeFooter || "", member);
        const gContent = msgContent(gcB, "goodbyeContent", member);
        const sendByeBanner = async (name) => {
          const buf = generateWelcomeBanner(member.displayName, member.user.displayAvatarURL(), member.guild.id);
          await byeCh.send({ files: [new AttachmentBuilder(buf, { name })] }).catch(() => {});
        };
        if (gLayout === "secciones" || gLayout === "bloques") {
          await sendByeBanner("goodbye-banner.png");
          const mainBye = new EmbedBuilder().setTitle(gTitle).setDescription(gDesc).setColor(gColor)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 })).setTimestamp();
          if (gFooter) mainBye.setFooter({ text: gFooter });
          applyEmbedExtras(mainBye, gcB, "goodbye", member);
          await byeCh.send({ content: gContent, embeds: [mainBye] }).catch(() => {});
          const helpBye = new EmbedBuilder()
            .setDescription(renderMsg(gcB.goodbyeHelp || `Gracias por haber sido parte de **${member.guild.name}**.`, member))
            .setColor(gColor).setTimestamp();
          await byeCh.send({ embeds: [helpBye] }).catch(() => {});
          if (gLayout === "bloques") {
            const gFootTxt = renderMsg(gcB.goodbyeHelpFooter || "", member);
            if (gFootTxt) await byeCh.send({ content: gFootTxt }).catch(() => {});
          }
        } else {
          const byeEmbed = new EmbedBuilder()
            .setTitle(gTitle).setDescription(gDesc).setColor(gColor)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setTimestamp();
          if (gFooter) byeEmbed.setFooter({ text: gFooter });
          applyEmbedExtras(byeEmbed, gcB, "goodbye", member);
          const files = [];
          if ((gcB.goodbyeImage || "").toLowerCase() === "banner") {
            const bannerBuffer = generateWelcomeBanner(member.displayName, member.user.displayAvatarURL(), member.guild.id);
            files.push(new AttachmentBuilder(bannerBuffer, { name: "goodbye-banner.png" }));
            byeEmbed.setImage("attachment://goodbye-banner.png");
          }
          await byeCh.send({ content: gContent, embeds: [byeEmbed], files }).catch(() => {});
        }
      }
    }
  } catch (err) { console.error("Error sending goodbye embed:", err.message); }
});

// ============== GIVEAWAY SYSTEM ==============
function parseDuracion(minutos) {
  return Date.now() + minutos * 60000;
}
// "10m" | "2h" | "7d" | "30s" -> ms (null si inválido; máx 365 días)
function parseDurationStr(str) {
  const m = String(str || "").trim().match(/^(\d+)\s*([smhd])$/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  const u = m[2].toLowerCase();
  const ms = u === "s" ? n * 1000 : u === "m" ? n * 60000 : u === "h" ? n * 3600000 : n * 86400000;
  if (ms <= 0 || ms > 365 * 86400000) return null;
  return ms;
}
function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}min`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

// ============== SANCTIONS (registro de baneos temp/permanentes) ==============
const sanctions = new Map(); // `${guildId}:${caseId}` -> case
function loadSanctions() {
  try {
    let n = 0;
    for (const [, s] of db.getSanctions()) {
      if (!s || !s.guildId || !s.id) continue;
      sanctions.set(`${s.guildId}:${s.id}`, s);
      n++;
    }
    console.log(`🔨 Loaded ${n} sanctions`);
  } catch (e) { noteError("loadSanctions", e); console.error("loadSanctions error:", e.message); }
}
function saveSanction(s) {
  try { db.setSanction(s.guildId, s.id, s); } catch (e) { console.error("saveSanction error:", e.message); }
}
function findSanction(guildId, ref) {
  ref = String(ref || "").trim();
  if (!ref) return null;
  const direct = sanctions.get(`${guildId}:${ref.toUpperCase()}`);
  if (direct) return direct;
  for (const [, s] of sanctions) {
    if ((s.guildId || "") !== guildId) continue;
    if (s.userId === ref) return s;
  }
  return null;
}
async function applyBanCase(guild, { userId, userTag, type, durationMs, reason, moderator }) {
  const ck = `sanctionCounter_${guild.id}`;
  const n = (db.miscGet(ck, 0) || 0) + 1;
  db.miscSet(ck, n);
  const c = {
    id: `CASE-${n}`, guildId: guild.id, userId, userTag: userTag || userId,
    type, reason: reason || "Sin razón",
    moderatorId: (moderator && moderator.id) || "", moderatorTag: (moderator && (moderator.tag || moderator.username)) || "dashboard",
    createdAt: Date.now(), expiresAt: type === "tempban" ? Date.now() + durationMs : 0,
    durationMs: type === "tempban" ? durationMs : 0, active: true,
  };
  await guild.members.ban(userId, { reason: `[${c.id}] ${c.reason}`.slice(0, 512) });
  sanctions.set(`${c.guildId}:${c.id}`, c);
  saveSanction(c);
  sancLog(guild.id, type, type === "tempban" ? "⏳ Baneo temporal" : "🔨 Baneo permanente",
    `**Caso:** ${c.id}\n**Usuario:** <@${userId}> (${c.userTag})\n**Duración:** ${type === "tempban" ? fmtDuration(durationMs) : "Permanente"}\n**Razón:** ${c.reason}\n**Moderador:** ${c.moderatorTag}`);
  return c;
}
async function checkTempbans() {
  try {
    const now = Date.now();
    for (const [, s] of [...sanctions.values()]) {
      if (!s.active || s.type !== "tempban" || !s.expiresAt || s.expiresAt > now) continue;
      const guild = client.guilds.cache.get(s.guildId);
      if (!guild) continue;
      try { await guild.members.unban(s.userId, `Tempban expirado [${s.id}]`); } catch {}
      s.active = false;
      saveSanction(s);
      sancLog(s.guildId, "tempban", "✅ Tempban expirado", `**Caso:** ${s.id}\n**Usuario:** <@${s.userId}> (${s.userTag})\nDesbaneado automáticamente.`);
    }
  } catch (e) { console.error("checkTempbans error:", e.message); }
}

function renderGwTpl(tpl, vars) {
  let out = String(tpl || "");
  for (const [k, v] of Object.entries(vars || {})) out = out.split(`{${k}}`).join(String(v ?? ""));
  return out;
}

async function crearSorteo(guild, premio, duracionMin, numGanadores, canal, author) {
  const gcGw = getGuildConfig(guild.id);
  const gwColor = parseColor(gcGw.gwEmbedColor || "#FFD700");
  const gwTitle = gcGw.gwEmbedTitle || "SORTEO";
  const gwJoinEmoji = gcGw.gwJoinEmoji || "🎉";
  const gwEndTitle = gcGw.gwEndTitle || "SORTEO FINALIZADO";
  const gwEndColor = parseColor(gcGw.gwEndColor || "#00FF00");
  const gwNoWinners = gcGw.gwNoWinnersMsg || "No hubo participantes.";
  const gwAnnounce = gcGw.gwWinnerAnnounce || "Felicidades <@{winner}> acabas de ganar **{premio}**";
  const gwLiveTpl = gcGw.gwLiveDesc || "**Premio:** {premio}\n**Ganadores:** {ganadores}\n**Participantes:** {participantes}\n**Termina:** {tiempo}\n\nReacciona con {emoji} para participar!";
  const gwEndTpl = gcGw.gwEndDesc || "**Premio:** {premio}\n**Participantes totales:** {participantes}\n\n🏆 **Ganadores:**\n{ganadores_lista}";
  const gwFooterTpl = gcGw.gwFooter || "Sorteo creado por {creador}";
  const endTime = parseDuracion(duracionMin);
  // ¿Es este emoji el de participación? (vale unicode y personalizado <:name:id>)
  const joinRef = parseSugEmoji(gwJoinEmoji);
  const isJoinEmoji = (emoji) => (joinRef.id && emoji.id === joinRef.id) || (!joinRef.id && emoji.name === (joinRef.name || gwJoinEmoji));
  const timeTag = `<t:${Math.floor(endTime / 1000)}:R>`;
  const buildDesc = (n) => renderGwTpl(gwLiveTpl, { premio, ganadores: numGanadores, participantes: n, tiempo: timeTag, emoji: gwJoinEmoji });
  const embed = new EmbedBuilder()
    .setTitle(gwTitle)
    .setDescription(buildDesc(0))
    .setColor(gwColor)
    .setFooter({ text: renderGwTpl(gwFooterTpl, { creador: author.tag }).slice(0, 2048) })
    .setTimestamp();
  applyEmbedExtras(embed, gcGw, "gw", null);

  const msg = await canal.send({ content: msgContent(gcGw, "gwContent", null), embeds: [embed] });
  try { await msg.react(gwJoinEmoji); } catch {}

  // Participantes en vivo: collect + remove (dispose:true) para que quitar la
  // reacción elimine la participación al instante. Contador casi instantáneo.
  const liveIds = new Set();
  const filter = (reaction, user) => !user.bot && isJoinEmoji(reaction.emoji);
  const collector = msg.createReactionCollector({ filter, time: duracionMin * 60000, dispose: true });
  let lastEdit = 0;
  let editInFlight = false;
  const pushCount = async () => {
    const now = Date.now();
    if (editInFlight || now - lastEdit < 2000) return; // throttle suave: max 1 edición / 2s
    lastEdit = now;
    editInFlight = true;
    try {
      const fresh = await canal.messages.fetch(msg.id).catch(() => null);
      const base = fresh && fresh.embeds.length ? EmbedBuilder.from(fresh.embeds[0]) : EmbedBuilder.from(msg.embeds[0]);
      await msg.edit({ embeds: [base.setDescription(buildDesc(liveIds.size))] });
    } catch {} finally { editInFlight = false; }
  };
  collector.on("collect", (reaction, user) => { liveIds.add(user.id); pushCount(); });
  collector.on("remove", (reaction, user) => { liveIds.delete(user.id); pushCount(); });

  const updateInterval = setInterval(async () => {
    try {
      // Re-sincronizar por si se perdió algún evento (UNION: nunca resta)
      const fresh = await canal.messages.fetch(msg.id).catch(() => null);
      const reaction = fresh ? [...fresh.reactions.cache.values()].find(r => isJoinEmoji(r.emoji)) : null;
      if (reaction) {
        try {
          const users = await reaction.users.fetch();
          for (const [id, u] of users) if (!u.bot) liveIds.add(id);
        } catch {}
      }
      lastEdit = Date.now();
      const base = fresh && fresh.embeds.length ? EmbedBuilder.from(fresh.embeds[0]) : EmbedBuilder.from(msg.embeds[0]);
      await msg.edit({ embeds: [base.setDescription(buildDesc(liveIds.size))] });
    } catch {}
  }, 15000);

  collector.on("end", async () => {
    clearInterval(updateInterval);
    // Fuente de verdad al cerrar: fetch fresco (la caché sola suele estar vacía/incompleta)
    let participants = [...liveIds];
    try {
      const fresh = await canal.messages.fetch(msg.id).catch(() => null);
      const reaction = fresh ? [...fresh.reactions.cache.values()].find(r => isJoinEmoji(r.emoji)) : null;
      if (reaction) {
        const users = await reaction.users.fetch();
        participants = [...users.values()].filter(u => !u.bot).map(u => u.id);
      }
    } catch {}
    if (participants.length === 0) {
      await msg.edit({ embeds: [new EmbedBuilder().setTitle(gwEndTitle).setDescription(gwNoWinners).setColor(0xFF0000)] }).catch(() => {});
      return;
    }
    const winners = [];
    const shuffled = participants.sort(() => 0.5 - Math.random());
    for (let i = 0; i < Math.min(numGanadores, shuffled.length); i++) winners.push(shuffled[i]);

    const winEmbed = new EmbedBuilder()
      .setTitle(gwEndTitle)
      .setDescription(renderGwTpl(gwEndTpl, { premio, participantes: participants.length, ganadores_lista: winners.map(id => `<@${id}>`).join("\n") }))
      .setColor(gwEndColor)
      .setTimestamp();

    await msg.edit({ embeds: [winEmbed] }).catch(() => {});
    for (const w of winners) {
      const announce = renderGwTpl(gwAnnounce, { winner: `<@${w}>`, premio });
      await canal.send({ content: announce }).catch(() => {});
    }
  });

  return msg.id;
}

// ============== INTERACTIONS ==============
// Si el usuario borra el mensaje que usó un comando con "borrar respuesta al borrar el original",
// se elimina la respuesta del bot vinculada.
client.on(Events.MessageDelete, async (message) => {
  try {
    if (!message.guildId || !message.id || (message.author && message.author.bot)) return;
    const ref = db.getCmdReplyLink(message.guildId, message.id);
    if (!ref) return;
    db.dropCmdReplyLink(message.guildId, message.id);
    const sep = ref.indexOf(":");
    if (sep < 1) return;
    const cid = ref.slice(0, sep), rid = ref.slice(sep + 1);
    if (!cid || !rid || rid === message.id) return;
    const ch = message.guild.channels.cache.get(cid) || await message.guild.channels.fetch(cid).catch(() => null);
    if (!ch || !ch.messages) return;
    const m = ch.messages.cache.get(rid) || await ch.messages.fetch(rid).catch(() => null);
    if (m && m.author && m.author.id === client.user.id) await m.delete().catch(() => {});
  } catch {}
});
async function manejarInteraccion(interaction) {

  // ===== GATE POR COMANDO: activar, alias, canales y auto-borrado =====
  if (gateCommand(interaction)) return;

  // ===== /SANCIONAR: elige tipo -> panel completo (razón, pruebas, tiempo) =====
  if (interaction.isChatInputCommand() && interaction.commandName === "sancionar") {
    const target = interaction.options.getUser("usuario");
    const durStr = (interaction.options.getString("duracion") || "").trim();
    if (target.bot) return interaction.reply({ content: t2(interaction, "ctx_bot"), flags: MessageFlags.Ephemeral});
    if (target.id === interaction.guild.ownerId) return interaction.reply({ content: t2(interaction, "ctx_owner"), flags: MessageFlags.Ephemeral});
    if (target.id === interaction.user.id) return interaction.reply({ content: "❌ No puedes sancionarte a ti mismo.", flags: MessageFlags.Ephemeral});
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const types = [
      { v: "warn", label: "⚠️ Advertencia", cmd: "warn" },
      { v: "timeout", label: "🔇 Aislar (timeout)", cmd: "timeout" },
      { v: "kick", label: "👢 Expulsar", cmd: "kick" },
      { v: "softban", label: "🧹 Softban (borra mensajes)", cmd: "ban" },
      { v: "tempban", label: "⏳ Ban temporal", cmd: "tempban" },
      { v: "ban", label: "🔨 Ban permanente", cmd: "ban" },
      { v: "unban", label: "♻️ Levantar baneo", cmd: "unban" },
      { v: "delwarn", label: "🗑️ Quitar advertencia", cmd: "delwarn" },
    ];
    const allowed = types.filter(x => canUseModCommand(interaction.member, x.cmd));
    if (!allowed.length) return interaction.reply({ content: noPermMsg(interaction.member, "moderation"), flags: MessageFlags.Ephemeral});
    const sel = new StringSelectMenuBuilder()
      .setCustomId(`sancpick|${interaction.guildId}|${target.id}|${encodeURIComponent(durStr)}`)
      .setPlaceholder("Elige el tipo de sanción…")
      .addOptions(allowed.map(x => ({ label: x.label.slice(0, 100), value: x.v })));
    const view = await interaction.reply({
      content: `🧾 **Panel de sanción** · <@${target.id}>\n${member ? `Miembro: **${member.user.tag}**\n` : ""}Elige el tipo de sanción que quieres aplicar.`,
      components: [new ActionRowBuilder().addComponents(sel)],
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
    if (!view) return;
    let pick;
    try {
      pick = await view.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 120000 });
    } catch { return; }
    const type = pick.values[0];
    const dur = decodeURIComponent(pick.customId.split("|")[3] || "");
    await pick.deferUpdate().catch(() => {});
    let durationMs = 0;
    if (type === "timeout" || type === "tempban") {
      durationMs = parseDurationStr(dur);
      if (!durationMs) return interaction.followUp({ content: `❌ Duración inválida (${dur || "vacío"}). Usa \`10m\`, \`2h\`, \`7d\` y vuelve a abrir el panel.`, flags: MessageFlags.Ephemeral});
      if (type === "timeout" && durationMs > 28 * 24 * 3600 * 1000)
        return interaction.followUp({ content: "❌ El timeout máximo de Discord es 28 días.", flags: MessageFlags.Ephemeral});
    }
    const modal = new ModalBuilder()
      .setCustomId(`sanc|${interaction.guildId}|${target.id}|${type}|${durationMs}`)
      .setTitle(`🧾 ${target.username.slice(0, 20)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("motivo").setLabel("Razón de la sanción").setStyle(TextInputStyle.Paragraph).setMaxLength(400).setRequired(true)
            .setPlaceholder("Describe qué ocurrió")
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId("pruebas_si").setPlaceholder("¿Hay pruebas?")
            .addOptions({ label: "Sí, adjunté pruebas", value: "si" }, { label: "No hay pruebas", value: "no", default: true })
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("pruebas_url").setLabel("Enlace de las pruebas (opcional)").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false)
            .setPlaceholder("https://...")
        ),
      );
    return interaction.showModal(modal).catch(() => {});
  }

  // ===== /MEDIA =====
  if (interaction.isChatInputCommand() && interaction.commandName === "media") {
    const gc = getGuildConfig(interaction.guildId) || {};
    if (gc.mediaEnabled === false) return interaction.reply({ content: "U0001F6AB El panel de Media no esta activo en este servidor.", flags: MessageFlags.Ephemeral });
    return interaction.reply({ embeds: [buildMediaEmbed(gc)], flags: MessageFlags.Ephemeral });
  }

  // ===== /PERFIL =====
  if (interaction.isChatInputCommand() && interaction.commandName === "perfil") {
    if (!isPremium(interaction.guildId, "freelancers")) return interaction.reply({ content: premiumNotice(interaction.guildId, "freelancers"), flags: MessageFlags.Ephemeral });
    const cur = db.getFreelancer(interaction.guildId, interaction.user.id) || {};
    const data = {
      available: interaction.options.getString("disponible") === "si" ? true : interaction.options.getString("disponible") === "no" ? false : cur.available,
      hours: interaction.options.getString("horario") || cur.hours,
      bio: interaction.options.getString("bio") || cur.bio,
      services: interaction.options.getString("servicios") ? interaction.options.getString("servicios").split(",").map(x => x.trim()).filter(Boolean) : cur.services,
    };
    const f = ctx.serviciosApi.setFreelancer(interaction.guildId, interaction.user.id, data);
    const emb = new EmbedBuilder().setTitle("👤 Tu perfil de freelancer").setColor(0x5865f2)
      .addFields(
        { name: "Disponible", value: f.available ? "🟢 Sí" : "🔴 No", inline: true },
        { name: "Horario", value: f.hours || "—", inline: true },
        { name: "Bio", value: f.bio || "—" },
        { name: "Servicios", value: (f.services || []).join(", ") || "—" },
      ).setTimestamp();
    return interaction.reply({ embeds: [emb], flags: MessageFlags.Ephemeral });
  }

  // ===== /RESEÑA =====
  if (interaction.isChatInputCommand() && interaction.commandName === "resena") {
    if (!isPremium(interaction.guildId, "reviews")) return interaction.reply({ content: premiumNotice(interaction.guildId, "reviews"), flags: MessageFlags.Ephemeral });
    const target = interaction.options.getUser("usuario");
    const stars = interaction.options.getInteger("estrellas");
    const text = interaction.options.getString("comentario") || "";
    const r = ctx.serviciosApi.addReview(interaction.guildId, { from: interaction.user.id, to: target.id, stars, text });
    const emb = new EmbedBuilder().setTitle("⭐ Reseña enviada").setColor(0xf59e0b)
      .setDescription("Has valorado a <@" + target.id + "> con **" + stars + "** estrellas." + (text ? "\n\n> " + text : ""))
      .setFooter({ text: "Nota media: " + (r.rating ? r.rating.avg + " (" + r.rating.count + " reseñas)" : "sin reseñas todavía") });
    return interaction.reply({ embeds: [emb], flags: MessageFlags.Ephemeral });
  }

  // ===== /FACTURA =====
  if (interaction.isChatInputCommand() && interaction.commandName === "factura") {
    if (!isPremium(interaction.guildId, "invoices")) return interaction.reply({ content: premiumNotice(interaction.guildId, "invoices"), flags: MessageFlags.Ephemeral });
    const gc = getGuildConfig(interaction.guildId) || {};
    const inv = ctx.serviciosApi.addInvoice(interaction.guildId, {
      seller: interaction.options.getString("vendedor"),
      client: interaction.options.getString("cliente"),
      service: interaction.options.getString("servicio"),
      amount: interaction.options.getNumber("importe"),
      method: interaction.options.getString("metodo"),
    });
    const emb = new EmbedBuilder().setTitle("🧾 Factura " + inv.id).setColor(0x5865f2)
      .addFields(
        { name: "Vendedor", value: inv.seller, inline: true },
        { name: "Cliente", value: inv.client, inline: true },
        { name: "Servicio", value: inv.service },
        { name: "Importe", value: "**" + inv.amount + " USD**", inline: true },
        { name: "Método", value: inv.method === "crypto" ? "Cripto (QR)" : inv.method === "paypal" ? "PayPal" : "Stripe", inline: true },
        { name: "Estado", value: "Pendiente de pago" },
      ).setTimestamp();
    if (inv.method === "crypto" && gc.cryptoAddress) {
      const addr = encodeURIComponent(gc.cryptoAddress);
      const cur = gc.cryptoCurrency || "BTC";
      const qr = await fetch("https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=" + addr).then(r => r.arrayBuffer()).catch(() => null);
      if (qr) {
        const att = new AttachmentBuilder(Buffer.from(qr), { name: "qr.png" });
        emb.setImage("attachment://qr.png");
        emb.setDescription("**Escanea el QR** para pagar con **" + cur + "** a la dirección del vendedor.");
        return interaction.reply({ embeds: [emb], files: [att], flags: MessageFlags.Ephemeral });
      }
    }
    return interaction.reply({ embeds: [emb], flags: MessageFlags.Ephemeral });
  }

  // ===== /REGISTRAR (solo dueño) =====
  if (interaction.isChatInputCommand() && interaction.commandName === "registrar") {
    if (!isBotOwner(interaction.user.id)) return interaction.reply({ content: "🔒 Solo el dueño del bot.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const r = await registrarComandos("manual");
    if (!r.ok) return interaction.editReply({ content: "❌ No se pudo registrar: " + (r.error || "?") + "\nReintenta en unos minutos." });
    if (r.state === "al-dia") return interaction.editReply({ content: "✅ Ya están al día (" + r.count + " comandos). Si no ves /media, es la réplica de Discord (5–60 min)." });
    return interaction.editReply({ content: "✅ Registrados " + r.count + " comandos (antes " + (r.prevCount || 0) + ").\nDiscord tarda 5–60 min en mostrarlos en los servidores." });
  }

  // ===== COMANDOS PREMIUM =====

  // ===== /LICENCIA =====
  if (interaction.isChatInputCommand() && interaction.commandName === "licencia") {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId;
    const isAdmin = interaction.member && (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || isBotAdmin(gid, interaction.user.id));
    if (!isAdmin) return interaction.reply({ content: t2(interaction, "res_no_perm"), flags: MessageFlags.Ephemeral});
    if (sub === "info") {
      const st = licenseState(gid);
      const emb = new EmbedBuilder().setTitle("💎 Licencia Premium").setColor(0xf59e0b)
        .addFields(
          { name: "Estado", value: st.active ? "🟢 Activa" : "⚪ Sin licencia", inline: true },
          { name: "Planes", value: st.plans.length ? st.plans.map(p => (PREMIUM_PLANS[p] || {}).name || p).join(", ") : "—", inline: true },
          { name: "Marca propia (white-label)", value: st.whiteLabel ? "🟢 Sí" : "⚪ No", inline: true },
          { name: "Claves activas", value: st.keys.length ? st.keys.map(k => `\`${k.key}\`${k.expiresAt ? ` · <t:${Math.floor(k.expiresAt / 1000)}:R>` : " · perpetua"}`).join("\n") : "Ninguna", inline: false },
        );
      return interaction.reply({ embeds: [emb], flags: MessageFlags.Ephemeral});
    }
    // Emitir o quitar licencias es EXCLUSIVO del dueño del bot.
    // Antes cualquiera con "Gestionar servidor" hacia /licencia activar con una clave
    // inventada y se quedaba con la licencia por marca gratis.
    if (sub === "activar" || sub === "quitar") {
      if (!isBotOwner(interaction.user.id))
        return interaction.reply({
          content: "🔒 Solo el dueño del bot puede emitir o quitar licencias.\nPídele que la active en el panel o con su comando.\n_(Pronto se automatizará con el pago, sin intervención.)_",
          flags: MessageFlags.Ephemeral,
        });
      const key = interaction.options.getString("clave").trim().toUpperCase();
      if (!key.startsWith("HYDRA-"))
        return interaction.reply({ content: "❌ La clave no tiene un formato válido (HYDRA-XXXX-XXXX-XXXX-XXXX).", flags: MessageFlags.Ephemeral });
      const exists = findLicense(key);
      if (sub === "quitar") {
        if (!exists || exists.guildId !== gid) return interaction.reply({ content: "⚠️ Esa clave no está activa en este servidor.", flags: MessageFlags.Ephemeral });
        db.delLicense(key);
        return interaction.reply({ content: "💎 Licencia quitada.", flags: MessageFlags.Ephemeral });
      }
      const plan = interaction.options.getString("plan") || "perpetual";
      if (!PREMIUM_PLANS[plan]) return interaction.reply({ content: "❌ Plan desconocido.", flags: MessageFlags.Ephemeral });
      const dias = interaction.options.getInteger("dias") || 0;
      if (exists && exists.guildId !== gid) return interaction.reply({ content: "⚠️ Esa clave ya está usada en otro servidor.", flags: MessageFlags.Ephemeral });
      db.setLicense(gid, key, { plan, expiresAt: dias > 0 ? Date.now() + dias * 86400000 : 0, by: interaction.user.tag, at: Date.now() });
      return interaction.reply({ content: `💎 Licencia activada.\n**Clave:** \`${key}\`\n**Plan:** ${(PREMIUM_PLANS[plan] || {}).name || plan}\n**Validez:** ${dias > 0 ? `${dias} días` : "perpetua"}`, flags: MessageFlags.Ephemeral });
    }
  }

  // ===== /MÉTRICAS =====
  if (interaction.isChatInputCommand() && interaction.commandName === "metricas") {
    const pAdmmetricas = interaction.member && (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || isBotAdmin(interaction.guildId, interaction.user.id));
    if (!pAdmmetricas) return interaction.reply({ content: t2(interaction, "res_no_perm"), flags: MessageFlags.Ephemeral});
    if (!isPremium(interaction.guildId, "metrics"))
      return interaction.reply({ content: premiumNotice(interaction.guildId, "metrics"), flags: MessageFlags.Ephemeral});
    const dias = interaction.options.getInteger("dias") || 7;
    const rows = db.getMetrics(interaction.guildId, dias) || [];
    const byCmd = new Map();
    for (const r of rows) byCmd.set(r.cmd, (byCmd.get(r.cmd) || 0) + r.hits);
    const top = [...byCmd.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!top.length) return interaction.reply({ content: "📊 Todavía no hay datos de uso.", flags: MessageFlags.Ephemeral});
    const total = [...byCmd.values()].reduce((a, b) => a + b, 0);
    const emb = new EmbedBuilder().setTitle(`📊 Métricas de uso (${dias} días)`).setColor(0x5865f2)
      .setDescription(top.map(([c, n], i) => `${i + 1}. \`/${c}\` — **${n}** usos (${Math.round(n / total * 100)}%)`).join("\n"))
      .setFooter({ text: `Total: ${total} comandos en ${dias} días` });
    return interaction.reply({ embeds: [emb], flags: MessageFlags.Ephemeral});
  }

  // ===== /CONTADOR =====
  if (interaction.isChatInputCommand() && interaction.commandName === "contador") {
    const pAdmcontador = interaction.member && (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || isBotAdmin(interaction.guildId, interaction.user.id));
    if (!pAdmcontador) return interaction.reply({ content: t2(interaction, "res_no_perm"), flags: MessageFlags.Ephemeral});
    if (!isPremium(interaction.guildId, "counters"))
      return interaction.reply({ content: premiumNotice(interaction.guildId, "counters"), flags: MessageFlags.Ephemeral});
    const sub = interaction.options.getSubcommand();
    if (sub === "crear") {
      const ch = interaction.options.getChannel("canal");
      const kind = interaction.options.getString("tipo");
      const id = `c${Date.now()}`;
      const emb = applyBrand(new EmbedBuilder().setDescription(counterText({ kind }, interaction.guild)).setTimestamp(), interaction.guildId);
      const msg = await ch.send({ embeds: [emb] }).catch(() => null);
      db.setCounter(interaction.guildId, { id, channelId: ch.id, kind, messageId: msg ? msg.id : "" });
      return interaction.reply({ content: `📊 Contador creado en <#${ch.id}>.`, flags: MessageFlags.Ephemeral});
    }
    if (sub === "actualizar") {
      await refreshCounters(interaction.guild);
      return interaction.reply({ content: "📊 Contadores actualizados.", flags: MessageFlags.Ephemeral});
    }
    const list = db.getCounters(interaction.guildId);
    if (!list.length) return interaction.reply({ content: "📊 No hay contadores en este servidor.", flags: MessageFlags.Ephemeral});
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("📊 Contadores").setColor(0x5865f2)
      .setDescription(list.map(c => `${counterText(c, interaction.guild)} · <#${c.channelId}>`).join("\n"))], flags: MessageFlags.Ephemeral});
  }

  // ===== /MENSAJE (entrada y salida) =====
  if (interaction.isChatInputCommand() && interaction.commandName === "mensaje") {
    const pAdmmensaje = interaction.member && (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || isBotAdmin(interaction.guildId, interaction.user.id));
    if (!pAdmmensaje) return interaction.reply({ content: t2(interaction, "res_no_perm"), flags: MessageFlags.Ephemeral});
    if (!isPremium(interaction.guildId, "entryMsgs"))
      return interaction.reply({ content: premiumNotice(interaction.guildId, "entryMsgs"), flags: MessageFlags.Ephemeral});
    const sub = interaction.options.getSubcommand();
    if (sub === "activar" || sub === "desactivar") {
      const kind = interaction.options.getString("tipo");
      const cid = interaction.options.getChannel("canal").id;
      let list = db.getEntryMsgs(interaction.guildId) || [];
      list = list.filter(x => !(x.kind === kind && x.channelId === cid));
      if (sub === "activar") list.push({ kind, channelId: cid });
      db.setEntryMsgs(interaction.guildId, list);
      return interaction.reply({ content: sub === "activar" ? `✅ Mensajes de **${kind === "join" ? "entrada" : "salida"}** activados en <#${cid}>.` : `✅ Mensajes desactivados en <#${cid}>.`, flags: MessageFlags.Ephemeral});
    }
    const list = db.getEntryMsgs(interaction.guildId) || [];
    if (!list.length) return interaction.reply({ content: "📝 No hay mensajes de entrada/salida configurados.", flags: MessageFlags.Ephemeral});
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("📝 Mensajes de entrada y salida").setColor(0x5865f2)
      .setDescription(list.map(e => `${e.kind === "join" ? "🟢 Entrada" : "🔴 Salida"} · <#${e.channelId}>`).join("\n"))], flags: MessageFlags.Ephemeral});
  }

  // ===== /TEMPORIZADOR =====
  if (interaction.isChatInputCommand() && interaction.commandName === "temporizador") {
    const pAdmtemporizador = interaction.member && (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || isBotAdmin(interaction.guildId, interaction.user.id));
    if (!pAdmtemporizador) return interaction.reply({ content: t2(interaction, "res_no_perm"), flags: MessageFlags.Ephemeral});
    if (!isPremium(interaction.guildId, "timers"))
      return interaction.reply({ content: premiumNotice(interaction.guildId, "timers"), flags: MessageFlags.Ephemeral});
    const sub = interaction.options.getSubcommand();
    if (sub === "crear") {
      const when = interaction.options.getString("cuando");
      let at = parseDurationStr(when);
      if (!at) {
        const hm = when.match(/(\d{1,2}):(\d{2})/);
        if (hm) { const d = new Date(); d.setHours(+hm[1], +hm[2], 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); at = d.getTime() - Date.now(); }
      }
      if (!at || at < 10000) return interaction.reply({ content: "❌ Indica un tiempo válido: `30m`, `2h`, `1d` o una hora como `18:00`.", flags: MessageFlags.Ephemeral});
      const id = `t${Date.now()}`;
      const ch = interaction.options.getChannel("canal");
      const usr = interaction.options.getUser("usuario");
      db.setTimer(interaction.guildId, { id, at: Date.now() + at, text: interaction.options.getString("texto").slice(0, 1800), channelId: ch.id, userId: usr ? usr.id : "", by: interaction.user.tag, embed: true });
      return interaction.reply({ content: `⏰ Temporizador creado (${when}).\nID: \`${id}\``, flags: MessageFlags.Ephemeral});
    }
    if (sub === "borrar") {
      const id = interaction.options.getString("id");
      const ex = db.getGuildTimers(interaction.guildId).find(t => t.id === id);
      if (!ex) return interaction.reply({ content: "❌ No encontré ese temporizador.", flags: MessageFlags.Ephemeral});
      db.delTimer(interaction.guildId, id);
      return interaction.reply({ content: "🗑️ Temporizador borrado.", flags: MessageFlags.Ephemeral});
    }
    const list = db.getGuildTimers(interaction.guildId);
    if (!list.length) return interaction.reply({ content: "⏰ No hay temporizadores activos.", flags: MessageFlags.Ephemeral});
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle("⏰ Temporizadores").setColor(0x5865f2)
      .setDescription(list.map(t => `\`${t.id}\` · <t:${Math.floor(t.at / 1000)}:R> · <#${t.channelId}>\n${String(t.text).slice(0, 80)}`).join("\n\n"))], flags: MessageFlags.Ephemeral});
  }

  // ===== /PROMOCION =====
  if (interaction.isChatInputCommand() && interaction.commandName === "promocion") {
    const pAdm = interaction.member && (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || isBotAdmin(interaction.guildId, interaction.user.id));
    if (!pAdm) return interaction.reply({ content: t2(interaction, "res_no_perm"), flags: MessageFlags.Ephemeral});
    const sub = interaction.options.getSubcommand();
    const gc = getGuildConfig(interaction.guildId);

    if (sub === "ver") {
      const enabled = gc.promoEnabled;
      const now = Date.now();
      const start = Date.parse(gc.promoStart || 0);
      const end = Date.parse(gc.promoEnd || 0);
      const active = enabled && start && end && now >= start && now <= end;
      if (!active || !enabled) {
        return interaction.reply({ content: "🏷️ No hay promoción activa.", flags: MessageFlags.Ephemeral });
      }
      const prices = PREMIUM_PLANS;
      const lines = [];
      for (const [plan, p] of Object.entries(prices)) {
        const pct = gc[`promo${plan.charAt(0).toUpperCase() + plan.slice(1)}Pct`] || 0;
        const base = p.priceUSD || 0;
        const final = pct > 0 ? Math.round(base * (100 - pct) / 100) : base;
        lines.push(`${PREM_LABEL[plan] || plan}: **$${base}** ${pct > 0 ? `→ **$${final}** (-${pct}%)` : ""}`);
      }
      const emb = new EmbedBuilder().setTitle("🏷️ Promoción activa").setColor(0x00FF00)
        .setDescription(lines.join("\n"))
        .addFields(
          { name: "📅 Vigencia", value: `<t:${Math.floor(start/1000)}:R> → <t:${Math.floor(end/1000)}:R>`, inline: true },
          { name: "🔖 Código", value: gc.promoCode || "—", inline: true },
        )
        .setFooter({ text: gc.promoNote || "Sin nota adicional" });
      return interaction.reply({ embeds: [emb], flags: MessageFlags.Ephemeral });
    }

    if (sub === "activar") {
      const pctPerpetual = interaction.options.getInteger("perpetual") || 0;
      const pctSub = interaction.options.getInteger("sub") || 0;
      const pctBoost = interaction.options.getInteger("boost") || 0;
      const pctWhite = interaction.options.getInteger("white") || 0;
      const pctDonate = interaction.options.getInteger("donate") || 0;
      const inicio = interaction.options.getString("inicio");
      const fin = interaction.options.getString("fin");
      const codigo = interaction.options.getString("codigo") || "";
      const nota = interaction.options.getString("nota") || "";
      const start = Date.parse(inicio);
      const end = Date.parse(fin);
      if (isNaN(start) || isNaN(end) || end <= start) {
        return interaction.reply({ content: "❌ Fechas inválidas (formato ISO 8601: 2026-12-20T00:00:00Z).", flags: MessageFlags.Ephemeral });
      }
      gc.promoEnabled = true;
      gc.promoPerpetualPct = pctPerpetual;
      gc.promoSubPct = pctSub;
      gc.promoBoostPct = pctBoost;
      gc.promoWhitePct = pctWhite;
      gc.promoDonatePct = pctDonate;
      gc.promoStart = inicio;
      gc.promoEnd = fin;
      gc.promoCode = codigo;
      gc.promoNote = nota;
      saveGuilds();
      return interaction.reply({ content: "✅ Promoción activada.", flags: MessageFlags.Ephemeral });
    }

    if (sub === "desactivar") {
      gc.promoEnabled = false;
      saveGuilds();
      return interaction.reply({ content: "✅ Promoción desactivada.", flags: MessageFlags.Ephemeral });
    }
  }

  // ===== MENÚ CONTEXTUAL (clic derecho sobre un usuario) =====
  if (interaction.isUserContextMenuCommand()) {
    const CTX_CMD = { "Advertir": "warn", "Aislar": "timeout", "Expulsar": "kick", "Banear": "ban" };
    const base = CTX_CMD[interaction.commandName];
    const target = interaction.targetUser;
    if (!base || !target) return;
    if (target.bot) return interaction.reply({ content: t2(interaction, "ctx_bot"), flags: MessageFlags.Ephemeral});
    if (interaction.guild && target.id === interaction.guild.ownerId)
      return interaction.reply({ content: t2(interaction, "ctx_owner"), flags: MessageFlags.Ephemeral});
    if (!canUseModCommand(interaction.member, base))
      return interaction.reply({ content: noPermMsg(interaction.member, base), flags: MessageFlags.Ephemeral});
    const modal = new ModalBuilder()
      .setCustomId(`ctxmod|${base}|${target.id}|${interaction.guildId}`)
      .setTitle(`HYDRA · ${interaction.commandName} · ${target.username.slice(0, 24)}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("motivo").setLabel("Motivo (opcional)").setStyle(TextInputStyle.Short).setMaxLength(300).setRequired(false)
            .setPlaceholder(t2(interaction, "ctx_reason_ph"))
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId("pruebas_si")
            .setPlaceholder("¿Hay pruebas?")
            .addOptions({ label: "Sí, adjunté pruebas", value: "si" }, { label: "No hay pruebas", value: "no", default: true })
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("pruebas_url").setLabel("Enlace de las pruebas (opcional)").setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false)
            .setPlaceholder("https://...")
        ),
      );
    return interaction.showModal(modal).catch(() => {});
  }

  // ===== /RESCATE: claves de recuperación y co-propietarios =====
  if (interaction.isChatInputCommand() && interaction.commandName === "rescate") {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId;
    const isAdmin = interaction.member && (interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || isBotAdmin(gid, interaction.user.id));
    if (sub === "generar") {
      if (!isAdmin) return interaction.reply({ content: t2(interaction, "res_no_perm"), flags: MessageFlags.Ephemeral});
      const key = genRescueKey(gid, interaction.user.id);
      const st = rescueState(gid);
      const msg = `🆘 **Clave de rescate creada**\nClave: \`${key}\`\nVálida **24 h** · **1 uso**\n\nEnvíala a quien se quede sin control del bot: con \`/rescate usar\` recupera todos los permisos del bot en este servidor.`;
      try { await interaction.user.send(msg); } catch {}
      return interaction.reply({ content: `🆘 Clave creada y enviada por DM.\nPista: \`${st.keyHint}\`\n${t2(interaction, "res_dm_fail")}`, flags: MessageFlags.Ephemeral});
    }
    if (sub === "usar") {
      const res = redeemRescue(gid, interaction.options.getString("clave"), interaction.user.id, interaction.user.tag);
      if (!res.ok) {
        const m = { no_key: "res_no_key", expired: "res_expired", invalid: "res_invalid" }[res.error] || "res_invalid";
        return interaction.reply({ content: t2(interaction, m), flags: MessageFlags.Ephemeral});
      }
      if (res.roleId) {
        const m = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (m) await m.roles.add(res.roleId, "Rescate HYDRA").catch(() => {});
      }
      return interaction.reply({ content: `🆘 **Rescate exitoso.** Ahora tienes control total del bot en este servidor.${res.usesLeft > 0 ? `\nUsos restantes: **${res.usesLeft}**` : ""}`, flags: MessageFlags.Ephemeral});
    }
    if (sub === "revocar") {
      if (!isAdmin) return interaction.reply({ content: t2(interaction, "res_no_perm"), flags: MessageFlags.Ephemeral});
      revokeRescueKey(gid);
      return interaction.reply({ content: "🆘 Clave de rescate revocada.", flags: MessageFlags.Ephemeral});
    }
    if (sub === "info") {
      if (!isAdmin) return interaction.reply({ content: t2(interaction, "res_no_perm"), flags: MessageFlags.Ephemeral});
      const st = rescueState(gid);
      const emb = new EmbedBuilder().setTitle("🆘 Rescate y propiedad").setColor(0x5865F2).addFields(
        { name: "Clave activa", value: st.keyHash ? `\`${st.keyHint}\` · expira <t:${Math.floor(st.expiresAt / 1000)}:R> · usos: ${st.usesLeft}` : "Ninguna", inline: false },
        { name: "Rescates concedidos", value: st.grants.length ? st.grants.slice(0, 10).map(g => `<@${g.userId}> (<t:${Math.floor(g.at / 1000)}:R>)`).join("\n") : "Ninguno", inline: false },
        { name: "Co-propietarios", value: st.coOwners.length ? st.coOwners.map(u => `<@${u}>`).join(", ") : "Ninguno", inline: false },
      );
      return interaction.reply({ embeds: [emb], flags: MessageFlags.Ephemeral});
    }
  }


  // ===== FAST PATH: BOTONES DE INSCRIPCIÓN (moved to top for instant response) =====
  if (interaction.isButton() && interaction.customId.startsWith("insc_si_")) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral});
      const parts = interaction.customId.split("_");
      const guildId = parts[2];
      const eventIdOrRoleId = parts[3];
      const userId = parts[4];

      if (interaction.user.id !== userId) return interaction.editReply({ content: "❌ Este botón no es para ti." });

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return interaction.editReply({ content: "❌ Servidor no encontrado." });

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return interaction.editReply({ content: "❌ Miembro no encontrado." });

      let ev = events.get(eventIdOrRoleId);
      if (!ev) {
        for (const [id, e] of events) {
          if (e.roleId === eventIdOrRoleId) { ev = e; break; }
        }
      }

      if (ev && ev.confirmed && ev.confirmed.includes(userId)) {
        return interaction.editReply({ content: "⚠️ Ya has confirmado tu participación anteriormente. No puedes confirmar dos veces." });
      }

      if (ev && ev.participants && ev.participants.find(p => p.userId === userId)) {
        return interaction.editReply({ content: "⚠️ Ya estás inscrito en este evento. No puedes volver a inscribirte." });
      }

      // Also check if they already have the event role
      if (ev && ev.roleId && member && member.roles && member.roles.cache.has(ev.roleId)) {
        return interaction.editReply({ content: "⚠️ Ya tienes el rol del evento. No necesitas confirmar nuevamente." });
      }

      let mcNick = getMcNick(guildId, userId);
      let participanteNum = "?";
      let totalParticipantes = "?";
      if (ev && ev.roleId) {
        const evRole = guild.roles.cache.get(ev.roleId);
        totalParticipantes = evRole ? evRole.members.size : ev.participants ? ev.participants.length : "?";
      }
      if (ev && ev.participants) {
        const idx = ev.participants.findIndex(p => p.userId === userId);
        if (idx !== -1) {
          if (!mcNick) mcNick = ev.participants[idx].nick || "N/A";
        }
      }
      if (ev) {
        if (!ev.confirmed) ev.confirmed = [];
        if (!ev.confirmed.includes(userId)) {
          ev.confirmed.push(userId);
          saveEvents();
        }
        participanteNum = ev.confirmed.length;
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Confirmación de Participación")
        .setDescription("<@" + userId + "> **aceptó** participar en el evento.")
        .addFields(
          { name: "👤 Usuario", value: member.user.tag + " (" + userId + ")", inline: true },
          { name: "📛 Nombre", value: member.displayName, inline: true },
          { name: "⛏️ Nick de Minecraft", value: mcNick || "N/A", inline: true },
          { name: "📅 Respondió", value: "<t:" + Math.floor(Date.now() / 1000) + ":R>", inline: true },
          { name: "🏅 Participante", value: participanteNum + "/" + totalParticipantes, inline: true }
        )
        .setColor(0x00FF00)
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setTimestamp();

      const owner = await guild.members.fetch("1307246359895740448").catch(() => null);
      if (owner) {
        try { await owner.send({ embeds: [embed] }); } catch {}
      }

      return interaction.editReply({ content: "✅ ¡Gracias por confirmar! Tu respuesta ha sido registrada." });
    } catch (err) {
      console.error("❌ insc_si error:", err.message);
      try {
        if (interaction.deferred) await interaction.editReply({ content: "❌ Error al procesar tu respuesta." });
        else await interaction.reply({ content: "❌ Error al procesar tu respuesta.", flags: MessageFlags.Ephemeral });
      } catch {}
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith("insc_no_")) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const parts = interaction.customId.split("_");
      const guildId = parts[2];
      const eventIdOrRoleId = parts[3];
      const userId = parts[4];

      if (interaction.user.id !== userId) return interaction.editReply({ content: "❌ Este botón no es para ti." });

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return interaction.editReply({ content: "❌ Servidor no encontrado." });

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return interaction.editReply({ content: "❌ Miembro no encontrado." });

      let ev = events.get(eventIdOrRoleId);
      if (!ev) {
        for (const [id, e] of events) {
          if (e.roleId === eventIdOrRoleId) { ev = e; break; }
        }
      }

      if (ev && ev.rejected && ev.rejected.find(r => r.userId === userId)) {
        return interaction.editReply({ content: "⚠️ Ya habías rechazado participar anteriormente. No puedes rechazar dos veces." });
      }

      let mcNick = getMcNick(guildId, userId);
      let eventName = "Desconocido";
      if (ev) {
        eventName = ev.nombre;
        if (ev.participants) {
          const idx = ev.participants.findIndex(p => p.userId === userId);
          if (idx !== -1) {
            mcNick = ev.participants[idx].nick || mcNick || "N/A";
            ev.participants.splice(idx, 1);
          }
        }
        if (ev.confirmed) {
          const cIdx = ev.confirmed.indexOf(userId);
          if (cIdx !== -1) ev.confirmed.splice(cIdx, 1);
        }
        if (!ev.rejected) ev.rejected = [];
        if (!ev.rejected.find(r => r.userId === userId)) {
          ev.rejected.push({ userId, nick: mcNick, tag: member.user.tag, timestamp: Date.now() });
        }
        saveEvents();
      }

      if (ev && ev.roleId) {
        await member.roles.remove(ev.roleId).catch(() => {});
      }
      const prId = getParticipanteRoleId(guildId);
      if (prId) await member.roles.remove(prId).catch(() => {});
      const mediaTeamRole = guild.roles.cache.find(r => r.name === "Media Team");
      if (mediaTeamRole && member.roles.cache.has(mediaTeamRole.id)) {
        await member.roles.remove(mediaTeamRole.id).catch(() => {});
      }

      try {
        await member.send({
          embeds: [new EmbedBuilder()
            .setTitle("❌ Eliminado del Evento")
            .setDescription(`Has sido eliminado del evento **${eventName}**.`)
            .addFields(
              { name: "📛 Nombre", value: member.displayName, inline: true },
              { name: "⛏️ Nick", value: mcNick || "N/A", inline: true },
              { name: "📅 Fecha", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setColor(0xFF0000)
            .setTimestamp()
          ]
        });
      } catch {}

      const rejectedCount = ev && ev.rejected ? ev.rejected.length : 0;
      const totalInscritos = ev && ev.participants ? ev.participants.length : 0;
      const evRole = ev && ev.roleId ? guild.roles.cache.get(ev.roleId) : null;
      const roleMemberCount = evRole ? evRole.members.size : totalInscritos;

      const ownerEmbed = new EmbedBuilder()
        .setTitle("🚪 Participante Eliminado del Evento")
        .setDescription(`<@${userId}> **no participará** en **${eventName}**.`)
        .addFields(
          { name: "👤 Usuario", value: member.user.tag + " (" + userId + ")", inline: true },
          { name: "📛 Nombre", value: member.displayName, inline: true },
          { name: "⛏️ Nick de Minecraft", value: mcNick || "N/A", inline: true },
          { name: "📅 Respondió", value: "<t:" + Math.floor(Date.now() / 1000) + ":R>", inline: true },
          { name: "📊 Rechazados", value: `**${rejectedCount}** persona(s) no participarán`, inline: true },
          { name: "👥 Inscritos restantes", value: `**${roleMemberCount}** con rol / **${totalInscritos}** en lista`, inline: true }
        )
        .setColor(0xFF0000)
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setTimestamp();

      const owner = await guild.members.fetch("1307246359895740448").catch(() => null);
      if (owner) {
        try { await owner.send({ embeds: [ownerEmbed] }); } catch {}
      }

      return interaction.editReply({ content: "❌ Has sido eliminado del evento. Se removieron tus roles de evento, participante y media team." });
    } catch (err) {
      console.error("❌ insc_no error:", err.message);
      try {
        if (interaction.deferred) await interaction.editReply({ content: "❌ Error al procesar tu respuesta." });
        else await interaction.reply({ content: "❌ Error al procesar tu respuesta.", flags: MessageFlags.Ephemeral });
      } catch {}
    }
    return;
  }

  if (interaction.isButton() && interaction.customId === "insc_done") {
    return interaction.reply({ content: "⚠️ Ya has respondido a esta encuesta.", flags: MessageFlags.Ephemeral });
  }

  // ===== BOT SUSPENDED CHECK =====
  if (botSuspended && interaction.isChatInputCommand()) {
    const allowedWhenSuspended = ["bot", "evento"];
    if (!allowedWhenSuspended.includes(interaction.commandName)) {
      return interaction.reply({ content: "⏸️ Bot suspendido temporalmente. Solo comandos de eventos y control están disponibles.", flags: MessageFlags.Ephemeral });
    }
  }

  try {
    // ===== PING =====
    if (interaction.commandName === "ping") {
      const sent = await interaction.reply({ content: "🏓 Pinging...", fetchReply: true });
      return interaction.editReply({ content: `🏓 Pong! **${sent.createdTimestamp - interaction.createdTimestamp}ms** | API: **${Math.round(client.ws.ping)}ms**` });
    }

    // ===== AYUDA =====
    if (interaction.commandName === "ayuda") {
      const pages = [
        {
          title: "📋 Comandos de HYDRA Bot (1/9)",
          desc: `Bot multifuncional para **${interaction?.guild?.name || "tu servidor"}**`,
          fields: [
            { name: "🔧 Utilidad", value: "`/ping` Latencia del bot\n`/userinfo` Información de usuario\n`/avatar` Avatar de usuario\n`/channelinfo` Info de canal\n`/boosters` Lista de boosters\n`/ayuda` Este menú\n`/recordatorio` Recordatorio por DM\n`/clima` Clima de una ciudad\n`/traducir` Traducir texto" },
            { name: "🛡️ Moderación", value: "`/clear` Borrar mensajes\n`/purge` Purgar con filtro\n`/slowmode` Modo lento\n`/lock` Bloquear canal\n`/unlock` Desbloquear canal\n`/nuke` Nukear canal\n`/timeout` Aislar usuario\n`/warn` Advertir (registra caso)\n`/warns` Ver warns\n`/delwarn` Quitar warn\n`/kick` Expulsar\n`/ban` Ban permanente\n`/tempban` Ban temporal\n`/unban` Desbanear\n`/softban` Ban+unban (limpia mensajes)\n`/setnick` Cambiar apodo\n`/vmute` Mutear en voz\n`/vockick` Desconectar de voz" },
            { name: "📢 Anuncios", value: "`/anuncio` Panel de embeds\n`/setup-verification` Configurar verificación\n`/captcha-test` Probar captcha" },
          ]
        },
        {
          title: "📋 Comandos de HYDRA Bot (2/9)",
          desc: "Música, sorteos y social",
          fields: [
            { name: "🎵 Música", value: "`/play` Reproducir canción\n`/pause` Pausar\n`/resume` Reanudar\n`/stop` Detener y salir\n`/skip` Saltar canción\n`/queue` Ver cola\n`/nowplaying` Canción actual\n`/volumen` Ajustar volumen\n`/loop` Activar loop" },
            { name: "🎉 Sorteos", value: "`/sorteo crear` Crear sorteo\n`/sorteo finalizar` Finalizar sorteo\n`/sorteo editar` Editar premio" },
            { name: "📊 Social", value: "`/encuesta crear` Encuesta con reacciones\n`/encuesta finalizar` Finalizar\n`/sugerencia enviar` Enviar sugerencia\n`/tweet` Tweet falso con imagen" },
          ]
        },
        {
          title: "📋 Comandos de HYDRA Bot (3/9)",
          desc: "Diversión y entretenimiento",
          fields: [
            { name: "🎲 Diversión", value: "`/8ball` Bola mágica 8\n`/random` Número aleatorio\n`/ship` Compatibilidad entre usuarios (con imagen)\n`/meme` Meme aleatorio de Reddit" },
          ]
        },
        {
          title: "📋 Comandos de HYDRA Bot (4/9)",
          desc: "Eventos, equipos y server",
          fields: [
            { name: "🎮 Eventos", value: "`/evento crear` Crear evento\n`/evento listar` Ver eventos\n`/evento participantes` Ver inscritos\n`/evento cerrar` Cerrar inscripciones\n`/evento iniciar` Marcar EN CURSO\n`/evento finalizar` Marcar finalizado\n`/evento mostrar` Embed persistente\n`/evento eliminar` Eliminar evento\n`/cuenta-regresiva` Cuenta regresiva" },
            { name: "👥 Equipos", value: "`/equipo crear` Crear equipo\n`/equipo listar` Ver equipos\n`/equipo eliminar` Eliminar equipo\n`/equipo invitar` Invitar a equipo\n`/equipo expulsar` Expulsar miembro\n`/equipo salir` Salir del equipo\n`/equipo aceptar` Aceptar invitación\n`/equipo rechazar` Rechazar invitación" },
            { name: "🖥️ Server MC", value: "`/server status` Estado del servidor\n`/server edit` Cambiar IP/puerto" },
            { name: "📨 Inscripciones", value: "`/md mensaje` Abre panel para enviar DM de inscripción\n`/md prueba texto:... evento:...` Enviar DM de prueba a ti mismo\n`/md limpiar` y `/md recordar` Gestión de DMs" },
          ]
        },
        {
          title: "📋 Comandos de HYDRA Bot (5/9)",
          desc: "Predicciones, redes, clips y estadísticas",
          fields: [
            { name: "🔮 Predicciones", value: "`/predecir` Predecir ganador" },
            { name: "🔗 Redes Sociales", value: "`/enlazar cuenta` Vincular cuenta\n`/enlazar canal` Configurar notificaciones\n`/enlazar ver-canales` Ver canales\n`/redes` Ver redes de usuario" },
            { name: "📎 Clips", value: "`/clip guardar` Guardar clip\n`/clip listar` Ver clips\n`/clip buscar` Buscar clips\n`/clip favoritos` Favoritos\n`/clip eliminar` Eliminar clip" },
            { name: "📊 Estadísticas", value: "`/stats` Tus estadísticas\n`/leaderboard` Top 15 miembros" },
          ]
        },
        {
          title: "📋 Comandos de HYDRA Bot (6/9)",
          desc: "Servidor e invitaciones",
          fields: [
            { name: "📊 Servidor", value: "`/serverinfo` Info completa del servidor\n`/invite` Estadísticas de invitaciones y top invitadores" },
            { name: "⛏️ Minecraft", value: "`/skin` Ver skin de jugador\n`/mcprofile` Ver perfil (UUID + skin)\n`/mcstatus` Status detallado de cualquier servidor MC" },
          ]
        },
        {
          title: "📋 Comandos de HYDRA Bot (7/9)",
          desc: "Staff, tickets y bot",
          fields: [
            { name: "👮 Staff", value: "`/staff agregar` Agregar al staff\n`/staff quitar` Quitar del staff\n`/staff listar` Ver lista de staff" },
            { name: "🎫 Tickets", value: "`/ticket-setup` Panel de tickets\n`/ticket agregar/cerrar/reclamar/renombrar/escribir`\n\n**Botones:**\n🙋 Reclamar — Staff reclama el ticket (solo tú y el usuario escriben)\n🔒 Cerrar — Directivos o usuario cierran el ticket\n🔓 Reabrir — Reabre un ticket cerrado\n🗑️ Borrar — Solo Directivos (exige cerrar antes)\n👤 Agregar Staff · ➕ Agregar Usuario" },
            { name: "🤖 Bot", value: "`/bot modo` Cambiar actividad del bot\n`/bot control/apagar/reiniciar...` Control (dueño)" },
          ]
        },
        {
          title: "📋 Comandos de HYDRA Bot (8/9)",
          desc: "Confesiones anónimas",
          fields: [
            { name: "💌 Confesiones", value: "`/confesar` Enviar confesión anónima\n`/borrar` Eliminar tu confesión (por enlace)\n`/responder` Responder a una confesión\n`/reportar` Reportar contenido inapropiado\n`/apelar` Apelar un baneo de confesiones\n`/confesion historial` Ver historial" },
            { name: "🚫 Mod. Confesiones", value: "`/confesion banear` Banear de confesiones\n`/confesion baneados` Ver baneados\n`/confesion limpiar` Limpiar baneos\n`/confesion desbanear` Desbanear" },
          ]
        },
        {
          title: "📋 Comandos de HYDRA Bot (9/9)",
          desc: "Envío de inscripciones por DM y nicks de Minecraft",
          fields: [
            { name: "📨 Inscripciones", value: "`/md mensaje` Abre panel para enviar DM de inscripción\n`/md prueba texto:...` DM de prueba a ti mismo" },
            { name: "⛏️ Nicks de Minecraft", value: "`/mc-nick guardar <nick>` Guarda tu nick de MC\n`/mc-nick ver [@usuario]` Ver nick guardado\n`/mc-nick lista` Ver todos los nicks guardados" },
            { name: "📌 Notas", value: "• El DM incluye 2 botones: ✅ Si participaré / ❌ No participaré\n• El eventId es necesario para saber en qué evento estás confirmando\n• Los nicks se sincronizan automáticamente al registrarte en eventos" },
          ]
        }
      ];

      let currentPage = 0;

      function getPage(page) {
        const p = pages[page];
        return new EmbedBuilder()
          .setTitle(p.title)
          .setDescription(p.desc)
          .setColor(0x5865F2)
          .addFields(p.fields.map(f => ({ name: f.name, value: f.value })))
          .setFooter({ text: `HYDRA Bot • Hydra Studio • Página ${page + 1}/${pages.length}` })
          .setTimestamp();
      }

      const prevBtn = new ButtonBuilder().setCustomId("ayuda_prev").setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(true);
      const nextBtn = new ButtonBuilder().setCustomId("ayuda_next").setLabel("➡️").setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

      const reply = await interaction.reply({ embeds: [getPage(0)], components: [row], fetchReply: true });

      const collector = reply.createMessageComponentCollector({ time: 120000 });
      collector.on("collect", async (i) => {
        try {
          if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ No es tu menú.", flags: MessageFlags.Ephemeral });
          if (i.customId === "ayuda_prev") currentPage = Math.max(0, currentPage - 1);
          if (i.customId === "ayuda_next") currentPage = Math.min(pages.length - 1, currentPage + 1);
          prevBtn.setDisabled(currentPage === 0);
          nextBtn.setDisabled(currentPage === pages.length - 1);
          await i.update({ embeds: [getPage(currentPage)], components: [row] });
        } catch (e) { console.error("Ayuda collector error:", e.message); }
      });
      return;
    }

    // ===== SETUP-VERIFICATION =====
    if (interaction.commandName === "setup-verification") {
      return interaction.reply(buildVerifyPanel(interaction.guild.id, interaction.member));
    }

    // ===== CAPTCHA-TEST =====
    if (interaction.commandName === "captcha-test") {
      const text = genCaptcha(6);
      const buf = await captchaImage(text);
      const gcT = getGuildConfig(interaction.guild.id);
      const tmo = gcT.verifyTimeoutSec || 120;
      pendingCaptchas.set(interaction.user.id, { text, timestamp: Date.now() });
      const foot = tmo >= 60 ? `${Math.round(tmo / 60)} minutos` : `${tmo} segundos`;
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(gcT.captchaTitle || "🔐 Tu Captcha").setDescription(gcT.captchaDesc || "Escribe el código:").setColor(0xff6b6b).setImage("attachment://captcha.png").setFooter({ text: foot })], files: [new AttachmentBuilder(buf, { name: "captcha.png" })], flags: MessageFlags.Ephemeral });
    }

    // ===== ANUNCIO - PANEL =====
    if (interaction.commandName === "anuncio") {
      const modal = new ModalBuilder().setCustomId("anuncio_modal").setTitle("Crear Anuncio Embed");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("titulo").setLabel("Título").setPlaceholder("¡Atención, comunidad!").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("contenido").setLabel("Contenido (\\n = salto)").setPlaceholder("• Punto 1\\n• Punto 2").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("color").setLabel("Color hex (sin #)").setPlaceholder("FF6B6B").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(6)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("footer").setLabel("Pie de página").setPlaceholder("HYDRA Bot").setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("miniatura").setLabel("URL Miniatura").setPlaceholder("https://...").setStyle(TextInputStyle.Short).setRequired(false)),
      );
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "anuncio_modal") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const titulo = interaction.fields.getTextInputValue("titulo");
      const contenido = interaction.fields.getTextInputValue("contenido").replace(/\\n/g, "\n");
      const colorHex = interaction.fields.getTextInputValue("color") || "5865F2";
      const footer = interaction.fields.getTextInputValue("footer");
      const miniatura = interaction.fields.getTextInputValue("miniatura");
      let color; try { color = parseInt(colorHex.replace("#",""),16); } catch { color = 0x5865f2; }
      const preview = new EmbedBuilder().setTitle(titulo).setDescription(contenido).setColor(color).setTimestamp();
      if (miniatura && miniatura.startsWith("http")) preview.setThumbnail(miniatura);
      if (footer) preview.setFooter({ text: footer });

      const chOptions = interaction.guild.channels.cache.filter(ch => ch.isTextBased() && !ch.isThread()).sort((a, b) => a.position - b.position).first(25).map(ch => ({ label: `# ${ch.name}`, value: ch.id }));
      pendingAnuncios.set(interaction.user.id, { titulo, contenido, color, footer, miniatura, mencion: "none", canalId: interaction.channel.id });

      const roles = interaction.guild.roles.cache.filter(r => r.name !== "@everyone" && !r.managed).sort((a, b) => b.position - a.position).first(25).map(r => ({ label: r.name, value: r.id }));
      const allMentionOptions = [{ label: "Sin mencion", value: "none", default: true }, { label: "@everyone", value: "everyone" }, { label: "@here", value: "here" }, ...roles];
      const channelRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("anuncio_canal").setPlaceholder("Canal destino").setMinValues(1).setMaxValues(1).addOptions(chOptions));
      const mentionRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("anuncio_mencion").setPlaceholder("Mencion").setMinValues(1).setMaxValues(1).addOptions(allMentionOptions));
      const btnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("anuncio_confirmar").setLabel("Enviar").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId("anuncio_cancelar").setLabel("Cancelar").setStyle(ButtonStyle.Danger));
      return interaction.editReply({ content: "📋 **Vista previa:**", embeds: [preview], components: [channelRow, mentionRow, btnRow] });
    }

    // ===== EVENTO MODAL =====
    if (interaction.isModalSubmit() && interaction.customId === "evento_modal") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const titulo = interaction.fields.getTextInputValue("titulo");
      const desc = interaction.fields.getTextInputValue("descripcion").replace(/\\n/g, "\n");
      const fecha = interaction.fields.getTextInputValue("fecha");
      const hora = interaction.fields.getTextInputValue("hora");
      const modo = interaction.fields.getTextInputValue("modo") || "Hunger Games";
      const cupos = 40;
      const premio = "$20 USD para el ganador";
      const [y, m, d] = fecha.split("-").map(Number);
      const [hh, mm] = hora.split(":").map(Number);
      const fechaTs = Math.floor(new Date(y, m - 1, d, hh, mm, 0).getTime() / 1000);
      if (isNaN(fechaTs) || fechaTs * 1000 < Date.now()) return interaction.editReply({ content: "❌ La fecha no es valida o ya paso." });

      pendingEvents.set(`${interaction.guildId}:${interaction.user.id}`, { titulo, desc, fecha, hora, cupos, premio, fechaTs, colorInt: 0x00FF00, modo, canalId: interaction.channel.id, mencion: "none", footer: "", miniatura: "", premio });

      const preview = new EmbedBuilder()
        .setTitle(`🎮 ${titulo}`)
        .setDescription(`**${desc}**\n\n📅 **Fecha:** <t:${fechaTs}:F> (<t:${fechaTs}:R>)\n🎮 **Modo:** ${modo}\n👥 **Cupos:** 0/${cupos}\n💰 **Premio:** ${premio}\n📊 **Estado:** Abierto`)
        .setColor(0x00FF00)
        .setTimestamp();

      const chOptions = interaction.guild.channels.cache.filter(ch => ch.isTextBased() && !ch.isThread()).sort((a, b) => a.position - b.position).first(25).map(ch => ({ label: `# ${ch.name}`, value: ch.id }));
      const roles = interaction.guild.roles.cache.filter(r => r.name !== "@everyone" && !r.managed).sort((a, b) => b.position - a.position).first(25).map(r => ({ label: r.name, value: r.id }));
      const allMentionOptions = [{ label: "Sin mencion", value: "none", default: true }, { label: "@everyone", value: "everyone" }, { label: "@here", value: "here" }, ...roles];

      const channelRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("evento_canal").setPlaceholder("Canal destino").setMinValues(1).setMaxValues(1).addOptions(chOptions));
      const mentionRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("evento_mencion").setPlaceholder("Mencion").setMinValues(1).setMaxValues(1).addOptions(allMentionOptions));
      const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("evento_editar").setLabel("✏️ Editar").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("evento_footer").setLabel("📝 Opciones avanzadas").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("evento_confirmar").setLabel("Crear evento").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("evento_cancelar").setLabel("Cancelar").setStyle(ButtonStyle.Danger),
      );
      return interaction.editReply({ content: "📋 **Vista previa del evento:**", embeds: [preview], components: [channelRow, mentionRow, btnRow] });
    }

    // ===== EVENTO EDITAR =====
    if (interaction.isButton() && interaction.customId === "evento_editar") {
      const data = pendingEvents.get(`${interaction.guildId}:${interaction.user.id}`);
      if (!data) return interaction.reply({ content: "❌ Datos expirados.", flags: MessageFlags.Ephemeral });
      const modal = new ModalBuilder().setCustomId("evento_editar_modal").setTitle("Editar Evento");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("titulo").setLabel("Titulo del evento").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(data.titulo)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("descripcion").setLabel("Descripcion (usa \\n para saltos de linea)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue(data.desc.replace(/\n/g, "\\n"))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("fecha").setLabel("Fecha (YYYY-MM-DD)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(data.fecha)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("hora").setLabel("Hora (HH:MM)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5).setValue(data.hora)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modo").setLabel("Modo de juego").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(data.modo)),
      );
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "evento_editar_modal") {
      const data = pendingEvents.get(`${interaction.guildId}:${interaction.user.id}`);
      if (!data) return interaction.reply({ content: "❌ Datos expirados.", flags: MessageFlags.Ephemeral });
      data.titulo = interaction.fields.getTextInputValue("titulo");
      data.desc = interaction.fields.getTextInputValue("descripcion").replace(/\\n/g, "\n");
      data.fecha = interaction.fields.getTextInputValue("fecha");
      data.hora = interaction.fields.getTextInputValue("hora");
      data.modo = interaction.fields.getTextInputValue("modo") || "Hunger Games";
      const [y, m, d] = data.fecha.split("-").map(Number);
      const [hh, mm] = data.hora.split(":").map(Number);
      data.fechaTs = Math.floor(new Date(y, m - 1, d, hh, mm, 0).getTime() / 1000);
      if (isNaN(data.fechaTs) || data.fechaTs * 1000 < Date.now()) return interaction.reply({ content: "❌ La fecha no es valida o ya paso.", flags: MessageFlags.Ephemeral });

      const preview = new EmbedBuilder()
        .setTitle(`🎮 ${data.titulo}`)
        .setDescription(`**${data.desc}**\n\n📅 **Fecha:** <t:${data.fechaTs}:F> (<t:${data.fechaTs}:R>)\n🎮 **Modo:** ${data.modo}\n👥 **Cupos:** 0/${data.cupos}\n💰 **Premio:** ${data.premio}\n📊 **Estado:** Abierto`)
        .setColor(data.colorInt || 0x00FF00)
        .setTimestamp();
      if (data.footer) preview.setFooter({ text: data.footer });
      if (data.miniatura && data.miniatura.startsWith("http")) preview.setThumbnail(data.miniatura);

      const chOptions = interaction.guild.channels.cache.filter(ch => ch.isTextBased() && !ch.isThread()).sort((a, b) => a.position - b.position).first(25).map(ch => ({ label: `# ${ch.name}`, value: ch.id }));
      const roles = interaction.guild.roles.cache.filter(r => r.name !== "@everyone" && !r.managed).sort((a, b) => b.position - a.position).first(25).map(r => ({ label: r.name, value: r.id }));
      const allMentionOptions = [{ label: "Sin mencion", value: "none", default: true }, { label: "@everyone", value: "everyone" }, { label: "@here", value: "here" }, ...roles];

      const channelRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("evento_canal").setPlaceholder("Canal destino").setMinValues(1).setMaxValues(1).addOptions(chOptions));
      const mentionRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("evento_mencion").setPlaceholder("Mencion").setMinValues(1).setMaxValues(1).addOptions(allMentionOptions));
      const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("evento_editar").setLabel("✏️ Editar").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("evento_footer").setLabel("📝 Opciones avanzadas").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("evento_confirmar").setLabel("Crear evento").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("evento_cancelar").setLabel("Cancelar").setStyle(ButtonStyle.Danger),
      );
      return interaction.update({ content: "📋 **Vista previa del evento:** (editado)", embeds: [preview], components: [channelRow, mentionRow, btnRow] });
    }

    // ===== EVENTO FOOTER MODAL =====
    if (interaction.isButton() && interaction.customId === "evento_footer") {
      const data = pendingEvents.get(`${interaction.guildId}:${interaction.user.id}`);
      if (!data) return interaction.reply({ content: "❌ Datos expirados.", flags: MessageFlags.Ephemeral });
      const modal = new ModalBuilder().setCustomId("evento_footer_modal").setTitle("Opciones avanzadas");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("cupos").setLabel("Cupos maximos").setPlaceholder("40").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(4).setValue(String(data.cupos || 40))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("premio").setLabel("Premio").setPlaceholder("$20 USD para el ganador").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200).setValue(data.premio || "")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("color").setLabel("Color hex del embed (sin #)").setPlaceholder("00FF00").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(6)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("footer_text").setLabel("Texto del pie (footer)").setPlaceholder("Hydra Studio — Primer evento oficial").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("miniatura").setLabel("URL de la miniatura (thumbnail)").setPlaceholder("https://...").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(500)),
      );
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "evento_footer_modal") {
      const data = pendingEvents.get(`${interaction.guildId}:${interaction.user.id}`);
      if (!data) return interaction.reply({ content: "❌ Datos expirados.", flags: MessageFlags.Ephemeral });
      const cuposInput = interaction.fields.getTextInputValue("cupos");
      if (cuposInput) data.cupos = parseInt(cuposInput) || 40;
      const premioInput = interaction.fields.getTextInputValue("premio");
      if (premioInput) data.premio = premioInput;
      const colorHex = interaction.fields.getTextInputValue("color");
      if (colorHex) { try { data.colorInt = parseInt(colorHex.replace("#", ""), 16); } catch {} }
      data.footer = interaction.fields.getTextInputValue("footer_text") || "";
      data.miniatura = interaction.fields.getTextInputValue("miniatura") || "";

      const preview = new EmbedBuilder()
        .setTitle(`🎮 ${data.titulo}`)
        .setDescription(`**${data.desc}**\n\n📅 **Fecha:** <t:${data.fechaTs}:F> (<t:${data.fechaTs}:R>)\n🎮 **Modo:** ${data.modo}\n👥 **Cupos:** 0/${data.cupos}\n💰 **Premio:** ${data.premio}\n📊 **Estado:** Abierto`)
        .setColor(data.colorInt || 0x00FF00)
        .setTimestamp();
      if (data.footer) preview.setFooter({ text: data.footer });
      if (data.miniatura && data.miniatura.startsWith("http")) preview.setThumbnail(data.miniatura);

      const chOptions = interaction.guild.channels.cache.filter(ch => ch.isTextBased() && !ch.isThread()).sort((a, b) => a.position - b.position).first(25).map(ch => ({ label: `# ${ch.name}`, value: ch.id }));
      const roles = interaction.guild.roles.cache.filter(r => r.name !== "@everyone" && !r.managed).sort((a, b) => b.position - a.position).first(25).map(r => ({ label: r.name, value: r.id }));
      const allMentionOptions = [{ label: "Sin mencion", value: "none", default: true }, { label: "@everyone", value: "everyone" }, { label: "@here", value: "here" }, ...roles];

      const channelRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("evento_canal").setPlaceholder("Canal destino").setMinValues(1).setMaxValues(1).addOptions(chOptions));
      const mentionRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("evento_mencion").setPlaceholder("Mencion").setMinValues(1).setMaxValues(1).addOptions(allMentionOptions));
      const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("evento_editar").setLabel("✏️ Editar").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("evento_footer").setLabel("📝 Opciones avanzadas").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("evento_confirmar").setLabel("Crear evento").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("evento_cancelar").setLabel("Cancelar").setStyle(ButtonStyle.Danger),
      );
      return interaction.update({ content: "📋 **Vista previa del evento:**", embeds: [preview], components: [channelRow, mentionRow, btnRow] });
    }

    // ===== EVENTO SELECT HANDLERS =====
    if (interaction.isStringSelectMenu() && interaction.customId === "evento_canal") {
      const data = pendingEvents.get(`${interaction.guildId}:${interaction.user.id}`);
      if (data) data.canalId = interaction.values[0];
      return interaction.reply({ content: `✅ Canal: <#${interaction.values[0]}>`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "evento_mencion") {
      const data = pendingEvents.get(`${interaction.guildId}:${interaction.user.id}`);
      if (data) data.mencion = interaction.values[0];
      const val = interaction.values[0];
      const display = val === "none" ? "Ninguna" : val === "everyone" ? "@everyone" : val === "here" ? "@here" : `<@&${val}>`;
      return interaction.reply({ content: `✅ Mencion: **${display}**`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.isButton() && interaction.customId === "evento_confirmar") {
      const data = pendingEvents.get(`${interaction.guildId}:${interaction.user.id}`);
      if (!data) return interaction.reply({ content: "❌ Datos expirados.", flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const colorInt = data.colorInt || 0x00FF00;
      const role = await interaction.guild.roles.create({
        name: `🎮 ${data.titulo}`,
        colors: { primaryColor: colorInt },
        reason: `Evento: ${data.titulo}`,
      });
      const participanteRole = interaction.guild.roles.cache.get(getParticipanteRoleId(interaction.guild.id));
      const mediaTeamRole = interaction.guild.roles.cache.find(r => r.name === "Media Team");
      let highestPos = 0;
      if (participanteRole && participanteRole.position > highestPos) highestPos = participanteRole.position;
      if (mediaTeamRole && mediaTeamRole.position > highestPos) highestPos = mediaTeamRole.position;
      if (highestPos > 0) {
        try { await role.setPosition(highestPos + 1); } catch {}
      }

      eventCounter++;
      const eventId = `EVT-${eventCounter}`;
      const canal = interaction.guild.channels.cache.get(data.canalId) || interaction.channel;
      let mention = "";
      if (data.mencion === "everyone") mention = "@everyone";
      else if (data.mencion === "here") mention = "@here";
      else if (data.mencion !== "none") mention = `<@&${data.mencion}>`;

      const embed = new EmbedBuilder()
        .setTitle(`🎮 ${data.titulo}`)
        .setDescription(`**${data.desc}**\n\n📅 **Fecha:** <t:${data.fechaTs}:F> (<t:${data.fechaTs}:R>)\n🎮 **Modo:** Hunger Games\n👥 **Cupos:** 0/${data.cupos}\n💰 **Premio:** ${data.premio}\n📊 **Estado:** Abierto\n🏷️ **Rol:** <@&${role.id}>`)
        .setColor(colorInt)
        .setFooter({ text: data.footer || `ID: ${eventId}` })
        .setTimestamp();
      if (data.miniatura && data.miniatura.startsWith("http")) embed.setThumbnail(data.miniatura);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`evento_info_${eventId}`).setLabel("📋 Info").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`evento_join_${eventId}`).setLabel("✅ Unirse").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`evento_leave_${eventId}`).setLabel("🚪 Salir").setStyle(ButtonStyle.Danger),
      );

      const msg = await canal.send({ content: mention || null, embeds: [embed], components: [row] });
      events.set(eventId, {
        nombre: data.titulo, desc: data.desc, fecha: data.fecha, hora: data.hora, cupos: data.cupos, modo: "Hunger Games", fechaTs: data.fechaTs, roleId: role.id, roleColor: colorInt,
        participants: [], status: "abierto", eventTeams: [], eliminatedTeams: [],
        messageId: msg.id, channelId: canal.id, guildId: interaction.guildId,
        displayMessageId: null, displayChannelId: null, premio: data.premio,
        footer: data.footer || "", miniatura: data.miniatura || "", mencion: data.mencion || "none",
      });
      saveEvents();
      bumpStat(interaction.guildId, interaction.user.id, "eventsCreated", 1);

      if (eventDisplayIntervals.has(eventId)) clearInterval(eventDisplayIntervals.get(eventId));
      const evRef = events.get(eventId);
      const interval = setInterval(async () => {
        try {
          const ch = client.channels.cache.get(evRef.channelId);
          if (!ch) return;
          const m = await ch.messages.fetch(evRef.messageId);
          if (!m) return;
          let c = 0;
          const role = ch.guild.roles.cache.get(evRef.roleId);
          if (role) c = role.members.size;
          const updatedEmbed = EmbedBuilder.from(m.embeds[0]);
          if (updatedEmbed.data.description) {
            updatedEmbed.data.description = updatedEmbed.data.description.replace(/(\u{1F465} ?\*?\*?Cupos:\*?\*? )\d+(\/)/, `$1${c}$2`);
          }
          await m.edit({ embeds: [updatedEmbed] });
        } catch {}
      }, 5000);
      eventDisplayIntervals.set(eventId, interval);

      pendingEvents.delete(`${interaction.guildId}:${interaction.user.id}`);
      return interaction.editReply({ content: `✅ Evento creado en <#${canal.id}>` });
    }

    if (interaction.isButton() && interaction.customId === "evento_cancelar") {
      pendingEvents.delete(`${interaction.guildId}:${interaction.user.id}`);
      return interaction.update({ content: "❌ Cancelado.", embeds: [], components: [] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "anuncio_mencion") {
      const data = pendingAnuncios.get(interaction.user.id);
      if (data) data.mencion = interaction.values[0];
      const display = interaction.values[0] === "none" ? "Ninguna" : "@" + interaction.values[0];
      return interaction.reply({ content: `✅ Mencion: **${display}**`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "anuncio_canal") {
      const data = pendingAnuncios.get(interaction.user.id);
      if (data) data.canalId = interaction.values[0];
      return interaction.reply({ content: `✅ Canal: <#${interaction.values[0]}>`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.isButton() && interaction.customId === "anuncio_confirmar") {
      const data = pendingAnuncios.get(interaction.user.id);
      if (!data) return interaction.reply({ content: "❌ Datos expirados.", flags: MessageFlags.Ephemeral });
      const canal = interaction.guild.channels.cache.get(data.canalId) || interaction.channel;
      let mention = data.mencion === "everyone" ? "@everyone" : data.mencion === "here" ? "@here" : data.mencion !== "none" ? `<@&${data.mencion}>` : "";
      const embed = new EmbedBuilder().setTitle(data.titulo).setDescription(data.contenido).setColor(data.color).setTimestamp();
      if (data.miniatura && data.miniatura.startsWith("http")) embed.setThumbnail(data.miniatura);
      if (data.footer) embed.setFooter({ text: data.footer });
      await canal.send({ content: mention || null, embeds: [embed] });
      pendingAnuncios.delete(interaction.user.id);
      return interaction.reply({ content: `✅ Anuncio enviado en <#${canal.id}>`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.isButton() && interaction.customId === "anuncio_cancelar") {
      pendingAnuncios.delete(interaction.user.id);
      return interaction.update({ content: "❌ Cancelado.", embeds: [], components: [] });
    }

    // ===== MENSAJE-BOT =====
    if (interaction.commandName === "mensaje-bot") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const mensaje = interaction.options.getString("mensaje");
      const canal = interaction.options.getChannel("canal");
      const rolesStr = interaction.options.getString("roles");
      const imagen = interaction.options.getAttachment("imagen");
      const spoiler = interaction.options.getBoolean("spoiler") || false;
      let texto = mensaje;
      const roles = parseRoles(interaction.guild, rolesStr);
      if (roles) texto = `${roles}\n\n${texto}`;
      const opts = { content: texto };
      if (imagen) {
        const buf = await fetch(imagen.url).then(r => r.arrayBuffer());
        opts.files = [new AttachmentBuilder(Buffer.from(buf), { name: spoiler ? `SPOILER_${imagen.name}` : imagen.name })];
      }
      await canal.send(opts);
      return interaction.editReply({ content: `✅ Enviado en <#${canal.id}>` });
    }

    // ===== CLEAR =====
    if (interaction.commandName === "clear") {
      if (!canUseModCommand(interaction.member, "clear"))
        return interaction.reply({ content: noPermMsg(interaction.member, "clear"), flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const amount = interaction.options.getInteger("cantidad");
      const user = interaction.options.getUser("usuario");
      let deleted = 0;
      const fetchLimit = user ? 100 : amount;
      let fetched = await interaction.channel.messages.fetch({ limit: Math.min(fetchLimit, 100) });
      if (user) fetched = fetched.filter(m => m.author.id === user.id);
      const toDelete = [...fetched.values()].slice(0, amount);
      for (const msg of toDelete) { try { await msg.delete(); deleted++; } catch {} }
      return interaction.editReply({ content: `✅ Eliminados **${deleted}** mensajes.` });
    }

    // ===== SLOWMODE =====
    if (interaction.commandName === "slowmode") {
      if (!canUseModCommand(interaction.member, "slowmode"))
        return interaction.reply({ content: noPermMsg(interaction.member, "slowmode"), flags: MessageFlags.Ephemeral });
      const secs = interaction.options.getInteger("segundos");
      await interaction.channel.setRateLimitPerUser(secs);
      return interaction.reply({ content: secs === 0 ? "✅ Slowmode desactivado." : `✅ Slowmode: **${secs}** segundos.` });
    }

    // ===== USERINFO =====
    if (interaction.commandName === "userinfo") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const embed = new EmbedBuilder()
        .setTitle(`👤 ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "ID", value: user.id, inline: true },
          { name: "Creado", value: `<t:${Math.floor(user.createdTimestamp/1000)}:R>`, inline: true },
        )
        .setColor(user.hexColor || 0x5865F2);
      if (member) {
        embed.addFields(
          { name: "Se unió", value: `<t:${Math.floor(member.joinedTimestamp/1000)}:R>`, inline: true },
          { name: "Roles", value: member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => `<@&${r.id}>`).join(", ").slice(0, 1024) || "Ninguno", inline: false },
        );
      }
      return interaction.reply({ embeds: [embed] });
    }

    // ===== AVATAR =====
    if (interaction.commandName === "avatar") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const embed = new EmbedBuilder()
        .setTitle(`🖼️ Avatar de ${user.tag}`)
        .setImage(user.displayAvatarURL({ size: 1024, extension: "png" }))
        .setColor(0x5865F2);
      return interaction.reply({ embeds: [embed] });
    }

    // ===== CHANNELINFO =====
    if (interaction.commandName === "channelinfo") {
      const ch = interaction.options.getChannel("canal") || interaction.channel;
      const embed = new EmbedBuilder()
        .setTitle(`📋 # ${ch.name}`)
        .addFields(
          { name: "ID", value: ch.id, inline: true },
          { name: "Tipo", value: ChannelType[ch.type] || "Desconocido", inline: true },
          { name: "Creado", value: `<t:${Math.floor(ch.createdTimestamp/1000)}:R>`, inline: true },
        )
        .setColor(0x5865F2);
      if (ch.topic) embed.addFields({ name: "Tema", value: ch.topic.slice(0, 1024) });
      return interaction.reply({ embeds: [embed] });
    }

    // ===== BOOSTERS =====
    if (interaction.commandName === "boosters") {
      const boosters = interaction.guild.members.cache.filter(m => m.premiumSince);
      const embed = new EmbedBuilder()
        .setTitle(`🚀 Boosters de ${interaction.guild.name}`)
        .setDescription(boosters.size > 0 ? boosters.map(m => `**${m.user.tag}** — desde <t:${Math.floor(m.premiumSinceTimestamp/1000)}:R>`).join("\n") : "No hay boosters activos.")
        .setColor(0xFF73FA)
        .setFooter({ text: `Total: ${boosters.size} boosters | Nivel: ${interaction.guild.premiumTier}` });
      return interaction.reply({ embeds: [embed] });
    }

    // ===== TWEET =====
    if (interaction.commandName === "tweet") {
      await interaction.deferReply();
      const usuario = interaction.options.getString("usuario");
      const mensaje = interaction.options.getString("mensaje");
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) + " · " + now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const parts = usuario.split(" ");
      const displayName = parts[0] || usuario;
      const username = (parts[1] || parts[0] || "user").replace(/@/g, "").toLowerCase().replace(/\s/g, "");
      const buffer = generateTweetImage({ displayName, username, content: mensaje, time: timeStr });
      return interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: "tweet.png" })] });
    }

    // ===== ENCUESTA =====
    if (interaction.commandName === "encuesta" && interaction.options.getSubcommand() === "crear") {
      const gcPoll = getGuildConfig(interaction.guildId);
      if (gcPoll.pollEnabled === false) return interaction.reply({ content: "❌ Las encuestas están desactivadas.", flags: MessageFlags.Ephemeral });
      const pregunta = interaction.options.getString("pregunta");
      const opciones = interaction.options.getString("opciones").split(",").map(o => o.trim()).filter(Boolean);
      const maxOpts = gcPoll.pollMaxOptions || 10;
      if (opciones.length < 2) return interaction.reply({ content: "❌ Mínimo 2 opciones separadas por coma.", flags: MessageFlags.Ephemeral });
      if (opciones.length > maxOpts) return interaction.reply({ content: `❌ Máximo ${maxOpts} opciones.`, flags: MessageFlags.Ephemeral });

      const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
      const desc = opciones.map((o, i) => `${emojis[i]} ${o}`).join("\n\n");
      const pollColor = parseColor(gcPoll.pollColor || "#5865F2");
      const embed = new EmbedBuilder().setTitle(`📊 ${pregunta}`).setDescription(desc).setColor(pollColor).setFooter({ text: `Encuesta de ${interaction.user.tag} • ID: Pending` });
      applyEmbedExtras(embed, gcPoll, "poll", interaction.member);
      const msg = await interaction.reply({ content: msgContent(gcPoll, "pollContent", interaction.member), embeds: [embed], fetchReply: true });
      for (let i = 0; i < opciones.length; i++) await msg.react(emojis[i]);

      const pollId = `POLL-${Date.now()}`;
      activePolls.set(msg.id, { id: pollId, pregunta, opciones, emojis, authorId: interaction.user.id, channelId: interaction.channel.id, messageId: msg.id, active: true, guildId: interaction.guildId, createdAt: Date.now() });
      savePoll(activePolls.get(msg.id));
      await msg.edit({ embeds: [new EmbedBuilder().setTitle(`📊 ${pregunta}`).setDescription(desc).setColor(pollColor).setFooter({ text: `Encuesta de ${interaction.user.tag} • ID: ${pollId}` })] });
    }

    // ===== ENCUESTA-FINALIZAR =====
    if (interaction.commandName === "encuesta" && interaction.options.getSubcommand() === "finalizar") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede finalizar encuestas.", flags: MessageFlags.Ephemeral });
      const gcFin = getGuildConfig(interaction.guildId);
      const id = interaction.options.getString("id");
      const poll = findPoll(interaction.guildId, id);
      if (!poll) return interaction.reply({ content: "❌ Encuesta no encontrada o ya finalizada. Usa el ID (POLL-...) o el ID del mensaje.", flags: MessageFlags.Ephemeral });
      try {
        const ch = await interaction.guild.channels.fetch(poll.channelId).catch(() => null);
        const msg = ch && ch.isTextBased() ? await ch.messages.fetch(poll.messageId).catch(() => null) : null;
        if (!msg) return interaction.reply({ content: "❌ Mensaje no encontrado (¿fue borrado?).", flags: MessageFlags.Ephemeral });

        const emojis = poll.emojis;
        const voteCounts = [];
        for (let i = 0; i < poll.opciones.length; i++) {
          const reaction = msg.reactions.cache.get(emojis[i]);
          const count = reaction ? Math.max(0, reaction.count - 1) : 0;
          voteCounts.push({ name: poll.opciones[i], count, emoji: emojis[i] });
        }

        const total = voteCounts.reduce((sum, v) => sum + v.count, 0);
        const maxVotes = Math.max(...voteCounts.map(v => v.count));
        const winners = voteCounts.filter(v => v.count === maxVotes);

        const bars = voteCounts.map(v => {
          const pct = total > 0 ? Math.round((v.count / total) * 100) : 0;
          const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
          return `${v.emoji} **${v.name}**\n\`${bar}\` ${v.count} votos (${pct}%)`;
        }).join("\n\n");

        const winnerText = winners.length > 1
          ? `🤝 **Empate:** ${winners.map(w => w.name).join(", ")}`
          : `🏆 **Ganador:** ${winners[0].name}`;

        const resultEmbed = new EmbedBuilder()
          .setTitle(`${gcFin.pollEndTitle || "📊 Resultados:"} ${poll.pregunta}`)
          .setDescription(`${bars}\n\n**Total de votos:** ${total}\n${winnerText}`)
          .setColor(parseColor(gcFin.pollEndColor || "#00FF00"))
          .setFooter({ text: `Encuesta finalizada por ${interaction.user.tag}` })
          .setTimestamp();

        await msg.edit({ embeds: [resultEmbed] });
        try { await msg.reactions.removeAll(); } catch {}
        activePolls.delete(poll.messageId);
        try { db.delPoll(poll.guildId, poll.id); } catch {}
        return interaction.reply({ content: `✅ Encuesta finalizada. ${total} votos totales.`, flags: MessageFlags.Ephemeral });
      } catch { return interaction.reply({ content: "❌ Mensaje no encontrado.", flags: MessageFlags.Ephemeral }); }
    }

    // ===== SUGERENCIA =====
    if (interaction.commandName === "sugerencia" && interaction.options.getSubcommand() === "enviar") {
      const gcSug = getGuildConfig(interaction.guildId);
      if (!gcSug.sugEnabled) return interaction.reply({ content: "❌ Las sugerencias están desactivadas.", flags: MessageFlags.Ephemeral });
      const titulo = (interaction.options.getString("titulo") || "").trim().slice(0, 100);
      const desc = (interaction.options.getString("descripcion") || "").trim().slice(0, 1500);
      if (!titulo || !desc) return interaction.reply({ content: "❌ Título y descripción requeridos.", flags: MessageFlags.Ephemeral });
      const targetCh = gcSug.sugChannelId
        ? await interaction.guild.channels.fetch(gcSug.sugChannelId).catch(() => null)
        : interaction.channel;
      if (!targetCh || !targetCh.isTextBased()) {
        return interaction.reply({ content: "❌ Canal de sugerencias no configurado. Ajústalo en el dashboard.", flags: MessageFlags.Ephemeral });
      }
      try {
        const { sug } = await createSuggestion(interaction.guild, targetCh, interaction.user, interaction.member, titulo, desc);
        return interaction.reply({ content: `✅ Sugerencia **${sug.id}** publicada en ${targetCh}.`, flags: MessageFlags.Ephemeral });
      } catch (e) {
        return interaction.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral });
      }
    }

    // ===== SUG (staff: aceptar / rechazar / eliminar / ver) =====
    if (interaction.commandName === "sugerencia" && ["ver", "eliminar", "aceptar", "rechazar"].includes(interaction.options.getSubcommand())) {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      const sub = interaction.options.getSubcommand();
      if (sub === "ver") {
        const sug = findSuggestion(interaction.guildId, interaction.options.getString("id"));
        if (!sug) return interaction.reply({ content: "❌ Sugerencia no encontrada.", flags: MessageFlags.Ephemeral });
        const votes = await countSugVotes(interaction.guild, sug);
        const emb = new EmbedBuilder()
          .setTitle(`📥 ${sug.id}: ${sug.titulo}`.slice(0, 256))
          .setDescription(`${sug.desc}\n\n👤 ${sug.authorTag}\n📌 Estado: **${sug.status}**\n👍 ${votes.up} • 🤝 ${votes.neutral} • 👎 ${votes.down}`.slice(0, 4000))
          .setColor(parseColor(getGuildConfig(interaction.guildId).sugEmbedColor || "#00BFFF"));
        return interaction.reply({ embeds: [emb], flags: MessageFlags.Ephemeral });
      }
      if (sub === "eliminar") {
        const sug = findSuggestion(interaction.guildId, interaction.options.getString("id"));
        if (!sug) return interaction.reply({ content: "❌ Sugerencia no encontrada.", flags: MessageFlags.Ephemeral });
        await deleteSuggestion(interaction.guild, sug);
        return interaction.reply({ content: `🗑️ Sugerencia **${sug.id}** eliminada.`, flags: MessageFlags.Ephemeral });
      }
      // aceptar / rechazar
      const sug = findSuggestion(interaction.guildId, interaction.options.getString("id"));
      if (!sug) return interaction.reply({ content: "❌ Sugerencia no encontrada.", flags: MessageFlags.Ephemeral });
      if (sug.status !== "pending") return interaction.reply({ content: `⚠️ Ya fue cerrada (estado: ${sug.status}).`, flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const reason = (interaction.options.getString("razon") || "").slice(0, 500);
      const votes = await decideSuggestion(interaction.guild, sug, sub === "aceptar" ? "aceptar" : "rechazar", reason, interaction.user);
      return interaction.editReply({ content: `✅ **${sug.id}** ${sub === "aceptar" ? "aceptada" : "rechazada"}. 👍 ${votes.up} • 👎 ${votes.down}` });
    }

    // ===== SUGERENCIA: menú de decisión (canal de revisión) =====
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("sugdecide_")) {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      const key = interaction.customId.replace("sugdecide_", "");
      const sep = key.indexOf(":");
      const gid = sep > 0 ? key.slice(0, sep) : interaction.guildId;
      const sugId = sep > 0 ? key.slice(sep + 1) : key;
      if (gid !== interaction.guildId) return interaction.reply({ content: "❌ Sugerencia de otro servidor.", flags: MessageFlags.Ephemeral });
      const sug = activeSuggestions.get(key) || findSuggestion(gid, sugId);
      if (!sug) return interaction.reply({ content: "❌ Sugerencia no encontrada (quizás ya fue gestionada).", flags: MessageFlags.Ephemeral });
      if (sug.status !== "pending") return interaction.reply({ content: `⚠️ Ya fue cerrada (estado: ${sug.status}).`, flags: MessageFlags.Ephemeral });
      const action = interaction.values[0];
      if (action === "eliminar") {
        await deleteSuggestion(interaction.guild, sug);
        return interaction.reply({ content: `🗑️ Sugerencia **${sug.id}** eliminada.`, flags: MessageFlags.Ephemeral });
      }
      const modal = new ModalBuilder()
        .setCustomId(`sugreason_${action}_${gid}_${sugId}`)
        .setTitle(action === "aceptar" ? `Aceptar ${sugId}` : `Rechazar ${sugId}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("razon").setLabel("Razón (opcional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)
        )
      );
      return interaction.showModal(modal);
    }

    // ===== SUGERENCIA: modal de razón =====
    if (interaction.isModalSubmit() && interaction.customId.startsWith("sugreason_")) {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      const parts = interaction.customId.replace("sugreason_", "").split("_");
      const action = parts[0];
      const gid = parts[1];
      const sugId = parts.slice(2).join("_");
      if (gid !== interaction.guildId) return interaction.reply({ content: "❌ Sugerencia de otro servidor.", flags: MessageFlags.Ephemeral });
      const sug = activeSuggestions.get(`${gid}:${sugId}`) || findSuggestion(gid, sugId);
      if (!sug) return interaction.reply({ content: "❌ Sugerencia no encontrada.", flags: MessageFlags.Ephemeral });
      if (sug.status !== "pending") return interaction.reply({ content: `⚠️ Ya fue cerrada (estado: ${sug.status}).`, flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const reason = (interaction.fields.getTextInputValue("razon") || "").slice(0, 500);
      const votes = await decideSuggestion(interaction.guild, sug, action, reason, interaction.user);
      return interaction.editReply({ content: `✅ **${sug.id}** ${action === "aceptar" ? "aceptada" : "rechazada"}. 👍 ${votes.up} • 👎 ${votes.down}` });
    }

    // ===== SUGERENCIA-FINALIZAR =====
    if (interaction.commandName === "sugerencia" && interaction.options.getSubcommand() === "finalizar") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede finalizar sugerencias.", flags: MessageFlags.Ephemeral });
      const id = interaction.options.getString("id");
      const sug = findSuggestion(interaction.guildId, id);
      if (!sug) return interaction.reply({ content: "❌ Sugerencia no encontrada o ya finalizada.", flags: MessageFlags.Ephemeral });
      try {
        const votes = await countSugVotes(interaction.guild, sug);
        const { up: likes, neutral: meh, down: dislikes, total } = votes;

        let verdict = "";
        if (likes > dislikes && likes > meh) verdict = "✅ **Aprobada** — La comunidad apoya esta sugerencia.";
        else if (dislikes > likes && dislikes > meh) verdict = "❌ **Rechazada** — La comunidad no está de acuerdo.";
        else if (meh >= likes && meh >= dislikes) verdict = "🤝 **Indecisa** — La comunidad está dividida.";
        else verdict = "🤝 **Empate** — Sin consenso claro.";

        const bars = [
          `👍 **A favor:** ${likes} (${total > 0 ? Math.round((likes / total) * 100) : 0}%)`,
          `🤝 **Indeciso:** ${meh} (${total > 0 ? Math.round((meh / total) * 100) : 0}%)`,
          `👎 **En contra:** ${dislikes} (${total > 0 ? Math.round((dislikes / total) * 100) : 0}%)`,
        ].join("\n");

        const resultEmbed = new EmbedBuilder()
          .setTitle(`💡 Resultados: ${sug.titulo}`)
          .setDescription(`${sug.desc}\n\n${bars}\n\n**Total de votos:** ${total}\n${verdict}`)
          .setColor(0x00BFFF)
          .setFooter({ text: `Sugerencia finalizada por ${interaction.user.tag}` })
          .setTimestamp();

        const ch = await interaction.guild.channels.fetch(sug.channelId).catch(() => null);
        const msg = ch && ch.isTextBased() ? await ch.messages.fetch(sug.messageId).catch(() => null) : null;
        if (!msg) return interaction.reply({ content: "❌ Mensaje no encontrado.", flags: MessageFlags.Ephemeral });
        await msg.edit({ embeds: [resultEmbed] });
        try { await msg.reactions.removeAll(); } catch {}
        sug.status = "closed";
        sug.up = likes; sug.down = dislikes; sug.neutral = meh; sug.total = total;
        sug.decidedBy = interaction.user.id; sug.decidedByTag = interaction.user.tag; sug.decidedAt = Date.now();
        saveSuggestion(sug);
        return interaction.reply({ content: `✅ Sugerencia finalizada. ${total} votos totales.`, flags: MessageFlags.Ephemeral });
      } catch { return interaction.reply({ content: "❌ Mensaje no encontrado.", flags: MessageFlags.Ephemeral }); }
    }

    // ===== CREAR-SORTEO =====
    if (interaction.commandName === "sorteo" && interaction.options.getSubcommand() === "crear") {
      const premio = interaction.options.getString("premio");
      const duracion = interaction.options.getInteger("duracion");
      const ganadores = interaction.options.getInteger("ganadores") || 1;
      const canal = interaction.options.getChannel("canal") || interaction.channel;
      await interaction.reply({ content: `✅ Sorteo creado en <#${canal.id}>`, flags: MessageFlags.Ephemeral });
      await crearSorteo(interaction.guild, premio, duracion, ganadores, canal, interaction.user);
    }

    // ===== FINALIZAR-SORTEO =====
    if (interaction.commandName === "sorteo" && interaction.options.getSubcommand() === "finalizar") {
      const id = interaction.options.getString("id");
      try {
        const msg = await interaction.channel.messages.fetch(id);
        const gcF = getGuildConfig(interaction.guildId);
        const joinRefF = parseSugEmoji(gcF.gwJoinEmoji || "🎉");
        const reaction = [...msg.reactions.cache.values()].find(r =>
          (joinRefF.id && r.emoji.id === joinRefF.id) || (!joinRefF.id && r.emoji.name === (joinRefF.name || "🎉"))
        ) || msg.reactions.cache.get("🎉");
        if (!reaction) return interaction.reply({ content: "❌ No se encontró la reacción del sorteo.", flags: MessageFlags.Ephemeral });
        const users = await reaction.users.fetch();
        const participants = users.filter(u => !u.bot).map(u => u);
        if (participants.length === 0) return interaction.reply({ content: "❌ No hubo participantes.", flags: MessageFlags.Ephemeral });
        const premio = msg.embeds[0]?.description?.match(/\*\*Premio:\*\*\s*(.+)/)?.[1] || "Premio desconocido";
        const winner = participants[Math.floor(Math.random() * participants.length)];
        const embed = new EmbedBuilder().setTitle("🎉 SORTEO FINALIZADO").setDescription(`**Premio:** ${premio}\n**Participantes totales:** ${participants.length}\n\n🏆 **Ganador:** <@${winner.id}>`).setColor(0x00FF00);
        await msg.edit({ embeds: [embed] });
        await interaction.channel.send({ content: `Felicidades <@${winner.id}> acabas de ganar **${premio}**` });
        return interaction.reply({ content: `✅ Sorteo finalizado. Ganador: <@${winner.id}>`, flags: MessageFlags.Ephemeral });
      } catch { return interaction.reply({ content: "❌ Mensaje no encontrado.", flags: MessageFlags.Ephemeral }); }
    }

    // ===== EDITAR-SORTEO =====
    if (interaction.commandName === "sorteo" && interaction.options.getSubcommand() === "editar") {
      const id = interaction.options.getString("id");
      const nuevoPremio = interaction.options.getString("nuevo_premio");
      try {
        const msg = await interaction.channel.messages.fetch(id);
        const oldEmbed = msg.embeds[0];
        if (!oldEmbed) return interaction.reply({ content: "❌ No hay embed.", flags: MessageFlags.Ephemeral });
        const newEmbed = EmbedBuilder.from(oldEmbed).setDescription(oldEmbed.description.replace(/\*\*Premio:\*\* [^\n]+/, `**Premio:** ${nuevoPremio}`));
        await msg.edit({ embeds: [newEmbed] });
        return interaction.reply({ content: "✅ Sorteo actualizado." });
      } catch { return interaction.reply({ content: "❌ Mensaje no encontrado.", flags: MessageFlags.Ephemeral }); }
    }

    // ===== VERIFY BUTTON =====
    if (interaction.isButton() && interaction.customId === "verify_start") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const gc = getGuildConfig(interaction.guild.id);
      const verifiedRoleId = gc.verifiedRoleId || CONFIG.verifiedRoleId || "";
      if (verifiedRoleId && member.roles.cache.has(verifiedRoleId))
        return interaction.reply({ content: gc.verifyAlreadyMsg || "✅ Ya estás verificado.", flags: MessageFlags.Ephemeral });
      const text = genCaptcha(6);
      const buf = await captchaImage(text);
      const tmo = gc.verifyTimeoutSec || 120;
      pendingCaptchas.set(interaction.user.id, { text, timestamp: Date.now(), guildId: interaction.guild.id });
      const foot = tmo >= 60 ? `${Math.round(tmo / 60)} minutos` : `${tmo} segundos`;
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(gc.captchaTitle || "🔐 Tu Captcha").setDescription(gc.captchaDesc || "Escribe el código:").setColor(0xff6b6b).setImage("attachment://captcha.png").setFooter({ text: foot })], files: [new AttachmentBuilder(buf, { name: "captcha.png" })], flags: MessageFlags.Ephemeral });
    }

    // ===== EVENTO =====
    if (interaction.commandName === "evento") {
      const sub = interaction.options.getSubcommand();

      if (sub === "crear") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede crear eventos.", flags: MessageFlags.Ephemeral });
        const modal = new ModalBuilder().setCustomId("evento_modal").setTitle("Crear Evento");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("titulo").setLabel("Titulo del evento").setPlaceholder("HYDRA GAMES").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("descripcion").setLabel("Descripcion (usa \\n para saltos de linea)").setPlaceholder("Unete al primer Hunger Games...").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("fecha").setLabel("Fecha (YYYY-MM-DD)").setPlaceholder("2026-08-01").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("hora").setLabel("Hora (HH:MM)").setPlaceholder("18:00").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modo").setLabel("Modo de juego").setPlaceholder("Hunger Games").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
        );
        return interaction.showModal(modal);
      }

      if (sub === "listar") {
        if (!eventsLoaded) { loadEvents(); }
        const id = interaction.options.getString("id");

        // Si se proporciona un ID, mostrar vista detallada con botones
        if (id) {
          const eventId = id.toUpperCase();
          let ev = events.get(eventId);
          if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(eventId); }
          if (!ev || (ev.guildId || "") !== interaction.guild.id) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });

          const statusMap = { abierto: "🟢 Inscripciones Abiertas", cerrado: "🟡 Inscripciones Cerradas", en_curso: "🔴 EN CURSO", finalizado: "🏁 Finalizado" };
          let count = 0;
          if (ev.roleId) { const role = interaction.guild.roles.cache.get(ev.roleId); if (role) count = role.members.size; }

          const embed = new EmbedBuilder()
            .setTitle(`🎮 ${ev.nombre}`)
            .setColor(ev.status === "en_curso" ? 0xFF0000 : ev.status === "abierto" ? 0x00FF00 : 0xFFAA00)
            .setDescription(`**${ev.desc.length > 300 ? ev.desc.slice(0, 300) + "..." : ev.desc}**\n\n📅 **Fecha:** <t:${ev.fechaTs}:F> (<t:${ev.fechaTs}:R>)\n🎮 **Modo:** ${ev.modo}\n👥 **Cupos:** ${count}/${ev.cupos}\n📊 **Estado:** ${statusMap[ev.status] || ev.status}\n💰 **Premio:** ${ev.premio || "No especificado"}`)
            .setFooter({ text: `ID: ${eventId}` })
            .setTimestamp();
          if (ev.miniatura && ev.miniatura.startsWith("http")) embed.setThumbnail(ev.miniatura);

          // Botones de filtro - usar role.members.size para el total
          let totalCount = ev.participants.length;
          if (ev.roleId) { const r = interaction.guild.roles.cache.get(ev.roleId); if (r) totalCount = r.members.size; }
          const creators = ev.participants.filter(p => p.contenido);
          const players = ev.participants.filter(p => !p.contenido);
          const withMic = ev.participants.filter(p => p.mic);
          const ages = ev.participants.map(p => p.edad);
          const avgAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`evlist_creadores_${eventId}`).setLabel(`🎬 Creadores (${creators.length})`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`evlist_jugadores_${eventId}`).setLabel(`👤 Jugadores (${players.length})`).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`evlist_mic_${eventId}`).setLabel(`🎙️ Con Mic (${withMic.length})`).setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`evlist_edades_${eventId}`).setLabel(`📊 Edades (prom: ${avgAge})`).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`evlist_editar_${eventId}`).setLabel(`✏️ Editar`).setStyle(ButtonStyle.Secondary),
          );

          return interaction.reply({ embeds: [embed], components: [row] });
        }

        // Sin ID: listar eventos de este servidor
        const all = [...events.entries()].filter(([, e]) => (e.guildId || "") === interaction.guild.id);
        if (all.length === 0) return interaction.reply({ content: "📋 No hay eventos creados.", flags: MessageFlags.Ephemeral });
        const embed = new EmbedBuilder().setTitle("📋 Eventos").setColor(0x5865F2);
        for (const [eid, ev] of all) {
          const statusEmoji = ev.status === "abierto" ? "🟢" : ev.status === "cerrado" ? "🟡" : ev.status === "en_curso" ? "🔴" : "🏁";
          let pCount = ev.participants.length;
          if (ev.roleId) { const r = interaction.guild.roles.cache.get(ev.roleId); if (r) pCount = r.members.size; }
          let participantsList = "";
          if (ev.participants && ev.participants.length > 0) {
            participantsList = "\n\n**Participantes:**\n" + ev.participants.slice(0, 10).map((p, i) => fmtParticipant(p, i + 1)).join("\n");
            if (ev.participants.length > 10) {
              participantsList += `\n... y ${ev.participants.length - 10} más`;
            }
          } else {
            participantsList = "\n\n**Participantes:** Ninguno aún";
          }
          const fieldValue = `📅 <t:${ev.fechaTs}:R> | 👥 ${pCount}/${ev.cupos} | 🎮 ${ev.modo}${participantsList}`;
          embed.addFields({ name: `${statusEmoji} ${ev.nombre} (${eid})`, value: fieldValue.slice(0, 1024), inline: false });
        }
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === "participantes") {
        const id = interaction.options.getString("id").toUpperCase();
        const ev = events.get(id);
        if (!ev || (ev.guildId || "") !== interaction.guild.id) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
        if (!ev.participants || ev.participants.length === 0) return interaction.reply({ content: `❌ No hay participantes en **${ev.nombre}**.`, flags: MessageFlags.Ephemeral });
        let count = 0;
        if (ev.roleId) { const role = interaction.guild.roles.cache.get(ev.roleId); if (role) count = role.members.size; }

        const PAGE_SIZE = 25;
        const totalPages = Math.ceil(ev.participants.length / PAGE_SIZE);
        const pageItems = ev.participants.slice(0, PAGE_SIZE);
        const list = pageItems.map((p, i) => fmtParticipant(p, i + 1)).join("\n");

        const embed = new EmbedBuilder()
          .setTitle(`👥 Participantes: ${ev.nombre}`)
          .setDescription(list)
          .setColor(0x5865F2)
          .setFooter({ text: `Página 1/${totalPages} • ${count}/${ev.cupos} cupos` });

        const components = [];
        if (totalPages > 1) {
          components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`evpart_page_${id}_0`).setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(`evpart_page_${id}_1`).setLabel("➡️").setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1),
          ));
        }
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`evlist_editar_${id}`).setLabel("✏️ Editar participante").setStyle(ButtonStyle.Secondary),
        ));

        return interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
      }

      if (sub === "cerrar") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede cerrar eventos.", flags: MessageFlags.Ephemeral });
        const id = interaction.options.getString("id").toUpperCase();
        const ev = events.get(id);
        if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
        ev.status = "cerrado";
        saveEvents();
        if (eventDisplayIntervals.has(id)) { clearInterval(eventDisplayIntervals.get(id)); eventDisplayIntervals.delete(id); }
        const ch = interaction.guild.channels.cache.get(ev.channelId);
        if (ch) {
          try {
            const msg = await ch.messages.fetch(ev.messageId);
            const oldEmbed = EmbedBuilder.from(msg.embeds[0]);
            oldEmbed.data.description = oldEmbed.data.description.replace("📊 **Estado:** Abierto", "📊 **Estado:** Cerrado");
            await msg.edit({ embeds: [oldEmbed], components: [] });
          } catch {}
        }
        return interaction.reply({ content: `✅ Inscripciones cerradas para **${ev.nombre}**.` });
      }

      if (sub === "finalizar") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede finalizar eventos.", flags: MessageFlags.Ephemeral });
        const id = interaction.options.getString("id").toUpperCase();
        const ev = events.get(id);
        if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
        ev.status = "finalizado";
        saveEvents();
        if (eventDisplayIntervals.has(id)) { clearInterval(eventDisplayIntervals.get(id)); eventDisplayIntervals.delete(id); }
        const ch = interaction.guild.channels.cache.get(ev.channelId);
        if (ch) {
          try {
            const msg = await ch.messages.fetch(ev.messageId);
            const oldEmbed = EmbedBuilder.from(msg.embeds[0]);
            oldEmbed.data.description = oldEmbed.data.description.replace("📊 **Estado:** Abierto", "📊 **Estado:** Finalizado").replace("📊 **Estado:** Cerrado", "📊 **Estado:** Finalizado");
            await msg.edit({ embeds: [oldEmbed], components: [] });
          } catch {}
        }
        return interaction.reply({ content: `✅ Evento **${ev.nombre}** finalizado con ${ev.participants.length} participantes.` });
      }

      if (sub === "iniciar") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede iniciar eventos.", flags: MessageFlags.Ephemeral });
        const id = interaction.options.getString("id").toUpperCase();
        const ev = events.get(id);
        if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
        if (ev.status === "en_curso") return interaction.reply({ content: "❌ Ya está en curso.", flags: MessageFlags.Ephemeral });
        ev.status = "en_curso";
        saveEvents();
        if (eventDisplayIntervals.has(id)) { clearInterval(eventDisplayIntervals.get(id)); eventDisplayIntervals.delete(id); }
        const ch = interaction.guild.channels.cache.get(ev.channelId);
        if (ch) {
          try {
            const msg = await ch.messages.fetch(ev.messageId);
            const oldEmbed = EmbedBuilder.from(msg.embeds[0]);
            oldEmbed.data.description = oldEmbed.data.description
              .replace("📊 **Estado:** Abierto", "📊 **Estado:** 🔴 EN CURSO")
              .replace("📊 **Estado:** Cerrado", "📊 **Estado:** 🔴 EN CURSO");
            await msg.edit({ embeds: [oldEmbed], components: [] });
          } catch {}
        }
        const notifyEmbed = new EmbedBuilder()
          .setTitle(`🔔 ¡${ev.nombre} ha comenzado!`)
          .setDescription(`El evento **${ev.nombre}** está ahora **EN CURSO**.\n\n🎮 **Modo:** ${ev.modo}\n👥 **Participantes:** ${ev.participants.length}`)
          .setColor(0xFF0000)
          .setTimestamp();
        await interaction.reply({ embeds: [notifyEmbed] });
        return;
      }

      if (sub === "mostrar") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede mostrar eventos.", flags: MessageFlags.Ephemeral });
        const id = interaction.options.getString("id").toUpperCase();
        const ev = events.get(id);
        if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
        const targetChannel = interaction.options.getChannel("canal") || interaction.channel;

        const displayEmbed = buildEventDisplayEmbed(ev, interaction.guild);
        const msg = await targetChannel.send({ embeds: [displayEmbed] });
        ev.displayMessageId = msg.id;
        ev.displayChannelId = targetChannel.id;

        if (eventDisplayIntervals.has(id)) clearInterval(eventDisplayIntervals.get(id));
        const interval = setInterval(async () => {
          try {
            const ch = client.channels.cache.get(ev.displayChannelId);
            if (!ch) return;
            const m = await ch.messages.fetch(ev.displayMessageId);
            if (!m) return;
            await m.edit({ embeds: [buildEventDisplayEmbed(ev, ch.guild)] });
          } catch {}
        }, 30000);
        eventDisplayIntervals.set(id, interval);

        return interaction.reply({ content: `✅ Panel de **${ev.nombre}** enviado en <#${targetChannel.id}>. Se actualiza cada 30 segundos.`, flags: MessageFlags.Ephemeral });
      }

      if (sub === "eliminar") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede eliminar eventos.", flags: MessageFlags.Ephemeral });
        const id = interaction.options.getString("id").toUpperCase();
        const ev = events.get(id);
        if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
        const ch = interaction.guild.channels.cache.get(ev.channelId);
        if (ch) { try { const msg = await ch.messages.fetch(ev.messageId); await msg.delete(); } catch {} }
        if (ev.roleId) { try { const role = await interaction.guild.roles.fetch(ev.roleId); if (role) await role.delete(); } catch {} }
        if (ev.displayMessageId && ev.displayChannelId) {
          try { const dch = interaction.guild.channels.cache.get(ev.displayChannelId); if (dch) { const dm = await dch.messages.fetch(ev.displayMessageId); if (dm) await dm.delete(); } } catch {}
        }

        // Delete all teams associated with this event (same guild only)
        for (const [teamName, team] of teams) {
          if ((team.guildId || "") !== interaction.guild.id) continue;
          if (team.eventId === id) {
            try { const teamRole = await interaction.guild.roles.fetch(team.roleId); if (teamRole) await teamRole.delete(); } catch {}
            teams.delete(teamName);
          }
        }

        if (eventDisplayIntervals.has(id)) { clearInterval(eventDisplayIntervals.get(id)); eventDisplayIntervals.delete(id); }
        events.delete(id);
        saveEvents();
        saveTeams();
        return interaction.reply({ content: `🗑️ Evento **${ev.nombre}** y sus equipos eliminados.` });
      }

      if (sub === "actualizar") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede actualizar eventos.", flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const id = interaction.options.getString("id").toUpperCase();
        const ev = events.get(id);
        if (!ev) return interaction.editReply({ content: "❌ Evento no encontrado." });
        const targetChannel = interaction.options.getChannel("canal") || interaction.guild.channels.cache.get(ev.channelId);
        if (!targetChannel) return interaction.editReply({ content: "❌ Canal no encontrado." });

        let count = 0;
        if (ev.roleId) { const role = interaction.guild.roles.cache.get(ev.roleId); if (role) count = role.members.size; }

        let mention = "";
        const mencionOpt = interaction.options.getString("mencion");
        if (mencionOpt === "si") {
          const mRole = getGuildConfig(interaction.guild.id).mentionRoleId || "";
          mention = mRole ? `<@&${mRole}>` : "";
        } else if (mencionOpt === "no") {
          mention = "";
        } else if (ev.mencion === "everyone") {
          mention = "@everyone";
        } else if (ev.mencion === "here") {
          mention = "@here";
        } else if (ev.mencion && ev.mencion !== "none") {
          mention = `<@&${ev.mencion}>`;
        }

        const shortDesc = ev.desc.length > 150 ? ev.desc.slice(0, 150) + "..." : ev.desc;
        const embed = new EmbedBuilder()
          .setTitle(`🎮 ${ev.nombre}`)
          .setDescription(`**${shortDesc}**\n\n📅 **Fecha:** <t:${ev.fechaTs}:F> (<t:${ev.fechaTs}:R>)\n🎮 **Modo:** ${ev.modo}\n👥 **Cupos:** ${count}/${ev.cupos}\n💰 **Premio:** ${ev.premio}\n📊 **Estado:** Abierto\n🏷️ **Rol:** <@&${ev.roleId}>`)
          .setColor(ev.roleColor || 0x00FF00)
          .setFooter({ text: ev.footer || `ID: ${id}` })
          .setTimestamp();
        if (ev.miniatura && ev.miniatura.startsWith("http")) embed.setThumbnail(ev.miniatura);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`evento_info_${id}`).setLabel("📋 Info").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`evento_join_${id}`).setLabel("✅ Unirse").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`evento_leave_${id}`).setLabel("🚪 Salir").setStyle(ButtonStyle.Danger),
        );

          // Enviar el embed nuevo primero (rápido)
        const msg = await targetChannel.send({ content: mention || null, embeds: [embed], components: [row] });

        // Editar el viejo mensaje sin bloquear (fire-and-forget)
        if (ev.messageId && ev.channelId) {
          const oldChId = ev.channelId;
          const oldMsgId = ev.messageId;
          try {
            const oldCh = interaction.guild.channels.cache.get(oldChId);
            if (oldCh) {
              oldCh.messages.fetch(oldMsgId).then(oldMsg => {
                if (oldMsg) oldMsg.edit({ content: null, embeds: [embed], components: [row] }).catch(() => {});
              }).catch(() => {});
            }
          } catch {}
        }

        ev.messageId = msg.id;
        ev.channelId = targetChannel.id;
        saveEvents();

        // Start 30s auto-refresh
        if (eventDisplayIntervals.has(id)) clearInterval(eventDisplayIntervals.get(id));
        const refreshInterval = setInterval(async () => {
          try {
            const ch = interaction.guild.channels.cache.get(ev.channelId);
            if (!ch) return;
            const m = await ch.messages.fetch(ev.messageId);
            if (!m) return;
            const updatedEmbed = buildEventDisplayEmbed(ev, ch.guild);
            const components = m.components.length > 0 ? m.components : [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`evento_info_${id}`).setLabel("📋 Info").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`evento_join_${id}`).setLabel("✅ Unirse").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`evento_leave_${id}`).setLabel("🚪 Salir").setStyle(ButtonStyle.Danger),
              )
            ];
            await m.edit({ embeds: [updatedEmbed], components });
          } catch {}
        }, 30000);
        eventDisplayIntervals.set(id, refreshInterval);

        return interaction.editReply({ content: `✅ Embed de **${ev.nombre}** ${mencionOpt === "no" ? "sin mención" : "con mención"} reenviado en <#${targetChannel.id}>. Se actualiza cada 30 segundos.` });
      }
    }

    // ===== EVENTO NOMBRE =====
    if (interaction.commandName === "evento" && interaction.options.getSubcommand() === "nombre") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede editar eventos.", flags: MessageFlags.Ephemeral });
      const id = interaction.options.getString("id");
      const nuevo = interaction.options.getString("nuevo");
      let ev = events.get(id);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(id); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      const oldName = ev.nombre;
      ev.nombre = nuevo;
      saveEvents();
      await updateEventDisplay(interaction.guild, ev);
      return interaction.reply({ content: `✅ Nombre cambiado de **${oldName}** a **${nuevo}**.`, flags: MessageFlags.Ephemeral });
    }

    // ===== EVENTO DESCRIPCION =====
    if (interaction.commandName === "evento" && interaction.options.getSubcommand() === "descripcion") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede editar eventos.", flags: MessageFlags.Ephemeral });
      const id = interaction.options.getString("id");
      const nueva = interaction.options.getString("nueva");
      let ev = events.get(id);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(id); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      ev.desc = nueva;
      saveEvents();
      await updateEventDisplay(interaction.guild, ev);
      return interaction.reply({ content: `✅ Descripción actualizada.`, flags: MessageFlags.Ephemeral });
    }

    // ===== EVENTO MODO =====
    if (interaction.commandName === "evento" && interaction.options.getSubcommand() === "modo") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede editar eventos.", flags: MessageFlags.Ephemeral });
      const id = interaction.options.getString("id");
      const nuevo = interaction.options.getString("nuevo");
      let ev = events.get(id);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(id); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      const oldModo = ev.modo;
      ev.modo = nuevo;
      saveEvents();
      await updateEventDisplay(interaction.guild, ev);
      return interaction.reply({ content: `✅ Modo cambiado de **${oldModo}** a **${nuevo}**.`, flags: MessageFlags.Ephemeral });
    }

    // ===== EVENTO CUPOS =====
    if (interaction.commandName === "evento" && interaction.options.getSubcommand() === "cupos") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede editar eventos.", flags: MessageFlags.Ephemeral });
      const id = interaction.options.getString("id");
      const nuevos = interaction.options.getInteger("nuevos");
      let ev = events.get(id);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(id); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      const oldCupos = ev.cupos;
      ev.cupos = nuevos;
      saveEvents();
      await updateEventDisplay(interaction.guild, ev);
      return interaction.reply({ content: `✅ Cupos cambiados de **${oldCupos}** a **${nuevos}**.`, flags: MessageFlags.Ephemeral });
    }

    // ===== EVENTO ABRIR =====
    if (interaction.commandName === "evento" && interaction.options.getSubcommand() === "abrir") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede editar eventos.", flags: MessageFlags.Ephemeral });
      const id = interaction.options.getString("id");
      let ev = events.get(id);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(id); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      if (ev.status === "abierto") return interaction.reply({ content: "❌ Las inscripciones ya están abiertas.", flags: MessageFlags.Ephemeral });
      ev.status = "abierto";
      saveEvents();
      await updateEventDisplay(interaction.guild, ev);
      return interaction.reply({ content: `✅ Inscripciones de **${ev.nombre}** reabiertas.`, flags: MessageFlags.Ephemeral });
    }

    // ===== EVENTO LISTAR BUTTONS =====
    if (interaction.isButton() && interaction.customId.startsWith("evlist_") && !interaction.customId.startsWith("evlist_page_") && !interaction.customId.startsWith("evlist_editpage_") && !interaction.customId.startsWith("evlist_editselect_") && !interaction.customId.startsWith("evlist_editmodal_")) {
      const parts = interaction.customId.split("_");
      const filterType = parts[1]; // creadores, jugadores, mic, edades, editar
      const eventId = parts.slice(2).join("_");
      let ev = events.get(eventId);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(eventId); }
      if (!ev || (ev.guildId || "") !== interaction.guild.id) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });

      let totalCount = ev.participants.length;
      if (ev.roleId) { const r = interaction.guild.roles.cache.get(ev.roleId); if (r) totalCount = r.members.size; }

      const creators = ev.participants.filter(p => p.contenido);
      const players = ev.participants.filter(p => !p.contenido);
      const withMic = ev.participants.filter(p => p.mic);

      // Helper para construir lista paginada
      function buildPaginatedList(items, title, color, formatFn, totalCount, eventId, filterType) {
        const PAGE_SIZE = 15;
        const totalPages = Math.ceil(items.length / PAGE_SIZE);
        const page = 0;
        const pageItems = items.slice(0, PAGE_SIZE);
        const list = pageItems.map((p, i) => formatFn(p, i)).join("\n");
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(list || "Vacío")
          .setColor(color)
          .setFooter({ text: `Página 1/${totalPages} • ${items.length} de ${totalCount} participantes` });

        const components = [];
        if (totalPages > 1) {
          const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`evlist_page_${eventId}_${filterType}_0`).setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(`evlist_page_${eventId}_${filterType}_1`).setLabel("➡️").setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1),
          );
          components.push(navRow);
        }
        const editRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`evlist_editar_${eventId}`).setLabel("✏️ Editar participante").setStyle(ButtonStyle.Secondary),
        );
        components.push(editRow);
        return { embeds: [embed], components, flags: MessageFlags.Ephemeral };
      }

      if (filterType === "creadores") {
        if (creators.length === 0) return interaction.reply({ content: "🎬 No hay creadores de contenido inscritos.", flags: MessageFlags.Ephemeral });
        return interaction.reply(buildPaginatedList(creators, `🎬 Creadores de Contenido: ${ev.nombre}`, 0x5865F2, (p, i) => fmtParticipant(p, i + 1), totalCount, eventId, "creadores"));
      }
      if (filterType === "jugadores") {
        if (players.length === 0) return interaction.reply({ content: "👤 No hay jugadores (todos son creadores).", flags: MessageFlags.Ephemeral });
        return interaction.reply(buildPaginatedList(players, `👤 Jugadores: ${ev.nombre}`, 0x5865F2, (p, i) => fmtParticipant(p, i + 1), totalCount, eventId, "jugadores"));
      }
      if (filterType === "mic") {
        if (withMic.length === 0) return interaction.reply({ content: "🎙️ Nadie tiene micrófono.", flags: MessageFlags.Ephemeral });
        return interaction.reply(buildPaginatedList(withMic, `🎙️ Con Micrófono: ${ev.nombre}`, 0x00FF00, (p, i) => fmtParticipant(p, i + 1), totalCount, eventId, "mic"));
      }

      if (filterType === "edades") {
        const ages = ev.participants.map(p => p.edad);
        const min = Math.min(...ages);
        const max = Math.max(...ages);
        const avg = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
        const under18 = ev.participants.filter(p => p.edad < 18).length;
        const over18 = ev.participants.filter(p => p.edad >= 18).length;
        const sorted = [...ev.participants].sort((a, b) => a.edad - b.edad);
        const PAGE_SIZE = 15;
        const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
        const pageItems = sorted.slice(0, PAGE_SIZE);
        const header = [`📊 **Resumen de Edades:**`, ``, `🔢 **Total:** ${totalCount} • 👶 <18: ${under18} • 🧑 ≥18: ${over18}`, `📉 Mín: ${min} • 📈 Máx: ${max} • 📐 Prom: ${avg}`, ``, `**Lista:**`].join("\n");
        const list = pageItems.map((p, i) => `${i + 1}. <@${p.userId}> | **${p.nick}** | ${p.edad} años${p.edad < 18 ? " ⚠️" : ""}`).join("\n");
        const embed = new EmbedBuilder().setTitle(`📊 Edades: ${ev.nombre}`).setDescription(header + "\n" + list).setColor(0xFFAA00).setFooter({ text: `Página 1/${totalPages} • ${sorted.length} participantes` });
        const components = [];
        if (totalPages > 1) {
          components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`evlist_page_${eventId}_edades_0`).setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(`evlist_page_${eventId}_edades_1`).setLabel("➡️").setStyle(ButtonStyle.Secondary),
          ));
        }
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`evlist_editar_${eventId}`).setLabel("✏️ Editar participante").setStyle(ButtonStyle.Secondary),
        ));
        return interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
      }

      // ===== EDITAR PARTICIPANTE → SHOW SELECT MENU (PAGE 0) =====
      if (filterType === "editar") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede editar participantes.", flags: MessageFlags.Ephemeral });
        if (!ev.participants || ev.participants.length === 0) return interaction.reply({ content: "❌ No hay participantes.", flags: MessageFlags.Ephemeral });
        return buildEditSelectPage(interaction, eventId, ev, 0);
      }
    }

    // ===== PAGINATION BUTTONS =====
    if (interaction.isButton() && interaction.customId.startsWith("evlist_page_")) {
      const parts = interaction.customId.replace("evlist_page_", "").split("_");
      const eventId = parts[0];
      const filterType = parts[1];
      const page = parseInt(parts[2]);
      let ev = events.get(eventId);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(eventId); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });

      let totalCount = ev.participants.length;
      if (ev.roleId) { const r = interaction.guild.roles.cache.get(ev.roleId); if (r) totalCount = r.members.size; }

      const PAGE_SIZE = 15;
      let items, title, color, formatFn;

      if (filterType === "creadores") {
        items = ev.participants.filter(p => p.contenido);
        title = `🎬 Creadores de Contenido: ${ev.nombre}`;
        color = 0x5865F2;
        formatFn = (p, i) => fmtParticipant(p, i + page * PAGE_SIZE);
      } else if (filterType === "jugadores") {
        items = ev.participants.filter(p => !p.contenido);
        title = `👤 Jugadores: ${ev.nombre}`;
        color = 0x5865F2;
        formatFn = (p, i) => fmtParticipant(p, i + page * PAGE_SIZE);
      } else if (filterType === "mic") {
        items = ev.participants.filter(p => p.mic);
        title = `🎙️ Con Micrófono: ${ev.nombre}`;
        color = 0x00FF00;
        formatFn = (p, i) => fmtParticipant(p, i + page * PAGE_SIZE);
      } else if (filterType === "edades") {
        items = [...ev.participants].sort((a, b) => a.edad - b.edad);
        title = `📊 Edades: ${ev.nombre}`;
        color = 0xFFAA00;
        formatFn = (p, i) => `${i + 1 + page * PAGE_SIZE}. <@${p.userId}> | **${p.nick}** | ${p.edad} años${p.edad < 18 ? " ⚠️" : ""}`;
      } else {
        return interaction.reply({ content: "❌ Tipo no válido.", flags: MessageFlags.Ephemeral });
      }

      const totalPages = Math.ceil(items.length / PAGE_SIZE);
      const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      const list = pageItems.map((p, i) => formatFn(p, i)).join("\n");

      let desc = list;
      if (filterType === "edades") {
        const ages = ev.participants.map(p => p.edad);
        const min = Math.min(...ages);
        const max = Math.max(...ages);
        const avg = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
        const under18 = ev.participants.filter(p => p.edad < 18).length;
        const over18 = ev.participants.filter(p => p.edad >= 18).length;
        const header = [`📊 **Resumen de Edades:**`, ``, `🔢 **Total:** ${totalCount} • 👶 <18: ${under18} • 🧑 ≥18: ${over18}`, `📉 Mín: ${min} • 📈 Máx: ${max} • 📐 Prom: ${avg}`, ``, `**Lista:**`].join("\n");
        desc = header + "\n" + list;
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(color)
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${items.length} de ${totalCount} participantes` });

      const components = [];
      if (totalPages > 1) {
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`evlist_page_${eventId}_${filterType}_${page - 1}`).setLabel("⬅️ Anterior").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId(`evlist_page_${eventId}_${filterType}_${page + 1}`).setLabel("➡️ Siguiente").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
        ));
      }
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`evlist_editar_${eventId}`).setLabel("✏️ Editar participante").setStyle(ButtonStyle.Secondary),
      ));

      return interaction.update({ embeds: [embed], components });
    }

    // ===== EDIT BUTTON → SHOW SELECT MENU PAGE 0 =====
    if (interaction.isButton() && interaction.customId.startsWith("evlist_editar_")) {
      const eventId = interaction.customId.replace("evlist_editar_", "");
      let ev = events.get(eventId);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(eventId); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      if (!ev.participants || ev.participants.length === 0) return interaction.reply({ content: "❌ No hay participantes.", flags: MessageFlags.Ephemeral });
      return buildEditSelectPage(interaction, eventId, ev, 0);
    }

    // ===== EDIT SELECT MENU PAGE BUTTONS =====
    if (interaction.isButton() && interaction.customId.startsWith("evlist_editpage_")) {
      const raw = interaction.customId.replace("evlist_editpage_", "");
      const parts = raw.split("_");
      const eventId = parts[0];
      const page = parseInt(parts[1]);
      console.log(`🔍 evlist_editpage raw="${raw}" eventId="${eventId}" page=${page} eventsSize=${events.size}`);
      let ev = events.get(eventId);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(eventId); }
      if (!ev) return interaction.reply({ content: `❌ Evento no encontrado.`, flags: MessageFlags.Ephemeral });
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      return buildEditSelectPage(interaction, eventId, ev, page);
    }

    // ===== EDIT SELECT =====
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("evlist_editselect_")) {
      const raw = interaction.customId.replace("evlist_editselect_", "");
      const parts = raw.split("_");
      const eventId = parts[0];
      const page = parseInt(parts[1]) || 0;
      let ev = events.get(eventId);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(eventId); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      const idx = parseInt(interaction.values[0]);
      const p = ev.participants[idx];
      if (!p) return interaction.reply({ content: "❌ Participante no encontrado.", flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder()
        .setCustomId(`evlist_editmodal_${eventId}_${idx}`)
        .setTitle(`Editar: ${p.nick}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nick").setLabel("Nick de MC").setStyle(TextInputStyle.Short).setValue(p.nick).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("edad").setLabel("Edad").setStyle(TextInputStyle.Short).setValue(String(p.edad)).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("mic").setLabel("¿Tiene micrófono? (si/no)").setStyle(TextInputStyle.Short).setValue(p.mic ? "si" : "no").setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("contenido").setLabel("¿Creador de contenido? (si/no)").setStyle(TextInputStyle.Short).setValue(p.contenido ? "si" : "no").setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("streamLink").setLabel("Link de streaming (URL o vacío)").setStyle(TextInputStyle.Short).setValue(p.streamLink || "").setRequired(false)),
      );
      return interaction.showModal(modal);
    }

    // ===== EDIT MODAL SUBMIT =====
    if (interaction.isModalSubmit() && interaction.customId.startsWith("evlist_editmodal_")) {
      const parts = interaction.customId.replace("evlist_editmodal_", "").split("_");
      const eventId = parts[0];
      const idx = parseInt(parts[1]);
      let ev = events.get(eventId);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(eventId); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });

      const p = ev.participants[idx];
      if (!p) return interaction.reply({ content: "❌ Participante no encontrado.", flags: MessageFlags.Ephemeral });

      const nick = interaction.fields.getTextInputValue("nick");
      const edad = parseInt(interaction.fields.getTextInputValue("edad"));
      const mic = interaction.fields.getTextInputValue("mic").toLowerCase().startsWith("s");
      const contenido = interaction.fields.getTextInputValue("contenido").toLowerCase().startsWith("s");
      const streamLink = interaction.fields.getTextInputValue("streamLink") || "";

      if (contenido && streamLink && !/^https?:\/\/.+/i.test(streamLink)) {
        return interaction.reply({ content: "❌ El link de streaming debe ser una URL válida (https://...).", flags: MessageFlags.Ephemeral });
      }

      p.nick = nick;
      p.edad = edad;
      p.mic = mic;
      p.contenido = contenido;
      p.streamLink = contenido ? streamLink : "";
      saveEvents();

      return interaction.reply({ content: `✅ **${nick}** actualizado.`, flags: MessageFlags.Ephemeral });
    }

    // ===== PARTICIPANT LIST PAGINATION =====
    if (interaction.isButton() && interaction.customId.startsWith("evpart_page_")) {
      const parts = interaction.customId.replace("evpart_page_", "").split("_");
      const eventId = parts[0];
      const page = parseInt(parts[1]);
      let ev = events.get(eventId);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(eventId); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });

      let count = 0;
      if (ev.roleId) { const r = interaction.guild.roles.cache.get(ev.roleId); if (r) count = r.members.size; }

      const PAGE_SIZE = 25;
      const totalPages = Math.ceil(ev.participants.length / PAGE_SIZE);
      const pageItems = ev.participants.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      const list = pageItems.map((p, i) => fmtParticipant(p, i + 1 + page * PAGE_SIZE)).join("\n");

      const embed = new EmbedBuilder()
        .setTitle(`👥 Participantes: ${ev.nombre}`)
        .setDescription(list)
        .setColor(0x5865F2)
        .setFooter({ text: `Página ${page + 1}/${totalPages} • ${count}/${ev.cupos} cupos` });

      const components = [];
      if (totalPages > 1) {
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`evpart_page_${eventId}_${page - 1}`).setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId(`evpart_page_${eventId}_${page + 1}`).setLabel("➡️").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
        ));
      }
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`evlist_editar_${eventId}`).setLabel("✏️ Editar participante").setStyle(ButtonStyle.Secondary),
      ));

      return interaction.update({ embeds: [embed], components });
    }

    // ===== EVENTO BUTTONS =====
    if (interaction.isButton() && interaction.customId.startsWith("evento_info_")) {
      const id = interaction.customId.replace("evento_info_", "");
      let ev = events.get(id);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(id); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      let count = 0;
      if (ev.roleId) { const role = interaction.guild.roles.cache.get(ev.roleId); if (role) count = role.members.size; }
      const list = ev.participants.length > 0
        ? ev.participants.map((p, i) => fmtParticipant(p, i + 1)).join("\n")
        : "Nadie se ha inscrito aún.";
      const shortDesc = ev.desc.length > 500 ? ev.desc.slice(0, 500) + "..." : ev.desc;
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle(`📋 Info: ${ev.nombre}`)
          .setDescription(`**${shortDesc}**\n\n📅 **Fecha:** <t:${ev.fechaTs}:F>\n🎮 **Modo:** ${ev.modo}\n👥 **Cupos:** ${count}/${ev.cupos}\n📊 **Estado:** ${ev.status}`)
          .addFields({ name: "Inscritos", value: list.slice(0, 1024) })
          .setColor(0x5865F2)],
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.isButton() && interaction.customId.startsWith("evento_join_")) {
      const id = interaction.customId.replace("evento_join_", "");
      let ev = events.get(id);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(id); }
      if (!ev || (ev.guildId || "") !== interaction.guild.id) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      if (ev.status !== "abierto") return interaction.reply({ content: "❌ Las inscripciones están cerradas.", flags: MessageFlags.Ephemeral });
      let roleCount = 0;
      if (ev.roleId) { const r = interaction.guild.roles.cache.get(ev.roleId); if (r) roleCount = r.members.size; }
      if (roleCount >= ev.cupos) return interaction.reply({ content: "❌ No hay cupos disponibles.", flags: MessageFlags.Ephemeral });
      if (ev.participants.find(p => p.userId === interaction.user.id)) return interaction.reply({ content: "❌ Ya estás inscrito.", flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder().setCustomId(`evento_modal_${id}`).setTitle("Inscripción al Evento");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nick").setLabel("Nick de Minecraft").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("edad").setLabel("Edad").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("mic").setLabel("¿Tienes micrófono? (si/no)").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("contenido").setLabel("¿Eres creador de contenido? (si/no)").setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("streamLink").setLabel("Link de streaming (si eres creador)").setPlaceholder("https://twitch.tv/tu_usuario").setStyle(TextInputStyle.Short).setRequired(false)),
      );
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("evento_modal_")) {
      const id = interaction.customId.replace("evento_modal_", "");
      const lockKey = `${id}_${interaction.user.id}`;
      if (processingInscriptions.has(lockKey)) return interaction.reply({ content: "⏳ Tu inscripción se está procesando...", flags: MessageFlags.Ephemeral });
      processingInscriptions.add(lockKey);
      try {
      const ev = events.get(id);
      if (!ev || (ev.guildId || "") !== interaction.guild.id) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      let roleCount = 0;
      if (ev.roleId) { const r = interaction.guild.roles.cache.get(ev.roleId); if (r) roleCount = r.members.size; }
      if (roleCount >= ev.cupos) return interaction.reply({ content: "❌ Cupos agotados.", flags: MessageFlags.Ephemeral });

      const nick = interaction.fields.getTextInputValue("nick");
      const edad = parseInt(interaction.fields.getTextInputValue("edad"));
      const mic = interaction.fields.getTextInputValue("mic").toLowerCase().startsWith("s");
      const contenido = interaction.fields.getTextInputValue("contenido").toLowerCase().startsWith("s");
      const streamLink = interaction.fields.getTextInputValue("streamLink") || "";

      if (contenido && !streamLink) {
        return interaction.reply({ content: "❌ Si eres creador de contenido, debes colocar tu link de streaming (https://twitch.tv/..., https://youtube.com/..., https://kick.com/...).", flags: MessageFlags.Ephemeral });
      }

      if (contenido && streamLink && !/^https?:\/\/.+/i.test(streamLink)) {
        return interaction.reply({ content: "❌ El link de streaming debe ser una URL válida que empiece con http:// o https://. No se aceptan textos.", flags: MessageFlags.Ephemeral });
      }

      if (ev.participants.find(p => p.userId === interaction.user.id)) {
        return interaction.reply({ content: "❌ Ya estás inscrito en este evento.", flags: MessageFlags.Ephemeral });
      }

      ev.participants.push({ userId: interaction.user.id, nick, edad, mic, contenido, streamLink });
      saveEvents();
      setMcNick(ev.guildId || interaction.guildId, interaction.user.id, nick);
      bumpStat(ev.guildId || interaction.guildId, interaction.user.id, "eventsParticipated", 1);

      if (ev.roleId) {
        try {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.roles.add(ev.roleId);
          const prId = getParticipanteRoleId(interaction.guild.id);
          if (prId) await member.roles.add(prId); // Participante role
          const crId = getGuildConfig(interaction.guild.id).creatorRoleId;
          if (contenido && streamLink && crId) await member.roles.add(crId);
        } catch {}
        try {
          const eventosCat = await interaction.guild.channels.fetch(getGuildConfig(interaction.guild.id).eventosCategoryId || "").catch(() => null);
          if (eventosCat) await eventosCat.permissionOverwrites.edit(ev.roleId, { ViewChannel: true });
        } catch {}
      }

      const ch = interaction.guild.channels.cache.get(ev.channelId);
      if (ch) {
        try {
          const msg = await ch.messages.fetch(ev.messageId);
          if (msg && msg.embeds[0]) {
            const oldEmbed = EmbedBuilder.from(msg.embeds[0]);
            let count = 0;
            if (ev.roleId) { const role = interaction.guild.roles.cache.get(ev.roleId); if (role) count = role.members.size; }
            if (oldEmbed.data.description) {
              oldEmbed.data.description = oldEmbed.data.description.replace(/(\u{1F465} ?\*?\*?Cupos:\*?\*? )\d+(\/)/, `$1${count}$2`);
            }
            await msg.edit({ embeds: [oldEmbed] });
          }
        } catch (e) { console.error("❌ Error updating event embed:", e.message); }
      }

      try {
        const gcInsc = getGuildConfig(interaction.guild.id);
        const inscChId = gcInsc.inscriptionChannelId || CONFIG.inscriptionChannelId;
        const inscCh = interaction.guild.channels.cache.get(inscChId);
        if (inscCh) {
          const inscEmbed = new EmbedBuilder()
            .setTitle(`📝 Nueva inscripción — ${ev.nombre}`)
            .setDescription(`**${interaction.user}** se inscribió en **${ev.nombre}**`)
            .addFields(
              { name: "👤 Nick", value: nick, inline: true },
              { name: "🎂 Edad", value: String(edad), inline: true },
              { name: "🎙️ Micrófono", value: mic ? "Sí" : "No", inline: true },
              { name: "🎬 Creador de contenido", value: contenido ? "Sí" : "No", inline: true },
              { name: "🏅 Participante número", value: String(ev.participants.length), inline: true },
            )
            .setColor(0x00FF00)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();
          if (contenido && streamLink) inscEmbed.addFields({ name: "🔗 Streaming", value: streamLink, inline: false });
          await inscCh.send({ embeds: [inscEmbed] });

          try {
            const countMsg = await inscCh.messages.fetch(gcInsc.inscriptionEmbedId || CONFIG.inscriptionEmbedId);
            const countEmbed = EmbedBuilder.from(countMsg.embeds[0]);
            let currentCount = 0;
            if (ev.roleId) { const role = interaction.guild.roles.cache.get(ev.roleId); if (role) currentCount = role.members.size; }
            const oldDesc = countEmbed.data.description || "";
            countEmbed.data.description = oldDesc.replace(/\u{1F465} \*\*Inscritos:\*\* \d+\//, "\u{1F465} **Inscritos:** " + currentCount + "/");
            await countMsg.edit({ embeds: [countEmbed] });
          } catch {}
        }
      } catch {}

      const extraMsg = contenido && streamLink ? `\n🎬 Link de streaming registrado.\n🏷️ Se te asignó el rol de creador de contenido.` : "";
      return interaction.reply({ content: `✅ Te inscribiste en **${ev.nombre}** como **${nick}**.${ev.roleId ? `\n🏷️ Se te asignó el rol del evento.` : ""}${extraMsg}`, flags: MessageFlags.Ephemeral });
      } finally { processingInscriptions.delete(lockKey); }
    }

    if (interaction.isButton() && interaction.customId.startsWith("evento_leave_")) {
      const id = interaction.customId.replace("evento_leave_", "");
      console.log(`🚪 Leave request: ${id} by ${interaction.user.tag}`);
      console.log(`📋 Events in map: ${[...events.keys()].join(", ")}`);
      let ev = events.get(id);
      if (!ev && !eventsLoaded) { loadEvents(); ev = events.get(id); }
      if (!ev) return interaction.reply({ content: "❌ Evento no encontrado.", flags: MessageFlags.Ephemeral });
      if (!ev.roleId) return interaction.reply({ content: "❌ Este evento no tiene rol.", flags: MessageFlags.Ephemeral });
      const member = interaction.guild.members.cache.get(interaction.user.id);
      if (!member) return interaction.reply({ content: "❌ Miembro no encontrado.", flags: MessageFlags.Ephemeral });
      if (!member.roles.cache.has(ev.roleId)) return interaction.reply({ content: "❌ No estás inscrito en este evento.", flags: MessageFlags.Ephemeral });

      await member.roles.remove(ev.roleId);
      const prId2 = getParticipanteRoleId(interaction.guild.id);
      if (prId2) await member.roles.remove(prId2).catch(() => {});
      const mediaTeamRole = interaction.guild.roles.cache.find(r => r.name === "Media Team");
      if (mediaTeamRole && member.roles.cache.has(mediaTeamRole.id)) {
        await member.roles.remove(mediaTeamRole.id).catch(() => {});
      }

      ev.participants = ev.participants.filter(p => p.userId !== interaction.user.id);
      saveEvents();

      const ch = interaction.guild.channels.cache.get(ev.channelId);
      if (ch) {
        try {
          const msg = await ch.messages.fetch(ev.messageId);
          if (msg && msg.embeds[0]) {
            const oldEmbed = EmbedBuilder.from(msg.embeds[0]);
            let count = 0;
            const role = interaction.guild.roles.cache.get(ev.roleId);
            if (role) count = role.members.size;
            if (oldEmbed.data.description) {
              oldEmbed.data.description = oldEmbed.data.description.replace(/(\u{1F465} ?\*?\*?Cupos:\*?\*? )\d+(\/)/, `$1${count}$2`);
            }
            await msg.edit({ embeds: [oldEmbed] });
          }
        } catch (e) { console.error("❌ Error updating event embed:", e.message); }
      }

      return interaction.reply({ content: `✅ Saliste del evento **${ev.nombre}**.`, flags: MessageFlags.Ephemeral });
    }

    // ===== EQUIPO =====
    if (interaction.commandName === "equipo") {
      const sub = interaction.options.getSubcommand();

      if (sub === "crear") {
        const modal = new ModalBuilder().setCustomId("equipo_modal").setTitle("Crear Equipo");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nombre").setLabel("Nombre del equipo").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nicks").setLabel("Nicks de Minecraft (separados por coma)").setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("edades").setLabel("Edades (separadas por coma)").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("especialidad").setLabel("¿En qué se especializan en Minecraft?").setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("color").setLabel("Color hex (sin #)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("FF0000")),
        );
        return interaction.showModal(modal);
      }

      if (sub === "listar") {
        const all = teamsOf(interaction.guild.id);
        if (all.length === 0) return interaction.reply({ content: "📋 No hay equipos creados.", flags: MessageFlags.Ephemeral });
        const embed = new EmbedBuilder().setTitle("📋 Equipos").setColor(0x5865F2);
        for (const [, team] of all) {
          embed.addFields({ name: team.roleName || team.name, value: `👥 ${team.members.length} miembros | 🎮 ${team.specialty}`, inline: false });
        }
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === "eliminar") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede eliminar equipos.", flags: MessageFlags.Ephemeral });
        const nombre = interaction.options.getString("nombre");
        const team = teamGet(interaction.guild.id, nombre);
        if (!team) return interaction.reply({ content: "❌ Equipo no encontrado.", flags: MessageFlags.Ephemeral });

        // Mark as eliminated in event
        if (team.eventId) {
          const ev = events.get(team.eventId);
          if (ev && (ev.guildId || "") === interaction.guild.id) {
            if (!ev.eliminatedTeams) ev.eliminatedTeams = [];
            if (!ev.eliminatedTeams.includes(team.name)) ev.eliminatedTeams.push(team.name);
            if (ev.displayMessageId && ev.displayChannelId) {
              try {
                const ch = interaction.guild.channels.cache.get(ev.displayChannelId);
                if (ch) { const m = await ch.messages.fetch(ev.displayMessageId); if (m) await m.edit({ embeds: [buildEventDisplayEmbed(ev, interaction.guild)] }); }
              } catch {}
            }
          }
        }

        try { const role = await interaction.guild.roles.fetch(team.roleId); if (role) await role.delete(); } catch {}
        teamDel(interaction.guild.id, nombre);
        return interaction.reply({ content: `🗑️ Equipo **${team.name}** eliminado${team.eventId ? ` y marcado como eliminado en el evento` : ""}.` });
      }

      // /equipo invitar
      if (sub === "invitar") {
        const targetUser = interaction.options.getUser("usuario");
        // Find user's team (this guild only)
        let userTeam = null;
        for (const [, team] of teamsOf(interaction.guild.id)) {
          if (team.members.some(m => m.userId === interaction.user.id)) {
            userTeam = { name: team.name, team };
            break;
          }
        }
        if (!userTeam) return interaction.reply({ content: "❌ No perteneces a ningún equipo.", flags: MessageFlags.Ephemeral });

        // Check if target is already in a team (this guild only)
        for (const [, team] of teamsOf(interaction.guild.id)) {
          if (team.members.some(m => m.userId === targetUser.id)) {
            return interaction.reply({ content: `❌ <@${targetUser.id}> ya está en el equipo **${team.name}**.`, flags: MessageFlags.Ephemeral });
          }
        }

        // Check if already pending
        if (!userTeam.team.pendingInvites) userTeam.team.pendingInvites = [];
        if (userTeam.team.pendingInvites.includes(targetUser.id)) {
          return interaction.reply({ content: `❌ Ya hay una invitación pendiente para <@${targetUser.id}>.`, flags: MessageFlags.Ephemeral });
        }

        userTeam.team.pendingInvites.push(targetUser.id);
        saveTeams();

        // Send DM to target
        try {
          await targetUser.send(`🎮 **Invitación de equipo**\n\n**${userTeam.name}** te ha invitado a unirse.\n\nUsa \`/equipo aceptar ${userTeam.name}\` para unirte o \`/equipo rechazar ${userTeam.name}\` para rechazar.`);
        } catch {}

        return interaction.reply({ content: `✅ Invitación enviada a <@${targetUser.id}> para unirse a **${userTeam.name}**.` });
      }

      // /equipo expulsar
      if (sub === "expulsar") {
        const targetUser = interaction.options.getUser("usuario");
        // Find user's team and check if owner (this guild only)
        let userTeam = null;
        for (const [, team] of teamsOf(interaction.guild.id)) {
          if (team.members.some(m => m.userId === interaction.user.id)) {
            userTeam = { name: team.name, team };
            break;
          }
        }
        if (!userTeam) return interaction.reply({ content: "❌ No perteneces a ningún equipo.", flags: MessageFlags.Ephemeral });
        if (userTeam.team.creatorId !== interaction.user.id) {
          return interaction.reply({ content: "❌ Solo el creador del equipo puede expulsar miembros.", flags: MessageFlags.Ephemeral });
        }
        if (targetUser.id === interaction.user.id) {
          return interaction.reply({ content: "❌ No puedes expulsarte a ti mismo. Usa `/equipo salir`.", flags: MessageFlags.Ephemeral });
        }

        const memberIndex = userTeam.team.members.findIndex(m => m.userId === targetUser.id);
        if (memberIndex === -1) {
          return interaction.reply({ content: `❌ <@${targetUser.id}> no está en tu equipo.`, flags: MessageFlags.Ephemeral });
        }

        userTeam.team.members.splice(memberIndex, 1);
        saveTeams();

        // Remove team role
        try {
          const member = await interaction.guild.members.fetch(targetUser.id);
          await member.roles.remove(userTeam.team.roleId);
        } catch {}

        return interaction.reply({ content: `✅ <@${targetUser.id}> expulsado de **${userTeam.name}**.` });
      }

      // /equipo salir
      if (sub === "salir") {
        let userTeam = null;
        for (const [, team] of teamsOf(interaction.guild.id)) {
          if (team.members.some(m => m.userId === interaction.user.id)) {
            userTeam = { name: team.name, team };
            break;
          }
        }
        if (!userTeam) return interaction.reply({ content: "❌ No perteneces a ningún equipo.", flags: MessageFlags.Ephemeral });
        if (userTeam.team.creatorId === interaction.user.id) {
          return interaction.reply({ content: "❌ Eres el creador del equipo. No puedes salir. Elimina el equipo con `/equipo eliminar`.", flags: MessageFlags.Ephemeral });
        }

        const memberIndex = userTeam.team.members.findIndex(m => m.userId === interaction.user.id);
        userTeam.team.members.splice(memberIndex, 1);
        saveTeams();

        // Remove team role
        try {
          await interaction.member.roles.remove(userTeam.team.roleId);
        } catch {}

        return interaction.reply({ content: `✅ Saliste de **${userTeam.name}**.` });
      }

      // /equipo aceptar
      if (sub === "aceptar") {
        const nombre = interaction.options.getString("equipo");
        const team = teamGet(interaction.guild.id, nombre);
        if (!team) return interaction.reply({ content: "❌ Equipo no encontrado.", flags: MessageFlags.Ephemeral });

        if (!team.pendingInvites) team.pendingInvites = [];
        if (!team.pendingInvites.includes(interaction.user.id)) {
          return interaction.reply({ content: "❌ No tienes invitación pendiente de este equipo.", flags: MessageFlags.Ephemeral });
        }

        // Check if already in a team (this guild only)
        for (const [, t] of teamsOf(interaction.guild.id)) {
          if (t.members.some(m => m.userId === interaction.user.id)) {
            return interaction.reply({ content: `❌ Ya estás en el equipo **${t.name}**. Sal primero con \`/equipo salir\`.`, flags: MessageFlags.Ephemeral });
          }
        }

        // Remove from pending, add to members
        team.pendingInvites = team.pendingInvites.filter(id => id !== interaction.user.id);
        team.members.push({ nick: interaction.user.nickname || interaction.user.username, edad: "?", userId: interaction.user.id });
        saveTeams();

        // Give team role
        try {
          await interaction.member.roles.add(team.roleId);
        } catch {}

        return interaction.reply({ content: `✅ Te uniste a **${team.name}**!` });
      }

      // /equipo rechazar
      if (sub === "rechazar") {
        const nombre = interaction.options.getString("equipo");
        const team = teamGet(interaction.guild.id, nombre);
        if (!team) return interaction.reply({ content: "❌ Equipo no encontrado.", flags: MessageFlags.Ephemeral });

        if (!team.pendingInvites) team.pendingInvites = [];
        if (!team.pendingInvites.includes(interaction.user.id)) {
          return interaction.reply({ content: "❌ No tienes invitación pendiente de este equipo.", flags: MessageFlags.Ephemeral });
        }

        team.pendingInvites = team.pendingInvites.filter(id => id !== interaction.user.id);
        saveTeams();

        return interaction.reply({ content: `❌ Invitación de **${team.name}** rechazada.` });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === "equipo_modal") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const nombre = interaction.fields.getTextInputValue("nombre");
      const nicks = interaction.fields.getTextInputValue("nicks").split(",").map(s => s.trim());
      const edades = interaction.fields.getTextInputValue("edades").split(",").map(s => s.trim());
      const especialidad = interaction.fields.getTextInputValue("especialidad");
      const colorHex = interaction.fields.getTextInputValue("color").replace("#", "");
      let colorInt; try { colorInt = parseInt(colorHex, 16); } catch { colorInt = 0x5865F2; }

      const role = await interaction.guild.roles.create({
        name: `🎮 ${nombre}`,
        colors: { primaryColor: colorInt },
        reason: `Equipo: ${nombre}`,
      });

      const participanteRole = interaction.guild.roles.cache.get(getParticipanteRoleId(interaction.guild.id));
      const mediaTeamRole = interaction.guild.roles.cache.find(r => r.name === "Media Team");
      let highestPos = 0;
      if (participanteRole && participanteRole.position > highestPos) highestPos = participanteRole.position;
      if (mediaTeamRole && mediaTeamRole.position > highestPos) highestPos = mediaTeamRole.position;
      if (highestPos > 0) {
        try { await role.setPosition(highestPos + 1); } catch {}
      }

      // Auto-add creator to team
      const creatorNick = interaction.user.nickname || interaction.user.username;
      const creatorData = { nick: creatorNick, edad: "?", userId: interaction.user.id };

      // Add creator to members list if not already there
      const allMembers = [creatorData];
      for (let i = 0; i < nicks.length; i++) {
        if (nicks[i].toLowerCase() !== creatorNick.toLowerCase()) {
          allMembers.push({ nick: nicks[i], edad: edades[i] || "?" });
        }
      }

      teamSet(interaction.guild.id, nombre, {
        name: nombre, roleName: `🎮 ${nombre}`,
        roleId: role.id, members: allMembers,
        specialty: especialidad, color: colorInt,
        creatorId: interaction.user.id, eventId: null,
        pendingInvites: [],
      });

      // Give creator the team role
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        await member.roles.add(role.id);
      } catch {}

      // Auto-add to active event (same guild only)
      let addedToEvent = null;
      for (const [eid, ev] of events) {
        if ((ev.guildId || "") !== interaction.guild.id) continue;
        if (ev.status === "abierto" || ev.status === "cerrado") {
          ev.eventTeams.push({ name: nombre, roleId: role.id, specialty: especialidad, color: colorInt });
          teamGet(interaction.guild.id, nombre).eventId = eid;
          saveTeams();
          addedToEvent = ev.nombre;
          if (ev.displayMessageId && ev.displayChannelId) {
            try {
              const ch = interaction.guild.channels.cache.get(ev.displayChannelId);
              if (ch) { const m = await ch.messages.fetch(ev.displayMessageId); if (m) await m.edit({ embeds: [buildEventDisplayEmbed(ev, interaction.guild)] }); }
            } catch {}
          }
          break;
        }
      }

      const memberList = allMembers.slice(0, 15).map(m => m.nick).join(", ");
      const memberSuffix = allMembers.length > 15 ? `... y ${allMembers.length - 15} más` : "";
      return interaction.editReply({ content: `✅ Equipo **${nombre}** creado con rol <@&${role.id}>.\n👑 Creador: <@${interaction.user.id}>\n👥 Miembros: ${memberList}${memberSuffix}\n🎮 Especialidad: ${especialidad}${addedToEvent ? `\n📌 Agregado al evento: **${addedToEvent}**` : ""}` });
    }

    // ===== SERVER STATUS =====
    if (interaction.commandName === "server") {
      const sub = interaction.options.getSubcommand();

      if (sub === "status") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede usar este comando.", flags: MessageFlags.Ephemeral });

        await interaction.deferReply();
        const net = require("net");
        const queryServer = async (host, port) => {
          try {
            const { status } = require("minecraft-server-util");
            const result = await status(host, port, { timeout: 8000 });
            return {
              online: true,
              motd: result.motd.clean || "Unknown",
              version: result.version.name || "Unknown",
              players: `${result.players.online}/${result.players.max}`,
              playersOnline: result.players.online,
              playersMax: result.players.max,
              sample: result.players.sample?.map(p => p.name).slice(0, 5) || [],
              favicon: result.favicon || null,
            };
          } catch (err) {
            console.error("Server query error:", err.message);
            return null;
          }
        };

        const serverConfig = getMC(interaction.guildId);
        const result = await queryServer(serverConfig.host, serverConfig.port);
        if (!result) return interaction.editReply({ content: `❌ No se pudo conectar a **${serverConfig.host}:${serverConfig.port}**` });

        // Build player list
        let playerList = "Ninguno visible";
        if (result.sample && result.sample.length > 0) {
          playerList = result.sample.map(p => `• ${p}`).join("\n");
        }

        const embed = new EmbedBuilder()
          .setTitle(`🟢 ${serverConfig.host}`)
          .setDescription(`Estado del servidor **${serverConfig.host}:${serverConfig.port}**`)
          .setColor(0x00FF00)
          .addFields(
            { name: "📝 Descripción", value: `\`\`\`${result.motd}\`\`\``, inline: false },
            { name: "🎮 Versión", value: result.version, inline: true },
            { name: "👥 Jugadores", value: `${result.playersOnline} / ${result.playersMax}`, inline: true },
            { name: "📡 IP", value: `\`${serverConfig.host}:${serverConfig.port}\``, inline: true },
            { name: "🟢 Estado", value: "✅ Online", inline: true },
          )
          .setFooter({ text: `Consulta realizada por ${interaction.user.tag}` })
          .setTimestamp();

        // Add favicon if available
        if (result.favicon) {
          try {
            const base64 = result.favicon.replace("data:image/png;base64,", "");
            const buffer = Buffer.from(base64, "base64");
            const attachment = new AttachmentBuilder(buffer, { name: "server-icon.png" });
            embed.setThumbnail("attachment://server-icon.png");
            return interaction.editReply({ embeds: [embed], files: [attachment] });
          } catch {}
        }

        return interaction.editReply({ embeds: [embed] });
      }

      if (sub === "edit") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede editar el servidor.", flags: MessageFlags.Ephemeral });
        const newHost = interaction.options.getString("ip");
        const newPort = interaction.options.getInteger("puerto") || 25565;
        setMC(interaction.guildId, newHost, newPort);
        return interaction.reply({ content: `✅ Servidor actualizado a **${newHost}:${newPort}**` });
      }
    }

    // ===== PREDICCIONES =====
    if (interaction.commandName === "predecir") {
      const equipo = interaction.options.getRole("evento");
      const eventName = interaction.options.getString("evento");

      const key = eventName.toLowerCase();
      if (!predictions.has(key)) predictions.set(key, { name: eventName, bets: [] });

      const pred = predictions.get(key);
      if (pred.bets.find(b => b.userId === interaction.user.id))
        return interaction.reply({ content: "❌ Ya hiciste tu predicción para este evento.", flags: MessageFlags.Ephemeral });

      pred.bets.push({ userId: interaction.user.id, roleId: equipo.id, roleName: equipo.name });
      const embed = new EmbedBuilder()
        .setTitle(`🔮 Predicción: ${eventName}`)
        .setDescription(`<@${interaction.user.id}> predice que **${equipo.name}** ganará el evento **${eventName}**`)
        .setColor(equipo.color)
        .setFooter({ text: `Total predicciones: ${pred.bets.length}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ===== ENLAZAR REDES =====
    if (interaction.commandName === "enlazar") {
      const sub = interaction.options.getSubcommand();
      const gcSocial = getGuildConfig(interaction.guildId);

      if (sub === "cuenta") {
        const platform = interaction.options.getString("plataforma");
        const url = interaction.options.getString("url");
        const key = `${interaction.guildId}:${interaction.user.id}_${platform}`;
        socialLinks.set(key, { userId: interaction.user.id, guildId: interaction.guildId, platform, url, linkedAt: Date.now() });
        return interaction.reply({ content: `✅ **${platform}** enlazado: ${url}` });
      }

      if (sub === "canal") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede configurar canales.", flags: MessageFlags.Ephemeral });
        const platform = interaction.options.getString("plataforma");
        const channel = interaction.options.getChannel("canal");
        const guildId = interaction.guildId;
        socialNotifChannels.set(`${guildId}_${platform}`, { channelId: channel.id, guildId, platform });
        const platformKeyMap = { twitch: "socialTwitchChannel", youtube: "socialYoutubeChannel", kick: "socialKickChannel", tiktok: "socialTiktokChannel", x: "socialXChannel", instagram: "socialInstagramChannel" };
        if (platformKeyMap[platform]) gcSocial[platformKeyMap[platform]] = channel.id;
        saveGuilds();
        return interaction.reply({ content: `✅ Notificaciones de **${platform}** se enviarán en <#${channel.id}>` });
      }

      if (sub === "ver-canales") {
        if (!isStaff(interaction.member))
          return interaction.reply({ content: "❌ Solo staff puede ver la configuración de canales.", flags: MessageFlags.Ephemeral });
        const guildId = interaction.guildId;
        const icons = { twitch: "🟣", youtube: "🔴", kick: "🟢", tiktok: "⚫", x: "🐦", instagram: "📸" };
        const platformKeyMap = { twitch: "socialTwitchChannel", youtube: "socialYoutubeChannel", kick: "socialKickChannel", tiktok: "socialTiktokChannel", x: "socialXChannel", instagram: "socialInstagramChannel" };
        const channels = ["twitch", "youtube", "kick", "tiktok", "x", "instagram"].map(p => {
          const config = socialNotifChannels.get(`${guildId}_${p}`) || (gcSocial[platformKeyMap[p]] ? { channelId: gcSocial[platformKeyMap[p]] } : null);
          return `${icons[p]} **${p.toUpperCase()}:** ${config ? `<#${config.channelId}>` : "No configurado"}`;
        }).join("\n");
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle("📢 Canales de Notificación").setDescription(channels).setColor(0x5865F2)] });
      }
    }

    if (interaction.commandName === "redes") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const links = [...socialLinks.values()].filter(l => l.userId === user.id && (l.guildId || "") === interaction.guild.id);
      if (links.length === 0) return interaction.reply({ content: "❌ Este usuario no tiene redes enlazadas.", flags: MessageFlags.Ephemeral });
      const icons = { twitch: "🟣", youtube: "🔴", kick: "🟢", tiktok: "⚫", x: "🐦", instagram: "📸" };
      const desc = links.map(l => `${icons[l.platform] || "🔗"} **${l.platform.toUpperCase()}:** ${l.url}`).join("\n");
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🔗 Redes de ${user.tag}`).setDescription(desc).setColor(0x5865F2)] });
    }

    // ===== STATS =====
    if (interaction.commandName === "stats") {
      const user = interaction.options.getUser("usuario") || interaction.user;
      const data = getLevelData(interaction.guildId, user.id);
      const level = data.level || 0;
      const xp = data.xp || 0;
      const xpNeeded = xpForLevel(level);
      const xpCurrent = xp - (() => { let t = 0, n = 100; for (let i = 0; i < level; i++) { t += n; n = Math.floor(n * 1.15); } return t; })();
      const prefix = `${interaction.guildId}:`;
      const allSorted = [...memberStats.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, s]) => ({ id: k.slice(prefix.length), xp: s.xp || 0 })).sort((a, b) => b.xp - a.xp);
      const rank = allSorted.findIndex(e => e.id === user.id) + 1;
      const userTeams = [...teams.entries()].filter(([, t]) => (t.guildId || "") === interaction.guildId && t.members.some(m => m.nick.toLowerCase() === user.username.toLowerCase()));
      const teamNames = userTeams.map(([, t]) => t.name).join(", ") || "Ninguno";
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle(`📊 Estadísticas de ${user.tag}`)
          .setThumbnail(user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: "⭐ Nivel", value: `${level}`, inline: true },
            { name: "✨ XP", value: `${xp} (${xpCurrent}/${xpNeeded} al siguiente)`, inline: true },
            { name: "🏆 Ranking", value: `#${rank || "—"}`, inline: true },
            { name: "💬 Mensajes", value: `${data.messages || 0}`, inline: true },
            { name: "🔊 Min. voz", value: `${data.voiceMinutes || 0}`, inline: true },
            { name: "🎮 Eventos", value: `${data.eventsParticipated || 0}`, inline: true },
            { name: "🏆 Victorias", value: `${data.eventsWon || 0}`, inline: true },
            { name: "👥 Equipos", value: teamNames, inline: false },
          )
          .setColor(0xFFD700)]
      });
    }

    // ===== LEADERBOARD =====
    if (interaction.commandName === "leaderboard") {
      const prefix = `${interaction.guildId}:`;
      const allStats = [...memberStats.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, s]) => ({ id: k.slice(prefix.length), ...s })).sort((a, b) => (b.xp || 0) - (a.xp || 0) || b.eventsWon - a.eventsWon);
      if (allStats.length === 0) return interaction.reply({ content: "📋 No hay estadísticas aún.", flags: MessageFlags.Ephemeral });
      const medals = ["🥇", "🥈", "🥉"];
      const desc = allStats.slice(0, 15).map((s, i) => {
        const lvl = s.level || calcLevel(s.xp || 0);
        return `${medals[i] || `**${i + 1}.**`} <@${s.id}> — ⭐ Nv.${lvl} | ✨ ${s.xp || 0} XP | 💬 ${s.messages || 0} msgs`;
      }).join("\n");
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🏆 Leaderboard").setDescription(desc).setColor(0xFFD700).setTimestamp()] });
    }

    // ===== ROLE (giveall/removeall/count) =====
    if (interaction.commandName === "role") {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: "❌ Solo staff puede gestionar roles.", flags: MessageFlags.Ephemeral });
      }
      const sub = interaction.options.getSubcommand();
      const role = interaction.options.getRole("rol");
      if (!role) return interaction.reply({ content: "❌ Rol no encontrado.", flags: MessageFlags.Ephemeral });
      if (role.managed) return interaction.reply({ content: "❌ Ese rol lo gestiona una integración, no se puede asignar.", flags: MessageFlags.Ephemeral });
      const botMember = interaction.guild.members.me;
      if (botMember && role.position >= botMember.roles.highest.position) {
        return interaction.reply({ content: "❌ Mi rol está por debajo: sube al bot en la jerarquía.", flags: MessageFlags.Ephemeral });
      }
      if (sub === "count") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.guild.members.fetch();
        const n = role.members.size;
        return interaction.editReply({ content: `🎭 **${role.name}**: ${n} miembro(s).` });
      }
      const onlyHumans = interaction.options.getBoolean("solo-humanos");
      const skipBots = onlyHumans === null ? true : onlyHumans;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.guild.members.fetch();
      const targets = [...role.guild.members.cache.values()].filter(m =>
        (sub === "giveall" ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id)) &&
        (!skipBots || !m.user.bot) && m.id !== interaction.guild.ownerId
      );
      if (!targets.length) {
        return interaction.editReply({ content: sub === "giveall" ? "✅ Todos ya tienen ese rol." : "✅ Nadie tiene ese rol." });
      }
      await interaction.editReply({ content: `⏳ Procesando ${targets.length} miembros…` });
      let ok = 0, fail = 0;
      for (let i = 0; i < targets.length; i++) {
        try {
          if (sub === "giveall") await targets[i].roles.add(role);
          else await targets[i].roles.remove(role);
          ok++;
        } catch { fail++; }
        if ((i + 1) % 10 === 0) {
          await interaction.editReply({ content: `⏳ Procesando ${i + 1}/${targets.length}… ✅ ${ok} ❌ ${fail}` }).catch(() => {});
          await new Promise(r => setTimeout(r, 1200));
        }
      }
      return interaction.editReply({ content: `${sub === "giveall" ? "✅ Roles entregados" : "🗑️ Roles quitados"}: **${ok}** ok, **${fail}** fallos de ${targets.length}.` });
    }

    // ===== STAFF =====
    if (interaction.commandName === "staff") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede usar este comando.", flags: MessageFlags.Ephemeral });
      const sub = interaction.options.getSubcommand();
      const gs = getGuildStaff(interaction.guild.id);

      if (sub === "agregar") {
        const tipo = interaction.options.getString("tipo");
        const id = interaction.options.getString("id").replace(/[<@&>]/g, "");
        if (tipo === "user") {
          const u = await client.users.fetch(id).catch(() => null);
          if (!u) return interaction.reply({ content: "❌ Usuario no encontrado.", flags: MessageFlags.Ephemeral });
          gs.users[id] = { addedBy: interaction.user.id, addedAt: Date.now() };
          saveStaff();
          return interaction.reply({ content: `✅ <@${id}> agregado al staff.` });
        } else {
          const r = await interaction.guild.roles.fetch(id).catch(() => null);
          if (!r) return interaction.reply({ content: "❌ Rol no encontrado.", flags: MessageFlags.Ephemeral });
          gs.roles[id] = { addedBy: interaction.user.id, addedAt: Date.now(), name: r.name };
          saveStaff();
          return interaction.reply({ content: `✅ Rol <@&${id}> agregado al staff.` });
        }
      }

      if (sub === "quitar") {
        const tipo = interaction.options.getString("tipo");
        const id = interaction.options.getString("id").replace(/[<@&>]/g, "");
        if (tipo === "user") {
          if (!gs.users[id]) return interaction.reply({ content: "❌ Este usuario no está en el staff.", flags: MessageFlags.Ephemeral });
          delete gs.users[id];
          saveStaff();
          return interaction.reply({ content: `✅ <@${id}> removido del staff.` });
        } else {
          if (!gs.roles[id]) return interaction.reply({ content: "❌ Este rol no está en el staff.", flags: MessageFlags.Ephemeral });
          delete gs.roles[id];
          saveStaff();
          return interaction.reply({ content: `✅ Rol <@&${id}> removido del staff.` });
        }
      }

      if (sub === "listar") {
        const userLines = Object.entries(gs.users).map(([id, info]) => `<@${id}> — agregado por <@${info.addedBy}>`).join("\n") || "Ninguno";
        const roleLines = Object.entries(gs.roles).map(([id, info]) => `<@&${id}> (${info.name}) — agregado por <@${info.addedBy}>`).join("\n") || "Ninguno";
        return interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle("👮 Lista de Staff")
            .addFields({ name: "👤 Usuarios", value: userLines.slice(0, 1024), inline: false })
            .addFields({ name: "🏷️ Roles", value: roleLines.slice(0, 1024), inline: false })
            .setColor(0xFFD700)
            .setFooter({ text: "Los admins con ManageGuild siempre son staff" })
            .setTimestamp()]
        });
      }
    }

    // ===== GUILD-SETUP =====
    if (interaction.commandName === "guild-setup") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ Necesitas permiso de Administrador.", flags: MessageFlags.Ephemeral });
      }
      const sub = interaction.options.getSubcommand(false);
      if (!sub) {
        return interaction.reply({ content: "❌ Debes especificar un subcomando: `configurar` o `ver`.", flags: MessageFlags.Ephemeral });
      }
      const gc = getGuildConfig(interaction.guild.id);

      if (sub === "configurar") {
        const modal = new ModalBuilder()
          .setCustomId(`guild_setup_modal_${interaction.guild.id}`)
          .setTitle(`Configurar ${interaction.guild.name}`);
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("welcomeCh").setLabel("Canal de bienvenidas (ID)").setStyle(TextInputStyle.Short).setValue(gc.welcomeChannelId || "").setPlaceholder("ID del canal #BIENVENIDAS").setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("verificationCh").setLabel("Canal de verificación (ID)").setStyle(TextInputStyle.Short).setValue(gc.verificationChannelId || "").setPlaceholder("ID del canal #VERIFICACION").setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("staffRole").setLabel("Rol de Staff (ID)").setStyle(TextInputStyle.Short).setValue(gc.staffRoleId || "").setPlaceholder("ID del rol Staff").setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("miembroRole").setLabel("Rol de Miembro (ID)").setStyle(TextInputStyle.Short).setValue(gc.miembroRoleId || "").setPlaceholder("ID del rol Miembro").setRequired(false)),
        );
        return interaction.showModal(modal);
      }

      if (sub === "ver") {
        const lines = [
          `**Servidor:** ${interaction.guild.name} (\`${interaction.guild.id}\`)`,
          `**Dueño:** <@${gc.ownerId || "?"}>`,
          `**Canal bienvenidas:** ${gc.welcomeChannelId ? `<#${gc.welcomeChannelId}>` : "❌ No configurado"}`,
          `**Canal verificación:** ${gc.verificationChannelId ? `<#${gc.verificationChannelId}>` : "❌ No configurado"}`,
          `**Rol Staff:** ${gc.staffRoleId ? `<@&${gc.staffRoleId}>` : "❌ No configurado"}`,
          `**Rol Miembro:** ${gc.miembroRoleId ? `<@&${gc.miembroRoleId}>` : "❌ No configurado"}`,
          `**Rol Participante:** ${gc.participanteRoleId ? `<@&${gc.participanteRoleId}>` : "❌ No configurado"}`,
          `**Rol Directivos:** ${gc.directivosRoleId ? `<@&${gc.directivosRoleId}>` : "❌ No configurado"}`,
          `**Rol Creador:** ${gc.creatorRoleId ? `<@&${gc.creatorRoleId}>` : "❌ No configurado"}`,
          `**Canal inscripciones:** ${gc.inscriptionChannelId ? `<#${gc.inscriptionChannelId}>` : "❌ No configurado"}`,
        ];
        const gs = getGuildStaff(interaction.guild.id);
        lines.push(`\n**Staff registrado:** ${Object.keys(gs.users).length} usuarios, ${Object.keys(gs.roles).length} roles`);
        return interaction.reply({
          embeds: [new EmbedBuilder().setTitle("⚙️ Configuración del servidor").setDescription(lines.join("\n")).setColor(0x5865F2).setTimestamp()],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    if (interaction.commandName === "bot" && interaction.options.getSubcommand() === "modo") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede cambiar el estado del bot.", flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const modo = interaction.options.getString("modo");
      const texto = interaction.options.getString("texto") || "";

      const typeMap = { playing: ActivityType.Playing, listening: ActivityType.Listening, watching: ActivityType.Watching, competing: ActivityType.Competing, streaming: ActivityType.Streaming };
      const labelMap = { playing: "Jugando", listening: "Escuchando", watching: "Mirando", competing: "Compitiendo en", streaming: "Transmitiendo" };
      const iconMap = { playing: "🎮", listening: "🎵", watching: "👀", competing: "🏆", streaming: "📺", none: "⚪" };

      if (modo === "none") {
        client.user.setPresence({ activities: [], status: "online" });
        botmodeConfig = { mode: "none", text: "" };
        saveBotmode();
        return interaction.editReply({ content: "✅ Actividad quitada." });
      }

      if (modo === "streaming") {
        if (!texto) return interaction.editReply({ content: "❌ Necesitas un texto para modo streaming." });
        client.user.setPresence({
          activities: [{ name: texto, type: ActivityType.Streaming, url: "https://twitch.tv/hydrastudio" }],
          status: "online",
        });
        botmodeConfig = { mode: "streaming", text: texto };
        saveBotmode();
        return interaction.editReply({ content: `${iconMap.streaming} Ahora transmitiendo **${texto}**` });
      }

      if (!texto) return interaction.editReply({ content: "❌ Necesitas un texto para la actividad." });
      client.user.setPresence({
        activities: [{ name: texto, type: typeMap[modo] || ActivityType.Playing }],
        status: "online",
      });
      botmodeConfig = { mode: modo, text: texto };
      saveBotmode();
      return interaction.editReply({ content: `${iconMap[modo] || "🎮"} Ahora **${labelMap[modo] || modo}** **${texto}**` });
    }

    // ===== STATUS =====
    if (interaction.commandName === "status") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede cambiar el estado del bot.", flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const sub = interaction.options.getSubcommand();

      if (sub === "reset") {
        client.user.setPresence({ activities: [{ name: "Hydra Studio", type: ActivityType.Playing }], status: "online" });
        botmodeConfig = { mode: "playing", text: "Hydra Studio" };
        saveBotmode();
        spotifySyncEnabled = false;
        return interaction.editReply({ content: "✅ Presencia reseteada a: Jugando Hydra Studio" });
      }

      if (sub === "set") {
        const estado = interaction.options.getString("estado");
        const actividad = interaction.options.getString("actividad");
        const texto = interaction.options.getString("texto") || "";
        const url = interaction.options.getString("url") || "";

        const typeMap = { playing: ActivityType.Playing, listening: ActivityType.Listening, watching: ActivityType.Watching, competing: ActivityType.Competing, streaming: ActivityType.Streaming };
        const labelMap = { playing: "Jugando", listening: "Escuchando", watching: "Mirando", competing: "Compitiendo en", streaming: "Transmitiendo", spotify: "Spotify auto", none: "Ninguna" };
        const iconMap = { playing: "🎮", listening: "🎵", watching: "👀", competing: "🏆", streaming: "📺", spotify: "🎶", none: "⚪" };

        if (actividad === "none") {
          client.user.setPresence({ activities: [], status: estado });
          botmodeConfig = { mode: "none", text: "" };
          saveBotmode();
          spotifySyncEnabled = false;
          return interaction.editReply({ content: `✅ Actividad quitada. Estado: **${estado}**` });
        }

        if (actividad === "spotify") {
          spotifySyncEnabled = true;
          botmodeConfig = { mode: "spotify", text: "" };
          saveBotmode();
          client.user.setPresence({ status: estado });
          return interaction.editReply({ content: `🎶 Sincronización de Spotify activada. Estado: **${estado}**` });
        }

        if (actividad === "streaming") {
          if (!texto) return interaction.editReply({ content: "❌ Necesitas un texto para modo streaming." });
          client.user.setPresence({
            activities: [{ name: texto, type: ActivityType.Streaming, url: url || "https://twitch.tv/hydrastudio" }],
            status: estado,
          });
          botmodeConfig = { mode: "streaming", text: texto };
          saveBotmode();
          spotifySyncEnabled = false;
          return interaction.editReply({ content: `${iconMap.streaming} Ahora transmitiendo **${texto}** | Estado: **${estado}**` });
        }

        if (!texto) return interaction.editReply({ content: "❌ Necesitas un texto para la actividad." });
        client.user.setPresence({
          activities: [{ name: texto, type: typeMap[actividad] || ActivityType.Playing }],
          status: estado,
        });
        botmodeConfig = { mode: actividad, text: texto };
        saveBotmode();
        spotifySyncEnabled = false;
        return interaction.editReply({ content: `${iconMap[actividad] || "🎮"} Ahora **${labelMap[actividad] || actividad}** **${texto}** | Estado: **${estado}**` });
      }
    }

    // ===== TEST-JOIN =====
    if (interaction.commandName === "bot" && interaction.options.getSubcommand() === "testjoin") {
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const targetUser = interaction.options.getUser("usuario") || interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return interaction.editReply({ content: "❌ No pude encontrar a ese usuario en el servidor." });

      try {
        // Generate banner
        const bannerBuffer = generateWelcomeBanner(member.displayName, member.user.displayAvatarURL());
        const bannerAttachment = new AttachmentBuilder(bannerBuffer, { name: "welcome-banner.png" });

        const welcomeGc = getGuildConfig(interaction.guild.id);
        const wExTj = welcomeExtra(welcomeGc);
        const welcomeEmbed = new EmbedBuilder()
          .setTitle(`✨ ¡Bienvenido/a, ${member.displayName}! ✨`)
          .setDescription(
            welcomeGc.welcomeMessage
              ? renderMsg(welcomeGc.welcomeMessage, member, wExTj)
              : renderMsg(WELCOME_DEFAULT_DESC, member, wExTj)
          )
          .setColor(0x5865f2)
          .setImage("attachment://welcome-banner.png")
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
          .setFooter({ text: "🎉 ¡Disfruta tu estadía en nuestra comunidad!" })
          .setTimestamp();

        const welcomeCh = interaction.guild.channels.cache.get(welcomeGc.welcomeChannelId || "");
        if (!welcomeCh) return interaction.editReply({ content: "❌ No encontré el canal de bienvenida. Verifica la ID." });

        await welcomeCh.send({ embeds: [welcomeEmbed], files: [bannerAttachment] });
        await interaction.editReply({ content: `✅ Mensaje de bienvenida enviado en <#${welcomeGc.welcomeChannelId}> para **${member.displayName}**.` });
      } catch (err) {
        await interaction.editReply({ content: "❌ Error: " + err.message });
      }
    }

    // ===== BOT-CONTROL =====
    if (interaction.commandName === "bot" && interaction.options.getSubcommand() === "control") {
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede controlarlo.", flags: MessageFlags.Ephemeral });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("bot_apagar").setLabel("Apagar").setStyle(ButtonStyle.Danger).setEmoji("🔴"),
        new ButtonBuilder().setCustomId("bot_reiniciar").setLabel("Reiniciar").setStyle(ButtonStyle.Primary).setEmoji("🔄"),
      );
      return interaction.reply({ content: "🎮 **Control del Bot HYDRA**", components: [row], flags: MessageFlags.Ephemeral });
    }

    if (interaction.isButton() && (interaction.customId === "bot_apagar" || interaction.customId === "bot_reiniciar")) {
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño.", flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const { execSync } = require("child_process");
        if (!pm2Disponible()) return interaction.editReply({ content: SIN_PM2 });
        if (interaction.customId === "bot_apagar") {
          await interaction.editReply({ content: "🔴 Apagando bot..." });
          execSync(`pm2 stop ${PROCESO_PM2} && pm2 delete ${PROCESO_PM2}`, { cwd: __dirname });
          process.exit(0);
        } else {
          await interaction.editReply({ content: "🔄 Reiniciando bot..." });
          try { execSync(`pm2 restart ${PROCESO_PM2}`, { cwd: __dirname }); }
          catch { process.exit(1); }
          await interaction.editReply({ content: "✅ Bot reiniciado." });
        }
      } catch (e) {
        await interaction.editReply({ content: "❌ Error: " + e.message });
      }
    }

    // ===== SUSPENDER =====
    if (interaction.commandName === "bot" && interaction.options.getSubcommand() === "suspender") {
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral });
      botSuspended = true;
      client.user.setPresence({ status: "idle", activities: [{ name: "⏸️ Suspendido", type: ActivityType.Playing }] });
      return interaction.reply({ content: "⏸️ Bot suspendido. Solo comandos de eventos y control están disponibles.", flags: MessageFlags.Ephemeral });
    }

    // ===== ACTIVAR =====
    if (interaction.commandName === "bot" && interaction.options.getSubcommand() === "activar") {
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral });
      botSuspended = false;
      if (botmodeConfig && botmodeConfig.mode !== "none") {
        const labelMap = { playing: "Jugando", listening: "Escuchando", watching: "Mirando", competing: "Compitiendo", streaming: "Transmitiendo" };
        const iconMap = { playing: "🎮", listening: "🎵", watching: "👁️", competing: "🏆", streaming: "📡" };
        client.user.setPresence({ status: "online", activities: [{ name: botmodeConfig.text || "Hydra Studio", type: ActivityType[botmodeConfig.mode.charAt(0).toUpperCase() + botmodeConfig.mode.slice(1)] || ActivityType.Playing }] });
      } else {
        client.user.setPresence({ status: "online", activities: [{ name: "Hydra Studio", type: ActivityType.Playing }] });
      }
      return interaction.reply({ content: "✅ Bot reactivado.", flags: MessageFlags.Ephemeral });
    }

    // ===== APAGAR =====
    if (interaction.commandName === "bot" && interaction.options.getSubcommand() === "apagar") {
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral });
      if (!pm2Disponible()) return interaction.reply({ content: SIN_PM2, flags: MessageFlags.Ephemeral });
      await interaction.reply({ content: "🔴 Apagando bot..." });
      const { execSync } = require("child_process");
      try { execSync(`pm2 stop ${PROCESO_PM2} && pm2 delete ${PROCESO_PM2}`, { cwd: __dirname }); } catch {}
      process.exit(0);
    }

    // ===== REINICIAR =====
    if (interaction.commandName === "bot" && interaction.options.getSubcommand() === "reiniciar") {
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral });
      await interaction.reply({ content: "🔄 Reiniciando bot..." });
      const { execSync } = require("child_process");
      if (!pm2Disponible()) return interaction.editReply({ content: SIN_PM2 });
  try { execSync(`pm2 restart ${PROCESO_PM2}`, { cwd: __dirname }); } catch { process.exit(1); }
      await interaction.editReply({ content: "✅ Bot reiniciado." });
    }

    // ===== INICIAR =====
    if (interaction.commandName === "bot" && interaction.options.getSubcommand() === "iniciar") {
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral });
      if (botSuspended) {
        botSuspended = false;
        if (botmodeConfig && botmodeConfig.mode !== "none") {
          client.user.setPresence({ status: "online", activities: [{ name: botmodeConfig.text || "Hydra Studio", type: ActivityType[botmodeConfig.mode.charAt(0).toUpperCase() + botmodeConfig.mode.slice(1)] || ActivityType.Playing }] });
        } else {
          client.user.setPresence({ status: "online", activities: [{ name: "Hydra Studio", type: ActivityType.Playing }] });
        }
        return interaction.reply({ content: "✅ Bot reactivado desde suspendido.", flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ content: "✅ El bot ya está activo.", flags: MessageFlags.Ephemeral });
    }

    // ===== TICKET-SETUP =====
    if (interaction.commandName === "ticket-setup") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede configurar tickets.", flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const gc = getGuildConfig(interaction.guild.id);
      const embCfg = (gc.embeds || {}).tickets || {};
      const colorStr = embCfg.color || "#00FF00";
      const colorInt = parseInt(colorStr.replace("#", ""), 16) || 0x00FF00;
      const cats = ticketCats(guild.id);

      const panelEmbed = new EmbedBuilder()
        .setTitle(String(gc.ticketPanelTitle || embCfg.title || `${interaction.guild.name} Support Area`).substring(0, 256))
        .setDescription(renderMsg(gc.ticketPanelDesc || embCfg.description || `¡Bienvenido al centro de soporte de **${interaction.guild.name}**! 🐉\n\nAquí podrás acceder a diferentes tipos de tickets para obtener ayuda, reportar problemas o solicitar información.\n\n📌 **Lee detenidamente las instrucciones de cada categoría** antes de abrir un ticket para agilizar tu atención.\n\n🔥 **Nuestro equipo de staff está listo para ayudarte.**\n\n> *La paciencia y el respeto son fundamentales para un buen servicio.*`, interaction.member))
        .setColor(parseColor(gc.ticketPanelColor || embCfg.color || "#00FF00"))
        .setFooter({ text: renderMsg(gc.ticketPanelFooter || `${interaction.guild.name} • Soporte`, interaction.member) })
        .setTimestamp();
      applyEmbedExtras(panelEmbed, gc, "ticket", interaction.member);
      const embed = panelEmbed;

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("ticket_select")
        .setPlaceholder("Click aquí para desplegar el menú!")
        .addOptions(cats.map(cat => ({
          label: cat.label,
          value: cat.value || cat.id,
          emoji: cat.emoji,
          description: cat.description || cat.desc,
        })));

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const fs = require("fs");
      const bannerPath = __dirname + "/ticket-banner.png";
      const sendOptions = { embeds: [embed], components: [row] };
      if (embCfg.image) {
        embed.setImage(embCfg.image);
      } else if (fs.existsSync(bannerPath)) {
        const bannerFile = new AttachmentBuilder(bannerPath, { name: "ticket-banner.png" });
        embed.setImage("attachment://ticket-banner.png");
        sendOptions.files = [bannerFile];
      }

      await interaction.editReply({ content: "✅ Panel de tickets enviado." });

      const targetChannel = interaction.options.getChannel("canal") || interaction.channel;
      await targetChannel.send(sendOptions);
    }

    // ===== TICKET SELECT =====
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {
      const categoryId = interaction.values[0];
      const gc2 = getGuildConfig(interaction.guild.id);
      const embCats = ((gc2.embeds || {}).tickets || {}).categories || [];
      const allCats = ticketCats(interaction.guild.id);
      const catData = allCats.find(c => (c.id || c.value) === categoryId);
      if (!catData) return interaction.reply({ content: "❌ Categoría no encontrada.", flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

// Crea el canal del ticket, los permisos y el embed. Se llama desde el
// menu de categorias (sin preguntas) o desde el formulario de preguntas.
async function crearTicket(interaction, catData, respuestas) {
        let ticketChannel;
        try {
          ticketChannel = await interaction.guild.channels.create({
            name: `${catData.prefix || "ticket"}-${interaction.user.username}`,
            type: 0,
            parent: gc2.ticketCategoryId || undefined,
            permissionOverwrites: [
              { id: interaction.guild.roles.everyone.id, deny: ["ViewChannel"] },
            ],
          });
  
          // User permissions
          await ticketChannel.permissionOverwrites.edit(interaction.user.id, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true,
          });
  
          // Bot permissions
          await ticketChannel.permissionOverwrites.edit(client.user.id, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageChannels: true, ManageMessages: true,
          });
  
          // Staff role permissions
          const staffRoleId = getGuildConfig(interaction.guild.id).staffRoleId;
          const staffRole = staffRoleId ? interaction.guild.roles.cache.get(staffRoleId) : null;
          if (staffRole) {
            await ticketChannel.permissionOverwrites.edit(staffRole, {
              ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
            });
          }
        } catch (err) {
          console.error("Error creating ticket channel:", err.message);
          return interaction.editReply({ content: "❌ Error al crear el canal del ticket." });
        }
  
        // Assign ticket role to user
        try {
          const gcTicket = getGuildConfig(interaction.guild.id);
          const ticketRoleId = gcTicket.ticketRoleId || "";
          const ticketRole = interaction.guild.roles.cache.get(ticketRoleId);
          if (ticketRole) {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            await member.roles.add(ticketRole);
          }
        } catch {}
  
        openTickets.set(ticketChannel.id, {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          category: catData.label,
          categoryId: catData.id,
          createdAt: Date.now(),
        });
        saveTickets();
  
        const ticketBtns = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_claim").setLabel("🙋 Reclamar").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Cerrar").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("ticket_delete").setLabel("🗑️ Borrar").setStyle(ButtonStyle.Secondary),
        );
  
        const ticketManageBtns = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_add_staff").setLabel("👤 Agregar Staff").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("ticket_add_user").setLabel("➕ Agregar Usuario").setStyle(ButtonStyle.Secondary),
        );
  
        const gcT = getGuildConfig(interaction.guild.id);
        const withCat = (s) => String(s || "").replace(/\{categoria\}/gi, catData.label);
        gcT.ticketCounter = (gcT.ticketCounter || 0) + 1;
        saveGuilds();
        const tExtra = {
          ticketName: ticketChannel.name,
          ticketNumber: gcT.ticketCounter,
          staffMention: gcT.staffRoleId ? `<@&${gcT.staffRoleId}>` : "Staff",
        };
        const ticketEmbed = new EmbedBuilder()
          .setTitle(String(gcT.ticketTitle || `${catData.emoji} Ticket Abierto — ${catData.label}`).substring(0, 256))
          .setDescription(renderMsg(withCat(gcT.ticketDesc || `Hola <@${interaction.user.id}>, bienvenido a tu ticket de **${catData.label}**.\n\n${catData.desc || catData.description || ""}\n\n${gcT.staffRoleId ? `<@&${gcT.staffRoleId}>` : "Staff"} Un miembro del staff te atenderá pronto.\n**Por favor describe tu problema con detalle.**`), interaction.member, tExtra))
          .setColor(parseColor(gcT.ticketColor || "#00FF00"))
          .setFooter({ text: renderMsg(withCat(gcT.ticketFooter || `${interaction.guild.name} • Soporte`), interaction.member, tExtra) })
          .setTimestamp();
        applyEmbedExtras(ticketEmbed, gcT, "ticket", interaction.member);
  
        const ticketFiles = [];
        if (gcT.ticketImage) {
          const bp = resolveTicketBanner(interaction.guild.id, gcT.ticketImage, "ticket");
          if (bp) {
            ticketFiles.push(new AttachmentBuilder(bp, { name: "ticket-banner.png" }));
            ticketEmbed.setImage("attachment://ticket-banner.png");
          }
        }
        try {
          const openRaw = renderMsg(withCat(gcT.ticketContent || ""), interaction.member, tExtra);
          const sMention = gcT.staffRoleId ? `<@&${gcT.staffRoleId}>` : "";
          const openContent = openRaw || `<@${interaction.user.id}> ${sMention}`;
          await ticketChannel.send({ content: openContent, embeds: [ticketEmbed], components: [ticketBtns, ticketManageBtns], files: ticketFiles });
        } catch (err) {
          console.error("Error sending ticket embed:", err.message);
        }
  
        // Reset select menu placeholder
        try {
          const gc3 = getGuildConfig(interaction.guild.id);
    const resetCats = ticketCats(interaction.guild.id);
          const resetMenu = new StringSelectMenuBuilder()
            .setCustomId("ticket_select")
            .setPlaceholder("Click aquí para desplegar el menú!")
            .addOptions(resetCats.map(cat => ({
              label: cat.label,
              value: cat.value || cat.id,
              emoji: cat.emoji,
              description: cat.description || cat.desc,
            })));
          const resetRow = new ActionRowBuilder().addComponents(resetMenu);
          await interaction.message.edit({ components: [resetRow] });
        } catch {}
  
        return interaction.editReply({ content: `✅ Ticket creado: <#${ticketChannel.id}>` });
  
}
      // Formulario de preguntas de la categoria (si tiene)
      const preguntas = (catData.questions || []).filter(Boolean).slice(0, 5);
      if (preguntas.length) {
        const modal = new ModalBuilder()
          .setCustomId(`ticket_q|${interaction.guild.id}|${categoryId}`)
          .setTitle(String(catData.label || "Ticket").slice(0, 45));
        preguntas.forEach((q, idx) => {
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("q" + idx).setLabel(String(q).slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
          ));
        });
        return interaction.showModal(modal).catch(() => {});
      }
      return crearTicket(interaction, catData, {});
    }

    // ===== TICKET CLAIM =====
    if (interaction.isButton() && interaction.customId === "ticket_claim") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ticketData = openTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.editReply({ content: "❌ Este canal no es un ticket abierto." });
      if (ticketData.closed) return interaction.editReply({ content: "⚠️ Ticket cerrado. Reábrelo primero." });
      if (!isStaff(interaction.member)) return interaction.editReply({ content: "❌ Solo el staff puede reclamar tickets." });

      // Lock permissions: only claimer + original user can write
      await interaction.channel.permissionOverwrites.set([
        { id: interaction.guild.roles.everyone.id, deny: ["ViewChannel"] },
        { id: ticketData.userId, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks"] },
        { id: interaction.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks"] },
        { id: client.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageChannels", "ManageMessages"] },
      ]);

      // Staff role read-only
      const srId2 = getGuildConfig(interaction.guild.id).staffRoleId;
      const staffRole2 = srId2 ? interaction.guild.roles.cache.get(srId2) : null;
      if (staffRole2) {
        await interaction.channel.permissionOverwrites.edit(staffRole2, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });
      }

      ticketData.claimedBy = interaction.user.id;
      openTickets.set(interaction.channel.id, ticketData);
      saveTickets();

      await interaction.editReply({ content: `✅ Ticket reclamado por <@${interaction.user.id}>. Solo tú y el usuario original pueden escribir. Usa \`/ticket agregar @usuario\` para dar permiso a otro staff.` });
      return;
    }

    // ===== TICKET CLOSE =====
    if (interaction.isButton() && interaction.customId === "ticket_close") {
      await interaction.deferReply();
      const ticketData = openTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.editReply({ content: "❌ Ticket no encontrado." });
      if (ticketData.closed) return interaction.editReply({ content: "⚠️ Este ticket ya está cerrado." });

      // Only directivos or the ticket opener can close
      if (!isDirectivos(interaction.member) && ticketData.userId !== interaction.user.id) {
        return interaction.editReply({ content: "❌ Solo un **Directivo** o el usuario que creó el ticket puede cerrarlo." });
      }

      try {
        const done = await closeTicketCore(interaction.guild, interaction.channel, ticketData, interaction.user);
        await interaction.editReply({ embeds: [done.embed], components: done.components });
      } catch {
        await interaction.editReply({ content: "🔒 Ticket cerrado. Transcript guardado." });
      }
      return;
    }

    // ===== TICKET REOPEN =====
    if (interaction.isButton() && interaction.customId === "ticket_reopen") {
      await interaction.deferReply();
      const ticketData = openTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.editReply({ content: "❌ Ticket no encontrado." });
      if (!ticketData.closed) return interaction.editReply({ content: "⚠️ Este ticket no está cerrado." });
      if (!isStaff(interaction.member) && ticketData.userId !== interaction.user.id) {
        return interaction.editReply({ content: "❌ Solo el staff o el autor puede reabrirlo." });
      }
      try {
        const gcRe = getGuildConfig(interaction.guild.id);
        // Volver a la categoría de tickets abiertos
        if (gcRe.ticketCategoryId) {
          await interaction.channel.setParent(gcRe.ticketCategoryId).catch(() => {});
        }
        await interaction.channel.setName(interaction.channel.name.replace(/^cerrado-/, ""));
        // Restaurar permisos: autor + staff + bot
        await interaction.channel.permissionOverwrites.edit(ticketData.userId, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true,
        }).catch(() => {});
        const staffRole = gcRe.staffRoleId ? interaction.guild.roles.cache.get(gcRe.staffRoleId) : null;
        if (staffRole) {
          await interaction.channel.permissionOverwrites.edit(staffRole, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
        }
        // Devolver el rol de ticket al autor
        try {
          const ticketRole = gcRe.ticketRoleId ? interaction.guild.roles.cache.get(gcRe.ticketRoleId) : null;
          if (ticketRole) {
            const member = await interaction.guild.members.fetch(ticketData.userId).catch(() => null);
            if (member) await member.roles.add(ticketRole).catch(() => {});
          }
        } catch {}
        ticketData.closed = false;
        delete ticketData.closedBy;
        delete ticketData.closedAt;
        openTickets.set(interaction.channel.id, ticketData);
        saveTickets();
        const ticketBtns = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_claim").setLabel("🙋 Reclamar").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Cerrar").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("ticket_delete").setLabel("🗑️ Borrar").setStyle(ButtonStyle.Secondary),
        );
        await interaction.editReply({ content: `🔓 Ticket reabierto por <@${interaction.user.id}>.`, components: [ticketBtns] });
      } catch {
        await interaction.editReply({ content: "❌ No se pudo reabrir." });
      }
      return;
    }

    // ===== TICKET DELETE =====
    if (interaction.isButton() && interaction.customId === "ticket_delete") {
      await interaction.deferReply();
      const ticketData = openTickets.get(interaction.channel.id);
      const chName = (interaction.channel && interaction.channel.name) || "";
      const looksLikeTicket = !!ticketData || chName.startsWith("cerrado-") || /^(gen|bug|rep|tienda|pass|apel|rstaff|ali|ticket)-/i.test(chName);
      if (!looksLikeTicket) return interaction.editReply({ content: "❌ Ticket no encontrado." });

      // Only directivos can delete
      if (!isDirectivos(interaction.member)) {
        return interaction.editReply({ content: "❌ Solo un **Directivo** puede borrar tickets." });
      }

      // Exigir cierre previo
      if (ticketData && !ticketData.closed) {
        return interaction.editReply({ content: "⚠️ Cierra el ticket primero con 🔒 **Cerrar** antes de borrarlo." });
      }

      const transcript = [];
      let messages;
      try { messages = await interaction.channel.messages.fetch({ limit: 100 }); } catch { messages = new Map(); }
      messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).forEach(m => {
        transcript.push(`[${new Date(m.createdTimestamp).toLocaleString("es-ES")}] ${m.author.tag}: ${m.content}`);
      });

      const fs = require("fs");
      const transcriptFile = `${__dirname}/Tickets/transcript-${interaction.channel.id}.txt`;
      try {
        if (!fs.existsSync(__dirname + "/Tickets")) fs.mkdirSync(__dirname + "/Tickets", { recursive: true });
        fs.writeFileSync(transcriptFile, transcript.join("\n"));
        try {
          fs.writeFileSync(`${__dirname}/Tickets/transcript-${interaction.channel.id}.html`, buildHtmlTranscript(messages, interaction.channel, ticketData));
        } catch {}
      } catch {}

      // Transcript al canal configurable (también al borrar)
      await sendTicketTranscript(interaction.guild, interaction.channel, ticketData, `<@${interaction.user.id}>`);

      openTickets.delete(interaction.channel.id);
      saveTickets();

      // Remove ticket role (solo si no tiene otros tickets abiertos)
      try {
        const stillOpen = ticketData ? [...openTickets.values()].some(t => t.userId === ticketData.userId && !t.closed) : false;
        const ticketRole = interaction.guild.roles.cache.get(getGuildConfig(interaction.guild.id).ticketRoleId || "");
        if (ticketRole && ticketData && ticketData.userId && !stillOpen) {
          const member = await interaction.guild.members.fetch(ticketData.userId).catch(() => null);
          if (member) await member.roles.remove(ticketRole).catch(() => {});
        }
      } catch {}

      await interaction.editReply({ content: "🗑️ Ticket borrado. Transcript guardado. Este canal se eliminará en 5 segundos..." });
      setTimeout(() => { interaction.channel.delete().catch(() => {}); }, 5000);
      return;
    }

    // ===== TICKET ADD STAFF BUTTON =====
    if (interaction.isButton() && interaction.customId === "ticket_add_staff") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede agregar miembros.", flags: MessageFlags.Ephemeral });
      const ticketData = openTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: "❌ Este canal no es un ticket abierto.", flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder()
        .setCustomId("ticket_modal_staff")
        .setTitle("👤 Agregar Staff al Ticket");
      const input = new TextInputBuilder()
        .setCustomId("staff_input")
        .setLabel("Menciona al staff (@usuario)")
        .setPlaceholder("Ejemplo: @sdainetprrr")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    }

    // ===== TICKET QUESTIONS MODAL SUBMIT =====
    if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_q|")) {
      const parts = interaction.customId.split("|");
      const categoryId = parts[2];
      const catData = ticketCats(interaction.guild.id).find(c => (c.id || c.value) === categoryId);
      if (!catData) return interaction.reply({ content: "❌ Categoría no encontrada.", flags: MessageFlags.Ephemeral });
      const respuestas = {};
      (catData.questions || []).forEach((q, idx) => {
        try { respuestas[q] = interaction.fields.getTextInputValue("q" + idx).slice(0, 500); } catch {}
      });
      return crearTicket(interaction, catData, respuestas);
    }

    // ===== TICKET ADD STAFF MODAL SUBMIT =====
    if (interaction.isModalSubmit() && interaction.customId === "ticket_modal_staff") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      const ticketData = openTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: "❌ Este canal no es un ticket abierto.", flags: MessageFlags.Ephemeral });

      const raw = interaction.fields.getTextInputValue("staff_input");
      const match = raw.match(/<@!?(\d+)>/);
      if (!match) return interaction.reply({ content: "❌ Debes mencionar a un usuario válido con @.", flags: MessageFlags.Ephemeral });

      const staffId = match[1];
      try {
        await interaction.channel.permissionOverwrites.edit(staffId, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
        });
        await interaction.reply({ content: `✅ <@${staffId}> ahora tiene permisos de escritura en este ticket.` });
      } catch {
        await interaction.reply({ content: "❌ No se pudieron actualizar los permisos.", flags: MessageFlags.Ephemeral });
      }
    }

    // ===== TICKET ADD USER BUTTON =====
    if (interaction.isButton() && interaction.customId === "ticket_add_user") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede agregar usuarios.", flags: MessageFlags.Ephemeral });
      const ticketData = openTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: "❌ Este canal no es un ticket abierto.", flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder()
        .setCustomId("ticket_modal_user")
        .setTitle("➕ Agregar Usuario al Ticket");
      const input = new TextInputBuilder()
        .setCustomId("user_input")
        .setLabel("Menciona al usuario (@usuario)")
        .setPlaceholder("Ejemplo: @sdainetprrr")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
    }

    // ===== TICKET ADD USER MODAL SUBMIT =====
    if (interaction.isModalSubmit() && interaction.customId === "ticket_modal_user") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      const ticketData = openTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: "❌ Este canal no es un ticket abierto.", flags: MessageFlags.Ephemeral });

      const raw = interaction.fields.getTextInputValue("user_input");
      const match = raw.match(/<@!?(\d+)>/);
      if (!match) return interaction.reply({ content: "❌ Debes mencionar a un usuario válido con @.", flags: MessageFlags.Ephemeral });

      const userId = match[1];
      try {
        await interaction.channel.permissionOverwrites.edit(userId, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true,
        });
        await interaction.reply({ content: `✅ <@${userId}> agregado al ticket.` });
      } catch {
        await interaction.reply({ content: "❌ No se pudieron actualizar los permisos.", flags: MessageFlags.Ephemeral });
      }
    }

    // ===== TICKET COMMANDS (grupo /ticket) =====
    if (interaction.commandName === "ticket") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff puede usar este comando.", flags: MessageFlags.Ephemeral });
      const tsub = interaction.options.getSubcommand();
      const tcmd = { cerrar: "cerrar", reclamar: "reclamar", renombrar: "renombrar", escribir: "ticket-escribir", agregar: "ticket-add" }[tsub] || tsub;

      const ticketData = openTickets.get(interaction.channel.id);
      if (!ticketData) return interaction.reply({ content: "❌ Este canal no es un ticket abierto.", flags: MessageFlags.Ephemeral });
      if (ticketData.closed && tcmd !== "cerrar") {
        return interaction.reply({ content: "⚠️ Ticket cerrado. Reábrelo primero o bórralo.", flags: MessageFlags.Ephemeral });
      }

      // /cerrar
      if (tcmd === "cerrar") {
        if (!isDirectivos(interaction.member) && ticketData.userId !== interaction.user.id) {
          return interaction.reply({ content: "❌ Solo un **Directivo** o el usuario que creó el ticket puede cerrarlo.", flags: MessageFlags.Ephemeral });
        }
        if (ticketData.closed) return interaction.reply({ content: "⚠️ Este ticket ya está cerrado.", flags: MessageFlags.Ephemeral });

        try {
          const done = await closeTicketCore(interaction.guild, interaction.channel, ticketData, interaction.user);
          await interaction.reply({ embeds: [done.embed], components: done.components });
        } catch {
          await interaction.reply({ content: "🔒 Ticket cerrado. Transcript guardado." });
        }
        return;
      }

      // /reclamar
      if (tcmd === "reclamar") {
        const memberUser = await interaction.guild.members.fetch(ticketData.userId).catch(() => null);

        await interaction.channel.permissionOverwrites.set([
          { id: interaction.guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: ticketData.userId, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
          { id: interaction.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
          { id: client.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageChannels", "ManageMessages"] },
        ]);

        // Add staff role as read-only
        const srid3 = getGuildConfig(interaction.guild.id).staffRoleId;
        const staffRole3 = srid3 ? interaction.guild.roles.cache.get(srid3) : null;
        if (staffRole3) {
          await interaction.channel.permissionOverwrites.edit(staffRole3, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });
        }

        ticketData.claimedBy = interaction.user.id;
        openTickets.set(interaction.channel.id, ticketData);
        saveTickets();

        await interaction.reply({ content: `✅ Ticket reclamado por <@${interaction.user.id}>. Solo tú y <@${ticketData.userId}> pueden escribir. El resto del staff puede ver pero no escribir.` });
        return;
      }

      // /renombrar
      if (tcmd === "renombrar") {
        const newName = interaction.options.getString("nombre").toLowerCase().replace(/[^a-z0-9\-]/g, "");
        if (newName.length < 2 || newName.length > 32) return interaction.reply({ content: "❌ El nombre debe tener entre 2 y 32 caracteres (solo letras, números y guiones).", flags: MessageFlags.Ephemeral });

        const oldName = interaction.channel.name;
        await interaction.channel.setName(newName);
        await interaction.reply({ content: `✅ Canal renombrado: **${oldName}** → **${newName}**` });
        return;
      }

      // /ticket-escribir
      if (tcmd === "ticket-escribir") {
        if (!ticketData.claimedBy || ticketData.claimedBy !== interaction.user.id) {
          return interaction.reply({ content: "❌ Solo el staff que reclamó el ticket puede dar permiso de escritura.", flags: MessageFlags.Ephemeral });
        }

        const targetStaff = interaction.options.getUser("staff");
        await interaction.channel.permissionOverwrites.edit(targetStaff.id, { SendMessages: true, ViewChannel: true, ReadMessageHistory: true });

        await interaction.reply({ content: `✅ <@${targetStaff.id}> ahora puede escribir en este ticket.` });
        return;
      }

      // /ticket-add
      if (tcmd === "ticket-add") {
        const targetUser = interaction.options.getUser("usuario");
        await interaction.channel.permissionOverwrites.edit(targetUser.id, { SendMessages: true, ViewChannel: true, ReadMessageHistory: true });

        await interaction.reply({ content: `✅ <@${targetUser.id}> agregado al ticket.` });
        return;
      }
    }

    // ============== MODERATION / UTILITY / MINECRAFT / EVENTS ==============

    // ===== LOCK =====
    if (interaction.commandName === "lock") {
      if (!canUseModCommand(interaction.member, "lock")) return interaction.reply({ content: noPermMsg(interaction.member, "lock"), flags: MessageFlags.Ephemeral });
      try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { SendMessages: false });
        const embed = new EmbedBuilder().setTitle("🔒 Canal Bloqueado").setDescription(`Bloqueado por <@${interaction.user.id}>.\nAhora nadie puede escribir en este canal.`).setColor(0xff0000).setTimestamp();
        await interaction.reply({ embeds: [embed] });
      } catch { await interaction.reply({ content: "❌ No se pudo bloquear el canal.", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== UNLOCK =====
    if (interaction.commandName === "unlock") {
      if (!canUseModCommand(interaction.member, "unlock")) return interaction.reply({ content: noPermMsg(interaction.member, "unlock"), flags: MessageFlags.Ephemeral });
      try {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { SendMessages: true });
        const embed = new EmbedBuilder().setTitle("🔓 Canal Desbloqueado").setDescription(`Desbloqueado por <@${interaction.user.id}>.\nAhora todos pueden escribir.`).setColor(0x00ff00).setTimestamp();
        await interaction.reply({ embeds: [embed] });
      } catch { await interaction.reply({ content: "❌ No se pudo desbloquear el canal.", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== TIMEOUT =====
    if (interaction.commandName === "timeout") {
      if (!canUseModCommand(interaction.member, "timeout")) return interaction.reply({ content: noPermMsg(interaction.member, "timeout"), flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario");
      const minutos = interaction.options.getInteger("minutos");
      if (minutos < 1 || minutos > 40320) return interaction.reply({ content: "❌ Minutos entre 1 y 40320 (28 días).", flags: MessageFlags.Ephemeral });
      try {
        const member = await interaction.guild.members.fetch(target.id);
        await member.timeout(minutos * 60 * 1000, `Timeout por ${interaction.user.tag}`);
        const embed = new EmbedBuilder().setTitle("🔇 Usuario Silenciado").setDescription(`<@${target.id}> silenciado por **${minutos}** minutos.\nModerador: <@${interaction.user.id}>`).setColor(0xffa500).setTimestamp();
        await interaction.reply({ embeds: [embed] });
      } catch { await interaction.reply({ content: "❌ No se pudo silenciar al usuario.", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== BAN (permanente, registra caso) =====
    if (interaction.commandName === "ban") {
      if (!canUseModCommand(interaction.member, "ban")) return interaction.reply({ content: noPermMsg(interaction.member, "ban"), flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario");
      const reason = (interaction.options.getString("razon") || "Sin razón").slice(0, 400);
      const delDays = interaction.options.getInteger("borrar_dias") || 0;
      if (target.id === interaction.user.id) return interaction.reply({ content: "❌ No puedes banearte a ti mismo.", flags: MessageFlags.Ephemeral });
      if (target.id === client.user.id) return interaction.reply({ content: "❌ No puedo banearme a mí mismo.", flags: MessageFlags.Ephemeral });
      try {
        await interaction.guild.members.ban(target.id, { reason: `${reason} (por ${interaction.user.tag})`.slice(0, 512), deleteMessageSeconds: delDays * 86400 });
        const c = {
          id: `CASE-${(db.miscGet(`sanctionCounter_${interaction.guildId}`, 0) || 0) + 1}`,
          guildId: interaction.guildId, userId: target.id, userTag: target.tag,
          type: "ban", reason, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag,
          createdAt: Date.now(), expiresAt: 0, durationMs: 0, active: true,
        };
        db.miscSet(`sanctionCounter_${interaction.guildId}`, parseInt(c.id.split("-")[1]));
        sanctions.set(`${c.guildId}:${c.id}`, c);
        saveSanction(c);
        sancLog(interaction.guildId, "ban", "🔨 Baneo permanente", `**Caso:** ${c.id}\n**Usuario:** <@${target.id}> (${target.tag})\n**Razón:** ${reason}\n**Moderador:** <@${interaction.user.id}>`);
        const embed = new EmbedBuilder().setTitle("🔨 Usuario Baneado").setDescription(`<@${target.id}> baneado permanentemente.\n**Caso:** ${c.id}\n**Razón:** ${reason}\nModerador: <@${interaction.user.id}>`).setColor(0xff0000).setTimestamp();
        await interaction.reply({ embeds: [embed] });
        sanctionNotice(interaction.guildId, { userId: target.id, tag: target.tag, type: "ban", reason, evidence: false, moderatorTag: interaction.user.tag, caseId: c.id, source: "/ban" });
      } catch { await interaction.reply({ content: "❌ No se pudo banear (¿jerarquía de roles o permisos?).", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== TEMPBAN (auto-unban, registra caso) =====
    if (interaction.commandName === "tempban") {
      if (!canUseModCommand(interaction.member, "tempban")) return interaction.reply({ content: noPermMsg(interaction.member, "tempban"), flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario");
      const durStr = interaction.options.getString("duracion");
      const reason = (interaction.options.getString("razon") || "Sin razón").slice(0, 400);
      const ms = parseDurationStr(durStr);
      if (!ms) return interaction.reply({ content: "❌ Duración inválida. Usa: `10m`, `2h`, `7d` (máx 365d).", flags: MessageFlags.Ephemeral });
      if (target.id === interaction.user.id) return interaction.reply({ content: "❌ No puedes banearte a ti mismo.", flags: MessageFlags.Ephemeral });
      try {
        const c = await applyBanCase(interaction.guild, { userId: target.id, userTag: target.tag, type: "tempban", durationMs: ms, reason, moderator: interaction.user });
        const embed = new EmbedBuilder().setTitle("⏳ Baneo Temporal").setDescription(`<@${target.id}> baneado por **${fmtDuration(ms)}**.\n**Caso:** ${c.id}\n**Razón:** ${reason}\nModerador: <@${interaction.user.id}>`).setColor(0xffa500).setTimestamp();
        await interaction.reply({ embeds: [embed] });
      } catch { await interaction.reply({ content: "❌ No se pudo banear (¿jerarquía de roles o permisos?).", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== UNBAN (cierra caso) =====
    if (interaction.commandName === "unban") {
      if (!canUseModCommand(interaction.member, "unban")) return interaction.reply({ content: noPermMsg(interaction.member, "unban"), flags: MessageFlags.Ephemeral });
      const ref = interaction.options.getString("usuario");
      const reason = (interaction.options.getString("razon") || "Sin razón").slice(0, 400);
      const userId = /^\d{17,20}$/.test(ref) ? ref : (findSanction(interaction.guildId, ref)?.userId || ref);
      try {
        await interaction.guild.members.unban(userId, `${reason} (por ${interaction.user.tag})`.slice(0, 512));
        const s = findSanction(interaction.guildId, ref) || [...sanctions.values()].find(x => x.guildId === interaction.guildId && x.userId === userId && x.active);
        if (s) { s.active = false; saveSanction(s); }
        sancLog(interaction.guildId, (s && s.type) || "ban", "✅ Desbaneo", `**Usuario:** <@${userId}>\n**Caso:** ${s ? s.id : "—"}\n**Razón:** ${reason}\n**Moderador:** <@${interaction.user.id}>`);
        await interaction.reply({ content: `✅ <@${userId}> desbaneado.${s ? ` Caso ${s.id} cerrado.` : ""}` });
      } catch { await interaction.reply({ content: "❌ No se pudo desbanear (¿está baneado?).", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== KICK =====
    if (interaction.commandName === "kick") {
      if (!canUseModCommand(interaction.member, "kick")) return interaction.reply({ content: noPermMsg(interaction.member, "kick"), flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario");
      const reason = (interaction.options.getString("razon") || "Sin razón").slice(0, 400);
      if (target.id === interaction.user.id) return interaction.reply({ content: "❌ No puedes expulsarte.", flags: MessageFlags.Ephemeral });
      try {
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: "❌ No está en el servidor.", flags: MessageFlags.Ephemeral });
        await member.kick(`${reason} (por ${interaction.user.tag})`.slice(0, 512));
        modLog(interaction.guildId, "👢 Expulsión", `**Usuario:** <@${target.id}> (${target.tag})\n**Razón:** ${reason}\n**Moderador:** <@${interaction.user.id}>`);
        await interaction.reply({ content: `✅ <@${target.id}> expulsado. Razón: ${reason}` });
      } catch { await interaction.reply({ content: "❌ No se pudo expulsar (¿jerarquía o permisos?).", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== SOFTBAN (banea + desbanea: limpia mensajes) =====
    if (interaction.commandName === "softban") {
      if (!canUseModCommand(interaction.member, "softban")) return interaction.reply({ content: noPermMsg(interaction.member, "softban"), flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario");
      const reason = (interaction.options.getString("razon") || "Sin razón").slice(0, 400);
      const delDays = interaction.options.getInteger("borrar_dias") ?? 1;
      if (target.id === interaction.user.id) return interaction.reply({ content: "❌ No puedes hacerlo contigo.", flags: MessageFlags.Ephemeral });
      try {
        await interaction.guild.members.ban(target.id, { reason: `Softban: ${reason} (por ${interaction.user.tag})`.slice(0, 512), deleteMessageSeconds: delDays * 86400 });
        await interaction.guild.members.unban(target.id, "Softban: fin limpieza").catch(() => {});
        modLog(interaction.guildId, "🧹 Softban", `**Usuario:** <@${target.id}> (${target.tag})\n**Razón:** ${reason}\n**Mensajes borrados:** ${delDays}d\n**Moderador:** <@${interaction.user.id}>`);
        await interaction.reply({ content: `✅ Softban a <@${target.id}>: mensajes de ${delDays}d eliminados.` });
      } catch { await interaction.reply({ content: "❌ No se pudo (¿jerarquía o permisos?).", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== WARN (registra caso WARN-n) =====
    if (interaction.commandName === "warn") {
      if (!canUseModCommand(interaction.member, "warn")) return interaction.reply({ content: noPermMsg(interaction.member, "warn"), flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario");
      const reason = (interaction.options.getString("razon") || "Sin razón").slice(0, 400);
      if (target.bot) return interaction.reply({ content: "❌ No puedes advertir a un bot.", flags: MessageFlags.Ephemeral });
      const ck = `warnCounter_${interaction.guildId}`;
      const n = (db.miscGet(ck, 0) || 0) + 1;
      db.miscSet(ck, n);
      const w = {
        id: `WARN-${n}`, guildId: interaction.guildId, userId: target.id, userTag: target.tag,
        type: "warn", reason, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag,
        createdAt: Date.now(), expiresAt: 0, durationMs: 0, active: true,
      };
      sanctions.set(`${w.guildId}:${w.id}`, w);
      saveSanction(w);
      sancLog(interaction.guildId, "warn", "⚠️ Advertencia", `**Caso:** ${w.id}\n**Usuario:** <@${target.id}> (${target.tag})\n**Razón:** ${reason}\n**Moderador:** <@${interaction.user.id}>`);
      try { await target.send(`⚠️ Recibiste una advertencia en **${interaction.guild.name}**.\n**Razón:** ${reason}\n**Caso:** ${w.id}`).catch(() => {}); } catch {}
      const total = [...sanctions.values()].filter(x => x.guildId === interaction.guildId && x.userId === target.id && x.type === "warn" && x.active).length;
      let heatInfo = "";
      const hcfgWarn = heatCfg(interaction.guildId);
      if (hcfgWarn.enabled && hcfgWarn.onWarn) {
        const tMember = await interaction.guild.members.fetch(target.id).catch(() => null);
        const hres = tMember ? await heatEscalate(tMember, `warn de ${interaction.user.tag}: ${reason}`, "warn") : null;
        if (hres) heatInfo = hres.applied ? ` · 🔥 heat ${hres.points} → **${hres.applied.action}**` : ` · 🔥 heat ${hres.points}`;
      }
      await interaction.reply({ content: `✅ <@${target.id}> advertido (${w.id}). Lleva **${total}** warn(s) activos.${heatInfo}` });
      return;
    }

    // ===== WARNS (ver) =====
    if (interaction.commandName === "warns") {
      if (!canUseModCommand(interaction.member, "warns")) return interaction.reply({ content: noPermMsg(interaction.member, "warns"), flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario") || interaction.user;
      const list = [...sanctions.values()].filter(x => x.guildId === interaction.guildId && x.userId === target.id && x.type === "warn" && x.active)
        .sort((a, b) => b.createdAt - a.createdAt);
      if (!list.length) return interaction.reply({ content: `✅ <@${target.id}> no tiene warns activos.`, flags: MessageFlags.Ephemeral });
      const desc = list.map(w => `**${w.id}** — ${w.reason}\n└ por ${w.moderatorTag} • <t:${Math.floor(w.createdAt / 1000)}:R>`).join("\n").slice(0, 4000);
      const embed = new EmbedBuilder().setTitle(`⚠️ Warns de ${target.tag} (${list.length})`).setDescription(desc).setColor(0xFFA500).setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ===== DELWARN =====
    if (interaction.commandName === "delwarn") {
      if (!canUseModCommand(interaction.member, "delwarn")) return interaction.reply({ content: noPermMsg(interaction.member, "delwarn"), flags: MessageFlags.Ephemeral });
      const ref = interaction.options.getString("caso");
      const w = sanctions.get(`${interaction.guildId}:${String(ref).toUpperCase()}`);
      if (!w || w.type !== "warn") return interaction.reply({ content: "❌ Caso no encontrado (usa WARN-n).", flags: MessageFlags.Ephemeral });
      sanctions.delete(`${w.guildId}:${w.id}`);
      try { db.delSanction(w.guildId, w.id); } catch {}
      sancLog(interaction.guildId, "warn", "🧹 Warn retirado", `**Caso:** ${w.id}\n**Usuario:** <@${w.userId}>\n**Moderador:** <@${interaction.user.id}>`);
      return interaction.reply({ content: `✅ Warn **${w.id}** retirado a <@${w.userId}>.`, flags: MessageFlags.Ephemeral });
    }

    // ===== PURGE (con filtro) =====
    if (interaction.commandName === "purge") {
      if (!canUseModCommand(interaction.member, "purge")) return interaction.reply({ content: noPermMsg(interaction.member, "purge"), flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const amount = interaction.options.getInteger("cantidad");
      const user = interaction.options.getUser("usuario");
      const text = (interaction.options.getString("texto") || "").toLowerCase();
      try {
        let fetched = await interaction.channel.messages.fetch({ limit: 100 });
        let arr = [...fetched.values()].filter(m => (Date.now() - m.createdTimestamp) < 14 * 86400000);
        if (user) arr = arr.filter(m => m.author.id === user.id);
        if (text) arr = arr.filter(m => (m.content || "").toLowerCase().includes(text));
        arr = arr.slice(0, amount);
        let deleted = 0;
        for (const m of arr) { try { await m.delete(); deleted++; } catch {} }
        modLog(interaction.guildId, "🧹 Purga", `**Canal:** <#${interaction.channelId}>\n**Borrados:** ${deleted}${user ? `\n**Usuario:** <@${user.id}>` : ""}${text ? `\n**Filtro:** "${text}"` : ""}\n**Moderador:** <@${interaction.user.id}>`);
        return interaction.editReply({ content: `✅ Eliminados **${deleted}** mensajes.` });
      } catch { return interaction.editReply({ content: "❌ No se pudo purgar." }); }
    }

    // ===== SETNICK =====
    if (interaction.commandName === "setnick") {
      if (!canUseModCommand(interaction.member, "setnick")) return interaction.reply({ content: noPermMsg(interaction.member, "setnick"), flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario");
      const nick = (interaction.options.getString("nick") || "").slice(0, 32);
      try {
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) return interaction.reply({ content: "❌ No está en el servidor.", flags: MessageFlags.Ephemeral });
        await member.setNickname(nick || null, `Setnick por ${interaction.user.tag}`);
        return interaction.reply({ content: nick ? `✅ Apodo de <@${target.id}> → **${nick}**.` : `✅ Apodo de <@${target.id}> restablecido.` });
      } catch { await interaction.reply({ content: "❌ No se pudo (¿jerarquía o es el dueño?).", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== VMUTE (toggle mute de voz) =====
    if (interaction.commandName === "vmute") {
      if (!canUseModCommand(interaction.member, "vmute")) return interaction.reply({ content: noPermMsg(interaction.member, "vmute"), flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario");
      try {
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member || !member.voice.channel) return interaction.reply({ content: "❌ No está en un canal de voz.", flags: MessageFlags.Ephemeral });
        const to = !member.voice.serverMute;
        await member.voice.setMute(to, `Vmute por ${interaction.user.tag}`);
        modLog(interaction.guildId, to ? "🔇 Voice mute" : "🔊 Voice unmute", `**Usuario:** <@${target.id}>\n**Moderador:** <@${interaction.user.id}>`);
        return interaction.reply({ content: to ? `✅ <@${target.id}> muteado en voz.` : `✅ <@${target.id}> desmuteado en voz.` });
      } catch { await interaction.reply({ content: "❌ No se pudo (¿permisos de voz?).", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== VOCKICK (desconectar de voz) =====
    if (interaction.commandName === "vockick") {
      if (!canUseModCommand(interaction.member, "vockick")) return interaction.reply({ content: noPermMsg(interaction.member, "vockick"), flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario");
      const reason = (interaction.options.getString("razon") || "Sin razón").slice(0, 400);
      try {
        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member || !member.voice.channel) return interaction.reply({ content: "❌ No está en un canal de voz.", flags: MessageFlags.Ephemeral });
        await member.voice.disconnect(`Desconectado por ${interaction.user.tag}: ${reason}`);
        modLog(interaction.guildId, "📢 Voice kick", `**Usuario:** <@${target.id}>\n**Razón:** ${reason}\n**Moderador:** <@${interaction.user.id}>`);
        return interaction.reply({ content: `✅ <@${target.id}> desconectado de voz.` });
      } catch { await interaction.reply({ content: "❌ No se pudo (¿permisos de voz?).", flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ===== RECORDATORIO =====
    if (interaction.commandName === "recordatorio") {
      const tiempo = interaction.options.getString("tiempo");
      const mensaje = interaction.options.getString("mensaje");
      const match = tiempo.match(/^(\d+)(m|h|d)$/);
      if (!match) return interaction.reply({ content: "❌ Formato inválido. Usa: `10m`, `2h`, `1d`.", flags: MessageFlags.Ephemeral });
      const num = parseInt(match[1]);
      const unit = match[2];
      const ms = unit === "m" ? num * 60000 : unit === "h" ? num * 3600000 : num * 86400000;
      if (ms > 2592000000) return interaction.reply({ content: "❌ Máximo 30 días.", flags: MessageFlags.Ephemeral });
      await interaction.reply({ content: `✅ Te recordaré en **${tiempo}**: "${mensaje}" por DM.` });
      setTimeout(async () => {
        try {
          await interaction.user.send({ embeds: [new EmbedBuilder().setTitle("⏰ Recordatorio").setDescription(mensaje).setColor(0x5865f2).setTimestamp()] });
        } catch {}
      }, ms);
      return;
    }

    // ===== CLIMA =====
    if (interaction.commandName === "clima") {
      await interaction.deferReply();
      const ciudad = interaction.options.getString("ciudad");
      try {
        const res = await fetch(`https://wttr.in/${encodeURIComponent(ciudad)}?format=j1`);
        const data = await res.json();
        const c = data.current_condition?.[0];
        if (!c) return interaction.editReply({ content: "❌ No encontré datos para esa ciudad." });
        const tempC = c.temp_C;
        const feelsLike = c.FeelsLikeC;
        const humidity = c.humidity;
        const wind = c.windspeedKmph;
        const desc = c.weatherDesc?.[0]?.value || "N/A";
        const country = data.nearest_area?.[0]?.country?.[0]?.value || "";
        const city = data.nearest_area?.[0]?.areaName?.[0]?.value || ciudad;
        const weatherEmoji = desc.toLowerCase().includes("sunny") ? "☀️" : desc.toLowerCase().includes("cloud") ? "☁️" : desc.toLowerCase().includes("rain") ? "🌧️" : desc.toLowerCase().includes("snow") ? "❄️" : desc.toLowerCase().includes("thunder") ? "⛈️" : "🌤️";
        const embed = new EmbedBuilder()
          .setTitle(`${weatherEmoji} Clima en ${city}, ${country}`)
          .setDescription(`**${desc}**`)
          .addFields(
            { name: "🌡️ Temperatura", value: `${tempC}°C`, inline: true },
            { name: "🤔 Sensación", value: `${feelsLike}°C`, inline: true },
            { name: "💧 Humedad", value: `${humidity}%`, inline: true },
            { name: "💨 Viento", value: `${wind} km/h`, inline: true },
          )
          .setColor(0x5865f2)
          .setFooter({ text: "Datos de wttr.in" })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch { await interaction.editReply({ content: "❌ Error al obtener el clima." }); }
      return;
    }

    // ===== TRADUCIR =====
    if (interaction.commandName === "traducir") {
      await interaction.deferReply();
      const texto = interaction.options.getString("texto");
      const idioma = interaction.options.getString("idioma");
      try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(texto)}&langpair=es|${idioma}`);
        const data = await res.json();
        const traduccion = data.responseData?.translatedText;
        if (!traduccion) return interaction.editReply({ content: "❌ No pude traducir el texto." });
        const embed = new EmbedBuilder()
          .setTitle("🌐 Traducción")
          .addFields(
            { name: "🇪🇸 Original", value: texto },
            { name: `🌍 ${idioma.toUpperCase()}`, value: traduccion },
          )
          .setColor(0x5865f2)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch { await interaction.editReply({ content: "❌ Error al traducir." }); }
      return;
    }

    // ===== SKIN =====
    if (interaction.commandName === "skin") {
      await interaction.deferReply();
      const jugador = interaction.options.getString("jugador");
      try {
        const skinUrl = `https://mc-heads.net/body/${encodeURIComponent(jugador)}/512`;
        const avatarUrl = `https://mc-heads.net/avatar/${encodeURIComponent(jugador)}/128`;
        const embed = new EmbedBuilder()
          .setTitle(`🎨 Skin de ${jugador}`)
          .setImage(skinUrl)
          .setThumbnail(avatarUrl)
          .setColor(0x5865f2)
          .setFooter({ text: "Hydra Studio • Minecraft" })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch { await interaction.editReply({ content: "❌ No pude obtener la skin." }); }
      return;
    }

    // ===== MCPROFILE =====
    if (interaction.commandName === "mcprofile") {
      await interaction.deferReply();
      const jugador = interaction.options.getString("jugador");
      try {
        const uuidRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(jugador)}`);
        if (!uuidRes.ok) return interaction.editReply({ content: `❌ No encontré al jugador **${jugador}**.` });
        const uuidData = await uuidRes.json();
        const uuid = uuidData.id;
        const name = uuidData.name;
        const profileRes = await fetch(`https://api.mojang.com/user/profiles/${uuid}/name`);
        let skinUrl = `https://mc-heads.net/body/${encodeURIComponent(name)}/512`;
        let avatarUrl = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/256`;
        const embed = new EmbedBuilder()
          .setTitle(`👤 Perfil de ${name}`)
          .setThumbnail(avatarUrl)
          .addFields(
            { name: "📛 Nombre", value: name, inline: true },
            { name: "🆔 UUID", value: uuid, inline: true },
          )
          .setImage(skinUrl)
          .setColor(0x5865f2)
          .setFooter({ text: "Hydra Studio • Minecraft" })
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
      } catch { await interaction.editReply({ content: "❌ Error al obtener el perfil." }); }
      return;
    }

    // ===== CUENTA REGRESIVA =====
    if (interaction.commandName === "cuenta-regresiva") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      const nombre = interaction.options.getString("nombre");
      const fecha = interaction.options.getString("fecha");
      const hora = interaction.options.getString("hora");
      const targetDate = new Date(`${fecha}T${hora}:00`);
      if (isNaN(targetDate.getTime())) return interaction.reply({ content: "❌ Formato de fecha inválido. Usa YYYY-MM-DD y HH:MM.", flags: MessageFlags.Ephemeral });
      const now = new Date();
      if (targetDate <= now) return interaction.reply({ content: "❌ La fecha ya pasó.", flags: MessageFlags.Ephemeral });

      const diff = targetDate - now;
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      const embed = new EmbedBuilder()
        .setTitle(`⏳ Cuenta Regresiva — ${nombre}`)
        .setDescription(`El evento comienza en:`)
        .addFields(
          { name: "📅 Días", value: `${days}`, inline: true },
          { name: "⏰ Horas", value: `${hours}`, inline: true },
          { name: "⏱️ Minutos", value: `${minutes}`, inline: true },
          { name: "⌛ Segundos", value: `${seconds}`, inline: true },
        )
        .setColor(0x5865f2)
        .setFooter({ text: `${fecha} a las ${hora}` })
        .setTimestamp();

      const msg = await interaction.reply({ embeds: [embed], fetchReply: true });

      // Update every 10 seconds
      const interval = setInterval(async () => {
        const now2 = new Date();
        if (now2 >= targetDate) {
          clearInterval(interval);
          const doneEmbed = new EmbedBuilder().setTitle(`🚀 ¡${nombre} ha comenzado!`).setDescription("El evento ya está en curso.").setColor(0x00ff00).setTimestamp();
          try { await msg.edit({ embeds: [doneEmbed] }); } catch {}
          return;
        }
        const d2 = targetDate - now2;
        const d = Math.floor(d2 / 86400000);
        const h = Math.floor((d2 % 86400000) / 3600000);
        const m = Math.floor((d2 % 3600000) / 60000);
        const s = Math.floor((d2 % 60000) / 1000);
        const updEmbed = new EmbedBuilder()
          .setTitle(`⏳ Cuenta Regresiva — ${nombre}`)
          .setDescription(`El evento comienza en:`)
          .addFields(
            { name: "📅 Días", value: `${d}`, inline: true },
            { name: "⏰ Horas", value: `${h}`, inline: true },
            { name: "⏱️ Minutos", value: `${m}`, inline: true },
            { name: "⌛ Segundos", value: `${s}`, inline: true },
          )
          .setColor(0x5865f2)
          .setFooter({ text: `${fecha} a las ${hora}` })
          .setTimestamp();
        try { await msg.edit({ embeds: [updEmbed] }); } catch {}
      }, 10000);
      return;
    }

    // ============== FUN / SOCIAL / SERVER ==============

    // ===== INVITE =====
    if (interaction.commandName === "invite") {
      // Datos reales desde SQLite (map en memoria sincronizado al entrar/salir)
      const entries = [...invites.entries()]
        .filter(([k, v]) => k.startsWith(`${interaction.guildId}:`) && (v.total || 0) > 0)
        .map(([k, v]) => [k.split(":").slice(1).join(":"), v]);
      const totalInvites = entries.reduce((sum, [, v]) => sum + (v.total || 0), 0);
      const topInviters = entries
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);

      let topText = "Nadie ha invitado a nadie aún.";
      if (topInviters.length > 0) {
        topText = topInviters.map(([userId, v], i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
          return `${medal} <@${userId}> — **${v.total}** invitaciones`;
        }).join("\n");
      }

      const guildInvites = await interaction.guild.invites.fetch().catch(() => null);
      const activeInvites = guildInvites ? guildInvites.size : 0;

      const botInviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${BOT_ID}&permissions=380376444016&scope=bot%20applications.commands`;

      const embed = new EmbedBuilder()
        .setTitle("📨 Estadísticas de Invitaciones")
        .addFields(
          { name: "📊 Total de invitaciones", value: `${totalInvites}`, inline: true },
          { name: "🔗 Invites activos", value: `${activeInvites}`, inline: true },
          { name: "🏆 Top Invitadores", value: topText },
          { name: "🤖 Agregar HYDRA a otro servidor", value: `[Click aquí para invitar al bot](${botInviteUrl})` },
        )
        .setColor(0x5865f2)
        .setFooter({ text: `Hydra Studio • ${interaction.guild.name}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ===== MEME =====
    if (interaction.commandName === "meme") {
      await interaction.deferReply();
      const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
      const isImg = (u) => typeof u === "string" && /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(u);
      let title = "Meme", imageUrl = null, footer = "";
      try {
        const subreddits = ["memes", "dankmemes", "MinecraftMemes", "ProgrammerHumor"];
        const sub = subreddits[Math.floor(Math.random() * subreddits.length)];
        const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=50&raw_json=1`, { headers: UA });
        if (res.ok) {
          const data = await res.json();
          const posts = (data?.data?.children || [])
            .map(c => c.data)
            .filter(p => p && !p.over_18 && !p.stickied && isImg(p.url));
          if (posts.length) {
            const post = posts[Math.floor(Math.random() * posts.length)];
            title = post.title?.substring(0, 256) || title;
            imageUrl = post.url;
            footer = `👍 ${post.ups || 0} • r/${sub}`;
          }
        }
      } catch {}
      if (!imageUrl) {
        try {
          const res = await fetch("https://meme-api.com/gimme/memes", { headers: UA });
          if (res.ok) {
            const data = await res.json();
            if (data && !data.nsfw && isImg(data.url)) {
              title = (data.title || title).substring(0, 256);
              imageUrl = data.url;
              footer = `👍 ${data.ups || 0} • r/${data.subreddit || "memes"}`;
            }
          }
        } catch {}
      }
      if (!imageUrl) return interaction.editReply({ content: "❌ No encontré un meme adecuado. Intenta de nuevo." });
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setImage(imageUrl)
        .setColor(0xff4500)
        .setFooter({ text: footer || "HYDRA Bot" });
      return interaction.editReply({ embeds: [embed] });
    }

    // ===== RANDOM =====
    if (interaction.commandName === "random") {
      const min = interaction.options.getInteger("min");
      const max = interaction.options.getInteger("max");
      if (min >= max) return interaction.reply({ content: "❌ El mínimo debe ser menor que el máximo.", flags: MessageFlags.Ephemeral });
      if (max - min > 1000000) return interaction.reply({ content: "❌ Rango máximo: 1,000,000.", flags: MessageFlags.Ephemeral });
      const result = Math.floor(Math.random() * (max - min + 1)) + min;
      const embed = new EmbedBuilder()
        .setTitle("🎲 Número Aleatorio")
        .setDescription(`**${result}**`)
        .addFields({ name: "Rango", value: `${min} — ${max}`, inline: true })
        .setColor(0x5865f2)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ===== SHIP =====
    if (interaction.commandName === "ship") {
      const user1 = interaction.options.getUser("usuario1");
      const user2 = interaction.options.getUser("usuario2");
      const percentage = Math.floor(Math.random() * 101);
      const barFilled = Math.round(percentage / 5);
      const barEmpty = 20 - barFilled;
      const bar = "█".repeat(barFilled) + "░".repeat(barEmpty);

      let emoji, color;
      if (percentage >= 80) { emoji = "💕"; color = 0xff69b4; }
      else if (percentage >= 60) { emoji = "💗"; color = 0xff1493; }
      else if (percentage >= 40) { emoji = "💔"; color = 0xffa500; }
      else { emoji = "☠️"; color = 0xff0000; }

      const { createCanvas } = require("@napi-rs/canvas");
      const W = 400, H = 120;
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext("2d");

      // Background
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, W, H);

      // Heart in center
      ctx.fillStyle = percentage >= 60 ? "#ff69b4" : "#ff4444";
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(percentage >= 40 ? "❤️" : "💔", W / 2, 45);

      // Percentage
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText(`${percentage}%`, W / 2, 80);

      // Names
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#AAAAAA";
      ctx.textAlign = "left";
      ctx.fillText(user1.username, 20, 110);
      ctx.textAlign = "right";
      ctx.fillText(user2.username, W - 20, 110);

      const buffer = canvas.toBuffer("image/png");

      const embed = new EmbedBuilder()
        .setTitle(`${emoji} Ship entre ${user1.username} y ${user2.username}`)
        .setDescription(`\`${bar}\` **${percentage}%**`)
        .setColor(color)
        .setImage("attachment://ship.png")
        .setTimestamp();
      return interaction.reply({ embeds: [embed], files: [{ attachment: buffer, name: "ship.png" }] });
    }

    // ===== 8BALL =====
    if (interaction.commandName === "8ball") {
      const pregunta = interaction.options.getString("pregunta");
      const respuestas = [
        "Sí, definitivamente.",
        "Es cierto.",
        "Sin duda.",
        "Sí, por supuesto.",
        "Confía en ello.",
        "Es probable.",
        "Las señales apuntan a que sí.",
        "Sí, ahora mismo.",
        "No cuentes con ello.",
        "No.",
        "No creo que sí.",
        "Mi respuesta es no.",
        "Mis fuentes dicen que no.",
        "Las perspectivas no son buenas.",
        "Muy dudoso.",
        "Pregunta de nuevo más tarde.",
        "No puedo predecirlo ahora.",
        "Concéntrate y vuelve a preguntar.",
        "No es seguro.",
        "Sí, pero no de la forma que esperas.",
      ];
      const resp = respuestas[Math.floor(Math.random() * respuestas.length)];
      const embed = new EmbedBuilder()
        .setTitle("🎱 Bola Mágica 8")
        .addFields(
          { name: "❓ Pregunta", value: pregunta },
          { name: "🔮 Respuesta", value: resp },
        )
        .setColor(0x9b59b6)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ===== SERVERINFO =====
    if (interaction.commandName === "serverinfo") {
      const g = interaction.guild;
      const owner = await g.fetchOwner().catch(() => null);
      const textChannels = g.channels.cache.filter(c => c.type === 0).size;
      const voiceChannels = g.channels.cache.filter(c => c.type === 2).size;
      const categories = g.channels.cache.filter(c => c.type === 4).size;
      const roles = g.roles.cache.size - 1;
      const emojis = g.emojis.cache.size;
      const members = g.memberCount;
      const online = g.members.cache.filter(m => m.presence?.status !== "offline").size;
      const bots = g.members.cache.filter(m => m.user.bot).size;
      const boostLevel = g.premiumTier;
      const boosts = g.premiumSubscriptionCount || 0;

      const createdAt = g.createdAt.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${g.name}`)
        .setThumbnail(g.iconURL({ dynamic: true, size: 256 }))
        .addFields(
          { name: "👑 Dueño", value: owner ? `<@${owner.id}>` : "Desconocido", inline: true },
          { name: "📅 Creado", value: createdAt, inline: true },
          { name: "🆔 ID", value: g.id, inline: true },
          { name: "👥 Miembros", value: `${members} (${online} en línea, ${bots} bots)`, inline: true },
          { name: "💬 Canales", value: `${textChannels} texto, ${voiceChannels} voz, ${categories} categorías`, inline: true },
          { name: "🎭 Roles", value: `${roles}`, inline: true },
          { name: "😀 Emojis", value: `${emojis}`, inline: true },
          { name: "🚀 Boosts", value: `Nivel ${boostLevel} (${boosts} boosts)`, inline: true },
          { name: "🔗 Invite", value: g.invites.cache.first()?.url || "Ninguno", inline: true },
        )
        .setColor(g.displayColor || 0x5865f2)
        .setFooter({ text: `Hydra Studio • ${g.name}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    // ===== MCSTATUS =====
    if (interaction.commandName === "mcstatus") {
      await interaction.deferReply();
      const ip = interaction.options.getString("ip");
      const port = interaction.options.getInteger("puerto") || 25565;
      try {
        const { status } = require("minecraft-server-util");
        const result = await status(ip, port, { timeout: 8000 });

        const playerList = result.players.sample?.map(p => `• ${p.name}`).slice(0, 15).join("\n") || "Ninguno visible";

        const embed = new EmbedBuilder()
          .setTitle(`🟢 ${ip}`)
          .setColor(0x00FF00)
          .addFields(
            { name: "📝 MOTD", value: `\`\`\`${result.motd.clean || "N/A"}\`\`\``, inline: false },
            { name: "🎮 Versión", value: result.version.name || "N/A", inline: true },
            { name: "👥 Jugadores", value: `${result.players.online}/${result.players.max}`, inline: true },
            { name: "📡 IP", value: `\`${ip}:${port}\``, inline: true },
            { name: "🟢 Estado", value: "✅ Online", inline: true },
            { name: "👥 Jugadores conectados", value: playerList, inline: false },
          )
          .setFooter({ text: `Consulta por ${interaction.user.tag}` })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      } catch (err) {
        const embed = new EmbedBuilder()
          .setTitle(`🔴 ${ip}`)
          .setDescription(`No se pudo conectar a **${ip}:${port}**\nEl servidor podría estar offline o la IP incorrecta.`)
          .setColor(0xFF0000)
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }
    }

    // ===== BOUNCE =====
    if (interaction.commandName === "img" && interaction.options.getSubcommand() === "bounce") {
      await interaction.deferReply();
      try {
        const { createCanvas, loadImage } = require("@napi-rs/canvas");
        const GIFEncoder = require("gif-encoder");

        const user = interaction.options.getUser("usuario") || interaction.user;
        const avatarURL = user.displayAvatarURL({ extension: "png", size: 256 });

        const avatarImg = await loadImage(avatarURL);
        const size = 256;
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext("2d");

        const frames = 30;
        const bounceHeight = 60;
        const fps = 15;
        const encoder = new GIFEncoder(size, size);
        encoder.setRepeat(0);
        encoder.setDelay(1000 / fps);

        const chunks = [];
        encoder.on("data", (chunk) => chunks.push(chunk));

        const gifBuffer = new Promise((resolve) => {
          encoder.on("end", () => resolve(Buffer.concat(chunks)));
        });

        encoder.writeHeader();

        for (let i = 0; i < frames; i++) {
          const t = (i / frames) * Math.PI * 2;
          const yOff = Math.abs(Math.sin(t)) * bounceHeight;
          const squash = 1 + Math.max(0, Math.sin(t + Math.PI / 2)) * 0.12;

          ctx.clearRect(0, 0, size, size);

          ctx.save();
          ctx.translate(size / 2, size - yOff);
          ctx.scale(1 / squash, squash);
          ctx.beginPath();
          ctx.ellipse(0, 5, size * 0.35, 6, 0, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.translate(size / 2, size - yOff - size / 2);
          ctx.scale(squash, 1 / squash);
          ctx.drawImage(avatarImg, -size / 2, -size / 2, size, size);
          ctx.restore();

          encoder.addFrame(ctx.getImageData(0, 0, size, size).data);
        }

        encoder.finish();
        const buffer = await gifBuffer;

        const attachment = new AttachmentBuilder(buffer, { name: "bounce.gif" });
        return interaction.editReply({
          content: `🪃 ¡Avatar de **${user.username}** rebotando!`,
          files: [attachment],
        });
      } catch (err) {
        console.error("Bounce error:", err);
        return interaction.editReply({ content: "❌ Error al generar el GIF: " + err.message });
      }
    }

    // ===== NUKE =====
    if (interaction.commandName === "nuke") {
      if (!canUseModCommand(interaction.member, "nuke")) return interaction.reply({ content: noPermMsg(interaction.member, "nuke"), flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const channel = interaction.channel;
        const position = channel.position;
        const parent = channel.parent;
        const overwriteArray = [...channel.permissionOverwrites.cache.values()];

        const newChannel = await channel.clone({
          name: channel.name,
          type: channel.type,
          topic: channel.topic,
          nsfw: channel.nsfw,
          reason: `Nuke by ${interaction.user.tag}`,
        });

        await newChannel.setPosition(position);
        if (parent) await newChannel.setParent(parent.id);
        for (const overwrite of overwriteArray) {
          await newChannel.permissionOverwrites.create(overwrite.id, overwrite);
        }

        await channel.delete(`Nuked by ${interaction.user.tag}`);
        return interaction.editReply({ content: `✅ Canal **#${newChannel.name}** duplicado y limpiado.` });
      } catch (err) {
        console.error("Nuke error:", err);
        return interaction.editReply({ content: "❌ Error al nukear: " + err.message });
      }
    }

    // ===== CLONAR =====
    if (interaction.commandName === "clonar") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const canal = interaction.options.getChannel("canal");
        const nombre = interaction.options.getString("nombre");
        const categoria = interaction.options.getChannel("categoria") || canal.parent;

        const overwriteArray = [...canal.permissionOverwrites.cache.values()];
        const newChannel = await canal.clone({
          name: nombre,
          type: canal.type,
          topic: canal.topic,
          nsfw: canal.nsfw,
          reason: `Clonado por ${interaction.user.tag}`,
        });

        if (categoria) await newChannel.setParent(categoria.id);
        for (const overwrite of overwriteArray) {
          await newChannel.permissionOverwrites.create(overwrite.id, overwrite);
        }

        return interaction.editReply({ content: `✅ Canal clonado: <#${newChannel.id}>` });
      } catch (err) {
        console.error("Clonar error:", err);
        return interaction.editReply({ content: "❌ Error al clonar: " + err.message });
      }
    }

    // ===== GLOBO =====
    if (interaction.commandName === "img" && interaction.options.getSubcommand() === "globo") {
      try {
        const { createCanvas, loadImage } = require("@napi-rs/canvas");
        const texto = interaction.options.getString("texto");
        const avatarURL = interaction.user.displayAvatarURL({ extension: "png", size: 256 });
        const avatarImg = await loadImage(avatarURL);

        const bubbleW = 400, bubbleH = 100, avatarSize = 128, pad = 20;
        const canvasW = bubbleW + pad * 2;
        const canvasH = bubbleH + 30 + avatarSize + pad;
        const canvas = createCanvas(canvasW, canvasH);
        const ctx = canvas.getContext("2d");

        const bubbleX = pad, bubbleY = pad;
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 15);
        ctx.fill();
        ctx.stroke();

        const triCenterX = canvasW / 2;
        const triTop = bubbleY + bubbleH;
        ctx.beginPath();
        ctx.moveTo(triCenterX - 12, triTop - 2);
        ctx.lineTo(triCenterX, triTop + 18);
        ctx.lineTo(triCenterX + 12, triTop - 2);
        ctx.closePath();
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(bubbleX + 15, bubbleY + bubbleH);
        ctx.lineTo(triCenterX - 12, triTop - 2);
        ctx.strokeStyle = "#000000";
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(bubbleX + bubbleW - 15, bubbleY + bubbleH);
        ctx.lineTo(triCenterX + 12, triTop - 2);
        ctx.stroke();

        ctx.fillStyle = "#000000";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(texto, bubbleX + bubbleW / 2, bubbleY + bubbleH / 2, bubbleW - 40);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";

        const avatarX = (canvasW - avatarSize) / 2;
        const avatarY = triTop + 18;
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);

        const buffer = canvas.toBuffer("image/png");
        const attachment = new AttachmentBuilder(buffer, { name: "globo.png" });
        return interaction.reply({ files: [attachment] });
      } catch (err) {
        console.error("Globo error:", err);
        return interaction.reply({ content: "❌ Error al crear el globo: " + err.message, flags: MessageFlags.Ephemeral });
      }
    }

    // ===== MOMO =====
    if (interaction.commandName === "momo" && interaction.options.getSubcommand() === "ver") {
      try {
        const https = require("https");
        const http = require("http");
        const fetchURL = (url) => new Promise((resolve, reject) => {
          const mod = url.startsWith("https") ? https : http;
          mod.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/json" },
            timeout: 8000,
          }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              return fetchURL(res.headers.location).then(resolve).catch(reject);
            }
            let data = "";
            res.on("data", (c) => data += c);
            res.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("Not JSON")); } });
          }).on("error", reject);
        });

        let imageUrl = null;
        let title = "Momo aleatorio";

        try {
          const data = await fetchURL("https://www.reddit.com/r/memes/hot.json?limit=25&raw_json=1");
          const posts = data?.data?.children?.filter(p => !p.data.stickied && p.data.post_hint === "image" && p.data.url) || [];
          if (posts.length) {
            const post = posts[Math.floor(Math.random() * posts.length)];
            imageUrl = post.data.url;
            title = post.data.title?.slice(0, 256) || title;
          }
        } catch {}

        if (!imageUrl) {
          try {
            const data = await fetchURL("https://meme-api.com/gimme/memes");
            imageUrl = data.url || data.message;
            title = data.title || title;
          } catch {}
        }

        if (!imageUrl) {
          try {
            const data = await fetchURL("https://www.reddit.com/r/dankmemes/hot.json?limit=25&raw_json=1");
            const posts = data?.data?.children?.filter(p => !p.data.stickied && p.data.url) || [];
            if (posts.length) {
              const post = posts[Math.floor(Math.random() * posts.length)];
              imageUrl = post.data.url;
              title = post.data.title?.slice(0, 256) || title;
            }
          } catch {}
        }

        if (!imageUrl) {
          try {
            const data = await fetchURL("https://api.imgflip.com/get_memes");
            const memes = data?.data?.memes || [];
            if (memes.length) {
              const m = memes[Math.floor(Math.random() * Math.min(memes.length, 20))];
              imageUrl = m.url;
              title = m.name?.slice(0, 256) || title;
            }
          } catch {}
        }

        if (!imageUrl) {
          try {
            const data = await fetchURL("https://randomfox.ca/floof/");
            imageUrl = data?.image || data?.url;
            title = "🦊 Floof aleatorio";
          } catch {}
        }

        if (!imageUrl) {
          try {
            const data = await fetchURL("https://api.thedogapi.com/v1/images/search?limit=5");
            if (Array.isArray(data) && data.length) {
              const img = data[Math.floor(Math.random() * data.length)];
              imageUrl = img.url;
              title = "🐶 Perrito aleatorio";
            }
          } catch {}
        }

        if (!imageUrl) throw new Error("No memes found");

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setImage(imageUrl)
          .setColor(0xFF6B6B);
        return interaction.reply({ embeds: [embed] });
      } catch (err) {
        console.error("Momo error:", err);
        return interaction.reply({ content: "❌ No se pudo obtener un momo. Intenta de nuevo.", flags: MessageFlags.Ephemeral });
      }
    }

    // ===== MOMORECIENTE =====
    if (interaction.commandName === "momo" && interaction.options.getSubcommand() === "reciente") {
      try {
        const https = require("https");
        const fetchURL = (url) => new Promise((resolve, reject) => {
          https.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/json" },
            timeout: 8000,
          }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
              return fetchURL(res.headers.location).then(resolve).catch(reject);
            }
            let data = "";
            res.on("data", (c) => data += c);
            res.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("Not JSON")); } });
          }).on("error", reject);
        });

        const data = await fetchURL("https://www.reddit.com/r/memes/new.json?limit=5&raw_json=1");
        const posts = data?.data?.children?.filter(p => !p.data.stickied && p.data.url) || [];
        if (!posts.length) throw new Error("No memes found");
        const post = posts[0];
        const embed = new EmbedBuilder()
          .setTitle("Momo más reciente")
          .setDescription(post.data.title?.slice(0, 256) || "Sin título")
          .setImage(post.data.url)
          .setColor(0x5865F2)
          .setFooter({ text: `👍 ${post.data.ups} | r/${post.data.subreddit}` });
        return interaction.reply({ embeds: [embed] });
      } catch (err) {
        return interaction.reply({ content: "❌ No se pudo obtener momo reciente.", flags: MessageFlags.Ephemeral });
      }
    }

    // ===== VOID =====
    if (interaction.commandName === "img" && interaction.options.getSubcommand() === "void") {
      await interaction.deferReply();
      try {
        const { createCanvas, loadImage } = require("@napi-rs/canvas");
        const attachment = interaction.options.getAttachment("imagen");
        const img = await loadImage(attachment.url);

        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width, h = canvas.height;

        const origPixels = new Uint8ClampedArray(data);

        for (let y = 0; y < h; y++) {
          const shift = Math.floor(Math.sin(y * 0.04) * 15);
          for (let x = 0; x < w; x++) {
            const srcX = ((x + shift) % w + w) % w;
            const si = (y * w + srcX) * 4;
            const di = (y * w + x) * 4;
            const gray = origPixels[si] * 0.299 + origPixels[si + 1] * 0.587 + origPixels[si + 2] * 0.114;
            const dark = gray * 0.5;
            data[di] = Math.min(255, dark + 15);
            data[di + 1] = Math.min(255, dark + 15);
            data[di + 2] = Math.min(255, dark + 15);
            data[di + 3] = 255;
          }
        }

        for (let i = 0; i < data.length; i += 4) {
          if (Math.random() < 0.15) {
            const noise = Math.random() * 50 - 25;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
          }
        }

        ctx.putImageData(imageData, 0, 0);
        const buf = canvas.toBuffer("image/png");
        const result = new AttachmentBuilder(buf, { name: "void.png" });
        return interaction.editReply({ content: "👁️ **Efecto void aplicado:**", files: [result] });
      } catch (err) {
        console.error("Void error:", err);
        return interaction.editReply({ content: "❌ Error al aplicar efecto void: " + err.message });
      }
    }

    // ===== SOURCE =====
    if (interaction.commandName === "img" && interaction.options.getSubcommand() === "source") {
      try {
        const attachment = interaction.options.getAttachment("imagen");
        const saucenaoUrl = "https://saucenao.com/search.php?url=" + encodeURIComponent(attachment.url);
        const tineyeUrl = "https://tineye.com/search?url=" + encodeURIComponent(attachment.url);
        const googleUrl = "https://lens.google.com/uploadbyurl?url=" + encodeURIComponent(attachment.url);
        const iqdbUrl = "https://iqdb.org/?url=" + encodeURIComponent(attachment.url);

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder().setLabel("SauceNAO").setURL(saucenaoUrl).setStyle(ButtonStyle.Link).setEmoji("🔍"),
            new ButtonBuilder().setLabel("TinEye").setURL(tineyeUrl).setStyle(ButtonStyle.Link).setEmoji("🔎"),
            new ButtonBuilder().setLabel("Google Lens").setURL(googleUrl).setStyle(ButtonStyle.Link).setEmoji("📷"),
          );
        const row2 = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder().setLabel("IQDB").setURL(iqdbUrl).setStyle(ButtonStyle.Link).setEmoji("🎭"),
          );

        const embed = new EmbedBuilder()
          .setTitle("🔍 Source Image")
          .setDescription("Haz clic en un botón para buscar el source de esta imagen:")
          .setImage(attachment.url)
          .setColor(0xFF6B6B)
          .setFooter({ text: "SauceNAO es mejor para anime/illustraciones • TinEye para fotos • IQDB para anime" });
        return interaction.reply({ embeds: [embed], components: [row, row2] });
      } catch (err) {
        return interaction.reply({ content: "❌ Error al procesar.", flags: MessageFlags.Ephemeral });
      }
    }

    // ===== APORTAR =====
    if (interaction.commandName === "aporte" && interaction.options.getSubcommand() === "enviar") {
      try {
        const url = interaction.options.getString("url");
        const desc = interaction.options.getString("descripcion") || "Sin descripción";
        const embed = new EmbedBuilder()
          .setTitle("📥 Nuevo Aporte")
          .setDescription(`**Autor:** ${interaction.user.tag}\n**Descripción:** ${desc}\n**URL:** ${url}`)
          .setColor(0x00FF00)
          .setTimestamp();
        if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) embed.setImage(url);
        return interaction.reply({ embeds: [embed] });
      } catch (err) {
        return interaction.reply({ content: "❌ Error al enviar aporte.", flags: MessageFlags.Ephemeral });
      }
    }

    // ===== APORTE_STATUS =====
    if (interaction.commandName === "aporte" && interaction.options.getSubcommand() === "estado") {
      const embed = new EmbedBuilder()
        .setTitle("📊 Estado de Aportes")
        .setDescription(`**Aportes de ${interaction.user.tag}:**\nTus aportes están siendo revisados.`)
        .setColor(0x5865F2)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ============== MUSIC COMMANDS ==============
    const memberV = interaction.guild ? interaction.guild.members.cache.get(interaction.user.id) : null;
    const voiceChannel = memberV?.voice?.channel;

    // ===== PLAY =====
    if (interaction.commandName === "play") {
      if (!voiceChannel) return interaction.reply({ content: "❌ Entra a un canal de voz primero.", flags: MessageFlags.Ephemeral });
      const djRole = getGuildConfig(interaction.guild.id).musicDJRole || "";
      if (djRole && !interaction.member.roles.cache.has(djRole) && !isStaff(interaction.member)) {
        return interaction.reply({ content: "❌ Necesitas el rol de DJ para usar la música.", flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply();
      applyMusicSettings(interaction.guildId);
      const query = interaction.options.getString("cancion");
      let songData;
      try {
        const q = String(query || "").trim();
        if (!q) return interaction.editReply({ content: "❌ Escribe qué quieres reproducir." });
        
        // Detectar tipo de enlace
        const isSpotify = /spotify\.com/i.test(q);
        const isYoutube = /(youtube\.com|youtu\.be)/i.test(q);
        const isSoundCloud = /soundcloud\.com/i.test(q);
        const isAppleMusic = /music\.apple\.com/i.test(q);
        
        if (isSpotify) {
          songData = await spotifyResolve(q);
        } else if (isYoutube) {
          songData = await resolveYouTube(q);
        } else if (isSoundCloud || isAppleMusic) {
          // yt-dlp maneja SoundCloud y Apple Music nativamente
          songData = await resolveGenericYTDLP(q, isSoundCloud ? "SoundCloud" : "Apple Music");
        } else {
          // Texto libre: buscar en YouTube (play-dl) con fallback yt-dlp
          songData = await searchTrack(q);
        }
        
        if (!songData || !songData.url) throw new Error("no pude resolver esa canción");
        if (!songData.title) songData.title = q;
      } catch (e) {
        console.error("Play error:", e);
        LAST_MUSIC_ERROR = e.message;
        return interaction.editReply({ content: "❌ No pude reproducirlo: " + e.message + musicBlockedHint(e.message) });
      }

      console.log(`🎵 Queued: ${songData.title}`);
      const queue = getQueue(interaction.guildId);
      queue.textChannelId = interaction.channel.id;
      queue.songs.push(songData);

      if (!queue.connection || queue.connection.state.status === "destroyed") {
        const conn = voice.joinVoiceChannel({ channelId: voiceChannel.id, guildId: interaction.guildId, adapterCreator: interaction.guild.voiceAdapterCreator });
        queue.connection = conn;
        
        const waitForReady = new Promise((resolve) => {
          if (conn.state.status === "ready") return resolve();
          conn.on(voice.VoiceConnectionStatus.Ready, () => resolve());
          conn.on(voice.VoiceConnectionStatus.Disconnected, () => resolve());
          setTimeout(() => resolve(), 5000);
        });
        await waitForReady;
        console.log(`🎵 Connection ready, state: ${conn.state.status}`);
        
        playGuildMusic(interaction.guildId);
      } else if (!queue.player || queue.player.state.status === voice.AudioPlayerStatus.Idle) {
        playGuildMusic(interaction.guildId);
      }

      const embed = new EmbedBuilder()
        .setTitle("🎵 Añadido a la cola")
        .setDescription(`**${songData.title}**\nDuración: ${songData.duration}`)
        .setThumbnail(songData.thumbnail)
        .setColor(0x00FF00)
        .setFooter({ text: `Posición en cola: ${queue.songs.length}` });
      return interaction.editReply({ embeds: [embed] });
    }

    // ===== PAUSE =====
    if (interaction.commandName === "pause") {
      const queue = musicQueues.get(interaction.guildId);
      if (!queue?.player) return interaction.reply({ content: "❌ No hay música reproduciéndose.", flags: MessageFlags.Ephemeral });
      queue.player.pause();
      return interaction.reply({ content: "⏸️ Música pausada." });
    }

    // ===== RESUME =====
    if (interaction.commandName === "resume") {
      const queue = musicQueues.get(interaction.guildId);
      if (!queue?.player) return interaction.reply({ content: "❌ No hay música pausada.", flags: MessageFlags.Ephemeral });
      queue.player.unpause();
      return interaction.reply({ content: "▶️ Música reanudada." });
    }

    // ===== STOP =====
    if (interaction.commandName === "stop") {
      const queue = musicQueues.get(interaction.guildId);
      if (!queue) return interaction.reply({ content: "❌ No hay música.", flags: MessageFlags.Ephemeral });
      destroyMusicQueue(interaction.guildId, "/stop");
      return interaction.reply({ content: "⏹️ Música detenida y salí del canal." });
    }

    // ===== SKIP =====
    if (interaction.commandName === "skip") {
      const queue = musicQueues.get(interaction.guildId);
      if (!queue?.player) return interaction.reply({ content: "❌ No hay música.", flags: MessageFlags.Ephemeral });
      queue.player.stop();
      return interaction.reply({ content: "⏭️ Saltando..." });
    }

    // ===== QUEUE =====
    if (interaction.commandName === "queue") {
      const queue = musicQueues.get(interaction.guildId);
      if (!queue?.songs.length) return interaction.reply({ content: "🎵 La cola está vacía.", flags: MessageFlags.Ephemeral });
      const list = queue.songs.map((s, i) => `${i === 0 ? "▶️" : `${i}.`} **${s.title}** — ${s.duration}`).join("\n");
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🎵 Cola de Reproducción").setDescription(list.slice(0, 4000)).setColor(0x5865F2)] });
    }

    // ===== NOWPLAYING =====
    if (interaction.commandName === "nowplaying") {
      const queue = musicQueues.get(interaction.guildId);
      if (!queue?.songs[0]) return interaction.reply({ content: "🎵 No hay nada sonando.", flags: MessageFlags.Ephemeral });
      const song = queue.songs[0];
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🎵 Reproduciendo ahora").setDescription(`**${song.title}**\n${song.duration}`).setThumbnail(song.thumbnail).setColor(0x00FF00)] });
    }

    // ===== VOLUMEN =====
    if (interaction.commandName === "volumen") {
      const queue = musicQueues.get(interaction.guildId);
      if (!queue?.songs.length) return interaction.reply({ content: "❌ No hay música.", flags: MessageFlags.Ephemeral });
      const vol = interaction.options.getInteger("nivel");
      queue.volume = vol;
      // Restart current song with new volume
      if (queue.player) {
        queue.player.stop();
      }
      return interaction.reply({ content: `🔊 Volumen: **${vol}%**` });
    }

    // ===== LOOP =====
    if (interaction.commandName === "loop") {
      const queue = musicQueues.get(interaction.guildId);
      if (!queue) return interaction.reply({ content: "❌ No hay música.", flags: MessageFlags.Ephemeral });
      queue.looping = !queue.looping;
      return interaction.reply({ content: queue.looping ? "🔁 Loop activado." : "🔁 Loop desactivado." });
    }

    // ===== MUSIC BUTTONS =====
    if (interaction.isButton() && interaction.customId.startsWith("music_")) {
      const action = interaction.customId.replace("music_", "");
      const queue = musicQueues.get(interaction.guildId);

      if (action === "pause") {
        if (!queue?.player) return interaction.reply({ content: "❌ No hay música reproduciéndose.", flags: MessageFlags.Ephemeral });
        queue.player.pause();
        return interaction.reply({ content: "⏸️ Música pausada.", flags: MessageFlags.Ephemeral });
      }
      if (action === "resume") {
        if (!queue?.player) return interaction.reply({ content: "❌ No hay música pausada.", flags: MessageFlags.Ephemeral });
        queue.player.unpause();
        return interaction.reply({ content: "▶️ Música reanudada.", flags: MessageFlags.Ephemeral });
      }
      if (action === "skip") {
        if (!queue?.player) return interaction.reply({ content: "❌ No hay música.", flags: MessageFlags.Ephemeral });
        queue.player.stop();
        return interaction.reply({ content: "⏭️ Saltando...", flags: MessageFlags.Ephemeral });
      }
      if (action === "stop") {
        if (!queue) return interaction.reply({ content: "❌ No hay música.", flags: MessageFlags.Ephemeral });
        destroyMusicQueue(interaction.guildId, "botón stop");
        return interaction.reply({ content: "⏹️ Música detenida y salí del canal.", flags: MessageFlags.Ephemeral });
      }
      if (action === "queue") {
        if (!queue?.songs.length) return interaction.reply({ content: "🎵 La cola está vacía.", flags: MessageFlags.Ephemeral });
        const list = queue.songs.map((s, i) => `${i === 0 ? "▶️" : `${i}.`} **${s.title}** — ${s.duration}`).join("\n");
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🎵 Cola de Reproducción").setDescription(list.slice(0, 4000)).setColor(0x5865F2)], flags: MessageFlags.Ephemeral });
      }
    }

    // ===== CLIP GUARDAR =====
    if (interaction.commandName === "clip" && interaction.options.getSubcommand() === "guardar") {
      const modal = new ModalBuilder()
        .setCustomId("clip_modal")
        .setTitle("📎 Guardar Clip")
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("titulo").setLabel("Título del clip").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("descripcion").setLabel("Descripción").setStyle(TextInputStyle.Paragraph).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("link").setLabel("Link del VOD (YouTube/Twitch)").setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("inicio").setLabel("Minuto de inicio (ej: 12:34)").setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("fin").setLabel("Minuto final (ej: 14:02)").setStyle(TextInputStyle.Short).setRequired(false))
        );
      return interaction.showModal(modal);
    }

    // ===== CLIP MODAL SUBMIT =====
    if (interaction.isModalSubmit() && interaction.customId === "clip_modal") {
      const gcClip = getGuildConfig(interaction.guildId);
      if (gcClip.clipsEnabled === false) return interaction.reply({ content: "❌ Los clips están desactivados.", flags: MessageFlags.Ephemeral });
      const maxPerUser = gcClip.clipsMaxPerUser || 0;
      if (maxPerUser > 0) {
        const userClips = [...clips.values()].filter(c => c.guildId === interaction.guildId && c.autorId === interaction.user.id);
        if (userClips.length >= maxPerUser) return interaction.reply({ content: `❌ Has alcanzado el límite de ${maxPerUser} clips.`, flags: MessageFlags.Ephemeral });
      }
      clipCounter++;
      const clip = {
        id: `clip_${clipCounter}`,
        numericId: clipCounter,
        guildId: interaction.guildId,
        titulo: interaction.fields.getTextInputValue("titulo"),
        descripcion: interaction.fields.getTextInputValue("descripcion") || "",
        link: interaction.fields.getTextInputValue("link") || "",
        inicio: interaction.fields.getTextInputValue("inicio") || "",
        fin: interaction.fields.getTextInputValue("fin") || "",
        menciones: "",
        autor: `<@${interaction.user.id}>`,
        autorId: interaction.user.id,
        fecha: Date.now(),
        favoritos: []
      };
      clips.set(clip.id, clip);
      saveClip(clip);
      return interaction.reply({ embeds: [buildClipEmbed(clip)], content: "✅ Clip guardado!" });
    }

    // ===== CLIP LISTAR =====
    if (interaction.commandName === "clip" && interaction.options.getSubcommand() === "listar") {
      const allClips = [...clips.values()].filter(c => (c.guildId || "") === interaction.guild.id).sort((a, b) => b.fecha - a.fecha);
      if (allClips.length === 0) return interaction.reply({ content: "📎 No hay clips guardados.", flags: MessageFlags.Ephemeral });

      const PAGE_SIZE = 5;
      let page = 0;
      const totalPages = Math.ceil(allClips.length / PAGE_SIZE);

      function getPage(page) {
        const start = page * PAGE_SIZE;
        const slice = allClips.slice(start, start + PAGE_SIZE);
        return new EmbedBuilder()
          .setTitle(`📎 Clips (página ${page + 1}/${totalPages})`)
          .setDescription(slice.map(c => `**#${c.numericId}** — ${c.titulo}\n👤 ${c.autor} • ⭐ ${c.favoritos.length}`).join("\n\n"))
          .setColor(0xFFD700)
          .setFooter({ text: `${allClips.length} clips en total` });
      }

      const prevBtn = new ButtonBuilder().setCustomId("clip_prev").setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(true);
      const nextBtn = new ButtonBuilder().setCustomId("clip_next").setLabel("➡️").setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1);
      const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);

      const reply = await interaction.reply({ embeds: [getPage(0)], components: [row], fetchReply: true });

      const collector = reply.createMessageComponentCollector({ time: 120000 });
      collector.on("collect", async (i) => {
        try {
          if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ No es tu menú.", flags: MessageFlags.Ephemeral });
          if (i.customId === "clip_prev") page = Math.max(0, page - 1);
          if (i.customId === "clip_next") page = Math.min(totalPages - 1, page + 1);
          prevBtn.setDisabled(page === 0);
          nextBtn.setDisabled(page === totalPages - 1);
          await i.update({ embeds: [getPage(page)], components: [row] });
        } catch (e) { console.error("Clip collector error:", e.message); }
      });
      return;
    }

    // ===== CLIP BUSCAR =====
    if (interaction.commandName === "clip" && interaction.options.getSubcommand() === "buscar") {
      const q = interaction.options.getString("termino").toLowerCase();
      const found = [...clips.values()].filter(c =>
        (c.guildId || "") === interaction.guild.id &&
        (c.titulo.toLowerCase().includes(q) || (c.descripcion || "").toLowerCase().includes(q))
      ).sort((a, b) => b.fecha - a.fecha).slice(0, 10);
      if (found.length === 0) return interaction.reply({ content: `🔍 No encontré clips para "${q}".`, flags: MessageFlags.Ephemeral });
      return interaction.reply({ embeds: found.map(c => buildClipEmbed(c)) });
    }

    // ===== CLIP FAVORITOS =====
    if (interaction.commandName === "clip" && interaction.options.getSubcommand() === "favoritos") {
      const favs = [...clips.values()].filter(c => (c.guildId || "") === interaction.guild.id && c.favoritos.includes(interaction.user.id)).sort((a, b) => b.fecha - a.fecha);
      if (favs.length === 0) return interaction.reply({ content: "⭐ No tienes clips en favoritos.", flags: MessageFlags.Ephemeral });
      return interaction.reply({ embeds: favs.slice(0, 10).map(c => buildClipEmbed(c)) });
    }

    // ===== CLIP ELIMINAR =====
    if (interaction.commandName === "clip" && interaction.options.getSubcommand() === "eliminar") {
      const id = interaction.options.getString("id");
      const clip = clips.get(id);
      if (!clip || (clip.guildId || "") !== interaction.guild.id) return interaction.reply({ content: "❌ Clip no encontrado.", flags: MessageFlags.Ephemeral });
      if (clip.autorId !== interaction.user.id && !isStaff(interaction.member)) {
        return interaction.reply({ content: "❌ No puedes eliminar este clip.", flags: MessageFlags.Ephemeral });
      }
      clips.delete(clip.id);
      deleteClipFile(clip);
      return interaction.reply({ content: `🗑️ Clip #${clip.numericId} eliminado.` });
    }

    // ===== CLIP FAVORITO BUTTON =====
    if (interaction.isButton() && interaction.customId.startsWith("clip_fav_")) {
      const clipId = interaction.customId.replace("clip_fav_", "");
      const clip = clips.get(`clip_${clipId}`);
      if (!clip || (clip.guildId || "") !== interaction.guild.id) return interaction.reply({ content: "❌ Clip no encontrado.", flags: MessageFlags.Ephemeral });
      const idx = clip.favoritos.indexOf(interaction.user.id);
      if (idx >= 0) clip.favoritos.splice(idx, 1);
      else clip.favoritos.push(interaction.user.id);
      saveClip(clip);
      return interaction.update({ embeds: [buildClipEmbed(clip)] });
    }

    // ============== CONFESSIONS SYSTEM ==============

    // ===== CONFESAR =====
    if (interaction.commandName === "confesar") {
      const gc = getGuildConfig(interaction.guild.id);
      if (gc.confEnabled === false) return interaction.reply({ content: "❌ Las confesiones están desactivadas en este servidor.", flags: MessageFlags.Ephemeral });
      const cd = getConfessionData(interaction.guild.id);
      if (gc.confChannelId && !cd.channelId) cd.channelId = gc.confChannelId;
      if (!cd.channelId) {
        const ch = interaction.guild.channels.cache.find(c => c.name.includes("confesion") || c.name.includes("confession"));
        if (ch) cd.channelId = ch.id;
      }
      if (!cd.channelId) return interaction.reply({ content: "❌ No hay canal de confesiones configurado. Un admin debe configurarlo en el panel (Confesiones).", flags: MessageFlags.Ephemeral });
      if (cd.bans.includes(interaction.user.id)) {
        const ban = cd.bans.find(b => b.userId === interaction.user.id);
        return interaction.reply({ content: `🚫 Estás baneado de confesar.\n**Razón:** ${ban?.reason || "No especificada"}\nUsa \`/apelar\` para solicitar desbaneo.`, flags: MessageFlags.Ephemeral });
      }
      const modal = new ModalBuilder().setCustomId("confesar_modal").setTitle("💌 Confesión Anónima");
      const textInput = new TextInputBuilder().setCustomId("confesion_text").setLabel("¿Qué quieres confesar?").setStyle(TextInputStyle.Paragraph).setPlaceholder("Escribe tu confesión aquí...").setMaxLength(2000).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(textInput));
      return interaction.showModal(modal);
    }

    // ===== CONFESAR MODAL SUBMIT =====
    if (interaction.isModalSubmit() && interaction.customId === "confesar_modal") {
      const content = interaction.fields.getTextInputValue("confesion_text");
      const gc = getGuildConfig(interaction.guild.id);
      const cd = getConfessionData(interaction.guild.id);
      if (!cd.channelId) return interaction.reply({ content: "❌ Canal de confesiones no configurado.", flags: MessageFlags.Ephemeral });
      if (cd.bans.includes(interaction.user.id)) {
        return interaction.reply({ content: "🚫 Estás baneado de confesar. Usa `/apelar` para solicitar desbaneo.", flags: MessageFlags.Ephemeral });
      }
      const ch = interaction.guild.channels.cache.get(cd.channelId);
      if (!ch) return interaction.reply({ content: "❌ Canal de confesiones no encontrado.", flags: MessageFlags.Ephemeral });
      cd.counter++;
      const conf = {
        id: cd.counter,
        authorId: interaction.user.id,
        channelId: ch.id,
        messageId: "",
        content,
        date: new Date().toISOString(),
        replies: [],
        status: "pending",
      };
      cd.confessions.push(conf);
      // ¿Con revisión de staff?
      const revId = gc.confReviewChannelId || "";
      const revCh = revId ? interaction.guild.channels.cache.get(revId) : null;
      if (revCh && revCh.isTextBased()) {
        const revEmbed = new EmbedBuilder()
          .setTitle(`🔍 Revisión — Confesión #${conf.id}`)
          .setDescription(`"${content}"`)
          .setColor(0xF0B23C)
          .setFooter({ text: `De ${interaction.user.tag} • ${new Date().toLocaleString("es-ES")}` })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`conf_approve_${conf.id}`).setLabel("Aprobar").setEmoji("✅").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`conf_reject_${conf.id}`).setLabel("Rechazar").setEmoji("❌").setStyle(ButtonStyle.Danger),
        );
        const rmsg = await revCh.send({ embeds: [revEmbed], components: [row] }).catch(() => null);
        if (rmsg) { conf.reviewMessageId = rmsg.id; conf.reviewChannelId = revCh.id; }
        saveConfessions();
        return interaction.reply({ content: `✅ Confesión #${conf.id} enviada a revisión. Te avisaremos al publicarla.`, flags: MessageFlags.Ephemeral });
      }
      const msg = await publishConfession(interaction.guild, ch, conf);
      conf.messageId = msg.id;
      conf.status = "published";
      saveConfessions();
      return interaction.reply({ content: `✅ Confesión #${conf.id} publicada en <#${ch.id}>.`, flags: MessageFlags.Ephemeral });
    }

    // ===== CONFESIONES: botones persistentes =====
    if (interaction.isButton() && interaction.customId === "conf_new") {
      const gc = getGuildConfig(interaction.guild.id);
      if (gc.confEnabled === false) return interaction.reply({ content: "❌ Las confesiones están desactivadas en este servidor.", flags: MessageFlags.Ephemeral });
      const cd = getConfessionData(interaction.guild.id);
      if (cd.bans.includes(interaction.user.id)) {
        return interaction.reply({ content: "🚫 Estás baneado de confesar. Usa `/apelar` para solicitar desbaneo.", flags: MessageFlags.Ephemeral });
      }
      const modal = new ModalBuilder().setCustomId("confesar_modal").setTitle("💌 Confesión Anónima");
      const textInput = new TextInputBuilder().setCustomId("confesion_text").setLabel("¿Qué quieres confesar?").setStyle(TextInputStyle.Paragraph).setPlaceholder("Escribe tu confesión aquí...").setMaxLength(2000).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(textInput));
      return interaction.showModal(modal);
    }
    if (interaction.isButton() && interaction.customId.startsWith("conf_reply_")) {
      const msgId = interaction.customId.replace("conf_reply_", "");
      if (msgId === "pending") return interaction.reply({ content: "⏳ Espera un momento e inténtalo de nuevo.", flags: MessageFlags.Ephemeral });
      const cd = getConfessionData(interaction.guild.id);
      const conf = cd.confessions.find(c => c.messageId === msgId);
      if (!conf) return interaction.reply({ content: "❌ No encontré esa confesión.", flags: MessageFlags.Ephemeral });
      const modal = new ModalBuilder().setCustomId(`conf_reply_modal_${msgId}`).setTitle(`Responder #${conf.id} (anónimo)`);
      const textInput = new TextInputBuilder().setCustomId("conf_reply_text").setLabel("Tu respuesta anónima").setStyle(TextInputStyle.Paragraph).setPlaceholder("Escribe tu respuesta...").setMaxLength(1000).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(textInput));
      return interaction.showModal(modal);
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("conf_reply_modal_")) {
      const msgId = interaction.customId.replace("conf_reply_modal_", "");
      const replyText = interaction.fields.getTextInputValue("conf_reply_text");
      const cd = getConfessionData(interaction.guild.id);
      const conf = cd.confessions.find(c => c.messageId === msgId);
      if (!conf) return interaction.reply({ content: "❌ No encontré esa confesión.", flags: MessageFlags.Ephemeral });
      const ch = interaction.guild.channels.cache.get(conf.channelId);
      if (!ch) return interaction.reply({ content: "❌ Canal no encontrado.", flags: MessageFlags.Ephemeral });
      const replyEmbed = new EmbedBuilder()
        .setTitle(`💬 Respuesta a #${conf.id}`)
        .setDescription(`"${replyText}"`)
        .setColor(0x5865F2)
        .setFooter({ text: "Respuesta anónima" })
        .setTimestamp();
      const replyMsg = await ch.send({ embeds: [replyEmbed] }).catch(() => null);
      if (!replyMsg) return interaction.reply({ content: "❌ No se pudo publicar.", flags: MessageFlags.Ephemeral });
      conf.replies.push({ authorId: interaction.user.id, content: replyText, messageId: replyMsg.id, date: new Date().toISOString() });
      saveConfessions();
      return interaction.reply({ content: "✅ Respuesta publicada.", flags: MessageFlags.Ephemeral });
    }
    if (interaction.isButton() && (interaction.customId.startsWith("conf_approve_") || interaction.customId.startsWith("conf_reject_"))) {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      const approved = interaction.customId.startsWith("conf_approve_");
      const num = parseInt(interaction.customId.split("_").pop());
      const cd = getConfessionData(interaction.guild.id);
      const conf = cd.confessions.find(c => c.id === num && c.status === "pending");
      if (!conf) return interaction.reply({ content: "❌ Ya fue gestionada o no existe.", flags: MessageFlags.Ephemeral });
      const gc = getGuildConfig(interaction.guild.id);
      if (approved) {
        const ch = interaction.guild.channels.cache.get(cd.channelId || gc.confChannelId);
        if (!ch) return interaction.reply({ content: "❌ Canal de confesiones no encontrado.", flags: MessageFlags.Ephemeral });
        const msg = await publishConfession(interaction.guild, ch, conf).catch(() => null);
        if (!msg) return interaction.reply({ content: "❌ No se pudo publicar.", flags: MessageFlags.Ephemeral });
        conf.messageId = msg.id;
        conf.channelId = ch.id;
        conf.status = "published";
        try {
          const rch = interaction.guild.channels.cache.get(conf.reviewChannelId);
          const rmsg = rch ? await rch.messages.fetch(conf.reviewMessageId).catch(() => null) : null;
          if (rmsg) await rmsg.delete().catch(() => {});
        } catch {}
        try {
          const u = await client.users.fetch(conf.authorId).catch(() => null);
          if (u) await u.send(`✅ Tu confesión #${conf.id} fue aprobada y publicada.`).catch(() => {});
        } catch {}
        saveConfessions();
        return interaction.reply({ content: `✅ Confesión #${conf.id} aprobada y publicada.`, flags: MessageFlags.Ephemeral });
      } else {
        conf.status = "rejected";
        try { await interaction.message.delete().catch(() => {}); } catch {}
        saveConfessions();
        return interaction.reply({ content: `🗑️ Confesión #${conf.id} rechazada y eliminada.`, flags: MessageFlags.Ephemeral });
      }
    }

    // ===== BORRAR =====
    if (interaction.commandName === "borrar") {
      const link = interaction.options.getString("enlace");
      const match = link.match(/channels\/\d+\/(\d+)\/(\d+)/);
      if (!match) return interaction.reply({ content: "❌ Enlace inválido. Copia el enlace del mensaje de la confesión.", flags: MessageFlags.Ephemeral });
      const [, channelId, messageId] = match;
      const cd = getConfessionData(interaction.guild.id);
      const conf = cd.confessions.find(c => c.messageId === messageId);
      if (!conf) return interaction.reply({ content: "❌ No encontré esa confesión en mi base de datos.", flags: MessageFlags.Ephemeral });
      if (conf.authorId !== interaction.user.id && !isStaff(interaction.member)) {
        return interaction.reply({ content: "❌ Solo puedes borrar tus propias confesiones.", flags: MessageFlags.Ephemeral });
      }
      try {
        const ch = interaction.guild.channels.cache.get(channelId);
        if (ch) {
          const msg = await ch.messages.fetch(messageId);
          if (msg) await msg.delete();
        }
      } catch {}
      const idx = cd.confessions.indexOf(conf);
      if (idx >= 0) cd.confessions.splice(idx, 1);
      saveConfessions();
      return interaction.reply({ content: `🗑️ Confesión #${conf.id} eliminada.`, flags: MessageFlags.Ephemeral });
    }

    // ===== RESPONDER =====
    if (interaction.commandName === "responder") {
      const link = interaction.options.getString("enlace");
      const replyText = interaction.options.getString("respuesta");
      const match = link.match(/channels\/\d+\/(\d+)\/(\d+)/);
      if (!match) return interaction.reply({ content: "❌ Enlace inválido.", flags: MessageFlags.Ephemeral });
      const [, channelId, messageId] = match;
      const cd = getConfessionData(interaction.guild.id);
      const conf = cd.confessions.find(c => c.messageId === messageId);
      if (!conf) return interaction.reply({ content: "❌ No encontré esa confesión.", flags: MessageFlags.Ephemeral });
      const ch = interaction.guild.channels.cache.get(channelId);
      if (!ch) return interaction.reply({ content: "❌ Canal no encontrado.", flags: MessageFlags.Ephemeral });
      const replyEmbed = new EmbedBuilder()
        .setTitle(`💬 Respuesta a Confesión #${conf.id}`)
        .setDescription(replyText)
        .setColor(0x5865F2)
        .setFooter({ text: "Respuesta anónima" })
        .setTimestamp();
      const replyMsg = await ch.send({ embeds: [replyEmbed] });
      conf.replies.push({ authorId: interaction.user.id, content: replyText, messageId: replyMsg.id, date: new Date().toISOString() });
      saveConfessions();
      return interaction.reply({ content: "✅ Respuesta publicada.", flags: MessageFlags.Ephemeral });
    }

    // ===== REPORTAR =====
    if (interaction.commandName === "reportar") {
      const link = interaction.options.getString("enlace");
      const reason = interaction.options.getString("razon");
      const match = link.match(/channels\/\d+\/(\d+)\/(\d+)/);
      if (!match) return interaction.reply({ content: "❌ Enlace inválido.", flags: MessageFlags.Ephemeral });
      const [, channelId, messageId] = match;
      const cd = getConfessionData(interaction.guild.id);
      const conf = cd.confessions.find(c => c.messageId === messageId);
      if (!conf) return interaction.reply({ content: "❌ No encontré esa confesión.", flags: MessageFlags.Ephemeral });
      const alreadyReported = cd.reports.find(r => r.confessionId === conf.id && r.reporterId === interaction.user.id);
      if (alreadyReported) return interaction.reply({ content: "⚠️ Ya reportaste esta confesión.", flags: MessageFlags.Ephemeral });
      cd.reports.push({ confessionId: conf.id, reporterId: interaction.user.id, reason, date: new Date().toISOString() });
      saveConfessions();
      const staffRoleId = getGuildConfig(interaction.guild.id).staffRoleId || "";
      const mention = staffRoleId ? `<@&${staffRoleId}>` : "Staff";
      try {
        const reportCh = interaction.guild.channels.cache.find(c => c.name.includes("mod") || c.name.includes("staff") || c.name.includes("log"));
        if (reportCh) {
          const reportEmbed = new EmbedBuilder()
            .setTitle(`🚨 Reporte de Confesión #${conf.id}`)
            .setDescription(`**Confesión:** ${conf.content.substring(0, 500)}${conf.content.length > 500 ? "..." : ""}\n\n**Razón:** ${reason}\n**Reportado por:** ${interaction.user.tag}`)
            .setColor(0xFF0000)
            .setTimestamp();
          await reportCh.send({ content: mention, embeds: [reportEmbed] });
        }
      } catch {}
      return interaction.reply({ content: "✅ Reporte enviado al staff.", flags: MessageFlags.Ephemeral });
    }

    // ===== APELAR =====
    if (interaction.commandName === "apelar") {
      const reason = interaction.options.getString("razon");
      const cd = getConfessionData(interaction.guild.id);
      if (!cd.bans.find(b => b.userId === interaction.user.id)) {
        return interaction.reply({ content: "⚠️ No estás baneado de confesiones.", flags: MessageFlags.Ephemeral });
      }
      const staffRoleId = getGuildConfig(interaction.guild.id).staffRoleId || "";
      const mention = staffRoleId ? `<@&${staffRoleId}>` : "Staff";
      const appealEmbed = new EmbedBuilder()
        .setTitle("📩 Apelación de Baneo de Confesiones")
        .setDescription(`**Usuario:** ${interaction.user.tag} (${interaction.user.id})\n**Razón del baneo:** ${cd.bans.find(b => b.userId === interaction.user.id)?.reason || "N/A"}\n\n**Motivo de apelación:**\n${reason}`)
        .setColor(0xFFAA00)
        .setTimestamp();
      const staffCh = interaction.guild.channels.cache.find(c => c.name.includes("mod") || c.name.includes("staff") || c.name.includes("log"));
      if (staffCh) await staffCh.send({ content: mention, embeds: [appealEmbed] }).catch(() => {});
      return interaction.reply({ content: "✅ Tu apelación fue enviada al staff. Espera su respuesta.", flags: MessageFlags.Ephemeral });
    }

    // ===== CONFESION-BAN =====
    if (interaction.commandName === "confesion" && ["banear", "baneados", "limpiar"].includes(interaction.options.getSubcommand())) {
      const cd = getConfessionData(interaction.guild.id);
      const sub = { banear: "usuario", baneados: "lista", limpiar: "limpiar" }[interaction.options.getSubcommand()];
      if (sub === "usuario") {
        const user = interaction.options.getUser("usuario");
        const reason = interaction.options.getString("razon") || "No especificada";
        if (cd.bans.find(b => b.userId === user.id)) {
          return interaction.reply({ content: `⚠️ ${user.tag} ya está baneado de confesiones.`, flags: MessageFlags.Ephemeral });
        }
        cd.bans.push({ userId: user.id, reason, by: interaction.user.id, date: new Date().toISOString() });
        saveConfessions();
        return interaction.reply({ content: `🚫 **${user.tag}** fue baneado de confesiones.\n**Razón:** ${reason}` });
      }
      if (sub === "lista") {
        if (cd.bans.length === 0) return interaction.reply({ content: "✅ No hay usuarios baneados de confesiones.", flags: MessageFlags.Ephemeral });
        const banList = cd.bans.map((b, i) => `${i + 1}. <@${b.userId}> — ${b.reason || "Sin razón"} (por <@${b.by}>)`).join("\n");
        const embed = new EmbedBuilder()
          .setTitle("🚫 Baneados de Confesiones")
          .setDescription(banList)
          .setColor(0xFF0000)
          .setFooter({ text: `${cd.bans.length} usuario(s) baneado(s)` });
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      if (sub === "limpiar") {
        const count = cd.bans.length;
        cd.bans = [];
        saveConfessions();
        return interaction.reply({ content: `✅ Se limpiaron ${count} baneo(s) de confesiones.` });
      }
    }

    // ===== CONFESION-UNBAN =====
    if (interaction.commandName === "confesion" && interaction.options.getSubcommand() === "desbanear") {
      const user = interaction.options.getUser("usuario");
      const cd = getConfessionData(interaction.guild.id);
      const banIdx = cd.bans.findIndex(b => b.userId === user.id);
      if (banIdx < 0) return interaction.reply({ content: `⚠️ ${user.tag} no está baneado de confesiones.`, flags: MessageFlags.Ephemeral });
      cd.bans.splice(banIdx, 1);
      saveConfessions();
      return interaction.reply({ content: `✅ **${user.tag}** fue desbaneado de confesiones.` });
    }

    // ===== CONFESION-HISTORIAL =====
    if (interaction.commandName === "confesion" && interaction.options.getSubcommand() === "historial") {
      const targetUser = interaction.options.getUser("usuario") || interaction.user;
      const isTargetStaff = isStaff(interaction.member);
      const cd = getConfessionData(interaction.guild.id);
      const userConfs = cd.confessions.filter(c => c.authorId === targetUser.id);
      if (userConfs.length === 0) {
        return interaction.reply({ content: `📭 ${targetUser.id === interaction.user.id ? "No tienes" : `${targetUser.tag} no tiene`} confesiones.`, flags: MessageFlags.Ephemeral });
      }
      if (targetUser.id !== interaction.user.id && !isTargetStaff) {
        return interaction.reply({ content: "❌ Solo puedes ver tu propio historial o el de alguien si eres staff.", flags: MessageFlags.Ephemeral });
      }
      const PAGE_SIZE = 5;
      let page = 0;
      const totalPages = Math.ceil(userConfs.length / PAGE_SIZE);
      function getHistoryPage(p) {
        const start = p * PAGE_SIZE;
        const slice = userConfs.slice(start, start + PAGE_SIZE);
        return new EmbedBuilder()
          .setTitle(`💌 Historial de ${targetUser.tag} (${p + 1}/${totalPages})`)
          .setDescription(slice.map(c => `**#${c.id}** — ${c.content.substring(0, 150)}${c.content.length > 150 ? "..." : ""}\n📅 ${new Date(c.date).toLocaleDateString("es-ES")} • 💬 ${c.replies.length} respuestas`).join("\n\n"))
          .setColor(0x5865F2)
          .setFooter({ text: `${userConfs.length} confesiones en total` });
      }
      const prevBtn = new ButtonBuilder().setCustomId("conf_hist_prev").setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(true);
      const nextBtn = new ButtonBuilder().setCustomId("conf_hist_next").setLabel("➡️").setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1);
      const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);
      const reply = await interaction.reply({ embeds: [getHistoryPage(0)], components: [row], fetchReply: true });
      const collector = reply.createMessageComponentCollector({ time: 120000 });
      collector.on("collect", async (i) => {
        try {
          if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ No es tu menú.", flags: MessageFlags.Ephemeral });
          if (i.customId === "conf_hist_prev") page = Math.max(0, page - 1);
          if (i.customId === "conf_hist_next") page = Math.min(totalPages - 1, page + 1);
          prevBtn.setDisabled(page === 0);
          nextBtn.setDisabled(page === totalPages - 1);
          await i.update({ embeds: [getHistoryPage(page)], components: [row] });
        } catch (e) { console.error("Confession history collector error:", e.message); }
      });
      return;
    }

    // ===== AFK =====
    if (interaction.commandName === "afk") {
      const reason = interaction.options.getString("razon") || "AFK";
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      afkUsers.set(key, { reason, timestamp: Date.now() });
      return interaction.reply({ content: botMsg(interaction.guildId, "afk_cmd", { reason }) || "💤 AFK", flags: MessageFlags.Ephemeral });
    }

    // ===== REACTION ROLE =====
    if (interaction.commandName === "reactionrole") {
      const gc = getGuildConfig(interaction.guild.id);
      if (!gc.reactionRoles) gc.reactionRoles = [];
      const sub = interaction.options.getSubcommand();
      if (sub === "agregar") {
        const msgId = interaction.options.getString("mensaje-id");
        const emoji = interaction.options.getString("emoji");
        const role = interaction.options.getRole("rol");
        const type = interaction.options.getString("tipo") || "normal";
        const exists = gc.reactionRoles.find(r => r.messageId === msgId && r.emoji === emoji);
        if (exists) return interaction.reply({ content: "⚠️ Ya existe un reaction role para ese mensaje y emoji.", flags: MessageFlags.Ephemeral });
        gc.reactionRoles.push({ messageId: msgId, emoji, roleId: role.id, type });
        saveGuilds();
        try {
          const msg = await interaction.channel.messages.fetch(msgId);
          if (msg) await msg.react(emoji);
        } catch {}
        return interaction.reply({ content: `✅ Reaction role creado: ${emoji} → ${role}`, flags: MessageFlags.Ephemeral });
      }
      if (sub === "quitar") {
        const msgId = interaction.options.getString("mensaje-id");
        const emoji = interaction.options.getString("emoji");
        const idx = gc.reactionRoles.findIndex(r => r.messageId === msgId && r.emoji === emoji);
        if (idx < 0) return interaction.reply({ content: "⚠️ No encontrado.", flags: MessageFlags.Ephemeral });
        gc.reactionRoles.splice(idx, 1);
        saveGuilds();
        return interaction.reply({ content: "✅ Reaction role eliminado.", flags: MessageFlags.Ephemeral });
      }
      if (sub === "lista") {
        if (!gc.reactionRoles.length) return interaction.reply({ content: "📭 No hay reaction roles.", flags: MessageFlags.Ephemeral });
        const list = gc.reactionRoles.map((r, i) => `${i + 1}. ${r.emoji} → <@&${r.roleId}> (${r.type})`).join("\n");
        return interaction.reply({ content: list, flags: MessageFlags.Ephemeral });
      }
    }

    // ===== AUTO-RESPOND =====
    if (interaction.commandName === "autorespond") {
      const gc = getGuildConfig(interaction.guild.id);
      if (!gc.autoResponses) gc.autoResponses = [];
      const sub = interaction.options.getSubcommand();
      if (sub === "agregar") {
        const trigger = interaction.options.getString("trigger");
        const response = interaction.options.getString("respuesta");
        const canal = interaction.options.getChannel("canal");
        const mention = interaction.options.getBoolean("mencion") || false;
        const delTrigger = interaction.options.getBoolean("eliminar-trigger") || false;
        const exists = gc.autoResponses.find(r => r.trigger === trigger);
        if (exists) return interaction.reply({ content: "⚠️ Ya existe una respuesta para ese trigger.", flags: MessageFlags.Ephemeral });
        gc.autoResponses.push({ trigger, response, channelIds: canal ? [canal.id] : [], requiresMention: mention, deleteTrigger: delTrigger, matchType: "contains" });
        saveGuilds();
        return interaction.reply({ content: `✅ Auto-respuesta creada: "${trigger}" → "${response.substring(0, 50)}..."`, flags: MessageFlags.Ephemeral });
      }
      if (sub === "quitar") {
        const trigger = interaction.options.getString("trigger");
        const idx = gc.autoResponses.findIndex(r => r.trigger === trigger);
        if (idx < 0) return interaction.reply({ content: "⚠️ Trigger no encontrado.", flags: MessageFlags.Ephemeral });
        gc.autoResponses.splice(idx, 1);
        saveGuilds();
        return interaction.reply({ content: "✅ Auto-respuesta eliminada.", flags: MessageFlags.Ephemeral });
      }
      if (sub === "lista") {
        if (!gc.autoResponses.length) return interaction.reply({ content: "📭 No hay auto-respuestas.", flags: MessageFlags.Ephemeral });
        const list = gc.autoResponses.map((r, i) => `${i + 1}. "${r.trigger}" → "${r.response.substring(0, 40)}..."`).join("\n");
        return interaction.reply({ content: list, flags: MessageFlags.Ephemeral });
      }
    }

    // ===== JOINRANK =====
    if (interaction.commandName === "joinrank") {
      const gc = getGuildConfig(interaction.guild.id);
      const joinableRoles = gc.joinableRoles || [];
      const emoji = interaction.options.getString("emoji");
      const rr = joinableRoles.find(r => r.emoji === emoji);
      if (!rr) return interaction.reply({ content: "⚠️ No hay un rol con ese emoji. Usa la lista de rangos disponibles.", flags: MessageFlags.Ephemeral });
      const member = interaction.member;
      if (member.roles.cache.has(rr.roleId)) {
        await member.roles.remove(rr.roleId).catch(() => {});
        return interaction.reply({ content: `➖ Rol **${rr.name || "rango"}** removido.`, flags: MessageFlags.Ephemeral });
      } else {
        await member.roles.add(rr.roleId).catch(() => {});
        return interaction.reply({ content: `➕ Rol **${rr.name || "rango"}** asignado.`, flags: MessageFlags.Ephemeral });
      }
    }

    // ===== TEMPVOICE INTERFACE (panel estilo TempVoice, en español) =====
    if (interaction.commandName === "tempvoice-setup") {
      if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Solo staff.", flags: MessageFlags.Ephemeral });
      const dest = interaction.options.getChannel("canal") || interaction.channel;
      if (!dest || !dest.isTextBased()) return interaction.reply({ content: "❌ Canal inválido.", flags: MessageFlags.Ephemeral });
      await dest.send(buildTempInterface(interaction.guildId));
      return interaction.reply({ content: `✅ Panel publicado en ${dest}.`, flags: MessageFlags.Ephemeral });
    }

    // --- Botones del panel ---
    if (interaction.isButton() && interaction.customId.startsWith("tv_")) {
      const act = interaction.customId;
      const chk = await tempResolve(interaction, act !== "tv_reclamar");
      if (!chk) return;
      const { ch, isOwner } = chk;
      const me = interaction.member;
      if (act === "tv_nombre") {
        const modal = new ModalBuilder().setCustomId("tv_modal_nombre").setTitle("Nombre del canal");
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("nombre").setLabel("Nuevo nombre").setStyle(TextInputStyle.Short).setValue(ch.name.replace(/^🔊 /, "").slice(0, 90)).setMaxLength(90).setRequired(true)
        ));
        return interaction.showModal(modal);
      }
      if (act === "tv_limite") {
        const modal = new ModalBuilder().setCustomId("tv_modal_limite").setTitle("Límite de usuarios (0 = sin límite)");
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("limite").setLabel("Límite (0-99)").setStyle(TextInputStyle.Short).setValue(String(ch.userLimit || 0)).setMaxLength(2).setRequired(true)
        ));
        return interaction.showModal(modal);
      }
      if (act === "tv_priv") {
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId("tv_sel_priv").setPlaceholder("Elige la privacidad...")
            .addOptions([
              { label: "Público (todos lo ven)", value: "publico", emoji: "🌍" },
              { label: "Privado (solo invitados)", value: "privado", emoji: "🔒" },
            ])
        );
        return interaction.reply({ content: "🔒 **Privacidad del canal:**", components: [row], flags: MessageFlags.Ephemeral });
      }
      if (act === "tv_espera") {
        const locked = ch.permissionOverwrites.cache.get(me.guild.roles.everyone.id)?.deny.has(PermissionFlagsBits.Connect);
        await ch.permissionOverwrites.edit(me.guild.roles.everyone.id, { Connect: locked ? null : false }).catch(() => {});
        return interaction.reply({ content: botMsg(interaction.guildId, locked ? "tv_wait_off" : "tv_wait_on") || "✅", flags: MessageFlags.Ephemeral });
      }
      if (act === "tv_chat") {
        const existing = tempVoiceChats.get(me.id);
        const tex = existing ? me.guild.channels.cache.get(existing) : null;
        if (tex) {
          await tex.delete().catch(() => {});
          tempVoiceChats.delete(me.id);
          saveTempVoiceMap();
          return interaction.reply({ content: botMsg(interaction.guildId, "tv_chat_off") || "🗑️", flags: MessageFlags.Ephemeral });
        }
        const tch = await me.guild.channels.create({
          name: `💬-${ch.name.replace(/^🔊 /, "").toLowerCase().replace(/[^a-z0-9\-]/g, "").slice(0, 90) || "chat"}`,
          type: 0, parent: ch.parentId,
          permissionOverwrites: [
            { id: me.guild.roles.everyone.id, deny: ["ViewChannel"] },
            { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
            ...[...ch.members.values()].filter(m => !m.user.bot && m.id !== me.id).map(m => ({ id: m.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
          ],
        }).catch(() => null);
        if (!tch) return interaction.reply({ content: botMsg(interaction.guildId, "tv_chat_fail") || "❌", flags: MessageFlags.Ephemeral });
        tempVoiceChats.set(me.id, tch.id);
        saveTempVoiceMap();
        return interaction.reply({ content: botMsg(interaction.guildId, "tv_chat_on", { channel: `${tch}` }) || "✅", flags: MessageFlags.Ephemeral });
      }
      if (act === "tv_confiar" || act === "tv_invitar" || act === "tv_bloquear") {
        const titles = { tv_confiar: "Confiar en usuario", tv_invitar: "Invitar usuario", tv_bloquear: "Bloquear usuario" };
        const modal = new ModalBuilder().setCustomId(`tv_modal_${act.slice(3)}`).setTitle(titles[act]);
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("usuario").setLabel("Mención o ID del usuario").setStyle(TextInputStyle.Short).setPlaceholder("@usuario o 123456789...").setRequired(true)
        ));
        return interaction.showModal(modal);
      }
      if (act === "tv_desconfiar") {
        const allowed = [...ch.members.values()].filter(m => !m.user.bot && m.id !== me.id && ch.permissionOverwrites.cache.get(m.id)?.allow.has(PermissionFlagsBits.Connect));
        if (!allowed.length) return interaction.reply({ content: botMsg(interaction.guildId, "tv_none_special") || "📭", flags: MessageFlags.Ephemeral });
        return tempAskSelect(interaction, "tv_sel_desconfiar", "¿A quién le quitas la confianza?", allowed.map(m => ({ label: (m.displayName || m.user.username).slice(0, 100), value: m.id })));
      }
      if (act === "tv_expulsar") {
        const inVoice = [...ch.members.values()].filter(m => !m.user.bot && m.id !== me.id);
        if (!inVoice.length) return interaction.reply({ content: botMsg(interaction.guildId, "tv_nobody") || "📭", flags: MessageFlags.Ephemeral });
        return tempAskSelect(interaction, "tv_sel_expulsar", "¿A quién expulsas del canal?", inVoice.map(m => ({ label: (m.displayName || m.user.username).slice(0, 100), value: m.id })));
      }
      if (act === "tv_region") {
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId("tv_sel_region").setPlaceholder("Elige la región de voz...")
            .addOptions(TV_REGIONS.map(([label, value]) => ({ label, value })))
        );
        return interaction.reply({ content: "🌍 **Región de voz:**", components: [row], flags: MessageFlags.Ephemeral });
      }
      if (act === "tv_desbloquear") {
        const denied = [...ch.permissionOverwrites.cache.values()].filter(o => o.deny.has(PermissionFlagsBits.Connect) && o.type === 1);
        if (!denied.length) return interaction.reply({ content: botMsg(interaction.guildId, "tv_none_blocked") || "📭", flags: MessageFlags.Ephemeral });
        const opts = [];
        for (const o of denied.slice(0, 25)) {
          const m = await me.guild.members.fetch(o.id).catch(() => null);
          opts.push({ label: ((m?.displayName || m?.user.tag) || o.id).slice(0, 100), value: o.id });
        }
        return tempAskSelect(interaction, "tv_sel_desbloquear", "¿A quién desbloqueas?", opts);
      }
      if (act === "tv_reclamar") {
        if (isOwner) return interaction.reply({ content: botMsg(interaction.guildId, "tv_already_owner") || "👑", flags: MessageFlags.Ephemeral });
        const ownerId = tempOwnerOf(ch.id);
        const ownerIn = ownerId ? ch.members.has(ownerId) : false;
        if (ownerId && ownerIn) return interaction.reply({ content: botMsg(interaction.guildId, "tv_owner_present") || "❌", flags: MessageFlags.Ephemeral });
        if (ownerId) tempVoiceUsers.delete(ownerId);
        tempVoiceUsers.set(me.id, ch.id);
        if (ownerId && tempVoiceChats.has(ownerId)) {
          tempVoiceChats.set(me.id, tempVoiceChats.get(ownerId));
          tempVoiceChats.delete(ownerId);
        }
        await ch.permissionOverwrites.edit(me.id, { ManageChannels: true, MoveMembers: true }).catch(() => {});
        saveTempVoiceMap();
        return interaction.reply({ content: botMsg(interaction.guildId, "tv_claimed", { channel: ch.name }) || "👑", flags: MessageFlags.Ephemeral });
      }
      if (act === "tv_transferir") {
        const inVoice = [...ch.members.values()].filter(m => !m.user.bot && m.id !== me.id);
        if (!inVoice.length) return interaction.reply({ content: botMsg(interaction.guildId, "tv_no_transfer") || "📭", flags: MessageFlags.Ephemeral });
        return tempAskSelect(interaction, "tv_sel_transferir", "¿A quién le pasas la propiedad?", inVoice.map(m => ({ label: (m.displayName || m.user.username).slice(0, 100), value: m.id })));
      }
      if (act === "tv_eliminar") {
        const chatId = tempVoiceChats.get(me.id);
        if (chatId) {
          const tch = me.guild.channels.cache.get(chatId);
          if (tch) await tch.delete().catch(() => {});
          tempVoiceChats.delete(me.id);
        }
        tempVoiceUsers.delete(me.id);
        saveTempVoiceMap();
        try { await interaction.reply({ content: botMsg(interaction.guildId, "tv_deleted") || "🗑️", flags: MessageFlags.Ephemeral }); } catch {}
        await ch.delete().catch(() => {});
        return;
      }
    }

    // --- Selects del panel ---
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("tv_sel_")) {
      const chk = await tempResolve(interaction, true);
      if (!chk) return;
      const { ch } = chk;
      const me = interaction.member;
      const val = interaction.values[0];
      if (val === "none") return interaction.update({ content: "❌ Sin opciones.", components: [] });
      try {
        if (interaction.customId === "tv_sel_priv") {
          if (val === "privado") {
            await ch.permissionOverwrites.edit(me.guild.roles.everyone.id, { ViewChannel: false }).catch(() => {});
            await interaction.update({ content: botMsg(interaction.guildId, "tv_private") || "🔒", components: [] });
          } else {
            await ch.permissionOverwrites.edit(me.guild.roles.everyone.id, { ViewChannel: null, Connect: null }).catch(() => {});
            await interaction.update({ content: botMsg(interaction.guildId, "tv_public") || "🌍", components: [] });
          }
          return;
        }
        if (interaction.customId === "tv_sel_region") {
          await ch.setRTCRegion(val === "auto" ? null : val).catch(() => {});
          return interaction.update({ content: botMsg(interaction.guildId, "tv_region", { region: val }) || "🌍", components: [] });
        }
        if (interaction.customId === "tv_sel_expulsar") {
          const target = await me.guild.members.fetch(val).catch(() => null);
          if (!target || !target.voice.channel || target.voice.channel.id !== ch.id) return interaction.update({ content: botMsg(interaction.guildId, "tv_left") || "❌", components: [] });
          await target.voice.disconnect().catch(() => {});
          return interaction.update({ content: botMsg(interaction.guildId, "tv_kicked", { target: `<@${val}>` }) || "📞", components: [] });
        }
        if (interaction.customId === "tv_sel_desconfiar") {
          await ch.permissionOverwrites.edit(val, { Connect: null }).catch(() => {});
          return interaction.update({ content: botMsg(interaction.guildId, "tv_untrusted", { target: `<@${val}>` }) || "✅", components: [] });
        }
        if (interaction.customId === "tv_sel_desbloquear") {
          await ch.permissionOverwrites.edit(val, { Connect: null }).catch(() => {});
          return interaction.update({ content: botMsg(interaction.guildId, "tv_unblocked", { target: `<@${val}>` }) || "🔓", components: [] });
        }
        if (interaction.customId === "tv_sel_transferir") {
          const target = await me.guild.members.fetch(val).catch(() => null);
          if (!target) return interaction.update({ content: botMsg(interaction.guildId, "tv_user_nf") || "❌", components: [] });
          tempVoiceUsers.delete(me.id);
          tempVoiceUsers.set(val, ch.id);
          if (tempVoiceChats.has(me.id)) {
            tempVoiceChats.set(val, tempVoiceChats.get(me.id));
            tempVoiceChats.delete(me.id);
          }
          await ch.permissionOverwrites.edit(val, { ManageChannels: true, MoveMembers: true }).catch(() => {});
          saveTempVoiceMap();
          return interaction.update({ content: botMsg(interaction.guildId, "tv_transferred", { target: `<@${val}>` }) || "🔄", components: [] });
        }
      } catch {}
      return interaction.update({ content: botMsg(interaction.guildId, "tv_fail") || "❌", components: [] }).catch(() => {});
    }

    // --- Modales del panel ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith("tv_modal_")) {
      const chk = await tempResolve(interaction, true);
      if (!chk) return;
      const { ch } = chk;
      const me = interaction.member;
      const kind = interaction.customId.replace("tv_modal_", "");
      try {
        if (kind === "nombre") {
          const name = interaction.fields.getTextInputValue("nombre").trim().slice(0, 90);
          if (!name) return interaction.reply({ content: botMsg(interaction.guildId, "err_generic") || "❌", flags: MessageFlags.Ephemeral });
          await ch.setName(name);
          return interaction.reply({ content: botMsg(interaction.guildId, "tv_renamed", { name }) || "✅", flags: MessageFlags.Ephemeral });
        }
        if (kind === "limite") {
          const n = Math.max(0, Math.min(99, parseInt(interaction.fields.getTextInputValue("limite")) || 0));
          await ch.setUserLimit(n);
          return interaction.reply({ content: botMsg(interaction.guildId, n === 0 ? "tv_nolimit" : "tv_limit", { limit: n }) || "✅", flags: MessageFlags.Ephemeral });
        }
        if (kind === "confiar" || kind === "invitar" || kind === "bloquear") {
          const target = await tempParseMember(me.guild, interaction.fields.getTextInputValue("usuario"));
          if (!target) return interaction.reply({ content: botMsg(interaction.guildId, "tv_user_nf") || "❌", flags: MessageFlags.Ephemeral });
          if (target.user.bot) return interaction.reply({ content: botMsg(interaction.guildId, "tv_no_bots") || "❌", flags: MessageFlags.Ephemeral });
          if (kind === "bloquear") {
            await ch.permissionOverwrites.edit(target.id, { Connect: false }).catch(() => {});
            if (target.voice.channel && target.voice.channel.id === ch.id) await target.voice.disconnect().catch(() => {});
            return interaction.reply({ content: botMsg(interaction.guildId, "tv_blocked", { target: `<@${target.id}>` }) || "🚫", flags: MessageFlags.Ephemeral });
          }
          await ch.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: true }).catch(() => {});
          return interaction.reply({ content: botMsg(interaction.guildId, kind === "confiar" ? "tv_trusted" : "tv_invited", { target: `<@${target.id}>` }) || "✅", flags: MessageFlags.Ephemeral });
        }
      } catch {}
      return interaction.reply({ content: botMsg(interaction.guildId, "tv_fail") || "❌", flags: MessageFlags.Ephemeral });
    }

    // ===== STICKY =====
    if (interaction.commandName === "sticky") {
      const gc = getGuildConfig(interaction.guild.id);
      if (!gc.stickyMessages) gc.stickyMessages = [];
      const sub = interaction.options.getSubcommand();
      if (sub === "agregar") {
        const channel = interaction.options.getChannel("canal");
        const msg = interaction.options.getString("mensaje");
        const exists = gc.stickyMessages.findIndex(s => s.channelId === channel.id);
        if (exists >= 0) gc.stickyMessages[exists].content = msg;
        else gc.stickyMessages.push({ channelId: channel.id, content: msg });
        saveGuilds();
        return interaction.reply({ content: `✅ Sticky configurado en ${channel}`, flags: MessageFlags.Ephemeral });
      }
      if (sub === "quitar") {
        const channel = interaction.options.getChannel("canal");
        const idx = gc.stickyMessages.findIndex(s => s.channelId === channel.id);
        if (idx < 0) return interaction.reply({ content: "⚠️ No hay sticky en ese canal.", flags: MessageFlags.Ephemeral });
        gc.stickyMessages.splice(idx, 1);
        saveGuilds();
        return interaction.reply({ content: "✅ Sticky eliminado.", flags: MessageFlags.Ephemeral });
      }
      if (sub === "lista") {
        if (!gc.stickyMessages.length) return interaction.reply({ content: "📭 No hay stickies.", flags: MessageFlags.Ephemeral });
        const list = gc.stickyMessages.map((s, i) => `${i + 1}. <#${s.channelId}>: "${s.content.substring(0, 50)}..."`).join("\n");
        return interaction.reply({ content: list, flags: MessageFlags.Ephemeral });
      }
    }

    // ===== MENSAJE-MD =====
    if (interaction.commandName === "md" && interaction.options.getSubcommand() === "mensaje") {
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral });

      const eventoOptions = [...events.keys()].map(id => `${id}`).join(", ");
      const modal = new ModalBuilder()
        .setCustomId("mensaje_md_modal")
        .setTitle("📨 Enviar DM de Inscripción");

      const destinoInput = new TextInputBuilder()
        .setCustomId("destino")
        .setLabel("Destino (@rol o @usuario)")
        .setPlaceholder("@Participante o @NombreDeUsuario")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const textoInput = new TextInputBuilder()
        .setCustomId("texto")
        .setLabel("Texto del mensaje")
        .setPlaceholder("Escribe el mensaje que recibirán por DM...")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(4000)
        .setRequired(true);

      const eventoInput = new TextInputBuilder()
        .setCustomId("evento")
        .setLabel(`ID del evento (${eventoOptions})`)
        .setPlaceholder("EVT-5")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(destinoInput),
        new ActionRowBuilder().addComponents(textoInput),
        new ActionRowBuilder().addComponents(eventoInput)
      );

      return interaction.showModal(modal);
    }

    // ===== MODAL: MENSAJE-MD =====
    if (interaction.isModalSubmit() && interaction.customId === "mensaje_md_modal") {
      try {
        if (!interaction.guild) return interaction.reply({ content: "❌ Este comando solo funciona en un servidor.", flags: MessageFlags.Ephemeral });
        if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const destinoRaw = interaction.fields.getTextInputValue("destino").trim();
        const texto = interaction.fields.getTextInputValue("texto").trim();
        const eventoId = interaction.fields.getTextInputValue("evento").trim();
        console.log(`📨 mensaje-md: destino="${destinoRaw}" evento="${eventoId}"`);

        if (!eventoId || !events.has(eventoId)) {
          return interaction.editReply({ content: `❌ Evento **${eventoId}** no encontrado. Eventos disponibles: ${[...events.keys()].join(", ")}` });
        }

        await interaction.guild.roles.fetch();
        await interaction.guild.members.fetch();

        let destino = null;

      // 1. Discord mention format <@&ID> or <@ID>
      const mentionMatch = destinoRaw.match(/^<@&?(\d+)>$/);
      if (mentionMatch) {
        const id = mentionMatch[1];
        destino = interaction.guild.roles.cache.get(id) || interaction.guild.members.cache.get(id);
      }

      // 2. @(ID) format
      if (!destino) {
        const idMatch = destinoRaw.match(/^@\(?(\d+)\)?$/);
        if (idMatch) {
          const id = idMatch[1];
          destino = interaction.guild.roles.cache.get(id) || interaction.guild.members.cache.get(id);
        }
      }

      // 3. Raw ID
      if (!destino) {
        destino = interaction.guild.roles.cache.get(destinoRaw) || interaction.guild.members.cache.get(destinoRaw);
      }

      // 4. Partial name match (strip @)
      if (!destino) {
        const searchName = destinoRaw.replace(/^@/, "").toLowerCase();
        destino = interaction.guild.roles.cache.find(r => r.name.toLowerCase().includes(searchName));
        if (!destino) {
          destino = interaction.guild.members.cache.find(m => m.displayName.toLowerCase().includes(searchName) || m.user.username.toLowerCase().includes(searchName));
        }
      }

      if (!destino) {
        const roleList = interaction.guild.roles.cache
          .filter(r => r.name !== "@everyone" && !r.managed)
          .map(r => `${r.name} (\`${r.id}\`)`)
          .slice(0, 15)
          .join("\n");
        return interaction.editReply({ content: `❌ No encontré "${destinoRaw}".\n\n**Roles disponibles:**\n${roleList}\n\n*Escribe el nombre o ID de un rol.*` });
      }

      const ev = events.get(eventoId);
      const nombreEvento = ev.nombre;

      let enviados = 0;
      let fallidos = 0;

      if (destino.constructor.name === "Role") {
        const members = await interaction.guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(destino.id) && !m.user.bot);

        if (targetMembers.size === 0) return interaction.editReply({ content: "❌ No hay miembros con ese rol." });

        for (const [id, member] of targetMembers) {
          try {
            const header = `🎮 **INSCRIPCIÓN AL EVENTO — Hydra Studio | ${nombreEvento}**\n\n`;
            const footer = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Hydra Studio • ${nombreEvento}`;

            const btnSi = new ButtonBuilder()
              .setCustomId(`insc_si_${interaction.guild.id}_${eventoId}_${member.id}`)
              .setLabel("✅ Si participaré")
              .setStyle(ButtonStyle.Success);

            const btnNo = new ButtonBuilder()
              .setCustomId(`insc_no_${interaction.guild.id}_${eventoId}_${member.id}`)
              .setLabel("❌ No participaré")
              .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(btnSi, btnNo);
            const sent = await safeSendDM(member, header + texto + footer, [row]);
            if (sent) enviados++; else fallidos++;
          } catch (dmErr) {
            fallidos++;
            console.log(`  ❌ Fallo DM a ${member.user.tag}: ${dmErr.message}`);
          }
          await new Promise(r => setTimeout(r, 3000));
        }

        await interaction.editReply({ content: `✅ Mensajes enviados: **${enviados}** | Fallidos: **${fallidos}** | Evento: **${nombreEvento}** | Rol: ${destino}` });
      } else {
        try {
          const dm = await destino.createDM();
          const header = `🎮 **INSCRIPCIÓN AL EVENTO — Hydra Studio | ${nombreEvento}**\n\n`;
          const footer = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Hydra Studio • ${nombreEvento}`;

          const btnSi = new ButtonBuilder()
            .setCustomId(`insc_si_${interaction.guild.id}_${eventoId}_${destino.id}`)
            .setLabel("✅ Si participaré")
            .setStyle(ButtonStyle.Success);

          const btnNo = new ButtonBuilder()
            .setCustomId(`insc_no_${interaction.guild.id}_${eventoId}_${destino.id}`)
            .setLabel("❌ No participaré")
            .setStyle(ButtonStyle.Danger);

          const row = new ActionRowBuilder().addComponents(btnSi, btnNo);
          await dm.send({ content: header + texto + footer, components: [row] });
          enviados = 1;
          await interaction.editReply({ content: `✅ Mensaje enviado a **${destino.user.tag}**. Evento: **${nombreEvento}**` });
        } catch (dmErr) {
          console.log(`❌ Fallo DM a ${destino.user?.tag}: ${dmErr.message}`);
          await interaction.editReply({ content: `❌ No pude enviar el DM a **${destino.user.tag || destino.name}**: ${dmErr.message}` });
        }
      }

      const owner = await interaction.guild.members.fetch("1307246359895740448").catch(() => null);
      if (owner) {
        try {
          const logEmbed = new EmbedBuilder()
            .setTitle("📤 Envío de Inscripciones")
            .setDescription(`Se enviaron mensajes DM a **${enviados}** miembros.\n\nFallidos: **${fallidos}**\n\nCuando alguien responda, te llegará una notificación.`)
            .setColor(0x00FF00)
            .setTimestamp();
          await owner.send({ embeds: [logEmbed] });
        } catch {}
      }
      return;
      } catch (modalErr) {
        console.error("❌ Error en mensaje_md_modal:", modalErr.message);
        try { if (interaction.deferred) await interaction.editReply({ content: `❌ Error: ${modalErr.message}` }); } catch {}
        return;
      }
    }

    // ===== TEST-MD =====
    if (interaction.commandName === "md" && interaction.options.getSubcommand() === "prueba") {
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral });
      const texto = interaction.options.getString("texto");
      const eventoId = interaction.options.getString("evento") || "EVT-5";
      if (!events.has(eventoId)) return interaction.reply({ content: `❌ Evento **${eventoId}** no encontrado.`, flags: MessageFlags.Ephemeral });

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const dm = await interaction.user.createDM();
        const ev = events.get(eventoId);
        const nombreEvento = ev ? ev.nombre : "PRUEBA";
        const embed = new EmbedBuilder()
          .setTitle(`🎮 Hydra Studio — Inscripción al Evento (PRUEBA)`)
          .setDescription(texto)
          .setColor(0x5865F2)
          .setFooter({ text: `Hydra Studio • ${nombreEvento} • PRUEBA` })
          .setTimestamp();

        const btnSi = new ButtonBuilder()
          .setCustomId(`insc_si_${interaction.guild.id}_${eventoId}_${interaction.user.id}`)
          .setLabel("✅ Si participaré")
          .setStyle(ButtonStyle.Success);

        const btnNo = new ButtonBuilder()
          .setCustomId(`insc_no_${interaction.guild.id}_${eventoId}_${interaction.user.id}`)
          .setLabel("❌ No participaré")
          .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(btnSi, btnNo);
        await dm.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: `✅ Mensaje de prueba enviado a tu DM. Evento: **${nombreEvento}**` });
      } catch {
        await interaction.editReply({ content: "❌ No pude enviarte el DM. Asegúrate de tener los DMs abiertos." });
      }
      return;
    }

    // ===== LIMPIAR-MD =====
    if (interaction.commandName === "md" && interaction.options.getSubcommand() === "limpiar") {
      try {
      if (!interaction.guild) return interaction.reply({ content: "❌ Este comando solo funciona en un servidor.", flags: MessageFlags.Ephemeral});
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral});
      const eventoId = interaction.options.getString("evento");
      if (!events.has(eventoId)) return interaction.reply({ content: `❌ Evento **${eventoId}** no encontrado.`, flags: MessageFlags.Ephemeral});

      await interaction.deferReply({ flags: MessageFlags.Ephemeral});

      const ev = events.get(eventoId);
      const nombreEvento = ev.nombre;

      const role = await interaction.guild.roles.fetch(ev.roleId).catch(() => null);
      if (!role) return interaction.editReply({ content: `❌ No encontré el rol del evento **${nombreEvento}**.` });

      const members = await interaction.guild.members.fetch();
      const targetMembers = members.filter(m => m.roles.cache.has(role.id) && !m.user.bot);

      if (targetMembers.size === 0) return interaction.editReply({ content: "❌ No hay miembros con el rol del evento." });

      let limpiados = 0;
      let fallidos = 0;

      const limpiarEmbed = new EmbedBuilder()
        .setTitle(`❌ Inscripción Cancelada — ${nombreEvento}`)
        .setDescription("Tu inscripción ha sido **eliminada** por el administrador.\nSi quieres inscribirte de nuevo, haz clic en el botón de abajo.")
        .setColor(0xFF0000)
        .setFooter({ text: `Hydra Studio • ${nombreEvento}` })
        .setTimestamp();

      const btnReinscribir = new ButtonBuilder()
        .setLabel("📋 Ir a #inscripciones")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/channels/${interaction.guild.id}/${ev.channelId || interaction.channel.id}`);

      const row = new ActionRowBuilder().addComponents(btnReinscribir);

      for (const [id, member] of targetMembers) {
        try {
          const dm = await member.createDM();
          const messages = await dm.messages.fetch({ limit: 100 });
          const botMessages = messages.filter(m => m.author.id === interaction.client.user.id && m.content.includes(nombreEvento));
          for (const [msgId, msg] of botMessages) {
            await msg.delete().catch(() => {});
          }
          await dm.send({ embeds: [limpiarEmbed], components: [row] });
          limpiados++;
        } catch (dmErr) {
          fallidos++;
          console.log(`  ❌ Fallo limpieza DM a ${member.user.tag}: ${dmErr.message}`);
        }
        await new Promise(r => setTimeout(r, 3000));
      }

      await interaction.editReply({ content: `🧹 Limpieza completada para **${nombreEvento}**\n✅ Limpiados: **${limpiados}** | ❌ Fallidos: **${fallidos}**\nReenvié un embed de reinscripción a cada miembro.` });

      const owner = await interaction.guild.members.fetch("1307246359895740448").catch(() => null);
      if (owner) {
        try {
          await owner.send({ content: `🧹 Limpieza de DMs completada para **${nombreEvento}**: ${limpiados} limpiados, ${fallidos} fallidos.` });
        } catch {}
      }
      return;
      } catch (err) {
        console.error("❌ Error en limpiar-md:", err.message);
        try { if (interaction.deferred) await interaction.editReply({ content: `❌ Error: ${err.message}` }); } catch {}
      }
    }

    // ===== RECORDAR-MD =====
    if (interaction.commandName === "md" && interaction.options.getSubcommand() === "recordar") {
      try {
      if (!interaction.guild) return interaction.reply({ content: "❌ Este comando solo funciona en un servidor.", flags: MessageFlags.Ephemeral});
      if (interaction.user.id !== "1307246359895740448") return interaction.reply({ content: "❌ Solo el dueño del bot puede usar esto.", flags: MessageFlags.Ephemeral});
      const eventoId = interaction.options.getString("evento");
      const textoCustom = interaction.options.getString("texto");
      if (!events.has(eventoId)) return interaction.reply({ content: `❌ Evento **${eventoId}** no encontrado.`, flags: MessageFlags.Ephemeral});

      await interaction.deferReply({ flags: MessageFlags.Ephemeral});

      const ev = events.get(eventoId);
      const nombreEvento = ev.nombre;
      const confirmed = new Set(ev.confirmed || []);
      const role = await interaction.guild.roles.fetch(ev.roleId).catch(() => null);
      if (!role) return interaction.editReply({ content: `❌ No encontré el rol del evento **${nombreEvento}**.` });

      const members = await interaction.guild.members.fetch();
      const allRoleMembers = members.filter(m => m.roles.cache.has(role.id) && !m.user.bot);
      const sinConfirmar = allRoleMembers.filter(m => !confirmed.has(m.id));

      if (sinConfirmar.size === 0) return interaction.editReply({ content: `✅ Todos los miembros del rol **${nombreEvento}** ya confirmaron su inscripción (${confirmed.size} confirmados).` });

      const textoRecordatorio = textoCustom || `Hola **{user}**, te recordamos que **aún no has confirmado** tu inscripción en **${nombreEvento}**.\n\nSi quieres participar, haz clic en el botón de abajo. Si ya no deseas participar, simplemente ignora este mensaje.`;

      let enviados = 0;
      let fallidos = 0;

      for (const [id, member] of sinConfirmar) {
        try {
          const textoFinal = textoRecordatorio.replace("{user}", member.displayName);
          const header = `🎮 **RECORDATORIO — ${nombreEvento}**\n\n`;
          const footer = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎮 Hydra Studio • ${nombreEvento}`;

          const btnSi = new ButtonBuilder()
            .setCustomId(`insc_si_${interaction.guild.id}_${eventoId}_${member.id}`)
            .setLabel("✅ Si participaré")
            .setStyle(ButtonStyle.Success);

          const btnNo = new ButtonBuilder()
            .setCustomId(`insc_no_${interaction.guild.id}_${eventoId}_${member.id}`)
            .setLabel("❌ No participaré")
            .setStyle(ButtonStyle.Danger);

          const row = new ActionRowBuilder().addComponents(btnSi, btnNo);
          const sent = await safeSendDM(member, header + textoFinal + footer, [row]);
          if (sent) enviados++; else fallidos++;
        } catch (dmErr) {
          fallidos++;
          console.log(`  ❌ Fallo recordatorio DM a ${member.user.tag}: ${dmErr.message}`);
        }
        await new Promise(r => setTimeout(r, 3000));
      }

      await interaction.editReply({ content: `📤 Recordatorios enviados: **${enviados}** | Fallidos: **${fallidos}** | Sin confirmar: **${sinConfirmar.size}**/${allRoleMembers.size} | Evento: **${nombreEvento}**` });

      const owner = await interaction.guild.members.fetch("1307246359895740448").catch(() => null);
      if (owner) {
        try {
          const logEmbed = new EmbedBuilder()
            .setTitle("📤 Recordatorios de Inscripción")
            .setDescription(`Se enviaron recordatorios a **${enviados}** miembros que no habían confirmado.\n\nFallidos: **${fallidos}**\n\nCuando alguien responda, te llegará una notificación.`)
            .setColor(0xFFAA00)
            .setTimestamp();
          await owner.send({ embeds: [logEmbed] });
        } catch {}
      }
      return;
      } catch (err) {
        console.error("❌ Error en recordar-md:", err.message);
        try { if (interaction.deferred) await interaction.editReply({ content: `❌ Error: ${err.message}` }); } catch {}
      }
    }

    // ===== MC-NICK =====
    if (interaction.commandName === "mc-nick") {
      const sub = interaction.options.getSubcommand();

      if (sub === "guardar") {
        const nick = interaction.options.getString("nick");
        if (nick.length > 32) return interaction.reply({ content: "❌ El nick no puede tener más de 32 caracteres.", flags: MessageFlags.Ephemeral });
        setMcNick(interaction.guildId, interaction.user.id, nick);
        return interaction.reply({ content: `✅ Tu nick de Minecraft ha sido guardado como **${nick}**.`, flags: MessageFlags.Ephemeral });
      }

      if (sub === "ver") {
        const user = interaction.options.getUser("usuario") || interaction.user;
        const nick = getMcNick(interaction.guildId, user.id);
        if (!nick) return interaction.reply({ content: `❌ ${user.tag} no tiene un nick de Minecraft guardado.`, flags: MessageFlags.Ephemeral });
        const embed = new EmbedBuilder()
          .setTitle("⛏️ Nick de Minecraft")
          .setDescription(`**${user.tag}** → **${nick}**`)
          .setColor(0x00FF00)
          .setThumbnail(user.displayAvatarURL({ size: 128 }))
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      if (sub === "lista") {
        const prefix = `${interaction.guildId}:`;
        const entries = Object.entries(mcNicks).filter(([k]) => k.startsWith(prefix));
        if (entries.length === 0) return interaction.reply({ content: "📋 No hay nicks guardados aún.", flags: MessageFlags.Ephemeral });
        const lines = entries.map(([k, nick]) => `<@${k.slice(prefix.length)}> → **${nick}**`);
        const embed = new EmbedBuilder()
          .setTitle("⛏️ Nicks de Minecraft Guardados")
          .setDescription(lines.join("\n"))
          .setColor(0x5865F2)
          .setFooter({ text: `${entries.length} nick(s) guardado(s)` })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    }

    // ===== CONFESSION REACTION REPLIES =====
    if (interaction.isButton() && interaction.customId === "conf_reply") {
      const modal = new ModalBuilder().setCustomId(`conf_reply_modal_${interaction.message.id}`).setTitle("Responder a Confesión");
      const textInput = new TextInputBuilder().setCustomId("conf_reply_text").setLabel("Tu respuesta anónima").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(textInput));
      return interaction.showModal(modal);
    }

    // ===== CONFESSION REPLY MODAL SUBMIT =====
    if (interaction.isModalSubmit() && interaction.customId.startsWith("conf_reply_modal_")) {
      const origMsgId = interaction.customId.replace("conf_reply_modal_", "");
      const content = interaction.fields.getTextInputValue("conf_reply_text");
      const cd = getConfessionData(interaction.guild.id);
      const conf = cd.confessions.find(c => c.messageId === origMsgId);
      if (!conf) return interaction.reply({ content: "❌ Confesión no encontrada.", flags: MessageFlags.Ephemeral });
      const replyEmbed = new EmbedBuilder()
        .setTitle(`💬 Respuesta a Confesión #${conf.id}`)
        .setDescription(content)
        .setColor(0x5865F2)
        .setFooter({ text: "Respuesta anónima" })
        .setTimestamp();
      const replyMsg = await interaction.channel.send({ embeds: [replyEmbed] });
      conf.replies.push({ authorId: interaction.user.id, content, messageId: replyMsg.id, date: new Date().toISOString() });
      saveConfessions();
      return interaction.reply({ content: "✅ Respuesta publicada.", flags: MessageFlags.Ephemeral });
    }

  } catch (err) {
    if (err.message && !err.message.includes("Unknown interaction") && !err.message.includes("already been acknowledged")) {
      console.error("❌ Error:", err.message);
    }
    try {
      const isBtn = interaction.isButton() || (interaction.customId && (interaction.customId.startsWith("insc_si_") || interaction.customId.startsWith("insc_no_")));
      if (interaction.deferred && !isBtn) await interaction.editReply({ content: "❌ Error." });
      else if (interaction.replied && isBtn) {}
      else if (!interaction.replied && !interaction.isModalSubmit() && !isBtn) await interaction.reply({ content: "❌ Error.", flags: MessageFlags.Ephemeral });
    } catch {}
  }
}

// Registro con proteccion: si algo falla, el usuario recibe un aviso y la consola
// deja el error completo en vez de tragarselo.
client.on(Events.InteractionCreate, async (interaction) => {
  if (process.env.DEBUG_INTERACTIONS === "1") {
    console.log(`>> ${interaction.commandName || interaction.customId || interaction.type} de ${interaction.user.tag}`);
  }
  try {
    await manejarInteraccion(interaction);
  } catch (err) {
    console.error("❌ Error en una interaccion:", err && err.stack ? err.stack : err);
    const msg = "❌ Ha ocurrido un error al procesar tu solicitud. Se ha registrado en la consola.";
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      else if (interaction.isModalSubmit()) await interaction.editReply({ content: msg }).catch(() => {});
      else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    } catch {}
  }
});

// ============== MUSIC PLAYER ==============
let LAST_MUSIC_ERROR = null;
// Ajustes de música por servidor (proxy de salida y fallback SoundCloud).
// Si YouTube bloquea la IP del host, el dueño puede poner un proxy en el panel.
let MUSIC_PROXY = "";
let MUSIC_SC_FALLBACK = true;
function applyMusicSettings(guildId) {
  try {
    const gc = getGuildConfig(guildId);
    MUSIC_PROXY = String(gc.musicProxy || "").trim();
    MUSIC_SC_FALLBACK = gc.musicSoundcloudFallback !== false;
  } catch {}
}
// Memoria de bloqueo: si YouTube exige "sign in", no reintentamos en cada canción
// (5 min de tregua: se usa SoundCloud o el proxy si el dueño lo configuró).
let YT_BLOCKED_UNTIL = 0;
const YT_BLOCK_MSG = /sign in|not a bot|confirm you|http 403|http 429|too many requests|blocked|bloque/i;
function markYoutubeBlocked(msg) {
  if (YT_BLOCK_MSG.test(String(msg || "")) && !MUSIC_PROXY) {
    YT_BLOCKED_UNTIL = Date.now() + 5 * 60 * 1000;
    console.log("🎵 YouTube bloqueó la IP del host: durante 5 min se omite YouTube y se usa SoundCloud/proxy.");
  }
}
function youtubeBlockedNow() { return !MUSIC_PROXY && Date.now() < YT_BLOCKED_UNTIL; }
// --- Resolución de fuentes: yt-dlp (binario) con respaldo de play-dl ---
const YT_DLP_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
let YT_DLP_RESOLVED = null;
function ytdlpPath() {
  if (YT_DLP_RESOLVED) return YT_DLP_RESOLVED;
  const cands = [
    process.env.YT_DLP_PATH || "",
    path.join(__dirname, YT_DLP_NAME),
    path.join(__dirname, "bin", YT_DLP_NAME),
    path.join(__dirname, "node_modules", ".bin", YT_DLP_NAME),
  ].filter(Boolean);
  for (const c of cands) {
    try { if (fs.existsSync(c)) { YT_DLP_RESOLVED = c; return c; } } catch {}
  }
  YT_DLP_RESOLVED = cands[0];
  return YT_DLP_RESOLVED;
}
function ytdlpDisponible() {
  try {
    const p = ytdlpPath();
    return !!(p && (/[/\\]/.test(p) ? fs.existsSync(p) : true));
  } catch { return false; }
}
function ytdlpRun(args, timeoutMs = 45000, proxy = undefined) {
  return new Promise((resolve, reject) => {
    const { spawn } = require("child_process");
    const pxy = proxy !== undefined ? String(proxy || "").trim() : MUSIC_PROXY;
    const finalArgs = pxy ? [...args, "--proxy", pxy] : args;
    let p;
    try { p = spawn(ytdlpPath(), finalArgs, { windowsHide: true, shell: false }); } catch (e) { return reject(e); }
    let out = "", err = "";
    const to = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} reject(new Error("yt-dlp no respondió")); }, timeoutMs);
    p.stdout.on("data", d => { out += d; });
    p.stderr.on("data", d => { err += d; });
    p.on("error", e => { clearTimeout(to); reject(new Error(e.code === "ENOENT" ? "falta el binario yt-dlp" : e.message)); });
    p.on("close", code => {
      clearTimeout(to);
      if (code === 0 && out.trim()) return resolve(out);
      const last = (err || out).trim().split("\n").filter(Boolean).pop() || `yt-dlp código ${code}`;
      reject(new Error(last));
    });
  });
}
// Spotify no se puede descargar (DRM): se lee el título con oEmbed y se busca en YouTube.
async function spotifyResolve(query) {
  const r = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "HYDRA-Bot/1.0" },
  }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  const title = (j && j.title) || "";
  if (!title) throw new Error("No pude leer ese enlace de Spotify");
  const qs = `${title} official audio`;
  if (ytdlpDisponible() && !youtubeBlockedNow()) {
    try {
      const raw = await ytdlpYT(base => ["--dump-json", ...base, `ytsearch1:${qs}`], 40000);
      const info = JSON.parse(raw.trim().split("\n").filter(Boolean)[0]);
      if (info && (info.webpage_url || info.url)) {
        return {
          url: info.webpage_url || info.url,
          title: info.title || title,
          duration: info.duration ? formatDuration(info.duration * 1000) : "",
          thumbnail: (j && j.thumbnail_url) || info.thumbnail || "",
        };
      }
    } catch (e) { markYoutubeBlocked(e.message); }
  }
  const res = youtubeBlockedNow() ? [] : await play.search(qs, { limit: 1 }).catch(() => []);
  if (res.length) {
    return {
      url: res[0].url,
      title: res[0].title || title,
      duration: res[0].durationRaw || "",
      thumbnail: (j && j.thumbnail_url) || (res[0].thumbnails && res[0].thumbnails[0] && res[0].thumbnails[0].url) || "",
    };
  }
  const iv = await invidiousSearchFirst(title);
  if (iv) return iv;
  if (MUSIC_SC_FALLBACK) {
    const sc = await soundcloudSearch(`${title}`);
    if (sc) { console.log(`🎵 Spotify→YouTube falló, usando SoundCloud: ${sc.title}`); return sc; }
  }
  throw new Error("No encontré esa canción en YouTube");
}

// Resuelve enlaces de YouTube usando play-dl primero (mejor bot detection)
async function resolveYouTube(url) {
  let meta = null;
  // Metadatos con yt-dlp (clientes nuevos): título, duración y miniatura reales.
  if (ytdlpDisponible() && !youtubeBlockedNow()) {
    try { meta = JSON.parse((await ytdlpYT(base => ["--dump-json", ...base, url], 25000)).trim().split("\n").filter(Boolean)[0]); }
    catch (e) { markYoutubeBlocked(e.message); }
  }
  // oEmbed: funciona aunque YouTube bloquee la IP (solo metadatos, sin player)
  if (!meta) {
    const oe = await youtubeOEmbedMeta(url);
    if (oe && oe.title) meta = { title: oe.title, thumbnail: oe.thumbnail, duration: "" };
  }
  return {
    url,
    title: (meta && meta.title) || url,
    duration: (meta && meta.duration) || "",
    thumbnail: (meta && (meta.thumbnail || meta.thumbnails)) || "",
  };
}

// Resuelve SoundCloud / Apple Music / otros que yt-dlp soporte nativamente
async function resolveGenericYTDLP(url, sourceName) {
  if (!ytdlpDisponible()) throw new Error(`Falta yt-dlp para resolver ${sourceName}`);
  try {
    const raw = await ytdlpRun(["--dump-json", "--no-playlist", url], 40000);
    const info = JSON.parse(raw.trim().split("\n").filter(Boolean)[0]);
    if (info && (info.webpage_url || info.url)) {
      return {
        url: info.webpage_url || info.url,
        title: info.title || url,
        duration: info.duration ? formatDuration(info.duration * 1000) : "",
        thumbnail: info.thumbnail || "",
      };
    }
  } catch (e) {
    console.error(`🎵 ${sourceName} yt-dlp:`, e.message);
    throw new Error(`No pude resolver el enlace de ${sourceName}: ${e.message}`);
  }
  throw new Error(`No pude obtener info de ${sourceName}`);
}
async function searchTrack(query) {
  // Se intenta YouTube primero (yt-dlp con los clientes nuevos). Si YouTube
  // está bloqueado o falla, siguen play-dl → Invidious → SoundCloud.
  if (ytdlpDisponible()) {
    try {
      const raw = await ytdlpYT(base => ["--dump-json", ...base, `ytsearch1:${query}`], 40000);
      const info = JSON.parse(raw.trim().split("\n").filter(Boolean)[0]);
      if (info && (info.webpage_url || info.url)) {
        return {
          url: info.webpage_url || info.url,
          title: info.title || query,
          duration: info.duration ? formatDuration(info.duration * 1000) : "",
          thumbnail: info.thumbnail || "",
        };
      }
    } catch (e) { markYoutubeBlocked(e.message); }
  }
  const res = youtubeBlockedNow() ? [] : await play.search(query, { limit: 1 }).catch(() => []);
  if (res.length) {
    return {
      url: res[0].url,
      title: res[0].title,
      duration: res[0].durationRaw || "",
      thumbnail: (res[0].thumbnails && res[0].thumbnails[0] && res[0].thumbnails[0].url) || "",
    };
  }
  const iv = await invidiousSearchFirst(query);
  if (iv) return iv;
  if (MUSIC_SC_FALLBACK) {
    const sc = await soundcloudSearch(query);
    if (sc) { console.log(`🎵 YouTube sin resultados, usando SoundCloud: ${sc.title}`); return sc; }
  }
  throw new Error(youtubeBlockedNow()
    ? "YouTube está bloqueado desde este host y no hay ninguna coincidencia clara en SoundCloud"
    : "No encontré nada.");
}
// URL de audio directa para ffmpeg. Si yt-dlp falla, devuelve un stream de play-dl.
// Argumentos comunes para yt-dlp.
// Clientes de reproductor por orden de fiabilidad (yt-dlp 2026.08): «visionos»
// responde sin cookies ni PO token; «web_embedded» funciona con el runtime JS de
// Node. android_vr quedó roto (403) y tv_embedded ya no existe en yt-dlp.
const YTDLP_YT_ARGS = [
  "--extractor-args", "youtube:player_client=visionos,web_embedded",
  "--js-runtimes", "node",
  "--no-check-certificates",
  "--geo-bypass",
  "--no-playlist",
];

// Clientes usados si la llamada combinada falla: se prueban uno a uno.
const YT_CLIENT_LIST = ["visionos", "web_embedded", "android"];
function ytdlpYTArgsFor(client) {
  return ["--extractor-args", `youtube:player_client=${client}`, "--js-runtimes", "node", "--no-check-certificates", "--geo-bypass", "--no-playlist"];
}

// Llamada a yt-dlp pensada para YouTube: 1º con todos los clientes juntos y,
// si falla, uno a uno (hay hosts donde solo un cliente pasa la verificación).
// argsBuilder recibe la lista de argumentos base y devuelve los argumentos finales.
async function ytdlpYT(argsBuilder, timeoutMs = 25000) {
  let firstErr = null;
  try {
    return await ytdlpRun(argsBuilder(YTDLP_YT_ARGS), timeoutMs);
  } catch (e) {
    firstErr = e;
  }
  for (const c of YT_CLIENT_LIST) {
    try {
      return await ytdlpRun(argsBuilder(ytdlpYTArgsFor(c)), Math.min(timeoutMs, 18000));
    } catch (e) {
      if (!firstErr) firstErr = e;
    }
  }
  // El aviso de "YouTube bloqueado" solo se marca cuando fallan TODOS los
  // clientes: antes un fallo puntual bloqueaba YouTube 5 min aunque otro
  // cliente (p. ej. visionos) sí pudiera resolver el audio.
  markYoutubeBlocked(firstErr && firstErr.message);
  throw firstErr || new Error("yt-dlp no pudo con YouTube");
}

// Metadatos de YouTube vía oEmbed: no dispara la verificación anti-bots
// (sirve para tener el título aunque el host esté bloqueado).
async function youtubeOEmbedMeta(url) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
      headers: { "User-Agent": "HYDRA-Bot/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return { title: j.title || "", author: j.author_name || "", thumbnail: j.thumbnail_url || "" };
  } catch { return null; }
}

// Normaliza títulos para compararlos (quita acentos, "official video", paréntesis...)
function normTrackTitle(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/official (video|audio|lyric video|music video)|lyrics?|visualizer|hd|4k|explicit/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Norm estricta para comparar títulos: conserva palabras como "remix" o "edit",
// que marcan una canción DISTINTA de la original.
function normStrictTitle(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}
// Ruido de títulos (calidad/canales) que no cambia la canción.
const SC_NOISE = new Set(["official", "video", "audio", "oficial", "lirico", "lyric", "lyrics", "visualizer", "hd", "4k", "8k", "explicit", "remaster", "remastered", "version", "vs", "ft", "feat", "featuring", "prod", "produced", "by", "the", "canto", "cantoyo", "vevo"]);
// Palabras que indican OTRA canción (remezcla, cover...).
const SC_DIFF = new Set(["remix", "remixed", "edit", "editado", "cover", "covers", "bootleg", "mashup", "sped", "slowed", "nightcore", "extended", "live", "acoustic", "instrumental", "dj", "flip", "rework", "rmx", "version"]);

// Busca en SoundCloud (scsearch5) y elige la mejor coincidencia del título.
// Fallback principal cuando YouTube bloquea la IP del host: SoundCloud no bloquea por IP.
async function soundcloudSearch(query, { direct = false } = {}) {
  const q = String(query || "").trim();
  if (!q || !ytdlpDisponible()) return null;
  // Se busca con el título limpio: ruido como "(Official Video)" estropea la búsqueda.
  const clean = normTrackTitle(q);
  const search = clean.length >= 12 ? clean : q;
  try {
    const raw = await ytdlpRun(["--dump-json", "--no-playlist", `scsearch10:${search}`], 45000);
    const items = raw.trim().split("\n").filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(it => it && (it.webpage_url || it.url));
    if (!items.length) return null;
    const pick = (list) => {
      const nq = clean;
      const nqw = nq.split(" ").filter(w => w.length > 2);
      // Mismo tema = todas las palabras del título (sin ruido) están en la búsqueda y
      // no aparece ninguna palabra de "otra canción" (remix, cover...). SoundCloud
      // limita a 30 s las pistas de artistas verificados: si el mismo tema solo
      // existe como vista previa, se usa esa y se avisa en el pie del mensaje.
      const qStrict = normStrictTitle(q);
      const qDiff = qStrict.split(" ").some(w => SC_DIFF.has(w));
      const qCore = new Set(qStrict.split(" ").filter(w => w && !SC_NOISE.has(w) && !SC_DIFF.has(w)));
      const mismoTema = list.filter(it => {
        const t = normStrictTitle(it.title);
        if (!t) return false;
        if (!qDiff && t.split(" ").some(w => SC_DIFF.has(w))) return false;
        const cw = t.split(" ").filter(w => w && !SC_NOISE.has(w) && !SC_DIFF.has(w));
        return cw.length > 0 && cw.every(w => qCore.has(w));
      });
      if (!mismoTema.length) return null;
      const completa = mismoTema.filter(it => !it.duration || it.duration > 35);
      const pool = completa.length ? completa : mismoTema;
      if (!pool.length) return null;
      let best = pool[0], bestScore = -1;
      for (const it of pool) {
        const nt = normTrackTitle(it.title);
        let s = 0;
        if (nt === nq) s += 100;
        else if (nq && nt && (nt.includes(nq) || nq.includes(nt))) s += 60;
        else s += nqw.filter(w => nt.includes(w)).length * 12;
        if (it.duration && s >= 60) s += 10;
        if (s > bestScore) { bestScore = s; best = it; }
      }
      if (bestScore < 20) return null;
      return best;
    };
    let best = pick(items);
    // Reintento: si el título completo no casa (el de YouTube suele llevar
    // "(Lyric Video) | Canal"), se busca solo con las palabras más largas.
    if (!best) {
      const words = clean.split(" ").filter(w => w.length > 2 && !SC_NOISE.has(w));
      const short = words.sort((a, b) => b.length - a.length).slice(0, 3).join(" ");
      if (short && short !== search) {
        console.log(`🎵 SoundCloud: reintento con "${short}"`);
        const raw2 = await ytdlpRun(["--dump-json", "--no-playlist", `scsearch10:${short}`], 45000);
        const items2 = raw2.trim().split("\n").filter(Boolean)
          .map(l => { try { return JSON.parse(l); } catch { return null; } })
          .filter(it => it && (it.webpage_url || it.url));
        if (items2.length) {
          // Con la consulta corta se relaja: solo se descartan remezclas/covers.
          const qDiff2 = normStrictTitle(short).split(" ").some(w => SC_DIFF.has(w));
          const cand = items2.filter(it => {
            const t = normStrictTitle(it.title);
            return t && (qDiff2 || !t.split(" ").some(w => SC_DIFF.has(w)));
          });
          if (cand.length) {
            const completa2 = cand.filter(it => !it.duration || it.duration > 35);
            best = (completa2.length ? completa2 : cand)[0];
          }
        }
      }
    }
    if (!best) {
      console.log(`🎵 SoundCloud: solo hay remezclas/covers de "${q}"`);
      return null;
    }
    const res = {
      url: best.webpage_url || best.url,
      title: best.title || q,
      duration: best.duration ? formatDuration(best.duration * 1000) : "",
      thumbnail: best.thumbnail || "",
      source: "SoundCloud",
      preview: !!(best.duration && best.duration <= 35),
    };
    if (!direct) return res;
    const out = await ytdlpRun(["--get-url", "-f", "bestaudio/best", "--no-playlist", res.url], 40000);
    const u = out.trim().split("\n").filter(Boolean)[0];
    if (!u) return null;
    const p = await probeAudioUrl(u);
    if (!p.ok) { console.log(`🎵 SoundCloud: audio descartado (${p.why}) en ${p.host}`); return null; }
    res.directUrl = u;
    return res;
  } catch (e) {
    console.error("🎵 SoundCloud search:", e.message);
    return null;
  }
}

// Último recurso de reproducción si YouTube no deja traer audio desde el host.
async function soundcloudFallbackForSong(song, originalUrl) {
  let query = String((song && song.title) || "").trim();
  if (!query || query === originalUrl || /^https?:\/\//i.test(query)) {
    const oe = await youtubeOEmbedMeta(originalUrl);
    query = oe && oe.title ? `${oe.title} ${oe.author}` : "";
  }
  if (!query) return null;
  console.log(`🎵 YouTube no respondió → buscando en SoundCloud: ${query}`);
  // Variante 1: consulta completa (título del vídeo de YouTube).
  let sc = await soundcloudSearch(query, { direct: true });
  // Variante 2: solo las palabras significativas del título (sin artista/canal).
  if (!sc || !sc.directUrl) {
    const words = normTrackTitle(query).split(" ").filter(w => w.length > 2 && !SC_NOISE.has(w) && !SC_DIFF.has(w));
    const short = words.slice(0, 3).join(" ");
    if (short && short.length >= 4 && short !== normTrackTitle(query)) {
      console.log(`🎵 SoundCloud reintento (fallback) con "${short}"`);
      sc = await soundcloudSearch(short, { direct: true });
    }
  }
  if (!sc || !sc.directUrl) return null;
  console.log(`🎵 ✓ SoundCloud: ${sc.title}${sc.preview ? " (vista previa de 30 s)" : ""}`);
  if (song) {
    song.title = sc.title;
    song.duration = sc.duration || song.duration;
    song.thumbnail = sc.thumbnail || song.thumbnail;
    song.source = "SoundCloud";
    song.sourceLabel = sc.preview ? "SoundCloud (vista previa 30 s)" : "SoundCloud";
  }
  LAST_MUSIC_ERROR = null;
  return { kind: "url", source: sc.directUrl, via: song ? song.sourceLabel : "SoundCloud" };
}

// Instancias Invidious con API viva (comprobado 08/10/2026: solo f5.si devolvía audio).
// Actúan de proxy de YouTube desde SU IP, así el bloqueo por IP del host no afecta.
const INVIDIOUS_INSTANCES = [
  "https://invidious.f5.si",
  "https://inv.nadeko.net",
  "https://invidious.tiekoetter.com",
  "https://invidious.nerdvpn.de",
];

// La lista oficial de instancias cambia: se refresca como máximo cada 6 h y solo
// se añaden las que declaran API activa. Así, si f5.si cae, se prueba otra nueva.
let INV_DYNAMIC = null;
function invidiousInstances() {
  const now = Date.now();
  if (INV_DYNAMIC && now - INV_DYNAMIC.ts < 6 * 3600 * 1000) return [...new Set([...INVIDIOUS_INSTANCES, ...INV_DYNAMIC.list])];
  (async () => {
    try {
      const r = await fetch("https://api.invidious.io/instances.json?sort_by=health", { headers: { "User-Agent": "HYDRA-Bot/1.0" }, signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      const extra = (Array.isArray(j) ? j : [])
        .map(x => x && x[1])
        .filter(x => x && x.api === true && typeof x.uri === "string" && x.uri.startsWith("https://"))
        .map(x => x.uri.replace(/\/$/, ""));
      INV_DYNAMIC = { ts: now, list: extra };
      if (extra.length) console.log(`🎵 Instancias Invidious con API de la lista oficial: ${extra.join(", ")}`);
    } catch (e) {
      INV_DYNAMIC = { ts: now, list: [] };
      console.log(`🎵 No pude refrescar la lista de instancias Invidious: ${e.message}`);
    }
  })();
  return [...INVIDIOUS_INSTANCES];
}

// Extrae video ID de URL de YouTube
function extractYouTubeVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// Convierte URL de YouTube a URL de Invidious
function toInvidiousUrl(youtubeUrl, instance) {
  const videoId = extractYouTubeVideoId(youtubeUrl);
  if (!videoId) return youtubeUrl;
  return `${instance}/watch?v=${videoId}`;
}

// Obtiene stream de audio usando la API de Invidious directamente (bypass yt-dlp)
async function getInvidiousAudioStream(videoId, instance) {
  try {
    // local=true: la instancia reescribe las URLs para servir el audio desde SU
    // proxy (sin eso devuelve URLs de googlevideo, que el host no puede descargar).
    const apiUrl = `${instance}/api/v1/videos/${videoId}?fields=adaptiveFormats&local=true`;
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "HYDRA-Bot/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const formats = data.adaptiveFormats || [];
    // Buscar formato de audio only (solo audio, preferir opus/mp4a) servido por la instancia
    const instHost = new URL(instance).hostname;
    const propio = (f) => { try { return new URL(f.url).hostname === instHost; } catch { return false; } };
    const audioFormats = formats.filter(f => f.type && f.type.startsWith("audio/") && propio(f)).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    if (audioFormats.length > 0) {
      return audioFormats[0].url;
    }
    // Fallback: cualquier formato con audio
    const anyAudio = formats.find(f => f.type && f.type.includes("audio"));
    if (anyAudio) return anyAudio.url;
  } catch (e) {
    console.error(`🎵 Invidious API ${instance}:`, e.message);
  }
  return null;
}

// Metadatos de un vídeo vía Invidious (título, duración y miniatura sin tocar YouTube)
async function invidiousVideoMeta(videoId) {
  for (const instance of invidiousInstances()) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=title,lengthSeconds,videoThumbnails`, {
        headers: { "User-Agent": "HYDRA-Bot/1.0" },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (d && d.title) {
        const thumbs = d.videoThumbnails || [];
        const th = thumbs.find(t => t && t.quality === "maxres") || thumbs[0];
        console.log(`🎵 ✓ Invidious metadatos (${instance}): ${d.title}`);
        return { title: d.title, duration: d.lengthSeconds ? formatDuration(d.lengthSeconds * 1000) : "", thumbnail: (th && th.url) || "" };
      }
    } catch {}
  }
  return null;
}

// Búsqueda en YouTube a través de Invidious: la consulta sale de la IP de la instancia.
async function invidiousSearchFirst(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  for (const instance of invidiousInstances()) {
    try {
      const res = await fetch(`${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, {
        headers: { "User-Agent": "HYDRA-Bot/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const arr = await res.json();
      if (!Array.isArray(arr)) continue;
      const hit = arr.find(v => v && v.videoId && (!v.type || v.type === "video")) || arr[0];
      if (hit && hit.videoId) {
        const thumbs = hit.videoThumbnails || [];
        console.log(`🎵 ✓ Búsqueda vía Invidious (${instance}): ${hit.title}`);
        return {
          url: `https://www.youtube.com/watch?v=${hit.videoId}`,
          title: hit.title || q,
          duration: hit.lengthSeconds ? formatDuration(hit.lengthSeconds * 1000) : "",
          thumbnail: (thumbs[0] && thumbs[0].url) || "",
        };
      }
    } catch {}
  }
  return null;
}

// User-Agent compartido por la sonda y ffmpeg: los CDN de vídeo rechazan el UA por defecto.
const MUSIC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Sondea una URL de audio (Range 0-65535) antes de entregársela a ffmpeg.
// Si el origen devuelve 403/404, una página HTML o un cuerpo vacío, la descartamos
// y seguimos con la siguiente fuente: así un enlace muerto no deja la cola muda.
async function probeAudioUrl(url) {
  const u = String(url || "");
  if (!/^https?:\/\//i.test(u)) return { ok: true, host: "" };
  // Con proxy activo la sonda saltaría de la IP del host: mejor confiar en la URL
  // (además ffmpeg la pedirá a través del mismo proxy).
  if (MUSIC_PROXY) return { ok: true, host: "", why: "proxy activo" };
  let host = "";
  try { host = new URL(u).hostname; } catch {}
  const headers = { "User-Agent": MUSIC_UA, Range: "bytes=0-65535", Accept: "*/*" };
  if (/googlevideo|youtube|ytimg/i.test(host)) headers.Referer = "https://www.youtube.com/";
  try {
    const r = await fetch(u, { headers, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!r.ok) {
      if (/googlevideo|youtube/i.test(host) && (r.status === 403 || r.status === 429)) markYoutubeBlocked(`http ${r.status}`);
      return { ok: false, why: `HTTP ${r.status}`, host };
    }
    const ct = String(r.headers.get("content-type") || "").toLowerCase();
    if (ct && /(text\/html|application\/json)/.test(ct)) return { ok: false, why: `content-type ${ct.split(";")[0]}`, host };
    const reader = r.body && r.body.getReader ? r.body.getReader() : null;
    let first = null;
    if (reader) {
      first = await reader.read().catch(() => null);
      try { await reader.cancel(); } catch {}
    } else {
      try { await r.body?.cancel(); } catch {}
    }
    if (!first || !first.value || !first.value.length) return { ok: false, why: "respuesta vacía", host };
    const head = Buffer.from(first.value.slice(0, 32)).toString("latin1");
    if (/^\s*<(!doctype|html)/i.test(head)) return { ok: false, why: "devolvió HTML en vez de audio", host };
    return { ok: true, host };
  } catch (e) {
    return { ok: false, why: (e && e.message) || String(e), host };
  }
}

// Orden de resolución: yt-dlp (clientes anti-bot) → play-dl → Invidious → SoundCloud.
// Cada fallo se apunta en `diag` para que el mensaje de error del canal diga
// exactamente qué probó el bot y por qué no sirvió cada fuente.
async function resolveAudioSource(song) {
  const isYt = /(youtube\.com|youtu\.be)/i.test(song.url);
  const originalUrl = song.url;
  const diag = [];
  const note = (s) => { if (diag.length < 8) diag.push(String(s).replace(/\s+/g, " ").slice(0, 90)); };
  const shortErr = (e) => String((e && e.message) || e).replace(/\s+/g, " ").slice(0, 70);

  if (isYt) {
    // 1. yt-dlp directo con los clientes nuevos (visionos/web_embedded) y el
    //    proxy del panel si está configurado. Sin proxy también se intenta:
    //    estos clientes responden desde IPs de datacenter.
    if (!ytdlpDisponible()) note("yt-dlp: no está instalado en el host");
    else if (youtubeBlockedNow()) note("yt-dlp: omitido (YouTube bloqueó la IP hace poco)");
    else {
      try {
        const out = await ytdlpYT(base => ["--get-url", "-f", "bestaudio/best", ...base, originalUrl], 45000);
        const url = out.trim().split("\n").filter(Boolean)[0];
        if (url) {
          const p = await probeAudioUrl(url);
          if (p.ok) return { kind: "url", source: url, via: MUSIC_PROXY ? "YouTube (proxy)" : "YouTube (yt-dlp)" };
          note(`yt-dlp: el audio respondió ${p.why}`);
          console.log(`🎵 yt-dlp: audio descartado antes de ffmpeg (${p.why}) en ${p.host}`);
          LAST_MUSIC_ERROR = `${song.title}: el origen respondió ${p.why}`;
        } else note("yt-dlp: no devolvió URL de audio");
      } catch (e) {
        note(`yt-dlp: ${shortErr(e)}`);
        console.error("🎵 yt-dlp directo:", e.message);
        LAST_MUSIC_ERROR = `${song.title}: ${e.message}`;
        markYoutubeBlocked(e.message);
      }
    }

    // 2. play-dl (su youtubei.js también puede fallar si la IP está bloqueada)
    if (youtubeBlockedNow()) note("play-dl: omitido (YouTube bloqueado)");
    else {
      try {
        const st = await play.stream(originalUrl, { discordPlayerCompatibility: false });
        if (st && st.stream) return { kind: "stream", source: st.stream, via: "YouTube (play-dl)" };
        note("play-dl: sin stream");
      } catch (e) {
        note(`play-dl: ${shortErr(e)}`);
        console.error("🎵 play-dl:", e.message);
        LAST_MUSIC_ERROR = `${song.title}: ${e.message}`;
        markYoutubeBlocked(e.message);
      }
    }

    // 3. Invidious: solo si YouTube no está bloqueado (si lo está, las instancias
    //    públicas también fallan y se pierden ~30 s en timeouts inútiles).
    if (youtubeBlockedNow()) {
      note("Invidious: omitido (YouTube bloqueado; las instancias públicas no sirven)");
    } else {
      const videoId = extractYouTubeVideoId(originalUrl);
      if (videoId) {
        for (const instance of invidiousInstances()) {
          const audioUrl = await getInvidiousAudioStream(videoId, instance);
          if (!audioUrl) { note(`Invidious ${instance.replace("https://", "")}: sin audio`); continue; }
          const p = await probeAudioUrl(audioUrl);
          if (p.ok) {
            console.log(`🎵 ✓ Invidious (${instance}) dio el audio de ${song.title}`);
            return { kind: "url", source: audioUrl, via: "YouTube vía Invidious" };
          }
          note(`Invidious ${instance.replace("https://", "")}: ${p.why}`);
          console.log(`🎵 Invidious ${instance}: audio descartado (${p.why})`);
        }
      } else note("Invidious: la URL no es un vídeo de YouTube");
    }

    // 4. SoundCloud: misma canción en otra plataforma (respaldo principal con IP bloqueada)
    if (!MUSIC_SC_FALLBACK) note("SoundCloud: respaldo desactivado en el panel");
    else {
      const sc = await soundcloudFallbackForSong(song, originalUrl);
      if (sc) return sc;
      note("SoundCloud: sin resultado utilizable");
    }
  } else {
    // No-YouTube (SoundCloud, Apple Music, etc.): yt-dlp directo, luego play-dl
    if (ytdlpDisponible()) {
      try {
        const out = await ytdlpRun(["--get-url", "-f", "bestaudio/best", "--no-check-certificates", "--geo-bypass", "--no-playlist", originalUrl], 45000);
        const url = out.trim().split("\n").filter(Boolean)[0];
        if (url) {
          const p = await probeAudioUrl(url);
          if (p.ok) return { kind: "url", source: url, via: "Enlace directo" };
          note(`yt-dlp: el audio respondió ${p.why}`);
          console.log(`🎵 yt-dlp (${originalUrl}): audio descartado (${p.why})`);
          LAST_MUSIC_ERROR = `${song.title}: el origen respondió ${p.why}`;
        }
      } catch (e) {
        note(`yt-dlp: ${shortErr(e)}`);
        console.error("🎵 yt-dlp:", e.message);
        LAST_MUSIC_ERROR = `${song.title}: ${e.message}`;
      }
    }
    try {
      const st = await play.stream(originalUrl, { discordPlayerCompatibility: false });
      if (st && st.stream) return { kind: "stream", source: st.stream, via: "Enlace (play-dl)" };
      note("play-dl: sin stream");
    } catch (e) {
      note(`play-dl: ${shortErr(e)}`);
      console.error("🎵 play-dl:", e.message);
      LAST_MUSIC_ERROR = `${song.title}: ${e.message}`;
    }
  }
  const base = LAST_MUSIC_ERROR || "no pude obtener el audio";
  const detalle = diag.length ? "\n" + diag.map(d => "• " + d).join("\n") : "";
  throw new Error(base + detalle + musicBlockedHint(base));
}
// Consejo cuando el fallo es el bloqueo de YouTube por IP del host.
function musicBlockedHint(msg) {
  return /sign in|not a bot|confirm you|blocked|http 403|http 429|too many requests/i.test(String(msg || ""))
    ? "\n⚠️ YouTube está bloqueando la IP del host: añade un proxy en Panel → Música → «Proxy para yt-dlp» (o deja activo el respaldo en SoundCloud)."
    : "";
}
function musicErrorToChannel(guildId, text) {
  try {
    const queue = musicQueues.get(guildId);
    const ch = queue && queue.textChannelId ? client.channels.cache.get(queue.textChannelId) : null;
    if (ch && ch.isTextBased()) ch.send(text).catch(() => {});
  } catch {}
}
function playGuildMusic(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue || !queue.songs.length) return;
  if (queue.busy) return; // ya hay una reproducción en curso (evita carrera entre /play simultáneos)
  applyMusicSettings(guildId);
  if (!ffmpegDisponible()) {
    console.error("🎵 ffmpeg no está disponible en el host: la música no puede reproducirse.");
    if (queue.textChannelId) {
      const ch = client.channels.cache.get(queue.textChannelId);
      if (ch?.isTextBased()) ch.send("❌ ffmpeg no está instalado en el host: no puedo reproducir música. Avisa al dueño del bot.").catch(() => {});
    }
    destroyMusicQueue(guildId, "ffmpeg ausente");
    return;
  }

  const song = queue.songs[0];
  queue.busy = true;

  (async () => {
    try {
      console.log(`🎵 Playing: ${song.title} (${song.url})`);

      const { spawn } = require("child_process");
      const ffmpegPath2 = require("ffmpeg-static");

      // Tope de tiempo para la resolución de audio: si una fuente se queda
      // colgada, la cola no se queda muda y el canal recibe el aviso.
      let srcTimeout = null;
      const src = await Promise.race([
        resolveAudioSource(song),
        new Promise((_, rej) => { srcTimeout = setTimeout(() => rej(new Error("la búsqueda de audio tardó más de 120 s: ¿el host no tiene salida a YouTube/SoundCloud?")), 120000); }),
      ]).finally(() => { try { clearTimeout(srcTimeout); } catch {} });

      console.log(`🎵 Fuente obtenida (${src.kind}), spawning ffmpeg...`);

      const inputIsUrl = src.kind === "url";
      const ffArgs = [
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "3",
      ];
      // Cabeceras HTTP para que el CDN acepte a ffmpeg (UA de navegador + Referer del origen).
      if (inputIsUrl) {
        ffArgs.push("-user_agent", MUSIC_UA);
        try {
          const h = new URL(src.source);
          if (/googlevideo|youtube|ytimg/i.test(h.hostname)) ffArgs.push("-headers", "Referer: https://www.youtube.com/\r\n");
          else if (/sndcdn|soundcloud/i.test(h.hostname)) ffArgs.push("-headers", "Referer: https://soundcloud.com/\r\n");
          const pxy = String(MUSIC_PROXY || "").trim();
          if (pxy && /^https?:\/\//i.test(pxy)) ffArgs.push("-http_proxy", pxy);
        } catch {}
      }
      ffArgs.push(
        "-i", inputIsUrl ? src.source : "pipe:0",
        "-vn",
        "-af", `volume=${queue.volume / 100}`,
        "-f", "ogg",
        "-c:a", "libopus",
        "-ar", "48000",
        "-ac", "2",
        "-b:a", "128k",
        "-application", "voip",
        "pipe:1"
      );

      const ffmpeg = spawn(ffmpegPath2, ffArgs, { stdio: [src.kind === "stream" ? "pipe" : "ignore", "pipe", "pipe"], shell: false, windowsHide: true });

      if (src.kind === "stream") {
        src.source.on("error", (e) => { console.error("🎵 stream error:", e.message); musicErrorToChannel(guildId, `❌ Error de stream: ${e.message}`); try { ffmpeg.stdin.end(); } catch {} });
        src.source.pipe(ffmpeg.stdin);
      }

      let ffmpegStarted = false;
      let stderrChunks = 0;
      let reportedNoAudio = false;
      let originHost = src.kind;
      try { if (inputIsUrl) originHost = new URL(src.source).hostname; } catch {}

      // Aviso al canal: ffmpeg no produjo ni un byte (URL muerta, 403, etc.)
      const reportNoAudio = (why) => {
        if (reportedNoAudio) return;
        reportedNoAudio = true;
        try { clearTimeout(watchdog); } catch {}
        console.error(`🎵 Sin audio de ${originHost}: ${why}`);
        musicErrorToChannel(guildId, `❌ El servidor de audio (**${originHost}**) ${why}. Prueba con otra canción o configura un proxy en Panel → Música.`);
      };
      // Watchdog: si a los 12 s ffmpeg no ha escrito nada, el origen está roto.
      const watchdog = setTimeout(() => {
        if (ffmpegStarted) return;
        try { ffmpeg.kill("SIGKILL"); } catch {}
        reportNoAudio("no envió datos en 12 s");
      }, 12000);

      ffmpeg.stdout.once("data", (d) => {
        ffmpegStarted = true;
        try { clearTimeout(watchdog); } catch {}
        console.log(`🎵 ffmpeg first chunk: ${d.length} bytes, starts with: ${d.slice(0, 4).toString("hex")}`);
      });
      // Referencia viva para poder cortarlo al parar/salir (evita procesos zombis)
      queue.ffmpeg = ffmpeg;

      // Las primeras líneas se imprimen siempre: ahí sale el motivo real (403, HTTP fallido...).
      ffmpeg.stderr.on("data", (d) => {
        const msg = d.toString().trim();
        if (!msg) return;
        if (stderrChunks < 4) {
          stderrChunks++;
          console.error(`ffmpeg stderr #${stderrChunks}: ${msg.slice(0, 400)}`);
        } else if (/error|invalid|cannot|fail|denied|forbidden|http|403|404|429/i.test(msg)) {
          console.error("ffmpeg stderr:", msg.slice(0, 800));
        }
      });

      ffmpeg.on("error", (err) => {
        console.error("ffmpeg process error:", err.message);
        if (err.code === "ENOENT") {
          musicErrorToChannel(guildId, "❌ ffmpeg no encontrado en el host. Sube el binario o define FFMPEG_BIN.");
        }
      });

      ffmpeg.on("close", (code) => {
        if (!ffmpegStarted && code !== null) reportNoAudio(`terminó sin producir audio (código ${code})`);
        else { try { clearTimeout(watchdog); } catch {} }
        console.log(`ffmpeg exit code: ${code}, started: ${ffmpegStarted}, origen: ${originHost}`);
      });

      console.log(`🎵 Creating AudioResource (OggOpus)...`);

      const resource = voice.createAudioResource(ffmpeg.stdout, {
        inputType: voice.StreamType.OggOpus,
        inlineVolume: false,
      });

      resource.playStream.on("error", (err) => {
        console.error("Resource stream error:", err.message);
      });

      console.log(`🎵 Creating AudioPlayer...`);

      const player = voice.createAudioPlayer({
        behaviors: { noSubscriber: voice.NoSubscriberBehavior.Play },
      });

      player.on(voice.AudioPlayerStatus.Playing, () => {
        console.log(`🎵 Player status: PLAYING`);
        try {
          client.user.setPresence({
            activities: [{ name: `${song.title}`, type: ActivityType.Listening }],
            status: "online",
          });
        } catch {}
      });

      player.on(voice.AudioPlayerStatus.Buffering, () => {
        console.log(`🎵 Player status: BUFFERING`);
      });

      player.on(voice.AudioPlayerStatus.Idle, () => {
        console.log(`🎵 Player status: IDLE — Finished: ${song.title}`);
        try { if (!ffmpeg.killed) ffmpeg.kill("SIGTERM"); } catch {}
        if (queue.looping) queue.songs.push(queue.songs.shift());
        else queue.songs.shift();
        if (!queue.songs.length) {
          try { client.restoreBotmode(); } catch {}
        }
        queue.busy = false;
        playGuildMusic(guildId);
      });

      player.on("error", (err) => {
        console.error("Player error:", err.message, err.stack?.split("\n")[1]);
        try { if (!ffmpeg.killed) ffmpeg.kill("SIGTERM"); } catch {}
        const falla = queue.songs.shift();
        musicErrorToChannel(guildId, `❌ Error reproduciendo **${falla ? falla.title : "la canción"}**: ${err.message}`);
        if (!queue.songs.length) {
          try { client.restoreBotmode(); } catch {}
        }
        queue.busy = false;
        playGuildMusic(guildId);
      });

      player.play(resource);

      if (queue.connection && queue.connection.state.status !== "destroyed") {
        console.log(`🎵 Connection state: ${queue.connection.state.status}`);
        queue.connection.subscribe(player);
        console.log(`🎵 Subscribed to connection`);
      } else {
        console.error("❌ No valid connection!");
      }

      queue.player = player;

      if (queue.textChannelId) {
        try {
          const ch = client.channels.cache.get(queue.textChannelId);
          if (ch) {
            const npEmbed = new EmbedBuilder()
              .setTitle("🎵 Reproduciendo ahora")
              .setDescription(`**${song.title}**\nDuración: ${song.duration}\nVolumen: ${queue.volume}% ${queue.looping ? "• 🔁 Loop" : ""}`)
              .setColor(0x00FF00);
            if (song.thumbnail) npEmbed.setThumbnail(song.thumbnail);
            {
              const partes = [];
              if (src.via || song.sourceLabel) partes.push(`Fuente: ${src.via || song.sourceLabel}`);
              if (queue.songs.length > 1) partes.push(`Siguiente: ${queue.songs[1].title} • En la cola: ${queue.songs.length - 1} canciones`);
              if (partes.length) npEmbed.setFooter({ text: partes.join(" • ") });
            }

            const musicRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("music_pause").setLabel("⏸️").setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId("music_resume").setLabel("▶️").setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId("music_skip").setLabel("⏭️").setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId("music_stop").setLabel("⏹️").setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId("music_queue").setLabel("📋 Cola").setStyle(ButtonStyle.Secondary),
            );
            await ch.send({ embeds: [npEmbed], components: [musicRow] });
          }
        } catch {}
      }

    } catch (err) {
      console.error("Play error:", err.message);
      LAST_MUSIC_ERROR = err.message;
      const falla = queue.songs.shift();
      // Avisa SIEMPRE del fallo (antes solo se avisaba si la cola quedaba vacía:
      // con 2 canciones encoladas el error de la primera quedaba invisible).
      musicErrorToChannel(guildId, `❌ No pude reproducir **${falla ? falla.title : "la canción"}**: ${err.message}`
        + (ytdlpDisponible() ? "" : "\n⚠️ Falta el binario `yt-dlp` en el host: súbelo a la raíz del bot."));
      if (!queue.songs.length) {
        try { client.restoreBotmode(); } catch {}
      }
      queue.busy = false;
      playGuildMusic(guildId);
    }
  })();
}

// ============== AUTOMOD ENGINE (per-guild) ==============
const spamTrack = new Map(); // `${gid}:${uid}` -> [timestamps]
const joinTrack = new Map(); // gid -> [timestamps]

function parseIdList(s) {
  return String(s || "").split(",").map(x => x.trim().replace(/[<@&#!>]/g, "")).filter(x => /^\d{17,20}$/.test(x));
}
function parseDomainList(s) {
  return String(s || "").split(",").map(x => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/^\./, "").split("/")[0]).filter(Boolean);
}

// Cache simple para no repetir yt-dlp en el mismo vídeo
const YT_MUSIC_CACHE = new Map();
const YT_MUSIC_CACHE_TTL = 1000 * 60 * 30; // 30 min

// Verifica si un enlace de YouTube es música (categoría Music = 10).
// Si yt-dlp no está o YouTube bloquea la IP, falla abierto (el dominio ya está en la
// lista blanca del dueño): mejor permitirlo que castigar al usuario por un bloqueo.
async function isYouTubeMusicLink(url, proxy) {
  const cached = YT_MUSIC_CACHE.get(url);
  if (cached && Date.now() - cached.ts < YT_MUSIC_CACHE_TTL) return cached.val;
  if (!ytdlpDisponible()) {
    YT_MUSIC_CACHE.set(url, { val: true, ts: Date.now() });
    return true;
  }
  let raw;
  try {
    // --flat-playlist --print-json devuelve info rápida sin descargar
    raw = await ytdlpRun(["--flat-playlist", "--print-json", "--no-playlist", url], 15000, proxy);
  } catch (e) {
    console.log(`🎵 anti-links: no pude verificar ${url} (${e.message}) → permitido`);
    YT_MUSIC_CACHE.set(url, { val: true, ts: Date.now() });
    return true;
  }
  try {
    const line = raw.trim().split("\n").find(l => l.startsWith("{"));
    if (!line) {
      YT_MUSIC_CACHE.set(url, { val: true, ts: Date.now() });
      return true;
    }
    const info = JSON.parse(line);
    // YouTube category ID 10 = Music
    const cats = info.categories || [];
    const isMusic = cats.includes("Music") || cats.includes("music") || info.category_id === 10 || info.category === "Music";
    YT_MUSIC_CACHE.set(url, { val: isMusic, ts: Date.now() });
    return isMusic;
  } catch {
    YT_MUSIC_CACHE.set(url, { val: true, ts: Date.now() });
    return true;
  }
}

// ¿Todos los enlaces del mensaje van a dominios permitidos (música, etc.)?
// Sirve para que pegar un link de Spotify/YouTube no dispare el anti-links ni el timeout.
async function linksAllFromAllowedDomains(content, gc) {
  try {
    const allow = parseDomainList(gc.antiLinkAllowDomains);
    if (!allow.length) return false;
    const urls = String(content || "").match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
    let seen = 0;
    for (const u of urls) {
      let host = "";
      try { host = new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { continue; }
      seen++;
      const allowed = allow.some(d => host === d || host.endsWith("." + d));
      if (!allowed) return false;
      // Si es YouTube, verificar que sea música
      if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com") || host.endsWith(".youtu.be")) {
        const isMusic = await isYouTubeMusicLink(u, gc.musicProxy || "");
        if (!isMusic) return false;
      }
    }
    return seen > 0;
  } catch { return false; }
}

function isAutomodExempt(member, channel) {
  try {
    if (!member) return false;
    if (isBotAdmin(member.guild.id, member.id)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    if (!member || !member.guild) return true;
    if (isStaff(member)) return true;    const gc = getGuildConfig(member.guild.id);
    if ((gc.whitelistUsers || "").split(",").map(s => s.trim()).includes(member.id)) return true;
    const wRoles = parseIdList(gc.whitelistRoles);
    if (wRoles.some(r => member.roles.cache.has(r))) return true;
    const wCh = parseIdList(gc.whitelistChannels);
    if (channel && wCh.includes(channel.id)) return true;
  } catch {}
  return false;
}

async function modLog(guildId, title, desc, color) {
  try {
    const gc = getGuildConfig(guildId);
    if (!gc.logEnabled || !gc.logChannelId) return;
    const ch = await client.guilds.cache.get(guildId)?.channels.fetch(gc.logChannelId).catch(() => null);
    if (ch && ch.isTextBased()) {
      await ch.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color || 0xffa500).setTimestamp()] });
    }
  } catch {}
}
// Log de sanciones: canal propio por tipo (temp/perma/warn), fallback al modlog
async function sancLog(guildId, type, title, desc, color) {
  try {
    const gc = getGuildConfig(guildId);
    const chId = type === "tempban" ? (gc.sancTempChannelId || "") : type === "warn" ? (gc.sancWarnChannelId || "") : (gc.sancPermaChannelId || "");
    const ch = chId ? await client.guilds.cache.get(guildId)?.channels.fetch(chId).catch(() => null) : null;
    if (ch && ch.isTextBased()) {
      await ch.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color || 0xffa500).setTimestamp()] });
      return;
    }
  } catch {}
  modLog(guildId, title, desc, color);
}

async function automodPunish(message, reason, detail, filterAction) {
  const gc = getGuildConfig(message.guild.id);
  try { await message.delete(); } catch {}
  const action = filterAction || gc.automodAction || "delete";
  const hcfg = heatCfg(message.guild.id);
  const heatOn = hcfg.enabled && hcfg.onAutomod;
  if (gc.automodWarnDM) {
    try { await message.author.send(`⚠️ Tu mensaje en **${message.guild.name}** fue eliminado.\n**Motivo:** ${reason}`); } catch {}
  }
  if (!(heatOn && hcfg.replaceFilter)) try {
    if (action === "timeout") {
      const mins = gc.automodTimeoutMin || 10;
      await message.member.timeout(mins * 60 * 1000, `AutoMod: ${reason}`).catch(() => {});
    } else if (action === "kick" && message.member?.kickable) {
      await message.member.kick(`AutoMod: ${reason}`).catch(() => {});
    } else if (action === "ban" && message.member?.bannable) {
      await message.member.ban({ reason: `AutoMod: ${reason}`.slice(0, 512), deleteMessageSeconds: 86400 }).catch(() => {});
    }
  } catch {}
  // Heat: escalado por reincidencia (tipo Wick)
  if (heatOn) await heatEscalate(message.member, reason, "automod");
  modLog(message.guild.id, `🛡️ AutoMod — ${reason}`,
    `**Usuario:** <@${message.author.id}>\n**Canal:** <#${message.channel.id}>\n**Castigo:** ${action}${heatOn ? "\n**Heat:** escalado activo" : ""}\n**Detalle:** ${detail || reason}`);
}

const INVITE_RE = /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i;

const LINK_RE = /(https?:\/\/|discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i;

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    const gc = getGuildConfig(message.guild.id);
    if (!gc.autoModEnabled && !gc.antiLinkEnabled) return;
    if (isAutomodExempt(message.member, message.channel)) return;
    const content = message.content || "";
    const hasAttach = message.attachments.size > 0;

    // --- Anti-links (con bypass por rol) ---
    if (gc.antiLinkEnabled) {
      const allowCh = parseIdList(gc.antiLinkAllowChannels);
      const allowCat = parseIdList(gc.antiLinkAllowCategories);
      const inAllowCh = allowCh.includes(message.channel.id);
      const inAllowCat = message.channel.parentId && allowCat.includes(message.channel.parentId);
      const hasBypass = (list) => parseIdList(list).some(r => message.member.roles.cache.has(r));
      if (!inAllowCh && !inAllowCat) {
        if (LINK_RE.test(content)) {
          if (!hasBypass(gc.bypassLinksRoles) && !(await linksAllFromAllowedDomains(content, gc))) {
            await automodPunish(message, "Enlace no permitido", content.slice(0, 200), gc.antiLinkAction);
            return;
          }
        } else if (hasAttach) {
          const kinds = new Set([...message.attachments.values()].map(a => {
            const ct = a.contentType || "";
            if (ct.startsWith("image/")) return "img";
            if (ct.startsWith("video/")) return "vid";
            return "file";
          }));
          const blocked =
            (kinds.has("img") && gc.antiLinkAllowImages === false && !hasBypass(gc.bypassImagesRoles)) ||
            (kinds.has("vid") && gc.antiLinkAllowVideos === false && !hasBypass(gc.bypassVideosRoles)) ||
            (kinds.has("file") && gc.antiLinkAllowImages === false);
          if (blocked) {
            await automodPunish(message, "Adjunto no permitido", `${message.attachments.size} adjunto(s)`, gc.antiLinkAction);
            return;
          }
        }
      }
    }

    if (!gc.autoModEnabled) return;

    // --- Invites de Discord (estilo Wick) ---
    if (gc.inviteFilterEnabled && INVITE_RE.test(content)) {
      await automodPunish(message, "Enlace de invitación", content.slice(0, 200), gc.inviteFilterAction);
      return;
    }

    // --- Bad words ---
    const bads = String(gc.badwords || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (bads.length && bads.some(w => content.toLowerCase().includes(w))) {
      await automodPunish(message, "Palabra prohibida", content.slice(0, 200), gc.badwordsAction);
      return;
    }

    // --- Caps ---
    if (gc.capsEnabled) {
      const letters = (content.match(/[a-zA-Záéíóúñü]/g) || []).length;
      const upper = (content.match(/[A-ZÁÉÍÓÚÑÜ]/g) || []).length;
      const minLen = gc.capsMinLen || 10, pct = gc.capsPercent || 70;
      if (letters >= minLen && (upper / letters) * 100 >= pct) {
        await automodPunish(message, "Exceso de mayúsculas", content.slice(0, 200), gc.capsAction);
        return;
      }
    }

    // --- Emoji spam ---
    if (gc.emojiEnabled) {
      const emojis = (content.match(/<a?:\w+:\d+>|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
      if (emojis > (gc.emojiMax || 5)) {
        await automodPunish(message, "Spam de emojis", content.slice(0, 200), gc.emojiAction);
        return;
      }
    }

    // --- Spam (rate) ---
    if (gc.spamEnabled) {
      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const win = (gc.spamSeconds || 10) * 1000;
      const arr = (spamTrack.get(key) || []).filter(t => now - t < win);
      arr.push(now);
      spamTrack.set(key, arr);
      if (arr.length > (gc.spamCount || 5)) {
        spamTrack.set(key, []);
        await automodPunish(message, "Spam (mensajes muy seguidos)", `${arr.length} mensajes en ${gc.spamSeconds || 10}s`, gc.spamAction);
        return;
      }
    }

    // --- Mention spam ---
    if (gc.mentionSpamEnabled) {
      const mentionCount = (content.match(/<@!?\d+>/g) || []).length;
      const maxMentions = gc.mentionSpamMax || 5;
      if (mentionCount >= maxMentions) {
        await automodPunish(message, "Spam de menciones", `${mentionCount} menciones en un mensaje`, gc.mentionAction);
        return;
      }
    }

    // --- Domain whitelist (blocks links NOT in the whitelist) ---
    if (gc.linkWhitelistEnabled) {
      const whitelist = String(gc.linkWhitelistDomains || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      if (whitelist.length && LINK_RE.test(content)) {
        const urls = content.match(/https?:\/\/[^\s]+/gi) || [];
        for (const url of urls) {
          const domain = url.replace(/https?:\/\//, "").split("/")[0].toLowerCase();
          const allowed = whitelist.some(w => domain === w || domain.endsWith("." + w)) || (await linksAllFromAllowedDomains(url, gc));
          if (!allowed) {
            const hasBypass = parseIdList(gc.bypassLinksRoles).some(r => message.member.roles.cache.has(r));
            if (!hasBypass) {
              await automodPunish(message, "Dominio no permitido", domain, gc.domainAction);
              return;
            }
          }
        }
      }
    }
  } catch (e) { console.error("automod error:", e.message); }
});

async function setLockdown(guild, on) {
  const everybody = guild.roles.everyone;
  for (const [, ch] of guild.channels.cache) {
    try {
      if (ch.isTextBased() || ch.type === 2) {
        await ch.permissionOverwrites.edit(everybody, { SendMessages: on ? false : null });
      }
    } catch {}
  }
}

// ============== PREFIX COMMANDS (TEMPORAL - hasta que se registren slash commands) ==============
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  const prefix = "hydra!";
  if (!message.content.toLowerCase().startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const sub = args[0]?.toLowerCase();

  // !ayuda
  if (cmd === "ayuda" || cmd === "help") {
    return message.reply({
      embeds: [new EmbedBuilder()
        .setTitle("📋 Comandos temporales (prefix)")
        .setDescription(
          "**Eventos:**\n" +
          "`hydra!evento listar` — Ver todos los eventos\n" +
          "`hydra!evento participantes EVT-5` — Ver inscritos\n" +
          "`hydra!evento crear` — Abrir panel de creación\n" +
          "`hydra!evento editar EVT-5` — Abrir panel de edición\n" +
          "`hydra!evento actualizar EVT-5 [si/no]` — Reenviar embed\n" +
          "`hydra!evento abrir EVT-5` — Reabrir inscripciones\n" +
          "`hydra!evento cerrar EVT-5` — Cerrar inscripciones\n" +
          "`hydra!evento eliminar EVT-5` — Eliminar evento\n\n" +
          "**Utilidad:**\n" +
          "`hydra!status` — Ver estado del servidor MC\n" +
          "`hydra!ping` — Latencia del bot\n" +
          "`hydra!ayuda` — Este mensaje"
        )
        .setColor(0x00FF00)
        .setFooter({ text: "Los slash commands estarán disponibles pronto" })
        .setTimestamp()]
    });
  }

  // !ping
  if (cmd === "ping") {
    return message.reply(`🏓 Pong! ${client.ws.ping}ms`);
  }

  // !status
  if (cmd === "status") {
    const _mc = getMC(message.guild && message.guild.id);
    const config = { ip: _mc.host, port: _mc.port };
    const { status: serverStatus } = require("minecraft-server-util");
    try {
      const result = await serverStatus(config.ip, config.port || 25565, { timeout: 5000 });
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle("🟢 Servidor Online")
          .addFields(
            { name: "IP", value: config.ip, inline: true },
            { name: "Jugadores", value: `${result.players.online}/${result.players.max}`, inline: true },
            { name: "Versión", value: result.version.name, inline: true },
            { name: "MOTD", value: result.description.text || "N/A" }
          )
          .setColor(0x00FF00)
          .setTimestamp()]
      });
    } catch {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle("🔴 Servidor Offline")
          .setDescription(`No se pudo conectar a **${config.ip}:${config.port || 25565}**`)
          .setColor(0xff0000)
          .setTimestamp()]
      });
    }
  }

  // ===== EVENTO SUBCOMMANDS =====
  if (cmd === "evento") {
    // !evento (sin subcomando)
    if (!sub) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle("🎮 Sistema de Eventos")
          .setDescription(
            "**Subcomandos disponibles:**\n\n" +
            "`hydra!evento listar` — Ver todos los eventos\n" +
            "`hydra!evento crear` — Abrir panel de creación\n" +
            "`hydra!evento editar <ID>` — Editar un evento\n" +
            "`hydra!evento participantes <ID>` — Ver inscritos\n" +
            "`hydra!evento actualizar <ID> [si/no]` — Reenviar embed\n" +
            "`hydra!evento abrir <ID>` — Reabrir inscripciones\n" +
            "`hydra!evento cerrar <ID>` — Cerrar inscripciones\n" +
            "`hydra!evento eliminar <ID>` — Eliminar evento"
          )
          .setColor(0x00FF00)
          .setTimestamp()]
      });
    }

    // !evento crear
    if (sub === "crear") {
      if (!isStaff(message.member)) return message.reply("❌ Solo el staff puede crear eventos.");
      // Trigger the same modal as /evento crear
      const modal = new ModalBuilder().setCustomId("evento_modal").setTitle("Crear Evento");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("titulo").setLabel("Titulo del evento").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder("Hunger Games 1° Edición")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("descripcion").setLabel("Descripcion (usa \\n para saltos de linea)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setPlaceholder("Eventos cada semana...")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("fecha").setLabel("Fecha (YYYY-MM-DD)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder("2025-08-01")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("hora").setLabel("Hora (HH:MM)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5).setPlaceholder("18:00")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modo").setLabel("Modo de juego").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder("Hunger Games").setValue("Hunger Games")),
      );
      return message.reply({ content: " Abriendo panel de creación...", flags: MessageFlags.Ephemeral }).then(() => {
        message.channel.send({ content: `<@${message.author.id}>`, embeds: [new EmbedBuilder().setDescription("📋 **Panel de creación abierto.** Completa el formulario.").setColor(0x00FF00)] }).then(msg => {
          // Store message reference for modal
          pendingEvents.set(`panel_${message.guild.id}:${message.author.id}`, { channelId: message.channel.id, panelMsgId: msg.id });
        });
      });
    }

    // !evento listar
    if (sub === "listar") {
      if (events.size === 0) return message.reply("❌ No hay eventos creados.");
      const lines = [];
      for (const [id, ev] of events) {
        let count = 0;
        if (ev.roleId) { const role = message.guild.roles.cache.get(ev.roleId); if (role) count = role.members.size; }
        const estado = ev.estado || "abierto";
        const emoji = estado === "cerrado" ? "🔒" : estado === "finalizado" ? "🏁" : "🟢";
        lines.push(`${emoji} **${id}** — ${ev.nombre} | ${count}/${ev.cupos} | ${ev.modo}`);
      }
      return message.reply({
        embeds: [new EmbedBuilder().setTitle("🎮 Eventos").setDescription(lines.join("\n")).setColor(0x00FF00).setTimestamp()]
      });
    }

    // !evento participantes <id>
    if (sub === "participantes") {
      const id = args[1]?.toUpperCase();
      if (!id) return message.reply("❌ Uso: `hydra!evento participantes EVT-5`");
      const ev = events.get(id);
      if (!ev) return message.reply(`❌ Evento **${id}** no encontrado.`);
      if (!ev.participants || ev.participants.length === 0) return message.reply(`❌ No hay participantes en **${ev.nombre}**.`);
      let count = 0;
      if (ev.roleId) { const role = message.guild.roles.cache.get(ev.roleId); if (role) count = role.members.size; }

      const PAGE_SIZE = 25;
      const totalPages = Math.ceil(ev.participants.length / PAGE_SIZE);
      const pageItems = ev.participants.slice(0, PAGE_SIZE);
      const lines = pageItems.map((p, i) => fmtParticipant(p, i + 1));

      const embed = new EmbedBuilder()
        .setTitle(`👥 Participantes — ${ev.nombre}`)
        .setDescription(lines.join("\n"))
        .setColor(0x00FF00)
        .setFooter({ text: `Página 1/${totalPages} • ${count}/${ev.cupos} cupos` })
        .setTimestamp();

      const components = [];
      if (totalPages > 1) {
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`evpart_page_${id}_0`).setLabel("⬅️").setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId(`evpart_page_${id}_1`).setLabel("➡️").setStyle(ButtonStyle.Secondary),
        ));
      }
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`evlist_editar_${id}`).setLabel("✏️ Editar participante").setStyle(ButtonStyle.Secondary),
      ));

      return message.reply({ embeds: [embed], components });
    }

    // !evento editar <id> — Panel modal
    if (sub === "editar") {
      if (!isStaff(message.member)) return message.reply("❌ Solo el staff puede editar eventos.");
      const id = args[1]?.toUpperCase();
      if (!id) return message.reply("❌ Uso: `hydra!evento editar EVT-5`");
      const ev = events.get(id);
      if (!ev) return message.reply(`❌ Evento **${id}** no encontrado.`);

      const fecha = ev.fechaTs ? new Date(ev.fechaTs * 1000) : new Date();
      const fechaStr = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
      const horaStr = `${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;

      const modal = new ModalBuilder().setCustomId(`evento_edit_prefix_${id}`).setTitle(`Editar — ${ev.nombre}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("titulo").setLabel("Titulo del evento").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(ev.nombre)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("descripcion").setLabel("Descripcion (usa \\n para saltos)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue(ev.desc?.replace(/\n/g, "\\n") || "")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("fecha").setLabel("Fecha (YYYY-MM-DD)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(fechaStr)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("hora").setLabel("Hora (HH:MM)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(5).setValue(horaStr)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modo").setLabel("Modo de juego").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(ev.modo || "")),
      );
      return message.reply({ content: " Abriendo panel de edición..." }).then(() => message.channel.send({ content: `<@${message.author.id}>`, embeds: [new EmbedBuilder().setDescription(`📋 **Editando evento ${id}.** Completa el formulario.`).setColor(0x00FF00)] }));
    }

    // !evento actualizar <id> [si/no]
    if (sub === "actualizar") {
      if (!isStaff(message.member)) return message.reply("❌ Solo el staff puede actualizar eventos.");
      const id = args[1]?.toUpperCase();
      if (!id) return message.reply("❌ Uso: `hydra!evento actualizar EVT-5 [si/no]`\n\n• `si` = con mención a @miembro\n• `no` = sin mención\n• (nada) = sin cambios de mención");
      const ev = events.get(id);
      if (!ev) return message.reply(`❌ Evento **${id}** no encontrado.`);

      let count = 0;
      if (ev.roleId) { const role = message.guild.roles.cache.get(ev.roleId); if (role) count = role.members.size; }

      let mention = "";
      const mencionOpt = args[2]?.toLowerCase();
      if (mencionOpt === "si") { const mRole2 = getGuildConfig(message.guild.id).mentionRoleId || ""; mention = mRole2 ? `<@&${mRole2}>` : ""; }
      else if (mencionOpt === "no") mention = "";
      else if (ev.mencion === "everyone") mention = "@everyone";
      else if (ev.mencion === "here") mention = "@here";
      else if (ev.mencion && ev.mencion !== "none") mention = `<@&${ev.mencion}>`;

      const shortDesc = ev.desc.length > 150 ? ev.desc.slice(0, 150) + "..." : ev.desc;
      const embed = new EmbedBuilder()
        .setTitle(`🎮 ${ev.nombre}`)
        .setDescription(`**${shortDesc}**\n\n📅 **Fecha:** <t:${ev.fechaTs}:F> (<t:${ev.fechaTs}:R>)\n🎮 **Modo:** ${ev.modo}\n👥 **Cupos:** ${count}/${ev.cupos}\n💰 **Premio:** ${ev.premio}\n📊 **Estado:** ${ev.estado || "abierto"}\n🏷️ **Rol:** <@&${ev.roleId}>`)
        .setColor(ev.roleColor || 0x00FF00)
        .setFooter({ text: ev.footer || `ID: ${id}` })
        .setTimestamp();
      if (ev.miniatura && ev.miniatura.startsWith("http")) embed.setThumbnail(ev.miniatura);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`evento_info_${id}`).setLabel("📋 Info").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`evento_join_${id}`).setLabel("✅ Unirse").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`evento_leave_${id}`).setLabel("🚪 Salir").setStyle(ButtonStyle.Danger),
      );

      const targetChannel = message.guild.channels.cache.get(ev.channelId) || message.channel;
      const msg = await targetChannel.send({ content: mention || null, embeds: [embed], components: [row] });

      if (ev.messageId && ev.channelId) {
        try {
          const oldCh = message.guild.channels.cache.get(ev.channelId);
          if (oldCh) oldCh.messages.fetch(ev.messageId).then(oldMsg => {
            if (oldMsg) oldMsg.edit({ content: null, embeds: [embed], components: [row] }).catch(() => {});
          }).catch(() => {});
        } catch {}
      }

      ev.messageId = msg.id;
      ev.channelId = targetChannel.id;
      saveEvents();

      // Start 30s auto-refresh
      if (eventDisplayIntervals.has(id)) clearInterval(eventDisplayIntervals.get(id));
      const refreshInterval = setInterval(async () => {
        try {
          const ch = message.guild.channels.cache.get(ev.channelId);
          if (!ch) return;
          const m = await ch.messages.fetch(ev.messageId);
          if (!m) return;
          const updatedEmbed = buildEventDisplayEmbed(ev, ch.guild);
          const components = m.components.length > 0 ? m.components : [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`evento_info_${id}`).setLabel("📋 Info").setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId(`evento_join_${id}`).setLabel("✅ Unirse").setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`evento_leave_${id}`).setLabel("🚪 Salir").setStyle(ButtonStyle.Danger),
            )
          ];
          await m.edit({ embeds: [updatedEmbed], components });
        } catch {}
      }, 30000);
      eventDisplayIntervals.set(id, refreshInterval);

      return message.reply(`✅ Embed de **${ev.nombre}** ${mencionOpt === "no" ? "sin mención" : mencionOpt === "si" ? "con mención" : "actualizado"} reenviado en <#${targetChannel.id}>. Se actualiza cada 30 segundos.`);
    }

    // !evento abrir <id>
    if (sub === "abrir") {
      if (!isStaff(message.member)) return message.reply("❌ Solo el staff puede abrir inscripciones.");
      const id = args[1]?.toUpperCase();
      if (!id) return message.reply("❌ Uso: `hydra!evento abrir EVT-5`");
      const ev = events.get(id);
      if (!ev) return message.reply(`❌ Evento **${id}** no encontrado.`);
      if (ev.estado === "abierto") return message.reply(`ℹ️ **${ev.nombre}** ya está abierto.`);
      ev.estado = "abierto";
      saveEvents();
      return message.reply(`✅ Inscripciones reabiertas para **${ev.nombre}**.`);
    }

    // !evento cerrar <id>
    if (sub === "cerrar") {
      if (!isStaff(message.member)) return message.reply("❌ Solo el staff puede cerrar inscripciones.");
      const id = args[1]?.toUpperCase();
      if (!id) return message.reply("❌ Uso: `hydra!evento cerrar EVT-5`");
      const ev = events.get(id);
      if (!ev) return message.reply(`❌ Evento **${id}** no encontrado.`);
      if (ev.estado === "cerrado") return message.reply(`ℹ️ **${ev.nombre}** ya está cerrado.`);
      ev.estado = "cerrado";
      saveEvents();
      if (eventDisplayIntervals.has(id)) { clearInterval(eventDisplayIntervals.get(id)); eventDisplayIntervals.delete(id); }
      return message.reply(`✅ Inscripciones cerradas para **${ev.nombre}**.`);
    }

    // !evento eliminar <id>
    if (sub === "eliminar") {
      if (!isStaff(message.member)) return message.reply("❌ Solo el staff puede eliminar eventos.");
      const id = args[1]?.toUpperCase();
      if (!id) return message.reply("❌ Uso: `hydra!evento eliminar EVT-5`");
      const ev = events.get(id);
      if (!ev) return message.reply(`❌ Evento **${id}** no encontrado.`);

      if (ev.roleId) {
        try { const role = await message.guild.roles.fetch(ev.roleId); if (role) await role.delete(); } catch {}
      }
      for (const [teamName, team] of teams) {
        if ((team.guildId || "") !== message.guild.id) continue;
        if (team.eventId === id) {
          try { const teamRole = await message.guild.roles.fetch(team.roleId); if (teamRole) await teamRole.delete(); } catch {}
          teams.delete(teamName);
        }
      }
      if (eventDisplayIntervals.has(id)) { clearInterval(eventDisplayIntervals.get(id)); eventDisplayIntervals.delete(id); }
      events.delete(id);
      saveEvents();
      saveTeams();
      return message.reply(`🗑️ Evento **${ev.nombre}** y sus equipos eliminados.`);
    }

    // Subcomando no reconocido
    return message.reply({
      embeds: [new EmbedBuilder()
        .setTitle("❌ Subcomando no válido")
        .setDescription(`**${sub}** no es un subcomando válido.\n\nUsa \`hydra!evento\` para ver los comandos disponibles.`)
        .setColor(0xff0000)
        .setTimestamp()]
    });
  }
});

// ============== GUILD SETUP MODAL ==============
client.on(Events.InteractionCreate, async (interaction) => {
  // Modal del panel de sanción (/sancionar)
  if (interaction.isModalSubmit() && interaction.customId.startsWith("sanc|")) {
    try {
      const [, gid, uid, type, durMs] = interaction.customId.split("|");
      let reason = "";
      try { reason = (interaction.fields.getTextInputValue("motivo") || "Sin razón").slice(0, 400); } catch {}
      const { evidence, evidenceUrl } = evidenceFromFields(interaction);
      const durationMs = Number(durMs) || 0;
      const mod = { tag: interaction.user.tag, id: interaction.user.id };
      const why = `${reason} (pruebas: ${evidence ? evidenceUrl || "sí" : "no"})`.slice(0, 480);
      const durText = sancDurationText(type, durationMs);
      let caseId = "";
      let target = null;
      const member = await interaction.guild.members.fetch(uid).catch(() => null);
      if (member) target = member.user;
      // Levantar sanciones (no necesitan ser miembro)
      if (type === "unban") {
        const ref = findSanction(gid, uid);
        const targetId = ref ? ref.userId : uid;
        await interaction.guild.members.unban(targetId, why).catch(() => {});
        if (ref) { ref.active = false; saveSanction(ref); caseId = ref.id; }
        sancLog(gid, "ban", "♻️ Desbaneo", `**Usuario:** <@${targetId}>\n**Razón:** ${reason}\n**Moderador:** <@${mod.id}>`);
        return interaction.reply({ embeds: [sanctionPanel({ userId: targetId, tag: ref ? ref.userTag : targetId, type: "unban", reason, durationText: "—", evidence, evidenceUrl, moderatorTag: mod.tag, caseId, source: "/sancionar" })], flags: MessageFlags.Ephemeral});
      }
      if (type === "delwarn") {
        const ref = findSanction(gid, uid);
        if (!ref) return interaction.reply({ content: "❌ No encontré esa advertencia (usa el ID del caso o del usuario).", flags: MessageFlags.Ephemeral});
        ref.active = false;
        saveSanction(ref);
        sancLog(gid, "warn", "🗑️ Advertencia retirada", `**Caso:** ${ref.id}\n**Usuario:** <@${ref.userId}>\n**Razón:** ${reason}`);
        return interaction.reply({ embeds: [sanctionPanel({ userId: ref.userId, tag: ref.userTag, type: "warn", reason: `${reason} (advertencia retirada)`, durationText: "—", evidence, evidenceUrl, moderatorTag: mod.tag, caseId: ref.id, source: "/sancionar" })], flags: MessageFlags.Ephemeral});
      }
      if (!member || !target) return interaction.reply({ content: "❌ Miembro no encontrado.", flags: MessageFlags.Ephemeral});
      if (member.id === interaction.guild.ownerId) return interaction.reply({ content: t2(interaction, "ctx_owner"), flags: MessageFlags.Ephemeral});
      if (member.id === client.user.id) return interaction.reply({ content: "❌ No puedo moderarme a mí mismo.", flags: MessageFlags.Ephemeral});
      if (type === "warn") {
        const n = (db.miscGet(`warnCounter_${gid}`, 0) || 0) + 1;
        db.miscSet(`warnCounter_${gid}`, n);
        caseId = `WARN-${n}`;
        const w = { id: caseId, guildId: gid, userId: uid, userTag: target.tag, type: "warn", reason, evidence, evidenceUrl, moderatorId: mod.id, moderatorTag: mod.tag, createdAt: Date.now(), expiresAt: 0, durationMs: 0, active: true };
        sanctions.set(`${gid}:${caseId}`, w);
        saveSanction(w);
        sancLog(gid, "warn", "⚠️ Advertencia", `**Caso:** ${caseId}\n**Usuario:** <@${uid}>\n**Razón:** ${reason}\n**Pruebas:** ${evidence ? evidenceUrl || "sí" : "no"}\n**Moderador:** <@${mod.id}>`);
        try { await target.send(`⚠️ Recibiste una advertencia en **${interaction.guild.name}**.\n**Razón:** ${reason}`); } catch {}
        const hc = heatCfg(gid);
        if (hc.enabled && hc.onWarn) await heatEscalate(member, `warn: ${reason}`, "warn");
      } else if (type === "timeout") {
        await member.timeout(durationMs, why);
        sancLog(gid, "tempban", "🔇 Aislado", `**Usuario:** <@${uid}>\n**Tiempo:** ${durText}\n**Razón:** ${reason}\n**Pruebas:** ${evidence ? evidenceUrl || "sí" : "no"}`);
      } else if (type === "kick") {
        if (!member.kickable) return interaction.reply({ content: "❌ No puedo expulsarlo (jerarquía de roles).", flags: MessageFlags.Ephemeral});
        await member.kick(why);
        sancLog(gid, "ban", "👢 Expulsión", `**Usuario:** <@${uid}>\n**Razón:** ${reason}\n**Pruebas:** ${evidence ? evidenceUrl || "sí" : "no"}`);
      } else if (type === "softban") {
        await member.ban({ reason: why.slice(0, 512), deleteMessageSeconds: 86400 }).catch(() => {});
        await interaction.guild.members.unban(uid).catch(() => {});
        sancLog(gid, "ban", "🧹 Softban", `**Usuario:** <@${uid}>\n**Razón:** ${reason}`);
      } else {
        const c = {
          id: `CASE-${(db.miscGet(`sanctionCounter_${gid}`, 0) || 0) + 1}`,
          guildId: gid, userId: uid, userTag: target.tag, type, reason, evidence, evidenceUrl,
          moderatorId: mod.id, moderatorTag: mod.tag, createdAt: Date.now(),
          expiresAt: type === "tempban" ? Date.now() + durationMs : 0, durationMs, active: true,
        };
        db.miscSet(`sanctionCounter_${gid}`, parseInt(c.id.split("-")[1], 10));
        caseId = c.id;
        sanctions.set(`${gid}:${caseId}`, c);
        saveSanction(c);
        await interaction.guild.members.ban(uid, { reason: why.slice(0, 512), deleteMessageSeconds: 0 }).catch(() => {});
        sancLog(gid, "ban", type === "tempban" ? "⏳ Baneo temporal" : "🔨 Baneo permanente", `**Caso:** ${caseId}\n**Usuario:** <@${uid}>\n**Tiempo:** ${durText}\n**Razón:** ${reason}\n**Pruebas:** ${evidence ? evidenceUrl || "sí" : "no"}\n**Moderador:** <@${mod.id}>`);
      }
      const panel = sanctionPanel({
        userId: uid, tag: target.tag, type, reason, durationText: durText, durationMs,
        evidence, evidenceUrl, moderatorTag: mod.tag, caseId, source: "sancionar",
      });
      sanctionNotice(gid, { userId: uid, tag: target.tag, type, reason, durationText: durText, evidence, evidenceUrl, moderatorTag: mod.tag, caseId });
      return interaction.reply({ embeds: [panel], flags: MessageFlags.Ephemeral});
    } catch (e) {
      return interaction.reply({ content: `❌ No se pudo aplicar la sanción: ${e.message}`.slice(0, 200), flags: MessageFlags.Ephemeral});
    }
  }
  // Modal del menú contextual de moderación
  if (interaction.isModalSubmit() && interaction.customId.startsWith("ctxmod|")) {
    try {
      const [, action, userId, guildId] = interaction.customId.split("|");
      const reason = (interaction.fields.getTextInputValue("motivo") || "Sin razón").slice(0, 300);
      const { evidence, evidenceUrl } = evidenceFromFields(interaction);
      if (!canUseModCommand(interaction.member, action))
        return interaction.reply({ content: noPermMsg(interaction.member, action), flags: MessageFlags.Ephemeral});
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!member) return interaction.reply({ content: "❌ Miembro no encontrado.", flags: MessageFlags.Ephemeral});
      if (member.id === client.user.id) return interaction.reply({ content: "❌ No puedo moderarme a mí mismo.", flags: MessageFlags.Ephemeral});
      if (member.id === interaction.guild.ownerId) return interaction.reply({ content: "👑 No puedes moderar al dueño del servidor.", flags: MessageFlags.Ephemeral});
      const why = `${reason} (menú contextual · ${interaction.user.tag})`.slice(0, 480);
      let out = "";
      if (action === "warn") {
        const n = (db.miscGet(`warnCounter_${guildId}`, 0) || 0) + 1;
        db.miscSet(`warnCounter_${guildId}`, n);
        const w = {
          id: `WARN-${n}`, guildId, userId, userTag: member.user.tag, type: "warn", reason,
          moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, createdAt: Date.now(), expiresAt: 0, durationMs: 0, active: true,
        };
        sanctions.set(`${guildId}:${w.id}`, w);
        saveSanction(w);
        sancLog(guildId, "warn", "⚠️ Advertencia (menú contextual)", `**Caso:** ${w.id}\n**Usuario:** <@${userId}>\n**Razón:** ${reason}\n**Moderador:** <@${interaction.user.id}>`);
        try { await member.user.send(`⚠️ Recibiste una advertencia en **${interaction.guild.name}**.\n**Razón:** ${reason}`); } catch {}
        const hcfg = heatCfg(guildId);
        if (hcfg.enabled && hcfg.onWarn) await heatEscalate(member, `warn (menú): ${reason}`, "warn");
        out = `⚠️ <@${userId}> advertiser (${w.id}).`;
      } else if (action === "timeout") {
        const mins = Math.max(1, Math.min(40320, Number((reason.match(/(\d+)\s*(m|min|minutos?|h|horas?)/i) || [])[1]) || 10));
        await member.timeout(mins * 60 * 1000, why);
        sancLog(guildId, "tempban", "⏳ Timeout (menú contextual)", `**Usuario:** <@${userId}>\n**Duración:** ${mins} min\n**Razón:** ${reason}`);
        out = `⏳ <@${userId}> aislado **${mins} min**.`;
      } else if (action === "kick") {
        if (!member.kickable) return interaction.reply({ content: "❌ No puedo expulsarlo (jerarquía de roles).", flags: MessageFlags.Ephemeral});
        await member.kick(why);
        sancLog(guildId, "ban", "👢 Expulsión (menú contextual)", `**Usuario:** <@${userId}>\n**Razón:** ${reason}`);
        out = `👢 <@${userId}> expulsado.`;
      } else if (action === "ban") {
        if (!member.bannable) return interaction.reply({ content: "❌ No puedo banearlo (jerarquía de roles).", flags: MessageFlags.Ephemeral});
        await member.ban({ reason: why.slice(0, 512), deleteMessageSeconds: 0 });
        const c = {
          id: `CASE-${(db.miscGet(`sanctionCounter_${guildId}`, 0) || 0) + 1}`,
          guildId, userId, userTag: member.user.tag, type: "ban", reason, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag,
          createdAt: Date.now(), expiresAt: 0, durationMs: 0, active: true,
        };
        db.miscSet(`sanctionCounter_${guildId}`, parseInt(c.id.split("-")[1], 10));
        sanctions.set(`${guildId}:${c.id}`, c);
        saveSanction(c);
        sancLog(guildId, "ban", "🔨 Baneo (menú contextual)", `**Caso:** ${c.id}\n**Usuario:** <@${userId}>\n**Razón:** ${reason}`);
        out = `🔨 <@${userId}> baneado (${c.id}).`;
      }
      const panel = sanctionPanel({ userId, tag: member.user.tag, type: action === "timeout" ? "timeout" : action === "kick" ? "kick" : action === "ban" ? "ban" : "warn", reason, durationText: action === "timeout" ? `${mins} min` : "—", evidence, evidenceUrl, moderatorTag: interaction.user.tag, source: "menú contextual" });
      sanctionNotice(interaction.guildId, { userId, tag: member.user.tag, type: action === "timeout" ? "timeout" : action === "kick" ? "kick" : action === "ban" ? "ban" : "warn", reason, durationText: action === "timeout" ? `${mins} min` : "—", evidence, evidenceUrl, moderatorTag: interaction.user.tag, source: "menú contextual" });
      return interaction.reply({ embeds: [panel], flags: MessageFlags.Ephemeral});
    } catch (e) {
      return interaction.reply({ content: `❌ No se pudo aplicar: ${e.message}`.slice(0, 200), flags: MessageFlags.Ephemeral});
    }
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith("guild_setup_modal_")) {
    const guildId = interaction.customId.replace("guild_setup_modal_", "");
    const gc = getGuildConfig(guildId);
    gc.welcomeChannelId = interaction.fields.getTextInputValue("welcomeCh") || "";
    gc.verificationChannelId = interaction.fields.getTextInputValue("verificationCh") || "";
    gc.staffRoleId = interaction.fields.getTextInputValue("staffRole") || "";
    gc.miembroRoleId = interaction.fields.getTextInputValue("miembroRole") || "";
    gc.ownerId = gc.ownerId || interaction.user.id;
    saveGuilds();
    return interaction.reply({
      embeds: [new EmbedBuilder().setTitle("✅ Configuración guardada").setDescription(
        `**Servidor:** ${interaction.guild.name}\n` +
        `**Bienvenidas:** ${gc.welcomeChannelId ? `<#${gc.welcomeChannelId}>` : "❌"}\n` +
        `**Verificación:** ${gc.verificationChannelId ? `<#${gc.verificationChannelId}>` : "❌"}\n` +
        `**Staff:** ${gc.staffRoleId ? `<@&${gc.staffRoleId}>` : "❌"}\n` +
        `**Miembro:** ${gc.miembroRoleId ? `<@&${gc.miembroRoleId}>` : "❌"}`
      ).setColor(0x00FF00).setTimestamp()],
      flags: MessageFlags.Ephemeral,
    });
  }
});

// ============== PREFIX MODAL HANDLERS ==============
client.on(Events.InteractionCreate, async (interaction) => {
  // !evento editar modal
  if (interaction.isModalSubmit() && interaction.customId.startsWith("evento_edit_prefix_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = interaction.customId.replace("evento_edit_prefix_", "");
    const ev = events.get(id);
    if (!ev) return interaction.editReply({ content: `❌ Evento **${id}** no encontrado.` });

    const titulo = interaction.fields.getTextInputValue("titulo");
    const desc = interaction.fields.getTextInputValue("descripcion").replace(/\\n/g, "\n");
    const fecha = interaction.fields.getTextInputValue("fecha");
    const hora = interaction.fields.getTextInputValue("hora");
    const modo = interaction.fields.getTextInputValue("modo") || ev.modo;

    const [y, m, d] = fecha.split("-").map(Number);
    const [hh, mm] = hora.split(":").map(Number);
    const fechaTs = Math.floor(new Date(y, m - 1, d, hh, mm, 0).getTime() / 1000);
    if (isNaN(fechaTs) || fechaTs * 1000 < Date.now()) return interaction.editReply({ content: "❌ La fecha no es valida o ya paso." });

    ev.nombre = titulo;
    ev.desc = desc;
    ev.fechaTs = fechaTs;
    ev.modo = modo;
    saveEvents();

    // Rebuild display embed
    let count = 0;
    if (ev.roleId) { const role = interaction.guild.roles.cache.get(ev.roleId); if (role) count = role.members.size; }

    const shortDesc = ev.desc.length > 150 ? ev.desc.slice(0, 150) + "..." : ev.desc;
    const embed = new EmbedBuilder()
      .setTitle(`🎮 ${ev.nombre}`)
      .setDescription(`**${shortDesc}**\n\n📅 **Fecha:** <t:${ev.fechaTs}:F> (<t:${ev.fechaTs}:R>)\n🎮 **Modo:** ${ev.modo}\n👥 **Cupos:** ${count}/${ev.cupos}\n💰 **Premio:** ${ev.premio}\n📊 **Estado:** ${ev.estado || "abierto"}\n🏷️ **Rol:** <@&${ev.roleId}>`)
      .setColor(ev.roleColor || 0x00FF00)
      .setFooter({ text: ev.footer || `ID: ${id}` })
      .setTimestamp();
    if (ev.miniatura && ev.miniatura.startsWith("http")) embed.setThumbnail(ev.miniatura);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`evento_info_${id}`).setLabel("📋 Info").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`evento_join_${id}`).setLabel("✅ Unirse").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`evento_leave_${id}`).setLabel("🚪 Salir").setStyle(ButtonStyle.Danger),
    );

    // Update display message
    if (ev.messageId && ev.channelId) {
      try {
        const ch = interaction.guild.channels.cache.get(ev.channelId);
        if (ch) {
          const msg = await ch.messages.fetch(ev.messageId).catch(() => null);
          if (msg) await msg.edit({ embeds: [embed], components: [row] }).catch(() => {});
        }
      } catch {}
    }

    return interaction.editReply({ content: `✅ Evento **${ev.nombre}** actualizado correctamente.` });
  }
});

// ============== ANTI-LINK FILTER (TICKETS) ==============
// DESHABILITADO - Los usuarios pueden enviar links, imagenes y archivos en tickets

// ============== CAPTCHA CHAT ==============
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  const gc = getGuildConfig(message.guild.id);
  const verChId = gc.verificationChannelId || CONFIG.verificationChannelId || "";
  if (!verChId) return;
  if (message.channel.id !== verChId) return;

  const pending = pendingCaptchas.get(message.author.id);
  if (!pending) {
    try { await message.delete(); } catch {}
    return;
  }

  if (pending.guildId && pending.guildId !== message.guild.id) {
    return;
  }

  const tmoMs = (gc.verifyTimeoutSec || 120) * 1000;
  if (Date.now() - pending.timestamp > tmoMs) {
    pendingCaptchas.delete(message.author.id);
    try { await message.delete(); } catch {}
    return message.reply({ content: gc.verifyExpiredMsg || "⏰ Captcha expirado. Haz clic en el botón de nuevo." }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
  }

  const input = message.content.toUpperCase().trim();
  pendingCaptchas.delete(message.author.id);
  const member = await message.guild.members.fetch(message.author.id);

  if (input === pending.text) {
    try {
      const verifiedRoleId = gc.verifiedRoleId || CONFIG.verifiedRoleId || "";
      const unverifiedRoleId = gc.unverifiedRoleId || CONFIG.unverifiedRoleId || "";
      const v = verifiedRoleId ? message.guild.roles.cache.get(verifiedRoleId) : null;
      const u = unverifiedRoleId ? message.guild.roles.cache.get(unverifiedRoleId) : null;
      const mId = gc.miembroRoleId || "";
      const m = mId ? message.guild.roles.cache.get(mId) : null;
      if (v) await member.roles.add(v);
      if (m) await member.roles.add(m);
      if (u) await member.roles.remove(u);
      await message.delete().catch(() => {});
      const reply = await message.channel.send({ embeds: [new EmbedBuilder().setTitle(gc.verifySuccessTitle || "✅ Verificado").setDescription(renderMsg(gc.verifySuccessDesc || "¡Disfruta el servidor!", member)).setColor(0x00ff00)] });
      setTimeout(() => reply.delete().catch(() => {}), 10000);
    } catch {}
  } else {
    try { await message.delete(); } catch {}
    const reply = await message.channel.send({ embeds: [new EmbedBuilder().setTitle(gc.verifyFailTitle || "❌ Incorrecto").setDescription(renderMsg(gc.verifyFailDesc || "Intenta de nuevo.", member)).setColor(0xff0000)] });
    setTimeout(() => reply.delete().catch(() => {}), 10000);
  }
});

// ============== AUTO-LEAVE EMPTY VOICE CHANNEL ==============
const autoLeaveTimers = new Map();
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const botId = client.user.id;
  const guild = oldState.guild;
  const queue = musicQueues.get(guild.id);
  if (!queue || !queue.connection) return;

  // Check if bot is still in a voice channel
  const botVoice = guild.members.me?.voice?.channel;
  if (!botVoice) return;

  // Count humans in the channel (excluding bots)
  const humansInChannel = botVoice.members.filter(m => !m.user.bot).size;

  if (humansInChannel === 0) {
    // Channel empty - start 10s timer (unless disabled per-guild)
    if (getGuildConfig(guild.id).musicAutoLeave === false) return;
    if (!autoLeaveTimers.has(guild.id)) {
      console.log(`🔇 Canal vacío, saliendo en 10 segundos...`);
      const timer = setTimeout(() => {
        if (musicQueues.get(guild.id)) destroyMusicQueue(guild.id, "canal vacío");
        console.log(`🔇 Bot salió del canal vacío.`);
        autoLeaveTimers.delete(guild.id);
      }, 10000);
      autoLeaveTimers.set(guild.id, timer);
    }
  } else {
    // Humans present - cancel timer
    if (autoLeaveTimers.has(guild.id)) {
      clearTimeout(autoLeaveTimers.get(guild.id));
      autoLeaveTimers.delete(guild.id);
      console.log(`🔊 Humanos detectados, timer cancelado.`);
    }
  }
});

// ============== XP / LEVELING SYSTEM ==============
const xpCooldown = new Map(); // key: guildId:userId, value: timestamp
const voiceXpTimers = new Map(); // key: guildId:userId, value: interval

function calcLevel(xp) {
  let level = 0;
  let needed = 100;
  let total = 0;
  while (total + needed <= xp) {
    total += needed;
    level++;
    needed = Math.floor(needed * 1.15);
  }
  return level;
}

function xpForLevel(level) {
  let needed = 100;
  for (let i = 0; i < level; i++) needed = Math.floor(needed * 1.15);
  return needed;
}

function getLevelData(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const raw = memberStats.get(key);
  if (raw && raw.level !== undefined) return raw;
  return { eventsParticipated: 0, eventsWon: 0, eventsCreated: 0, xp: 0, level: 0, messages: 0, voiceMinutes: 0 };
}

function setLevelData(guildId, userId, data) {
  memberStats.set(`${guildId}:${userId}`, data);
  saveStats();
}

function parseRoleRewards(rewardStr) {
  if (!rewardStr) return [];
  return rewardStr.split(",").map(r => {
    const [lvl, roleId] = r.split(":").map(s => s.trim());
    return { level: parseInt(lvl), roleId };
  }).filter(r => !isNaN(r.level) && r.roleId);
}

// MessageCreate XP handler
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  const gc = getGuildConfig(message.guild.id);
  if (!gc.statsEnabled) return;
  if (!gc.statsTrackMessages) return;

  const xpPerMsg = gc.statsXpPerMsg || 5;
  const cooldown = (gc.statsXpCooldown || 60) * 1000;
  const blacklist = (gc.statsBlacklistChannels || "").split(",").map(s => s.trim()).filter(Boolean);
  if (blacklist.includes(message.channel.id)) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const lastXp = xpCooldown.get(key) || 0;
  if (Date.now() - lastXp < cooldown) return;
  xpCooldown.set(key, Date.now());

  const data = getLevelData(message.guild.id, message.author.id);
  data.xp = (data.xp || 0) + xpPerMsg;
  data.messages = (data.messages || 0) + 1;
  const oldLevel = data.level || 0;
  const newLevel = calcLevel(data.xp);
  data.level = newLevel;
  setLevelData(message.guild.id, message.author.id, data);

  // Level up!
  if (newLevel > oldLevel && oldLevel > 0) {
    const levelUpCh = gc.statsLevelUpChannelId ? message.guild.channels.cache.get(gc.statsLevelUpChannelId) : message.channel;
    if (levelUpCh) {
      const msg = renderMsg(gc.statsLevelUpMsg || `🎉 {user} subió al nivel **{level}**!`, message.member)
        .replace(/\{user\}/g, `<@${message.author.id}>`)
        .replace(/\{level\}/g, newLevel)
        .replace(/\{xp\}/g, data.xp)
        .replace(/\{rank\}/g, () => {
          const prefix = `${message.guild.id}:`;
          const all = [...memberStats.entries()].filter(([k]) => k.startsWith(prefix)).map(([k, s]) => ({ id: k.slice(prefix.length), xp: s.xp || 0 }));
          all.sort((a, b) => b.xp - a.xp);
          return all.findIndex(e => e.id === message.author.id) + 1;
        });
      levelUpCh.send({ content: msg }).catch(() => {});
    }

    // Role rewards
    const rewards = parseRoleRewards(gc.statsRoleRewards);
    for (const reward of rewards) {
      if (newLevel >= reward.level) {
        const role = message.guild.roles.cache.get(reward.roleId);
        if (role && !message.member.roles.cache.has(reward.roleId)) {
          await message.member.roles.add(reward.roleId).catch(() => {});
        }
      }
    }
  }
});

// VoiceStateUpdate XP handler
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const guildId = (oldState.guild || newState.guild)?.id;
  if (!guildId) return;
  const gc = getGuildConfig(guildId);
  if (!gc.statsEnabled || !gc.statsTrackVoice) return;

  const userId = (oldState.member || newState.member)?.id;
  if (!userId) return;
  const member = oldState.member || newState.member;
  if (member?.user?.bot) return;

  const key = `${guildId}:${userId}`;
  const voiceXpPerMin = gc.statsVoiceXpPerMin || 5;
  const blacklist = (gc.statsBlacklistChannels || "").split(",").map(s => s.trim()).filter(Boolean);

  // User joined a voice channel
  if (!oldState.channel && newState.channel) {
    if (blacklist.includes(newState.channel.id)) return;
    const timer = setInterval(() => {
      const data = getLevelData(guildId, userId);
      data.xp = (data.xp || 0) + voiceXpPerMin;
      data.voiceMinutes = (data.voiceMinutes || 0) + 1;
      const oldLevel = data.level || 0;
      const newLevel = calcLevel(data.xp);
      data.level = newLevel;
      setLevelData(guildId, userId, data);

      if (newLevel > oldLevel && oldLevel > 0) {
        const levelUpCh = gc.statsLevelUpChannelId ? oldState.guild.channels.cache.get(gc.statsLevelUpChannelId) : null;
        if (levelUpCh) {
          const msg = renderMsg(gc.statsLevelUpMsg || `🎉 {user} subió al nivel **{level}**!`, member)
            .replace(/\{user\}/g, `<@${userId}>`)
            .replace(/\{level\}/g, newLevel)
            .replace(/\{xp\}/g, data.xp);
          levelUpCh.send({ content: msg }).catch(() => {});
        }
        const rewards = parseRoleRewards(gc.statsRoleRewards);
        for (const reward of rewards) {
          if (newLevel >= reward.level && member.roles && !member.roles.cache.has(reward.roleId)) {
            member.roles.add(reward.roleId).catch(() => {});
          }
        }
      }
    }, 60000); // every 60 seconds
    voiceXpTimers.set(key, timer);
  }
  // User left a voice channel
  else if (oldState.channel && !newState.channel) {
    if (voiceXpTimers.has(key)) {
      clearInterval(voiceXpTimers.get(key));
      voiceXpTimers.delete(key);
    }
  }
  // User moved channels
  else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    if (voiceXpTimers.has(key)) {
      clearInterval(voiceXpTimers.get(key));
      voiceXpTimers.delete(key);
    }
    if (!blacklist.includes(newState.channel.id)) {
      const timer = setInterval(() => {
        const data = getLevelData(guildId, userId);
        data.xp = (data.xp || 0) + voiceXpPerMin;
        data.voiceMinutes = (data.voiceMinutes || 0) + 1;
        const oldLevel = data.level || 0;
        const newLevel = calcLevel(data.xp);
        data.level = newLevel;
        setLevelData(guildId, userId, data);
        if (newLevel > oldLevel && oldLevel > 0) {
          const levelUpCh = gc.statsLevelUpChannelId ? oldState.guild.channels.cache.get(gc.statsLevelUpChannelId) : null;
          if (levelUpCh) {
            const msg = renderMsg(gc.statsLevelUpMsg || `🎉 {user} subió al nivel **{level}**!`, member)
              .replace(/\{user\}/g, `<@${userId}>`).replace(/\{level\}/g, newLevel).replace(/\{xp\}/g, data.xp);
            levelUpCh.send({ content: msg }).catch(() => {});
          }
        }
      }, 60000);
      voiceXpTimers.set(key, timer);
    }
  }
});

// ============== STARBOARD SYSTEM ==============
const starboardCache = new Map(); // messageId → { starred: true, starboardMsgId }

async function handleStarboard(reaction, user, add) {
  if (user.bot) return;
  const message = reaction.message;
  if (!message.guild) return;
  const gc = getGuildConfig(message.guild.id);
  if (!gc.starboardEnabled || !gc.starboardChannelId) return;
  const starEmoji = gc.starboardEmoji || "⭐";
  const minStars = gc.starboardMinStars || 5;
  if (reaction.emoji.name !== starEmoji && reaction.emoji.id !== starEmoji) return;

  const starCount = (message.reactions.cache.get(starEmoji)?.count || 0);
  const key = message.id;
  const existing = starboardCache.get(key);

  if (starCount >= minStars) {
    const starCh = message.guild.channels.cache.get(gc.starboardChannelId);
    if (!starCh) return;
    const embed = new EmbedBuilder()
      .setTitle(`⭐ ${starCount} estrellas`)
      .setDescription(message.content || "*Sin contenido*")
      .setColor(0xFFD700)
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setFooter({ text: `#${message.channel.name}` })
      .setTimestamp(message.createdAt);
    if (message.attachments.size > 0) {
      const att = message.attachments.first();
      if (att.url && /\.(jpg|jpeg|png|gif|webp)/i.test(att.url)) embed.setImage(att.url);
    }
    if (existing && existing.starboardMsgId) {
      try {
        const starMsg = await starCh.messages.fetch(existing.starboardMsgId);
        if (starMsg) await starMsg.edit({ embeds: [embed] });
      } catch {
        const newMsg = await starCh.send({ embeds: [embed] });
        starboardCache.set(key, { starred: true, starboardMsgId: newMsg.id });
      }
    } else {
      const newMsg = await starCh.send({ embeds: [embed] });
      starboardCache.set(key, { starred: true, starboardMsgId: newMsg.id });
    }
  } else if (existing && existing.starboardMsgId && starCount < minStars) {
    try {
      const starCh = message.guild.channels.cache.get(gc.starboardChannelId);
      if (starCh) {
        const starMsg = await starCh.messages.fetch(existing.starboardMsgId);
        if (starMsg) await starMsg.delete();
      }
    } catch {}
    starboardCache.delete(key);
  }
}

client.on(Events.MessageReactionAdd, (reaction, user) => handleStarboard(reaction, user, true));
client.on(Events.MessageReactionRemove, (reaction, user) => handleStarboard(reaction, user, false));

// ============== STICKY MESSAGES ==============
const stickyMessages = new Map(); // channelId → { content, msgId }
const stickyLastSent = new Map(); // channelId → timestamp

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const gc = getGuildConfig(message.guild.id);
  if (!gc.stickyEnabled) return;
  const stickies = gc.stickyMessages || [];
  const sticky = stickies.find(s => s.channelId === message.channel.id);
  if (!sticky) return;

  const now = Date.now();
  const lastSent = stickyLastSent.get(message.channel.id) || 0;
  if (now - lastSent < 5000) return; // anti-spam

  try {
    const old = stickyMessages.get(message.channel.id);
    if (old && old.msgId) {
      const oldMsg = await message.channel.messages.fetch(old.msgId).catch(() => null);
      if (oldMsg) await oldMsg.delete().catch(() => {});
    }
    const newMsg = await message.channel.send({ content: sticky.content });
    stickyMessages.set(message.channel.id, { content: sticky.content, msgId: newMsg.id });
    stickyLastSent.set(message.channel.id, now);
  } catch {}
});

// ============== AFK SYSTEM ==============
const afkUsers = new Map(); // guildId:userId → { reason, timestamp }

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const gc = getGuildConfig(message.guild.id);
  const key = `${message.guild.id}:${message.author.id}`;

  // Check if user is AFK
  if (afkUsers.has(key)) {
    afkUsers.delete(key);
    try {
      await message.reply(botMsg(message.guild.id, "afk_back", { user: `<@${message.author.id}>` }) || "✅").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    } catch {}
  }

  // Check if user mentions someone who is AFK
  if (gc.afkEnabled && message.mentions.users.size > 0) {
    for (const [, user] of message.mentions.users) {
      const afkKey = `${message.guild.id}:${user.id}`;
      const afkData = afkUsers.get(afkKey);
      if (afkData) {
        const mins = Math.floor((Date.now() - afkData.timestamp) / 60000);
        try {
          const amsg = botMsg(message.guild.id, "afk_mention", { target: `**${user.tag}**`, reason: afkData.reason || "Sin razón", mins }) || "💤";
          await message.reply(amsg).then(m => setTimeout(() => m.delete().catch(() => {}), 8000));
        } catch {}
      }
    }
  }

  // Set AFK via command
  if (message.content.toLowerCase().startsWith("!afk")) {
    const reason = message.content.slice(4).trim() || "AFK";
    afkUsers.set(key, { reason, timestamp: Date.now() });
    try {
      const reply = await message.reply(botMsg(message.guild.id, "afk_set", { user: `**${message.author.tag}**`, reason }) || "💤");
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch {}
  }
});

// ============== REACTION ROLES ==============
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  const message = reaction.message;
  if (!message.guild) return;
  const gc = getGuildConfig(message.guild.id);
  const rrConfig = gc.reactionRoles || [];
  for (const rr of rrConfig) {
    if (rr.messageId === message.id && (rr.emoji === reaction.emoji.name || rr.emoji === reaction.emoji.id)) {
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (member && rr.roleId) {
        await member.roles.add(rr.roleId).catch(() => {});
      }
    }
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  const message = reaction.message;
  if (!message.guild) return;
  const gc = getGuildConfig(message.guild.id);
  const rrConfig = gc.reactionRoles || [];
  for (const rr of rrConfig) {
    if (rr.messageId === message.id && (rr.emoji === reaction.emoji.name || rr.emoji === reaction.emoji.id)) {
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      if (member && rr.roleId) {
        await member.roles.remove(rr.roleId).catch(() => {});
      }
    }
  }
});

// ============== ANTI-NUKE SYSTEM ==============
const antiNukeTracker = new Map(); // guildId → { bans: [], kicks: [], channelDeletes: [], roleDeletes: [] }

function trackAntiNuke(guildId, type) {
  if (!antiNukeTracker.has(guildId)) antiNukeTracker.set(guildId, { bans: [], kicks: [], channelDeletes: [], roleDeletes: [] });
  const tracker = antiNukeTracker.get(guildId);
  const now = Date.now();
  const window = 60000; // 1 minute window
  tracker[type] = (tracker[type] || []).filter(t => now - t < window);
  tracker[type].push(now);
  return tracker[type].length;
}

client.on(Events.GuildBanAdd, async (ban) => {
  try {
    const gc = getGuildConfig(ban.guild.id);
    if (!gc.antiNukeEnabled) return;
    const count = trackAntiNuke(ban.guild.id, "bans");
    const limit = gc.antiNukeBanLimit || 5;
    if (count >= limit) {
      const fetchLogs = await ban.guild.fetchAuditLogs({ limit: 1, type: 23 }).catch(() => null);
      const log = fetchLogs?.entries?.first();
      if (log?.executor && !log.executor.bot) {
        const member = await ban.guild.members.fetch(log.executor.id).catch(() => null);
        if (member && !member.permissions.has(PermissionFlagsBits.Administrator)) {
          const action = gc.antiNukeAction || "timeout";
          if (action === "kick") await member.kick("Anti-Nuke: mass bans detectados").catch(() => {});
          else if (action === "ban") await member.ban({ reason: "Anti-Nuke: mass bans detectados" }).catch(() => {});
          else await member.timeout(3600000, "Anti-Nuke: mass bans detectados").catch(() => {});
          modLog(ban.guild.id, "🛡️ Anti-Nuke", `**Moderador:** <@${log.executor.id}>\n**Acción:** ${action} por ${count} bans en 1 min`);
        }
      }
    }
  } catch {}
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    const gc = getGuildConfig(member.guild.id);
    if (!gc.antiNukeEnabled) return;
    const count = trackAntiNuke(member.guild.id, "kicks");
    const limit = gc.antiNukeKickLimit || 5;
    if (count >= limit) {
      const fetchLogs = await member.guild.fetchAuditLogs({ limit: 1, type: 22 }).catch(() => null);
      const log = fetchLogs?.entries?.first();
      if (log?.executor && !log.executor.bot) {
        const mod = await member.guild.members.fetch(log.executor.id).catch(() => null);
        if (mod && !mod.permissions.has(PermissionFlagsBits.Administrator)) {
          const action = gc.antiNukeAction || "timeout";
          if (action === "kick") await mod.kick("Anti-Nuke: mass kicks").catch(() => {});
          else if (action === "ban") await mod.ban({ reason: "Anti-Nuke: mass kicks" }).catch(() => {});
          else await mod.timeout(3600000, "Anti-Nuke: mass kicks").catch(() => {});
          modLog(member.guild.id, "🛡️ Anti-Nuke", `**Moderador:** <@${log.executor.id}>\n**Acción:** ${action} por ${count} kicks en 1 min`);
        }
      }
    }
  } catch {}
});

// ============== CUSTOM AUTO-RESPONSES ==============
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const gc = getGuildConfig(message.guild.id);
  const responses = gc.autoResponses || [];
  const content = message.content.toLowerCase();
  for (const r of responses) {
    if (!r.trigger || !r.response) continue;
    const match = r.matchType === "exact" ? content === r.trigger.toLowerCase() : content.includes(r.trigger.toLowerCase());
    if (match) {
      if (r.requiresMention && !message.mentions.has(client.user)) continue;
      if (r.channelIds && r.channelIds.length > 0 && !r.channelIds.includes(message.channel.id)) continue;
      const reply = r.response.replace(/{user}/g, `<@${message.author.id}>`).replace(/{server}/g, message.guild.name).replace(/{channel}/g, `<#${message.channel.id}>`);
      // Mencionar al autor o no, según el interruptor (por defecto sí)
      const conMencion = r.mentionUser !== false;
      const texto = conMencion && !reply.includes(`<@${message.author.id}>`) ? `<@${message.author.id}> ${reply}` : reply;
      await message.channel.send({ content: texto.slice(0, 2000) }).catch(() => {});
      if (r.deleteTrigger) try { await message.delete(); } catch {}
      break;
    }
  }
});

// ============== SUGGESTION INTAKE (todo lo escrito en X canal -> sugerencia) ==============
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot || !message.guild) return;
    const gc = getGuildConfig(message.guild.id);
    if (!gc.sugEnabled || !gc.sugIntakeChannelId) return;
    if (message.channel.id !== gc.sugIntakeChannelId) return;
    const text = (message.content || "").trim();
    if (!text && message.attachments.size === 0) return;
    if (/^[!/]/.test(text) || text.toLowerCase().startsWith("hydra!")) return; // no convertir comandos
    const targetCh = gc.sugChannelId ? await message.guild.channels.fetch(gc.sugChannelId).catch(() => null) : null;
    if (!targetCh || !targetCh.isTextBased()) return; // sin destino no se toca nada
    const titulo = (text.split("\n")[0] || "Sugerencia").slice(0, 80);
    let desc = text;
    if (message.attachments.size) {
      desc += `\n\n📎 Adjuntos: ${[...message.attachments.values()].map(a => a.url).join(" ")}`;
    }
    desc = desc.slice(0, 1500);
    try { await message.delete(); } catch {}
    const { sug } = await createSuggestion(message.guild, targetCh, message.author, message.member, titulo, desc);
    try { await message.author.send(`✅ Tu sugerencia **${sug.id}** ("${titulo}") fue publicada en <#${targetCh.id}>.`).catch(() => {}); } catch {}
  } catch (e) { console.error("sug intake error:", e.message); }
});

// ============== TEMP VOICE CHANNELS ==============
const tempVoiceUsers = new Map(); // userId → channelId
const tempVoiceChats = new Map(); // ownerId → textChannelId
const TV_REGIONS = [["Automática", "auto"], ["Europa", "europe"], ["EE.UU. Este", "us-east"], ["EE.UU. Oeste", "us-west"], ["EE.UU. Central", "us-central"], ["EE.UU. Sur", "us-south"], ["Brasil", "brazil"], ["Japón", "japan"], ["Singapur", "singapore"], ["Sídney", "sydney"], ["Sudáfrica", "southafrica"], ["India", "india"], ["Hong Kong", "hongkong"], ["Róterdam", "rotterdam"], ["Rusia", "russia"]];

function saveTempVoiceMap() {
  try { db.miscSet("tempVoiceMap", { owners: [...tempVoiceUsers], chats: [...tempVoiceChats] }); } catch {}
}
function loadTempVoiceMap() {
  try {
    const d = db.miscGet("tempVoiceMap", null);
    let n = 0;
    const findCh = (chId) => {
      for (const [, g] of client.guilds.cache) {
        const ch = g.channels.cache.get(chId);
        if (ch) return ch;
      }
      return null;
    };
    if (d && Array.isArray(d.owners)) {
      for (const [uid, chId] of d.owners) {
        const ch = findCh(chId);
        if (ch && ch.type === 2) { tempVoiceUsers.set(uid, chId); n++; }
      }
    }
    if (d && Array.isArray(d.chats)) {
      for (const [uid, chId] of d.chats) {
        const ch = findCh(chId);
        if (ch && ch.isTextBased()) tempVoiceChats.set(uid, chId);
      }
    }
    console.log(`🔊 Loaded ${n} temp voice owners`);
  } catch (e) { console.error("loadTempVoiceMap error:", e.message); }
}
function tempOwnerOf(channelId) {
  for (const [uid, ch] of tempVoiceUsers) if (ch === channelId) return uid;
  return null;
}
function buildTempInterface(guildId) {
  const B = (id, label, emoji, style) => new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style || ButtonStyle.Secondary);
  const t = (k, fb) => botMsg(guildId, k, {}) || fb;
  const embed = new EmbedBuilder()
    .setTitle(t("tv_panel_title", "🎙️ Interfaz de TempVoice"))
    .setDescription(t("tv_panel_desc", "Esta interfaz sirve para gestionar tu canal de voz temporal.\nÚnete al canal que sea tuyo y pulsa los botones.\n\n**NOMBRE** · **LÍMITE** · **PRIVACIDAD** · **ESPERA** · **CHAT**\n**CONFIAR** · **DESCONFIAR** · **INVITAR** · **EXPULSAR** · **REGIÓN**\n**BLOQUEAR** · **DESBLOQUEAR** · **RECLAMAR** · **TRANSFERIR** · **ELIMINAR**"))
    .setColor(0x5865F2);
  return { embeds: [embed], components: [
    new ActionRowBuilder().addComponents(B("tv_nombre", "Nombre", "📝"), B("tv_limite", "Límite", "👥"), B("tv_priv", "Privacidad", "🔒"), B("tv_espera", "Espera", "⏳"), B("tv_chat", "Chat", "💬")),
    new ActionRowBuilder().addComponents(B("tv_confiar", "Confiar", "✅"), B("tv_desconfiar", "Desconfiar", "❌"), B("tv_invitar", "Invitar", "📨"), B("tv_expulsar", "Expulsar", "📞"), B("tv_region", "Región", "🌍")),
    new ActionRowBuilder().addComponents(B("tv_bloquear", "Bloquear", "🚫"), B("tv_desbloquear", "Desbloquear", "🔓"), B("tv_reclamar", "Reclamar", "👑", ButtonStyle.Primary), B("tv_transferir", "Transferir", "🔄"), B("tv_eliminar", "Eliminar", "🗑️", ButtonStyle.Danger)),
  ] };
}
// Resuelve el canal temporal del usuario (su propio canal; si no es dueño, el de voz actual para reclamar)
async function tempResolve(interaction, needOwner = true) {
  const me = interaction.member;
  if (!me || !me.guild) return null;
  let chId = tempVoiceUsers.get(me.id) || "";
  let ch = chId ? me.guild.channels.cache.get(chId) : null;
  if (!ch || ch.type !== 2) {
    if (chId) { tempVoiceUsers.delete(me.id); saveTempVoiceMap(); }
    ch = null;
  }
  if (!ch && me.voice && me.voice.channel && me.voice.channel.type === 2) ch = me.voice.channel;
  if (!ch) {
    try { await interaction.reply({ content: botMsg(interaction.guild.id, "tv_no_channel") || "❌", flags: MessageFlags.Ephemeral }); } catch {}
    return null;
  }
  const ownerId = tempOwnerOf(ch.id);
  const isOwner = ownerId === me.id;
  if (needOwner && !isOwner) {
    try { await interaction.reply({ content: botMsg(interaction.guild.id, "tv_not_owner") || "❌", flags: MessageFlags.Ephemeral }); } catch {}
    return null;
  }
  return { ch, isOwner, ownerId };
}
async function tempAskSelect(interaction, customId, placeholder, options) {
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder.slice(0, 100))
      .addOptions(options.length ? options.slice(0, 25) : [{ label: "Sin opciones", value: "none" }])
  );
  await interaction.reply({ content: `**${placeholder}**`, components: [row], flags: MessageFlags.Ephemeral });
}
async function tempParseMember(guild, input) {
  const m = String(input || "").match(/(\d{17,20})/);
  if (!m) return null;
  return guild.members.fetch(m[1]).catch(() => null);
}

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const gc = getGuildConfig(newState.guild.id);
  if (!gc.tempVoiceEnabled) return;
  const creatorChannelId = gc.tempVoiceCreatorChannelId;
  if (!creatorChannelId) return;

  // User joins creator channel → create temp channel
  if (newState.channelId === creatorChannelId && oldState.channelId !== creatorChannelId) {
    const member = newState.member;
    if (!member || member.user.bot) return;
    // El creador debe ser un canal de voz (no una categoría): si está mal configurado, ignorar
    if (!newState.channel || newState.channel.type !== 2) return;
    const catOk = gc.tempVoiceCategoryId && newState.guild.channels.cache.get(gc.tempVoiceCategoryId)?.type === 4;
    const categoryId = catOk ? gc.tempVoiceCategoryId : (newState.channel.parentId || null);
    try {
      const tempCh = await newState.guild.channels.create({
        name: `🔊 ${member.displayName}`.slice(0, 100),
        type: 2, // Voice
        parent: categoryId,
        permissionOverwrites: [
          { id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
          { id: newState.guild.id, allow: [PermissionFlagsBits.Connect] },
        ],
      });
      await member.voice.setChannel(tempCh).catch(() => {});
      tempVoiceUsers.set(member.id, tempCh.id);
      saveTempVoiceMap();
    } catch {}
  }

  // User leaves temp channel → delete if empty
  if (oldState.channel) {
    const tracked = oldState.member && tempVoiceUsers.get(oldState.member.id) === oldState.channel.id;
    // Fallback post-reinicio: canal con prefijo 🔊 en la categoría temporal y vacío también se borra
    let orphan = false;
    if (!tracked && oldState.channel.type === 2 && (oldState.channel.name || "").startsWith("🔊 ")) {
      const catOk = gc.tempVoiceCategoryId && oldState.channel.parentId === gc.tempVoiceCategoryId;
      if (catOk && oldState.channel.members.filter(m => !m.user.bot).size === 0) orphan = true;
    }
    if (tracked || orphan) {
      const humans = oldState.channel.members.filter(m => !m.user.bot);
      if (humans.size === 0) {
        try { await oldState.channel.delete(); } catch {}
        // Borrar chat de texto vinculado y limpiar mapas
        const ownerId = tempOwnerOf(oldState.channel.id);
        const chatOwner = ownerId && tempVoiceChats.has(ownerId) ? ownerId : (oldState.member && tempVoiceChats.has(oldState.member.id) ? oldState.member.id : null);
        if (chatOwner) {
          try {
            const tch = await newState.guild.channels.fetch(tempVoiceChats.get(chatOwner)).catch(() => null);
            if (tch) await tch.delete().catch(() => {});
          } catch {}
          tempVoiceChats.delete(chatOwner);
        }
        if (tracked) tempVoiceUsers.delete(oldState.member.id);
        else if (ownerId) tempVoiceUsers.delete(ownerId);
        saveTempVoiceMap();
      } else if (tracked && oldState.member) {
        // El dueño se fue pero queda gente: transferir al primero
        const next = [...humans.values()][0];
        if (next) {
          tempVoiceUsers.delete(oldState.member.id);
          tempVoiceUsers.set(next.id, oldState.channel.id);
          if (tempVoiceChats.has(oldState.member.id)) {
            tempVoiceChats.set(next.id, tempVoiceChats.get(oldState.member.id));
            tempVoiceChats.delete(oldState.member.id);
          }
          try {
            await oldState.channel.permissionOverwrites.edit(next.id, { ManageChannels: true, MoveMembers: true }).catch(() => {});
          } catch {}
          saveTempVoiceMap();
        }
      }
    }
  }
});

// ============== MEDIA-ONLY CHANNELS ==============
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const gc = getGuildConfig(message.guild.id);
  const mediaOnly = gc.mediaOnlyChannels || [];
  if (!mediaOnly.includes(message.channel.id)) return;
  if (message.member?.permissions?.has(PermissionFlagsBits.ManageMessages)) return;

  const hasMedia = message.attachments.size > 0 || message.embeds.length > 0 || /https?:\/\/.*\.(jpg|jpeg|png|gif|webp|mp4|webm)/i.test(message.content);
  if (!hasMedia) {
    try {
      await message.delete();
      const reply = await message.channel.send({ content: `📸 ${message.author}, este canal solo acepta imágenes/videos.` });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch {}
  }
});

// ============== ENHANCED AUDIT LOG ==============
function auditLog(guildId, title, detail) {
  const gc = getGuildConfig(guildId);
  if (!gc.auditEnabled || !gc.auditChannelId) return;
  const channel = client.guilds.cache.get(guildId)?.channels.cache.get(gc.auditChannelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(detail)
    .setColor(0xFF6B6B)
    .setTimestamp();
  channel.send({ embeds: [embed] }).catch(() => {});
}

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    const gc = getGuildConfig(member.guild.id);
    if (!gc.auditEnabled || !gc.auditChannelId) return;
    const auditCh = member.guild.channels.cache.get(gc.auditChannelId);
    if (!auditCh) return;
    const fetchLogs = await member.guild.fetchAuditLogs({ limit: 1, type: 22 }).catch(() => null);
    const kickLog = fetchLogs?.entries?.first();
    if (kickLog && kickLog.target?.id === member.id && kickLog.executor && gc.auditLogKicks !== false) {
      auditLog(member.guild.id, "👢 Expulsión", `**Usuario:** <@${member.id}> (${member.user?.tag})\n**Moderador:** <@${kickLog.executor.id}>\n**Razón:** ${kickLog.reason || "Sin razón"}`);
    }
  } catch {}
});

client.on(Events.GuildBanAdd, async (ban) => {
  try {
    const gc = getGuildConfig(ban.guild.id);
    if (!gc.auditEnabled || !gc.auditChannelId || gc.auditLogBans === false) return;
    const fetchLogs = await ban.guild.fetchAuditLogs({ limit: 1, type: 23 }).catch(() => null);
    const banLog = fetchLogs?.entries?.first();
    auditLog(ban.guild.id, "🔨 Baneo", `**Usuario:** <@${ban.user.id}> (${ban.user.tag})\n**Moderador:** ${banLog?.executor ? `<@${banLog.executor.id}>` : "Desconocido"}\n**Razón:** ${banLog?.reason || "Sin razón"}`);
  } catch {}
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    const gc = getGuildConfig(newMember.guild.id);
    if (!gc.auditEnabled || !gc.auditChannelId || gc.auditLogRoleChanges === false) return;
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    if (addedRoles.size === 0 && removedRoles.size === 0) return;
    const changes = [];
    addedRoles.forEach(r => changes.push(`+ <@&${r.id}>`));
    removedRoles.forEach(r => changes.push(`- <@&${r.id}>`));
    const fetchLogs = await newMember.guild.fetchAuditLogs({ limit: 1, type: 1 }).catch(() => null);
    const modLog2 = fetchLogs?.entries?.first();
    auditLog(newMember.guild.id, "🎭 Cambio de roles", `**Usuario:** <@${newMember.id}>\n**Cambios:** ${changes.join(", ")}\n**Moderador:** ${modLog2?.executor ? `<@${modLog2.executor.id}>` : "Sistema"}`);
  } catch {}
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  try {
    const gc = getGuildConfig(newChannel.guild.id);
    if (!gc.auditEnabled || !gc.auditChannelId || gc.auditLogChannelEdits === false) return;
    if (oldChannel.name === newChannel.name && oldChannel.topic === newChannel.topic) return;
    const fetchLogs = await newChannel.guild.fetchAuditLogs({ limit: 1, type: 11 }).catch(() => null);
    const chLog = fetchLogs?.entries?.first();
    const changes = [];
    if (oldChannel.name !== newChannel.name) changes.push(`Nombre: \`${oldChannel.name}\` → \`${newChannel.name}\``);
    if (oldChannel.topic !== newChannel.topic) changes.push(`Topic cambiado`);
    auditLog(newChannel.guild.id, "📝 Canal editado", `**Canal:** <#${newChannel.id}>\n**Cambios:** ${changes.join("\n")}\n**Moderador:** ${chLog?.executor ? `<@${chLog.executor.id}>` : "Desconocido"}`);
  } catch {}
});

client.on(Events.ChannelCreate, async (channel) => {
  try {
    if (!channel.guild) return;
    const gc = getGuildConfig(channel.guild.id);
    if (!gc.auditEnabled || !gc.auditChannelId || gc.auditLogChannels === false) return;
    const fetchLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: 10 }).catch(() => null);
    const chLog = fetchLogs?.entries?.first();
    const typeName = channel.type === 2 ? "voz" : channel.type === 4 ? "categoría" : "texto";
    auditLog(channel.guild.id, "➕ Canal creado", `**Canal:** ${channel.name} (${typeName})\n**Moderador:** ${chLog?.executor ? `<@${chLog.executor.id}>` : "Desconocido"}`);
  } catch {}
});

client.on(Events.ChannelDelete, async (channel) => {
  try {
    if (!channel.guild) return;
    const gc = getGuildConfig(channel.guild.id);
    if (!gc.auditEnabled || !gc.auditChannelId || gc.auditLogChannels === false) return;
    const fetchLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: 12 }).catch(() => null);
    const chLog = fetchLogs?.entries?.first();
    const typeName = channel.type === 2 ? "voz" : channel.type === 4 ? "categoría" : "texto";
    auditLog(channel.guild.id, "🗑️ Canal eliminado", `**Canal:** ${channel.name} (${typeName})\n**Moderador:** ${chLog?.executor ? `<@${chLog.executor.id}>` : "Desconocido"}`);
  } catch {}
});

// ============== AUTO-RECONNECT ==============
client.on(Events.Error, (err) => {
  console.error("❌ Client error:", err.message);
});

client.on(Events.ShardDisconnect, () => {
  console.log("🔴 Disconnected. Reconnecting in 5s...");
});

client.on(Events.ShardReconnecting, () => {
  console.log("🟡 Reconnecting...");
});

client.on(Events.ShardResume, () => {
  console.log("🟢 Resumed connection.");
});

// ============== WEB DASHBOARD (mismo proceso, misma DB) ==============
// Se activa con DASHBOARD_PORT (ej: 3000). Requiere DISCORD_CLIENT_ID,
// DISCORD_CLIENT_SECRET y DASHBOARD_URL para el login con Discord.
if (process.env.DASHBOARD_PORT) {
  try {
    const { startDashboard } = require("./dashboard/server.js");
    startDashboard({
      client, db, getGuildConfig, saveGuilds, getGuildStaff, saveStaff, buildVerifyPanel, buildTestMessage, buildTicketPanel, registrarComandos,
      cmdRegStatus, cmdRegSaveSettings, arrancarRegistroComandos, botSalud, probarRegistroComandos, probarMusica,
      stores: { events, teams, openTickets, clips },
      setLockdown: async (guildId, on) => {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error("servidor no encontrado");
        await setLockdown(guild, on);
        return guild.channels.cache.size;
      },
      suggestionsApi: {        list(guildId) {
          return [...activeSuggestions.values()]
            .filter(s => (s.guildId || "") === guildId)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .map(s => ({
              key: `${s.guildId}:${s.id}`, id: s.id, titulo: s.titulo, desc: String(s.desc || "").slice(0, 300),
              authorTag: s.authorTag || "", status: s.status || "pending",
              up: s.up || 0, down: s.down || 0, neutral: s.neutral || 0, total: s.total || 0,
              createdAt: s.createdAt || 0, decidedByTag: s.decidedByTag || "", reason: s.reason || "",
              channelId: s.channelId || "", messageId: s.messageId || "",
            }));
        },
        async decide(guildId, sugId, action, reason, actorTag) {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) throw new Error("servidor no encontrado");
          const sug = activeSuggestions.get(`${guildId}:${sugId}`) || findSuggestion(guildId, sugId);
          if (!sug) throw new Error("sugerencia no encontrada");
          if (sug.status !== "pending") throw new Error(`ya fue cerrada (${sug.status})`);
          if (!["aceptar", "rechazar"].includes(action)) throw new Error("acción inválida");
          const votes = await decideSuggestion(guild, sug, action, String(reason || "").slice(0, 500), { tag: actorTag || "dashboard", id: "" });
          return { id: sug.id, up: votes.up, down: votes.down };
        },
        async remove(guildId, sugId) {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) throw new Error("servidor no encontrado");
          const sug = activeSuggestions.get(`${guildId}:${sugId}`) || findSuggestion(guildId, sugId);
          if (!sug) throw new Error("sugerencia no encontrada");
          await deleteSuggestion(guild, sug);
          return true;
        },
      },
      sanctionsApi: {
        list(guildId) {          return [...sanctions.values()]
            .filter(s => (s.guildId || "") === guildId)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .map(s => ({
              id: s.id, userId: s.userId, userTag: s.userTag || "", type: s.type,
              reason: s.reason || "", moderatorTag: s.moderatorTag || "",
              evidence: !!s.evidence, evidenceUrl: s.evidenceUrl || "",
              createdAt: s.createdAt || 0, expiresAt: s.expiresAt || 0,
              durationMs: s.durationMs || 0, active: !!s.active,
            }));
        },
        async add(guildId, { userId, type, duration, reason }, actorTag) {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) throw new Error("servidor no encontrado");
          if (!/^\d{17,20}$/.test(String(userId || ""))) throw new Error("ID de usuario inválida");
          if (!["ban", "tempban"].includes(type)) throw new Error("tipo inválido");
          let durationMs = 0;
          if (type === "tempban") {
            durationMs = parseDurationStr(duration);
            if (!durationMs) throw new Error("duración inválida (ej: 10m, 2h, 7d)");
          }
          let tag = String(userId);
          try { const u = await client.users.fetch(String(userId)); tag = u.tag; } catch {}
          const c = await applyBanCase(guild, {
            userId: String(userId), userTag: tag, type, durationMs,
            reason: String(reason || "Sin razón").slice(0, 400),
            moderator: { tag: actorTag || "dashboard", id: "" },
          });
          return { id: c.id };
        },
        async unban(guildId, ref, actorTag) {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) throw new Error("servidor no encontrado");
          const s = findSanction(guildId, ref) || [...sanctions.values()].find(x => x.guildId === guildId && x.userId === String(ref) && x.active);
          if (!s) throw new Error("caso no encontrado");
          try { await guild.members.unban(s.userId, `Desbaneo desde panel (por ${actorTag || "dashboard"})`.slice(0, 512)); } catch (e) { throw new Error("no se pudo desbanear (¿sigue baneado?)"); }
          s.active = false;
          saveSanction(s);
          sancLog(guildId, s.type || "ban", "✅ Desbaneo", `**Usuario:** <@${s.userId}>\n**Caso:** ${s.id}\n**Moderador:** ${actorTag || "dashboard"}`);
          return { id: s.id };
        },
        async remove(guildId, ref) {
          const s = findSanction(guildId, ref);
          if (!s || s.guildId !== guildId) throw new Error("caso no encontrado");
          sanctions.delete(`${s.guildId}:${s.id}`);
          try { db.delSanction(s.guildId, s.id); } catch {}
          return true;
        },
      },
      rescueApi: {
        get(guildId) {
          const st = rescueState(guildId);
          return {
            keyActive: !!st.keyHash, keyHint: st.keyHint, expiresAt: st.expiresAt, usesLeft: st.usesLeft,
            createdAt: st.createdAt, createdBy: st.createdBy, rescueRoleId: st.rescueRoleId,
            grants: st.grants, coOwners: st.coOwners,
          };
        },
        setRole(guildId, roleId) {
          const st = rescueState(guildId);
          const r = String(roleId || "");
          db.setRescue(guildId, { ...st, rescueRoleId: /^\d{17,20}$/.test(r) ? r : "" });
          return this.get(guildId);
        },
        revokeKey(guildId) { revokeRescueKey(guildId); return this.get(guildId); },
        coOwner(guildId, userId, add) { setCoOwners(guildId, userId, add); return this.get(guildId); },
        revokeGrant(guildId, userId) { revokeGrant(guildId, userId); return this.get(guildId); },
      },
      premiumApi: {
        features(guildId) {
          return Object.entries(PREMIUM_FEATURES).map(([id, f]) => ({
            id, name: f.name, plans: f.plans, grupo: f.grupo || "comunidad",
            unlocked: isPremium(guildId, id),
            enabled: licenseState(guildId).isOn(id),
            canToggle: !!PREMIUM_FEATURES[id],
          }));
        },
        state(guildId) {
          const st = licenseState(guildId);
          const ownerAll = ownerPremiumAll();
          const feats = Object.entries(PREMIUM_FEATURES).map(([id, f]) => ({
            id, name: f.name, plans: f.plans, grupo: f.grupo || "comunidad",
            unlocked: isPremium(guildId, id),
            enabled: st.isOn(id),
          }));
          return {
            active: st.active || ownerAll, plans: st.plans, whiteLabel: st.whiteLabel || ownerAll, keys: st.keys,
            ownerAll, owner: BOT_OWNER_ID,
            plansInfo: PREMIUM_PLANS, features: feats, brand: brandOf(guildId), flags: st.flags,
          };
        },
        setFeature(guildId, feature, on) {
          if (!PREMIUM_FEATURES[feature]) throw new Error("función desconocida");
          db.setPremiumFlag(guildId, feature, on !== false && on !== 0 && on !== "false");
          return this.state(guildId);
        },
        // Interruptor global: todo Premium para el dueño (sin licencia)
        setOwnerAll(on) {
          db.miscSet("premiumOwnerAll", on === false || on === 0 || on === "false" ? 0 : 1);
          return ownerPremiumAll();
        },
        grant(guildId, data) {
          // Solo el dueño del bot puede emitir licencias desde el panel
          const plan = String(data && data.plan || "perpetual");
          if (!PREMIUM_PLANS[plan]) throw new Error("plan inválido");
          const key = (data && data.key ? String(data.key).trim().toUpperCase() : genLicenseKey());
          const dias = Math.max(0, Number(data && data.dias) || 0);
          db.setLicense(guildId, key, { plan, expiresAt: dias > 0 ? Date.now() + dias * 86400000 : 0, by: (data && data.by) || "panel", at: Date.now() });
          return this.state(guildId);
        },
        revoke(guildId, key) {
          const l = findLicense(key);
          if (l && l.guildId === guildId) db.delLicense(key);
          return this.state(guildId);
        },
        setBrand(guildId, patch) {
          const gc = getGuildConfig(guildId);
          if (patch.name !== undefined) gc.brandName = String(patch.name).slice(0, 40);
          if (patch.icon !== undefined) gc.brandIconUrl = String(patch.icon).slice(0, 300);
          if (patch.color !== undefined) gc.brandColor = String(patch.color).slice(0, 9);
          if (patch.footer !== undefined) gc.brandFooter = String(patch.footer).slice(0, 200);
          saveGuilds();
          return this.state(guildId);
        },
        serviciosApi: {
        // ---- Categorias de tickets ----
        ticketCats(guildId) { return ticketCats(guildId); },
        saveTicketCat(guildId, data) {
          const id = String(data.id || ("cat" + Date.now()));
          const cat = {
            id,
            label: String(data.label || "Nueva").slice(0, 60),
            emoji: String(data.emoji || "🏷").slice(0, 8),
            desc: String(data.desc || "").slice(0, 120),
            prefix: String(data.prefix || "ticket").slice(0, 20),
            questions: Array.isArray(data.questions) ? data.questions.map(q => String(q).slice(0, 100)).filter(Boolean).slice(0, 5) : [],
          };
          db.setTicketCat(guildId, id, cat);
          return cat;
        },
        removeTicketCat(guildId, cid) { db.delTicketCat(guildId, cid); return { ok: true }; },
        // ---- Reseñas ----
        reviews(guildId) { return db.getReviews(guildId); },
        addReview(guildId, data) {
          if (!isPremium(guildId, "reviews")) throw new Error("las reseñas son Premium");
          const r = {
            id: "r" + Date.now(),
            from: String(data.from || ""),
            to: String(data.to || ""),
            stars: Math.max(1, Math.min(5, Number(data.stars) || 5)),
            text: String(data.text || "").slice(0, 500),
            at: Date.now(),
          };
          db.setReview(guildId, r.id, r);
          return { id: r.id, rating: mediaResenas(guildId, r.to) };
        },
        removeReview(guildId, rid) { db.delReview(guildId, rid); return { ok: true }; },
        // ---- Comisiones ----
        commissions(guildId) { return db.getCommissions(guildId); },
        addCommission(guildId, data) {
          if (!isPremium(guildId, "commissions")) throw new Error("las comisiones son Premium");
          const c = {
            id: "c" + Date.now(),
            freelancer: String(data.freelancer || ""),
            client: String(data.client || ""),
            service: String(data.service || "").slice(0, 200),
            amount: Math.max(0, Number(data.amount) || 0),
            status: "pending",
            at: Date.now(),
          };
          db.setCommission(guildId, c.id, c);
          return c;
        },
        resolveCommission(guildId, cid, data) {
          const list = db.getCommissions(guildId);
          const c = list.find(x => x.id === cid);
          if (!c) throw new Error("comisión no encontrada");
          c.status = data && data.paid ? "paid" : "cancelled";
          db.setCommission(guildId, c.id, c);
          return c;
        },
        // ---- Retiros ----
        withdraws(guildId) { return db.getWithdraws(guildId); },
        addWithdraw(guildId, data) {
          if (!isPremium(guildId, "withdraws")) throw new Error("los retiros son Premium");
          const w = {
            id: "w" + Date.now(),
            user: String(data.user || ""),
            mail: String(data.mail || "").slice(0, 100),
            amount: Math.max(0, Number(data.amount) || 0),
            status: "pending",
            at: Date.now(),
          };
          db.setWithdraw(guildId, w.id, w);
          return w;
        },
        resolveWithdraw(guildId, wid, accept) {
          const list = db.getWithdraws(guildId);
          const w = list.find(x => x.id === wid);
          if (!w) throw new Error("retiro no encontrado");
          w.status = accept ? "paid" : "denied";
          db.setWithdraw(guildId, w.id, w);
          return w;
        },
        // ---- Facturas ----
        invoices(guildId) { return db.getInvoices(guildId); },
        addInvoice(guildId, data) {
          if (!isPremium(guildId, "invoices")) throw new Error("las facturas son Premium");
          const gc = getGuildConfig(guildId) || {};
          const pref = String(gc.invoicePrefix || "INV");
          const num = (db.getInvoices(guildId).length + 1);
          const inv = {
            id: pref + "-" + String(num).padStart(4, "0"),
            seller: String(data.seller || "").slice(0, 100),
            client: String(data.client || "").slice(0, 100),
            service: String(data.service || "").slice(0, 200),
            amount: Math.max(0, Number(data.amount) || 0),
            method: String(data.method || "crypto"),
            status: "pending",
            at: Date.now(),
          };
          db.setInvoice(guildId, inv.id, inv);
          return inv;
        },
        // ---- Freelancers ----
        freelancers(guildId) { return db.getFreelancers(guildId); },
        setFreelancer(guildId, userId, data) {
          if (!isPremium(guildId, "freelancers")) throw new Error("el sistema de freelancers es Premium");
          const cur = db.getFreelancer(guildId, userId) || {};
          const f = {
            available: data.available !== undefined ? !!data.available : (cur.available || false),
            hours: String(data.hours || cur.hours || "").slice(0, 100),
            bio: String(data.bio || cur.bio || "").slice(0, 500),
            services: Array.isArray(data.services) ? data.services.map(String).slice(0, 10) : (cur.services || []),
            updatedAt: Date.now(),
          };
          db.setFreelancer(guildId, userId, f);
          return f;
        },
      },
      timers(guildId) { return { list: db.getGuildTimers(guildId) }; },
        setTimer(guildId, obj) { db.setTimer(guildId, obj); return { list: db.getGuildTimers(guildId) }; },
        delTimer(guildId, id) { db.delTimer(guildId, id); return { list: db.getGuildTimers(guildId) }; },
        entryMsgs(guildId) { return { list: db.getEntryMsgs(guildId) }; },
        setEntryMsgs(guildId, list) { db.setEntryMsgs(guildId, list); return { list: db.getEntryMsgs(guildId) }; },
        counters(guildId) { return { list: db.getCounters(guildId) }; },
        setCounter(guildId, obj) { db.setCounter(guildId, obj); return { list: db.getCounters(guildId) }; },
        delCounter(guildId, id) { db.delCounter(guildId, id); return { list: db.getCounters(guildId) }; },
        metrics(guildId, days) { return { list: db.getMetrics(guildId, Math.max(1, Math.min(30, days || 14))) }; },
      },
      permitsApi: {
        get(guildId) {
          const cfg = permitCfg(guildId);
          return {
            enabled: cfg.enabled,
            permits: cfg.permits,
            modules: MODULE_META.map(m => ({ id: m.id, name: m.name, icon: m.icon, cmds: (MODULE_COMMANDS[m.id] || []).length })),
          };
        },
        save(guildId, data) {
          const valid = new Set(MODULE_META.map(m => m.id));
          const permits = (Array.isArray(data && data.permits) ? data.permits : []).slice(0, 20).map((p, i) => ({
            id: String(p.id || `p${i}`).slice(0, 24),
            name: String(p.name || `Nivel ${i + 1}`).slice(0, 40),
            color: /^#[0-9a-f]{6}$/i.test(String(p.color)) ? p.color : "#5865F2",
            rank: i,
            roles: (Array.isArray(p.roles) ? p.roles : []).map(String).filter(r => /^\d{17,20}$/.test(r)).slice(0, 20),
            modules: (Array.isArray(p.modules) ? p.modules : []).map(String).filter(m => valid.has(m)),
          }));
          db.setPermits(guildId, { enabled: !!(data && data.enabled), permits });
          return this.get(guildId);
        },
        check(guildId, userId) {
          return this.get(guildId);
        },
      },
      heatApi: {
        actions() { return HEAT_ACTIONS; },
        defaults() { return HEAT_DEFAULT_CFG; },
        get(guildId) { return { cfg: heatCfg(guildId), list: heatList(guildId) }; },
        save(guildId, data) {
          const raw = data || {};
          const tiers = (Array.isArray(raw.tiers) ? raw.tiers : []).slice(0, 8).map(t => ({
            heat: Math.max(1, Number(t.heat) || 0),
            action: HEAT_ACTIONS.includes(t.action) ? t.action : "none",
            minutes: Math.max(0, Math.min(40320, Number(t.minutes) || 0)),
            reset: !!t.reset,
          })).filter(t => t.heat > 0);
          const cfg = {
            enabled: !!raw.enabled,
            perViolation: Math.max(1, Math.min(500, Number(raw.perViolation) || 10)),
            decayHours: Math.max(1, Math.min(720, Number(raw.decayHours) || 24)),
            onAutomod: !!raw.onAutomod, onWarn: !!raw.onWarn, dmUser: !!raw.dmUser, replaceFilter: !!raw.replaceFilter,
            tiers,
          };
          db.setHeatCfg(guildId, cfg);
          return { cfg, list: heatList(guildId) };
        },
        reset(guildId, userId, full) {
          if (!/^\d{17,20}$/.test(String(userId || ""))) return { ok: false };
          if (full) db.setHeat(guildId, userId, 0, 0, Date.now());
          else { const r = heatRow(guildId, userId); db.setHeat(guildId, userId, 0, r.tier, Date.now()); }
          return { ok: true, list: heatList(guildId) };
        },
        add(guildId, userId, points) {
          if (!/^\d{17,20}$/.test(String(userId || ""))) return { ok: false, error: "userId inválido" };
          const cfg = heatCfg(guildId);
          const p = Math.max(0, Number(points) || 0);
          const r = heatRow(guildId, userId);
          db.setHeat(guildId, userId, r.points + p, r.tier, Date.now());
          return { ok: true, list: heatList(guildId) };
        },
      },
      socialWatchApi: {
        platforms() {
          return Object.entries(SOCIAL_PLATFORMS).map(([id, p]) => ({ id, name: p.name, icon: p.icon, modes: p.modes, hint: p.hint }));
        },
        list(guildId) { return getSocialWatch(guildId); },
        save(guildId, list) { return saveSocialWatch(guildId, list); },
        async test(guildId, entry) {
          const clean = cleanSocialEntries([entry])[0];
          if (!clean) return { ok: false, error: "entrada inválida" };
          const res = await checkSocialEntry(clean);
          const state = res.error ? `Error: ${res.error}` : (res.live ? "En directo" : (res.video ? `Vídeo: ${res.video.title}` : "Sin directo"));
          const sent = await sendSocialAlert(guildId, clean, {
            kind: res.live ? "live" : "video",
            title: res.title || (res.video && res.video.title) || "Mensaje de prueba",
            game: res.game || "", viewers: res.viewers,
            url: (res.url || (res.video && res.video.url) || ""), thumb: res.thumb,
          }, true);
          return { ok: true, sent, state };
        },
      },
      modswApi: {
        catalog() {
          return MODULE_META.map(m => ({ id: m.id, icon: m.icon, commands: MODULE_COMMANDS[m.id] || [] }));
        },
        get(guildId) {
          const sw = getModuleSw(guildId);
          return this.catalog().map(m => ({ id: m.id, on: sw[m.id] !== false }));
        },
        save(guildId, data) {
          const prev = db.getModSw(guildId) || {};
          const valid = new Set(MODULE_META.map(m => m.id));
          const clean = { ...prev };
          for (const [k, v] of Object.entries(data || {})) {
            if (valid.has(k)) clean[k] = v !== false;
          }
          db.setModSw(guildId, clean);
          clearModuleSwCache(guildId);
          return this.get(guildId);
        },
      },
      cmdpermsApi: {
        catalog() {
          const out = CMD_CATALOG.map(c => ({ ...c }));
          const have = new Set(out.map(c => c.cmd));
          for (const c of MOD_COMMANDS) {
            if (have.has(c.cmd)) continue;
            out.push({
              cmd: c.cmd, desc: c.desc, desc_en: c.desc_en, sub: false, mod: true,
              ctx: !!c.ctx, group: COMMAND_MODULE[c.cmd] || "moderation", subs: [], args: [],
            });
          }
          return out;
        },
        get(guildId) {
          const out = {};
          const base = db.getCmdPerms(guildId) || {};
          for (const { cmd } of this.catalog()) {
            const e = getModEntry(guildId, cmd);
            out[cmd] = {
              enabled: e.enabled, alias: e.alias,
              allowUsers: e.allowUsers, allowRoles: e.allowRoles,
              denyUsers: e.denyUsers, denyRoles: e.denyRoles,
              allowChannels: e.allowChannels, denyChannels: e.denyChannels,
              deleteInvoke: e.deleteInvoke, deleteReplySec: e.deleteReplySec,
              deleteOnSourceDelete: e.deleteOnSourceDelete,
            };
          }
          for (const k of Object.keys(base)) if (!out[k]) out[k] = getModEntry(guildId, k);
          return out;
        },
        save(guildId, perms) {
          const clean = {};
          const prev = db.getCmdPerms(guildId) || {};
          const ids = (v) => Array.isArray(v) ? [...new Set(v.map(String).filter(u => /^\d{17,20}$/.test(u)))].slice(0, 100) : [];
          const names = new Set(this.catalog().map(c => c.cmd));
          for (const [cmd, raw] of Object.entries(perms || {})) {
            if (!names.has(cmd)) continue;
            const e = raw && typeof raw === "object" ? raw : {};
            const old = prev[cmd] || {};
            clean[cmd] = {
              enabled: e.enabled === undefined ? (old.enabled !== false) : !!e.enabled,
              alias: e.alias === undefined ? (old.alias || "") : cleanAliasName(e.alias),
              allowUsers: e.allowUsers ? ids(e.allowUsers) : (old.allowUsers || []),
              allowRoles: e.allowRoles ? ids(e.allowRoles) : (old.allowRoles || []),
              denyUsers: e.denyUsers ? ids(e.denyUsers) : (old.denyUsers || []),
              denyRoles: e.denyRoles ? ids(e.denyRoles) : (old.denyRoles || []),
              allowChannels: e.allowChannels ? ids(e.allowChannels) : (old.allowChannels || []),
              denyChannels: e.denyChannels ? ids(e.denyChannels) : (old.denyChannels || []),
              deleteInvoke: e.deleteInvoke === undefined ? !!old.deleteInvoke : !!e.deleteInvoke,
              deleteReplySec: e.deleteReplySec === undefined
                ? Math.max(0, Math.min(3600, Number(old.deleteReplySec) || 0))
                : Math.max(0, Math.min(3600, Number(e.deleteReplySec) || 0)),
              deleteOnSourceDelete: e.deleteOnSourceDelete === undefined ? !!old.deleteOnSourceDelete : !!e.deleteOnSourceDelete,
            };
          }
          for (const cmd of Object.keys(prev)) if (!clean[cmd] && names.has(cmd)) clean[cmd] = getModEntry(guildId, cmd);
          db.setCmdPerms(guildId, clean);
          clearAliasCache(guildId);
          const aliasState = { names: [], ok: true };
          const hasAlias = Object.values(clean).some(e => e.alias);
          if (hasAlias) {
            const r = syncGuildAliases(guildId);
            if (r && typeof r.then === "function") {
              aliasState.ok = true;
              r.then(res => { if (res && res.error) console.error("⚠️ alias:", res.error); }).catch(() => {});
            } else if (r) {
              aliasState.ok = !!r.ok;
              aliasState.error = r.error || null;
              aliasState.aliases = r.aliases || [];
            }
          }
          return { perms: clean, aliasState, maxAliases: ALIAS_MAX_PER_GUILD };
        },
      },
      eventsApi: {
        async create(guildId, data) {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) throw new Error("servidor no encontrado");
          const nombre = String(data.nombre || "").trim().slice(0, 100);
          if (!nombre) throw new Error("nombre requerido");
          const canal = await guild.channels.fetch(data.channelId).catch(() => null);
          if (!canal || !canal.isTextBased()) throw new Error("canal inválido");
          const role = await guild.roles.create({ name: `🎮 ${nombre}`.slice(0, 100), color: 0x5865F2, reason: "Evento HYDRA" });
          let counter = (db.miscGet("eventCounter", 0) || 0) + 1;
          db.miscSet("eventCounter", counter);
          eventCounter = counter;
          const eventId = `EVT-${counter}`;
          let fechaTs = Math.floor(Date.now() / 1000) + 86400;
          if (data.fecha) {
            const [y, m, d] = String(data.fecha).split("-").map(Number);
            const [hh, mm] = String(data.hora || "18:00").split(":").map(Number);
            const ts = Math.floor(new Date(y, m - 1, d, hh || 18, mm || 0, 0).getTime() / 1000);
            if (!isNaN(ts)) fechaTs = ts;
          }
          const ev = {
            nombre, desc: String(data.desc || "Sin descripción").slice(0, 2000),
            fecha: data.fecha || "", hora: data.hora || "",
            cupos: Math.max(1, Math.min(10000, Number(data.cupos) || 50)),
            modo: String(data.modo || "General").slice(0, 100), fechaTs, roleId: role.id,
            participants: [], status: "abierto", eventTeams: [], eliminatedTeams: [],
            messageId: null, channelId: canal.id, guildId,
            displayMessageId: null, displayChannelId: null, premio: String(data.premio || ""),
            footer: "", miniatura: "", mencion: "none",
          };
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`evento_info_${eventId}`).setLabel("📋 Info").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`evento_join_${eventId}`).setLabel("✅ Unirse").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`evento_leave_${eventId}`).setLabel("🚪 Salir").setStyle(ButtonStyle.Danger),
          );
          const msg = await canal.send({ embeds: [buildEventDisplayEmbed(ev, guild)], components: [row] });
          ev.messageId = msg.id;
          events.set(eventId, ev);
          saveEvents();
          return { id: eventId };
        },
        update(guildId, id, patch) {
          const ev = events.get(id);
          if (!ev || (ev.guildId || "") !== guildId) return false;
          if (patch.nombre !== undefined) ev.nombre = String(patch.nombre).slice(0, 100) || ev.nombre;
          if (patch.desc !== undefined) ev.desc = String(patch.desc).slice(0, 2000);
          if (patch.modo !== undefined) ev.modo = String(patch.modo).slice(0, 100);
          if (patch.cupos !== undefined) ev.cupos = Math.max(1, Math.min(10000, Number(patch.cupos) || ev.cupos));
          if (patch.premio !== undefined) ev.premio = String(patch.premio).slice(0, 500);
          saveEvents();
          try {
            const guild = client.guilds.cache.get(guildId);
            if (guild) updateEventDisplay(guild, ev);
          } catch {}
          return true;
        },
        list(guildId) {
          return [...events.entries()]
            .filter(([, e]) => (e.guildId || "") === guildId)
            .map(([id, e]) => ({ id, nombre: e.nombre, status: e.status, fechaTs: e.fechaTs, modo: e.modo, cupos: e.cupos, count: (e.participants || []).length, channelId: e.channelId || "" }));
        },
        get(guildId, id) {
          const e = events.get(id);
          if (!e || (e.guildId || "") !== guildId) return null;
          return { id, nombre: e.nombre, status: e.status, fechaTs: e.fechaTs, modo: e.modo, cupos: e.cupos, desc: e.desc, premio: e.premio, participants: e.participants || [] };
        },
        setStatus(guildId, id, status) {
          const e = events.get(id);
          if (!e || (e.guildId || "") !== guildId) return false;
          e.status = status;
          saveEvents();
          return true;
        },
        remove(guildId, id) {
          const e = events.get(id);
          if (!e || (e.guildId || "") !== guildId) return false;
          events.delete(id);
          saveEvents();
          return true;
        },
      },
      teamsApi: {
        list(guildId) {
          return teamsOf(guildId).map(([, t]) => ({ name: t.name, members: (t.members || []).length, specialty: t.specialty || "", roleId: t.roleId || "", eventId: t.eventId || "" }));
        },
        async rename(guildId, oldName, newName) {
          const t = teamGet(guildId, oldName);
          if (!t) return { ok: false, error: "no encontrado" };
          const clean = String(newName || "").trim().slice(0, 50);
          if (!clean) return { ok: false, error: "nombre inválido" };
          if (teamGet(guildId, clean)) return { ok: false, error: "ya existe" };
          t.name = clean;
          t.roleName = `🎮 ${clean}`;
          try {
            const guild = client.guilds.cache.get(guildId);
            const role = t.roleId ? await guild.roles.fetch(t.roleId).catch(() => null) : null;
            if (role) await role.setName(`🎮 ${clean}`.slice(0, 100)).catch(() => {});
          } catch {}
          for (const [, ev] of events) {
            if ((ev.guildId || "") !== guildId) continue;
            for (const et of (ev.eventTeams || [])) {
              if (et.roleId === t.roleId || et.name === oldName) et.name = clean;
            }
            if (ev.eliminatedTeams) {
              const ix = ev.eliminatedTeams.indexOf(oldName);
              if (ix !== -1) ev.eliminatedTeams[ix] = clean;
            }
          }
          teams.delete(teamKeyOf(guildId, oldName));
          teams.set(teamKeyOf(guildId, clean), t);
          saveTeams();
          saveEvents();
          return { ok: true };
        },
        async remove(guildId, name) {
          const t = teamGet(guildId, name);
          if (!t) return false;
          try {
            const guild = client.guilds.cache.get(guildId);
            const role = t.roleId ? await guild.roles.fetch(t.roleId).catch(() => null) : null;
            if (role) await role.delete().catch(() => {});
          } catch {}
          teamDel(guildId, name);
          return true;
        },
      },
    });
  } catch (e) { console.error("Dashboard error:", e.message); }
}

client.login(process.env.TOKEN);
