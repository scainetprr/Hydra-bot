# 🤖 HYDRA Captcha Bot — Guía desde 0 (para principiantes)

> ¿No sabes programar? Perfecto. Esta guía te lleva de la mano, paso a paso, hasta tener tu propio bot de verificación con captcha en Discord. Sin saltos, sin palabras raras sin explicar.

## 🧠 ¿Qué vas a aprender?

- Qué es un bot de Discord (en palabras simples).
- Cómo crear tu bot gratis en la página de Discord.
- Cómo instalar lo necesario en tu PC (Node.js).
- Cómo funciona el captcha: genera imagen → usuario la copia → gana rango.
- Qué hace cada parte del código (explicado como si tuvieras 10 años).

## 📦 ¿Qué hay en este repo?

```
Hydra-bot/
├── index.js       # SECCIÓN 1 a 7: todo el bot, comentado en español fácil
├── package.json   # Lista de "piezas" que el bot necesita (discord.js, canvas, dotenv)
├── .env.example   # Plantilla: aquí pones tus claves SIN subirlas a GitHub
├── Dockerfile     # Receta para subirlo a un hosting gratis
└── README.md      # Esta guía
```

## 🧩 Idea general (léelo 1 vez)

```
1. Alguien entra a tu Discord
2. El bot le pone el rango "No Verificado" (no ve nada)
3. El usuario va al canal #verificacion y pulsa "Verificarme"
4. El bot le muestra una IMAGEN con un código (ej: K7P2Q9)
5. El usuario escribe el código en una ventanita
6. Si acierta: le quita "No Verificado" y le da "Verificado" ✅
```

Eso es todo. El archivo `index.js` está dividido en 7 secciones que hacen exactamente eso.

## ✅ Requisitos (5 minutos)

1. **Discord** (cuenta normal).
2. **Node.js 20** → Descárgalo de https://nodejs.org (botón verde LTS). Luego comprueba que quedó bien con la terminal (abajo te enseño a abrirla):
   ```bash
   node -v
   npm -v
   ```
   **¿Qué es un número de versión?** Es la "cédula" del programa: `v20.11.0` significa Node versión 20 (la que necesitamos), arreglo 11, parche 0. Solo importa que empiece con `v20`. `npm` es su ayudante y tendrá otro número como `10.x`.

   Así se debe ver ✅ (ejemplo exacto):
   ```text
   PS C:\Users\Dylan> node -v
   v20.18.0
   PS C:\Users\Dylan> npm -v
   10.8.2
   ```
   En Mac se ve igual pero empieza con `%` en vez de `PS`:
   ```text
   dylan@Mac ~ % node -v
   v20.18.0
   ```
   Si ves esto ❌, Node no quedó instalado:
   ```text
   node : el término 'node' no se reconoce...
   ```
   Solución: reinstala desde nodejs.org (botón LTS), cierra y abre la terminal, reinicia la PC si sigue igual.
3. **Un servidor de Discord donde seas admin** (puede ser uno de prueba que crees tú: en Discord, botón `+` → Crear servidor → Para mí y mis amigos).

### 📖 Glosario mini (para no perderse)

| Palabra | Qué es, en simple | Ejemplo |
|---|---|---|
| Token | La contraseña secreta de tu bot. Nunca la compartas ni la subas a GitHub. | `MTIz...` (largo, solo tú lo ves) |
| Intent | Interruptor que le da "ojos" al bot para ver quién entra o qué se escribe. | Server Members Intent = ver quién entra |
| Rol | Rango con color y permisos. | Verificado (verde) / No Verificado (rojo) |
| Slash command | Comando que empieza con `/` y Discord te autocompleta. | `/setup-verification` |
| `.env` | Archivo con tus secretos. El `.env.example` es la plantilla vacía para copiar. | `TOKEN=...` |
| Node.js | Programa que deja correr JavaScript fuera del navegador (tu bot vive ahí). | `node -v` muestra su versión |
| npm | El instalador que viene con Node. Descarga las piezas del bot. | `npm install` = descargar todo |
| Terminal | Ventana donde escribes órdenes en texto. Da miedo al inicio, pero solo copias y pegas. | Ver abajo cómo abrirla |

