FROM oven/bun:1-alpine AS base
WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/x1-labs/xenblocks-airdrop"
LABEL org.opencontainers.image.description="XNM multi-token airdrop CLI for Solana"
LABEL org.opencontainers.image.licenses="ISC"

FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS build
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile
COPY src/ src/
RUN bun run build

FROM base
COPY --from=install /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/package.json .

ENTRYPOINT ["bun", "dist/index.js"]
