# C5 — Quyết định đã chốt và contract kỹ thuật (v1, 17/11/2026)

> **Đã được thay thế một phần bởi `CONTRACT.md` v1.1.** Khác biệt: lượt coalesced có fallback hoặc `queries > 1` vẫn nằm trong median chính (mục 4 dưới đây ghi ngược lại); không có ngưỡng "plain gần 200 query" trong pilot (mục 5); `/config` chỉ so sánh `params`, `node_version`, `git_commit`; `SEED_REVIEWS` = 800000. Khi mâu thuẫn, `CONTRACT.md` thắng.

Nguồn quyết định: review lần 1 của Claude, được nhóm chấp nhận nguyên đề xuất. Mọi số cụ thể dưới đây là **giá trị khởi đầu**. Giá trị nào có đánh dấu `[calibrate]` được hiệu chỉnh trong pilot (19–22/11), sau đó đóng băng và ghi vào `REPORT.md`. Sau khi bắt đầu 10 cặp chính thức thì không đổi nữa.

Câu hỏi nghiên cứu (giữ nguyên, không sửa chữ):

> When a hot cache key expires under 200 concurrent requests, how many Postgres queries does request coalescing with a Redis lock save compared with plain cache-aside (queries per expiry), and how much does it add to p95 latency (ms)?

Nguyên tắc ưu tiên khi có xung đột: **yêu cầu đề / rubric > câu hỏi đã chọn > tiện lợi triển khai.**

## 1. Quyết định

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| D1 | Số instance app | **2 instance** (`app1`:3001, `app2`:3002), cùng image, chung một Redis và một Postgres. Runner chia 200 request round-robin (100/100). Lý do: Redis lock chỉ có ý nghĩa khi có nhiều process cùng refill. |
| D2 | Query mục tiêu | Một `SELECT` aggregate xác định trên bảng seed cố định (sản phẩm + reviews), mục tiêu thời gian chạy đơn lẻ **20–50 ms** `[calibrate]`. Không dùng `pg_sleep`. Seed bằng `generate_series` với công thức xác định, không dùng `random()`. |
| D3 | Pool | `pg.Pool max=10` mỗi instance (tổng 20). Cố định cho cả hai mode. |
| D4 | Cache TTL | 3 s `[calibrate]`, dài hơn thời gian burst để không expiry lần hai trong lượt. Expiry bằng TTL thật, không dùng `DEL`. |
| D5 | Lock | Key `lock:product:<id>`, `SET NX PX`, lease **5000 ms**, token ngẫu nhiên mỗi lần acquire. Release bằng Lua compare-and-delete. **Ghi cache xong rồi mới nhả lock.** Chỉ dùng single-node Redis, không dùng Redlock. |
| D6 | Waiter | Poll Redis mỗi **5 ms** (cố định, không jitter). Timeout **2000 ms**. Hết timeout thì **fallback query DB** và đánh dấu `miss-fallback`. Nếu thời gian còn, chạy thêm sensitivity với poll 1 ms và 20 ms, ghi riêng, không trộn vào số chính. |
| D7 | Số lượt | **10 cặp** (mỗi mode 10 lượt), thứ tự xen kẽ: 5 cặp `plain→coalesced`, 5 cặp `coalesced→plain`, xáo thứ tự theo seed cố định ghi trong config. |
| D8 | Percentile | Nearest-rank trên tất cả request có status 200 trong lượt. Lượt có request lỗi/timeout bị đánh dấu `invalid` (xem mục 4), không loại âm thầm. |
| D9 | Metric chính | `queries_saved` (queries/expiry) và `delta_p95_ms = p95_coalesced − p95_plain`. Báo đúng dấu, không ép "adds". |
| D10 | Metric phụ | Hit rate trong burst (từ `X-Cache-Result`), số `miss-fallback`, `wait_ms` trung vị. Chỉ để đáp ứng mô tả C5 trong đề và giải thích nguyên nhân. |
| D11 | Phạm vi "multi-layer" | Chỉ đo layer Redis đứng trước Postgres. REPORT nêu rõ một câu: L1 in-process và CDN nằm ngoài phạm vi, in-process single-flight là phương án thay thế chưa đo. |
| D12 | Giới hạn tài nguyên | `cpus` cho từng container ghi trong `compose.yaml` `[calibrate]` (gợi ý: postgres 2, mỗi app 1, redis 1, benchmark 1). Ghi cấu hình máy chuẩn vào REPORT. |

