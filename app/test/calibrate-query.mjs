// Checklist #9: đo thời gian query mục tiêu đơn lẻ (không tải) qua app, mode plain.
// Dùng: SEED_REVIEWS đã seed sẵn trong stack đang chạy. `node app/test/calibrate-query.mjs [n]`
import { PORTS, product, psql, quantile, redisCli, stamp, writeEvidence } from './lib.mjs';

const n = Number(process.argv[2] || 30);
const seed = Number(psql('select count(*) from reviews'));
const queryMs = [];
const poolWaitMs = [];

for (let i = 0; i < n + 3; i++) {
  redisCli('DEL', 'cache:product:1');
  const r = await product(PORTS.app1, 'plain', `calibrate-${i}`);
  if (r.status !== 200 || r.headers['x-cache-result'] !== 'miss-query') throw new Error(`unexpected ${r.status} ${r.headers['x-cache-result']}`);
  if (i < 3) continue; // bỏ 3 lần đầu (cache trang Postgres còn lạnh)
  queryMs.push(Number(r.headers['x-query-ms']));
  poolWaitMs.push(Number(r.headers['x-pool-wait-ms']));
}

const explain = [];
for (let i = 0; i < 5; i++) {
  const out = psql(
    `explain (analyze, timing off) SELECT p.id, p.name, p.price_cents, COUNT(r.id)::int AS review_count, ROUND(AVG(r.rating), 3)::float AS avg_rating FROM products p LEFT JOIN reviews r ON r.product_id = p.id WHERE p.id = 1 GROUP BY p.id`,
    'app_user',
  );
  explain.push(Number(out.match(/Execution Time: ([\d.]+)/)[1]));
}

const s = [...queryMs].sort((a, b) => a - b);
const summary = {
  seed_reviews: seed,
  n,
  query_ms: { min: s[0], p50: quantile(s, 0.5), p90: quantile(s, 0.9), max: s.at(-1) },
  explain_execution_ms: explain,
  target: '20-50 ms (CONTRACT.md mục 3, checklist mục 9)',
  within_target: quantile(s, 0.5) >= 20 && quantile(s, 0.9) <= 50,
};
const file = writeEvidence('calibration', `${stamp()}-seed${seed}.json`, { ...summary, raw_query_ms: queryMs, raw_pool_wait_ms: poolWaitMs });
console.log(JSON.stringify(summary), '->', file);
process.exit(0);
