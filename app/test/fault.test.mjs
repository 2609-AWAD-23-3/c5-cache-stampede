// Kiểm tất định các nhánh của products.js (recheck, lỗi Redis) bằng redis/pool giả. Không cần Docker.
// Chạy: `npm test` trong app/.
import { createProductService } from '../src/products.js';

const ROW = { id: 1, name: 'Product 1', price_cents: 1999, review_count: 80000, avg_rating: 3 };
const CANON = '{"id":1,"name":"Product 1","price_cents":1999,"review_count":80000,"avg_rating":3}';

function setup({ failGet = () => false, failSet = () => false, failLock = false, lockHeld = false, cacheAfterFirstGet = false } = {}) {
  const store = new Map();
  const events = [];
  let getN = 0;
  let queries = 0;
  const redis = {
    async get(k) {
      getN++;
      if (failGet(getN, k)) throw new Error('redis get down');
      events.push(`get ${k}`);
      const v = store.get(k) ?? null;
      // Giả lập holder trước ghi cache rồi nhả lock ngay sau lần GET đầu tiên của request này.
      if (cacheAfterFirstGet && getN === 1) store.set('cache:product:1', CANON);
      return v;
    },
    async set(k, v, o) {
      if (o.NX) {
        if (failLock) throw new Error('redis lock down');
        if (lockHeld || store.has(k)) return null;
        store.set(k, v); events.push('lock'); return 'OK';
      }
      if (failSet(k)) throw new Error('redis set down');
      store.set(k, v); events.push(`set ${k}`); return 'OK';
    },
    async eval(_s, { keys, arguments: [tok] }) { events.push('release'); if (store.get(keys[0]) === tok) { store.delete(keys[0]); return 1; } return 0; },
  };
  const pool = { async connect() { return { async query() { queries++; events.push('query'); return { rowCount: 1, rows: [ROW] }; }, release() {} }; } };
  const logs = [];
  const svc = createProductService({ redis, pool, params: { cache_ttl_ms: 3000, lock_lease_ms: 5000, wait_poll_ms: 1, wait_timeout_ms: 20 }, log: (o) => logs.push(o) });
  return { svc, events, logs, store, q: () => queries };
}

let ok = true;
const check = (name, cond, extra) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ' ' + JSON.stringify(extra)}`); ok &&= cond; };
const run = async (name, opts, mode, expect) => {
  const t = setup(opts);
  let out, err;
  try { out = await t.svc.getProduct(1, mode, 'r-1'); } catch (e) { err = e; }
  const res = { result: out?.result, dbq: out?.stats.dbQueries, queries: t.q(), body: out?.body === CANON, err: err && String(err), events: t.events, logs: t.logs.map((l) => l.op || l.event) };
  check(name, expect(res, t), res);
};

// Đường bình thường
await run('coalesced normal: lock -> recheck -> query -> set -> release', {}, 'coalesced',
  (r) => r.result === 'miss-query' && r.dbq === 1 && r.queries === 1 && r.body && r.events.join(',') === 'get cache:product:1,lock,get cache:product:1,query,set cache:product:1,release');
await run('plain normal', {}, 'plain', (r) => r.result === 'miss-query' && r.dbq === 1);

// Checklist #10: recheck sau khi lấy lock thấy cache -> hit, 0 query, vẫn nhả lock
await run('holder: recheck hit -> 0 query, lock released', { cacheAfterFirstGet: true }, 'coalesced',
  (r, t) => r.result === 'hit' && r.dbq === 0 && r.queries === 0 && r.body && r.logs.includes('recheck_hit')
    && r.events.at(-1) === 'release' && !t.store.has('lock:product:1'));

// Lỗi Redis ở các bước
await run('coalesced: first GET error -> fallback', { failGet: (n) => n === 1 }, 'coalesced',
  (r) => r.result === 'miss-fallback' && r.dbq === 1 && r.queries === 1 && r.body && r.logs.includes('get_cache'));
await run('coalesced: lock error -> fallback', { failLock: true }, 'coalesced',
  (r) => r.result === 'miss-fallback' && r.dbq === r.queries && r.body);
await run('holder: recheck error -> fallback, set cache before release', { failGet: (n) => n === 2 }, 'coalesced',
  (r) => r.result === 'miss-fallback' && r.dbq === 1 && r.queries === 1 && r.body && r.logs.includes('recheck')
    && r.events.indexOf('set cache:product:1') < r.events.indexOf('release') && r.events.at(-1) === 'release');
await run('holder: SET error after query -> miss-fallback with body, lock released', { failSet: () => true }, 'coalesced',
  (r, t) => r.result === 'miss-fallback' && r.dbq === 1 && r.queries === 1 && r.body && r.logs.includes('set_cache_holder') && !t.store.has('lock:product:1'));
await run('waiter: poll error -> fallback', { lockHeld: true, failGet: (n) => n === 2 }, 'coalesced',
  (r) => r.result === 'miss-fallback' && r.dbq === 1 && r.body && r.logs.includes('poll'));
await run('waiter: timeout -> fallback', { lockHeld: true }, 'coalesced',
  (r) => r.result === 'miss-fallback' && r.dbq === 1 && r.logs.includes('fallback'));
await run('plain: SET error -> miss-query with body', { failSet: () => true }, 'plain',
  (r) => r.result === 'miss-query' && r.dbq === 1 && r.body && r.logs.includes('set_cache_plain'));
await run('plain: GET error -> throws (500), no query', { failGet: () => true }, 'plain',
  (r) => r.err && r.queries === 0);

console.log(ok ? 'ALL PASS' : 'SOME FAIL');
process.exit(ok ? 0 : 1);
