FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build -- --configuration=production

FROM node:20-alpine AS production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --omit=dev

COPY --from=builder /app/dist/ayustra ./dist/ayustra

COPY server/ ./server/

RUN mkdir -p server/secure_uploads/medical_reports

ENV NODE_ENV=production
ENV CONSULT_PORT=4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

EXPOSE 4000

CMD ["node", "server/index.js"]
