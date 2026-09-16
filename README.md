# ðŸ¤– HYDRA Captcha Bot â€” GuÃ­a desde 0 (para principiantes)

> Â¿No sabes programar? Perfecto. Esta guÃ­a te lleva de la mano, paso a paso, hasta tener tu propio bot de verificaciÃ³n con captcha en Discord. Sin saltos, sin palabras raras sin explicar.

## ðŸ§  Â¿QuÃ© vas a aprender?

- QuÃ© es un bot de Discord (en palabras simples).
- CÃ³mo crear tu bot gratis en la pÃ¡gina de Discord.
- CÃ³mo instalar lo necesario en tu PC (Node.js).
- CÃ³mo funciona el captcha: genera imagen â†’ usuario la copia â†’ gana rango.
- QuÃ© hace cada parte del cÃ³digo (explicado como si tuvieras 10 aÃ±os).

## ðŸ“¦ Â¿QuÃ© hay en este repo?

```
Hydra-bot/
â”œâ”€â”€ index.js       # SECCIÃ“N 1 a 7: todo el bot, comentado en espaÃ±ol fÃ¡cil
â”œâ”€â”€ package.json   # Lista de "piezas" que el bot necesita (discord.js, canvas, dotenv)
â”œâ”€â”€ .env.example   # Plantilla: aquÃ­ pones tus claves SIN subirlas a GitHub
â”œâ”€â”€ Dockerfile     # Receta para subirlo a un hosting gratis
â””â”€â”€ README.md      # Esta guÃ­a
```

## ðŸ§© Idea general (lÃ©elo 1 vez)

```
1. Alguien entra a tu Discord
2. El bot le pone el rango "No Verificado" (no ve nada)
3. El usuario va al canal #verificacion y pulsa "Verificarme"
4. El bot le muestra una IMAGEN con un cÃ³digo (ej: K7P2Q9)
5. El usuario escribe el cÃ³digo en una ventanita
6. Si acierta: le quita "No Verificado" y le da "Verificado" âœ…
```

Eso es todo. El archivo `index.js` estÃ¡ dividido en 7 secciones que hacen exactamente eso.

## âœ… Requisitos (5 minutos)

1. **Discord** (cuenta normal).
2. **Node.js 20** â†’ DescÃ¡rgalo de https://nodejs.org (botÃ³n verde LTS). Luego comprueba que quedÃ³ bien con la terminal (abajo te enseÃ±o a abrirla):
   ```bash
   node -v
   npm -v
   ```
   **Â¿QuÃ© es un nÃºmero de versiÃ³n?** Es la "cÃ©dula" del programa: `v20.11.0` significa Node versiÃ³n 20 (la que necesitamos), arreglo 11, parche 0. Solo importa que empiece con `v20`. `npm` es su ayudante y tendrÃ¡ otro nÃºmero como `10.x`.

   AsÃ­ se debe ver âœ… (ejemplo exacto):
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
   Si ves esto âŒ, Node no quedÃ³ instalado:
   ```text
   node : el tÃ©rmino 'node' no se reconoce...
   ```
   SoluciÃ³n: reinstala desde nodejs.org (botÃ³n LTS), cierra y abre la terminal, reinicia la PC si sigue igual.
3. **Un servidor de Discord donde seas admin** (puede ser uno de prueba que crees tÃº: en Discord, botÃ³n `+` â†’ Crear servidor â†’ Para mÃ­ y mis amigos).

### ðŸ“– Glosario mini (para no perderse)

| Palabra | QuÃ© es, en simple | Ejemplo |
|---|---|---|
| Token | La contraseÃ±a secreta de tu bot. Nunca la compartas ni la subas a GitHub. | `MTIz...` (largo, solo tÃº lo ves) |
| Intent | Interruptor que le da "ojos" al bot para ver quiÃ©n entra o quÃ© se escribe. | Server Members Intent = ver quiÃ©n entra |
| Rol | Rango con color y permisos. | Verificado (verde) / No Verificado (rojo) |
| Slash command | Comando que empieza con `/` y Discord te autocompleta. | `/setup-verification` |
| `.env` | Archivo con tus secretos. El `.env.example` es la plantilla vacÃ­a para copiar. | `TOKEN=...` |
| Node.js | Programa que deja correr JavaScript fuera del navegador (tu bot vive ahÃ­). | `node -v` muestra su versiÃ³n |
| npm | El instalador que viene con Node. Descarga las piezas del bot. | `npm install` = descargar todo |
| Terminal | Ventana donde escribes Ã³rdenes en texto. Da miedo al inicio, pero solo copias y pegas. | Ver abajo cÃ³mo abrirla |

