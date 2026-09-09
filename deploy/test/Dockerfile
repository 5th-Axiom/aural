# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Build-time public settings must match the environment used at runtime.
# Mount secrets rather than copying them into an image layer.
RUN --mount=type=secret,id=app_env,target=/app/.env.production,required=true \
    NODE_OPTIONS=--max-old-space-size=1536 npm run build -- --webpack

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 8766
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
