# CHANGELOGS

Registro fechado de cada cambio aplicado al bot y al panel. Lo más reciente arriba.

---

## 10/10/2026 · 00:15

**Música — arreglo directo del "no pude obtener el audio" en el host**
- **SoundCloud ahora es el respaldo real cuando YouTube bloquea la IP**: si el bot detecta que YouTube está bloqueado (5 min de memoria), salta directo a SoundCloud sin gastar ~30 s en 4 instancias Invidious públicas que hoy están caídas o tras anti-bots.
- **Reintento con consulta corta**: si la búsqueda estricta con el título completo del vídeo de YouTube no encuentra nada (el título suele llevar "(Lyric Video) | Canal"), se reintenta con las 3 palabras más largas del título. Así "Kris R, GeezyDee - TUKI TUKI (Lyric Video) | CantoYo" → busca "tuki kris geezydee" y encuentra la pista.
- **`searchTrack` directo a SoundCloud**: cuando el usuario escribe texto libre (no un enlace) y YouTube está bloqueado, se busca directamente en SoundCloud sin pasar por yt-dlp/play-dl/Invidious.
- **Metadatos de YouTube sin Invidious si está bloqueado**: `resolveYouTube` omite Invidious para título/duración cuando YouTube está bloqueado (las instancias públicas tardan ~28 s en timeout); usa oEmbed, que funciona siempre.
- **Diagnóstico ampliado**: el límite de notas del error sube de 6 a 8, así se ve el fallo real de SoundCloud en el canal (antes quedaba oculto tras yt-dlp + play-dl + 4 Invidious).
- **`soundcloudFallbackForSong` con dos intentos**: consulta completa del título del vídeo, y si falla, consulta corta con palabras significativas.

**Comprobado**
- `node --check index.js`: OK.
- Búsqueda SoundCloud local: "TUKI TUKI Kris R GeezyDee" → pista oficial 30 s (preview), probe de audio OK.
- yt-dlp en el host verificado (ELF, 40 MB, mismo hash que el desplegado).
- `guilds.json` del host: Hyperhard sin config guardada → usa defaults (respaldo SoundCloud activo).

**Despliegue**
- `index.js` hash `0bb845809eeecb50` → host OK. yt-dlp SKIP (mismo hash).

---

## 09/10/2026 · 21:19

**Música — se acabó el "no pude obtener el audio" sin explicación**
- **Diagnóstico por fuente en el canal**: cuando no se puede reproducir, el error ahora lista qué probó el bot y por qué falló cada camino (p. ej. `• yt-dlp: omitido (YouTube bloqueó la IP hace poco)`, `• Invidious: sin audio`, `• SoundCloud: solo hay remezclas/covers`). Antes salía un genérico *"no pude obtener el audio"* imposible de interpretar.
- **Fuente real en el mensaje**: el pie del "Reproduciendo ahora" indica de dónde sale el audio (`Fuente: YouTube (yt-dlp)`, `YouTube vía Invidious`, `SoundCloud`, `SoundCloud (vista previa 30 s)`…).
- **SoundCloud ya no elige remezclas**: compara los títulos con una norma estricta que detecta *remix/cover/edit/mashup* como otra canción; si solo hay remezclas, **no reproduce nada** y lo dice (mejor un error claro que una canción que nadie pidió). Búsqueda ampliada a `scsearch10`.
- **Vista previa de 30 s**: SoundCloud limita a 30 s las pistas de artistas verificados; si es lo único disponible se reproduce y se avisa en el pie (`vista previa 30 s`) en lugar de fallar.
- **Invidious con `local=true`**: pide a la instancia que sirva el audio desde su propio proxy; antes devolvía URLs de `googlevideo.com`, que el host (IP bloqueada por YouTube) no puede descargar — eso dejaba la cola muda.
- **Invidious hoy está caído**: de la lista oficial solo quedaba `invidious.f5.si` y ahora responde HTTP 500 (y su proxy de audio está tras un anti-bot Anubis). El respaldo real cuando YouTube bloquea la IP sigue siendo **Panel → Música → Proxy para yt-dlp**.

**Comprobado**
- `node --check index.js`: OK.
- Selección de SoundCloud probada con yt-dlp local: TUKI TUKI → pista oficial (30 s, aviso), Never Gonna Give You Up → pista completa (193 s), DÁKITI → solo remezclas → no reproduce.

**Herramienta**
- `tools/hydra_changelog.py`: publica el changelog de cada despliegue en **todos los destinos** — webhook de Hydra Studio (`#bot-changelogs`) y canales del bot por ID (ahora `#⌊♻⌉ʙᴏᴛ-ᴄʜᴀɴɢᴇʟᴏꜱ` de **Hyperhard Network**). Recuperado el envío que se había cortado tras el 08/10 18:45; el pendiente se publicó en ambos (HTTP 204 / HTTP 200). Uso: `python hydra_changelog.py "Título" archivo.md [--only hyperhard]`.

---

## 08/10/2026 · 21:45