### ðŸ’» La terminal desde 0 (si nunca la tocaste)

La terminal es como el WhatsApp de tu PC: escribes una orden, pulsas Enter y te responde. No rompes nada por escribir los comandos de esta guÃ­a.

**CÃ³mo abrirla:**
- **Windows:** pulsa `Windows + R`, escribe `powershell` y Enter. O botÃ³n inicio â†’ escribe `PowerShell` â†’ Ã¡brelo. VerÃ¡s algo azul como `PS C:\Users\TuNombre>`.
- **Mac:** pulsa `Cmd + Espacio`, escribe `Terminal` y Enter. VerÃ¡s como `tunombre@Mac ~ %`.
- **Linux / Chromebook:** `Ctrl + Alt + T`.

**CÃ³mo saber dÃ³nde estÃ¡s y moverte (solo 3 Ã³rdenes):**
```bash
# 1. Ver en quÃ© carpeta estÃ¡s
pwd
# 2. Ver quÃ© archivos hay aquÃ­
ls
# En Windows PowerShell tambiÃ©n vale: dir
# 3. Entrar a la carpeta de tu bot (ejemplo)
cd Hydra-bot
```
- `pwd` = "Â¿dÃ³nde estoy?". Te muestra la ruta.
- `ls` (o `dir`) = "Â¿quÃ© hay aquÃ­?". Debe salir `index.js`, `package.json`, etc.
- `cd NombreCarpeta` = "entra ahÃ­". Para salir un nivel: `cd ..`.

   Ejemplo de cÃ³mo se ve âœ…:
   ```text
   PS C:\Users\Dylan> pwd
   C:\Users\Dylan
   PS C:\Users\Dylan> ls
   Desktop  Documents  Hydra-bot
   PS C:\Users\Dylan> cd Hydra-bot
   PS C:\Users\Dylan\Hydra-bot> ls
   index.js  package.json  .env.example  README.md
   ```
   Si despuÃ©s de `ls` ves `index.js` y `package.json`, estÃ¡s en la carpeta correcta. Si ves otra cosa, usa `cd ..` para salir y `cd NombreCorrecto` para entrar.
- Para pegar en la terminal: `Ctrl + V` o clic derecho â†’ Pegar. Para copiar la respuesta: selecciÃ³nala y `Ctrl + C`.

**CÃ³mo ejecutar cada cosa de esta guÃ­a:**
```bash
# Comprobar Node (solo lee la versiÃ³n, no cambia nada)
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
# Encender el bot (verÃ¡s "Bot online...")
npm start
# Apagarlo: pulsa Ctrl + C en la terminal
```
**CÃ³mo saber si saliÃ³ bien (compara con esto):**
   ```text
   PS C:\Users\Dylan\Hydra-bot> npm install
   added 85 packages in 40s
   PS C:\Users\Dylan\Hydra-bot> npm start
   âœ… Bot online como HydraCaptcha#1234
   ðŸ“¡ Sirviendo 1 servidores
   ðŸ“‹ Slash commands registrados
   ```
   - `npm install` termina con `added X packages`. La primera vez tarda 1-2 min, es normal.
   - `npm start` debe mostrar las 3 lÃ­neas de arriba. DÃ©jalo abierto: mientras esa ventana siga abierta, el bot estÃ¡ encendido. Para apagar: `Ctrl + C`.
   - Tu `.env` lleno se debe ver asÃ­ (con TUS valores, nunca compartas el token real):
   ```env
   TOKEN=MTIz...tu_token_largo_aqui
   GUILD_ID=123456789012345678
   ROLE_VERIFIED=123456789012345679
   ROLE_UNVERIFIED=123456789012345680
   CHANNEL_VERIFICATION=123456789012345681
   ```
   Si sale rojo, copia ese texto y bÃºscalo en la secciÃ³n "Si algo falla" de abajo.

## ðŸ› ï¸ Paso 1 â€” Crea tu bot en Discord (clic por clic, sin perderte)

> Imagina que el portal de Discord es una casa con habitaciones a la izquierda. Te digo en quÃ© habitaciÃ³n entrar y quÃ© interruptor tocar. (Verificado con la documentaciÃ³n oficial 2026: nada de esto pide revisiÃ³n mientras tu bot estÃ© en pocos servidores; la revisiÃ³n solo aparece al superar ~10.000 usuarios.)

