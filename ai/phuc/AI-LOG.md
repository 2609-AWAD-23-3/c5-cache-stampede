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

## Lỗi assistant / vấn đề phát hiện trong quá trình làm

| # | Lỗi / Vấn đề | Assistant | Cách phát hiện | Cách sửa |
| --- | --- | --- | --- | --- |
| 1 | Unescaped backticks bên trong template literal trong `benchmark/src/aggregate.js` (dòng 325–340) gây `SyntaxError` | Antigravity | Chạy `node --check src/aggregate.js` | Đổi thành `` \` `` |
| 2 | Khi một request trong burst trả `500` (`db_queries: null`), `computeRunSummary` vẫn ghi thêm `db_queries_mismatch: headers=39 vs pg_stat_statements=39` và `burst_span_exceeded: nullms > 100ms` dù hai số bằng nhau | Antigravity | Quan sát output của `npm test` (case invalid run 39/40) | Tách check `missing_x_db_queries_header` chỉ áp dụng cho `status === 200`, tách `burst_span_missing_timestamps` khỏi `burst_span_exceeded` |
