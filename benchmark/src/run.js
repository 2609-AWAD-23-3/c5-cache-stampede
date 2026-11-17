// STUB — Phúc triển khai theo CONTRACT.md mục 6–8.
// Việc cần làm (theo thứ tự):
//   1. Đọc env: APP_URLS, REDIS_URL, STATS_DATABASE_URL, PAIRS, BURST_SIZE, RESULTS_DIR, RESULTS_KIND, ORDER_SEED.
//   2. /healthz + /config hai instance; fail nếu config khác nhau (trừ `instance`).
//   3. Với mỗi lượt trong thứ tự xen kẽ (xáo bằng ORDER_SEED): warm-up, làm đầy cache, snapshot before,
//      chờ key hết hạn thật, bắn BURST_SIZE request đồng loạt (200 keep-alive connection, 100/instance),
//      snapshot after, kiểm validity, ghi results/<kind>/<run_id>/*.
//   4. Tổng hợp summary.csv và report_table.md; in bảng ra stdout.
// Phát triển song song bằng stub service theo CONTRACT.md, không chờ app thật.
console.log('benchmark runner: not implemented yet (see CONTRACT.md)');
process.exit(1);
