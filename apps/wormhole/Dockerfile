FROM node:22-slim

ENV PORT=8787
EXPOSE 8787

RUN apt-get update && apt-get install -y python3 make g++ bash --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src ./src
COPY tsconfig.json ./


USER node
