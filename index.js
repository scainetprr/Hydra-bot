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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ============== CONFIG ==============
const CONFIG = {
  guildId: process.env.GUILD_ID,
  verifiedRoleId: process.env.ROLE_VERIFIED,
  unverifiedRoleId: process.env.ROLE_UNVERIFIED,
  verificationChannelId: process.env.CHANNEL_VERIFICATION,
  captchaLength: 6,
  captchaColors: ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD"],
};

// Store pending captchas
const pendingCaptchas = new Map();

// ============== CAPTCHA GENERATOR ==============
function generateCaptchaText(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function generateCaptchaImage(text) {
  const canvas = createCanvas(400, 150);
  const ctx = canvas.getContext("2d");

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 400, 150);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(0.5, "#16213e");
  gradient.addColorStop(1, "#0f3460");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 400, 150);

  // Noise lines
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
    ctx.lineWidth = Math.random() * 2 + 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 400, Math.random() * 150);
    ctx.lineTo(Math.random() * 400, Math.random() * 150);
    ctx.stroke();
  }

  // Noise dots
  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 400, Math.random() * 150, Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw text
  const fontSize = 55;
  ctx.font = `bold ${fontSize}px Arial`;
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

// ============== VERIFY EMBED ==============
function createVerifyEmbed() {
  return new EmbedBuilder()
    .setTitle("🔐 Verificación Requerida")
    .setDescription(
      "Para acceder a todo el servidor, debes completar la verificación.\n\n" +
        "Haz clic en el botón de abajo para recibir tu captcha.\n" +
        "Escribe el código que veas en la imagen para verificarte."
    )
    .setColor(0x5865f2)
    .setThumbnail("https://i.imgur.com/GJfEY.png")
    .setFooter({ text: "HYDRA Bot • Verificación" })
    .setTimestamp();
}

function createVerifyButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("verify_start")
      .setLabel("Verificarme")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
  );
}

// ============== EVENTS ==============
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot online como ${c.user.tag}`);
  console.log(`📡 Sirviendo ${c.guilds.cache.size} servidores`);

  // Register slash command
  const { REST, Routes, SlashCommandBuilder } = require("discord.js");
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    await rest.put(Routes.applicationCommands(c.user.id), {
      body: [
        new SlashCommandBuilder()
          .setName("setup-verification")
          .setDescription("Envía el panel de verificación al canal actual")
          .setDefaultMemberPermissions(0x20), // Administrator
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

// New member joins
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== CONFIG.guildId) return;

  try {
    const unverifiedRole = member.guild.roles.cache.get(CONFIG.unverifiedRoleId);
    if (unverifiedRole) {
      await member.roles.add(unverifiedRole);
      console.log(`📥 ${member.user.tag} entró - rango "No Verificado" asignado`);
    }

    // Send welcome DM
    const dmEmbed = new EmbedBuilder()
      .setTitle("👋 Bienvenido a " + member.guild.name)
      .setDescription(
        "Para acceder al servidor, necesitas verificarte.\n\n" +
          `Ve al canal <#${CONFIG.verificationChannelId}> y haz clic en el botón de verificación.`
      )
      .setColor(0x5865f2);

    await member.send({ embeds: [dmEmbed] }).catch(() => {});
  } catch (err) {
    console.error("Error giving unverified role:", err);
  }
});

// Interactions
client.on(Events.InteractionCreate, async (interaction) => {
  // Slash commands
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
        .setTitle("Completa el Captcha");

      const input = new TextInputBuilder()
        .setCustomId("captcha_input")
        .setLabel("Escribe el código que ves en la imagen")
        .setPlaceholder("Ej: ABC123")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(CONFIG.captchaLength)
        .setMaxLength(CONFIG.captchaLength);

      modal.addComponents(new ActionRowBuilder().addComponents(input));

      await interaction.reply({ files: [attachment], ephemeral: true });
      await interaction.followUp({ modal });
    }
  }

  // Button: Start verification
  if (interaction.isButton() && interaction.customId === "verify_start") {
    const member = await interaction.guild.members.fetch(interaction.user.id);

    // Check if already verified
    if (member.roles.cache.has(CONFIG.verifiedRoleId)) {
      return interaction.reply({
        content: "✅ Ya estás verificado.",
        ephemeral: true,
      });
    }

    // Generate captcha
    const text = generateCaptchaText(CONFIG.captchaLength);
    const imageBuffer = await generateCaptchaImage(text);
    pendingCaptchas.set(interaction.user.id, text);

    const attachment = {
      attachment: imageBuffer,
      name: "captcha.png",
    };

    // Show modal
    const modal = new ModalBuilder()
      .setCustomId("captcha_modal")
      .setTitle("Completa el Captcha");

    const input = new TextInputBuilder()
      .setCustomId("captcha_input")
      .setLabel("Escribe el código que ves arriba")
      .setPlaceholder("Ej: ABC123")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(CONFIG.captchaLength)
      .setMaxLength(CONFIG.captchaLength);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    await interaction.reply({ files: [attachment], ephemeral: true });
    await interaction.followUp({ modal });
  }

  // Modal: Check captcha
  if (interaction.isModalSubmit() && interaction.customId === "captcha_modal") {
    const input = interaction.fields.getTextInputValue("captcha_input").toUpperCase();
    const expected = pendingCaptchas.get(interaction.user.id);

    pendingCaptchas.delete(interaction.user.id);

    if (input === expected) {
      const member = await interaction.guild.members.fetch(interaction.user.id);

      try {
        // Add verified role
        const verifiedRole = interaction.guild.roles.cache.get(CONFIG.verifiedRoleId);
        if (verifiedRole) await member.roles.add(verifiedRole);

        // Remove unverified role
        const unverifiedRole = interaction.guild.roles.cache.get(CONFIG.unverifiedRoleId);
        if (unverifiedRole) await member.roles.remove(unverifiedRole);

        const successEmbed = new EmbedBuilder()
          .setTitle("✅ Verificación Completa")
          .setDescription("Ya tienes acceso a todo el servidor. ¡Disfruta!")
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
        .setTitle("❌ Captcha Incorrecto")
        .setDescription("El código no coincide. Intenta de nuevo.")
        .setColor(0xff0000);

      await interaction.reply({ embeds: [failEmbed], ephemeral: true });
    }
  }
});

// ============== START ==============
client.login(process.env.TOKEN);