**A) Crea la aplicaciÃ³n (la "partida de nacimiento" del bot)**
1. Entra a https://discord.com/developers/applications e inicia sesiÃ³n con tu Discord.
2. Arriba a la derecha pulsa **New Application** (botÃ³n azul).
3. Escribe el nombre: `Hydra Captcha` â†’ **Create**. Llegas a la habitaciÃ³n **General Information** (ves Application ID, icono, descripciÃ³n). AquÃ­ aÃºn NO hay token.

**B) Consigue el TOKEN (su contraseÃ±a secreta)**
1. En el menÃº de la izquierda entra a la habitaciÃ³n **Bot** (icono de robot).
2. Si es nuevo verÃ¡s **Add Bot** â†’ pulsa y confirma. Luego verÃ¡s la secciÃ³n **Token**.
3. Pulsa **Reset Token** â†’ te muestra una clave larga una sola vez. **CÃ“PIALA YA** a un bloc de notas. No podrÃ¡s verla de nuevo, solo cambiarla.
   ```text
   âœ… Se ve asÃ­: MTIzNDU2Nzg5MDEyMzQ1Njc4OS5H... (muy larga)
   âŒ Si la pierdes: vuelve aquÃ­ y pulsa Reset Token otra vez.
   ```
4. âš ï¸ Nunca la pegues en fotos, videos ni GitHub. Va en tu `.env` mÃ¡s adelante.

**C) Enciende sus OJOS (los Intents) â€” el paso que mÃ¡s falla**
1. Sigue en **Bot**, baja con la rueda hasta **Privileged Gateway Intents**. VerÃ¡s 3 interruptores:
   | Interruptor | Para quÃ© sirve (en niÃ±os) | Â¿Lo enciendo? |
   |---|---|---|
   | Presence Intent | Ver si la gente estÃ¡ conectada/ausente | âŒ Apagado (no lo usamos) |
   | **Server Members Intent** | Ver QUIÃ‰N ENTRA o sale (sin esto no pone "No Verificado") | âœ… Encendido |
   | **Message Content Intent** | Leer lo que dicen los mensajes | âœ… Encendido |
2. Activa los 2 y pulsa **Save Changes** abajo. Si no guardas, es como no haberlo hecho.
3. Si luego el bot enciende pero no reacciona a entradas, el 99% es que uno de estos quedÃ³ apagado (error `DisallowedIntents` en la terminal).

**D) Crea la invitaciÃ³n (habitaciÃ³n OAuth2 â†’ URL Generator)**
1. En el menÃº izquierdo entra a **OAuth2** y luego a la sub-pestaÃ±a **URL Generator** (estÃ¡ dentro de OAuth2, no es un menÃº aparte).
2. En **Scopes** (Â¿a dÃ³nde puede entrar?) marca solo estas 2 casillas:
   - âœ… `bot` (mete al robot al servidor)
   - âœ… `applications.commands` (deja usar comandos `/`)
3. Al marcar `bot` aparece abajo **Bot Permissions** (Â¿quÃ© puede hacer?). Marca:
   - âœ… `Manage Roles` (poner/quitar Verificado â€” sin esto falla)
   - âœ… `Send Messages` (escribir en el canal)
   - âœ… `Use Slash Commands` (responder a `/`)
4. Abajo del todo se genera sola la **Generated URL**, se ve asÃ­:
   ```text
   https://discord.com/api/oauth2/authorize?client_id=123456789012345678&permissions=268435456&scope=bot+applications.commands
   ```
   CÃ³piala. Si cambias casillas, la URL cambia: cÃ³piala de nuevo.

**E) Mete al bot a tu servidor**
1. Pega esa URL en tu navegador â†’ elige tu servidor en la lista â†’ **Continue â†’ Autorizar** (marca los permisos que pide, son los del paso D).
2. Resuelve el captcha de Discord si lo pide. Entra a tu servidor: el bot aparece en la lista de miembros (al inicio gris/offline hasta que lo enciendas en el Paso 4).
3. **Comprueba:** ve a Ajustes del servidor â†’ Miembros: debes ver `Hydra Captcha` con etiqueta BOT.

## ðŸŽ­ Paso 2 â€” Crea los 2 rangos

En tu servidor: **Ajustes â†’ Roles â†’ Crear rol**.

- `No Verificado` (rojo, sin ver canales).
- `Verificado` (verde, puede hablar).

âš ï¸ **Muy importante:** en la lista de roles, arrastra el rol de tu bot **por encima** de esos dos. Si no, Discord no le deja poner rangos.

## ðŸ”‘ Paso 3 â€” Tus 5 claves (el .env explicado como receta)

