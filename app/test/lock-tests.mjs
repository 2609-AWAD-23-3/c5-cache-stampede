// Checklist #10–14: test lock chủ ý trên stack Docker thật. Mỗi case ghi evidence vào results/lock-tests/<stamp>/.
// Dùng: `npm run test:lock` trong app/ (stack đã seed). Script đổi env của app1/app2, pause Postgres hoặc kill app1
// trong từng case, nên SAU MỖI CASE (kể cả khi case ném lỗi hoặc bị Ctrl+C) luôn trả stack về trạng thái mặc định:
// unpause postgres, xóa key test, tạo lại app1/app2 với env mặc định. Thoát mã 1 nếu có case FAIL.
import {
  PORTS, appLogs, compose, prewarm, product, redisCli, restartApps, sleep, stamp, targetCalls, writeEvidence,
} from './lib.mjs';

const RUN = stamp();
const DIR = `lock-tests/${RUN}`;
const KEY = 'cache:product:1';
const LOCK = 'lock:product:1';
let allOk = true;

const tally = (rs) => rs.reduce((m, r) => ((m[r.headers['x-cache-result'] ?? r.status] = (m[r.headers['x-cache-result'] ?? r.status] || 0) + 1), m), {});
const sumHdr = (rs) => rs.reduce((a, r) => a + Number(r.headers['x-db-queries'] ?? 0), 0);
const since = () => new Date(Date.now() - 1000).toISOString();

async function burst(mode, n, tag) {
  await prewarm(Math.ceil(n / 2));
  return Promise.all(Array.from({ length: n }, (_, i) => product(i % 2 ? PORTS.app2 : PORTS.app1, mode, `${tag}-${i}`)));
}

function record(id, name, pass, data) {
  const file = writeEvidence(DIR, `case-${id}.json`, { case: id, name, pass, ...data });
  console.log(`${pass ? 'PASS' : 'FAIL'} #${id} ${name} -> ${file}`);
  allOk &&= pass;
}

// Trả stack về mặc định. Từng bước bọc try riêng để một bước lỗi không chặn các bước sau.
function restore() {
  try { compose(['unpause', 'postgres']); } catch { /* postgres không bị pause */ }
  try { redisCli('DEL', KEY, LOCK); } catch (e) { console.error('restore: DEL failed', String(e)); }
  restartApps(); // --force-recreate: bỏ env ghi đè và dựng lại app1 nếu đã bị kill
}

// #10 Recheck + #11 thứ tự: một burst coalesced 200 với cấu hình mặc định.
async function case10and11() {
  redisCli('DEL', KEY, LOCK);
  const t0 = since();
  const before = targetCalls();
  const rs = await burst('coalesced', 200, 'c10');
  const delta = targetCalls() - before;
  await sleep(300);
  const logs = appLogs(t0).filter((l) => String(l.request_id || '').startsWith('c10-'));
  const recheckHits = logs.filter((l) => l.event === 'recheck_hit').length;
  record(10, 'Lock: recheck (burst 200 coalesced, tổng query = 1)', delta === 1 && sumHdr(rs) === 1, {
    expected: 'delta calls = 1, Σ X-DB-Queries = 1',
    delta_calls: delta, sum_x_db_queries: sumHdr(rs), results: tally(rs), recheck_hit_events: recheckHits,
    note: 'Nhánh recheck_hit được kiểm tất định ở app/test/fault.test.mjs; trong burst thật recheck chỉ xảy ra khi holder trước vừa nhả lock.',
  });

  // #11: holder nào đã query thì cache_set phải xuất hiện trước lock_released.
  // Holder gặp recheck_hit thì không query, không ghi cache, chỉ nhả lock (nhánh recheck của #10).
  const holders = logs.filter((l) => l.event === 'lock_acquired').map((l) => l.request_id);
  const order = holders.map((id) => {
    const ev = logs.filter((l) => l.request_id === id).map((l) => l.event);
    const rel = ev.indexOf('lock_released');
    const ok = ev.includes('recheck_hit')
      ? !ev.includes('cache_set') && ev.indexOf('recheck_hit') < rel
      : ev.indexOf('cache_set') !== -1 && ev.indexOf('cache_set') < rel;
    return { request_id: id, events: ev, ok };
  });
  const wrote = order.filter((o) => o.events.includes('cache_set')).length;
  record(11, 'Lock: thứ tự ghi cache trước khi nhả lock', wrote === 1 && order.every((o) => o.ok), {
    expected: 'đúng 1 holder ghi cache, và cache_set trước lock_released; holder gặp recheck_hit thì nhả lock mà không ghi',
    holders: order, log_events: logs.filter((l) => l.event !== 'request_error'),
  });
}

// #12 Lease ngắn hơn thời gian query: lock hết hạn giữa chừng.
async function case12() {
  restartApps({ LOCK_LEASE_MS: '10' });
  redisCli('DEL', KEY, LOCK);
  const t0 = since();
  const before = targetCalls();
  const rs = await burst('coalesced', 200, 'c12');
  const delta = targetCalls() - before;
  await sleep(300);
  const logs = appLogs(t0).filter((l) => String(l.request_id || '').startsWith('c12-'));
  const notOwned = logs.filter((l) => l.event === 'lock_not_owned');
  const released = logs.filter((l) => l.event === 'lock_released');
  record(12, 'Lock: lease (10 ms) < thời gian query', delta > 1 && notOwned.length >= 1 && sumHdr(rs) === delta, {
    expected: 'queries > 1; holder có lease hết hạn gặp lock_not_owned (Lua không xóa lock của holder khác); Σ X-DB-Queries = delta calls',
    lock_lease_ms: 10, delta_calls: delta, sum_x_db_queries: sumHdr(rs), results: tally(rs),
    lock_acquired: logs.filter((l) => l.event === 'lock_acquired').length,
    lock_released: released.length, lock_not_owned: notOwned.length, log_events: logs,
  });
}

