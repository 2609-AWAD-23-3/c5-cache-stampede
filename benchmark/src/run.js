import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from 'redis';
import { Pool } from 'undici';
import { computeRunSummary, recomputeAndAggregateDir } from './aggregate.js';
import { epochMsNow, getCachePttl, getReviewsRowCount, round3, sleep, takePgSnapshot, waitForCacheExpiry } from './stats.js';

const CANONICAL_PRODUCT_1_JSON = '{"id":1,"name":"Product 1","price_cents":1999,"review_count":30000,"avg_rating":3}';
const CANONICAL_PAYLOAD_SHA256 = crypto.createHash('sha256').update(CANONICAL_PRODUCT_1_JSON).digest('hex');
const CACHE_KEY = 'cache:product:1';
const TARGET_PATH = '/products/1';

function sha256Hex(bufferOrStr) {
  return crypto.createHash('sha256').update(bufferOrStr).digest('hex');
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function hashSeed(seedStr) {
  if (/^\d+$/.test(seedStr)) {
    return Number(seedStr) >>> 0;
  }
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i += 1) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 deterministic PRNG. */
function createRng(seedStr) {
  let state = hashSeed(String(seedStr));
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build balanced interleaved pair order (half plain->coalesced, half coalesced->plain)
 * deterministically shuffled with ORDER_SEED.
 */
export function buildPairSchedule(pairsCount, orderSeed) {
  const halfUp = Math.ceil(pairsCount / 2);
  const halfDown = Math.floor(pairsCount / 2);
  const schedule = [];
  for (let i = 0; i < halfUp; i += 1) schedule.push(['plain', 'coalesced']);
  for (let i = 0; i < halfDown; i += 1) schedule.push(['coalesced', 'plain']);

  if (schedule.length > 1) {
    const rng = createRng(orderSeed);
    for (let i = schedule.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [schedule[i], schedule[j]] = [schedule[j], schedule[i]];
    }
  }
  return schedule;
}

function formatUtcRunTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

async function allocateUniqueRunId(kindDir, mode, pairNum) {
  while (true) {
    const candidate = `${formatUtcRunTimestamp()}-${mode}-${pairNum}`;
    const candidateDir = path.join(kindDir, candidate);
    if (!fs.existsSync(candidateDir)) {
      return candidate;
    }
    await sleep(250);
  }
}

function parseFiniteHeader(headers, name) {
  const raw = headers[name];
  if (raw === undefined || raw === null || raw === '') return null;
  const num = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(num) ? num : null;
}

function parseStringHeader(headers, name) {
  const raw = headers[name];
  if (raw === undefined || raw === null || raw === '') return null;
  return String(Array.isArray(raw) ? raw[0] : raw);
}

async function httpJson(pool, reqPath) {
  const { statusCode, body } = await pool.request({
    path: reqPath,
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const text = await body.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { statusCode, text, json };
}

async function checkInstancesHealthAndConfig(instances) {
  const configs = [];

  for (const inst of instances) {
    const health = await httpJson(inst.pool, '/healthz');
    if (health.statusCode !== 200 || health.json?.status !== 'ok') {
      throw new Error(`Healthcheck failed for ${inst.url}: status=${health.statusCode}, body=${health.text}`);
    }

    const cfg = await httpJson(inst.pool, '/config');
    if (cfg.statusCode !== 200 || !cfg.json || !cfg.json.params) {
      throw new Error(`Invalid /config from ${inst.url}: status=${cfg.statusCode}, body=${cfg.text}`);
    }
    configs.push(cfg.json);
    inst.name = cfg.json.instance || inst.url;
  }

  const base = configs[0];
  const baseParamsStr = stableStringify(base.params);

  for (let i = 1; i < configs.length; i += 1) {
    const cur = configs[i];
    if (cur.node_version !== base.node_version) {
      throw new Error(`Config mismatch node_version: ${base.node_version} vs ${cur.node_version}`);
    }
    if (cur.git_commit !== base.git_commit) {
      throw new Error(`Config mismatch git_commit: ${base.git_commit} vs ${cur.git_commit}`);
    }
    if (stableStringify(cur.params) !== baseParamsStr) {
      throw new Error(`Config mismatch params between instances: ${baseParamsStr} vs ${stableStringify(cur.params)}`);
    }
  }

  return configs;
}

async function sendSingleProductRequest(inst, mode, requestId) {
  const t0 = performance.now();
  const { statusCode, headers, body } = await inst.pool.request({
    path: TARGET_PATH,
    method: 'GET',
    headers: {
      'X-Cache-Mode': mode,
      'X-Request-Id': requestId,
    },
  });
  const buf = Buffer.from(await body.arrayBuffer());
  const durationMs = round3(performance.now() - t0);
  return {
    statusCode,
    headers,
    buf,
    sha256: sha256Hex(buf),
    durationMs,
  };
}

function isValidProductPayload(buf) {
  try {
    const parsed = JSON.parse(buf.toString('utf8'));
    return (
      parsed &&
      typeof parsed.id === 'number' &&
      typeof parsed.name === 'string' &&
      typeof parsed.price_cents === 'number' &&
      typeof parsed.review_count === 'number' &&
      typeof parsed.avg_rating === 'number'
    );
  } catch {
    return false;
  }
}

async function runWarmup(instances, redis, cacheTtlMs) {
  console.log('Running warm-up...');
  let isStubService = false;
  const observedHashes = new Map();

  for (const mode of ['plain', 'coalesced']) {
    await waitForCacheExpiry(redis, CACHE_KEY, cacheTtlMs * 3);
    const missRes = await sendSingleProductRequest(instances[0], mode, `warmup-${mode}-miss`);

    if (missRes.statusCode === 501) {
      isStubService = true;
      console.warn(`[warm-up] ${instances[0].name} returned 501 (stub service detected) for mode=${mode}`);
      continue;
    }

    if (missRes.statusCode !== 200 || !isValidProductPayload(missRes.buf)) {
      throw new Error(`Warm-up miss failed for mode=${mode}: status=${missRes.statusCode}`);
    }
    observedHashes.set(`${mode}-miss`, missRes.sha256);

    const hitRes = await sendSingleProductRequest(instances[1 % instances.length], mode, `warmup-${mode}-hit`);
    if (hitRes.statusCode !== 200 || hitRes.sha256 !== missRes.sha256) {
      throw new Error(`Warm-up hit mismatch for mode=${mode}: status=${hitRes.statusCode}`);
    }
    observedHashes.set(`${mode}-hit`, hitRes.sha256);

    const exp = await waitForCacheExpiry(redis, CACHE_KEY, cacheTtlMs * 3);
    if (!exp.expired) {
      throw new Error(`Warm-up cache key did not expire within ${cacheTtlMs * 3} ms for mode=${mode}`);
    }
  }

  for (let i = 1; i <= 20; i += 1) {
    const inst = instances[(i - 1) % instances.length];
    const res = await sendSingleProductRequest(inst, 'plain', `warmup-seq-${i}`);
    if (res.statusCode === 501) {
      isStubService = true;
    } else if (res.statusCode !== 200) {
      throw new Error(`Warm-up sequential request ${i} failed: status=${res.statusCode}`);
    }
  }

  if (!isStubService) {
    await waitForCacheExpiry(redis, CACHE_KEY, cacheTtlMs * 3);
  }

  let baselinePayloadSha256 = CANONICAL_PAYLOAD_SHA256;
  if (!isStubService && observedHashes.size > 0) {
    const unique = new Set(observedHashes.values());
    if (unique.size !== 1) {
      throw new Error(`Payload SHA-256 differs between plain and coalesced during warm-up: ${[...unique].join(', ')}`);
    }
    baselinePayloadSha256 = [...unique][0];
  }

  return { isStubService, baselinePayloadSha256 };
}

async function prewarmKeepAliveConnections(instances, burstSize) {
  const perInstance = Math.ceil(burstSize / instances.length);
  const jobs = [];
  for (const inst of instances) {
    for (let i = 0; i < perInstance; i += 1) {
      jobs.push(
        inst.pool
          .request({ path: '/config', method: 'GET' })
          .then(async ({ body }) => {
            await body.arrayBuffer();
          }),
      );
    }
  }
  await Promise.all(jobs);
}

async function executeBurst({ instances, burstSize, mode, runId }) {
  const burst_start_ts = epochMsNow();
  const burstStartMono = performance.now();

  const tasks = Array.from({ length: burstSize }, (_, idx) => {
    const seq = idx + 1;
    const inst = instances[idx % instances.length];
    const requestId = `${runId}-${seq}`;

    return (async () => {
      const reqStartMono = performance.now();
      const t_send_mono_ms = round3(reqStartMono - burstStartMono);

      try {
        const { statusCode, headers, body } = await inst.pool.request({
          path: TARGET_PATH,
          method: 'GET',
          headers: {
            'X-Cache-Mode': mode,
            'X-Request-Id': requestId,
          },
        });
        const buf = Buffer.from(await body.arrayBuffer());
        const duration_ms = round3(performance.now() - reqStartMono);

        return {
          run_id: runId,
          mode,
          seq,
          instance: parseStringHeader(headers, 'x-instance') || inst.name,
          t_send_mono_ms,
          duration_ms,
          status: statusCode,
          payload_sha256: sha256Hex(buf),
          cache_result: parseStringHeader(headers, 'x-cache-result'),
          db_queries: parseFiniteHeader(headers, 'x-db-queries'),
          pool_wait_ms: parseFiniteHeader(headers, 'x-pool-wait-ms'),
          query_ms: parseFiniteHeader(headers, 'x-query-ms'),
          lock_wait_ms: parseFiniteHeader(headers, 'x-lock-wait-ms'),
          server_recv_ts: parseFiniteHeader(headers, 'x-server-recv-ts'),
        };
      } catch (err) {
        const duration_ms = round3(performance.now() - reqStartMono);
        return {
          run_id: runId,
          mode,
          seq,
          instance: inst.name,
          t_send_mono_ms,
          duration_ms,
          status: 0,
          error: err instanceof Error ? err.message : String(err),
          payload_sha256: null,
          cache_result: null,
          db_queries: null,
          pool_wait_ms: null,
          query_ms: null,
          lock_wait_ms: null,
          server_recv_ts: null,
        };
      }
    })();
  });

  const requests = await Promise.all(tasks);
  requests.sort((a, b) => a.seq - b.seq);
  return { burst_start_ts, requests };
}

function writeRunArtifacts({
  kindDir,
  runId,
  configRecord,
  beforeSnap,
  afterSnap,
  requests,
  summary,
}) {
  const runDir = path.join(kindDir, runId);
  const snapDir = path.join(runDir, 'snapshots');
  fs.mkdirSync(snapDir, { recursive: true });

  fs.writeFileSync(path.join(runDir, 'config.json'), `${JSON.stringify(configRecord, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(snapDir, 'before.json'), `${JSON.stringify(beforeSnap, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(snapDir, 'after.json'), `${JSON.stringify(afterSnap, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    path.join(runDir, 'requests.jsonl'),
    `${requests.map((r) => JSON.stringify(r)).join('\n')}\n`,
    'utf8',
  );
  fs.writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

export async function runBenchmark(env = process.env) {
  const appUrls = (env.APP_URLS || 'http://app1:3001,http://app2:3002')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  const redisUrl = env.REDIS_URL || 'redis://redis:6379';
  const statsDbUrl = env.STATS_DATABASE_URL || 'postgres://bench_ro:bench_pass@postgres:5432/shop';
  const pairs = Number(env.PAIRS ?? 10);
  const burstSize = Number(env.BURST_SIZE ?? 200);
  const resultsDir = env.RESULTS_DIR || '/results';
  const resultsKind = env.RESULTS_KIND || 'pilot';
  const orderSeed = String(env.ORDER_SEED ?? '20261117');
  const maxRetries = Number(env.MAX_RETRIES ?? 2);
  const allowInvalidExitZero = env.ALLOW_INVALID_EXIT_ZERO === '1';

  if (appUrls.length === 0) {
    throw new Error('APP_URLS must contain at least one instance URL');
  }
  if (!Number.isInteger(pairs) || pairs <= 0) {
    throw new Error(`PAIRS must be a positive integer, got: ${env.PAIRS}`);
  }
  if (!Number.isInteger(burstSize) || burstSize <= 0) {
    throw new Error(`BURST_SIZE must be a positive integer, got: ${env.BURST_SIZE}`);
  }

  const clientHeadersTimeoutMs = 10000;
  const clientBodyTimeoutMs = 10000;
  const perInstancePoolConns = Math.ceil(burstSize / appUrls.length) + 5;
  const instances = appUrls.map((url) => ({
    url,
    name: url,
    pool: new Pool(url, {
      connections: perInstancePoolConns,
      pipelining: 1,
      keepAliveTimeout: 60000,
      keepAliveMaxTimeout: 60000,
      headersTimeout: clientHeadersTimeoutMs,
      bodyTimeout: clientBodyTimeoutMs,
    }),
  }));

  const redis = createClient({ url: redisUrl });
  const pgPool = new pg.Pool({ connectionString: statsDbUrl, max: 2 });

  try {
    await redis.connect();
    await pgPool.query('SELECT 1');
    const seedReviewsCount = await getReviewsRowCount(pgPool);

    const instanceConfigs = await checkInstancesHealthAndConfig(instances);
    const cacheTtlMs = Number(instanceConfigs[0].params.cache_ttl_ms);
    if (!Number.isFinite(cacheTtlMs) || cacheTtlMs <= 0) {
      throw new Error(`Invalid cache_ttl_ms in /config: ${instanceConfigs[0].params.cache_ttl_ms}`);
    }

    const schedule = buildPairSchedule(pairs, orderSeed);
    const kindDir = path.join(resultsDir, resultsKind);
    fs.mkdirSync(kindDir, { recursive: true });

    const { isStubService, baselinePayloadSha256 } = await runWarmup(instances, redis, cacheTtlMs);
    const allSummaries = [];
    let hasFailedRun = false;

    for (let idx = 0; idx < schedule.length; idx += 1) {
      const pairNum = idx + 1;
      const modePair = schedule[idx];

      for (const mode of modePair) {
        let pairModeSatisfied = false;

        for (let attempt = 1; attempt <= 1 + maxRetries; attempt += 1) {
          const runId = await allocateUniqueRunId(kindDir, mode, pairNum);
          console.log(`[pair ${pairNum}/${pairs}] Starting ${runId} (attempt ${attempt})...`);

          if (!isStubService) {
            await waitForCacheExpiry(redis, CACHE_KEY, cacheTtlMs * 3);
          }

          // Step 3: fill cache and verify PTTL > 0
          const fillRes = await sendSingleProductRequest(instances[0], 'plain', `${runId}-fill`);
          const fillPttlMs = fillRes.statusCode === 200 ? await getCachePttl(redis, CACHE_KEY) : -2;
          await prewarmKeepAliveConnections(instances, burstSize);

          // Step 4: snapshot pg_stat_statements before burst
          const beforeSnap = await takePgSnapshot(pgPool);

          // Step 5: wait for natural TTL expiry (no DEL)
          let expiry_confirmed = false;
          let expiry_confirmed_ts = null;
          if (fillPttlMs > 0) {
            const exp = await waitForCacheExpiry(redis, CACHE_KEY, cacheTtlMs * 3);
            expiry_confirmed = exp.expired;
            expiry_confirmed_ts = exp.expiry_confirmed_ts;
          }

          // Step 6: execute 200 concurrent requests across both instances
          const { burst_start_ts, requests } = await executeBurst({
            instances,
            burstSize,
            mode,
            runId,
          });

          // Step 7: snapshot pg_stat_statements after burst
          const afterSnap = await takePgSnapshot(pgPool);

          // Step 8: validate, persist artifacts, wait clean state
          const summary = computeRunSummary({
            run_id: runId,
            mode,
            pair: pairNum,
            attempt,
            requests,
            beforeSnap,
            afterSnap,
            expiry_confirmed,
            expiry_confirmed_ts,
            burst_start_ts,
            expectedBurstSize: burstSize,
            baselinePayloadSha256,
          });

          const cpus = os.cpus();
          const configRecord = {
            run_id: runId,
            mode,
            pair: pairNum,
            attempt,
            burst_size: burstSize,
            pairs_total: pairs,
            order_seed: orderSeed,
            results_kind: resultsKind,
            seed_reviews_count: seedReviewsCount,
            client_headers_timeout_ms: clientHeadersTimeoutMs,
            client_body_timeout_ms: clientBodyTimeoutMs,
            fill_pttl_ms: fillPttlMs,
            expiry_confirmed,
            expiry_confirmed_ts,
            burst_start_ts,
            baseline_payload_sha256: baselinePayloadSha256,
            instances: instanceConfigs,
            runner: {
              node_version: process.version,
              hostname: os.hostname(),
              platform: `${os.platform()} ${os.release()}`,
              arch: os.arch(),
              cpu_count: cpus.length,
              cpu_model: cpus[0]?.model || 'unknown',
              total_memory_mb: Math.round(os.totalmem() / (1024 * 1024)),
              git_commit: instanceConfigs[0].git_commit ?? 'unknown',
            },
          };

          writeRunArtifacts({
            kindDir,
            runId,
            configRecord,
            beforeSnap,
            afterSnap,
            requests,
            summary,
          });
          allSummaries.push(summary);

          if (!isStubService) {
            await waitForCacheExpiry(redis, CACHE_KEY, cacheTtlMs * 3);
          }

          if (summary.valid) {
            console.log(
              `[pair ${pairNum}/${pairs}] ${runId} VALID | queries=${summary.queries_per_expiry} | p50=${summary.p50_ms}ms | p95=${summary.p95_ms}ms | span=${summary.burst_span_ms}ms`,
            );
            pairModeSatisfied = true;
            break;
          }

          console.warn(
            `[pair ${pairNum}/${pairs}] ${runId} INVALID (${summary.invalid_reasons.join('; ')})`,
          );
          if (isStubService) {
            break;
          }
        }

        if (!pairModeSatisfied) {
          hasFailedRun = true;
        }
      }
    }

    const { summaries: aggregatedSummaries, markdown: reportMarkdown } = recomputeAndAggregateDir(kindDir);
    console.log(`\n${reportMarkdown}`);

    if (hasFailedRun && !allowInvalidExitZero) {
      throw new Error(
        isStubService
          ? 'Benchmark finished against stub service (501 Not Implemented); no valid measured runs produced.'
          : 'One or more pair/mode runs failed validation after maximum retries.',
      );
    }

    return { summaries: allSummaries, aggregatedSummaries, kindDir, reportMarkdown };
  } finally {
    await Promise.allSettled([
      ...instances.map((i) => i.pool.close()),
      redis.isOpen ? redis.quit() : Promise.resolve(),
      pgPool.end(),
    ]);
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  runBenchmark().catch((err) => {
    console.error(`Benchmark failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
