// STUB — Vượng triển khai theo CONTRACT.md.
// Hiện chỉ có /healthz và /config để Compose healthcheck chạy được.
// Task 2 (Vượng): kết nối Redis/Postgres thật trong /healthz, viết GET /products/:id cho hai mode
//   (plain, coalesced), trả đủ header ở CONTRACT.md mục 2, Lua release ở mục 4.
import http from 'node:http';
import { TARGET_SQL } from './sql.js';

const num = (k, d) => (process.env[k] ? Number(process.env[k]) : d);

// Theo CONTRACT.md mục 2: metadata (instance, port) không so sánh; `params` + node_version + git_commit phải khớp giữa hai instance.
export const config = {
  instance: process.env.INSTANCE_NAME || 'app?',
  port: num('PORT', 3001),
  node_version: process.version,
  git_commit: process.env.GIT_COMMIT || 'unknown',
  params: {
    cache_ttl_ms: num('CACHE_TTL_MS', 3000),
    pg_pool_max: num('PG_POOL_MAX', 10),
    lock_lease_ms: num('LOCK_LEASE_MS', 5000),
    wait_poll_ms: num('WAIT_POLL_MS', 5),
    wait_timeout_ms: num('WAIT_TIMEOUT_MS', 2000),
    target_sql: TARGET_SQL,
  },
};

const server = http.createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.url === '/healthz') return send(200, { status: 'ok' }); // stub: Task 2 kiểm Redis + Postgres thật
  if (req.url === '/config') return send(200, config);
  if (req.url.startsWith('/products/')) return send(501, { error: 'not implemented' });
  return send(404, { error: 'not found' });
});

server.listen(config.port, () => console.log(`${config.instance} listening on ${config.port}`));
