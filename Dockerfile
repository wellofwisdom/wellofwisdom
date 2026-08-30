# --- build stage: install everything, build the web app ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY web/package.json web/package-lock.json web/
RUN npm --prefix web ci

COPY . .
RUN npm run build

# --- runtime stage: production deps + built assets only ---
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/web/dist web/dist
COPY server server
COPY public public

ENV NODE_ENV=production PORT=3000
EXPOSE 3000

USER node
CMD ["node", "server/index.js"]
