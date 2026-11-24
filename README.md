# Cortex · versión de prueba

Editor de clips con IA. La página funciona en el navegador de cada persona (sus vídeos no se suben); el servidor solo
sirve la página, hace de puente con Gemini para que nadie tenga que poner su propia clave y descarga
los vídeos de los enlaces (Kick, Twitch, YouTube, TikTok…) con yt-dlp. El `Dockerfile` instala yt-dlp y ffmpeg.

## Variables (Railway → Variables)

| Variable | Obligatoria | Qué es |
|---|---|---|
| `GEMINI_KEY` | sí | Clave de Gemini. Solo vive en el servidor. |
| `ADMIN_PASSWORD` | sí | Contraseña del panel (`/panel`), donde se dan de alta los clippers y se ven sus clips. |
| `LIMITE_POR_PERSONA` | no | Peticiones a la IA por persona y día (150). |
| `LIMITE_TOTAL` | no | Peticiones a la IA de todos por día (5000). |
| `DESCARGAS_POR_PERSONA` | no | Enlaces que puede descargar cada persona al día (40). |
| `DESCARGAS_A_LA_VEZ` | no | Descargas simultáneas en el servidor (3). |
| `MINUTOS_MAX` | no | Duración máxima del vídeo de un enlace (15). |
| `MB_IA_POR_PERSONA` / `MB_IA_TOTAL` | no | Megas de vídeo/audio que se mandan a Gemini por persona y por día (400 / 3000). |
| `MIN_VOZ_POR_PERSONA` / `MIN_VOZ_TOTAL` | no | Minutos de subtítulos con ElevenLabs por persona y por día (60 / 600). |
| `ELEVENLABS_KEY` | no | Clave de ElevenLabs para los subtítulos en la nube. |
| `CORTEX_APP_TOKEN` | no | Clave con la que la app de escritorio baja las actualizaciones de `/app/` (si se cambia, hay que cambiarla también en la app). |

Arranca con `npm start`. `GET /healthz` responde `{"ok":true}` si el servidor está vivo. El uso de hoy se ve en el panel.

La IA de la web solo deja usar los modelos «flash» de Gemini (los baratos); los demás se contestan como si no existieran.

## Cómo está hecho Cortex (src/) y cómo se monta

Cortex se entrega como **un solo archivo HTML**, pero se edita por piezas en `src/`:

- `src/pagina/` — cabecera, letras, el cuerpo de la página y sus bloques de texto.
- `src/estilos/estilos.css` — todos los estilos.
- `src/js/NNN-tema.js` — el código, partido por temas en el orden en que va (el número es el orden).
- `src/librerias/` — mp4-muxer y MP4Box (van dentro para exportar sin internet).
- `src/grabador/clipzi_grabador.py` — el grabador (va dentro de la página y también suelto).
- `src/orden.json` — en qué orden se juntan las piezas.

Las líneas que solo van en la web o solo en el PC están entre `@@solo-web` / `@@solo-pc` y `@@fin`.

`node build.js` junta las piezas y escribe:

- `public/index.html` — la web (no se edita a mano),
- `app-files/Clipzi.html` y `app-files/clipzi_grabador.py` — lo que baja la app de escritorio para actualizarse sola (no se editan a mano).

Cada montaje lleva su número de versión (`<meta name="cortex-build">`); la app solo se actualiza a uno más nuevo.

## Pruebas

`node tests/correr.js` comprueba que lo montado coincide con las piezas y prueba el servidor, la web, el Cortex del PC
(exportar, vista previa, palabras malas, plantillas, giro, vídeo de abajo, chat) y el grabador.
Necesita Playwright con Chromium, ffmpeg y Python 3. No toca datos de verdad: todo va a carpetas temporales.

## App de escritorio

`app-escritorio/` tiene el código de la app (Electron). Cada 30 min mira `/app/version.json` y, si hay un Cortex o un
grabador más nuevos, los deja en `C:\Clipzi Grabador` (guarda el anterior como `.anterior`).

## Cuentas y panel

- Cada clipper entra en la web con su contraseña (se la das tú desde `/panel`). Sin contraseña no se ve la web.
- Lo que abre y exporta cada uno se guarda en el servidor y se ve en `/panel` (vídeo, título, formato, de dónde salió).
- **Los datos se guardan en un volumen de Railway** (Settings → Volumes → montado en `/data`). Sin volumen se borran en cada actualización.
- `MAX_GB` (5 por defecto): espacio máximo para vídeos; al pasarse, se borran los más viejos (la ficha se queda).
