# NextHire server image — runs either the Express API or the judge worker.
#
# One image, two commands (see docker-compose.yml):
#   npm start        -> the API (never executes user code)
#   npm run worker   -> the judge worker, which spawns per-submission sandbox containers
#                       through the mounted host Docker socket, so the Docker CLI is needed.

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install from the lockfile so an image build is reproducible and cannot silently pick up a
# newer transitive dependency than the one that was tested.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npx prisma generate

ENV NODE_ENV=production

# NOTE ON ROOT: the worker talks to the mounted /var/run/docker.sock, which on most hosts is
# owned by root:docker — so this image runs as root. Mounting that socket already grants
# host-root-equivalent power, which is why the worker belongs on a host dedicated to judging.
# The *untrusted* code never runs in this container: it runs in throwaway sandbox containers
# that are --network none, --read-only, --cap-drop ALL and --user 1000:1000.

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:5000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# docker-compose overrides this to run the worker.
CMD ["npm", "start"]
