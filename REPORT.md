Repository: https://github.com/2609-AWAD-23-3/c5-cache-stampede

> Template. Nội dung được viết ở Task 8, tối đa 3 trang.

# C5 — Request coalescing với Redis lock so với cache-aside thường

## 1. Câu hỏi
> When a hot cache key expires under 200 concurrent requests, how many Postgres queries does request coalescing with a Redis lock save compared with plain cache-aside (queries per expiry), and how much does it add to p95 latency (ms)?

Phạm vi: chỉ đo layer Redis đứng trước Postgres. L1 in-process và CDN nằm ngoài phạm vi. In-process single-flight là phương án thay thế chưa đo.

## 2. Setup
<!-- versions (kèm ngày đọc docs), máy, CPU limits, seed (SEED_REVIEWS), query + thời gian chạy đơn lẻ, pool, TTL, burst 200 (100/instance), số lượt, git commit -->

## 3. Baseline và thay đổi
- Baseline `plain`: cache-aside, không lock.
- Thay đổi `coalesced`: lock theo key `SET NX PX`, recheck sau khi lấy lock, waiter poll 5 ms, timeout 2 s.
- Giữ cố định: <!-- liệt kê -->

## 4. Kết quả
Đo 10 cặp xen kẽ (`ORDER_SEED=20261117`, 5 cặp `plain→coalesced` và 5 cặp `coalesced→plain`) tại commit `3682b13` trên máy chuẩn. **20/20 lượt hợp lệ** (`valid=true`, 0 lượt chạy bù, `Σ X-DB-Queries == delta calls` ở cả 20 lượt). Raw log và bảng tổng hợp: `results/official/report_table.md`, `results/official/summary.csv` và từng thư mục `results/official/<run_id>/`.

| Chỉ số (`median (min–max)`, 10 cặp) | Plain (`plain`) | Coalesced (`coalesced`) | Chênh lệch theo cặp / Tiết kiệm |
| --- | --- | --- | --- |
| `queries_per_expiry` (queries/expiry) | 200 (115–200) | 1 (1–1) | `queries_saved`: **199 (114–199)** |
| `p95_ms` (`median_of_run_p95_ms`) | 3925.724 (2019.178–4537.887) ms | 138.881 (79.024–260.893) ms | `median_of_pair_delta_p95_ms`: **−3696.122 (−4353.170 đến −1863.389) ms** |
| `p50_ms` | 1999.501 (521.920–2448.623) ms | 107.869 (62.924–168.247) ms | `delta_p50_ms`: −1896.245 (−2326.298 đến −414.409) ms |
| `burst_span_ms` | 48.714 (20.990–92.572) ms | 31.219 (13.010–98.135) ms | — |
| `hit_rate` (lần đọc đầu) | 0 (0–0.425) | 0 (0–0.300) | — |
| `miss_fallback_count` | — | 0 (0–0) | — |

*Quy ước (`benchmark/src/aggregate.js`):* `p50`/`p95` tính theo nearest-rank trên request `status=200`; `delta_p95_ms = p95_coalesced − p95_plain` (âm nghĩa là `p95` giảm; tách riêng `median_of_run_p95_ms` và `median_of_pair_delta_p95_ms`); median số phần tử chẵn lấy trung bình hai giá trị giữa; `median_query_ms` chỉ tính trên request có `db_queries > 0`.

- **Dấu của `delta_p95_ms`:** Âm ở cả 10/10 cặp (`−4353.170` đến `−1863.389 ms`), tức request coalescing **giảm** mạnh p95 thay vì làm tăng độ trễ p95.
- **Nguyên nhân từ log `plain`:** 200 request đồng thời qua 2 instance (`PG_POOL_MAX=10`/instance → tối đa 20 query song song tranh 2 CPU Postgres) đẩy median `pool_wait_ms` lên `1609.2 ms` và median `query_ms` lên `383.2 ms` (gấp ~11.6 lần mức p50 đơn lẻ `32.9 ms` ở `results/calibration/20261119T051447Z-seed300000.json`). Ở request vị trí p95, `pool_wait_ms + query_ms` chiếm ~99% độ trễ (median `3888.0 ms` trên `3925.7 ms`).
- **Nguyên nhân từ log `coalesced`:** Chỉ 1 holder query (`pool_wait_ms = 0`, `query_ms` median `43.1 ms`), 199 waiter chờ `lock_wait_ms` median `42.7 ms`, `0` fallback. Tại request vị trí p95 (đều là `miss-wait`), các thành phần được log chiếm median `54.1 ms` trên `138.9 ms`; phần còn lại (median `64.9 ms`, tối đa `148.7 ms`) chưa xác định được nguồn vì app không log thời gian từ lúc vào handler đến lúc đọc cache và client không log riêng thời gian gửi.
- **Spread của `plain` (`115–200` queries/expiry):** 4/10 lượt `plain` (cặp 1, 3, 7, 10: `138`, `115`, `116`, `165` queries) có `35–85` `hit` (`hit_rate` tới `0.425`, ví dụ `results/official/20261122T152145Z-plain-3/summary.json`, `results/official/20261122T152248Z-plain-7/summary.json`); toàn bộ hit nằm ở một instance khi nhánh đọc cache của instance đó diễn ra sau lúc instance kia đã ghi cache.
- **Lưu ý dữ liệu:** `burst_span_ms` lớn nhất đạt `98.135 ms` ở cặp 8 (`results/official/20261122T152257Z-coalesced-8/summary.json`, vẫn ≤ 100 ms hợp lệ). `seed_reviews_count = 300000` trong `config.json` của 20 lượt official lấy từ `pg_class.reltuples` (do commit `3682b13` chưa có `GRANT SELECT ON reviews TO bench_ro`; đã đối chiếu `count(*) = 300000` ở PR #21).

## 5. Khuyến nghị và khi nên tránh
<!-- -->

## 6. Giới hạn của phép đo
<!-- một hot key, một dạng query, local, single-node Redis (không phải Redlock), CPU chia sẻ giữa client/server, burst span -->

## 7. Nguồn
<!-- link official docs kèm ngày đọc -->
