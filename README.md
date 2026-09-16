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
2. **Node.js 20** → Descárgalo de https://nodejs.org (botón verde LTS). Para comprobar que quedó bien, abre una terminal y escribe:
   ```bash
   node -v
   npm -v
   ```
   Si ves números de versión, vas bien.
3. **Un servidor de Discord donde seas admin** (puede ser uno de prueba que crees tú).

### Glosario mini (para no perderse)

| Palabra | Qué es, en simple |
|---|---|
| Token | La contraseña secreta de tu bot. Nunca la compartas ni la subas a GitHub. |
| Intent | Permiso que le das al bot para "ver" cosas (ej: quién entra). |
| Rol | Rango: Verificado / No Verificado. |
| Slash command | Comando con `/` ej: `/setup-verification`. |
| `.env` | Archivo con tus secretos. El `.env.example` es la plantilla vacía. |
| Terminal | Ventana negra donde escribes comandos. |

## 🛠️ Paso 1 — Crea tu bot en Discord (con fotos mentales)

1. Entra a https://discord.com/developers/applications → **New Application** → nombre: `Hydra Captcha`.
2. Menú **Bot** → **Reset Token** → **cópialo** a un bloc de notas. Ese es tu `TOKEN`.
3. En **Bot**, activa: **Server Members Intent** y **Message Content Intent** (son interruptores).
4. Menú **OAuth2 → URL Generator** → marca `bot` y `applications.commands` → en permisos marca `Manage Roles`, `Send Messages`, `Use Slash Commands`.
5. Copia la URL que se genera abajo, pégala en tu navegador, elige tu servidor → **Autorizar**.

## 🎭 Paso 2 — Crea los 2 rangos

En tu servidor: **Ajustes → Roles → Crear rol**.

- `No Verificado` (rojo, sin ver canales).
- `Verificado` (verde, puede hablar).

⚠️ **Muy importante:** en la lista de roles, arrastra el rol de tu bot **por encima** de esos dos. Si no, Discord no le deja poner rangos.

## 🔑 Paso 3 — Consigue 5 IDs

1. En Discord: **Ajustes → Avanzado → activa Modo Desarrollador**.
2. Clic derecho → **Copiar ID** en: tu servidor, rol Verificado, rol No Verificado y canal #verificacion.
3. Copia `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
   En Windows (PowerShell):
   ```powershell
   Copy-Item .env.example .env
   ```
4. Abre `.env` y pega:
   ```env
   # Contraseña secreta del bot (del Paso 1)
   TOKEN=pega_aqui_tu_token
   # ID de tu servidor
   GUILD_ID=pega_aqui_id_servidor
   # ID del rol que se da al verificarse
   ROLE_VERIFIED=pega_aqui_id_verificado
   # ID del rol que se da al entrar
   ROLE_UNVERIFIED=pega_aqui_id_no_verificado
   # ID del canal donde estará el botón
   CHANNEL_VERIFICATION=pega_aqui_id_canal
   ```

## 💻 Paso 4 — Instala y enciende

```bash
npm install
npm start
```

Deberías ver:
```
✅ Bot online como HydraCaptcha#1234
📋 Slash commands registrados
```

Si ves eso, ¡ya funciona!

## 📣 Paso 5 — Pon el panel

En tu Discord escribe:
```
/setup-verification
```

Sale un mensaje con botón verde **Verificarme**. Pruébalo con una cuenta secundaria o pide a un amigo que entre.

## 📖 El código por secciones (como en `index.js`)

Abre `index.js`. Arriba de cada bloque hay un comentario `SECCIÓN X` que dice qué hace y por qué:

- **SECCIÓN 1 — Librerías:** traemos las herramientas (`discord.js` para hablar con Discord, `canvas` para dibujar la imagen, `dotenv` para leer tu `.env`).
- **SECCIÓN 2 — Config:** leemos tus 5 IDs. Si algo falla, el 90% de las veces es un ID mal copiado.
- **SECCIÓN 3 — Generador captcha:** crea texto como `K7P2Q9` (sin letras confusas como O/0) y lo dibuja en una imagen de 400x150 con fondo, puntitos y letras de colores.
- **SECCIÓN 4 — Mensaje bonito:** el embed + botón verde. Es solo diseño.
- **SECCIÓN 5 — Encendido:** se conecta, registra `/setup-verification` y `/captcha-test`.
- **SECCIÓN 6 — Cuando entra alguien:** pone "No Verificado" y manda DM de bienvenida.
- **SECCIÓN 7 — Botón + ventanita + premio:** genera imagen, la muestra solo a ti (efímero), abre la ventanita (modal), compara lo que escribiste, y si aciertas te cambia los rangos.

### Mini-ejercicio para aprender

1. Cambia `captchaLength: 6` a `4` en `CONFIG`. Reinicia. ¿El captcha ahora es más fácil?
2. Cambia un color en `captchaColors`. ¿Qué letra cambia de color?
3. Lee la función `generateCaptchaText` y responde: ¿por qué no incluye la letra `O` ni el número `0`?

## 🆓 Subirlo gratis 24/7 (sin tarjeta)

El bot en tu PC se apaga si cierres la PC. Súbelo a un panel gratis tipo Pterodactyl (ej: Waifly, HeavenCloud):

1. Crea cuenta con email (sin tarjeta).
2. Crea servidor Node.js 20.
3. Sube estos archivos por SFTP o el administrador: `index.js`, `package.json` (NO subas tu `.env` con token, pon las variables en el panel → Environment).
4. Start Command: `npm start`.

> GitHub NO mantiene bots encendidos (solo guarda código). Render/Railway piden tarjeta o se duermen. Koyeb nuevo pide plan pago. Usa paneles Pterodactyl gratis.

## 🆘 Si algo falla

| Síntoma | Causa 99% | Solución |
|---|---|---|
| Bot offline | Token mal / `.env` mal | Revisa `TOKEN=` sin espacios ni comillas |
| No pone rangos | Rol del bot abajo | Sube el rol del bot arriba de Verificado/No Verificado + permiso Gestionar Roles |
| Slash no aparecen | Invitaste sin `applications.commands` | Repite Paso 1 punto 4 e invita de nuevo |
| `canvas` no instala (Linux) | Faltan librerías | `sudo apt install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev` |
| DM no llega | Usuario bloqueó DMs | Normal, el botón en el canal sigue funcionando |

## 🔒 Reglas de oro

- Nunca subas `.env` a GitHub (ya está en `.gitignore`).
- Si tu token se filtra, ve a Developers → Bot → Reset Token y pon el nuevo en `.env` y en tu hosting.
- Este repo es privado: solo tú lo ves, perfecto para practicar.

¡Hecho! Si llegaste hasta aquí ya sabes más que ayer: qué es un token, un intent, un rol, un slash y cómo un captcha protege tu Discord. 🚀
