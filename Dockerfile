FROM node:22-alpine AS build

WORKDIR /app

COPY package.json .npmrc ./
RUN npm install

COPY . .
# Tăng heap size để tránh lỗi "JavaScript heap out of memory" trong quá trình build
ENV NODE_OPTIONS=--max-old-space-size=8192
# Bật preset `node-server` khi tự host: build sinh server Node tại dist/
ENV UNIWORK_SELF_HOST=1
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
