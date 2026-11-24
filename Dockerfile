# Node + yt-dlp + ffmpeg (para poder sacar clips desde un enlace)
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages "yt-dlp[default,curl-cffi]"
WORKDIR /app
COPY package.json server.js cuentas.js ./
COPY public ./public
COPY app-files ./app-files
ENV NODE_ENV=production
CMD ["node", "server.js"]
