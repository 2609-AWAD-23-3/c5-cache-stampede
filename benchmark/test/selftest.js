import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeRunSummary, nearestRankPercentile, recomputeAndAggregateDir } from '../src/aggregate.js';
import { runBenchmark } from '../src/run.js';

const CANONICAL_BODY = '{"id":1,"name":"Product 1","price_cents":1999,"review_count":80000,"avg_rating":3}';
const CANONICAL_SHA = crypto.createHash('sha256').update(CANONICAL_BODY).digest('hex');

function parseRespCommands(buffer) {
  const str = buffer.toString('utf8');
  const cmds = [];
  let idx = 0;
  while (idx < str.length) {
    if (str[idx] !== '*') break;
    const lineEnd = str.indexOf('\r\n', idx);
    if (lineEnd === -1) break;
    const argc = Number(str.slice(idx + 1, lineEnd));
    let pos = lineEnd + 2;
    const args = [];
    let complete = true;
    for (let i = 0; i < argc; i += 1) {
      if (str[pos] !== '$') {
        complete = false;
        break;
      }
      const lenEnd = str.indexOf('\r\n', pos);
      if (lenEnd === -1) {
        complete = false;
        break;
      }
      const len = Number(str.slice(pos + 1, lenEnd));
      const valStart = lenEnd + 2;
      const valEnd = valStart + len;
      if (valEnd + 2 > str.length) {
        complete = false;
        break;
      }
      args.push(str.slice(valStart, valEnd));
      pos = valEnd + 2;
    }
    if (!complete) break;
    cmds.push(args);
    idx = pos;
  }
  return { cmds, consumedBytes: Buffer.byteLength(str.slice(0, idx), 'utf8') };
}

function createMockRedisServer(cacheMap) {
  const server = net.createServer((socket) => {
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const { cmds, consumedBytes } = parseRespCommands(pending);
      if (consumedBytes > 0) {
        pending = pending.subarray(consumedBytes);
      }
      for (const args of cmds) {
        const op = (args[0] || '').toUpperCase();
        if (op === 'CLIENT') {
          socket.write('+OK\r\n');
        } else if (op === 'PING') {
          socket.write('+PONG\r\n');
        } else if (op === 'EXISTS') {
          const key = args[1];
          const entry = cacheMap.get(key);
          const alive = entry && entry.expiresAt > Date.now();
          if (entry && !alive) cacheMap.delete(key);
          socket.write(`:${alive ? 1 : 0}\r\n`);
        } else if (op === 'PTTL') {
          const key = args[1];
          const entry = cacheMap.get(key);
          if (!entry) {
            socket.write(':-2\r\n');
          } else {
            const rem = Math.ceil(entry.expiresAt - Date.now());
            if (rem <= 0) {
              cacheMap.delete(key);
              socket.write(':-2\r\n');
            } else {
              socket.write(`:${rem}\r\n`);
            }
          }
        } else if (op === 'QUIT') {
          socket.write('+OK\r\n');
          socket.end();
        } else {
          socket.write('+OK\r\n');
        }
      }
    });
  });
  return server;
}

function buildPgMessage(typeByte, payloadBuf) {
  const len = 4 + payloadBuf.length;
  const out = Buffer.alloc(1 + len);
  out.write(typeByte, 0, 1, 'ascii');
  out.writeInt32BE(len, 1);
  payloadBuf.copy(out, 5);
  return out;
}

function buildRowDescription(cols) {
  const parts = [Buffer.alloc(2)];
  parts[0].writeInt16BE(cols.length, 0);
  for (const col of cols) {
    const nameBuf = Buffer.from(`${col.name}\0`, 'utf8');
    const meta = Buffer.alloc(18);
    meta.writeInt32BE(0, 0); // table oid
    meta.writeInt16BE(0, 4); // col attr
    meta.writeInt32BE(col.oid, 6);
    meta.writeInt16BE(col.size, 10);
    meta.writeInt32BE(-1, 12); // type mod
    meta.writeInt16BE(0, 16); // text format
    parts.push(nameBuf, meta);
  }
  return buildPgMessage('T', Buffer.concat(parts));
}