**Música — diagnóstico real del "sin sonido" y enlaces de audio muertos**
- **Sonda de audio (`probeAudioUrl`)**: antes de entregar una URL a ffmpeg se hace un `GET` con `Range: bytes=0-65535` y User-Agent de navegador. Si el origen devuelve 403/404, HTML o un cuerpo vacío, **la URL se descarta y se pasa a la siguiente fuente** (yt-dlp → play-dl → Invidious → SoundCloud) en lugar de dejar la cola muda. Aplicada a yt-dlp (YouTube y genérico), Invidious y SoundCloud (`scsearch` directo).
- **ffmpeg con las cabeceras que el CDN espera**: `-user_agent` con UA de Chrome y `-headers: Referer: https://www.youtube.com/` para dominios googlevideo/ytimg; además `-http_proxy` cuando hay proxy HTTP en Panel → Música (antes ffmpeg hacía las peticiones "peladas", motivo típico de un 403 silencioso).
- **Watchdog de 12 s**: si ffmpeg no escribe ni un byte, se corta el proceso y se avisa en el canal con el host de origen: *«El servidor de audio (…) no envió datos en 12 s»*. El mensaje de «Reproduciendo ahora» ya no puede quedarse sin explicación.
- **stderr de ffmpeg visible**: las primeras 4 líneas se imprimen siempre (antes solo las que contenían "Error"), así un `Server returned 403 Forbidden` aparece en la consola del host en vez de tragarse.
- Un 403/429 de googlevideo en la sonda también marca a YouTube como bloqueado (5 min), así la siguiente canción va directo a SoundCloud/Invidious.
- Con proxy configurado la sonda se omite (se pide la URL a través del mismo proxy).
- `node --check index.js`: OK.

---

## 08/10/2026 · 19:42

**Arreglado (Comandos Premium que no se registraban)**
- **Restituidos los builders de `/metricas`, `/contador`, `/mensaje` y `/temporizador`**: tenían manejador, estaban documentados en `03-comandos.md` y eran funciones Premium con su interruptor en el panel, pero **habían desaparecido del array `cmds`** (se detectó al volver a extraer los comandos del código: 96 slash en vez de 99). Sin builder no se envían a Discord, así que los cuatro comandos no existían para nadie.
- Reconstruidos con el **esquema exacto que ya tenía Discord registrado** (extraído de la API): mismas opciones, choices, rangos (`dias` 1-30) y `default_member_permissions = ManageGuild`.
- Recuento final: **104 comandos = 100 slash + 4 menús contextuales → límite de 100 slash exacto, 0 plazas libres**.

**Actualizado**
- `03-comandos.md` (cabecera y sección "Agrupación de comandos y límite de 100") y `10-limites.md`: 104 comandos, 100 slash, 0 libres.

**Comprobado**
- `extract_cmds.js` + `validate_cmds.py`: **104 comandos, 100 slash, 4 contextuales, 0 plazas libres, VALIDACION OK (sin errores de esquema)**.
- `node --check index.js`: OK.

---

## 08/10/2026 · 19:09

**Arreglado (Música · YouTube bloquea la IP del host)**
- **Causa real**: el error *"Sign in to confirm you're not a bot"* lo lanza YouTube por la IP del datacenter; `play-dl` y yt-dlp con `android,web_embedded` no lo esquivan, y de las instancias públicas comprobadas (10 Invidious + 8 Piped) **todas** devolvían 403/401/502 o caían; Cobalt exige JWT.
- **Clientes de reproductor**: `YTDLP_YT_ARGS` lanza `player_client=android_vr,android,tv_embedded,web_embedded` en una sola invocación y, si falla, **reintenta cliente a cliente** (`ytdlpYT()`); ante un error de bloqueo por IP no insiste (ahorra ~1 min).
- **Invidious como proxy real de YouTube** (hallazgo clave): de la lista oficial solo `https://invidious.f5.si` tenía API viva, y **sí devuelve audio** (probado: HTTP 206 con cabecera WebM). Como la petición la hace la instancia, la IP del host ya no importa y se reproduce **la canción original exacta**. Nuevas funciones:
  - `invidiousSearchFirst()` → `/api/v1/search` (búsqueda de texto sin tocar YouTube).
  - `invidiousVideoMeta()` → título/duración/miniatura de un vídeo.
  - `invidiousInstances()` → refresca el directorio oficial `api.invidious.io` cada 6 h y añade las instancias con `api=true`.
- **Respaldo en SoundCloud** (activado por defecto): si Invidious tampoco puede, busca el título en SoundCloud (`scsearch5`), puntúa los 5 resultados (título exacto 100 / contención 60 / palabras clave 12) y **descarta coincidencias por debajo de 20** para no tocar una canción al azar.
- **Metadatos por oEmbed**: `youtubeOEmbedMeta()` lee título/autor/miniatura de `youtube.com/oembed` (no dispara el anti-bots) cuando todo lo anterior no da info.
- **Memoria de bloqueo 5 min**: al detectar el patrón de bloqueo, `youtubeBlockedNow()` salta YouTube en los 5 minutos siguientes (y en las canciones siguientes) e irá directo a Invidious/SoundCloud o al proxy.
- **Anti-links ya no castiga por un bloqueo**: `isYouTubeMusicLink()` falla abierto si yt-dlp falta o YouTube responde con error de bots (el dominio ya está en la lista blanca del dueño); solo devuelve "no es música" cuando puede leer la categoría real. Acepta además el proxy de la configuración.
- **Mensaje accionable**: cuando todo falla y el motivo es un bloqueo por IP, el canal recibe la indicación de dónde poner el proxy.

**Añadido (Panel → Música)**
- **`musicProxy`** — *Proxy para yt-dlp (vacío = directo)*: se pasa como `--proxy` a todas las llamadas de yt-dlp (búsqueda, metadatos y extracción de audio). Con proxy se ignora la memoria de bloqueo.
- **`musicSoundcloudFallback`** — *Respaldo en SoundCloud si YouTube falla*: interruptor (activado por defecto).

