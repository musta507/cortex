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

Arranca con `npm start`. `GET /healthz` dice si la IA está configurada y cuántas peticiones van hoy.

`public/index.html` se genera con `build_public.py` desde el proyecto completo: no se edita a mano.

## Cuentas y panel

- Cada clipper entra en la web con su contraseña (se la das tú desde `/panel`). Sin contraseña no se ve la web.
- Lo que abre y exporta cada uno se guarda en el servidor y se ve en `/panel` (vídeo, título, formato, de dónde salió).
- **Los datos se guardan en un volumen de Railway** (Settings → Volumes → montado en `/data`). Sin volumen se borran en cada actualización.
- `MAX_GB` (5 por defecto): espacio máximo para vídeos; al pasarse, se borran los más viejos (la ficha se queda).
