# ─── Build Stage ───
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY . .
RUN npm run build -- --configuration=production

# ─── Production Stage ───
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --omit=dev

# Copy built Angular app
COPY --from=builder /app/dist/ayustra ./dist/ayustra

# Copy server files
COPY server/ ./server/

# Create upload directories
RUN mkdir -p server/secure_uploads/medical_reports

# Set environment
ENV NODE_ENV=production
ENV CONSULT_PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

# Expose port
EXPOSE 4000

# Start the backend (serves both API and static Angular files)
CMD ["node", "server/index.js"]
