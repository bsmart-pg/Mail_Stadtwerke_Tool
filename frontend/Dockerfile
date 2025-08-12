# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Optional: set VITE_*-ENV-Variablen hier via ARG/ENV
RUN npm run build

# --- Serve stage ---
FROM nginx:1.27-alpine
# Statische Dateien in den Docroot
COPY --from=builder /app/dist /usr/share/nginx/html
# Nginx für SPA & Caching konfigurieren
COPY nginx.conf /etc/nginx/conf.d/default.conf
