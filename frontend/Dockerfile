# build-stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# optional (CI): RUN npm run typecheck
RUN npm run build
