# 🤖 HYDRA Captcha Bot — Guía desde 0 (para principiantes)

> ¿No sabes programar? Perfecto. Esta guía te lleva de la mano, paso a paso, hasta tener tu propio bot de verificación con captcha en Discord. Sin saltos, sin palabras raras sin explicar.

## 🧠 ¿Qué vas a aprender?

- Qué es un bot de Discord (en palabras simples).
- Cómo crear tu bot gratis en la página de Discord.
- Cómo instalar lo necesario en tu PC (Node.js).
- Cómo funciona el captcha: genera imagen → usuario la copia → gana rango.
- Qué hace cada parte del código (explicado como si tuvieras 10 años).

## 📦 ¿Qué hay en este repo?

`
Hydra-bot/
├── index.js       # SECCIÓN 1 a 7: todo el bot, comentado en español fácil
├── package.json   # Lista de "piezas" que el bot necesita (discord.js, canvas, dotenv)
├── .env.example   # Plantilla: aquí pones tus claves SIN subirlas a GitHub
├── Dockerfile     # Receta para subirlo a un hosting gratis
└── README.md      # Esta guía
`

## 🧩 Idea general (léelo 1 vez)

`
1. Alguien entra a tu Discord
2. El bot le pone el rango "No Verificado" (no ve nada)
3. El usuario va al canal #verificacion y pulsa "Verificarme"
4. El bot le muestra una IMAGEN con un código (ej: K7P2Q9)
5. El usuario escribe el código en una ventanita
6. Si acierta: le quita "No Verificado" y le da "Verificado" ✅
`

Eso es todo. El archivo index.js está dividido en 7 secciones que hacen exactamente eso.

## ✅ Requisitos (5 minutos)

1. **Discord** (cuenta normal).
2. **Node.js 20** → Descárgalo de https://nodejs.org (botón verde LTS). Luego comprueba que quedó bien con la terminal (abajo te enseño a abrirla):
   `ash
   node -v
   npm -v
   `
   **¿Qué es un número de versión?** Es la "cédula" del programa: 20.11.0 significa Node versión 20 (la que necesitamos), arreglo 11, parche 0. Solo importa que empiece con 20. 
pm es su ayudante y tendrá otro número como 10.x.

   Así se debe ver ✅ (ejemplo exacto):
   `	ext
   PS C:\Users\Dylan> node -v
   v20.18.0
   PS C:\Users\Dylan> npm -v
   10.8.2
   `
   En Mac se ve igual pero empieza con % en vez de PS:
   `	ext
   dylan@Mac ~ % node -v
   v20.18.0
   `
   Si ves esto ❌, Node no quedó instalado:
   `	ext
   node : el término 'node' no se reconoce...
   `
   Solución: reinstala desde nodejs.org (botón LTS), cierra y abre la terminal, reinicia la PC si sigue igual.
3. **Un servidor de Discord donde seas admin** (puede ser uno de prueba que crees tú: en Discord, botón + → Crear servidor → Para mí y mis amigos).

### 📖 Glosario mini (para no perderse)

| Palabra | Qué es, en simple | Ejemplo |
|---|---|---|
| Token | La contraseña secreta de tu bot. Nunca la compartas ni la subas a GitHub. | MTIz... (largo, solo tú lo ves) |
| Intent | Interruptor que le da "ojos" al bot para ver quién entra o qué se escribe. | Server Members Intent = ver quién entra |
| Rol | Rango con color y permisos. | Verificado (verde) / No Verificado (rojo) |
| Slash command | Comando que empieza con / y Discord te autocompleta. | /setup-verification |
| .env | Archivo con tus secretos. El .env.example es la plantilla vacía para copiar. | TOKEN=... |
| Node.js | Programa que deja correr JavaScript fuera del navegador (tu bot vive ahí). | 
ode -v muestra su versión |
| npm | El instalador que viene con Node. Descarga las piezas del bot. | 
pm install = descargar todo |
| Terminal | Ventana donde escribes órdenes en texto. Da miedo al inicio, pero solo copias y pegas. | Ver abajo cómo abrirla |

### 💻 La terminal desde 0 (si nunca la tocaste)

La terminal es como el WhatsApp de tu PC: escribes una orden, pulsas Enter y te responde. No rompes nada por escribir los comandos de esta guía.

