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
<!-- Bảng: queries/expiry, p95 (ms) từng mode, delta_p95_ms; median và min–max trên 10 lượt/cặp. Mỗi số truy được về results/official/... -->

## 5. Khuyến nghị và khi nên tránh
<!-- -->

## 6. Giới hạn của phép đo
<!-- một hot key, một dạng query, local, single-node Redis (không phải Redlock), CPU chia sẻ giữa client/server, burst span -->

## 7. Nguồn
<!-- link official docs kèm ngày đọc -->