### 💻 La terminal desde 0 (si nunca la tocaste)

La terminal es como el WhatsApp de tu PC: escribes una orden, pulsas Enter y te responde. No rompes nada por escribir los comandos de esta guía.

**Cómo abrirla:**
- **Windows:** pulsa `Windows + R`, escribe `powershell` y Enter. O botón inicio → escribe `PowerShell` → ábrelo. Verás algo azul como `PS C:\Users\TuNombre>`.
- **Mac:** pulsa `Cmd + Espacio`, escribe `Terminal` y Enter. Verás como `tunombre@Mac ~ %`.
- **Linux / Chromebook:** `Ctrl + Alt + T`.

**Cómo saber dónde estás y moverte (solo 3 órdenes):**
```bash
# 1. Ver en qué carpeta estás
pwd
# 2. Ver qué archivos hay aquí
ls
# En Windows PowerShell también vale: dir
# 3. Entrar a la carpeta de tu bot (ejemplo)
cd Hydra-bot
```
- `pwd` = "¿dónde estoy?". Te muestra la ruta.
- `ls` (o `dir`) = "¿qué hay aquí?". Debe salir `index.js`, `package.json`, etc.
- `cd NombreCarpeta` = "entra ahí". Para salir un nivel: `cd ..`.

   Ejemplo de cómo se ve ✅:
   ```text
   PS C:\Users\Dylan> pwd
   C:\Users\Dylan
   PS C:\Users\Dylan> ls
   Desktop  Documents  Hydra-bot
   PS C:\Users\Dylan> cd Hydra-bot
   PS C:\Users\Dylan\Hydra-bot> ls
   index.js  package.json  .env.example  README.md
   ```
   Si después de `ls` ves `index.js` y `package.json`, estás en la carpeta correcta. Si ves otra cosa, usa `cd ..` para salir y `cd NombreCorrecto` para entrar.
- Para pegar en la terminal: `Ctrl + V` o clic derecho → Pegar. Para copiar la respuesta: selecciónala y `Ctrl + C`.

**Cómo ejecutar cada cosa de esta guía:**
```bash
# Comprobar Node (solo lee la versión, no cambia nada)
node -v
npm -v
# Entrar a tu proyecto (ajusta la ruta a la tuya)
cd Hydra-bot
# Copiar la plantilla de secretos
cp .env.example .env
# En Windows PowerShell es:
Copy-Item .env.example .env
# Descargar las piezas del bot (solo la primera vez, tarda 1-2 min)
npm install
# Encender el bot (verás "Bot online...")
npm start
# Apagarlo: pulsa Ctrl + C en la terminal
```
**Cómo saber si salió bien (compara con esto):**
   ```text
   PS C:\Users\Dylan\Hydra-bot> npm install
   added 85 packages in 40s
   PS C:\Users\Dylan\Hydra-bot> npm start
   ✅ Bot online como HydraCaptcha#1234
   📡 Sirviendo 1 servidores
   📋 Slash commands registrados
   ```
   - `npm install` termina con `added X packages`. La primera vez tarda 1-2 min, es normal.
   - `npm start` debe mostrar las 3 líneas de arriba. Déjalo abierto: mientras esa ventana siga abierta, el bot está encendido. Para apagar: `Ctrl + C`.
   - Tu `.env` lleno se debe ver así (con TUS valores, nunca compartas el token real):
   ```env
   TOKEN=MTIz...tu_token_largo_aqui
   GUILD_ID=123456789012345678
   ROLE_VERIFIED=123456789012345679
   ROLE_UNVERIFIED=123456789012345680
   CHANNEL_VERIFICATION=123456789012345681
   ```
   Si sale rojo, copia ese texto y búscalo en la sección "Si algo falla" de abajo.

## 🛠️ Paso 1 — Crea tu bot en Discord (clic por clic, sin perderte)

> Imagina que el portal de Discord es una casa con habitaciones a la izquierda. Te digo en qué habitación entrar y qué interruptor tocar.

**A) Crea la aplicación (la "partida de nacimiento" del bot)**
1. Entra a https://discord.com/developers/applications e inicia sesión con tu Discord.
2. Arriba a la derecha pulsa **New Application** (botón azul).
3. Escribe el nombre: `Hydra Captcha` → **Create**. Llegas a **General Information**. Aquí aún NO hay token.