**Mejorado**
- Orden de resolución de audio: **yt-dlp → play-dl → Invidious (canción exacta) → SoundCloud → error con consejo**. Invidious pasa de "último recurso caído" a vía principal cuando la IP está bloqueada; timeout por instancia 10 s → 6 s.
- `/play` y `playGuildMusic()` cargan la configuración de música del servidor antes de resolver (`applyMusicSettings`).

**Comprobado**
- `node --check` en `index.js` y `dashboard/server.js`: OK.
- **Cadena Invidious completa de punta a punta**: `/api/v1/search` (20 resultados, acertó *«BAD BUNNY x JHAY CORTEZ - DÁKITI»*) → `/api/v1/videos` (título + 214 s + 4 formatos de audio) → descarga de `googlevideo.com` con **HTTP 206 y cabecera WebM** (`1a45dfa3`).
- `scsearch5` devuelve 5 resultados JSON y el emparejador elige bien (p. ej. *"Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)"* → *"Never Gonna Give You Up"*, score 70).
- yt-dlp local 2026.08.19: `android_vr`, `android`, `tv_embedded` y la lista combinada devuelven URL de audio y `ytsearch1` OK.
- Se **pusheó a GitHub** (`scainetprr/hydra-bot-source` y `scainetprr/HYDRA-BOT-USE-GUIDE`) y se **desplegó por SFTP** con SHA-256 verificado.

---

## 08/10/2026 · 17:30

**Arreglado (Música)**
- **YouTube "Sign in to confirm you're not a bot"**: prioridad a `play-dl` (`play.video_info` + `play.stream`) que usa cliente interno de YouTube (`youtubei.js`) y evita la detección de bots; fallback a yt-dlp con args Android/Web Embedded + geo-bypass; fallback final a `play-dl` stream.
- **Nuevas fuentes en `/play`**:
  - **SoundCloud URLs**: resueltas nativamente por yt-dlp.
  - **Apple Music URLs**: resueltas nativamente por yt-dlp.
  - **Spotify URLs**: ya funcionaban (oEmbed → búsqueda YouTube).
  - **Texto libre**: búsqueda en YouTube con play-dl + fallback yt-dlp.

**Mejorado**
- Orden de prioridad unificado: play-dl primero para YouTube, yt-dlp para SoundCloud/Apple Music, play-dl fallback final.

---

## 08/10/2026 · 16:45

**Añadido**
- **Módulo Webhooks** (`webhooks`): configura el webhook de changelogs (y futuros avisos globales) desde el panel → Utilidades → Webhooks. Solo URL completa del webhook de Discord.
- **Módulo Promociones** (`promociones`): activa descuentos porcentuales por plan (Perpetua, Sub, Boost, White, Donante) con fechas ISO 8601, código opcional y nota pública. Comando **`/promocion ver|activar|desactivar`** para gestionarlo desde Discord.
- **Comando `/promocion`** con subcomandos: `ver` (muestra promo activa con precios con descuento), `activar` (con % por plan, inicio/fin ISO, código, nota), `desactivar`.

**Mejorado**
- Sidebar: `webhooks` en grupo **Utilidades**, `promociones` en grupo **Gestión** (desaparecen de "Más funciones").

---

## 08/10/2026 · 15:30

**Arreglado**
- **Premium 13/14 → 14/14**: el dueño del bot ahora tiene todas las funciones Premium desbloqueadas sin licencia (interruptor "Modo dueño" en la página 💎 Premium, activado por defecto).
- **Enlaces de Spotify/YouTube bloqueados por error**: el campo `antiLinkAllowDomains` ahora se rellena siempre con su valor por defecto aunque la config guardada traiga cadena vacía; los dominios de música (Spotify, YouTube, SoundCloud, Apple Music, etc.) nunca disparan el anti-links ni la lista blanca.
- **Música sin sonido / error callado**: el bot ahora informa en el canal de texto si falla al obtener el audio (falta `yt-dlp`, ffmpeg, error de stream, etc.) en lugar de entrar al canal y quedarse mudo. Añadidos avisos para errores de ffmpeg (ENOENT), stream de play-dl y player.

**Mejorado**
- **Barra lateral**: módulos sueltos (Tickets, Roles, Inscripciones, Música, Confesiones, Servidor MC, Servicios) agrupados en sus grupos lógicos (Eventos, Utilidades, Entretenimiento, Gestión) — desaparece el desplegable "🧩 Más funciones" salvo búsqueda.
- **Configuración robusta**: `getGuildConfig` rellena automáticamente claves críticas con su valor por defecto si la BD trae cadena vacía, evitando que ajustes como `antiLinkAllowDomains` queden vacíos.

**Comprobado**
- Sintaxis OK (`node --check` en `index.js`, `dashboard/server.js`, `dashboard/public/guild.js`).
- Despliegue SFTP con SHA-256 verificado en 5 archivos (`index.js`, `dashboard/server.js`, `dashboard/public/guild.js`, `dashboard/public/i18n.js`, `dashboard/public/servers.html`).
- `yt-dlp` Linux x64 ya presente en el host (hash verificado, perms 755).

---

## 08/10/2026 · 15:15

**Añadido**
- **Vuelven los 8 comandos de sanción clásicos**: `/ban`, `/tempban`, `/kick`, `/softban`, `/warn`, `/timeout`, `/unban` y `/delwarn`. Sus manejadores ya estaban en el código (permisos, registro de caso, modlog, heat), pero les faltaba el comando: estaban muertos. Cada uno conserva sus opciones reales (`usuario`, `razon`, `borrar_dias`, `duracion`, `minutos`, `caso`) y los mismos permisos de Discord que el resto de moderación. `/sancionar` y los menús contextuales siguen tal cual.