**Cómo abrirla:**
- **Windows:** pulsa Windows + R, escribe powershell y Enter. O botón inicio → escribe PowerShell → ábrelo. Verás algo azul como PS C:\Users\TuNombre>.
- **Mac:** pulsa Cmd + Espacio, escribe Terminal y Enter. Verás como 	unombre@Mac ~ %.
- **Linux / Chromebook:** Ctrl + Alt + T.

**Cómo saber dónde estás y moverte (solo 3 órdenes):**
`ash
# 1. Ver en qué carpeta estás
pwd
# 2. Ver qué archivos hay aquí
ls
# En Windows PowerShell también vale: dir
# 3. Entrar a la carpeta de tu bot (ejemplo)
cd Hydra-bot
`
- pwd = "¿dónde estoy?". Te muestra la ruta.
- ls (o dir) = "¿qué hay aquí?". Debe salir index.js, package.json, etc.
- cd NombreCarpeta = "entra ahí". Para salir un nivel: cd ...

   Ejemplo de cómo se ve ✅:
   `	ext
   PS C:\Users\Dylan> pwd
   C:\Users\Dylan
   PS C:\Users\Dylan> ls
   Desktop  Documents  Hydra-bot
   PS C:\Users\Dylan> cd Hydra-bot
   PS C:\Users\Dylan\Hydra-bot> ls
   index.js  package.json  .env.example  README.md
   `
   Si después de ls ves index.js y package.json, estás en la carpeta correcta. Si ves otra cosa, usa cd .. para salir y cd NombreCorrecto para entrar.
- Para pegar en la terminal: Ctrl + V o clic derecho → Pegar. Para copiar la respuesta: selecciónala y Ctrl + C.

**Cómo ejecutar cada cosa de esta guía:**
`ash
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
`
**Cómo saber si salió bien (compara con esto):**
   `	ext
   PS C:\Users\Dylan\Hydra-bot> npm install
   added 85 packages in 40s
   PS C:\Users\Dylan\Hydra-bot> npm start
   ✅ Bot online como HydraCaptcha#1234
   📡 Sirviendo 1 servidores
   📋 Slash commands registrados
   `
   - 
pm install termina con dded X packages. La primera vez tarda 1-2 min, es normal.
   - 
pm start debe mostrar las 3 líneas de arriba. Déjalo abierto: mientras esa ventana siga abierta, el bot está encendido. Para apagar: Ctrl + C.
   - Tu .env lleno se debe ver así (con TUS valores, nunca compartas el token real):
   `env
   TOKEN=MTIz...tu_token_largo_aqui
   GUILD_ID=123456789012345678
   ROLE_VERIFIED=123456789012345679
   ROLE_UNVERIFIED=123456789012345680
   CHANNEL_VERIFICATION=123456789012345681
   `
   Si sale rojo, copia ese texto y búscalo en la sección "Si algo falla" de abajo.

## 🛠️ Paso 1 — Crea tu bot en Discord (clic por clic, sin perderte)

> Imagina que el portal de Discord es una casa con habitaciones a la izquierda. Te digo en qué habitación entrar y qué interruptor tocar. (Verificado con la documentación oficial 2026: nada de esto pide revisión mientras tu bot esté en pocos servidores; la revisión solo aparece al superar ~10.000 usuarios.)

**A) Crea la aplicación (la "partida de nacimiento" del bot)**
1. Entra a https://discord.com/developers/applications e inicia sesión con tu Discord.
2. Arriba a la derecha pulsa **New Application** (botón azul).
3. Escribe el nombre: Hydra Captcha → **Create**. Llegas a la habitación **General Information** (ves Application ID, icono, descripción). Aquí aún NO hay token.

**B) Consigue el TOKEN (su contraseña secreta)**
1. En el menú de la izquierda entra a la habitación **Bot** (icono de robot).
2. Si es nuevo verás **Add Bot** → pulsa y confirma. Luego verás la sección **Token**.
3. Pulsa **Reset Token** → te muestra una clave larga una sola vez. **CÓPIALA YA** a un bloc de notas. No podrás verla de nuevo, solo cambiarla.
   `	ext
   ✅ Se ve así: MTIzNDU2Nzg5MDEyMzQ1Njc4OS5H... (muy larga)
   ❌ Si la pierdes: vuelve aquí y pulsa Reset Token otra vez.
   `