**Primero entiende esto (30 segundos):**
- `.env.example` = la FOTOCOPIA EN BLANCO. Dice quÃ© huecos llenar, pero no tiene tus datos.
- `.env` = TU HOJA YA LLENA con tus secretos. El bot solo lee esta.
- Â¿Por quÃ© copiar y no escribir a mano? Para no olvidar ninguna lÃ­nea. Copias la plantilla y solo rellenas.

**3A) Consigue tus 5 valores (guÃ¡rdalos en un bloc de notas temporal):**
1. En Discord: **Ajustes (rueda) â†’ Avanzado â†’ activa Modo Desarrollador** (interruptor azul).
2. Ahora haz clic derecho â†’ **Copiar ID** en cada cosa. Un ID se ve asÃ­ (18 nÃºmeros):
   ```text
   1307246359895740448
   ```
   CÃ³pialos de: â‘  tu servidor (clic derecho en su icono) â‘¡ rol Verificado â‘¢ rol No Verificado (Ajustes del servidor â†’ Roles â†’ â‹¯ â†’ Copiar ID) â‘£ canal #verificacion. MÃ¡s tu TOKEN del Paso 1. Ya tienes 5.

**3B) Ponte DENTRO de la carpeta del bot (si no, el comando falla):**
```bash
cd Hydra-bot
ls
```
Debe salir âœ…:
```text
index.js  package.json  .env.example  README.md
```
âŒ Si sale otra cosa o error `No existe la ruta`, estÃ¡s en la carpeta equivocada. Usa `pwd` para ver dÃ³nde estÃ¡s y `cd ..` para salir un nivel.

**3C) Copia la plantilla (elige SOLO uno segÃºn tu terminal):**
```bash
# Mac / Linux:
cp .env.example .env
```
```powershell
# Windows PowerShell:
Copy-Item .env.example .env
```
âœ… Si sale bien NO muestra nada, solo vuelve a salir `PS ...>`. CompruÃ©balo:
```bash
ls
```
Ahora debe aparecer `.env` en la lista. (En el explorador de Windows los archivos que empiezan con punto a veces se ocultan: Vista â†’ Mostrar â†’Elementos ocultos.)
âŒ Si ves `No se encuentra... / cannot find`: es que no estÃ¡s en la carpeta (vuelve a 3B).
ðŸ–±ï¸ **Alternativa sin terminal:** abre la carpeta en el explorador â†’ copia `.env.example` â†’ pÃ©galo ahÃ­ mismo â†’ renÃ³mbralo a `.env`. Mismo resultado.

**3D) Abre tu `.env` y rellena (ejemplo de cÃ³mo debe QUEDAR):**
- Windows: clic derecho en `.env` â†’ Abrir con Bloc de notas. O en terminal: `notepad .env`.
- Mac: `open -e .env`. O usa VS Code si lo tienes: `code .env`.
```env
TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OS5Habc_tu_token_real_aqui
GUILD_ID=1307246359895740448
ROLE_VERIFIED=1307246359895740449
ROLE_UNVERIFIED=1307246359895740450
CHANNEL_VERIFICATION=1307246359895740451
```
Reglas: sin espacios alrededor del `=`, sin comillas, un dato por lÃ­nea, guarda con `Ctrl + S`.
âœ… **Chequeo final:** las 5 lÃ­neas tienen valores (nada dice `pega_aqui`), el archivo se llama exactamente `.env` y estÃ¡ junto a `index.js`. Si el bot luego dice "invalid token", el TOKEN estÃ¡ mal copiado: repite el Paso 1B.

## ðŸ’» Paso 4 â€” Instala y enciende (guÃ­a completa)

Ahora viene la parte divertida: instalar las piezas y encender el bot. Voy a mostrarte exactamente quÃ© escribir y quÃ© deberÃ­a salir en tu pantalla. Copia y pega cada lÃ­nea en tu terminal (dentro de la carpeta del bot).

### 4A) Descarga las piezas del bot

Escribe esto en la terminal y pulsa Enter:

```bash
npm install
```

Â¿QuÃ© hace esto? Descarga automÃ¡ticamente todas las "piezas" que el bot necesita para funcionar: `discord.js` (para hablar con Discord), `canvas` (para dibujar la imagen del captcha) y `dotenv` (para leer tu archivo `.env`).

AsÃ­ se ve cuando empieza (estÃ¡ trabajando, espera 1-2 minutos):
```text
PS C:\Users\Dylan\Hydra-bot> npm install
```

AsÃ­ se ve cuando termina âœ…:
```text
added 85 packages in 40s
```

