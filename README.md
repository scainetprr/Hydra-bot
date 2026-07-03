# 🤖 Captcha Bot - Discord Verification Bot

Bot de Discord con sistema de captcha para verificación de miembros.

## Características

- ✅ Asigna rango "No Verificado" automáticamente al entrar
- 🔐 Sistema de captcha con imagen generada dinámicamente
- ✅ Al verificar: agrega "Verificado" y quita "No Verificado"
- 📨 Envía DM de bienvenida con instrucciones
- 🎨 Slash commands para configurar el panel

## Setup

### 1. Crear Bot en Discord

1. Ve a https://discord.com/developers/applications
2. Click "New Application" → Nombre: `Captcha Bot`
3. Ve a "Bot" → Click "Reset Token" → Copia el token
4. Activa "Server Members Intent" y "Message Content Intent"
5. Ve a "OAuth2" → "URL Generator"
6. Selecciona scopes: `bot`, `applications.commands`
7. Selecciona permisos: `Manage Roles`, `Send Messages`, `Use Slash Commands`
8. Copia la URL y abre en el navegador para agregar el bot

### 2. Crear Rangos en tu Servidor

1. Ve a Configuración del servidor → Roles
2. Crea rango **"No Verificado"** (color rojo, sin permisos especiales)
3. Crea rango **"Verificado"** (color verde, con permisos de chat)
4. **IMPORTANTE**: El rango del bot debe estar POR ARRIBA de ambos rangos

### 3. Configurar Variables de Entorno

Copia `.env.example` a `.env` y llena:

```bash
cp .env.example .env
```

```env
TOKEN=tu_token_de_discord
GUILD_ID=id_del_servidor
ROLE_VERIFIED=id_rango_verificado
ROLE_UNVERIFIED=id_rango_no_verificado
CHANNEL_VERIFICATION=id_canal_verificacion
```

**Cómo obtener los IDs:**
- Activa "Modo Desarrollador" en Discord (Ajustes → Avanzado)
- Click derecho en servidor/rango/canal → "Copiar ID"

### 4. Instalar y Ejecutar

```bash
npm install
npm start
```

### 5. Configurar el Panel

En Discord, escribe:
```
/setup-verification
```

Esto envía el embed con el botón de verificación al canal.

## Hosting Gratis

### Opción 1: Render (Recomendado)
1. Ve a https://render.com
2. "New" → "Background Worker"
3. Conecta tu repositorio de GitHub
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Agrega las variables de entorno
7. ¡Listo!

### Opción 2: Railway
1. Ve a https://railway.app
2. "New Project" → "Deploy from GitHub"
3. Agrega las variables de entorno
4. Deploy

### Opción 3: Koyeb
1. Ve a https://koyeb.com
2. Create App → Docker
3. Conecta tu repo con el Dockerfile
4. Agrega variables de entorno

## Comandos

| Comando | Descripción |
|---------|-------------|
| `/setup-verification` | Envía el panel de verificación |
| `/captcha-test` | Prueba el sistema (solo admins) |

## Estructura

```
captcha-bot/
├── index.js          # Código principal del bot
├── package.json      # Dependencias
├── .env.example      # Plantilla de variables
├── .env              # Tus variables (no subir a git)
├── Dockerfile        # Para hosting con Docker
└── README.md         # Esta documentación
```

## Solución de Problemas

**El bot no responde:**
- Verifica que el token sea correcto
- Asegúrate de que los intents estén activados

**No puede asignar rangos:**
- El rango del bot debe estar POR ARRIBA de "No Verificado" y "Verificado"
- El bot necesita permiso "Manage Roles"

**El captcha no aparece:**
- Verifica que `canvas` se instaló correctamente
- En Linux puede necesitar: `apt install build-essential libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev librsvg2-dev`
