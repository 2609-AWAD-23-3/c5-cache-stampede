import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { round3 } from './stats.js';

/** Compute nearest-rank percentile p (0-100) on a pre-sorted ascending array. */
export function nearestRankPercentile(sortedAscValues, p) {
  if (!Array.isArray(sortedAscValues) || sortedAscValues.length === 0) {
    return null;
  }
  const idx = Math.max(0, Math.ceil((p / 100) * sortedAscValues.length) - 1);
  return round3(sortedAscValues[idx]);
}

/** Compute median of finite numeric values; returns null when empty. */
export function median(values) {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return round3(sorted[mid]);
  }
  return round3((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Compute { median, min, max, n } summary stats for a list of numbers. */
export function summarizeSeries(values) {
  const valid = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) {
    return { median: null, min: null, max: null, n: 0 };
  }
  return {
    median: median(valid),
    min: round3(Math.min(...valid)),
    max: round3(Math.max(...valid)),
    n: valid.length,
  };
}

/**
 * Compute run summary metrics and validity flags per CONTRACT.md sections 7 & 8.
 * Does NOT treat coalesced miss-fallback or queries_per_expiry > 1 as invalid.
 */
export function computeRunSummary({
  run_id,
  mode,
  pair,
  attempt = 1,
  requests,
  beforeSnap,
  afterSnap,
  expiry_confirmed,
  expiry_confirmed_ts = null,
  burst_start_ts = null,
  expectedBurstSize,
  baselinePayloadSha256,
}) {
  const queries_per_expiry = Number(afterSnap.calls) - Number(beforeSnap.calls);

  let sum_db_queries_from_headers = 0;
  let hit_count = 0;
  let miss_query_count = 0;
  let miss_wait_count = 0;
  let miss_fallback_count = 0;
  const instance_counts = {};
  const okRequests = [];
  const recvTimestamps = [];

  for (const r of requests) {
    if (Number.isFinite(r.db_queries)) {
      sum_db_queries_from_headers += r.db_queries;
    }

    if (r.instance) {
      instance_counts[r.instance] = (instance_counts[r.instance] ?? 0) + 1;
    }

    if (r.status === 200) {
      okRequests.push(r);
    }

    if (Number.isFinite(r.server_recv_ts) && r.server_recv_ts > 0) {
      recvTimestamps.push(r.server_recv_ts);
    }

    switch (r.cache_result) {
      case 'hit':
        hit_count += 1;
        break;
      case 'miss-query':
        miss_query_count += 1;
        break;
      case 'miss-wait':
        miss_wait_count += 1;
        break;
      case 'miss-fallback':
        miss_fallback_count += 1;
        break;
      default:
        break;
    }
  }

  const n_ok = okRequests.length;
  const n_error = requests.length - n_ok;

  const durationsAsc = okRequests
    .map((r) => r.duration_ms)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);

  const p95_ms = nearestRankPercentile(durationsAsc, 95);
  const p50_ms = nearestRankPercentile(durationsAsc, 50);
  const max_ms = durationsAsc.length > 0 ? round3(durationsAsc[durationsAsc.length - 1]) : null;
  const min_ms = durationsAsc.length > 0 ? round3(durationsAsc[0]) : null;

  const burst_span_ms =
    recvTimestamps.length === expectedBurstSize && recvTimestamps.length > 0
      ? round3(Math.max(...recvTimestamps) - Math.min(...recvTimestamps))
      : null;

  const hit_rate = n_ok > 0 ? round3(hit_count / n_ok) : null;
  const median_lock_wait_ms = median(okRequests.map((r) => r.lock_wait_ms));
  const median_pool_wait_ms = median(okRequests.map((r) => r.pool_wait_ms));
  const median_query_ms = median(okRequests.filter((r) => r.db_queries > 0).map((r) => r.query_ms));

  const invalid_reasons = [];

  if (n_error > 0 || n_ok !== expectedBurstSize) {
    invalid_reasons.push(`non_200_or_timeout: n_ok=${n_ok}/${expectedBurstSize}, n_error=${n_error}`);
  }

  if (!baselinePayloadSha256 || okRequests.some((r) => r.payload_sha256 !== baselinePayloadSha256)) {
    invalid_reasons.push('payload_sha256_mismatch');
  }

  if (!expiry_confirmed) {
    invalid_reasons.push('expiry_not_confirmed');
  }

  if (burst_span_ms === null) {
    invalid_reasons.push('burst_span_missing_timestamps');
  } else if (burst_span_ms > 100) {
    invalid_reasons.push(`burst_span_exceeded: ${burst_span_ms}ms > 100ms`);
  }

  if (okRequests.some((r) => !Number.isFinite(r.db_queries))) {
    invalid_reasons.push('missing_x_db_queries_header');
  }

  if (sum_db_queries_from_headers !== queries_per_expiry) {
    invalid_reasons.push(
      `db_queries_mismatch: headers=${sum_db_queries_from_headers} vs pg_stat_statements=${queries_per_expiry}`,
    );
  }

  return {
    mode,
    pair,
    attempt,
    run_id,
    queries_per_expiry,
    sum_db_queries_from_headers,
    p95_ms,
    p50_ms,
    max_ms,
    min_ms,
    n_ok,
    n_error,
    burst_span_ms,
    expiry_confirmed: Boolean(expiry_confirmed),
    expiry_confirmed_ts,
    burst_start_ts,
    hit_count,
    miss_query_count,
    miss_wait_count,
    miss_fallback_count,
    hit_rate,
    median_lock_wait_ms,
    median_pool_wait_ms,
    median_query_ms,
    instance_counts,
    valid: invalid_reasons.length === 0,
    invalid_reasons,
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function fmtStat(stat, unit = '') {
  if (!stat || stat.n === 0 || stat.median === null) return '—';
  const suffix = unit ? ` ${unit}` : '';
  return `${stat.median} (${stat.min}–${stat.max})${suffix}`;
}

function fmtNum(val) {
  return val === null || val === undefined ? '—' : String(val);
}

/**
 * Compute paired and per-mode aggregates and write summary.csv + report_table.md.
 * Returns the rendered markdown report table string.
 */
export function writeAggregateOutputs(kindDir, summaries) {
  fs.mkdirSync(kindDir, { recursive: true });

  const sortedRuns = [...summaries].sort((a, b) => {
    if (a.pair !== b.pair) return a.pair - b.pair;
    if (a.run_id !== b.run_id) return a.run_id.localeCompare(b.run_id);
    return a.attempt - b.attempt;
  });

  const csvHeader = [
    'run_id',
    'pair',
    'mode',
    'valid',
    'queries_per_expiry',
    'sum_db_queries_from_headers',
    'p95_ms',
    'p50_ms',
    'max_ms',
    'burst_span_ms',
    'n_ok',
    'n_error',
    'hit_count',
    'miss_query_count',
    'miss_wait_count',
    'miss_fallback_count',
    'invalid_reasons',
  ].join(',');

  const csvRows = sortedRuns.map((s) =>
    [
      s.run_id,
      s.pair,
      s.mode,
      s.valid,
      s.queries_per_expiry,
      s.sum_db_queries_from_headers,
      s.p95_ms,
      s.p50_ms,
      s.max_ms,
      s.burst_span_ms,
      s.n_ok,
      s.n_error,
      s.hit_count,
      s.miss_query_count,
      s.miss_wait_count,
      s.miss_fallback_count,
      (s.invalid_reasons || []).join('; '),
    ]
      .map(csvCell)
      .join(','),
  );

  fs.writeFileSync(path.join(kindDir, 'summary.csv'), `${[csvHeader, ...csvRows].join('\n')}\n`, 'utf8');

  const validRuns = sortedRuns.filter((s) => s.valid);
  const plainRuns = validRuns.filter((s) => s.mode === 'plain');
  const coalescedRuns = validRuns.filter((s) => s.mode === 'coalesced');

  const byPair = new Map();
  for (const s of validRuns) {
    if (!byPair.has(s.pair)) byPair.set(s.pair, {});
    byPair.get(s.pair)[s.mode] = s;
  }

  const pairedRows = [];
  for (const pairNum of [...byPair.keys()].sort((a, b) => a - b)) {
    const entry = byPair.get(pairNum);
    if (entry.plain && entry.coalesced) {
      pairedRows.push({
        pair: pairNum,
        plain: entry.plain,
        coalesced: entry.coalesced,
        queries_saved: entry.plain.queries_per_expiry - entry.coalesced.queries_per_expiry,
        delta_p95_ms: round3(entry.coalesced.p95_ms - entry.plain.p95_ms),
      });
    }
  }

  const plainQueriesStats = summarizeSeries(plainRuns.map((s) => s.queries_per_expiry));
  const coalescedQueriesStats = summarizeSeries(coalescedRuns.map((s) => s.queries_per_expiry));
  const queriesSavedStats = summarizeSeries(pairedRows.map((p) => p.queries_saved));

  const plainP95Stats = summarizeSeries(plainRuns.map((s) => s.p95_ms));
  const coalescedP95Stats = summarizeSeries(coalescedRuns.map((s) => s.p95_ms));
  const pairDeltaP95Stats = summarizeSeries(pairedRows.map((p) => p.delta_p95_ms));

  const plainP50Stats = summarizeSeries(plainRuns.map((s) => s.p50_ms));
  const coalescedP50Stats = summarizeSeries(coalescedRuns.map((s) => s.p50_ms));
  const pairDeltaP50Stats = summarizeSeries(pairedRows.map((p) => round3(p.coalesced.p50_ms - p.plain.p50_ms)));

  const plainSpanStats = summarizeSeries(plainRuns.map((s) => s.burst_span_ms));
  const coalescedSpanStats = summarizeSeries(coalescedRuns.map((s) => s.burst_span_ms));

  const coalescedFallbackStats = summarizeSeries(coalescedRuns.map((s) => s.miss_fallback_count));
  const plainHitRateStats = summarizeSeries(plainRuns.map((s) => s.hit_rate));
  const coalescedHitRateStats = summarizeSeries(coalescedRuns.map((s) => s.hit_rate));

  const fallbackOrMultiQueryRuns = coalescedRuns.filter(
    (s) => s.miss_fallback_count > 0 || s.queries_per_expiry > 1,
  );

  const lines = [];
  lines.push('# Benchmark Report Table');
  lines.push('');
  lines.push(
    `- Valid runs: **${validRuns.length}** / ${sortedRuns.length} total (Plain: ${plainRuns.length}, Coalesced: ${coalescedRuns.length}, Complete valid pairs: ${pairedRows.length})`,
  );
  lines.push('- All latencies use nearest-rank percentile on `status == 200` requests.');
  lines.push('- `delta_p95_ms = p95_coalesced - p95_plain` (negative means p95 latency decreased).');
  lines.push('');
  lines.push('## 1. Aggregate Summary (median (min–max))');
  lines.push('');
  lines.push('| Metric | Plain (`plain`) | Coalesced (`coalesced`) | Paired Difference / Saved |');
  lines.push('| --- | --- | --- | --- |');
  lines.push(
    `| Queries per expiry (\`queries_per_expiry\`) | ${fmtStat(plainQueriesStats)} | ${fmtStat(coalescedQueriesStats)} | **queries_saved**: ${fmtStat(queriesSavedStats)} |`,
  );
  lines.push(
    `| Median of run p95 (\`median_of_run_p95_ms\`) | ${fmtStat(plainP95Stats, 'ms')} | ${fmtStat(coalescedP95Stats, 'ms')} | **median_of_pair_delta_p95_ms**: ${fmtStat(pairDeltaP95Stats, 'ms')} |`,
  );
  lines.push(
    `| Median of run p50 (\`p50_ms\`) | ${fmtStat(plainP50Stats, 'ms')} | ${fmtStat(coalescedP50Stats, 'ms')} | delta_p50_ms: ${fmtStat(pairDeltaP50Stats, 'ms')} |`,
  );
  lines.push(
    `| Burst span (\`burst_span_ms\`) | ${fmtStat(plainSpanStats, 'ms')} | ${fmtStat(coalescedSpanStats, 'ms')} | — |`,
  );
  lines.push(
    `| First-read hit rate (\`hit_rate\`) | ${fmtStat(plainHitRateStats)} | ${fmtStat(coalescedHitRateStats)} | — |`,
  );
  lines.push(
    `| Coalesced fallbacks (\`miss_fallback_count\`) | — | ${fmtStat(coalescedFallbackStats)} | — |`,
  );

  if (fallbackOrMultiQueryRuns.length > 0) {
    const noFallbackCoalesced = coalescedRuns.filter(
      (s) => s.miss_fallback_count === 0 && s.queries_per_expiry === 1,
    );
    const noFallbackP95 = summarizeSeries(noFallbackCoalesced.map((s) => s.p95_ms));
    const noFallbackPairs = pairedRows.filter(
      (p) => p.coalesced.miss_fallback_count === 0 && p.coalesced.queries_per_expiry === 1,
    );
    const noFallbackDeltaP95 = summarizeSeries(noFallbackPairs.map((p) => p.delta_p95_ms));
    lines.push('');
    lines.push(
      `> Sensitivity (excluding ${fallbackOrMultiQueryRuns.length} valid coalesced run(s) with fallback or queries > 1): ` +
        `coalesced p95 = ${fmtStat(noFallbackP95, 'ms')}, ` +
        `paired delta_p95_ms = ${fmtStat(noFallbackDeltaP95, 'ms')} (n=${noFallbackPairs.length} pairs).`,
    );
  }

  lines.push('');
  lines.push('## 2. Paired Results');
  lines.push('');
  lines.push(
    '| Pair | Plain `run_id` | Plain queries | Plain p95 (ms) | Coalesced `run_id` | Coalesced queries | Coalesced p95 (ms) | `queries_saved` | `delta_p95_ms` (ms) | Coalesced fallbacks |',
  );
  lines.push('| ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const p of pairedRows) {
    lines.push(
      `| ${p.pair} | \`${p.plain.run_id}\` | ${p.plain.queries_per_expiry} | ${fmtNum(p.plain.p95_ms)} | \`${p.coalesced.run_id}\` | ${p.coalesced.queries_per_expiry} | ${fmtNum(p.coalesced.p95_ms)} | ${p.queries_saved} | ${p.delta_p95_ms} | ${p.coalesced.miss_fallback_count} |`,
    );
  }

  lines.push('');
  lines.push('## 3. All Recorded Runs');
  lines.push('');
  lines.push(
    '| `run_id` | Pair | Mode | Valid | Queries | Header sum | p50 (ms) | p95 (ms) | max (ms) | Burst span (ms) | Hits | Miss-query | Miss-wait | Miss-fallback | Invalid reasons |',
  );
  lines.push('| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const s of sortedRuns) {
    lines.push(
      `| \`${s.run_id}\` | ${s.pair} | ${s.mode} | ${s.valid} | ${s.queries_per_expiry} | ${s.sum_db_queries_from_headers} | ${fmtNum(s.p50_ms)} | ${fmtNum(s.p95_ms)} | ${fmtNum(s.max_ms)} | ${fmtNum(s.burst_span_ms)} | ${s.hit_count} | ${s.miss_query_count} | ${s.miss_wait_count} | ${s.miss_fallback_count} | ${(s.invalid_reasons || []).join('; ') || '—'} |`,
    );
  }
  lines.push('');

  const markdown = lines.join('\n');
  fs.writeFileSync(path.join(kindDir, 'report_table.md'), markdown, 'utf8');
  return markdown;
}

/**
 * Recompute summaries independently from raw run artifacts inside kindDir
 * and verify against each stored summary.json, then regenerate CSV & Markdown.
 */
export function recomputeAndAggregateDir(kindDir) {
  const entries = fs.readdirSync(kindDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  const recomputed = [];

  for (const dir of entries) {
    const runDir = path.join(kindDir, dir.name);
    const reqPath = path.join(runDir, 'requests.jsonl');
    const beforePath = path.join(runDir, 'snapshots', 'before.json');
    const afterPath = path.join(runDir, 'snapshots', 'after.json');
    const cfgPath = path.join(runDir, 'config.json');
    const summaryPath = path.join(runDir, 'summary.json');

    if (!fs.existsSync(reqPath) || !fs.existsSync(beforePath) || !fs.existsSync(afterPath) || !fs.existsSync(cfgPath)) {
      continue;
    }

    const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const beforeSnap = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
    const afterSnap = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
    const rawLines = fs
      .readFileSync(reqPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
    const requests = rawLines.map((line) => JSON.parse(line));

    const summary = computeRunSummary({
      run_id: config.run_id ?? dir.name,
      mode: config.mode,
      pair: config.pair,
      attempt: config.attempt ?? 1,
      requests,
      beforeSnap,
      afterSnap,
      expiry_confirmed: config.expiry_confirmed,
      expiry_confirmed_ts: config.expiry_confirmed_ts ?? null,
      burst_start_ts: config.burst_start_ts ?? null,
      expectedBurstSize: config.burst_size,
      baselinePayloadSha256: config.baseline_payload_sha256,
    });

    if (fs.existsSync(summaryPath)) {
      const stored = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      const keysToCheck = [
        'queries_per_expiry',
        'sum_db_queries_from_headers',
        'p95_ms',
        'p50_ms',
        'max_ms',
        'n_ok',
        'n_error',
        'burst_span_ms',
        'hit_count',
        'miss_query_count',
        'miss_wait_count',
        'miss_fallback_count',
        'valid',
      ];
      for (const k of keysToCheck) {
        if (stored[k] !== summary[k]) {
          throw new Error(
            `Summary mismatch for ${dir.name} field ${k}: stored=${stored[k]} vs recomputed=${summary[k]}`,
          );
        }
      }
    }

    recomputed.push(summary);
  }

  const markdown = writeAggregateOutputs(kindDir, recomputed);
  return { summaries: recomputed, markdown };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const defaultDir = path.join(process.env.RESULTS_DIR || '/results', process.env.RESULTS_KIND || 'pilot');
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultDir;
  const { markdown } = recomputeAndAggregateDir(targetDir);
  console.log(markdown);
}