- **`added 85 packages`** = descargÃ³ 85 piezas. El nÃºmero puede variar (83, 87, etc.), no te preocupes por eso.
- **`in 40s`** = tardÃ³ 40 segundos. La primera vez es normal que tarde 1-2 minutos.

Si todo saliÃ³ bien, ahora en tu carpeta apareciÃ³ una carpeta nueva llamada `node_modules`. Esa carpeta contiene todas las piezas. **No la borres ni la muevas.**

TambiÃ©n apareciÃ³ un archivo `package-lock.json`. Tampoco lo toques: es el "recibo" de lo que se instalÃ³.

Para comprobar, escribe:
```bash
ls
```
DeberÃ­as ver âœ…:
```text
Dockerfile  README.md  index.js  node_modules  package-lock.json  package.json  .env.example
```
Si ves `node_modules` en la lista, todo saliÃ³ bien.

### 4B) Si `npm install` falla (errores de canvas)

El 95% de las veces `npm install` funciona sin problemas. Pero si ves texto rojo o errores, el culpable casi siempre es `canvas` (la pieza que dibuja imÃ¡genes). Dependiendo de tu sistema:

**En Windows:**
Si ves un error que menciona `node-gyp`, `binding.cc`, `msvs`, o algo con "Visual Studio":
```text
gyp ERR! stack Error: Could not find any Python installation to use
```
o
```text
error: command 'msbuild' failed
```
SoluciÃ³n: necesitas instalar las "herramientas de compilaciÃ³n" de Windows. Abre PowerShell **como administrador** (clic derecho en PowerShell â†’ "Ejecutar como administrador") y escribe:
```powershell
npm install -g windows-build-tools
```
Esto tarda 2-5 minutos. Cuando termine, cierra y abre la terminal de nuevo, vuelve a la carpeta del bot (`cd Hydra-bot`) y reintenta:
```bash
npm install
```

Si en Windows usas **Node.js 20 o superior**, otra opciÃ³n mÃ¡s rÃ¡pida es instalar solo el compilador:
```powershell
npm install -g node-gyp
```
Y luego reinstalar canvas:
```bash
npm install canvas
```

**En Mac:**
Si ves errores con `canvas` o `node-gyp`, necesitas las herramientas de Apple. Abre la terminal y escribe:
```bash
xcode-select --install
```
Se abre una ventana de Mac â†’ pulsa **Instalar**. Tarda 5-15 minutos segÃºn tu internet. Cuando termine, reintenta:
```bash
npm install
```

**En Linux (Ubuntu/Debian):**
Si ves errores con `canvas`, faltan las librerÃ­as de sistema. Escribe:
```bash
sudo apt install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev
```
Pide tu contraseÃ±a de PC (no se ve cuando la escribes, eso es normal). Cuando termine, reintenta:
```bash
npm install
```

**Â¿Y si canvas sigue fallando?** No te preocupes: el bot **puede funcionar sin canvas**. El captcha simplemente no generarÃ¡ imagen y el bot lo saborea igual. Si quieres intentar sin canvas:
```bash
npm install discord.js dotenv
```
(Sin `canvas`). El bot enciende, pero en vez de imagen muestra el cÃ³digo en texto. Si luego quieres intentar canvas, solo escribe `npm install canvas` y ya.

### 4C) Revisa que todo estÃ© en orden

Antes de encender, comprueba que tu `.env` estÃ© bien. Escribe:
```bash
ls
```
DeberÃ­as ver tu `.env` junto a `index.js`. Si no ves `.env`, vuelve al Paso 3C.

Si todavÃ­a no has llenado tu `.env` con tus IDs, hazlo ahora:
```bash
# Windows:
notepad .env
# Mac:
open -e .env
# O abre el archivo .env con tu editor favorito (VS Code, Bloc de notas, etc.)
```

Recuerda que debe quedar asÃ­ (con TUS valores, sin espacios ni comillas):
```env
TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OS5Habc_tu_token_real_aqui
GUILD_ID=1307246359895740448
ROLE_VERIFIED=1307246359895740449
ROLE_UNVERIFIED=1307246359895740450
CHANNEL_VERIFICATION=1307246359895740451
```

Guarda el archivo (Ctrl+S en Windows / Cmd+S en Mac) y ciÃ©rralo.

### 4D) Enciende el bot ðŸš€

Escribe:
```bash
npm start
```

DeberÃ­as ver esto âœ…:
```text
PS C:\Users\Dylan\Hydra-bot> npm start

> hydra-captcha-bot@1.0.0 start
> node index.js

âœ… Bot online como HydraCaptcha#1234
ðŸ“¡ Sirviendo 1 servidores
ðŸ“‹ Slash commands registrados
```

