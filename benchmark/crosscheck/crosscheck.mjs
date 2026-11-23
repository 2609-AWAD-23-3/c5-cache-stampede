// Task 6: kiểm độc lập kết quả benchmark.
// KHÔNG import benchmark/src/aggregate.js, chỉ dùng thư viện chuẩn của Node.
// Tính lại từ requests.jsonl, snapshots/*.json, config.json của từng lượt, rồi đối chiếu
// với summary.json, summary.csv, report_table.md. Lệch thì thoát với mã 1.
//
// Dùng: node benchmark/crosscheck/crosscheck.mjs <results/kind> [--out file.md]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const dir = args.find((a, i) => !a.startsWith('--') && !(outIdx >= 0 && i === outIdx + 1));
if (!dir) {
  console.error('Dùng: node benchmark/crosscheck/crosscheck.mjs <results/kind> [--out file.md]');
  process.exit(2);
}

const BURST_SPAN_MAX_MS = 100; // CONTRACT mục 8
const TOL = 0.0015; // file đầu ra làm tròn 3 chữ số thập phân

// ---------- thống kê ----------
const nearestRank = (sorted, p) => sorted[Math.max(1, Math.ceil((p / 100) * sorted.length)) - 1];
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const fmt = (x) => String(r3(x));
const range = (xs) => `${fmt(median(xs))} (${fmt(Math.min(...xs))}–${fmt(Math.max(...xs))})`;
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// ---------- đọc và tính lại từng lượt ----------
const runDirs = fs
  .readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'requests.jsonl')))
  .map((d) => d.name)
  .sort();

const problems = [];
const bad = (msg) => problems.push(msg);
const runs = [];
const known = ['hit', 'miss-query', 'miss-wait', 'miss-fallback'];

for (const id of runDirs) {
  const base = path.join(dir, id);
  const cfg = readJson(path.join(base, 'config.json'));
  const before = readJson(path.join(base, 'snapshots', 'before.json'));
  const after = readJson(path.join(base, 'snapshots', 'after.json'));
  const sum = readJson(path.join(base, 'summary.json'));
  const lines = fs.readFileSync(path.join(base, 'requests.jsonl'), 'utf8').split('\n').filter(Boolean);
  const reqs = lines.map((l, i) => ({ ...JSON.parse(l), line: i + 1 }));
  const ok = reqs.filter((r) => r.status === 200);
  const byDur = [...ok].sort((a, b) => a.duration_ms - b.duration_ms);
  const durs = byDur.map((r) => r.duration_ms);
  const recv = reqs.map((r) => r.server_recv_ts);
  const count = (v) => reqs.filter((r) => r.cache_result === v).length;
  const p95 = nearestRank(durs, 95);
  const p95req = byDur[Math.max(1, Math.ceil(0.95 * durs.length)) - 1];

  const mine = {
    run_id: id,
    mode: cfg.mode,
    pair: cfg.pair,
    attempt: cfg.attempt ?? 1,
    n_ok: ok.length,
    n_error: reqs.length - ok.length,
    queries_per_expiry: after.calls - before.calls,
    sum_db_queries_from_headers: reqs.reduce((a, r) => a + (r.db_queries || 0), 0),
    p95_ms: p95,
    p50_ms: nearestRank(durs, 50),
    max_ms: durs[durs.length - 1],
    burst_span_ms: Math.max(...recv) - Math.min(...recv),
    hit_count: count('hit'),
    miss_query_count: count('miss-query'),
    miss_wait_count: count('miss-wait'),
    miss_fallback_count: count('miss-fallback'),
    median_pool_wait_ms: median(reqs.map((r) => r.pool_wait_ms)),
    median_lock_wait_ms: median(reqs.map((r) => r.lock_wait_ms)),
    // chỉ tính request có chạy query (db_queries > 0); waiter của coalesced không chạy query
    median_query_ms: median(reqs.filter((r) => r.db_queries > 0).map((r) => r.query_ms)),
    p95_req: { line: p95req.line, pool: p95req.pool_wait_ms, lock: p95req.lock_wait_ms, query: p95req.query_ms, result: p95req.cache_result },
    per_instance: reqs.reduce((o, r) => ((o[r.instance] = (o[r.instance] || 0) + 1), o), {}),
    unknown_cache_results: [...new Set(reqs.map((r) => r.cache_result))].filter((v) => !known.includes(v)),
  };

  // validity theo CONTRACT mục 8
  const why = [];
  if (mine.n_error > 0) why.push('status!=200');
  if (reqs.length !== cfg.burst_size) why.push('n_requests!=burst_size');
  if (ok.some((r) => r.payload_sha256 !== cfg.baseline_payload_sha256)) why.push('payload!=baseline');
  if (ok.some((r) => !Number.isFinite(r.db_queries))) why.push('missing-x-db-queries');
  if (cfg.expiry_confirmed !== true) why.push('expiry-not-confirmed');
  if (mine.burst_span_ms > BURST_SPAN_MAX_MS) why.push('burst_span>100ms');
  if (mine.sum_db_queries_from_headers !== mine.queries_per_expiry) why.push('queries-mismatch');
  mine.valid = why.length === 0;
  mine.why = why;
  runs.push(mine);

  // đối chiếu summary.json của lượt
  const eq = (k, tol = 0) => {
    const d = mine[k] - sum[k];
    if (Number.isNaN(d) || Math.abs(d) > tol) bad(`${id}: ${k} tính lại=${r3(mine[k])}, summary.json=${sum[k]}`);
  };
  for (const k of ['n_ok', 'n_error', 'queries_per_expiry', 'sum_db_queries_from_headers',
    'hit_count', 'miss_query_count', 'miss_wait_count', 'miss_fallback_count']) eq(k);
  for (const k of ['p95_ms', 'p50_ms', 'max_ms', 'burst_span_ms',
    'median_pool_wait_ms', 'median_lock_wait_ms', 'median_query_ms']) eq(k, TOL);
  if (sum.valid !== mine.valid) {
    bad(`${id}: valid tính lại=${mine.valid} (${why.join(',')}), summary.json=${sum.valid}`);
  }
  // mỗi request ở plain hoặc hit hoặc miss-query; mỗi miss-query chạy đúng 1 query
  if (mine.mode === 'plain' && mine.queries_per_expiry !== mine.miss_query_count) {
    bad(`${id}: plain nhưng queries_per_expiry=${mine.queries_per_expiry}, miss_query_count=${mine.miss_query_count}`);
  }
  if (mine.mode === 'plain' && mine.hit_count + mine.miss_query_count !== reqs.length) {
    bad(`${id}: plain nhưng hit+miss-query=${mine.hit_count + mine.miss_query_count} khác ${reqs.length} request`);
  }
  if (mine.unknown_cache_results.length) bad(`${id}: cache_result lạ: ${mine.unknown_cache_results.join(',')}`);
}