**Arreglado**
- **Documentación que no coincidía con el bot**: `docs/03-comandos.md` seguía describiendo los comandos *fusionados* (`/musica`, `/diversion`, `/info`, `/paneles`, `/verificacion`, `/estadisticas`, `/enviar`, `/minecraft`) que ya no existen, dejaba los menús contextuales como *undefined* y no listaba `/media` ni `/registrar`. Ahora enumera los comandos reales, el bloque final explica que la fusión está **apagada**, y `docs/10-limites.md` y `docs/05-sanciones-y-moderacion.md` reflejan el límite actual (99/100) y el campo **"Links: dominios que nunca castigan"**.

**Comprobado**
- Registro contra la API de Discord: **103 comandos** (**99 slash + 4 menús contextuales**), **1 plaza libre** de las 100 de Discord, sin esquemas inválidos y **con manejador los 103**.
- Validación pre-despliegue: `extract_cmds.js` + `validate_cmds.py` → OK. `node --check` en `index.js`.

---

**Arreglado**
- **Música: entraba al canal pero no sonaba**. La causa era que en el host **faltaba el binario `yt-dlp`**: sin él el bot no puede obtener la URL de audio, fallaba al vuelo y se saltaba la cola **sin decir nada**. Subido `yt-dlp` (Linux x64, 38 MB, permisos 755, hash verificado) a la raíz del bot. Además, si algo falla ahora **avisa en el canal de texto** con el motivo exacto en vez de fallar callado.
- **`/play` con enlace de Spotify no reproducía**: yt-dlp no puede descargar Spotify (DRM) y devolvía *"The requested site is known to use DRM"*. Ahora se lee el título de la pista con el **oEmbed público de Spotify** y se busca en YouTube (`yt-dlp ytsearch1:` con respaldo a `play-dl`). Probado de extremo a extremo: oEmbed → yt-dlp → ffmpeg → stream OggOpus válido.
- **Timeout automático al pegar un enlace de música**: los dominios de música ya no disparan el anti-links ni la lista blanca de dominios ( Spotify, YouTube, SoundCloud, Apple Music, Tidal, Deezer, Bandcamp, Mixcloud).
- **Barra lateral desordenada**: las categorías que quedaban sueltas (Tickets, Roles, Inscripciones, Música, Confesiones, Servidor MC, Spotify, Premium, Servicios) ahora van dentro de **un único desplegable "🧩 Más funciones"**. Se arregla también el duplicado: Módulos, Permisos, Rescate y Premium se pintaban dos veces (una dentro del grupo y otra suelta).
- **Premium 13/14**: el dueño del bot ya no necesita licencia para nada.

**Añadido**
- **Modo dueño** en la página 💎 Premium (solo el dueño): interruptor que desbloquea las **14/14 funciones** en todos los servidores, incluida *Identidad de marca*; se puede apagar desde el panel si el bot se quiere ofrecer a terceros.
- **Campo editable "Links: dominios que nunca castigan"** en AutoMod (es/en/ru/de), con música y medios sociales por defecto: esos enlaces no activan el castigo de anti-links ni el de lista blanca de dominios.
- **Tarjeta de salud**: ahora muestra `yt-dlp ✓/✗` y el **último error de música**.

**Comprobado**
- Registro **contra la API de Discord** (no solo el código): **95 comandos** (91 slash + 4 contextuales), idénticos a los del código, sin esquemas inválidos, **9 plazas libres** de 100 y **los 95 con manejador**.
- Validación pre-despliegue: `validate_cmds.py` → OK.
- Despliegue SFTP con **SHA-256 verificado** en los 5 archivos + `yt-dlp` (`chmod 755`).
- Pendiente del dueño: **reiniciar el bot** (activa música, modo dueño y barra lateral nueva) y recargar el panel con Ctrl+R.

---

## 30/09/2026 · 01:52

**Arreglado**
- **Música sin ffmpeg en el host**: el instalador de npm del hosting tiene los scripts bloqueados, así que el binario nunca se descargó y `ffmpeg-static` estaba vacío. Subido el binario Linux x64 (ffmpeg 6.1.1, 79.8 MB, perms 755 y verificado por tamaño). Además, si algún día falta, el bot **avisa por el canal de texto** en vez de fallar callado.
- **Procesos zombis de música**: al parar (`/stop`, botón stop, salida por canal vacío) ahora se corta también el proceso ffmpeg y se destruye la conexión con una única función de limpieza central.
- **Errores invisibles**: los `catch {}` vacíos de carga/guardado de datos (equipos, encuestas, sugerencias, sanciones, configs, métricas) ahora dejan constancia en consola y suman al contador de errores visible en el panel.

**Añadido**
- **Tarjeta "Salud del bot"** en el panel (página Servidores, solo dueño): uptime, RAM, versión de Node, servidores, colas de música, timers de eventos, canales temporales, ffmpeg ✓/✗ y contador de errores desde el arranque, con el último error detallado.
- **Botón "🔍 Probar"** junto a "Registrar ahora": compara la lista del código con la **real en Discord** sin registrar nada y te dice exactamente qué falta o sobra.
- **Base de datos más resistente**: `journal_mode=WAL`, `synchronous=NORMAL` y `busy_timeout=5000` — el bot y el panel ya no se bloquean entre sí y desaparece el riesgo de "database is locked".

