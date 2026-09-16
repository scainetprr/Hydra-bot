// ============================================================
// HYDRA Captcha Bot — explicado desde 0 para principiantes
// Lee el README.md primero. Este archivo tiene 7 SECCIONES.
// Cada SECCIÓN dice QUÉ hace y POR QUÉ existe, en español fácil.
// La lógica es la misma que ya funcionaba: no se rompió nada,
// solo se agregaron comentarios para aprender.
// ============================================================

// ---------- SECCIÓN 1: LAS HERRAMIENTAS (librerías) ----------
// Piensa en esto como abrir tu caja de herramientas antes de armar algo.
// - discord.js: para hablar con Discord (mensajes, botones, rangos).
// - canvas: para DIBUJAR la imagen del captcha.
// - dotenv: para leer tus secretos del archivo .env (token e IDs).
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  Partials,
} = require("discord.js");
const { createCanvas } = require("canvas");
// ============================================================
// BOT-LISTO - funciona tal cual. Solo edita PERSONALIZA.
// 1) Descarga este repo o el ZIP. 2) Crea tu .env (README Paso 3).
// 3) Cambia aqui textos, colores, imagen y letra. 4) npm install.
// 5) node BOT-LISTO.js. Tu TOKEN e IDs van en .env, nunca aqui.
// ============================================================
const PERSONALIZA = {
  tituloPanel: "\uD83D\uDD10 Verificación Requerida",
  descripcionPanel: "Para acceder a todo el servidor, debes completar la verificación.\n\n" + "Haz clic en el botón de abajo para recibir tu captcha.\n" + "Escribe el código que veas en la imagen para verificarte.",
  textoBoton: "Verificarme",
  imagenMiniatura: "https://i.imgur.com/GJfEY.png",
  textoPie: "HYDRA Bot",
  colorPanel: 0x5865f2,
  tituloVentana: "Completa el Captcha",
  etiquetaCaja1: "Escribe el código que ves en la imagen",
  etiquetaCaja2: "Escribe el código que ves arriba",
  ejemploCodigo: "Ej: ABC123",
  tituloExito: "\u2705 Verificación Completa",
  mensajeExito: "Ya tienes acceso a todo el servidor. ¡Disfruta!",
  tituloFallo: "\u274C Captcha Incorrecto",
  mensajeFallo: "El código no coincide. Intenta de nuevo.",
  longitudCaptcha: 6,
  coloresLetras: ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD"],
  fuente: "Arial",
  tamanoLetra: 55,
};

// ---------- SECCIÓN 2: ENCENDER AL BOT (cliente + intents) ----------
// Los "intents" son permisos: le decimos a Discord qué queremos ver.
// - Guilds: tu servidor existe.
// - GuildMembers: quién entra/sale (para poner "No Verificado").
// - GuildMessages + MessageContent: leer mensajes si hace falta.
// Sin estos intents activados TAMBIÉN en la web de Discord, el bot queda ciego.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ---------- SECCIÓN 3: TU CONFIGURACIÓN (lee el .env) ----------
// Aquí NO escribas tu token directamente. Viene del archivo .env
// que TÚ creaste copiando .env.example. Así tu secreto nunca sube a GitHub.
// Si el bot falla al arrancar, el 90% de las veces es un ID mal copiado.
const CONFIG = {
  guildId: process.env.GUILD_ID,
  verifiedRoleId: process.env.ROLE_VERIFIED,
  unverifiedRoleId: process.env.ROLE_UNVERIFIED,
  verificationChannelId: process.env.CHANNEL_VERIFICATION,
  captchaLength: PERSONALIZA.longitudCaptcha,
  captchaColors: PERSONALIZA.coloresLetras,
};

// Guardamos los captchas pendientes en memoria:
// { idDelUsuario: "K7P2Q9" }. Cuando responde, comparamos y borramos.
const pendingCaptchas = new Map();