// ---------- chọn lượt, ghép cặp ----------
// Mỗi (pair, mode): lượt hợp lệ có attempt lớn nhất, bằng nhau thì run_id mới nhất.
const chosen = new Map();
for (const r of runs.filter((x) => x.valid)) {
  const key = `${r.pair}|${r.mode}`;
  const cur = chosen.get(key);
  if (!cur || r.attempt > cur.attempt || (r.attempt === cur.attempt && r.run_id > cur.run_id)) chosen.set(key, r);
}
const pairs = [...new Set(runs.map((r) => r.pair))]
  .sort((a, b) => a - b)
  .map((p) => ({ pair: p, plain: chosen.get(`${p}|plain`), coal: chosen.get(`${p}|coalesced`) }))
  .filter((x) => x.plain && x.coal);
for (const x of pairs) {
  x.delta = x.coal.p95_ms - x.plain.p95_ms;
  x.saved = x.plain.queries_per_expiry - x.coal.queries_per_expiry;
}

const plains = pairs.map((x) => x.plain);
const coals = pairs.map((x) => x.coal);
const agg = {
  plain_p95: range(plains.map((r) => r.p95_ms)),
  coal_p95: range(coals.map((r) => r.p95_ms)),
  plain_q: range(plains.map((r) => r.queries_per_expiry)),
  coal_q: range(coals.map((r) => r.queries_per_expiry)),
  saved: range(pairs.map((x) => x.saved)),
  delta: range(pairs.map((x) => x.delta)),
};

// ---------- đối chiếu summary.csv ----------
const csvPath = path.join(dir, 'summary.csv');
if (fs.existsSync(csvPath)) {
  const [head, ...rows] = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',');
  const byId = new Map(rows.map((l) => {
    const c = l.split(',');
    return [c[cols.indexOf('run_id')], Object.fromEntries(cols.map((k, i) => [k, c[i]]))];
  }));
  if (byId.size !== runs.length) bad(`summary.csv có ${byId.size} dòng, thư mục có ${runs.length} lượt`);
  for (const r of runs) {
    const row = byId.get(r.run_id);
    if (!row) { bad(`summary.csv thiếu ${r.run_id}`); continue; }
    for (const k of ['queries_per_expiry', 'sum_db_queries_from_headers', 'n_ok', 'n_error',
      'hit_count', 'miss_query_count', 'miss_wait_count', 'miss_fallback_count']) {
      if (Number(row[k]) !== r[k]) bad(`summary.csv ${r.run_id}: ${k}=${row[k]}, tính lại=${r[k]}`);
    }
    for (const k of ['p95_ms', 'p50_ms', 'max_ms', 'burst_span_ms']) {
      if (Math.abs(Number(row[k]) - r[k]) > TOL) bad(`summary.csv ${r.run_id}: ${k}=${row[k]}, tính lại=${r3(r[k])}`);
    }
    if ((row.valid === 'true') !== r.valid) bad(`summary.csv ${r.run_id}: valid=${row.valid}, tính lại=${r.valid}`);
  }
} else bad('thiếu summary.csv');

