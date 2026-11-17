# Pin Node version/digest ở Task 3 và ghi vào REPORT.md.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
# Dùng `npm ci` khi package-lock.json đã được commit.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY src ./src
EXPOSE 3001 3002
HEALTHCHECK --interval=2s --timeout=3s --retries=30 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
