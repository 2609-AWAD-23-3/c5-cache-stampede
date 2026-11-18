// Logic GET /products/:id cho hai mode, theo CONTRACT.md mục 2–4.
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { TARGET_SQL } from './sql.js';

export const cacheKey = (id) => `cache:product:${id}`;
export const lockKey = (id) => `lock:product:${id}`;

// Lua compare-and-delete (CONTRACT.md mục 4): chỉ xóa lock nếu giá trị đúng token của mình.
export const RELEASE_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round3 = (x) => Math.round(x * 1000) / 1000;

export class NotFoundError extends Error {}

// Body cố định thứ tự key, không nhúng mode/instance/timestamp, để byte-identical giữa hai mode.
export function toBody(row) {
  return JSON.stringify({
    id: row.id,
    name: row.name,
    price_cents: row.price_cents,
    review_count: row.review_count,
    avg_rating: row.avg_rating,
  });
}

export function createProductService({ redis, pool, params, log }) {
  // Chỗ DUY NHẤT chạy query mục tiêu. Tách connect() và query() để đo riêng thời gian chờ pool.
  async function queryProduct(id, stats) {
    const t0 = performance.now();
    const client = await pool.connect();
    const t1 = performance.now();
    try {
      stats.dbQueries += 1;
      const res = await client.query(TARGET_SQL, [id]);
      stats.poolWaitMs += t1 - t0;
      stats.queryMs += performance.now() - t1;
      if (res.rowCount === 0) throw new NotFoundError(`product ${id} not found`);
      return toBody(res.rows[0]);
    } finally {
      client.release();
    }
  }

  async function writeCache(id, body) {
    await redis.set(cacheKey(id), body, { PX: params.cache_ttl_ms });
  }

  // Quy tắc chung: request nào đã chạy query thì luôn trả 200 kèm X-DB-Queries,
  // để Σ X-DB-Queries luôn khớp delta calls của pg_stat_statements (CONTRACT.md mục 3).
  async function plain(id, stats, ctx) {
    const cached = await redis.get(cacheKey(id)); // lỗi ở đây: chưa query gì, trả 500
    if (cached !== null) return { result: 'hit', body: cached };
    const body = await queryProduct(id, stats);
    try {
      await writeCache(id, body);
    } catch (err) {
      log({ event: 'redis_error', op: 'set_cache_plain', error: String(err), ...ctx });
    }
    return { result: 'miss-query', body };
  }

  // Fallback: tự query rồi ghi cache. Lỗi ghi cache chỉ log, không làm hỏng response.
  async function fallback(id, stats, ctx, reason) {
    log({ event: 'fallback', reason, ...ctx });
    const body = await queryProduct(id, stats);
    try {
      await writeCache(id, body);
    } catch (err) {
      log({ event: 'redis_error', op: 'set_cache_fallback', error: String(err), ...ctx });
    }
    return { result: 'miss-fallback', body };
  }

  async function coalesced(id, stats, ctx) {
    let cached;
    try {
      cached = await redis.get(cacheKey(id));
    } catch (err) {
      log({ event: 'redis_error', op: 'get_cache', error: String(err), ...ctx });
      return fallback(id, stats, ctx, 'redis_error');
    }
    if (cached !== null) return { result: 'hit', body: cached };

    const token = crypto.randomUUID();
    let acquired;
    try {
      acquired = (await redis.set(lockKey(id), token, { NX: true, PX: params.lock_lease_ms })) === 'OK';
    } catch (err) {
      log({ event: 'redis_error', op: 'acquire_lock', error: String(err), ...ctx });
      return fallback(id, stats, ctx, 'redis_error');
    }

    if (acquired) return holder(id, stats, ctx, token);
    return waiter(id, stats, ctx);
  }

  async function holder(id, stats, ctx, token) {
    log({ event: 'lock_acquired', token, ...ctx });
    try {
      // Recheck: holder trước có thể vừa ghi cache rồi nhả lock.
      let again;
      try {
        again = await redis.get(cacheKey(id));
      } catch (err) {
        log({ event: 'redis_error', op: 'recheck', error: String(err), ...ctx });
        // `return await` để fallback (query + ghi cache) xong rồi mới chạy finally nhả lock.
        return await fallback(id, stats, ctx, 'redis_error');
      }
      if (again !== null) {
        log({ event: 'recheck_hit', ...ctx });
        return { result: 'hit', body: again };
      }
      const body = await queryProduct(id, stats);
      try {
        await writeCache(id, body);
      } catch (err) {
        // Đã query xong và có body: trả về như fallback thay vì 500.
        log({ event: 'redis_error', op: 'set_cache_holder', error: String(err), ...ctx });
        return { result: 'miss-fallback', body };
      }
      log({ event: 'cache_set', ...ctx });
      return { result: 'miss-query', body };
    } finally {
      // Nhả lock SAU khi đã ghi cache (hoặc khi recheck hit / lỗi).
      try {
        const deleted = await redis.eval(RELEASE_LUA, { keys: [lockKey(id)], arguments: [token] });
        log({ event: deleted === 1 ? 'lock_released' : 'lock_not_owned', token, ...ctx });
      } catch (err) {
        log({ event: 'redis_error', op: 'release_lock', error: String(err), ...ctx });
      }
    }
  }

  async function waiter(id, stats, ctx) {
    const start = performance.now();
    try {
      while (performance.now() - start < params.wait_timeout_ms) {
        await sleep(params.wait_poll_ms);
        const v = await redis.get(cacheKey(id));
        if (v !== null) {
          stats.lockWaitMs += performance.now() - start;
          return { result: 'miss-wait', body: v };
        }
      }
    } catch (err) {
      stats.lockWaitMs += performance.now() - start;
      log({ event: 'redis_error', op: 'poll', error: String(err), ...ctx });
      return fallback(id, stats, ctx, 'redis_error');
    }
    stats.lockWaitMs += performance.now() - start;
    return fallback(id, stats, ctx, 'wait_timeout');
  }

  // Trả { result, body, stats } hoặc ném NotFoundError.
  async function getProduct(id, mode, requestId) {
    const stats = { dbQueries: 0, poolWaitMs: 0, queryMs: 0, lockWaitMs: 0 };
    const ctx = { request_id: requestId, product_id: id, mode };
    const out = mode === 'plain' ? await plain(id, stats, ctx) : await coalesced(id, stats, ctx);
    return {
      ...out,
      stats: {
        dbQueries: stats.dbQueries,
        poolWaitMs: round3(stats.poolWaitMs),
        queryMs: round3(stats.queryMs),
        lockWaitMs: round3(stats.lockWaitMs),
      },
    };
  }

  return { getProduct };
}
