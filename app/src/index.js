// Service C5: GET /products/:id với hai mode cache (plain, coalesced) theo CONTRACT.md.
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { createClient } from 'redis';
import { TARGET_SQL } from './sql.js';
import { createProductService, NotFoundError } from './products.js';

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

// Log một dòng JSON ra stdout (chỉ sự kiện lock/lỗi, không log từng request để khỏi ảnh hưởng latency).
const log = (obj) => console.log(JSON.stringify({ ts: Date.now(), instance: config.instance, ...obj }));

const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redis.on('error', (err) => log({ event: 'redis_client_error', error: String(err) }));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://app_user:app_pass@localhost:5432/shop',
  max: config.params.pg_pool_max,
});
pool.on('error', (err) => log({ event: 'pg_pool_error', error: String(err) }));

const products = createProductService({ redis, pool, params: config.params, log });

const MODES = new Set(['plain', 'coalesced']);
const nowEpochMs = () => Math.round((performance.timeOrigin + performance.now()) * 1000) / 1000;

function send(res, status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
    'X-Instance': config.instance,
    ...headers,
  });
  res.end(text);
}

async function healthz(res) {
  try {
    await Promise.all([redis.ping(), pool.query('SELECT 1')]);
    send(res, 200, { status: 'ok' });
  } catch (err) {
    send(res, 503, { status: 'error', error: String(err) });
  }
}

async function getProduct(req, res, rawId, recvTs) {
  const mode = req.headers['x-cache-mode'];
  if (!MODES.has(mode)) return send(res, 400, { error: 'X-Cache-Mode must be plain or coalesced' });
  if (!/^[1-9]\d{0,9}$/.test(rawId)) return send(res, 404, { error: 'not found' });
  const id = Number(rawId);
  const requestId = req.headers['x-request-id'] || null;

  try {
    const { result, body, stats } = await products.getProduct(id, mode, requestId);
    send(res, 200, body, {
      'X-Cache-Result': result,
      'X-DB-Queries': String(stats.dbQueries),
      'X-Pool-Wait-Ms': String(stats.poolWaitMs),
      'X-Query-Ms': String(stats.queryMs),
      'X-Lock-Wait-Ms': String(stats.lockWaitMs),
      'X-Server-Recv-Ts': String(recvTs),
    });
  } catch (err) {
    if (err instanceof NotFoundError) return send(res, 404, { error: 'not found' });
    log({ event: 'request_error', request_id: requestId, mode, error: String(err) });
    send(res, 500, { error: 'internal error' });
  }
}

const server = http.createServer((req, res) => {
  const recvTs = nowEpochMs();
  const path = (req.url || '').split('?')[0];
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  if (path === '/healthz') return healthz(res);
  if (path === '/config') return send(res, 200, config);
  const m = path.match(/^\/products\/([^/]+)$/);
  if (m) return getProduct(req, res, m[1], recvTs);
  return send(res, 404, { error: 'not found' });
});

// Runner giữ keep-alive giữa các burst (chờ TTL hết vài giây): không để server đóng socket rảnh sau 5 s mặc định.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

await redis.connect();
server.listen(config.port, () => log({ event: 'listening', port: config.port }));

const shutdown = async () => {
  server.close();
  await Promise.allSettled([redis.quit(), pool.end()]);
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