4. ⚠️ Nunca la pegues en fotos, videos ni GitHub. Va en tu .env más adelante.

**C) Enciende sus OJOS (los Intents) — el paso que más falla**
1. Sigue en **Bot**, baja con la rueda hasta **Privileged Gateway Intents**. Verás 3 interruptores:
   | Interruptor | Para qué sirve (en niños) | ¿Lo enciendo? |
   |---|---|---|
   | Presence Intent | Ver si la gente está conectada/ausente | ❌ Apagado (no lo usamos) |
   | **Server Members Intent** | Ver QUIÉN ENTRA o sale (sin esto no pone "No Verificado") | ✅ Encendido |
   | **Message Content Intent** | Leer lo que dicen los mensajes | ✅ Encendido |
2. Activa los 2 y pulsa **Save Changes** abajo. Si no guardas, es como no haberlo hecho.
3. Si luego el bot enciende pero no reacciona a entradas, el 99% es que uno de estos quedó apagado (error DisallowedIntents en la terminal).

**D) Crea la invitación (habitación OAuth2 → URL Generator)**
1. En el menú izquierdo entra a **OAuth2** y luego a la sub-pestaña **URL Generator** (está dentro de OAuth2, no es un menú aparte).
2. En **Scopes** (¿a dónde puede entrar?) marca solo estas 2 casillas:
   - ✅ ot (mete al robot al servidor)
   - ✅ pplications.commands (deja usar comandos /)
3. Al marcar ot aparece abajo **Bot Permissions** (¿qué puede hacer?). Marca:
   - ✅ Manage Roles (poner/quitar Verificado — sin esto falla)
   - ✅ Send Messages (escribir en el canal)
   - ✅ Use Slash Commands (responder a /)
4. Abajo del todo se genera sola la **Generated URL**, se ve así:
   `	ext
   https://discord.com/api/oauth2/authorize?client_id=123456789012345678&permissions=268435456&scope=bot+applications.commands
   `
   Cópiala. Si cambias casillas, la URL cambia: cópiala de nuevo.

**E) Mete al bot a tu servidor**
1. Pega esa URL en tu navegador → elige tu servidor en la lista → **Continue → Autorizar** (marca los permisos que pide, son los del paso D).
2. Resuelve el captcha de Discord si lo pide. Entra a tu servidor: el bot aparece en la lista de miembros (al inicio gris/offline hasta que lo enciendas en el Paso 4).
3. **Comprueba:** ve a Ajustes del servidor → Miembros: debes ver Hydra Captcha con etiqueta BOT.

## 🎭 Paso 2 — Crea los 2 rangos

En tu servidor: **Ajustes → Roles → Crear rol**.

- No Verificado (rojo, sin ver canales).
- Verificado (verde, puede hablar).

⚠️ **Muy importante:** en la lista de roles, arrastra el rol de tu bot **por encima** de esos dos. Si no, Discord no le deja poner rangos.

## 🔑 Paso 3 — Tus 5 claves (el .env explicado como receta)

**Primero entiende esto (30 segundos):**
- .env.example = la FOTOCOPIA EN BLANCO. Dice qué huecos llenar, pero no tiene tus datos.
- .env = TU HOJA YA LLENA con tus secretos. El bot solo lee esta.
- ¿Por qué copiar y no escribir a mano? Para no olvidar ninguna línea. Copias la plantilla y solo rellenas.

**3A) Consigue tus 5 valores (guárdalos en un bloc de notas temporal):**
1. En Discord: **Ajustes (rueda) → Avanzado → activa Modo Desarrollador** (interruptor azul).
2. Ahora haz clic derecho → **Copiar ID** en cada cosa. Un ID se ve así (18 números):
   `	ext
   1307246359895740448
   `
   Cópialos de: ① tu servidor (clic derecho en su icono) ② rol Verificado ③ rol No Verificado (Ajustes del servidor → Roles → ⋯ → Copiar ID) ④ canal #verificacion. Más tu TOKEN del Paso 1. Ya tienes 5.