// ---------- SECCIÓN 4: EL CAPTCHA (texto + dibujo) ----------
// 4A: Crear texto. Usamos letras/números que NO se confunden.
// Fíjate: no hay O (letra) ni 0 (cero), ni I ni 1. Es a propósito.
function generateCaptchaText(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 4B: Dibujar la imagen de 400x150.
// Pasos: fondo con degradado → líneas y puntitos de ruido (para que
// los robots no lo lean fácil) → letras de colores, un poco giradas.
async function generateCaptchaImage(text) {
  const canvas = createCanvas(400, 150);
  const ctx = canvas.getContext("2d");

  // Fondo oscuro bonito
  const gradient = ctx.createLinearGradient(0, 0, 400, 150);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(0.5, "#16213e");
  gradient.addColorStop(1, "#0f3460");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 400, 150);

  // Líneas de ruido
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
    ctx.lineWidth = Math.random() * 2 + 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 400, Math.random() * 150);
    ctx.lineTo(Math.random() * 400, Math.random() * 150);
    ctx.stroke();
  }

  // Puntitos de ruido
  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 400, Math.random() * 150, Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Letras: cada una con su color, un poco movida y girada
  const fontSize = PERSONALIZA.tamanoLetra;
  ctx.font = `bold ${fontSize}px ${PERSONALIZA.fuente}`;
  ctx.textBaseline = "middle";

  const totalWidth = text.length * (fontSize * 0.75);
  const startX = (400 - totalWidth) / 2 + fontSize * 0.4;

  for (let i = 0; i < text.length; i++) {
    const x = startX + i * (fontSize * 0.75);
    const y = 75 + (Math.random() - 0.5) * 20;
    const angle = (Math.random() - 0.5) * 0.4;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = CONFIG.captchaColors[i % CONFIG.captchaColors.length];
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }

  return canvas.toBuffer("image/png");
}

// ---------- SECCIÓN 5: EL PANEL BONITO (embed + botón) ----------
// Esto es solo diseño: título, explicación y botón verde "Verificarme".
// Aparece cuando escribes /setup-verification.
function createVerifyEmbed() {
  return new EmbedBuilder()
    .setTitle(PERSONALIZA.tituloPanel)
    .setDescription(
      PERSONALIZA.descripcionPanel


    )
    .setColor(PERSONALIZA.colorPanel)
    .setThumbnail(PERSONALIZA.imagenMiniatura)
    .setFooter({ text: PERSONALIZA.textoPie })
    .setTimestamp();
}

function createVerifyButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify_start")
      .setLabel(PERSONALIZA.textoBoton)
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
  );
}

// ---------- SECCIÓN 6: ENCENDIDO Y COMANDOS / ----------
// Cuando el bot se conecta: saluda en consola y registra los 2 slash.
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot online como ${c.user.tag}`);
  console.log(`📡 Sirviendo ${c.guilds.cache.size} servidores`);

  // Registrar slash commands
  const { REST, Routes, SlashCommandBuilder } = require("discord.js");
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    await rest.put(Routes.applicationCommands(c.user.id), {
      body: [
        new SlashCommandBuilder()
          .setName("setup-verification")
          .setDescription("Envía el panel de verificación al canal actual")
          .setDefaultMemberPermissions(0x20), // 0x20 = Administrador
        new SlashCommandBuilder()
          .setName("captcha-test")
          .setDescription("Prueba el sistema de captcha (solo admins)")
          .setDefaultMemberPermissions(0x20),
      ].map((cmd) => cmd.toJSON()),
    });
    console.log("📋 Slash commands registrados");
  } catch (err) {
    console.error("Error registering commands:", err);
  }
});

// ---------- SECCIÓN 7: CUANDO ENTRA ALGUIEN ----------
// 1) Le ponemos "No Verificado". 2) Le mandamos un DM de bienvenida.
// Si el DM no llega (los tiene bloqueados), no pasa nada: el botón sigue ahí.
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== CONFIG.guildId) return;

  try {
    const unverifiedRole = member.guild.roles.cache.get(CONFIG.unverifiedRoleId);
    if (unverifiedRole) {
      await member.roles.add(unverifiedRole);
      console.log(`📥 ${member.user.tag} entró - rango "No Verificado" asignado`);
    }

    // DM de bienvenida
    const dmEmbed = new EmbedBuilder()
      .setTitle("👋 Bienvenido a " + member.guild.name)
      .setDescription(
        "Para acceder al servidor, necesitas verificarte.\n\n" +
          `Ve al canal <#${CONFIG.verificationChannelId}> y haz clic en el botón de verificación.`
      )
      .setColor(PERSONALIZA.colorPanel);

    await member.send({ embeds: [dmEmbed] }).catch(() => {});
  } catch (err) {
    console.error("Error giving unverified role:", err);
  }
});

