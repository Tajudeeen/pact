FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && mkdir -p .data && chown -R node:node /app
USER node
ENV PORT=8787
EXPOSE 8787
VOLUME ["/app/.data"]
CMD ["pnpm", "start"]
