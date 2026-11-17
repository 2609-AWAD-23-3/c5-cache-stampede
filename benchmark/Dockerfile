FROM node:22-alpine
WORKDIR /bench
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
CMD ["node", "src/run.js"]