// #13 Giết holder: holder (app1) đang query thì bị SIGKILL; waiter (app2) phải tự phục hồi.
async function case13() {
  redisCli('DEL', KEY, LOCK);
  const t0 = since();
  compose(['pause', 'postgres']); // giữ holder kẹt trong query để kịp giết; restore() luôn unpause
  const holderReq = product(PORTS.app1, 'coalesced', 'c13-holder').catch((e) => ({ error: String(e) }));
  await sleep(300);
  const lockBefore = redisCli('GET', LOCK);
  const waiters = Array.from({ length: 10 }, (_, i) => product(PORTS.app2, 'coalesced', `c13-waiter-${i}`));
  await sleep(200);
  compose(['kill', '-s', 'SIGKILL', 'app1']); // restore() luôn dựng lại app1
  compose(['unpause', 'postgres']);
  const killedAt = Date.now();
  const ws = await Promise.all(waiters);
  const holderRes = await holderReq;
  const lockPttlAfterWaiters = Number(redisCli('PTTL', LOCK));
  // Lock của holder chết vẫn còn tới khi lease hết; sau đó request mới lấy lock bình thường.
  const deadline = Date.now() + 10_000;
  while (redisCli('EXISTS', LOCK) !== '0') {
    if (Date.now() > deadline) throw new Error('lock của holder chết không hết hạn sau 10 s');
    await sleep(50);
  }
  const leaseGoneMs = Date.now() - killedAt;
  redisCli('DEL', KEY);
  const fresh = await product(PORTS.app2, 'coalesced', 'c13-after-lease');
  await sleep(300);
  const logs = appLogs(t0).filter((l) => String(l.request_id || '').startsWith('c13-'));
  const pass = !!lockBefore && ws.every((r) => r.status === 200 && r.headers['x-cache-result'] === 'miss-fallback')
    && fresh.status === 200 && fresh.headers['x-cache-result'] === 'miss-query';
  record(13, 'Lock: giết holder giữa lúc query', pass, {
    expected: 'waiter không treo: hết WAIT_TIMEOUT_MS thì miss-fallback; lock của holder chết tự hết sau lease; request mới sau đó lấy lock (miss-query)',
    lock_held_by_holder_before_kill: lockBefore, holder_response: holderRes.error ?? holderRes.status,
    waiters: ws.map((r) => ({ result: r.headers['x-cache-result'], lock_wait_ms: Number(r.headers['x-lock-wait-ms']), db_queries: Number(r.headers['x-db-queries']) })),
    lock_pttl_after_waiters_ms: lockPttlAfterWaiters, lock_expired_after_kill_ms: leaseGoneMs,
    after_lease: { result: fresh.headers['x-cache-result'], db_queries: Number(fresh.headers['x-db-queries']) },
    log_events: logs,
  });
}

// #14 Waiter timeout: lock bị giữ bởi một "holder" giả không bao giờ ghi cache.
async function case14() {
  redisCli('DEL', KEY);
  redisCli('SET', LOCK, 'fake-holder', 'PX', '15000'); // restore() luôn xóa
  const t0 = since();
  const before = targetCalls();
  const rs = await burst('coalesced', 50, 'c14');
  const delta = targetCalls() - before;
  await sleep(300);
  const logs = appLogs(t0).filter((l) => String(l.request_id || '').startsWith('c14-'));
  const fallbacks = rs.filter((r) => r.headers['x-cache-result'] === 'miss-fallback');
  const waits = fallbacks.map((r) => Number(r.headers['x-lock-wait-ms']));
  const logFallbacks = logs.filter((l) => l.event === 'fallback' && l.reason === 'wait_timeout').length;
  record(14, 'Lock: waiter timeout', fallbacks.length === 50 && logFallbacks === 50 && sumHdr(rs) === delta && Math.min(...waits) >= 2000, {
    expected: '50/50 miss-fallback; log fallback(wait_timeout) = 50; lock_wait_ms ≥ WAIT_TIMEOUT_MS (2000); Σ X-DB-Queries = delta calls',
    results: tally(rs), log_fallback_wait_timeout: logFallbacks, delta_calls: delta, sum_x_db_queries: sumHdr(rs),
    lock_wait_ms: { min: Math.min(...waits), max: Math.max(...waits) },
  });
}

// Ctrl+C giữa chừng: vẫn trả stack về mặc định rồi mới thoát.
process.on('SIGINT', () => {
  console.error('Interrupted, restoring stack...');
  try { restore(); } finally { process.exit(130); }
});

const cases = [['10–11', case10and11], ['12', case12], ['13', case13], ['14', case14]];
restore(); // bắt đầu từ trạng thái mặc định, kể cả khi lần chạy trước bị dừng giữa chừng
for (const [id, fn] of cases) {
  try {
    await fn();
  } catch (err) {
    allOk = false;
    console.log(`FAIL #${id} threw: ${String(err)}`);
    writeEvidence(DIR, `case-${id}-error.json`, { case: id, pass: false, error: String(err), stack: err?.stack });
  } finally {
    restore();
  }
}

console.log(allOk ? 'ALL PASS' : 'SOME FAIL', `(evidence: results/${DIR}/)`);
process.exit(allOk ? 0 : 1);