function buildDataRow(values) {
  const parts = [Buffer.alloc(2)];
  parts[0].writeInt16BE(values.length, 0);
  for (const val of values) {
    if (val === null || val === undefined) {
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeInt32BE(-1, 0);
      parts.push(lenBuf);
    } else {
      const valBuf = Buffer.from(String(val), 'utf8');
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeInt32BE(valBuf.length, 0);
      parts.push(lenBuf, valBuf);
    }
  }
  return buildPgMessage('D', Buffer.concat(parts));
}

function createMockPgServer(pgStats) {
  const authOk = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0]);
  const readyForQuery = Buffer.from([0x5a, 0, 0, 0, 5, 0x49]);

  return net.createServer((socket) => {
    let startupDone = false;
    let buf = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        if (!startupDone) {
          const msgLen = buf.readInt32BE(0);
          if (buf.length < msgLen) break;
          const code = buf.length >= 8 ? buf.readInt32BE(4) : 0;
          buf = buf.subarray(msgLen);
          if (code === 80877103) {
            socket.write('N'); // reject SSL cleanly
            continue;
          }
          startupDone = true;
          socket.write(Buffer.concat([authOk, readyForQuery]));
          continue;
        }

        if (buf.length < 5) break;
        const type = String.fromCharCode(buf[0]);
        const msgLen = buf.readInt32BE(1);
        if (buf.length < 1 + msgLen) break;
        const payload = buf.subarray(5, 1 + msgLen);
        buf = buf.subarray(1 + msgLen);

        if (type === 'X') {
          socket.end();
          return;
        }
        if (type === 'Q') {
          const sql = payload.toString('utf8').replace(/\0+$/, '');
          if (sql.includes('pg_stat_statements')) {
            const rowDesc = buildRowDescription([
              { name: 'queryid', oid: 25, size: -1 },
              { name: 'calls', oid: 20, size: 8 },
              { name: 'total_exec_time', oid: 701, size: 8 },
            ]);
            const rows =
              pgStats.calls > 0
                ? [buildDataRow(['123456789', pgStats.calls, pgStats.total_exec_time.toFixed(3)])]
                : [];
            const cmdComplete = buildPgMessage('C', Buffer.from(`SELECT ${rows.length}\0`, 'utf8'));
            socket.write(Buffer.concat([rowDesc, ...rows, cmdComplete, readyForQuery]));
          } else {
            const rowDesc = buildRowDescription([{ name: '?column?', oid: 23, size: 4 }]);
            const dataRow = buildDataRow(['1']);
            const cmdComplete = buildPgMessage('C', Buffer.from('SELECT 1\0', 'utf8'));
            socket.write(Buffer.concat([rowDesc, dataRow, cmdComplete, readyForQuery]));
          }
        }
      }
    });
  });
}