Vamos a revisar quÃ© significa cada lÃ­nea:

| LÃ­nea | QuÃ© significa | Â¿EstÃ¡ bien? |
|---|---|---|
| `âœ… Bot online como HydraCaptcha#1234` | Tu bot se conectÃ³ a Discord y estÃ¡ activo. El `#1234` es su nÃºmero de Discord (el tuyo serÃ¡ distinto). | âœ… Si ves esto, funciona |
| `ðŸ“¡ Sirviendo 1 servidores` | El bot estÃ¡ en 1 servidor (el tuyo). Si lo metiste en mÃ¡s, verÃ¡s un nÃºmero mayor. | âœ… Normal |
| `ðŸ“‹ Slash commands registrados` | Los comandos `/setup-verification` y `/captcha-test` estÃ¡n listos para usarse en Discord. | âœ… Listo para probar |

**âš ï¸ Â¡Ojo!** Mientras esta ventana de terminal estÃ© abierta, el bot estÃ¡ encendido. Si la cierras, el bot se apaga. Para apagarlo manualmente, pulsa `Ctrl + C` en la terminal.

### 4E) Prueba que funciona

1. Ve a tu servidor de Discord.
2. En el canal de texto escribe: `/setup-verification`
3. Discord te mostrarÃ¡ el comando. Seleccionalo y pulsa Enter.
4. DeberÃ­a aparecer un mensaje con un botÃ³n verde **"Verificarme"** âœ…
5. Pulsa el botÃ³n. El bot te mostrarÃ¡ una imagen con un cÃ³digo de 6 letras.
6. Escribe el cÃ³digo en la ventanita que aparece.
7. Si lo escribes bien, el bot te darÃ¡ el rango **Verificado** (verde). Â¡Funciona!

### 4F) Si el bot no enciende (errores comunes)

| Error que ves | Causa | SoluciÃ³n |
|---|---|---|
| `SyntaxError: Unexpected token` | Tu `.env` tiene un error de formato | Revisa que no tenga espacios alrededor del `=`, ni comillas, ni lÃ­neas vacÃ­as al final |
| `Error [TOKEN_INVALID]` o `Error [DisallowedIntents]` | Token mal copiado o Intents apagados | Copia el token de nuevo desde Discord Developer Portal. Verifica que Server Members Intent y Message Content Intent estÃ©n encendidos (Paso 1C) |
| `Error: Cannot find module './index.js'` | No estÃ¡s en la carpeta correcta | Escribe `pwd` para ver dÃ³nde estÃ¡s. Usa `cd Hydra-bot` para entrar a la carpeta |
| `Error: Cannot find module 'canvas'` | Canvas no se instalÃ³ bien | Reinstala: `npm install canvas` (ver secciÃ³n 4B si falla) |
| `Error:æ— æ³•æ‰¾åˆ°` o errores en otro idioma | npm estÃ¡ en otro idioma | Normal, no afecta. Busca "added X packages" o "ERR" para saber si saliÃ³ bien |

### Resumen rÃ¡pido del Paso 4

```bash
# 1. Descargar piezas (una sola vez)
npm install

# 2. Revisar que .env estÃ© bien (si no lo has hecho)
ls          # Comprueba que .env estÃ¡ ahÃ­
notepad .env   # Windows - o tu editor favorito

# 3. Encender
npm start

# 4. Probar en Discord: /setup-verification

# 5. Apagar: Ctrl + C
```

## ðŸ“£ Paso 5 â€” Pon el panel

En tu Discord escribe:
```
/setup-verification
```

Sale un mensaje con botÃ³n verde **Verificarme**. PruÃ©balo con una cuenta secundaria o pide a un amigo que entre.

## â¬‡ï¸ Descarga el bot 100% completo (.zip)

Â¿Quieres comparar tu resultado con el modelo terminado? Descarga **`BOT-LISTO.zip`** (aquÃ­ mismo en el repo): incluye `BOT-LISTO.js` funcionando, `package.json`, `.env.example` y `LEEME-COMPARA.txt` con la lista de chequeo.

CÃ³mo comparar: abre tu `mi-primer-bot.js` o tu `index.js` al lado de `BOT-LISTO.js`. Si el tuyo enciende, registra `/hola`, genera el captcha y cambia rangos, quedaste igual que el modelo. Para personalizar el modelo sin programar, edita solo el bloque `PERSONALIZA` de arriba (textos, colores, imagen miniatura, fuente, tamaÃ±o y longitud) y reinicia con `node BOT-LISTO.js`.

