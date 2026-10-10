# Changelog

Todas las novedades relevantes del bot. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [10/10/2026] — 08:25

### Corregido (Música · YouTube no reproducía)
- **Clientes de yt-dlp modernos**: fuera `android_vr` (403 en yt-dlp 2026.08) y `tv_embedded` (eliminado); entran `visionos` + `web_embedded` + `android`, con `--js-runtimes node` para los desafíos JS.
- **YouTube se intenta siempre**: sin proxy ya no se salta directo a SoundCloud; SoundCloud queda como respaldo.
- **«YouTube bloqueado» solo si fallan todos los clientes** (antes un fallo puntual bloqueaba YouTube 5 min).
- **Tope de 120 s** en la resolución de audio: la cola ya no puede quedarse muda sin aviso.

### Añadido (Panel)
- **«🎵 Probar música»** en la tarjeta *Salud del bot*: prueba real de audio de YouTube con yt-dlp + sonda, versión del binario y resultado. La última prueba queda guardada.

---

## [10/10/2026] — 02:25

### Corregido (Panel · Premium)
- **Texto roto en «Modo dueño activo»**: «Desbloquear todo Premium para el dueño» salía partido en líneas diminutas apiladas porque el `<label>` completo llevaba la clase `pmsw` (dimensiones 42×23 px del switch). La clase ahora va solo en el interruptor.

---

## [10/10/2026] — 01:35

### Corregido (Música)
- **Dos `/play` seguidos ya no dejan la cola muda sin aviso**: bandera `busy` que impide lanzar dos reproducciones a la vez (antes pisaban el player entre sí), y el error de cada canción se avisa **siempre** en el canal, aunque queden más canciones en la cola.

### Corregido (Panel)
- **El ⓘ de cada campo ya no muestra el ejemplo equivocado**: el ejemplo genérico de bienvenida aparecía en campos como «Webhook de changelogs». Ahora cada campo con ayuda propia muestra solo su descripción; los ejemplos genéricos solo aparecen en campos sin ayuda específica.

---

## [10/10/2026] — 00:15

### Corregido (Música)
- **SoundCloud como respaldo directo cuando YouTube bloquea la IP**: el bot salta a SoundCloud sin gastar ~30 s en instancias Invidious públicas caídas.
- **Reintento con consulta corta**: si el título completo del vídeo de YouTube no casa, se reintenta con las 3 palabras más largas del título.
- **Búsqueda de texto libre directo a SoundCloud** cuando YouTube está bloqueado.
- **Metadatos sin Invidious si YouTube está bloqueado**: usa oEmbed (instantáneo) en vez de esperar ~28 s de timeouts.
- **Diagnóstico ampliado** (8 notas): el fallo de SoundCloud ya no queda oculto en el canal.

---

## [09/10/2026] — 21:19

### Corregido (Música)
- **El error ya explica qué falló**: si no hay audio, el canal lista cada fuente probada y su motivo (YouTube bloqueado, Invidious caído, SoundCloud solo con remezclas…), y el "Reproduciendo ahora" indica la fuente usada.
- **SoundCloud deja de elegir remezclas**: reconoce *remix/cover/edit* como otra canción; si no está la original, no reproduce nada. Si solo hay una vista previa oficial de 30 s, la reproduce y lo avisa.
- **Invidious pide el audio con `local=true`** (servido por la instancia): antes entregaba URLs de googlevideo que el host no puede descargar por el bloqueo de IP.

---

## [08/10/2026] — 21:45

### Corregido (Música)
- **La cola ya no se queda muda**: cada URL de audio se sondea (`Range` + UA) antes de pasársela a ffmpeg; si el origen devuelve 403/404 o HTML, se descarta y se prueba la siguiente fuente (yt-dlp → play-dl → Invidious → SoundCloud).
- **ffmpeg recibe User-Agent y Referer** (y `-http_proxy` si hay proxy HTTP en el panel), en lugar de peticiones con cabeceras por defecto que algunos CDN rechazan.
- **Diagnóstico en consola y en canal**: watchdog de 12 s sin datos (aviso con el host de origen), primeras líneas de `ffmpeg.stderr` siempre visibles y un 403 de googlevideo marca a YouTube como bloqueado 5 min.

