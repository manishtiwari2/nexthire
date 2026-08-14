# NextHire frontend — build the SPA, then serve it from nginx.
#
# Vite inlines VITE_* variables at BUILD time, so they arrive as build args rather than
# runtime env. Changing one means rebuilding this image.

FROM node:20-alpine AS build

WORKDIR /app

# Install against the lockfile first so the dependency layer is cached across source edits.
COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=/api/v1
ARG VITE_SOCKET_URL=
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SOCKET_URL=$VITE_SOCKET_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

# ---- runtime ----
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