**B) Consigue el TOKEN (su contraseña secreta)**
1. En el menú de la izquierda entra a **Bot** (icono de robot).
2. Si es nuevo verás **Add Bot** → pulsa y confirma.
3. Pulsa **Reset Token** → te muestra una clave larga una sola vez. **CÓPIALA YA** a un bloc de notas.
   ```text
   ✅ Se ve así: MTIzNDU2Nzg5MDEyMzQ1Njc4OS5H... (muy larga)
   ❌ Si la pierdes: vuelve aquí y pulsa Reset Token otra vez.
   ```
4. ⚠️ Nunca la pegues en fotos, videos ni GitHub. Va en tu `.env` más adelante.

**C) Enciende sus OJOS (los Intents) — el paso que más falla**
1. Sigue en **Bot**, baja hasta **Privileged Gateway Intents**:
   | Interruptor | ¿Lo enciendo? |
   |---|---|
   | Presence Intent | ❌ Apagado |
   | **Server Members Intent** | ✅ Encendido |
   | **Message Content Intent** | ✅ Encendido |
2. Activa los 2 y pulsa **Save Changes**.

**D) Crea la invitación (OAuth2 → URL Generator)**
1. Entra a **OAuth2** → **URL Generator**.
2. Marca: ✅ `bot` + ✅ `applications.commands`
3. En **Bot Permissions** marca: ✅ `Manage Roles` + ✅ `Send Messages` + ✅ `Use Slash Commands`
4. Copia la **Generated URL** que se genera abajo.

**E) Mete al bot a tu servidor**
1. Pega esa URL en tu navegador → elige tu servidor → **Continue → Autorizar**.
2. En tu servidor el bot aparece gris/offline hasta que lo enciendas.

## 🎭 Paso 2 — Crea los 2 rangos

En tu servidor: **Ajustes → Roles → Crear rol**.
- `No Verificado` (rojo)
- `Verificado` (verde)

⚠️ Arrastra el rol de tu bot **por encima** de esos dos. Si no, Discord no le deja poner rangos.

## 🔑 Paso 3 — Tus 5 claves (el .env)

**3A) Consigue tus 5 valores:**
1. En Discord: **Ajustes → Avanzado → activa Modo Desarrollador**.
2. Haz clic derecho → **Copiar ID** en: ① tu servidor ② rol Verificado ③ rol No Verificado ④ canal #verificacion. Más tu TOKEN del Paso 1.

**3B) Entra a la carpeta del bot:**
```bash
cd Hydra-bot
ls
```
Debe salir: `index.js  package.json  .env.example  README.md`

**3C) Copia la plantilla:**
```powershell
# Windows PowerShell:
Copy-Item .env.example .env
# Mac / Linux:
cp .env.example .env
```

**3D) Abre tu `.env` y rellena:**
```env
TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OS5Habc_tu_token_real_aqui
GUILD_ID=1307246359895740448
ROLE_VERIFIED=1307246359895740449
ROLE_UNVERIFIED=1307246359895740450
CHANNEL_VERIFICATION=1307246359895740451
```
Reglas: sin espacios alrededor del `=`, sin comillas, un dato por línea.

## 💻 Paso 4 — Instala y enciende

### 4A) Descarga las piezas del bot

```bash
npm install
```

Así se ve cuando termina ✅:
```text
added 85 packages in 40s
```

Aparecerá una carpeta `node_modules` y un archivo `package-lock.json`. No los borres.

### 4B) Si `npm install` falla (errores de canvas)

**En Windows:**
```powershell
npm install -g windows-build-tools
```
Luego reinicia terminal y reintenta `npm install`.

**En Mac:**
```bash
xcode-select --install
```
Acepta, espera 5-15 min, reintenta `npm install`.

**En Linux:**
```bash
sudo apt install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev
```
Luego reintenta `npm install`.

**¿Canvas sigue fallando?** No importa: el bot funciona sin imagen. Solo instala `discord.js dotenv` y el bot muestra el código en texto.

### 4C) Enciende el bot 🚀

```bash
npm start
```