**Seguridad del panel**
- Cookie de sesión con `sameSite=lax` (protección CSRF).
- **Rate limit** sin dependencias nuevas: 120 req/min por IP en la API del panel y 10 req/min en login y acciones sensibles (registro de comandos).
- `trust proxy` activado para que el hosting no enmascare las IPs reales.
- Caché de estáticos de 5 min (menos carga en el hosting).

**Comprobado**
- Suite de validación de comandos **antes** de subir: 91 slash + 4 contextuales = 95, **9 plazas libres** de 100, sin errores de esquema (el tipo de fallo que bloqueó `/licencia` ya se detecta en local).
- Los 5 archivos modificados subidos por SFTP con **hash SHA-256 verificado** (index, db, server del panel, servers.html, i18n.js).
- Re-verificado contra la API de Discord: **95 comandos en vivo**.
- Pendiente del dueño: **reiniciar el bot** para activar todo (WAL, salud, rate limit, limpieza de música).

---

## 30/09/2026 · 01:00

**Arreglado (causa raíz real del «los comandos no existen»)**
- **El bloque de registro estaba dentro de `loadEvents()`**, fuera del alcance de `cmds`: lanzaba `ReferenceError: cmds is not defined` y el `catch {}` de esa función lo silenciaba. Por eso **no se registraba nada** y tampoco arrancaban el *alias sync*, la vigilancia de redes (alertas tipo Pingcord), los temporizadores premium ni el refresco de contadores. Movido al scope correcto del *ready* y sustituido por un registro que **comprueba la API de Discord** (no solo el código) y repara las diferencias.
- **`/licencia` bloqueaba el registro completo**: la opción `dias` quedó fuera del subcomando `activar` (mezclaba subcomandos con opciones), así que Discord rechazaba el `PUT` con `APPLICATION_COMMAND_OPTIONS_TYPE_INVALID` y **ningún** comando se registraba. Corregido.
- **`saveReg` no existía** en el bloque de arranque (otro `ReferenceError` encadenado): ahora está definido y el estado real se guarda en la base de datos.

**Añadido**
- **Vigilante de comandos**: cada X minutos lee la lista real en Discord y, si algo la borra o la cambia, la vuelve a registrar sola. Configurable en el panel (por defecto 10 min; 0 = apagado).
- **Ajustes de registro en el panel** (página de servidores, solo dueño): auto-registro al arrancar, minutos del vigilante, botón **🔄 Registrar ahora** y detalle de los comandos que **faltaban** o **sobraban** en la última comprobación.

**Comprobado contra la API de Discord (en vivo, no solo el código)**
- Registrados **95 comandos globales** (91 slash + 4 contextuales), incluidos `/media` y `/sancionar` (permiso de moderador, opciones `usuario` y `duracion`).
- **Aviso importante**: los 7 comandos que había registrados antes (`actionbar`, `bossbar`, `announce`, `announceworld`, `donate`, `player`, `reloadplugin`) **no son de HYDRA**: los publica un **plugin de Minecraft que usa el mismo token/aplicación de Discord**. Cada vez que ese plugin arranca, borra los comandos de HYDRA. Conviene darle su propia aplicación; mientras tanto, el vigilante los restaura automáticamente.
- Subido por SFTP con hashes verificados (`index.js`, `dashboard/server.js`, `dashboard/public/servers.html`, `dashboard/public/i18n.js`). **Requiere reiniciar el bot** para que el vigilante y los ajustes del panel entren en vigor (los comandos ya están registrados en Discord, así que `/media` y `/sancionar` funcionan sin reiniciar; puede tardar 5–60 min en propagarse).

---

## 29/09/2026 · 11:40

**Arreglado**
- **Los comandos no se registraban** (`Register error: cmdsFinal is not defined`): el bloque estaba antes de que existiera la lista. Ahora `/media`, `/perfil`, `/resena`, `/factura` y `/registrar` se registran al reiniciar.
- **El dashboard no arrancaba** (`reading 'ownerOnly'`): había un hueco en el SCHEMA. La página daba conexión rechazada.
- **Faltaban 5 intents de Discord**: reaction roles, starboard, votos y registro de baneos estaban rotos en silencio. Añadidos.
- **El Heat no cargaba** (`t is not a function`): el parámetro tapaba a la función de traducción. También se pintaba en blanco si algo fallaba; ahora avisa.
- **El panel se rompía** al abrir Moderación/Gestión (`plainItem is not defined`) y al entrar a cualquier sección (`sec is not defined`).

**Añadido**
- **Rol de donante incluido en perpetua y suscripción**: ahora la perpetua desbloquea 13/14 funciones. La identidad de marca sigue siendo exclusiva de la licencia por marca ($199+/mes).
- **Funciones Premium agrupadas** en 4 desplegables (Comunidad, Moderación y datos, Servicios, Marca) con contador de desbloqueadas.
- **Autorespuestas**: se pueden **editar** las ya creadas, el texto admite **2000 caracteres** (antes 1000) y hay un interruptor para **mencionar o no al autor**.
- **Comando `/registrar`** (solo dueño) y **botón en el panel** para forzar el registro sin reiniciar. El estado queda visible en el panel.

**Comprobado**
- Comandos: **54 slash + 4 contextuales = 58** · matriz de planes: **108/108** · suite completa sin regresiones.

---
## 29/09/2026 · 02:19

**Arreglado (importante)**
- **Los comandos no se registraban.** La consola mostraba `Register error: cmdsFinal is not defined`: el bloque de registro estaba antes de que existiera `cmdsFinal`. Ahora se ejecuta después, así que `/media`, `/perfil`, `/resena` y `/factura` se registran al reiniciar.