**3B) Ponte DENTRO de la carpeta del bot (si no, el comando falla):**
`ash
cd Hydra-bot
ls
`
Debe salir ✅:
`	ext
index.js  package.json  .env.example  README.md
`
❌ Si sale otra cosa o error No existe la ruta, estás en la carpeta equivocada. Usa pwd para ver dónde estás y cd .. para salir un nivel.

**3C) Copia la plantilla (elige SOLO uno según tu terminal):**
`ash
# Mac / Linux:
cp .env.example .env
`
`powershell
# Windows PowerShell:
Copy-Item .env.example .env
`
✅ Si sale bien NO muestra nada, solo vuelve a salir PS ...>. Compruébalo:
`ash
ls
`
Ahora debe aparecer .env en la lista. (En el explorador de Windows los archivos que empiezan con punto a veces se ocultan: Vista → Mostrar →Elementos ocultos.)
❌ Si ves No se encuentra... / cannot find: es que no estás en la carpeta (vuelve a 3B).
🖱️ **Alternativa sin terminal:** abre la carpeta en el explorador → copia .env.example → pégalo ahí mismo → renómbralo a .env. Mismo resultado.

**3D) Abre tu .env y rellena (ejemplo de cómo debe QUEDAR):**
- Windows: clic derecho en .env → Abrir con Bloc de notas. O en terminal: 
otepad .env.
- Mac: open -e .env. O usa VS Code si lo tienes: code .env.
`env
TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OS5Habc_tu_token_real_aqui
GUILD_ID=1307246359895740448
ROLE_VERIFIED=1307246359895740449
ROLE_UNVERIFIED=1307246359895740450
CHANNEL_VERIFICATION=1307246359895740451
`
Reglas: sin espacios alrededor del =, sin comillas, un dato por línea, guarda con Ctrl + S.
✅ **Chequeo final:** las 5 líneas tienen valores (nada dice pega_aqui), el archivo se llama exactamente .env y está junto a index.js. Si el bot luego dice "invalid token", el TOKEN está mal copiado: repite el Paso 1B.

## 💻 Paso 4 — Instala y enciende (guía completa)

Ahora viene la parte divertida: instalar las piezas y encender el bot. Voy a mostrarte exactamente qué escribir y qué debería salir en tu pantalla.

### 4A) Descarga las piezas del bot

Escribe esto en la terminal y pulsa Enter:

`ash
npm install
`

¿Qué hace esto? Descarga automáticamente todas las "piezas" que el bot necesita para funcionar: discord.js (para hablar con Discord), canvas (para dibujar la imagen del captcha) y dotenv (para leer tu archivo .env).

Así se ve cuando empieza (está trabajando, espera 1-2 minutos):
`	ext
PS C:\Users\Dylan\Hydra-bot> npm install
`

Así se ve cuando termina ✅:
`	ext
added 85 packages in 40s
`

- **dded 85 packages** = descargó 85 piezas. El número puede variar (83, 87, etc.), no te preocupes por eso.
- **in 40s** = tardó 40 segundos. La primera vez es normal que tarde 1-2 minutos.

Si todo salió bien, ahora en tu carpeta apareció una carpeta nueva llamada 
ode_modules. Esa carpeta contiene todas las piezas. **No la borres ni la muevas.**

También apareció un archivo package-lock.json. Tampoco lo toques: es el "recibo" de lo que se instaló.

Para comprobar, escribe:
`ash
ls
`
Deberías ver ✅:
`	ext
Dockerfile  README.md  index.js  node_modules  package-lock.json  package.json  .env.example
`
Si ves 
ode_modules en la lista, todo salió bien.

### 4B) Si 
pm install falla (errores de canvas)

El 95% de las veces 
pm install funciona sin problemas. Pero si ves texto rojo o errores, el culpable casi siempre es canvas (la pieza que dibuja imágenes). Dependiendo de tu sistema:

**En Windows:**
Si ves un error que menciona 
ode-gyp, inding.cc, msvs, o algo con "Visual Studio":
`	ext
gyp ERR! stack Error: Could not find any Python installation to use
`
Solución: necesitas instalar las "herramientas de compilación" de Windows. Abre PowerShell **como administrador** y escribe:
`powershell
npm install -g windows-build-tools
`
Esto tarda 2-5 minutos. Cuando termine, cierra y abre la terminal de nuevo, vuelve a la carpeta del bot (cd Hydra-bot) y reintenta:
`ash
npm install
`

