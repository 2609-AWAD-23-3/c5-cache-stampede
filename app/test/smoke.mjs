// Smoke test Task 2 trên stack Docker đang chạy (tiêu chí "Xong khi" của #4).
// Chạy: `npm run test:smoke` trong app/ (cần `docker compose up -d --wait app1 app2` trước).
import { PORTS, product, redisCli, sleep, targetCalls } from './lib.mjs';
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
let ok = true;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${cond ? '' : extra}`); ok &&= cond; };
const hashes = new Set();

for (const mode of ['plain', 'coalesced']) {
  redisCli('DEL', 'cache:product:1', 'lock:product:1');
  const c0 = targetCalls();
  const miss = await product(PORTS.app1, mode, `smoke-${mode}-miss`);
  const c1 = targetCalls();
  const hit = await product(PORTS.app2, mode, `smoke-${mode}-hit`);
  const c2 = targetCalls();
  check(`${mode} miss: miss-query, X-DB-Queries=1, delta calls=1`, miss.status === 200 && miss.headers['x-cache-result'] === 'miss-query' && miss.headers['x-db-queries'] === '1' && c1 - c0 === 1, JSON.stringify(miss.headers));
  check(`${mode} hit: X-DB-Queries=0, delta calls=0`, hit.headers['x-cache-result'] === 'hit' && hit.headers['x-db-queries'] === '0' && c2 - c1 === 0);
  check(`${mode} body miss == hit`, miss.body === hit.body);
  hashes.add(sha(miss.body));
  const pttl = Number(redisCli('PTTL', 'cache:product:1'));
  check(`${mode} PTTL > 0`, pttl > 0, `pttl=${pttl}`);
  while (redisCli('EXISTS', 'cache:product:1') !== '0') await sleep(20); // chờ TTL tự hết, không DEL
  const c3 = targetCalls();
  const after = await product(PORTS.app1, mode, `smoke-${mode}-after-expiry`);
  check(`${mode} một request sau expiry: 1 query`, after.headers['x-db-queries'] === '1' && targetCalls() - c3 === 1);
  for (const h of ['x-cache-result', 'x-db-queries', 'x-pool-wait-ms', 'x-query-ms', 'x-lock-wait-ms', 'x-server-recv-ts', 'x-instance']) {
    if (!(h in miss.headers)) check(`${mode} header ${h}`, false);
  }
}
check('payload hai mode cùng SHA-256', hashes.size === 1, [...hashes].join(','));
check('400 khi X-Cache-Mode sai', (await product(PORTS.app1, 'nope', 'smoke-400')).status === 400);
check('404 khi product không tồn tại', (await product(PORTS.app1, 'plain', 'smoke-404', 999)).status === 404);

console.log(ok ? 'ALL PASS' : 'SOME FAIL');
process.exit(ok ? 0 : 1);
