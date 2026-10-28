# SCCS Discipline Tracker — production image.
# Mount a persistent volume at /app/db (the SQLite database lives there).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g bun@1.2

WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install

COPY . .
RUN bun run build

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
EXPOSE 3000

CMD ["./scripts/start-production.sh"]
