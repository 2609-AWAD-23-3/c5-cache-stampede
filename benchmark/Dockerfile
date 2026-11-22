# Node pin theo tag cụ thể + digest (đồng bộ với app/Dockerfile, kiểm 19/11/2026): Node 22.23.5, Alpine 3.24.4.
FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /bench
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
CMD ["node", "src/run.js"]