## ðŸ“– El cÃ³digo por secciones (como en `index.js`)

Abre `index.js`. Arriba de cada bloque hay un comentario `SECCIÃ“N X` que dice quÃ© hace y por quÃ©:

- **SECCIÃ“N 1 â€” LibrerÃ­as:** traemos las herramientas (`discord.js` para hablar con Discord, `canvas` para dibujar la imagen, `dotenv` para leer tu `.env`).
- **SECCIÃ“N 2 â€” Config:** leemos tus 5 IDs. Si algo falla, el 90% de las veces es un ID mal copiado.
- **SECCIÃ“N 3 â€” Generador captcha:** crea texto como `K7P2Q9` (sin letras confusas como O/0) y lo dibuja en una imagen de 400x150 con fondo, puntitos y letras de colores.
- **SECCIÃ“N 4 â€” Mensaje bonito:** el embed + botÃ³n verde. Es solo diseÃ±o.
- **SECCIÃ“N 5 â€” Encendido:** se conecta, registra `/setup-verification` y `/captcha-test`.
- **SECCIÃ“N 6 â€” Cuando entra alguien:** pone "No Verificado" y manda DM de bienvenida.
- **SECCIÃ“N 7 â€” BotÃ³n + ventanita + premio:** genera imagen, la muestra solo a ti (efÃ­mero), abre la ventanita (modal), compara lo que escribiste, y si aciertas te cambia los rangos.

## ðŸ”¨ Taller: construye TU bot a mano (de archivo vacÃ­o a funcionando)

> AquÃ­ no solo lees: ESCRIBES. Crea un archivo `mi-primer-bot.js` al lado de `index.js` y avanza por niveles. Cada nivel se prueba. Si un nivel no sale, no pases al siguiente.

**Nivel 0 â€” Las piezas (en la terminal, dentro de la carpeta):**
```bash
npm init -y
npm install discord.js dotenv
```
âœ… Debe terminar con `added X packages` y aparecer la carpeta `node_modules`. (El `canvas` lo instalamos en el Nivel 3, porque en algunos PCs pide herramientas extra.)

**Nivel 1 â€” Que encienda y salude (lo mÃ­nimo que respira):**
Crea `mi-primer-bot.js` y escribe ESTO a mano (escrÃ­belo, no solo copies: tus dedos aprenden):
```js
require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`âœ… Estoy vivo como ${c.user.tag}`);
});

client.login(process.env.TOKEN);
```
PruÃ©balo: `node mi-primer-bot.js`. âœ… Debes ver `âœ… Estoy vivo como HydraCaptcha#1234`. Apagar: `Ctrl + C`. âŒ `invalid token` = tu `.env` estÃ¡ mal (vuelve al Paso 3).

**Nivel 2 â€” Tu primer slash `/hola` (sin captcha todavÃ­a):**
Debajo del `ClientReady`, agrega:
```js
const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
async function registrar() {
  await rest.put(Routes.applicationCommands(client.user.id), {
    body: [new SlashCommandBuilder().setName("hola").setDescription("Te saluda").toJSON()],
  });
  console.log("ðŸ“‹ Comando /hola registrado");
}
// Llama a registrar() dentro del ClientReady.
client.on(Events.InteractionCreate, async (i) => {
  if (i.isChatInputCommand() && i.commandName === "hola") {
    await i.reply("Â¡Hola! ðŸ‘‹ Soy tu bot en pruebas.");
  }
});
```
Reinicia, espera 1 min y escribe `/hola` en tu Discord. âœ… Responde. AsÃ­ aprendiste: registrar â†’ escuchar â†’ responder.

**Nivel 3 â€” Dibuja tu primer captcha (instala el lÃ¡piz):**
```bash
npm install canvas
```
âŒ Si falla en Linux: `sudo apt install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev` y reintenta. Agrega:
```js
const { createCanvas } = require("canvas");
function textoFacil() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O/0/I/1 para no confundir
  let t = "";
  for (let i = 0; i < 4; i++) t += letras[Math.floor(Math.random() * letras.length)];
  return t; // ej: "K7P2"
}
```
Agrega al final `console.log(textoFacil(), textoFacil());` y corre. âœ… Debes ver 2 cÃ³digos de 4 letras.

**Nivel 4 â€” El premio (rangos): solo 2 lÃ­neas:**
```js
await miembro.roles.add(rolVerificado);      // dar
await miembro.roles.remove(rolNoVerificado); // quitar
```
Eso es TODO lo que hace el bot real al acertar. Lo demÃ¡s es la ventanita (modal), que ya viste en `index.js`.