**En Mac:**
Si ves errores con canvas o 
ode-gyp, necesitas las herramientas de Apple. Abre la terminal y escribe:
`ash
xcode-select --install
`
Se abre una ventana de Mac → pulsa **Instalar**. Tarda 5-15 minutos según tu internet. Cuando termine, reintenta:
`ash
npm install
`

**En Linux (Ubuntu/Debian):**
Si ves errores con canvas, faltan las librerías de sistema. Escribe:
`ash
sudo apt install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev
`
Pide tu contraseña de PC (no se ve cuando la escribes, eso es normal). Cuando termine, reintenta:
`ash
npm install
`

**¿Y si canvas sigue fallando?** No te preocupes: el bot **puede funcionar sin canvas**. El captcha simplemente no generará imagen. Si quieres intentar sin canvas:
`ash
npm install discord.js dotenv
`

### 4C) Revisa que todo esté en orden

Antes de encender, comprueba que tu .env esté bien. Escribe:
`ash
ls
`
Deberías ver tu .env junto a index.js. Si no ves .env, vuelve al Paso 3C.

Si todavía no has llenado tu .env con tus IDs, hazlo ahora:
`ash
notepad .env   # Windows
`

Recuerda que debe quedar así (con TUS valores, sin espacios ni comillas):
`env
TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OS5Habc_tu_token_real_aqui
GUILD_ID=1307246359895740448
ROLE_VERIFIED=1307246359895740449
ROLE_UNVERIFIED=1307246359895740450
CHANNEL_VERIFICATION=1307246359895740451
`

### 4D) Enciende el bot 🚀

Escribe:
`ash
npm start
`

Deberías ver esto ✅:
`	ext
PS C:\Users\Dylan\Hydra-bot> npm start

> hydra-captcha-bot@1.0.0 start
> node index.js

✅ Bot online como HydraCaptcha#1234
📡 Sirviendo 1 servidores
📋 Slash commands registrados
`

Vamos a revisar qué significa cada línea:

| Línea | Qué significa | ¿Está bien? |
|---|---|---|
| ✅ Bot online como HydraCaptcha#1234 | Tu bot se conectó a Discord y está activo. | ✅ Si ves esto, funciona |
| 📡 Sirviendo 1 servidores | El bot está en 1 servidor (el tuyo). | ✅ Normal |
| 📋 Slash commands registrados | Los comandos /setup-verification y /captcha-test están listos. | ✅ Listo para probar |

**⚠️ ¡Ojo!** Mientras esta ventana de terminal esté abierta, el bot está encendido. Si la cierras, el bot se apaga. Para apagarlo manualmente, pulsa Ctrl + C en la terminal.

### 4E) Prueba que funciona

1. Ve a tu servidor de Discord.
2. En el canal de texto escribe: /setup-verification
3. Discord te mostrará el comando. Seleccionalo y pulsa Enter.
4. Debería aparecer un mensaje con un botón verde **"Verificarme"** ✅
5. Pulsa el botón. El bot te mostrará una imagen con un código de 6 letras.
6. Escribe el código en la ventanita que aparece.
7. Si lo escribes bien, el bot te dará el rango **Verificado** (verde). ¡Funciona!

### 4F) Si el bot no enciende (errores comunes)

| Error que ves | Causa | Solución |
|---|---|---|
| SyntaxError: Unexpected token | Tu .env tiene un error de formato | Revisa que no tenga espacios alrededor del =, ni comillas |
| Error [TOKEN_INVALID] | Token mal copiado | Copia el token de nuevo desde Developer Portal → Bot → Reset Token |
| Error [DisallowedIntents] | Intents apagados | Developer Portal → Bot → Privileged Gateway Intents → enciende los 2 → Save |
| Error: Cannot find module './index.js' | No estás en la carpeta correcta | Usa cd Hydra-bot para entrar a la carpeta |
| Error: Cannot find module 'canvas' | Canvas no se instaló bien | Reinstala: 
pm install canvas |

### Resumen rápido del Paso 4

