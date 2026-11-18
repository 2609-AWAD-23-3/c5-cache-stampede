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
| 9 | Độ nặng query | thời gian query đơn lẻ trong 20–50 ms; ghi con số thật | | |
| 10 | Lock: recheck | tổng query = 1 | | |
| 11 | Lock: thứ tự | log `SET cache` trước `DEL lock` | | |
| 12 | Lock: lease < thời gian query (test chủ ý) | thấy `queries>1`; lock của holder mới không bị xóa nhầm | | |
| 13 | Lock: giết holder (test chủ ý) | waiter phục hồi sau lease hoặc fallback, có log | | |
| 14 | Lock: waiter timeout (test chủ ý) | `miss-fallback` được đếm đúng | | |
| 15 | Fresh clone | làm theo `README.md` trong thư mục mới, `PAIRS=1`, cùng format output | | |
| 16 | Poll interval | `lock_wait_ms` của waiter ≈ thời gian query của holder + tối đa 5 ms | | |

Không chỉnh `SEED_REVIEWS`, burst hay TTL để plain "gần 200" hoặc để coalesced "đẹp hơn". Chỉ chỉnh khi mục #5 (burst chồng lấn) hoặc #9 (độ nặng query) không đạt, và ghi lý do vào log pilot.
