# AI-LOG fragment — Seminar C5 (Bửu Huỳnh Vĩnh Phúc)

Log của Phúc cho phần việc của mình: xác nhận contract (Task 1) và triển khai benchmark runner (Task 4). Ghi theo mẫu trong `ai/README.md`; chỉ ghi phần Phúc tự quyết định/kiểm tra vào mục **By hand**.

## 2026-11-18 — Task 1: Đọc repo và xác nhận `CONTRACT.md` v1.1

- **Tool**: Antigravity.
- **Asked for**: Đọc toàn bộ repo, xác định các việc Phúc cần làm theo độ khả thi, kiểm tra tính khả thi của `CONTRACT.md` v1.1 đối với `benchmark/`, soạn bản nháp comment xác nhận cho Issue #1 để Phúc duyệt trước khi đăng.
- **Kept**: Kế hoạch ưu tiên làm Task 4 (`benchmark/`) song song trước vì không bị block bởi `app/`, và nội dung comment xác nhận `CONTRACT.md` v1.1 trên Issue #1 (`#issuecomment-6973975171`).
- **Changed**: Bổ sung hai lưu ý tích hợp vào comment trên Issue #1: (1) `benchmark` đọc `cache_ttl_ms` từ `GET /config` vì `compose.yaml` không truyền env `CACHE_TTL_MS` cho service `benchmark`; (2) xuất `summary.csv` và `report_table.md` vào `results/<RESULTS_KIND>/` để dùng được cho cả `pilot` và `official`.
- **Rejected**: Không có.
- **By hand**: Phúc đọc bản nháp comment trước khi đồng ý đăng lên GitHub Issue #1 và yêu cầu triển khai Task 4 trên branch mới.
- **Kiểm chứng**: Đã kiểm tra trạng thái GitHub Issues/PRs bằng `gh issue view 1 --comments` và `compose.yaml` trước khi đăng comment.

## 2026-11-18 — Task 4: Triển khai benchmark runner (`benchmark/`)

- **Tool**: Antigravity.
- **Asked for**: Tạo branch `feat/task4-benchmark-runner`, triển khai `benchmark/src/stats.js`, `benchmark/src/aggregate.js`, `benchmark/src/run.js`, `benchmark/test/selftest.js` theo `CONTRACT.md` v1.1 (mục 2, 3, 5, 6, 7, 8) và chạy kiểm chứng.
- **Kept**:
  - `benchmark/src/stats.js`: snapshot `pg_stat_statements` dưới role `bench_ro` (không gọi `pg_stat_statements_reset()`), chờ key hết hạn tự nhiên bằng `PTTL`/`EXISTS` (không gọi `DEL`).
  - `benchmark/src/aggregate.js`: tính nearest-rank p50/p95, kiểm tra 5 điều kiện validity (giữ `miss-fallback` và `queries_per_expiry > 1` của `coalesced` trong tập hợp lệ theo v1.1), xuất `summary.csv` & `report_table.md` (tách biệt `median_of_run_p95_ms` và `median_of_pair_delta_p95_ms`), kèm CLI tính lại độc lập từ `requests.jsonl`.
  - `benchmark/src/run.js`: kiểm `/healthz` + `/config`, warm-up, pre-warm 200 keep-alive connections bằng `undici.Pool` (100/instance), monotonic clock, retry lượt invalid nhưng giữ nguyên log kèm `invalid_reasons`.
  - `benchmark/test/selftest.js`: test end-to-end với mock RESP2 + Postgres wire v3 + 2 mock HTTP app servers.