**Añadido**
- **Gestión completa de categorías de tickets**: crear, renombrar, modificar y borrar desde el panel (*Tickets → Gestionar categorías*). Cada categoría puede tener **sus propias preguntas**.
- **Preguntas al abrir un ticket**: si la categoría tiene preguntas, sale un formulario antes de crear el canal. Las respuestas se guardan en el ticket.
- **Transcripciones en HTML** además de TXT.
- **Sistema de servicios y freelancers** (Premium, **desactivado por defecto**):
  - Perfil de freelancer: disponibilidad, horario, bio y servicios.
  - **Reseñas con estrellas** (1-5) y nota media.
  - **Comisiones** (crear, marcar pagada o cancelar).
  - **Retiros** de freelancers (aceptar o denegar).
  - **Facturas** con Stripe, PayPal o **QR de cripto**.
- Comandos nuevos: `/perfil`, `/resena` y `/factura`.
- Módulo **Servicios y Freelancers** en el panel, con todo lo anterior.

**Preguntas puestas en cada categoría**
| Categoría | Preguntas |
|---|---|
| Soporte General | ¿En qué te ayudamos? |
| Soporte Bugs | ¿Qué fallo encontraste? · ¿Cómo se puede reproducir? |
| Reportes Jugador | ¿Quién es el jugador? · ¿Qué hizo? |
| Soporte Tienda | ¿Sobre qué compra es? · ¿Tienes captura de la compra? |
| Soporte Cuenta | ¿Cuál es tu usuario? · ¿Qué problema tienes? |
| Soporte Apelaciones | ¿Qué sanción apelas? · ¿Por qué crees que es injusta? |
| Reportes Staff | ¿Quién es el miembro del staff? · ¿Qué hizo? |
| Patrocinar | ¿Qué propones? · ¿Tienes experiencia? |

**Comprobado**
- Categorías: **12/12** · tablas nuevas: **20/20** · registro: **8/8**.
- Comandos: **54 slash + 4 contextuales = 58** (**268/268**).
- Suite completa sin regresiones: motor 98, panel/bot 54, ayudas 100, i18n 0 pendientes.

---
## 29/09/2026 · 00:30

**Añadido**
- **Comando `/media`**: muestra los requisitos para entrar al equipo Media en un embed con un campo por rango.
  - Todo editable desde el panel (*Gestión → Mensajes del bot*): activar el comando, título, intro, rangos, cómo se entra, pie y color.
  - **Regla del `#`**: cada línea que empiece por `#` es un rango y las demás son sus requisitos. Añadir un rango nuevo es una línea más.
  - **Vista previa en vivo**: `http://37.27.54.248:25269/preview-media.html` — se edita el texto y se ve el resultado al momento, sin reiniciar el bot.
- **Distintivo 💎 Premium** en la cabecera de cada sección, para ver de un vistole qué es de pago.
- **Niveles de permiso y Rescate** ahora van plegados dentro de su grupo en el menú, en vez de sueltos.

**Arreglado (importante)**
- **Faltaban intents de Discord.** El bot escuchaba `MessageReactionAdd`, `MessageReactionRemove` y `GuildBanAdd`, pero no tenía `GuildMessageReactions`, `GuildModeration`, `GuildBans`, `GuildInvites` ni `GuildScheduledEvents`. Sin ellos Discord no envía esos eventos, así que **los listeners nunca se ejecutaban**: reaction roles, starboard, los votos de las sugerencias y el registro de baneos estaban rotos en silencio. Añadidos los 5 intents y los partials `Message`, `Reaction`, `User` y `GuildMember`.
- El bloque **«¿Cómo se entra?» salía duplicado** en el embed de `/media`: el texto por defecto ya llevaba la cabecera y el código la añadía otra vez. Ahora es idempotente.
- Los **textos de ayuda** eran párrafos largos en cajas pequeñas. Ahora son una línea, con el detalle en el modal.
- `+30 viewers de media` → **«+30 viewers de media por directo»** y `Calidad HD` → **«Calidad HD (720p o más)»**, para que se entienda.

**Comprobado**
- Comandos: **51 slash + 4 contextuales = 55**, dentro del límite de 100 (**268/268** comprobaciones).
- `/media`: **37/37** · duplicado: **15/15** · licencias: **24/24**.
- Suite completa sin regresiones: motor 73, planes 76, base de datos 13, ayudas 99, enrutado 45, interfaces y acceso 0 fallos, i18n 0 pendientes.

**Pendiente de ti**
- **Reiniciar el bot** en el panel del host: hasta entonces `/media` no aparece y los intents nuevos no están activos.
- **Un token de GitHub** para arreglar el repositorio del hosting y subir todo.
- Las 3 decisiones del texto de `/media` (cómo se entra, de dónde son los 30 viewers, qué es HD) — hay valores por defecto editables.

---
## 28/09/2026 · 21:17

**Seguridad**
- `/licencia activar` y `/licencia quitar` son **solo del dueño del bot**. Antes cualquier
  usuario con permiso de «Gestionar servidor» podía escribir una clave inventada y
  activarse la licencia por marca de forma gratuita: el comando no comprobaba la clave
  contra nada y dejaba elegir el plan y la duración. Ahora pide la clave al dueño y avisa
  de que en breve se automatizará con el pago.
- La clave tiene que empezar por `HYDRA-` y el plan se valida contra la lista real de planes.
- El ID del dueño se lee de la variable `BOT_OWNER_ID`, así que ya no hay que editar el
  código para cambiarlo.

