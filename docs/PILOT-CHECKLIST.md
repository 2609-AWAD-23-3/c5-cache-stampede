# Pilot checklist (20–21/11)

Service và runner xong 20/11 nên pilot thực tế chạy 20–21/11. Hạ tầng (`SEED_REVIEWS`, `cpus`) calibrate xong 20/11 (Task 3); các giá trị `[calibrate]` khác (`CACHE_TTL_MS`, lease, poll…) chốt trong pilot rồi đóng băng trước 22/11.

Điền kết quả và đường dẫn tới `results/pilot/<run_id>/` cho mỗi dòng. Chỉ khi tất cả pass mới đóng băng các giá trị `[calibrate]` và chạy official.

| # | Kiểm tra | Kỳ vọng | Kết quả | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Cache hit | `X-DB-Queries=0`, delta `calls`=0 | | |
| 2 | Một request sau expiry | `X-DB-Queries=1`, delta `calls`=1 | | |
| 3 | Payload hai mode | `payload_sha256` giống nhau | | |
| 4 | `/config` hai instance | `params`, `node_version`, `git_commit` trùng nhau; `instance`, `port` được phép khác | | |
| 5 | Burst | đủ 200 request, `burst_span_ms` ≤ 100, cả hai instance nhận request | | |
| 6 | Plain, 5 lượt | Key hết hạn thật, burst chồng lấn, payload khớp, hai nguồn đếm query khớp. `queries_per_expiry` (1–200) **chỉ ghi nhận**, không có ngưỡng đạt/trượt | | |
| 7 | Coalesced, 5 lượt | Dự kiến `queries_per_expiry` = 1. Nếu > 1 hoặc có `miss-fallback`: điều tra nguyên nhân và ghi lại, không coi là trượt pilot | | |
| 8 | Kiểm chéo | `Σ X-DB-Queries` = delta `calls` ở mọi lượt | | |
| 9 | Độ nặng query | thời gian query đơn lẻ trong 20–50 ms; ghi con số thật | **Pass** (máy chuẩn, 19/11). `SEED_REVIEWS=800000` không đạt: p50 84.9 ms, p90 119.2 ms. Chọn **300000**: `X-Query-Ms` p50 32.9, p90 39.2, min 23.8, max 49.2 ms (n=30); `EXPLAIN ANALYZE` 26.7–43.1 ms | `results/calibration/20261119T051447Z-seed300000.json` (các mức 800k/400k/350k cùng thư mục) |
| 10 | Lock: recheck | tổng query = 1 | **Pass**. Burst 200 coalesced: delta `calls` = 1, Σ `X-DB-Queries` = 1 (1 `miss-query`, 119 `miss-wait`, 80 `hit`). Có 1 holder thứ hai gặp `recheck_hit` thật (0 query, vẫn nhả lock); nhánh này còn được kiểm tất định ở `app/test/fault.test.mjs` | `results/lock-tests/20261119T054509Z/case-10.json` |
| 11 | Lock: thứ tự | log `SET cache` trước `DEL lock` | **Pass**. Log holder: `lock_acquired` → `cache_set` → `lock_released`; đúng 1 holder ghi cache; holder gặp `recheck_hit` nhả lock mà không ghi | `results/lock-tests/20261119T054509Z/case-11.json` |
| 12 | Lock: lease < thời gian query (test chủ ý) | thấy `queries>1`; lock của holder mới không bị xóa nhầm | **Pass**. `LOCK_LEASE_MS=10`: 3 query, 3 holder, cả 3 nhận `lock_not_owned` (Lua không xóa lock của holder khác), 0 `lock_released`; Σ header = delta `calls` = 3 | `results/lock-tests/20261119T054509Z/case-12.json` |
| 13 | Lock: giết holder (test chủ ý) | waiter phục hồi sau lease hoặc fallback, có log | **Pass**. Holder ở app1 bị `SIGKILL` khi đang query (Postgres tạm `pause`); 10 waiter ở app2 `miss-fallback` sau 2000.5–2008.3 ms (mỗi waiter 1 query); lock của holder chết tự hết sau 2.6 s; request mới sau đó `miss-query` | `results/lock-tests/20261119T054509Z/case-13.json` |
| 14 | Lock: waiter timeout (test chủ ý) | `miss-fallback` được đếm đúng | **Pass**. Lock giả giữ 15 s: 50/50 `miss-fallback`, 50 log `fallback(wait_timeout)`, delta `calls` = Σ header = 50, `lock_wait_ms` 2003.0–2010.5 | `results/lock-tests/20261119T054509Z/case-14.json` |
| 15 | Fresh clone | làm theo `README.md` trong thư mục mới, `PAIRS=1`, cùng format output | | |
| 16 | Poll interval | `lock_wait_ms` của waiter ≈ thời gian query của holder + tối đa 5 ms | | |

