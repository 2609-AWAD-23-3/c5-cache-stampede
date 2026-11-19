// Helper chung cho các script kiểm thử Task 3. Chạy trên host (cần Docker Compose và Node >= 22).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PORTS = { app1: 3001, app2: 3002 };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Agent keep-alive nhiều socket để burst từ host thật sự đồng thời (fetch mặc định mở socket dần dần).
let agent = new http.Agent({ keepAlive: true, maxSockets: 256 });

// Bỏ các socket keep-alive cũ (sau khi container app bị tạo lại hoặc bị kill).
export function resetAgent() {
  agent.destroy();
  agent = new http.Agent({ keepAlive: true, maxSockets: 256 });
}

export function compose(args, env = {}) {
  return execFileSync('docker', ['compose', ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export const redisCli = (...args) => compose(['exec', '-T', 'redis', 'redis-cli', ...args]);
export const psql = (sql, user = 'postgres') => compose(['exec', '-T', 'postgres', 'psql', '-U', user, '-d', 'shop', '-tAc', sql]);

// Tổng calls của query mục tiêu dưới role app_user (giống cách runner lọc, CONTRACT.md mục 3).
export const targetCalls = () =>
  Number(psql(`select coalesce(sum(s.calls),0) from pg_stat_statements s join pg_roles r on r.oid=s.userid
    join pg_database d on d.oid=s.dbid where d.datname='shop' and r.rolname='app_user'
    and s.query like '%WHERE p.id = $1%GROUP BY p.id%'`));

export function get(port, reqPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: reqPath, headers, agent }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
  });
}

export const product = (port, mode, requestId, id = 1) =>
  get(port, `/products/${id}`, { 'X-Cache-Mode': mode, 'X-Request-Id': requestId });

// Mở sẵn n socket tới mỗi instance để burst sau đó không tốn thời gian bắt tay TCP.
export async function prewarm(n) {
  await Promise.all(Object.values(PORTS).flatMap((p) => Array.from({ length: n }, () => get(p, '/config'))));
}

// Khởi động lại app1/app2 với env ghi đè (ví dụ LOCK_LEASE_MS ngắn) và chờ healthy.
export function restartApps(env = {}) {
  compose(['up', '-d', '--wait', '--force-recreate', 'app1', 'app2'], env);
  resetAgent();
}

// Đọc log JSON của app (chỉ dòng sự kiện) kể từ thời điểm `since` (ISO).
export function appLogs(since) {
  const out = compose(['logs', '--no-log-prefix', '--since', since, 'app1', 'app2']);
  return out
    .split('\n')
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
}

export function writeEvidence(dir, name, data) {
  const full = path.join(ROOT, 'results', dir);
  fs.mkdirSync(full, { recursive: true });
  const file = path.join(full, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  return path.relative(ROOT, file).replaceAll('\\', '/');
}

export const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}
