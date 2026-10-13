FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
RUN npm run build
ENV NODE_ENV=production PORT=5174
USER node
EXPOSE 5174
CMD ["node", "server/index.js"]