**Nivel 5 â€” Compara con el ejemplo hecho:**
Abre `BOT-LISTO.js` (en este repo, descargable). Es el bot completo con una zona arriba `ðŸŽ¨ PERSONALIZA AQUÃ` donde cambias textos, colores, fuente, tamaÃ±o y longitud sin tocar la lÃ³gica.

### Mini-ejercicio para aprender

1. Cambia `captchaLength: 6` a `4` en `CONFIG`. Reinicia. Â¿El captcha ahora es mÃ¡s fÃ¡cil?
2. Cambia un color en `captchaColors`. Â¿QuÃ© letra cambia de color?
3. Lee la funciÃ³n `generateCaptchaText` y responde: Â¿por quÃ© no incluye la letra `O` ni el nÃºmero `0`?

## ðŸ†“ Subirlo gratis 24/7 (sin tarjeta)

El bot en tu PC se apaga si cierres la PC. SÃºbelo a un panel gratis tipo Pterodactyl (ej: Waifly, HeavenCloud):

1. Crea cuenta con email (sin tarjeta).
2. Crea servidor Node.js 20.
3. Sube estos archivos por SFTP o el administrador: `index.js`, `package.json` (NO subas tu `.env` con token, pon las variables en el panel â†’ Environment).
4. Start Command: `npm start`.

> GitHub NO mantiene bots encendidos (solo guarda cÃ³digo). Render/Railway piden tarjeta o se duermen. Koyeb nuevo pide plan pago. Usa paneles Pterodactyl gratis.

## ðŸ†˜ Si algo falla

| SÃ­ntoma | Causa 99% | SoluciÃ³n |
|---|---|---|
| Bot offline | Token mal / `.env` mal | Revisa `TOKEN=` sin espacios ni comillas. Copia el token de nuevo desde Developer Portal â†’ Bot â†’ Reset Token |
| No pone rangos | Rol del bot abajo en la lista | Arrastra el rol del bot **por encima** de Verificado y No Verificado en Ajustes â†’ Roles. Activa permiso "Gestionar Roles" |
| Slash no aparecen | Invitaste sin `applications.commands` | Repite Paso 1D: marca `bot` + `applications.commands`, copia la URL nueva y re-invita al bot |
| DM no llega | Usuario bloqueÃ³ DMs de Discord | Normal: el botÃ³n en el canal #verificacion sigue funcionando perfectamente. No es un error del bot |
| `canvas` no instala en **Linux** | Faltan librerÃ­as de sistema | `sudo apt install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev` y reintenta `npm install` |
| `canvas` no instala en **Windows** | Faltan herramientas de compilaciÃ³n | Abre PowerShell como admin â†’ `npm install -g windows-build-tools` â†’ reinicia terminal â†’ `npm install` |
| `canvas` no instala en **Mac** | Faltan herramientas de Apple | `xcode-select --install` â†’ acepta â†’ espera 5-15 min â†’ reintenta `npm install` |
| `Error [TOKEN_INVALID]` | Token copiado mal o expirado | Ve a Discord Developer Portal â†’ Bot â†’ Reset Token â†’ copia el nuevo â†’ pÃ©galo en `.env` |
| `Error [DisallowedIntents]` | Intents apagados | Developer Portal â†’ Bot â†’ Privileged Gateway Intents â†’ enciende Server Members + Message Content â†’ Save |
| El bot enciende pero no genera captcha | Canvas no instalÃ³ o falta | `npm install canvas`. Si falla, usa el bot sin imagen (solo texto) â€” funciona igual |
| `npm install` va muy lento o se traba | ConexiÃ³n lenta o npm con problemas | Prueba: `npm cache clean --force` y vuelve a `npm install`. O cambia a otro internet |

## ðŸ”’ Reglas de oro

- Nunca subas `.env` a GitHub (ya estÃ¡ en `.gitignore`).
- Si tu token se filtra, ve a Developers â†’ Bot â†’ Reset Token y pon el nuevo en `.env` y en tu hosting.
- Este repo es pÃºblico para compartir con compaÃ±eros: el cÃ³digo se ve, pero TUS secretos estÃ¡n a salvo porque el archivo `.env` nunca se sube (estÃ¡ en `.gitignore`). Cada compaÃ±ero usa su propio token con su `.env`.

Â¡Hecho! Si llegaste hasta aquÃ­ ya sabes mÃ¡s que ayer: quÃ© es un token, un intent, un rol, un slash y cÃ³mo un captcha protege tu Discord. ðŸš€