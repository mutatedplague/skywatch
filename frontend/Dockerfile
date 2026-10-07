# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm treats a platform-specific native module as optional, so a failed fetch
# of the musl build leaves the install "successful" and the build failing
# later with "Cannot find module lightningcss.linux-x64-musl.node". Check
# here, where a retry of this layer fixes it.
RUN npm ci && node -e "require('lightningcss'); require('@tailwindcss/oxide')"

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time, so they arrive as build args.
# Leave NEXT_PUBLIC_API_URL empty to have the browser derive the receiver
# address from the page it was served from.
ARG NEXT_PUBLIC_API_PORT=4000
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_PORT=$NEXT_PUBLIC_API_PORT \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