function createMockAppServer({
  instanceName,
  cacheMap,
  lockMap,
  pgStats,
  ttlMs = 150,
  overrideConfig = null,
  shouldInjectError = null,
}) {
  const server = http.createServer(async (req, res) => {
    const recvTs = Date.now();
    const sendJson = (status, obj, extraHeaders = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
      res.end(JSON.stringify(obj));
    };

    if (req.url === '/healthz') {
      return sendJson(200, { status: 'ok' });
    }

    if (req.url === '/config') {
      const addr = server.address();
      const cfg = {
        instance: instanceName,
        port: typeof addr === 'object' && addr ? addr.port : 3001,
        node_version: process.version,
        git_commit: 'selftest',
        params: {
          cache_ttl_ms: ttlMs,
          pg_pool_max: 10,
          lock_lease_ms: 5000,
          wait_poll_ms: 5,
          wait_timeout_ms: 2000,
          target_sql: 'SELECT p.id ...',
          ...(overrideConfig?.params || {}),
        },
        ...(overrideConfig?.top || {}),
      };
      return sendJson(200, cfg);
    }

    if (req.url === '/products/1') {
      const mode = req.headers['x-cache-mode'];
      const reqId = String(req.headers['x-request-id'] || '');
      if (mode !== 'plain' && mode !== 'coalesced') {
        return sendJson(400, { error: 'bad mode' });
      }

      if (shouldInjectError && shouldInjectError(reqId, mode)) {
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'X-Instance': instanceName,
          'X-Server-Recv-Ts': String(recvTs),
        });
        return res.end(JSON.stringify({ error: 'injected test error' }));
      }

      const now = Date.now();
      const cached = cacheMap.get('cache:product:1');
      if (cached && cached.expiresAt > now) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Cache-Result': 'hit',
          'X-DB-Queries': '0',
          'X-Pool-Wait-Ms': '0',
          'X-Query-Ms': '0',
          'X-Lock-Wait-Ms': '0',
          'X-Server-Recv-Ts': String(recvTs),
          'X-Instance': instanceName,
        });
        return res.end(cached.value);
      }

      if (mode === 'plain') {
        await new Promise((r) => setTimeout(r, 8));
        pgStats.calls += 1;
        pgStats.total_exec_time += 8;
        cacheMap.set('cache:product:1', { value: CANONICAL_BODY, expiresAt: Date.now() + ttlMs });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Cache-Result': 'miss-query',
          'X-DB-Queries': '1',
          'X-Pool-Wait-Ms': '0.2',
          'X-Query-Ms': '8.0',
          'X-Lock-Wait-Ms': '0',
          'X-Server-Recv-Ts': String(recvTs),
          'X-Instance': instanceName,
        });
        return res.end(CANONICAL_BODY);
      }

      // coalesced mode
      const lockKey = 'lock:product:1';
      const existingLock = lockMap.get(lockKey);
      if (!existingLock || existingLock.expiresAt <= Date.now()) {
        const token = `${instanceName}-${Math.random()}`;
        lockMap.set(lockKey, { token, expiresAt: Date.now() + 5000 });
        const recheck = cacheMap.get('cache:product:1');
        if (recheck && recheck.expiresAt > Date.now()) {
          if (lockMap.get(lockKey)?.token === token) lockMap.delete(lockKey);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'X-Cache-Result': 'hit',
            'X-DB-Queries': '0',
            'X-Pool-Wait-Ms': '0',
            'X-Query-Ms': '0',
            'X-Lock-Wait-Ms': '0',
            'X-Server-Recv-Ts': String(recvTs),
            'X-Instance': instanceName,
          });
          return res.end(recheck.value);
        }

        await new Promise((r) => setTimeout(r, 8));
        pgStats.calls += 1;
        pgStats.total_exec_time += 8;
        cacheMap.set('cache:product:1', { value: CANONICAL_BODY, expiresAt: Date.now() + ttlMs });
        if (lockMap.get(lockKey)?.token === token) lockMap.delete(lockKey);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Cache-Result': 'miss-query',
          'X-DB-Queries': '1',
          'X-Pool-Wait-Ms': '0.2',
          'X-Query-Ms': '8.0',
          'X-Lock-Wait-Ms': '0',
          'X-Server-Recv-Ts': String(recvTs),
          'X-Instance': instanceName,
        });
        return res.end(CANONICAL_BODY);
      }

      // waiter loop
      const waitStart = Date.now();
      while (Date.now() - waitStart < 1500) {
        await new Promise((r) => setTimeout(r, 5));
        const val = cacheMap.get('cache:product:1');
        if (val && val.expiresAt > Date.now()) {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'X-Cache-Result': 'miss-wait',
            'X-DB-Queries': '0',
            'X-Pool-Wait-Ms': '0',
            'X-Query-Ms': '0',
            'X-Lock-Wait-Ms': String(Date.now() - waitStart),
            'X-Server-Recv-Ts': String(recvTs),
            'X-Instance': instanceName,
          });
          return res.end(val.value);
        }
      }

      pgStats.calls += 1;
      pgStats.total_exec_time += 8;
      cacheMap.set('cache:product:1', { value: CANONICAL_BODY, expiresAt: Date.now() + ttlMs });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Cache-Result': 'miss-fallback',
        'X-DB-Queries': '1',
        'X-Pool-Wait-Ms': '0.1',
        'X-Query-Ms': '8.0',
        'X-Lock-Wait-Ms': String(Date.now() - waitStart),
        'X-Server-Recv-Ts': String(recvTs),
        'X-Instance': instanceName,
      });
      return res.end(CANONICAL_BODY);
    }

    return sendJson(404, { error: 'not found' });
  });

  server.keepAliveTimeout = 60000;
  return server;
}

