FROM node:22-alpine AS base
WORKDIR /app

# --- Build client ---
FROM base AS client-build
COPY tsconfig.json ./tsconfig.json
COPY client/package.json client/package-lock.json* ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# --- Build server ---
FROM base AS server-build
COPY tsconfig.json ./tsconfig.json
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install
COPY server/ ./server/

# --- Production ---
FROM node:22-alpine AS production
WORKDIR /app

# Copy server
COPY --from=server-build /app/server/package.json /app/server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev
COPY --from=server-build /app/server/src ./server/src

# Copy built client into server/public
COPY --from=client-build /app/client/dist ./server/public

WORKDIR /app/server

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
