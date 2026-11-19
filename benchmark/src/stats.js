import { performance } from 'node:perf_hooks';

const SNAPSHOT_SQL = `
SELECT s.queryid::text AS queryid,
       s.calls::bigint AS calls,
       s.total_exec_time::double precision AS total_exec_time
FROM pg_stat_statements s
JOIN pg_database d ON d.oid = s.dbid
JOIN pg_roles r ON r.oid = s.userid
WHERE d.datname = 'shop'
  AND r.rolname = 'app_user'
  AND s.query ILIKE '%FROM products p%LEFT JOIN reviews r ON r.product_id = p.id%WHERE p.id = $1%GROUP BY p.id%'
  AND s.query NOT ILIKE '%pg_stat_statements%'
ORDER BY s.calls DESC
`.trim();

/** Round a numeric value to 3 decimal places. */
export function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** Current epoch timestamp in milliseconds with sub-millisecond precision. */
export function epochMsNow() {
  return round3(performance.timeOrigin + performance.now());
}

/** Async sleep helper in milliseconds. */
export function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Take a pg_stat_statements snapshot for the target query executed by app_user.
 * Never calls pg_stat_statements_reset().
 */
export async function takePgSnapshot(pgPool) {
  const res = await pgPool.query(SNAPSHOT_SQL);
  let calls = 0;
  let totalExecTime = 0;
  let queryid = null;

  if (res.rows.length > 0) {
    queryid = res.rows[0].queryid ?? null;
    for (const row of res.rows) {
      calls += Number(row.calls ?? 0);
      totalExecTime += Number(row.total_exec_time ?? 0);
    }
  }

  return {
    calls,
    queryid,
    total_exec_time: round3(totalExecTime),
    timestamp_epoch_ms: epochMsNow(),
    timestamp_iso: new Date().toISOString(),
  };
}

/** Read remaining TTL in milliseconds for a Redis key (-2 missing, -1 no TTL). */
export async function getCachePttl(redisClient, key) {
  return Number(await redisClient.pTTL(key));
}

/**
 * Wait for a Redis key to expire naturally by TTL (never calls DEL).
 * Uses PTTL to sleep most of the remaining window, then polls EXISTS every 1 ms.
 */
export async function waitForCacheExpiry(redisClient, key, timeoutMs) {
  const startMono = performance.now();

  while (true) {
    const existsCount = Number(await redisClient.exists(key));
    if (existsCount === 0) {
      return {
        expired: true,
        expiry_confirmed_ts: epochMsNow(),
      };
    }

    const elapsed = performance.now() - startMono;
    if (elapsed >= timeoutMs) {
      return {
        expired: false,
        expiry_confirmed_ts: null,
      };
    }

    const pttl = await getCachePttl(redisClient, key);
    if (pttl === -2) {
      return {
        expired: true,
        expiry_confirmed_ts: epochMsNow(),
      };
    }

    const remainingTimeout = timeoutMs - (performance.now() - startMono);
    if (remainingTimeout <= 0) {
      return {
        expired: false,
        expiry_confirmed_ts: null,
      };
    }

    if (pttl > 60) {
      const waitMs = Math.min(pttl - 40, remainingTimeout);
      await sleep(waitMs);
    } else {
      await sleep(Math.min(1, remainingTimeout));
    }
  }
}
