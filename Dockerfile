FROM node:22-alpine AS build

WORKDIR /app

COPY package.json .npmrc ./
RUN npm install

COPY . .
# Ngoài sandbox Lovable, vite.config.ts dùng nitro preset `node-server`,
# nên build sinh ra server Node độc lập tại .output/
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