Deberías ver:
```text
✅ Bot online como HydraCaptcha#1234
📡 Sirviendo 1 servidores
📋 Slash commands registrados
```

| Línea | Qué significa |
|---|---|
| `✅ Bot online` | Tu bot se conectó a Discord |
| `📡 Sirviendo 1 servidores` | Está en tu servidor |
| `📋 Slash commands registrados` | Los comandos `/` están listos |

⚠️ Mientras la terminal esté abierta, el bot está encendido. Para apagar: `Ctrl + C`.

### 4D) Prueba que funciona

1. Ve a tu servidor de Discord
2. Escribe: `/setup-verification`
3. Aparece un botón verde **"Verificarme"**
4. Pulsa el botón → te muestra imagen con código
5. Escribe el código → ¡ganaste el rango Verificado!

### 4E) Si el bot no enciende

| Error | Solución |
|---|---|
| `TOKEN_INVALID` | Token mal copiado → vuelve al Paso 1B |
| `DisallowedIntents` | Intents apagados → enciéndelos en Developer Portal |
| `Cannot find module './index.js'` | No estás en la carpeta → `cd Hydra-bot` |
| `Cannot find module 'canvas'` | `npm install canvas` |

## 📣 Paso 5 — Pon el panel

En tu Discord escribe: `/setup-verification`

Sale un mensaje con botón verde. Pruébalo con una cuenta secundaria.

## ⬇️ Descarga el bot completo (.zip)

Descarga **`BOT-LISTO.zip`** aquí mismo en el repo. Incluye `BOT-LISTO.js` funcionando, `package.json`, `.env.example` y `LEEME-COMPARA.txt`.

## 📖 El código por secciones

- **SECCIÓN 1 — Librerías:** `discord.js`, `canvas`, `dotenv`
- **SECCIÓN 2 — Config:** lee tus 5 IDs del `.env`
- **SECCIÓN 3 — Generador captcha:** crea texto como `K7P2Q9` y lo dibuja
- **SECCIÓN 4 — Mensaje bonito:** embed + botón verde
- **SECCIÓN 5 — Encendido:** conecta y registra comandos
- **SECCIÓN 6 — Cuando entra alguien:** pone "No Verificado" y manda DM
- **SECCIÓN 7 — Botón + ventanita + premio:** genera captcha y cambia rangos

## 🔨 Taller: construye TU bot a mano

**Nivel 0 — Las piezas:**
```bash
npm init -y
npm install discord.js dotenv
```

**Nivel 1 — Que encienda:**
```js
require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Estoy vivo como ${c.user.tag}`);
});
client.login(process.env.TOKEN);
```

**Nivel 2 — Tu primer slash `/hola`:**
```js
client.on(Events.InteractionCreate, async (i) => {
  if (i.isChatInputCommand() && i.commandName === "hola") {
    await i.reply("¡Hola! Soy tu bot en pruebas.");
  }
});
```

**Nivel 3 — Dibuja captcha:**
```bash
npm install canvas
```

**Nivel 4 — El premio (rangos):**
```js
await miembro.roles.add(rolVerificado);
await miembro.roles.remove(rolNoVerificado);
```

## 🆓 Subirlo gratis 24/7

1. Crea cuenta en panel Pterodactyl (Waifly, HeavenCloud)
2. Crea servidor Node.js 20
3. Sube `index.js` y `package.json`
4. Pon variables de entorno en el panel
5. Start Command: `npm start`

## 🆘 Si algo falla

| Síntoma | Solución |
|---|---|
| Bot offline | Revisa TOKEN en `.env` |
| No pone rangos | Sube rol del bot arriba de Verificado |
| Slash no aparecen | Re-invita con `applications.commands` |
| DM no llega | Usuario bloqueó DMs (normal) |
| Canvas no instala (Linux) | `sudo apt install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev` |
| Canvas no instala (Windows) | `npm install -g windows-build-tools` |
| Canvas no instala (Mac) | `xcode-select --install` |

## 🔒 Reglas de oro

- Nunca subas `.env` a GitHub
- Si tu token se filtra, Reset Token en Developer Portal
- Cada compañero usa su propio token

¡Hecho! Ya sabes más que ayer: qué es un token, un intent, un rol, un slash y cómo un captcha protege tu Discord. 🚀