- **Changed**: Sửa logic gán `invalid_reasons` trong `benchmark/src/aggregate.js` sau khi chạy test phát hiện thông báo sai lệch giữa số query và trạng thái thiếu header ở request lỗi `500`.
- **Rejected**: Không sửa `compose.yaml`, `app/`, `CONTRACT.md` hay `AI-LOG.md` ở root để giữ đúng ranh giới quyền sở hữu file.
- **By hand**: Phúc yêu cầu ưu tiên các task khả thi thực hiện độc lập và tách branch mới (`feat/task4-benchmark-runner`).
- **Kiểm chứng**:
  - `node --check` trên tất cả file JS trong `benchmark/src/` và `benchmark/test/`.
  - `npm test` (`benchmark/test/selftest.js`) pass 4 nhóm kiểm tra: phát hiện lệch `/config`, chạy end-to-end `PAIRS=1` / `BURST_SIZE=200` + tính lại độc lập bằng `src/aggregate.js`, giữ log lượt invalid + chạy bù, và rule fallback v1.1 + nearest-rank p95.
  - `docker compose build benchmark` và `docker compose run --rm -e PAIRS=1 -e BURST_SIZE=20 benchmark` chạy qua stack thật (`postgres:16` với `pg_stat_statements` và seed 800k dòng, `redis:7`, `app1`/`app2` stub): kiểm `/healthz` + `/config` khớp, snapshot `pg_stat_statements` dưới role `bench_ro` thành công, phát hiện `501` stub từ `app`, lưu đủ log lượt invalid (`n_ok=0/20`, `app1: 10, app2: 10`), xuất `summary.csv` & `report_table.md` rồi dọn sạch bằng `docker compose down -v`.
  - Đồng bộ branch theo `origin/main` (`4a4ec54`, PR #2 và #3) và duyệt PR #14 (`CONTRACT.md` v1.3).

## 2026-11-19 — Task 4: Xử lý góp ý review PR #15

- **Tool**: Antigravity.
- **Asked for**: Cập nhật `benchmark/` theo góp ý của `@tranquocvy` ở PR #15 (dùng `recomputeAndAggregateDir(kindDir)` ở cuối `run.js` kèm cảnh báo trùng `(pair, mode)`, ghi timeout client vào `config.json`, bổ sung thông tin CPU/RAM máy chạy).
- **Kept**:
  - `benchmark/src/run.js`: chuyển sang gọi `recomputeAndAggregateDir(kindDir)` ở cuối lệnh; ghi `client_headers_timeout_ms`, `client_body_timeout_ms` (giữ nguyên 10000 ms), `cpu_count`, `cpu_model`, `total_memory_mb` vào `config.json`.
  - `benchmark/src/aggregate.js`: cảnh báo qua `console.warn` và ghi chú trong `report_table.md` khi tồn tại hơn 1 lượt valid cùng `(pair, mode)`.
  - `benchmark/test/selftest.js`: bổ sung test kiểm tra các trường mới trong `config.json` và chạy 2 lần liên tiếp vào cùng `results/<kind>/` để xác minh tổng hợp đủ cả 4 lượt kèm cảnh báo trùng.
- **Changed**: Không giữ `writeAggregateOutputs(kindDir, allSummaries)` cho riêng lượt hiện tại nữa mà quét toàn bộ thư mục `results/<kind>/`.
- **Rejected**: Không nâng client timeout lên trên 10 s (giữ nguyên 10000 ms theo yêu cầu của Vỹ để việc hiệu chỉnh nằm ở Task 3).
- **By hand**: Phúc đọc review của Vỹ trên PR #15 và quyết định sửa ngay vào nhánh trước khi merge, đồng thời thêm thông tin CPU/RAM như gợi ý.
- **Kiểm chứng**: `node --check` trên tất cả file JS và `npm test` (`benchmark/test/selftest.js`) pass toàn bộ sau khi sửa.

## 2026-11-22 — Task 5: Cập nhật hậu PR #18 và chạy Pilot (`PAIRS=5`)

- **Tool**: Antigravity, Docker Desktop (`28.5.1`).
- **Asked for**: Cập nhật 3 đầu việc Vượng nhờ ở PR #18 (`benchmark/Dockerfile`, `seed_reviews_count` trong `config.json`, `README.md`), đồng bộ `CONTRACT.md` v1.4, chạy Pilot 5 cặp (`PAIRS=5`) và điền `docs/PILOT-CHECKLIST.md`.
- **Kept**:
  - `benchmark/Dockerfile`: pin `node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a` khớp với `app/Dockerfile`.
  - `benchmark/src/stats.js` & `benchmark/src/run.js`: bổ sung `getReviewsRowCount` lưu `seed_reviews_count` vào `config.json` (thử `SELECT count(*)` rồi fallback sang `pg_class.reltuples` khi `bench_ro` chưa có quyền `SELECT` trên `reviews`), cập nhật `CANONICAL_PRODUCT_1_JSON` lên `review_count: 30000`.
  - `README.md`: bỏ dòng cảnh báo stub, bổ sung hướng dẫn `docker compose down -v` khi đổi `SEED_REVIEWS` và lưu ý chạy trong thư mục kết quả sạch.
  - `docs/PILOT-CHECKLIST.md`: điền đầy đủ kết quả và đường dẫn evidence cho mục `#1–8`, `#15`, `#16`.
- **Changed**: Đổi query fallback trong `getReviewsRowCount` từ `GREATEST(n_live_tup, reltuples)` sang ưu tiên `NULLIF(c.reltuples::bigint, -1)` sau khi kiểm chứng trực tiếp trên Postgres 16 thấy `pg_stat_user_tables.n_live_tup` bị cộng đúp thành `600000` ngay sau init+`ANALYZE`.
- **Rejected**: Không cấp lại quyền cho `bench_ro` trong file `db/init/` (thuộc sở hữu Vượng); dùng `pg_class.reltuples` khi `bench_ro` thiếu quyền `SELECT` để giữ nguyên ranh giới file.
- **By hand**: Phúc kiểm tra và phê duyệt các PR trung gian (#17), yêu cầu chạy đồng bộ `main` và thực thi Pilot trên máy của mình.
- **Kiểm chứng**:
  - `npm test` trong `benchmark/` pass toàn bộ sau khi sửa `stats.js`.
  - `node app/test/smoke.mjs` trên stack thật: `ALL PASS` (#1, #2, #3, 400/404).
  - `docker compose run --rm -e PAIRS=5 -e RESULTS_KIND=pilot benchmark`: **10/10 lượt `VALID`**, `seed_reviews_count: 300000`, `queries_saved: 199 (199–199)`, `delta_p95_ms: -1585.447 (-1800.614–-1522.926) ms`, `node benchmark/src/aggregate.js results/pilot` exit 0.

## Lỗi assistant / vấn đề phát hiện trong quá trình làm

| # | Lỗi / Vấn đề | Assistant | Cách phát hiện | Cách sửa |
| --- | --- | --- | --- | --- |
| 1 | Unescaped backticks bên trong template literal trong `benchmark/src/aggregate.js` (dòng 325–340) gây `SyntaxError` | Antigravity | Chạy `node --check src/aggregate.js` | Đổi thành `` \` `` |
| 2 | Khi một request trong burst trả `500` (`db_queries: null`), `computeRunSummary` vẫn ghi thêm `db_queries_mismatch: headers=39 vs pg_stat_statements=39` và `burst_span_exceeded: nullms > 100ms` dù hai số bằng nhau | Antigravity | Quan sát output của `npm test` (case invalid run 39/40) | Tách check `missing_x_db_queries_header` chỉ áp dụng cho `status === 200`, tách `burst_span_missing_timestamps` khỏi `burst_span_exceeded` |
| 3 | `docker compose build` không build lại service `benchmark` vì service này nằm trong `profiles: ["bench"]`, khiến lần chạy pilot đầu vẫn dùng image cũ | Antigravity | Kiểm tra `config.json` thấy thiếu `seed_reviews_count` và `cpu_count` | Chạy tường minh `docker compose build benchmark` và chạy lại toàn bộ Pilot `PAIRS=5` |
| 4 | Fallback `GREATEST(n_live_tup, reltuples)` ghi `seed_reviews_count: 600000` dù bảng thật chỉ có `300000` dòng (Postgres 16 cộng đúp `n_live_tup` sau `INSERT` + `ANALYZE` khi init) | Antigravity | Kiểm tra `config.json` vs `baseline_payload_sha256` và truy vấn trực tiếp `psql` kiểm chứng `reltuples=300000`, `n_live_tup=600000` | Đổi sang `COALESCE(NULLIF(c.reltuples::bigint, -1), s.n_live_tup)` trong `benchmark/src/stats.js` và chạy lại Pilot `PAIRS=5` xác nhận `300000` |
