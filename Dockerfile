FROM node:24.18.1-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig*.json ./
COPY migrations ./migrations
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24.18.1-alpine AS runtime

ENV NODE_ENV=production \
    ORGANIZATION_HOST=0.0.0.0 \
    ORGANIZATION_API_PORT=3000 \
    ORGANIZATION_DATABASE_PATH=/data/organization.sqlite \
    ORGANIZATION_UPLOAD_PATH=/data/uploads \
    ORGANIZATION_AUTHENTIK_APP_SLUG=organization \
    ORGANIZATION_PUBLIC_ORIGIN=https://organization.singha.io

WORKDIR /app

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node package.json ./package.json

RUN mkdir -p /data/uploads && chown -R node:node /data

USER node

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/server/server/index.js"]
