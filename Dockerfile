# Production image: builds the static export, then serves out/ with nginx (D016).
# Build and run on the host: docker compose --profile app up -d --build
FROM node:22.21-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# npm 10 (bundled with Node 22) cannot resolve this lockfile; it was written by npm 11 (same as CI).
RUN npx -y npm@11.6.2 ci --ignore-scripts
COPY . .
RUN npm run build

FROM nginx:1.29-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80