// ---------- đối chiếu report_table.md ----------
const mdPath = path.join(dir, 'report_table.md');
if (fs.existsSync(mdPath)) {
  const md = fs.readFileSync(mdPath, 'utf8');
  const need = [['median p95 plain', agg.plain_p95], ['median p95 coalesced', agg.coal_p95],
    ['queries plain', agg.plain_q], ['queries coalesced', agg.coal_q],
    ['queries_saved', agg.saved], ['median delta_p95_ms', agg.delta]];
  for (const [name, s] of need) if (!md.includes(s)) bad(`report_table.md không chứa "${s}" (${name})`);
  for (const x of pairs) {
    const ok = md.split('\n').some((l) => l.includes(x.plain.run_id) && l.includes(x.coal.run_id) && l.includes(fmt(x.delta)));
    if (!ok) bad(`report_table.md: dòng cặp ${x.pair} không khớp (${x.plain.run_id}, ${x.coal.run_id}, delta ${fmt(x.delta)})`);
  }
} else bad('thiếu report_table.md');

// ---------- báo cáo ----------
const out = [];
const p = (s = '') => out.push(s);
const sm = (set, k) => set.reduce((a, r) => a + r[k], 0);
p(`# Crosscheck ${dir}`);
p();
p(`- Lượt trong thư mục: ${runs.length}; hợp lệ (tính lại): ${runs.filter((r) => r.valid).length}; cặp đủ hai mode hợp lệ: ${pairs.length}`);
for (const r of runs.filter((x) => !x.valid)) p(`- INVALID ${r.run_id}: ${r.why.join(', ')}`);
p();
p('## Số chính (tính lại từ requests.jsonl và snapshots)');
p();
p(`- queries_per_expiry plain: ${agg.plain_q}; coalesced: ${agg.coal_q}; queries_saved: ${agg.saved}`);
p(`- median p95 plain: ${agg.plain_p95} ms; coalesced: ${agg.coal_p95} ms`);
p(`- median delta_p95_ms theo cặp: ${agg.delta} ms (âm nghĩa là coalesced có p95 thấp hơn)`);
p();
p('## Theo cặp (truy về log)');
p();
p('| Pair | plain run | coalesced run | plain queries | plain p95 | coalesced p95 | delta_p95_ms | saved |');
p('| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |');
for (const x of pairs) {
  p(`| ${x.pair} | ${x.plain.run_id} | ${x.coal.run_id} | ${x.plain.queries_per_expiry} | ${fmt(x.plain.p95_ms)} | ${fmt(x.coal.p95_ms)} | ${fmt(x.delta)} | ${x.saved} |`);
}
p();
p('## Nguyên nhân từ log (các lượt đã chọn)');
p();
p('| Mode | median pool_wait_ms | median lock_wait_ms | median query_ms | hit | miss-query | miss-wait | miss-fallback |');
p('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const [name, set] of [['plain', plains], ['coalesced', coals]]) {
  p(`| ${name} | ${fmt(median(set.map((r) => r.median_pool_wait_ms)))} | ${fmt(median(set.map((r) => r.median_lock_wait_ms)))} | ${fmt(median(set.map((r) => r.median_query_ms)))} | ${sm(set, 'hit_count')} | ${sm(set, 'miss_query_count')} | ${sm(set, 'miss_wait_count')} | ${sm(set, 'miss_fallback_count')} |`);
}
p();
p('Request đứng ở vị trí p95 của từng lượt (dòng trong `requests.jsonl`): thời gian của nó gồm chờ pool, chờ lock và chạy query.');
p();
p('| run_id | dòng | cache_result | pool_wait_ms | lock_wait_ms | query_ms | burst_span_ms | hit |');
p('| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |');
for (const x of pairs) {
  for (const r of [x.plain, x.coal]) {
    p(`| ${r.run_id} | ${r.p95_req.line} | ${r.p95_req.result} | ${fmt(r.p95_req.pool)} | ${fmt(r.p95_req.lock)} | ${fmt(r.p95_req.query)} | ${fmt(r.burst_span_ms)} | ${r.hit_count} |`);
  }
}
p();
p('## Kết quả đối chiếu');
p();
if (problems.length) {
  p(`**FAIL**: ${problems.length} điểm lệch`);
  for (const m of problems) p(`- ${m}`);
} else {
  p('**PASS**: mọi số tính lại khớp summary.json, summary.csv và report_table.md.');
}

const text = out.join('\n') + '\n';
console.log(text);
if (outFile) fs.writeFileSync(outFile, text);
process.exit(problems.length ? 1 : 0);
