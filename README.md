# Cortex · versión de prueba

Editor de clips con IA. La página funciona en el navegador de cada persona (sus vídeos no se suben); el servidor solo
sirve la página, hace de puente con Gemini para que nadie tenga que poner su propia clave y descarga
los vídeos de los enlaces (Kick, Twitch, YouTube, TikTok…) con yt-dlp. El `Dockerfile` instala yt-dlp y ffmpeg.

## Variables (Railway → Variables)

| Variable | Obligatoria | Qué es |
|---|---|---|
| `GEMINI_KEY` | sí | Clave de Gemini. Solo vive en el servidor. |
| `LIMITE_POR_PERSONA` | no | Peticiones a la IA por persona y día (150). |
| `LIMITE_TOTAL` | no | Peticiones a la IA de todos por día (5000). |
| `DESCARGAS_POR_PERSONA` | no | Enlaces que puede descargar cada persona al día (40). |
| `DESCARGAS_A_LA_VEZ` | no | Descargas simultáneas en el servidor (3). |
| `MINUTOS_MAX` | no | Duración máxima del vídeo de un enlace (15). |

Arranca con `npm start`. `GET /healthz` dice si la IA está configurada y cuántas peticiones van hoy.

`public/index.html` se genera con `build_public.py` desde el proyecto completo: no se edita a mano.
