# Phân tích kết quả official (Task 6)

Nguồn số liệu: `results/official/` (20 lượt, 10 cặp, commit `3682b13`, máy chuẩn). Mọi số dưới đây được tính lại độc lập bằng `benchmark/crosscheck/crosscheck.mjs`, không import `benchmark/src/aggregate.js`. Bản đầy đủ có `run_id` và số dòng trong log: `results/official/crosscheck_report.md`.

Chạy lại:

```powershell
node benchmark/crosscheck/crosscheck.mjs results/official --out results/official/crosscheck_report.md
```

## 1. Kiểm độc lập

Script đọc `requests.jsonl`, `snapshots/before.json`, `snapshots/after.json` và `config.json` của từng lượt, rồi tính lại:

- p95 và p50 nearest-rank trên request `status == 200`;
- `queries_per_expiry = calls_after − calls_before`, và tổng `X-DB-Queries` của các request;
- `burst_span_ms = max(server_recv_ts) − min(server_recv_ts)`;
- số `hit`, `miss-query`, `miss-wait`, `miss-fallback`;
- validity theo `CONTRACT.md` mục 8;
- với mỗi (pair, mode) chọn lượt hợp lệ mới nhất, rồi `delta_p95_ms = p95_coalesced − p95_plain`, `queries_saved`, median và min–max.

Rồi đối chiếu với `summary.json` từng lượt, `summary.csv` và `report_table.md`.

**Kết quả: PASS.** 20/20 lượt hợp lệ, 10/10 cặp đủ hai mode, mọi số khớp `aggregate.js`. Không có điểm lệch cần báo Phúc sửa.

Hai điều `aggregate.js` làm mà contract chưa ghi, nên cần ghi vào README hoặc REPORT:
- `median_query_ms` chỉ tính trên request có chạy query (`db_queries > 0`); waiter của coalesced không chạy query nên bị loại.
- Median của số chẵn (10 cặp) là trung bình hai giá trị giữa.

## 2. Trả lời câu hỏi nghiên cứu

Với 200 request đồng thời khi key nóng hết hạn (median qua 10 cặp, min–max trong ngoặc):

| | Plain | Coalesced |
| --- | ---: | ---: |
| Query Postgres mỗi lần hết hạn | 200 (115–200) | 1 (1–1) |
| p95 | 3925.724 ms (2019.178–4537.887) | 138.881 ms (79.024–260.893) |

- **Số query tiết kiệm:** median 199 (114–199) mỗi lần hết hạn.
- **Ảnh hưởng lên p95:** `median_of_pair_delta_p95_ms` = **−3696.122 ms** (−4353.17 đến −1863.389). **Dấu âm: coalescing làm p95 thấp hơn, không cao hơn.** Giả thuyết "coalescing thêm độ trễ p95" không thấy trong thí nghiệm này: ở cả 10 cặp, p95 của coalesced đều thấp hơn plain.
- Coalesced không có `miss-fallback` nào (0 trên 10 lượt), nên số liệu không bị lẫn chi phí của đường dự phòng.

Hai dấu phải đúng khi viết report: `delta_p95_ms = p95_coalesced − p95_plain`, và âm nghĩa là p95 giảm.

## 3. Nguyên nhân từ log

**Plain.** Với 200 request cùng lúc, mỗi instance chỉ có `PG_POOL_MAX = 10` connection, nên 20 query chạy song song trên Postgres 2 CPU và phần còn lại xếp hàng chờ connection:
- median `pool_wait_ms` = 1609 ms, median `query_ms` = 383 ms (so với khoảng 35 ms khi query chạy một mình trong lúc calibrate: query chậm hẳn đi vì tranh CPU);
- ở request đứng vị trí p95, `pool_wait_ms` + `query_ms` chiếm khoảng 99% thời gian (median 3888 ms trên 3926 ms); phần còn lại median 41 ms.
- Vì vậy p95 của plain là thời gian xếp hàng và chạy 200 query, không phải thời gian một query.

**Coalesced.** Chỉ một request giữ lock và chạy query (1 `miss-query`), 199 request còn lại chờ (`miss-wait`) rồi đọc cache vừa ghi:
- `pool_wait_ms` = 0, median `lock_wait_ms` = 43 ms, `query_ms` của request chạy query median 43 ms;
- request ở vị trí p95 đều là `miss-wait`. Log chỉ giải thích khoảng 54 ms trong 139 ms (median); phần còn lại (median 65 ms, tới 149 ms) không nằm trong `pool_wait_ms`, `lock_wait_ms` hay `query_ms`. Đó là thời gian gửi, xếp hàng ở client hoặc event loop và đọc cache, không được log riêng. Report không nên gán phần này cho lock.

**Plain không phải lúc nào cũng 200 query.** 4 trong 10 lượt plain có 115–165 query (cặp 1, 3, 7, 10) vì một số request đến muộn đã gặp cache do request đầu ghi xong (`hit_count` 35–85). Cả bốn lượt này có `burst_span_ms` lớn (60–93 ms), nhưng chưa đủ dữ liệu để kết luận quan hệ nhân quả (cặp 4 có span 57 ms mà không có hit). `queries_per_expiry` là đại lượng đo, không có ngưỡng đạt/trượt (contract mục 8). Report phải nêu spread 115–200, không chỉ "200".

## 4. Giới hạn cần nêu trong report

- Một máy chuẩn, một lần chạy 10 cặp; spread là biến thiên trong cùng một lần chạy, không phải giữa các máy.
- `burst_span_ms` lớn nhất 98.1 ms (cặp 8, coalesced), sát ngưỡng 100 ms nhưng vẫn hợp lệ.
- `seed_reviews_count` = 300000 lấy từ `pg_class.reltuples` (ước lượng) vì commit `3682b13` chưa cấp `SELECT` trên `reviews` cho `bench_ro`; `count(*)` đối chiếu sau khi chạy cũng ra 300000 (theo PR #21).
- Số tuyệt đối (ms) phụ thuộc máy, CPU limit và độ nặng query; kết luận có thể chuyển giao là dấu và độ lớn tương đối (số query 200 so với 1, p95 giảm), không phải con số ms.