async function listenServer(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(() => resolve()));
}

async function runTests() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c5-bench-selftest-'));
  const cacheMap = new Map();
  const lockMap = new Map();
  const pgStats = { calls: 0, total_exec_time: 0 };

  const redisSrv = createMockRedisServer(cacheMap);
  const pgSrv = createMockPgServer(pgStats);

  let mismatchFlag = false;
  let injectErrorOnce = false;

  const app1 = createMockAppServer({
    instanceName: 'app1',
    cacheMap,
    lockMap,
    pgStats,
    ttlMs: 150,
    shouldInjectError: (reqId, mode) => {
      if (injectErrorOnce && mode === 'plain' && reqId.endsWith('-5') && !reqId.startsWith('warmup-')) {
        injectErrorOnce = false;
        return true;
      }
      return false;
    },
  });

  const app2 = createMockAppServer({
    instanceName: 'app2',
    cacheMap,
    lockMap,
    pgStats,
    ttlMs: 150,
    overrideConfig: {
      get params() {
        return mismatchFlag ? { cache_ttl_ms: 999 } : {};
      },
    },
  });

  try {
    const redisPort = await listenServer(redisSrv);
    const pgPort = await listenServer(pgSrv);
    const app1Port = await listenServer(app1);
    const app2Port = await listenServer(app2);

    const baseEnv = {
      APP_URLS: `http://127.0.0.1:${app1Port},http://127.0.0.1:${app2Port}`,
      REDIS_URL: `redis://127.0.0.1:${redisPort}`,
      STATS_DATABASE_URL: `postgres://bench_ro:bench_pass@127.0.0.1:${pgPort}/shop`,
      PAIRS: '1',
      BURST_SIZE: '200',
      ORDER_SEED: '20261117',
    };

    // 1. Config mismatch check
    mismatchFlag = true;
    await assert.rejects(
      () => runBenchmark({ ...baseEnv, RESULTS_DIR: path.join(tempRoot, 't1'), RESULTS_KIND: 'pilot' }),
      /Config mismatch params/,
    );
    mismatchFlag = false;
    console.log('PASS: /config params mismatch fails immediately (while instance/port differences are allowed).');

    // 2. Valid PAIRS=1, BURST_SIZE=200 end-to-end test
    const t2Dir = path.join(tempRoot, 't2');
    const t2Res = await runBenchmark({
      ...baseEnv,
      RESULTS_DIR: t2Dir,
      RESULTS_KIND: 'pilot',
    });
    assert.equal(t2Res.summaries.length, 2);
    for (const s of t2Res.summaries) {
      assert.equal(s.valid, true, `Expected valid=true for ${s.run_id}, got ${s.invalid_reasons}`);
      assert.equal(s.n_ok, 200);
      assert.equal(s.n_error, 0);
      assert.equal(s.queries_per_expiry, s.sum_db_queries_from_headers);
      assert.equal(s.instance_counts.app1, 100);
      assert.equal(s.instance_counts.app2, 100);
      assert.ok(s.burst_span_ms <= 100, `Expected burst_span_ms <= 100, got ${s.burst_span_ms}`);

      const runDir = path.join(t2Dir, 'pilot', s.run_id);
      assert.ok(fs.existsSync(path.join(runDir, 'config.json')));
      assert.ok(fs.existsSync(path.join(runDir, 'snapshots', 'before.json')));
      assert.ok(fs.existsSync(path.join(runDir, 'snapshots', 'after.json')));
      assert.ok(fs.existsSync(path.join(runDir, 'summary.json')));
      const reqLines = fs.readFileSync(path.join(runDir, 'requests.jsonl'), 'utf8').trim().split('\n');
      assert.equal(reqLines.length, 200);
      const sampleReq = JSON.parse(reqLines[0]);
      for (const field of [
        'run_id',
        'mode',
        'seq',
        'instance',
        't_send_mono_ms',
        'duration_ms',
        'status',
        'payload_sha256',
        'cache_result',
        'db_queries',
        'pool_wait_ms',
        'query_ms',
        'lock_wait_ms',
        'server_recv_ts',
      ]) {
        assert.ok(field in sampleReq, `Missing field ${field} in requests.jsonl`);
      }
    }

    assert.ok(fs.existsSync(path.join(t2Dir, 'pilot', 'summary.csv')));
    assert.ok(fs.existsSync(path.join(t2Dir, 'pilot', 'report_table.md')));

    // Independent CLI recomputation check
    const aggScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/aggregate.js');
    execFileSync(process.execPath, [aggScript, path.join(t2Dir, 'pilot')], { stdio: 'pipe' });
    const recomputed = recomputeAndAggregateDir(path.join(t2Dir, 'pilot'));
    assert.equal(recomputed.summaries.length, 2);
    console.log('PASS: End-to-end PAIRS=1 BURST_SIZE=200 + independent aggregate recomputation.');

    // 3. Invalid run preserved + replacement run succeeds
    cacheMap.clear();
    lockMap.clear();
    injectErrorOnce = true;
    const t3Dir = path.join(tempRoot, 't3');
    const t3Res = await runBenchmark({
      ...baseEnv,
      BURST_SIZE: '40',
      RESULTS_DIR: t3Dir,
      RESULTS_KIND: 'pilot',
      MAX_RETRIES: '2',
    });
    assert.equal(t3Res.summaries.length, 3);
    const invalidRuns = t3Res.summaries.filter((s) => !s.valid);
    const validRuns = t3Res.summaries.filter((s) => s.valid);
    assert.equal(invalidRuns.length, 1);
    assert.equal(validRuns.length, 2);
    assert.ok(invalidRuns[0].invalid_reasons.some((r) => r.startsWith('non_200_or_timeout')));
    assert.ok(fs.existsSync(path.join(t3Dir, 'pilot', invalidRuns[0].run_id, 'requests.jsonl')));
    console.log('PASS: Invalid run preserved on disk with invalid_reasons and replaced cleanly.');

    // 4. Unit test: v1.1 rule — coalesced fallback & queries > 1 stay valid=true; nearest-rank p95
    const syntheticReqs = Array.from({ length: 20 }, (_, idx) => ({
      seq: idx + 1,
      status: 200,
      duration_ms: (idx + 1) * 5,
      payload_sha256: CANONICAL_SHA,
      cache_result: idx === 0 ? 'miss-query' : idx === 1 ? 'miss-fallback' : 'miss-wait',
      db_queries: idx < 2 ? 1 : 0,
      pool_wait_ms: 0.1,
      query_ms: idx < 2 ? 10 : 0,
      lock_wait_ms: idx >= 2 ? 12 : 0,
      server_recv_ts: 1000 + idx,
      instance: idx % 2 === 0 ? 'app1' : 'app2',
    }));
    const synthSummary = computeRunSummary({
      run_id: '20261118T000000Z-coalesced-1',
      mode: 'coalesced',
      pair: 1,
      requests: syntheticReqs,
      beforeSnap: { calls: 10 },
      afterSnap: { calls: 12 },
      expiry_confirmed: true,
      expectedBurstSize: 20,
      baselinePayloadSha256: CANONICAL_SHA,
    });
    assert.equal(synthSummary.valid, true);
    assert.equal(synthSummary.miss_fallback_count, 1);
    assert.equal(synthSummary.queries_per_expiry, 2);
    assert.equal(synthSummary.p95_ms, 95); // ceil(0.95 * 20) = 19th item -> 95
    assert.equal(nearestRankPercentile([10, 20, 30, 40], 95), 40);
    console.log('PASS: Contract v1.1 fallback validity rule and nearest-rank p95 calculation.');
  } finally {
    await Promise.allSettled([
      closeServer(app1),
      closeServer(app2),
      closeServer(redisSrv),
      closeServer(pgSrv),
    ]);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
