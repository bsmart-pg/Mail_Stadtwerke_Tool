# build-stage
#FROM node:20-alpine AS builder
#WORKDIR /app
#COPY package*.json ./
#RUN npm ci
#COPY . .
# optional (CI): RUN npm run typecheck
#RUN npm run build


# frontend/Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
RUN npm i -g vite
EXPOSE 5174
CMD ["vite","preview","--host","0.0.0.0","--port","5174"]