`ash
npm install          # 1. Descargar piezas (una sola vez)
ls                   # 2. Comprueba que .env está ahí
notepad .env         # 3. Llena tu .env (Windows)
npm start            # 4. Encender
# 5. Probar en Discord: /setup-verification
# 6. Apagar: Ctrl + C
`

## 📣 Paso 5 — Pon el panel

En tu Discord escribe:
`
/setup-verification
`

Sale un mensaje con botón verde **Verificarme**. Pruébalo con una cuenta secundaria o pide a un amigo que entre.

## ⬇️ Descarga el bot 100% completo (.zip)

¿Quieres comparar tu resultado con el modelo terminado? Descarga **BOT-LISTO.zip** (aquí mismo en el repo): incluye BOT-LISTO.js funcionando, package.json, .env.example y LEEME-COMPARA.txt con la lista de chequeo.

Cómo comparar: abre tu mi-primer-bot.js o tu index.js al lado de BOT-LISTO.js. Si el tuyo enciende, registra /hola, genera el captcha y cambia rangos, quedaste igual que el modelo. Para personalizar el modelo sin programar, edita solo el bloque PERSONALIZA de arriba (textos, colores, imagen miniatura, fuente, tamaño y longitud) y reinicia con 
ode BOT-LISTO.js.

## 📖 El código por secciones (como en index.js)

Abre index.js. Arriba de cada bloque hay un comentario SECCIÓN X que dice qué hace y por qué:

- **SECCIÓN 1 — Librerías:** traemos las herramientas (discord.js para hablar con Discord, canvas para dibujar la imagen, dotenv para leer tu .env).
- **SECCIÓN 2 — Config:** leemos tus 5 IDs. Si algo falla, el 90% de las veces es un ID mal copiado.
- **SECCIÓN 3 — Generador captcha:** crea texto como K7P2Q9 (sin letras confusas como O/0) y lo dibuja en una imagen de 400x150 con fondo, puntitos y letras de colores.
- **SECCIÓN 4 — Mensaje bonito:** el embed + botón verde. Es solo diseño.
- **SECCIÓN 5 — Encendido:** se conecta, registra /setup-verification y /captcha-test.
- **SECCIÓN 6 — Cuando entra alguien:** pone "No Verificado" y manda DM de bienvenida.
- **SECCIÓN 7 — Botón + ventanita + premio:** genera imagen, la muestra solo a ti (efímero), abre la ventanita (modal), compara lo que escribiste, y si aciertas te cambia los rangos.

## 🔨 Taller: construye TU bot a mano (de archivo vacío a funcionando)

> Aquí no solo lees: ESCRIBES. Crea un archivo mi-primer-bot.js al lado de index.js y avanza por niveles. Cada nivel se prueba. Si un nivel no sale, no pases al siguiente.

**Nivel 0 — Las piezas (en la terminal, dentro de la carpeta):**
`ash
npm init -y
npm install discord.js dotenv
`
✅ Debe terminar con dded X packages y aparecer la carpeta 
ode_modules. (El canvas lo instalamos en el Nivel 3, porque en algunos PCs pide herramientas extra.)

**Nivel 1 — Que encienda y salude (lo mínimo que respira):**
Crea mi-primer-bot.js y escribe ESTO a mano (escríbelo, no solo copies: tus dedos aprenden):
`js
require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(✅ Estoy vivo como );
});

client.login(process.env.TOKEN);
`
Pruébalo: 
ode mi-primer-bot.js. ✅ Debes ver ✅ Estoy vivo como HydraCaptcha#1234. Apagar: Ctrl + C. ❌ invalid token = tu .env está mal (vuelve al Paso 3).

**Nivel 2 — Tu primer slash /hola (sin captcha todavía):**
Debajo del ClientReady, agrega:
`js
const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
async function registrar() {
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: [new SlashCommandBuilder().setName("hola").setDescription("Te saluda").toJSON()],
  });
  console.log("📋 Comando /hola registrado");
}
client.on(Events.InteractionCreate, async (i) => {
  if (i.isChatInputCommand() && i.commandName === "hola") {
    await i.reply("¡Hola! Soy tu bot en pruebas.");
  }
});
`
Reinicia, espera 1 min y escribe /hola en tu Discord. ✅ Responde. Así aprendiste: registrar → escuchar → responder.

