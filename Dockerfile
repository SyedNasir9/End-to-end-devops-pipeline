# Dockerfile
FROM node:18-alpine

WORKDIR /app

# install curl for HEALTHCHECK and other tools
RUN apk add --no-cache curl

# copy package manifest for caching
COPY package*.json ./

# install only production deps (if you need dev deps for build steps, adjust)
RUN npm ci --only=production

# copy app sources and public
COPY . .

# create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 && \
    chown -R appuser:nodejs /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["npm", "start"]