Không chỉnh `SEED_REVIEWS`, burst hay TTL để plain "gần 200" hoặc để coalesced "đẹp hơn". Chỉ chỉnh khi mục #5 (burst chồng lấn) hoặc #9 (độ nặng query) không đạt, và ghi lý do vào log pilot.

## Calibrate hạ tầng (Task 3, 19/11/2026)

- **Máy chuẩn:** máy Vượng — AMD Ryzen 7 H 260 (8 nhân / 16 luồng), RAM 31.3 GB, Windows 11 Home 10.0.26200, Docker Desktop 29.9.3 (WSL2, VM 16 CPU, 16.4 GB), Compose v5.7.0. Máy thứ hai (fresh clone): máy Vỹ.
- **`SEED_REVIEWS`: 800000 → 300000.** Lý do: mục #9 không đạt ở 800000 trên máy chuẩn (p50 84.9 ms). Ngày 17/11 mức 800000 cho 34–40 ms trên máy Vỹ, nên số dòng seed phụ thuộc máy và phải đo lại trên máy chuẩn.
- **`cpus`: giữ mặc định** (postgres 2, mỗi app 1, redis 1, benchmark 1). Runner `PAIRS=2` với seed 300000 (thư mục sạch): 4/4 lượt hợp lệ; plain 200 query/lượt, p95 4066–4191 ms; coalesced 1 query/lượt, p95 135–177 ms; `burst_span_ms` 27–66 (≤ 100). Evidence: `results/calibration-cpus/`.
- **Image pin** (tag cụ thể + digest, kiểm 19/11): `postgres:16.16`, `redis:7.4.12`, `node:22.23.5-alpine` (Alpine 3.24.4) — xem `compose.yaml` và `app/Dockerfile`.
- Lưu ý cho pilot: plain p95 (~4.1–4.2 s) dài hơn `CACHE_TTL_MS` 3000; contract mục 5 ghi TTL "phải dài hơn thời gian burst". Cần xem lại khi chốt TTL trong pilot.
- Evidence `results/calibration-cpus/` và `results/lock-tests/` là lần chạy lại sau review của Vượng: lần đầu `PAIRS=1` và `PAIRS=2` ghi chung thư mục nên pair 1 bị trùng, và `lock-tests.mjs` chưa dọn stack khi lỗi giữa chừng (nay mỗi case chạy trong `try/finally`).
- Chạy lại: `cd app && npm run calibrate` (#9), `npm run test:lock` (#10–14), `npm test` (nhánh lỗi, không cần Docker), `npm run test:smoke`.
- **Đổi seed phải dựng lại DB** (Vượng phát hiện khi review bản Task 3): Postgres dùng anonymous volume và Compose giữ volume đó khi tạo lại container, nên đổi `SEED_REVIEWS` rồi `docker compose up` vẫn dùng DB cũ (đã kiểm: đổi sang 50000 rồi `up`, bảng vẫn 300000 dòng). Đổi seed thì chạy `docker compose down -v` trước.
- **Healthcheck Postgres qua TCP** (`pg_isready -h 127.0.0.1`; Claude phát hiện khi kiểm điểm trên của Vượng): trước đây Postgres báo healthy khi `db/init` còn đang seed (đã thấy `count(*) = 0` ngay sau healthy); sau khi sửa, ngay khi healthy đã có đủ 300000 dòng.