## 2. Contract service ↔ runner

**Endpoint:** `GET /products/:id` trên `app1:3001` và `app2:3002`. Hot product: `id=1`.

**Request header:** `X-Cache-Mode: plain | coalesced`. `X-Request-Id: <run_id>-<seq>`.

**Response:** JSON body giống hệt giữa hai mode (runner so băm payload). Các header sau trả về trên mọi response:

| Header | Giá trị |
| --- | --- |
| `X-Cache-Result` | `hit` / `miss-query` / `miss-wait` / `miss-fallback` |
| `X-DB-Queries` | số query request này tự chạy (0, 1 hoặc 2 nếu fallback sau khi tự query) |
| `X-Pool-Wait-Ms` | thời gian chờ lấy connection từ pool |
| `X-Query-Ms` | thời gian thực thi query |
| `X-Lock-Wait-Ms` | thời gian chờ lock (0 với plain) |
| `X-Server-Recv-Ts` | epoch ms (float) lúc request vào server |
| `X-Instance` | `app1` / `app2` |

**Endpoint hỗ trợ:**
- `GET /healthz` (sẵn sàng khi Redis và Postgres đều kết nối được).
- `GET /config` trả toàn bộ tham số D2–D6 đang dùng, runner lưu vào `config.json` của lượt.

**Redis:**
- Cache key: `cache:product:<id>`.
- Lock key: `lock:product:<id>`.

**Postgres:**
- DB `shop`, role app `app_user`, role đọc stats `bench_ro` (có `pg_read_all_stats`).
- `shared_preload_libraries=pg_stat_statements` (đặt trong `command:` của service postgres) và `CREATE EXTENSION` trong init script.
- Runner lọc theo `dbid`, `userid = app_user` và query text mục tiêu. Loại câu đọc stats khỏi phép lọc. Không gọi `pg_stat_statements_reset()`.

## 3. Quy trình một lượt (runner)

1. Gọi `/healthz` cả hai instance, kiểm `/config` hai instance trùng nhau.
2. Warm-up (không tính): một chu kỳ miss → hit → expiry cho mỗi mode, cộng 20 request tuần tự để làm nóng pool và planner.
3. Làm đầy cache, xác nhận `PTTL > 0`.
4. Snapshot stats #1 (`calls`) sau warm-up, **trước** burst. Lưu vào `snapshots/<run_id>_before.json`.
5. Chờ `EXISTS cache:product:1 == 0`. Ghi mốc `expiry_confirmed_ts`.
6. Mở sẵn 200 keep-alive connection (100/instance). Bắn đồng loạt. Ghi `burst_start_ts`. Đo từng request bằng monotonic clock từ lúc gửi đến lúc đọc xong body.
7. Sau khi mọi request xong và query liên quan kết thúc, snapshot #2. `queries_per_expiry = calls_after − calls_before`.
8. Kiểm tra validity (mục 4). Ghi `requests.jsonl`, `summary.json`.
9. Chờ TTL hết để lượt sau bắt đầu từ trạng thái sạch.

**Log mỗi request (`requests.jsonl`):** `run_id, mode, seq, instance, t_send_mono_ms, duration_ms, status, payload_hash, cache_result, db_queries, pool_wait_ms, query_ms, lock_wait_ms, server_recv_ts`.

**Đầu ra mỗi lượt** trong `results/<official|pilot>/<run_id>/`: `config.json`, `requests.jsonl`, `snapshots/`, `summary.json`.

**Tổng hợp:** `results/<official>/summary.csv` và `report_table.md`, mỗi con số trong REPORT truy được về dòng trong các file này.

## 4. Tiêu chí lượt hợp lệ (đóng băng trước 23/11)

Một lượt `invalid` nếu **bất kỳ** điều kiện nào sau đây xảy ra. Log vẫn được giữ, kèm lý do, rồi chạy bù lượt thay thế:

- Có request status khác 200, hoặc timeout phía client.
- Payload hash khác baseline.
- `expiry_confirmed` không đạt, hoặc `PTTL`/`EXISTS` bất thường.
- Burst không đủ chồng lấn: `max(server_recv_ts) − min(server_recv_ts) > 100 ms` `[calibrate]`.
- `Σ X-DB-Queries` khác delta `pg_stat_statements.calls` (sai lệch giữa hai nguồn đo).
- Với `coalesced`: có `miss-fallback` hoặc lease hết sớm (`queries_per_expiry > 1` ở chế độ này, ngoài các test chủ ý). Lượt này được giữ lại và **báo cáo như một sự kiện**, không dùng để tính median chính.

## 5. Checklist pilot (19–22/11) — điều kiện để qua cổng

| Kiểm tra | Kỳ vọng |
| --- | --- |
| Cache hit | `X-DB-Queries = 0`, delta `calls` = 0 |
| Một request sau expiry | `X-DB-Queries = 1`, delta `calls` = 1 |
| Payload | Hash giống nhau giữa hai mode |
| Burst | span ≤ 100 ms, đủ 200 request, cả hai instance nhận request |
| Plain | `queries_per_expiry` nằm trong khoảng hẹp gần 200 qua 5 lượt. Nếu rộng thì chỉnh D2/burst trước khi chạy chính thức |
| Coalesced | `queries_per_expiry = 1` mỗi lượt |
| Lock: recheck | Tổng query = 1 |
| Lock: thứ tự | Log `SET cache` có timestamp trước `DEL lock` |
| Lock: lease ngắn hơn query (test chủ ý) | Thấy `queries > 1`, lock mới không bị xóa nhầm |
| Lock: giết holder (test chủ ý) | Waiter phục hồi sau lease hoặc fallback, được log |
| Lock: waiter timeout (test chủ ý) | `miss-fallback` được đếm đúng |
| Fresh clone | Làm theo `README.md` trong thư mục mới, chạy smoke `PAIRS=1`, output cùng format |

## 6. Cấu trúc repo và quyền sở hữu

```
README.md            (Vỹ)
REPORT.md            (Vỹ)  <= 3 trang, link repo ở dòng đầu
TALK.md  slides.pdf  AI-LOG.md  SELF_ASSESSMENT_REPORT.md   (Vỹ)
CONTRACT.md          (Vỹ giữ, đồng bộ từ file này)
compose.yaml  .env.example  .gitattributes   (Vượng)
app/                 (Vượng)
db/ (init.sql, seed) (Vượng)
benchmark/           (Phúc)  Dockerfile, runner, aggregate
results/{pilot,official}/    (Phúc)
```

- `.gitattributes`: `* text=auto` và `*.sh text eol=lf` (máy Windows tránh CRLF làm hỏng script trong container).
- `compose.yaml` do Vượng sở hữu. Phúc chỉ sửa đúng stanza `benchmark` qua PR có Vượng review.
- One command: `docker compose run --rm benchmark`. Service `benchmark` dùng `depends_on` với `condition: service_healthy` cho app1, app2, redis, postgres. **Cần xác minh bằng fresh clone**, không giả định.
- Pin image tag, Node version và `package-lock.json`. Mọi claim về version dùng official docs kèm ngày đọc.

## 7. Lịch điều chỉnh

| Mốc | Việc |
| --- | --- |
| 17–18/11 | Vỹ chốt `CONTRACT.md` từ file này. Phúc viết runner với stub service theo contract. Vượng làm service + compose + seed + init. |
| 19–22/11 | Tích hợp, pilot theo checklist mục 5, hiệu chỉnh `[calibrate]`, rồi đóng băng. |
| 23–25/11 | 10 cặp chính thức trên máy chuẩn. Chạy lại từ fresh clone. |
| 26–28/11 | REPORT, slides, video, AI-LOG, tự chấm, kiểm ZIP có `.git`. |
| 29/11 | Nộp trước 22:00. |
| Nếu thiếu thời gian, cắt theo thứ tự | sensitivity poll 1/20 ms → mức tải 20 concurrent → máy thứ hai → 10 cặp xuống 6 cặp (không dưới 5). |

## 8. Việc còn phải xác nhận ngoài kỹ thuật

- Dòng đăng ký C5 và bộ MSSV trên sheet (hạn đăng ký 15/11 đã qua).
- Tên ZIP `23120328-23120409-23120410_<total>.zip`, `<total>` khớp bảng trong `SELF_ASSESSMENT_REPORT.md`.
- Lịch red team: issue `[red-team] <student IDs>` trước 22:00 02/12 (thiếu bị trừ 10 điểm).
