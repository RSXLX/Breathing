# Optional packaging; the delivered environment did not build this image.
FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
# ADMIN_TOKEN (>=24 characters) MUST be supplied at runtime for non-loopback HOST.
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node","server/index.mjs"]