---

## [08/10/2026] — 19:42

### Arreglado (Comandos Premium)
- **Restituidos `/metricas`, `/contador`, `/mensaje` y `/temporizador`**: sus builders habían desaparecido del array de comandos, así que no se registraban en Discord aunque tenían manejador, documentación y su interruptor Premium en el panel. Reconstruidos con el esquema exacto ya registrado.
- Recuento: **104 comandos = 100 slash + 4 menús contextuales (límite de 100 slash exacto, 0 plazas libres)**. Docs `03-comandos.md` y `10-limites.md` actualizadas.
- Verificado con `extract_cmds.js` + `validate_cmds.py`: VALIDACION OK.

---

## [08/10/2026] — 19:09

### Arreglado (Música · YouTube bloquea la IP del host)
- **Clientes de reproductor**: yt-dlp lanza `player_client=android_vr,android,tv_embedded,web_embedded` en una sola invocación y, si falla, reintenta cliente a cliente (ante un bloqueo por IP no insiste).
- **Invidious como vía principal cuando la IP está bloqueada**: búsqueda (`invidiousSearchFirst`), metadatos (`invidiousVideoMeta`) y audio (`getInvidiousAudioStream`) se piden a una instancia pública que consulta YouTube **desde su IP** → suena **la canción original exacta**. Instancia verificada: `invidious.f5.si` (HTTP 206, audio WebM). La lista se refresca sola cada 6 h desde el directorio oficial.
- **Respaldo en SoundCloud** (activado por defecto): si no hay instancia viva, busca el título en SoundCloud, puntúa los resultados y descarta coincidencias débiles; sirve para enlaces de YouTube, Spotify y texto libre.
- **Metadatos por oEmbed** como último dato disponible.
- **Memoria de bloqueo de 5 min**: tras el error *"Sign in to confirm you're not a bot"* no se reintenta YouTube en cada canción.
- **Anti-links ya no castiga a usuarios por un bloqueo de YouTube**: `isYouTubeMusicLink()` falla abierto si no puede verificar.
- **Mensaje accionable** en el canal cuando el fallo es un bloqueo por IP.

### Añadido (Panel → Música)
- **Proxy para yt-dlp** (`musicProxy`): se aplica a todas las llamadas de yt-dlp; con proxy se ignora el bloqueo temporal.
- **Respaldo en SoundCloud** (`musicSoundcloudFallback`): interruptor on/off.

### Mejorado
- Orden de resolución de audio: **yt-dlp → play-dl → Invidious → SoundCloud → error con consejo**.

---

## [08/10/2026] — 17:30

### Arreglado (Música)
- **YouTube "Sign in to confirm you're not a bot"**: prioridad a `play-dl` (`play.video_info` + `play.stream`) que usa cliente interno de YouTube (`youtubei.js`) y evita la detección de bots; fallback a yt-dlp con args Android/Web Embedded + geo-bypass; fallback final a `play-dl` stream.
- **Nuevas fuentes en `/play`**:
  - **SoundCloud URLs**: resueltas nativamente por yt-dlp.
  - **Apple Music URLs**: resueltas nativamente por yt-dlp.
  - **Spotify URLs**: ya funcionaban (oEmbed → búsqueda YouTube).
  - **Texto libre**: búsqueda en YouTube con play-dl + fallback yt-dlp.

### Mejorado
- Orden de prioridad unificado: play-dl primero para YouTube, yt-dlp para SoundCloud/Apple Music, play-dlp fallback final.

---

## [08/10/2026] — 16:45

### Añadido
- **Módulo Webhooks** (`webhooks`): configura el webhook de changelogs desde el panel → Utilidades → Webhooks.
- **Módulo Promociones** (`promociones`): descuentos % por plan (Perpetua, Sub, Boost, White, Donante) con fechas ISO, código y nota. Comando **`/promocion ver|activar|desactivar`**.
- **Sidebar**: `webhooks` en **Utilidades**, `promociones` en **Gestión**.

---

## [08/10/2026] — 15:30

