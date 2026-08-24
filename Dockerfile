FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* bun.lock* ./
RUN npm install

COPY . .

# Lovable TanStack Start defaults to Cloudflare nitro output; VPS Docker needs node-server.
ENV NITRO_PRESET=node-server
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/.output ./.output

EXPOSE 3000

# Do not use `vite preview` — TanStack Start + nitro serves from .output on Node.
CMD ["sh", "-c", "if [ -f .output/server/index.mjs ]; then exec node .output/server/index.mjs; elif [ -f .output/server/index.js ]; then exec node .output/server/index.js; elif [ -f dist/server/index.js ]; then exec node dist/server/index.js; elif [ -f dist/server/server.js ]; then exec node dist/server/server.js; else echo 'No production server entry (.output/server or dist/server)' >&2; ls -laR .output dist 2>&1 || true; exit 1; fi"]
