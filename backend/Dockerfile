# ── Backend: zero-dependency Node service ────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
COPY package.json ./
COPY src ./src
RUN addgroup -g 1001 -S nodejs && adduser -S node-svc -u 1001 && chown -R node-svc:nodejs /app
USER node-svc
EXPOSE 4000
CMD ["node", "src/server.js"]
