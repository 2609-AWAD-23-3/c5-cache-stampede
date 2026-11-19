# Node pin theo tag cụ thể + digest (Task 3, 19/11/2026): Node 22.23.5, Alpine 3.24.4.
FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /app
COPY package.json package-lock.json* ./
# Dùng `npm ci` khi package-lock.json đã được commit.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
EXPOSE 3001 3002
HEALTHCHECK --interval=2s --timeout=3s --retries=30 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
