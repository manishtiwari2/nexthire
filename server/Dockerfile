# NextHire server image — runs the Express API or the judge worker.
# The judge worker spawns per-submission sandbox containers via the host Docker
# daemon (mounted docker.sock), so the Docker CLI is installed here.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN npx prisma generate

# Default command runs the API; docker-compose overrides it to run the worker.
CMD ["npm", "start"]
