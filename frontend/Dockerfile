# ============================
# 1️⃣ Build Stage
# ============================
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ============================
# 2️⃣ Runtime Stage
# ============================
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ============================
# 3️⃣ Dynamic config.js injection (fixed quoting)
# ============================
RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo "echo \"window.APP_CONFIG = { API_BASE_URL: '\${VITE_API_BASE_URL:-http://4.253.11.59/api}' };\" > /usr/share/nginx/html/config.js" >> /docker-entrypoint.sh && \
    echo 'nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