### Arreglado
- **Premium 13/14 → 14/14**: el dueño del bot ahora tiene todas las funciones Premium desbloqueadas sin licencia (interruptor "Modo dueño" en la página 💎 Premium, activado por defecto).
- **Enlaces de Spotify/YouTube bloqueados por error**: el campo `antiLinkAllowDomains` ahora se rellena siempre con su valor por defecto aunque la config guardada traiga cadena vacía; los dominios de música nunca disparan el anti-links ni la lista blanca.
- **Música sin sonido / error callado**: el bot ahora informa en el canal de texto si falla al obtener el audio (falta `yt-dlp`, ffmpeg, error de stream, etc.) en lugar de entrar al canal y quedarse mudo.

### Mejorado
- **Barra lateral**: módulos sueltos (Tickets, Roles, Inscripciones, Música, Confesiones, Servidor MC, Servicios) agrupados en sus grupos lógicos — desaparece el desplegable "🧩 Más funciones" salvo búsqueda.
- **Configuración robusta**: `getGuildConfig` rellena automáticamente claves críticas con su valor por defecto si la BD trae cadena vacía.

### Comprobado
- Sintaxis OK (`node --check` en `index.js`, `dashboard/server.js`, `dashboard/public/guild.js`).
- Despliegue SFTP con SHA-256 verificado en 5 archivos + `yt-dlp` Linux x64 presente en el host.

## [No publicado] — En desarrollo

### Añadido
- **Comandos de sanción clásicos restaurados**: `/ban`, `/tempban`, `/kick`, `/softban`, `/warn`, `/timeout`, `/unban` y `/delwarn`. Sus manejadores ya existían pero no tenían comando publicado; ahora vuelven con sus opciones originales y sus permisos. Total: **99 slash + 4 menús contextuales** (1 plaza libre de 100).
- **Modo dueño en 💎 Premium**: interruptor (solo el dueño) que desbloquea las **14/14 funciones** sin licencia, incluida *Identidad de marca*; se apaga desde el panel si el bot se ofrece a terceros.
- **Campo "Links: dominios que nunca castigan"** en AutoMod (es/en/ru/de): dominios de música y medios que nunca activan el anti-links ni la lista blanca de dominios.
- **Salud del bot**: muestra `yt-dlp ✓/✗` y el último error de música.
- **Barra lateral**: todas las categorías sueltas reunidas en un único desplegable **"🧩 Más funciones"**.

### Corregido
- **Música sin sonido (entraba al canal y no reproducía)**: faltaba el binario `yt-dlp` en el host; el bot fallaba al obtener el audio y se saltaba la cola sin avisar. Subido `yt-dlp` (Linux x64, 38 MB, 755) y ahora los errores se comunican **en el canal de texto**.
- **`/play` con enlace de Spotify**: yt-dlp no puede descargar Spotify (DRM). Se resuelve con el oEmbed público de Spotify + búsqueda en YouTube, con respaldo a `play-dl`.
- **Timeout automático al pegar un enlace de Spotify/YouTube**: los dominios de la lista "nunca castigan" ya no disparan el castigo de enlaces.
- **Barra lateral**: desaparece el duplicado de Módulos / Permisos / Rescate / Premium (se pintaban dentro del grupo y otra vez sueltos).
- **Tarjeta "Salud del bot"** (solo dueño): uptime, RAM, colas de música, timers, ffmpeg y contador de errores del proceso, en la página de servidores. Incluye botón "🔍 Probar" que compara los comandos del código con los **reales en Discord** sin registrar nada.
- **Base de datos WAL** (`journal_mode`, `busy_timeout`): el bot y el panel ya no se bloquean entre sí.
- **Rate limit en el panel** (120 req/min por IP; 10/min en login y acciones sensibles) y cookie con `sameSite=lax`.
- **Vigilante de comandos**: comprueba cada X minutos la lista **real** en la API de Discord y la vuelve a registrar si algo la borra (por ejemplo, otro programa usando el mismo token). Configurable en el panel: auto-registro al arrancar y minutos del vigilante (0 = apagado), con el detalle de los comandos que faltaban o sobraban.
- **Botón ⓘ en cada bloque, sección y comando**: un modal explica qué hace cada tarjeta de ajustes, cada módulo y cada comando (incluidos subcomandos, parámetros y opciones de permiso).
- **`/sancionar` unificado**: un solo comando para todas las sanciones con **selector de tipo** (advertencia, aislar, expulsar, softban, ban temporal, ban permanente, levantar baneo, quitar advertencia).
- **Panel de sanción completo**: motivo obligatorio, ¿hay pruebas? y enlace; devuelve un embed con usuario, tipo, razón, pruebas, tiempo, moderador y caso, y lo publica en el canal de sanciones.
- **Canal único de sanciones (embed)**: en el panel se elige un canal donde se publica el panel completo de *toda* sanción, con reserva al canal por tipo o al modlog.
- **Registro de sanciones con búsqueda y exportación**: buscador en vivo, filtro por tipo, contador y descarga **CSV** (UTF-8 con BOM) y **TXT**.
- **Menú contextual de moderación**: clic derecho sobre un usuario → Advertir / Aislar / Expulsar / Banear, con el mismo panel y pruebas.
- **Niveles de permiso jerárquicos**: crea niveles, asígnales roles y concede módulos; con lista de niveles activos.
- **Rescate y propiedad**: clave de un solo uso (24 h), co-propietarios, rol que se entrega al usarla y revocación desde el panel.
- **Escalado de castigos con heat**: heat por infracción, decaimiento en el tiempo y escalera de castigos configurable.
- **Interruptor maestro por módulo**: enciende o apaga grupos enteros de funciones (comandos, botones y menús).
- **Opciones por comando**: activar/desactivar, alias, canales permitidos y bloqueados, y auto-borrado (invocación, respuesta a los N segundos y al borrar el original).
- **Canales vigilados tipo PingCord**: directos y vídeos de YouTube, Twitch y Kick con alertas, roles mencionables y botón de prueba.
- **Asistente de configuración** con progreso real, **mapa de módulos** y reorganización completa de cada página en tarjetas por tema con buscador, abrir/cerrar todo y aviso de cambios sin guardar.
- **Estado real de cada módulo** en el resumen (`● Activo` o `x/y ajustes`), filtrable y clicable.

