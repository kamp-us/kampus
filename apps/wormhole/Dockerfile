FROM node:22-slim

ENV PORT=8787
EXPOSE 8787

RUN apt-get update && apt-get install -y python3 make g++ bash git --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src ./src
COPY tsconfig.json ./

USER node
CMD ["node", "node_modules/.bin/tsx", "src/server.ts"]
