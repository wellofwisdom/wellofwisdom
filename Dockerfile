FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production PORT=3000
EXPOSE 3000

USER node
CMD ["node", "server/index.js"]