**Nivel 3 — Dibuja tu primer captcha (instala el lápiz):**
`ash
npm install canvas
`
❌ Si falla en Linux: sudo apt install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev y reintenta. Agrega:
`js
const { createCanvas } = require("canvas");
function textoFacil() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let t = "";
  for (let i = 0; i < 4; i++) t += letras[Math.floor(Math.random() * letras.length)];
  return t;
}
`
Agrega al final console.log(textoFacil(), textoFacil()); y corre. ✅ Debes ver 2 códigos de 4 letras.

**Nivel 4 — El premio (rangos): solo 2 líneas:**
`js
await miembro.roles.add(rolVerificado);
await miembro.roles.remove(rolNoVerificado);
`
Eso es TODO lo que hace el bot real al acertar.

**Nivel 5 — Compara con el ejemplo hecho:**
Abre BOT-LISTO.js (en este repo, descargable). Es el bot completo con una zona arriba PERSONALIZA AQUI donde cambias textos, colores, fuente, tamaño y longitud sin tocar la lógica.

### Mini-ejercicio para aprender

1. Cambia captchaLength: 6 a 4 en CONFIG. Reinicia. ¿El captcha ahora es más fácil?
2. Cambia un color en captchaColors. ¿Qué letra cambia de color?
3. Lee la función generateCaptchaText y responde: ¿por qué no incluye la letra O ni el número  ?

## 🆓 Subirlo gratis 24/7 (sin tarjeta)

El bot en tu PC se apaga si cierres la PC. Súbelo a un panel gratis tipo Pterodactyl (ej: Waifly, HeavenCloud):

1. Crea cuenta con email (sin tarjeta).
2. Crea servidor Node.js 20.
3. Sube estos archivos por SFTP o el administrador: index.js, package.json (NO subas tu .env con token, pon las variables en el panel → Environment).
4. Start Command: 
pm start.

> GitHub NO mantiene bots encendidos (solo guarda código). Render/Railway piden tarjeta o se duermen. Usa paneles Pterodactyl gratis.

## 🆘 Si algo falla

| Síntoma | Causa 99% | Solución |
|---|---|---|
| Bot offline | Token mal / .env mal | Revisa TOKEN= sin espacios ni comillas. Copia el token de nuevo desde Developer Portal → Bot → Reset Token |
| No pone rangos | Rol del bot abajo en la lista | Arrastra el rol del bot **por encima** de Verificado y No Verificado en Ajustes → Roles |
| Slash no aparecen | Invitaste sin pplications.commands | Repite Paso 1D: marca ot + pplications.commands, copia la URL nueva y re-invita al bot |
| DM no llega | Usuario bloqueó DMs de Discord | Normal: el botón en el canal #verificacion sigue funcionando |
| canvas no instala en **Linux** | Faltan librerías de sistema | sudo apt install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev |
| canvas no instala en **Windows** | Faltan herramientas de compilación | Abre PowerShell como admin → 
pm install -g windows-build-tools |
| canvas no instala en **Mac** | Faltan herramientas de Apple | xcode-select --install → acepta → espera 5-15 min |
| Error [TOKEN_INVALID] | Token copiado mal o expirado | Developer Portal → Bot → Reset Token → copia el nuevo → pégalo en .env |
| Error [DisallowedIntents] | Intents apagados | Developer Portal → Bot → Privileged Gateway Intents → enciende los 2 → Save |
| El bot enciende pero no genera captcha | Canvas no instaló o falta | 
pm install canvas. Si falla, usa el bot sin imagen — funciona igual |
| 
pm install va muy lento | Conexión lenta | Prueba: 
pm cache clean --force y vuelve a 
pm install |

## 🔒 Reglas de oro

- Nunca subas .env a GitHub (ya está en .gitignore).
- Si tu token se filtra, ve a Developers → Bot → Reset Token y pon el nuevo en .env y en tu hosting.
- Este repo es público para compartir con compañeros: el código se ve, pero TUS secretos están a salvo porque el archivo .env nunca se sube (está en .gitignore). Cada compañero usa su propio token con su .env.

¡Hecho! Si llegaste hasta aquí ya sabes más que ayer: qué es un token, un intent, un rol, un slash y cómo un captcha protege tu Discord. 🚀