// ---------- SECCIÓN 8: BOTÓN + VENTANITA + PREMIO ----------
// Tres momentos:
// A) Slash (/setup-verification, /captcha-test): solo admins.
// B) Botón "Verificarme": genera imagen, la muestra SOLO a ti (efímero)
//    y abre una ventanita (modal) para escribir el código.
// C) Ventanita enviada: compara. Si acierta → quita "No Verificado",
//    pone "Verificado". Si falla → mensaje rojo, intenta de nuevo.
client.on(Events.InteractionCreate, async (interaction) => {
  // A) Slash commands
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "setup-verification") {
      if (!interaction.member.permissions.has("0x20")) {
        return interaction.reply({ content: "❌ No tienes permisos.", ephemeral: true });
      }

      await interaction.reply({
        embeds: [createVerifyEmbed()],
        components: [createVerifyButton()],
      });
    }

    if (interaction.commandName === "captcha-test") {
      if (!interaction.member.permissions.has("0x20")) {
        return interaction.reply({ content: "❌ No tienes permisos.", ephemeral: true });
      }

      const text = generateCaptchaText(CONFIG.captchaLength);
      const imageBuffer = await generateCaptchaImage(text);
      pendingCaptchas.set(interaction.user.id, text);

      const attachment = {
        attachment: imageBuffer,
        name: "captcha.png",
      };

      const modal = new ModalBuilder()
        .setCustomId("captcha_modal")
        .setTitle(PERSONALIZA.tituloVentana);

      const input = new TextInputBuilder()
        .setCustomId("captcha_input")
        .setLabel(PERSONALIZA.etiquetaCaja1)
        .setPlaceholder(PERSONALIZA.ejemploCodigo)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(CONFIG.captchaLength)
        .setMaxLength(CONFIG.captchaLength);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      await interaction.reply({ files: [attachment], ephemeral: true });
      await interaction.followUp({ modal });
    }
  }

  // B) Botón: empezar verificación
  if (interaction.isButton() && interaction.customId === "verify_start") {
    const member = await interaction.guild.members.fetch(interaction.user.id);

    // ¿Ya verificado? No hacemos nada.
    if (member.roles.cache.has(CONFIG.verifiedRoleId)) {
      return interaction.reply({
        content: "✅ Ya estás verificado.",
        ephemeral: true,
      });
    }

    // Generar captcha nuevo y guardarlo
    const text = generateCaptchaText(CONFIG.captchaLength);
    const imageBuffer = await generateCaptchaImage(text);
    pendingCaptchas.set(interaction.user.id, text);

    const attachment = {
      attachment: imageBuffer,
      name: "captcha.png",
    };

    // Ventanita para escribir
    const modal = new ModalBuilder()
      .setCustomId("captcha_modal")
      .setTitle(PERSONALIZA.tituloVentana);

    const input = new TextInputBuilder()
      .setCustomId("captcha_input")
      .setLabel(PERSONALIZA.etiquetaCaja2)
      .setPlaceholder(PERSONALIZA.ejemploCodigo)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(CONFIG.captchaLength)
      .setMaxLength(CONFIG.captchaLength);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.reply({ files: [attachment], ephemeral: true });
    await interaction.followUp({ modal });
  }

  // C) Ventanita enviada: ¿acertó?
  if (interaction.isModalSubmit() && interaction.customId === "captcha_modal") {
    const input = interaction.fields.getTextInputValue("captcha_input").toUpperCase();
    const expected = pendingCaptchas.get(interaction.user.id);

    pendingCaptchas.delete(interaction.user.id);

    if (input === expected) {
      const member = await interaction.guild.members.fetch(interaction.user.id);

      try {
        // Premio: poner verificado...
        const verifiedRole = interaction.guild.roles.cache.get(CONFIG.verifiedRoleId);
        if (verifiedRole) await member.roles.add(verifiedRole);

        // ...y quitar no verificado.
        const unverifiedRole = interaction.guild.roles.cache.get(CONFIG.unverifiedRoleId);
        if (unverifiedRole) await member.roles.remove(unverifiedRole);

        const successEmbed = new EmbedBuilder()
          .setTitle(PERSONALIZA.tituloExito);
          .setDescription(PERSONALIZA.mensajeExito)
          .setColor(0x00ff00);

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        console.log(`✅ ${interaction.user.tag} se verificó correctamente`);
      } catch (err) {
        console.error("Error assigning roles:", err);
        await interaction.reply({
          content: "❌ Error al asignar roles. Contacta a un admin.",
          ephemeral: true,
        });
      }
    } else {
      const failEmbed = new EmbedBuilder()
        .setTitle(PERSONALIZA.tituloFallo)
        .setDescription(PERSONALIZA.mensajeFallo)
        .setColor(0xff0000);

      await interaction.reply({ embeds: [failEmbed], ephemeral: true });
    }
  }
});

// ---------- SECCIÓN 9: ARRANQUE ----------
// Última línea: conéctate a Discord con tu TOKEN del .env.
// Si dice "invalid token", tu TOKEN está mal copiado.
client.login(process.env.TOKEN);