### Cambiado
- La **fusión de comandos queda apagada** (`MERGE_GROUPS` se conserva por si hace falta liberar huecos): cada función tiene su propio comando. `/ban`, `/tempban`, `/kick`, `/softban`, `/warn`, `/timeout`, `/unban` y `/delwarn` vuelven a existir junto a `/sancionar`.
- La web pasa a 4 idiomas también en las nuevas secciones (ES/EN/RU/DE).
- El panel ahora agrupa los 222 ajustes en tarjetas por tema con explicación integrada, en lugar de una lista larga.

### Corregido
- **Música sin ffmpeg en el host**: el instalador de npm del hosting bloquea scripts y el binario nunca existió. Subido manualmente (Linux x64) y, si vuelve a faltar, el bot avisa por el canal en vez de fallar en silencio. La limpieza de colas ahora también corta el proceso ffmpeg (sin procesos zombis).
- **Errores tragados en silencio**: los `catch {}` vacíos de carga/guardado de datos ahora dejan constancia y se reflejan en la salud del panel.
- **Los comandos no se registraban (causa raíz)**: el bloque de registro había quedado dentro de `loadEvents()`, fuera del alcance de `cmds`, y su `ReferenceError` lo tragaba el `catch {}`. Además de no registrar nada, impedía que arrancaran el alias sync, las alertas de redes, los temporizadores y los contadores. Movido al scope correcto del *ready* y reescrito para verificarse contra la API.
- **`/licencia` rompía el registro completo**: la opción `dias` quedó fuera del subcomando `activar` y Discord rechazaba todo el `PUT` (`APPLICATION_COMMAND_OPTIONS_TYPE_INVALID`).
- **`saveReg` no estaba definido** en el bloque de arranque (segundo `ReferenceError`).
- Los módulos propios del panel (estado de módulos, niveles, rescate) ya aparecen en la barra lateral y en el buscador.
- El resumen mostraba una fila de módulo vacía y un estado de "moderación" inexistente.
- El tipo de reacción del contador de sorteos ya no se duplica al reconectar.
- Los enlaces de auto-borrado se limpian de la base de datos cada hora.

## [Base inicial]

- Bot multifunción con panel web multi-servidor, base de datos SQLite, moderación, comunidad, música, Minecraft y utilidades.