**Arreglado**
- El aviso `Supplying "ephemeral" ... is deprecated` que llenaba la consola: los **425**
  sitios usan ya `flags: MessageFlags.Ephemeral`. Verificado con un parser de JavaScript:
  509 respuestas efímeras antes, 509 ahora, ningún indicador perdido.
- El manejador de interacciones (más de 6 000 líneas) está protegido con `try/catch`: si
  algo falla, el usuario recibe un aviso y el error completo queda en la consola.
- Ya no se escribe un `console.log` en cada clic. Se activa con `DEBUG_INTERACTIONS=1`.
- `/bot reiniciar` y `/bot apagar` **decían «reiniciado» sin haberlo hecho**: usaban `pm2`,
  que no existe en este hosting, y el error se tragaba. Ahora avisa de que hay que usar el
  botón del panel de hosting.
- El heat se quedaba en «Cargando…» en la página Premium. Ahora pinta al instante y avisa si
  algo falla, en vez de quedarse en blanco.
- El panel **avisa de los errores de JavaScript** con una banda roja: antes eran invisibles.
- `GET /api/bot` exigía inicio de sesión. Las otras 57 rutas ya lo exigían.
- `deleteGuild` no limpiaba los interruptores Premium del servidor.

**Revisión**
- 45/45 subcomandos de los 9 comandos fusionados llegan a su manejador.
- 37/37 rutas del panel existen en el servidor · 75/75 botones con su función.
- 75 funciones de base de datos existen · 0 fugas de datos entre servidores · 0 inyección SQL.
- Comparado con MEE6, Dyno y Carl-bot: HYDRA tiene las 13 funciones importantes. Faltan la
  respuesta personalizada al disparar un filtro, la lista negra de invitaciones, el XP por
  canal y `/diagnose`.

---
## 28/09/2026 · 10:37 – 11:07

**Añadido**
- **Panel 💎 Premium por servidor**, todo dentro de desplegables y ya fuera del resto de módulos:
  - **Interruptor individual** en cada función Premium (encendido/apagado) para que puedas dejar una función comprada desactivada en un servidor concreto.
  - Emisión y revocación de licencias, lista de claves activas con su fecha de caducidad, identidad de marca (nombre, color, icono y pie) y lista de temporizadores, mensajes de entrada/salida y contadores ya creados, con opción de borrarlos.
  - Desplegable de **opciones de las funciones Premium**: imagen de bienvenida generada (canal, nombre, subtítulo y color de acento), textos de entrada y de salida, intervalo de refresco de los contadores, restauración de roles y rol de donante.
- **Funciones Premium nuevas**: contadores en vivo (miembros, en línea, en voz y bots), mensajes de entrada y salida por canal, temporizadores programados, métricas de uso de comandos por día e imagen de bienvenida generada por el bot.
- **Heat (escalado por reincidencia)** pasa a ser Premium y se configura desde su propia página, no desde AutoMod.
- **Rol de donante**: con el plan de donante, el bot entrega el rol que elijas a cada miembro al entrar.
- Nuevos comandos: `/licencia`, `/metricas`, `/contador`, `/mensaje` y `/temporizador`.
- **Ayudas mucho más completas**: el botón **ⓘ Qué hace** ahora explica cada bloque y cada campo con su descripción real, un **ejemplo de configuración** y el contexto del módulo, en lugar de frases genéricas. Los 40 módulos tienen su propia explicación extendida.

**Arreglado**
- `welcomeImageMode` se activaba pero la imagen nunca se publicaba: el bot leía un canal y un subtítulo con nombres distintos a los que guardaba el panel. Ahora los dos lados usan las mismas claves.
- El interruptor de restauración de roles aparecía en el panel pero el bot no lo leía. Ahora funciona y se respeta el plan.
- Los contadores ya no crean y borran un webhook en cada actualización: reutilizan el mensaje publicado y, si desaparece, guardan el webhook para no multiplicarlos. El contador de «en línea» ya no depende de la caché local y se refresca solo cada 5 minutos.
- Los temporizadores programados se detienen si la licencia caduca o apagas su interruptor.
- `/metricas`, `/contador`, `/mensaje` y `/temporizador` comprueban ahora que quien los usa tenga permiso de gestión del servidor.
- La lista de funciones Premium ya no informaba mal de qué funciones dispone cada servidor.
- Traducciones **ES/EN/RU/DE completas**: 0 claves pendientes en los cuatro idiomas.
- La ayuda de cada ajuste **no se mostraba**: el botón ⓘ buscaba su bloque con un nombre distinto del que tenía escrito, así que los 293 campos caían en el texto genérico.
- Los ajustes del desplegable **Premium** no encontraban su etiqueta y su botón ⓘ habría mostrado el nombre interno del ajuste (por ejemplo `welcomeImageMode`) en vez de «Canal donde se publica la imagen».
- Dos textos de ayuda que nunca llegaban a mostrarse.
- Faltaba la explicación de cuatro módulos: **Invitaciones, Gestión de eventos, Gestión de equipos y Permisos de comandos**.

