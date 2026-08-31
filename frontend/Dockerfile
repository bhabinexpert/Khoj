# Khoj frontend — build the Vite SPA, then serve the static output with nginx.
#
# The API base is compiled in as a relative "/api" (see src/api/client.js), so
# the browser always talks to the same origin it loaded from and nginx proxies
# "/api" onward to the backend. That keeps the image environment-agnostic: the
# only runtime knob is BACKEND_URL, consumed by nginx, not the bundle.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM nginx:1.27-alpine AS runtime

# The site talks to the backend over the compose network by default; override
# BACKEND_URL for other topologies. It is templated into nginx.conf at start.
ENV BACKEND_URL=http://backend:5000

# nginx:alpine runs `envsubst` over every *.template in this dir at boot and
# writes the result into conf.d — that is how ${BACKEND_URL} gets substituted.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/ >/dev/null 2>&1 || exit 1