**Comprobado**
- Auditoría automática del motor Premium: **73/73** comprobaciones correctas (features declaradas frente a las usadas, planes coherentes, endpoints del panel existentes en el servidor, interruptores presentes).
- Prueba de la matriz de planes y funciones: **76/76**. El plan de donante no desbloqueaba nada; ahora sí.
- Prueba de la base de datos de licencias e interruptores: **13/13**, sin mezclar servidores.
- Comandos: **50 slash + 4 menús contextuales = 54**, dentro del límite de 100 de Discord, sin nombres duplicados y con todas las descripciones válidas (**265/265**).
- Cruce entre el panel y el bot: **36/36**, ningún ajuste del panel queda sin efecto.
- Ayudas: **97/97**. El render simulado de los tres modales (módulo, bloque y campo) sobre los **293 ajustes** reales no encuentra textos vacíos, `undefined`, `NaN` ni claves internas.
- Los **40 módulos** visibles del panel tienen su propia explicación extendida (antes quedaban 4 sin ella).

---

## 28/09/2026 · 03:55

**Añadido**
- **Fusión de comandos**: 85 → **49 comandos** liberando 36 huecos de los 100 que ofrece Discord. Ahora las funciones similares comparten un comando con subcomandos:
  - `/musica` reproduce · pausar · seguir · detener · saltar · cola · sonando · volumen · repetir
  - `/diversion` meme · azar · ship · dado · clima · traducir · cuenta_regresiva · recordatorio · momo
  - `/info` avatar · usuario · canal · servidor · boosters · roles
  - `/minecraft` estado · detalle · skin · perfil · nick · prediccion
  - `/redes` enlace · ver · tweet
  - `/verificacion` panel · captcha
  - `/enviar` anuncio · mensaje
  - `/estadisticas` usuario · tabla
  - `/paneles` tickets · reactions · rangos · respuestas · sticky · tempvoice
- **Página 💎 Premium** en el panel con los planes y precios: licencia perpetua **$54.99**, suscripción **$4.99/mes**, boost **+$2.99**, donativo **$3.99+** y licencia por marca **$199–$999/mes** con explicación de qué es un boost y qué es la licencia por marca.
- Documento nuevo **Premium** con los precios fijos, el rango por tamaño de comunidad y preguntas frecuentes.

**Arreglado**
- El botón **ⓘ Qué hace** ya no muestra claves internas como `g_state_d`: ahora explica qué hace el ajuste.
- El registro de comandos detecta por sí solo cuándo cambia la lista (huella) y la registra al reiniciar, sin depender de `SKIP_REGISTER`.

**Repositorio**
- Creado el repositorio de código `hydra-bot-source` (privado) para el despliegue.
- Borrado `Bot-Hosting`, que estaba **vacío** (sin ninguna rama), por eso el despliegue automático del hosting fallaba.

---

## 28/09/2026 · 03:20

**Añadido**
- Botón **ⓘ Qué hace** en cada ajuste del panel, colocado junto al botón **{} Variables**. Explica en una línea para qué sirve ese ajuste, sin listas interminables.
- Botón **ⓘ Qué hace** en la cabecera de cada bloque y de cada módulo, con una explicación breve.
- Panel de estado de módulos en el **Resumen**: cada función real del bot con `● Activo` o `x/y ajustes`, filtrable y clicable.
- **Canal único de sanciones (embed)**: en el registro de sanciones se elige un canal donde se publica el panel completo de todas las sanciones (usuario, tipo, razón, pruebas, tiempo, moderador y caso).
- Registro de sanciones con **búsqueda**, filtro por tipo, contador y **exportación CSV / TXT**.

**Cambiado**
- El registro de comandos ahora es **autorreparable**: compara una huella de la lista de comandos y la registra sola al reiniciar cuando ha cambiado. Ya no depende de `SKIP_REGISTER`.
- El botón de información ahora tiene el mismo aspecto que el de variables y explica solo su función.

**Arreglado**
- El resumen mostraba una fila de módulo sin nombre y un estado de "moderación" que no existe (el módulo real es AutoMod).
- Los módulos propios del panel (Estado de módulos, Niveles, Rescate) ya aparecen en el menú lateral.

---

## 28/09/2026 · 01:05

**Añadido**
- **`/sancionar`**: un único comando para todas las sanciones, con selector de tipo (advertencia, aislar, expulsar, softban, ban temporal, ban permanente, levantar baneo, quitar advertencia).
- Panel de sanción con motivo obligatorio, **¿hay pruebas?** y enlace de pruebas.
- Menú contextual de moderación: clic derecho → Advertir, Aislar, Expulsar, Banear.
- Niveles de permiso jerárquicos, interruptor maestro por módulo, rescate con clave de un solo uso y co-propietarios.
- Escalado de castigos con **heat** (puntos que suben con la reincidencia y bajan con el tiempo).
- Opciones por comando: activar/desactivar, alias, canales permitidos y bloqueados, y auto-borrado de mensajes.
- Avisos de directos y vídeos (YouTube, Twitch, Kick).

**Eliminado**
- `/ban`, `/tempban`, `/kick`, `/softban`, `/warn`, `/timeout`, `/unban` y `/delwarn`: todo pasa por `/sancionar` y el menú contextual. Se liberan plazas del límite de 100 comandos de Discord.

**Nota**
- Comandos registrados: **85** (81 slash + 4 menús contextuales) de un máximo de 100.

---

## 27/09/2026 · 23:40

**Añadido**
- **Guía de uso completa** del bot en el repositorio de documentación, con referencias de comandos, funciones y ajustes.
- Organización completa del panel: cada módulo en tarjetas por tema, con índice, buscador, abrir/cerrar todo y aviso de cambios sin guardar.
- Asistente de configuración con progreso real y mapa de módulos en el resumen.

**Arreglado**
- El contador de reacciones de los sorteos ya no se duplica al reconectar.
- Los enlaces de auto-borrado se limpian de forma ordenada.
