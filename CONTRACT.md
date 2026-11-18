# CONTRACT — service ↔ runner (v1.3, 18/11/2026)

File này là nguồn sự thật duy nhất giữa `app/` (Vượng) và `benchmark/` (Phúc). Muốn đổi bất kỳ điều gì: sửa file này trong một PR, cả hai người cùng approve, tăng version ở dòng đầu. Vỹ giữ file.

Câu hỏi nghiên cứu (không sửa chữ):

> When a hot cache key expires under 200 concurrent requests, how many Postgres queries does request coalescing with a Redis lock save compared with plain cache-aside (queries per expiry), and how much does it add to p95 latency (ms)?

Giá trị đánh dấu `[calibrate]` được hiệu chỉnh trong pilot (19–21/11), rồi **đóng băng** trước khi chạy official và ghi vào `REPORT.md`.

---

## 1. Topology

| Service | Host trong Compose network | Port | Ghi chú |
| --- | --- | --- | --- |
| `app1` | `app1` | 3001 | instance 1 |
| `app2` | `app2` | 3002 | instance 2, cùng image/config với `app1`, chỉ khác `INSTANCE_NAME` |
| `redis` | `redis` | 6379 | single node, không persistence cần thiết |
| `postgres` | `postgres` | 5432 | DB `shop` |
| `benchmark` | (chạy bằng `docker compose run`) | — | runner, profile `bench` |

Cùng image, cùng seed, cùng cấu hình cho hai mode. Hai mode chỉ khác nhánh xử lý cache miss (mục 4).

## 2. HTTP API

### `GET /products/:id`

- Hot product: `id=1`.
- Request header:
  - `X-Cache-Mode: plain | coalesced` (bắt buộc; thiếu hoặc sai thì `400`).
  - `X-Request-Id: <run_id>-<seq>` (runner gán; app echo lại vào log).
- Response `200`, `Content-Type: application/json`. Body **byte-identical** giữa hai mode với cùng product (runner so SHA-256 của body):

```json
{"id":1,"name":"Product 1","price_cents":1999,"review_count":80000,"avg_rating":3}
```

- Thứ tự key và định dạng số phải ổn định. Không nhúng timestamp, instance hay mode vào body.
- Product không tồn tại: `404` (ngoài phạm vi benchmark; không cache).

### Response header (mọi response `200`)

| Header | Kiểu | Ý nghĩa |
| --- | --- | --- |
| `X-Cache-Result` | enum | `hit` · `miss-query` · `miss-wait` · `miss-fallback` |
| `X-DB-Queries` | int | số query target request này **tự chạy** (0, 1, hoặc 2 nếu fallback sau khi đã tự query) |
| `X-Pool-Wait-Ms` | float | thời gian chờ lấy connection từ pool (0 nếu không query) |
| `X-Query-Ms` | float | thời gian thực thi query (0 nếu không query) |
| `X-Lock-Wait-Ms` | float | thời gian chờ lock/poll (luôn 0 ở `plain`) |
| `X-Server-Recv-Ts` | float | epoch ms, lấy ngay khi request vào handler |
| `X-Instance` | string | `app1` hoặc `app2` |

Ý nghĩa `X-Cache-Result`:

| Giá trị | Mode | Điều kiện |
| --- | --- | --- |
| `hit` | cả hai | đọc được từ Redis ngay lần đầu |
| `miss-query` | cả hai | miss, request tự query Postgres và ghi Redis (plain: mọi request miss; coalesced: chỉ holder lock) |
| `miss-wait` | coalesced | miss, không lấy được lock, chờ và đọc được kết quả do holder ghi |
| `miss-fallback` | coalesced | chờ quá timeout hoặc lỗi, tự query DB |

### `GET /healthz`

`200 {"status":"ok"}` chỉ khi Redis (`PING`) và Postgres (`SELECT 1`) đều sẵn sàng. Compose healthcheck dùng endpoint này.

### `GET /config`

Trả JSON gồm hai phần:

```json
{
  "instance": "app1",
  "port": 3001,
  "node_version": "v22.x",
  "git_commit": "unknown",
  "params": { "cache_ttl_ms": 3000, "pg_pool_max": 10, "lock_lease_ms": 5000,
              "wait_poll_ms": 5, "wait_timeout_ms": 2000, "target_sql": "..." }
}
```

- **Metadata** (`instance`, `port`): khác nhau giữa hai instance là bình thường, runner chỉ lưu lại, **không so sánh**.
- **Tham số ảnh hưởng phép đo** (`params`, `node_version`, `git_commit`): runner **fail nếu hai instance khác nhau** ở bất kỳ trường nào trong nhóm này.

Runner lưu cả hai bản vào `config.json` của mỗi lượt. `git_commit` lấy từ env `GIT_COMMIT` (có thể `unknown` khi dev).

## 3. Redis và Postgres

### Redis keys

| Key | Nội dung | TTL |
| --- | --- | --- |
| `cache:product:<id>` | JSON body (chuỗi đúng như trả về) | `CACHE_TTL_MS` |
| `lock:product:<id>` | token ngẫu nhiên | `LOCK_LEASE_MS` |

### Postgres

- DB `shop`; role `app_user` (app dùng), role `bench_ro` (runner đọc stats, có `pg_read_all_stats`).
- Server chạy với `shared_preload_libraries=pg_stat_statements`, `pg_stat_statements.track=all`.
- Query mục tiêu (nguồn duy nhất, `app/src/sql.js` phải khớp từng ký tự):

```sql
SELECT p.id, p.name, p.price_cents,
       COUNT(r.id)::int AS review_count,
       ROUND(AVG(r.rating), 3)::float AS avg_rating
FROM products p
LEFT JOIN reviews r ON r.product_id = p.id
WHERE p.id = $1
GROUP BY p.id
```

- `reviews.product_id` **không có index** có chủ đích, để chi phí query ổn định và đủ nặng (mục tiêu 20–50 ms `[calibrate]`). Chỉnh độ nặng bằng số dòng seed (`SEED_REVIEWS`), không bằng cách thêm `pg_sleep`.
- App gọi query này qua `pool.query(sql, [id])` đúng một chỗ, không có query target nào khác trong luồng `GET /products/:id`.

### Runner đọc query stats

Lọc `pg_stat_statements` theo `dbid` của DB `shop`, `userid` của `app_user`, và `query` chứa chuỗi chuẩn hóa của câu target (`... WHERE p.id = $1 GROUP BY p.id`). Xác định `queryid` lúc chạy nếu dùng. Loại câu đọc stats của chính `bench_ro` khỏi phép lọc. Không gọi `pg_stat_statements_reset()`. Chỉ dùng delta `calls` (trước/sau burst).

Mỗi lượt kiểm chéo: `Σ X-DB-Queries` (từ response) phải bằng delta `calls`.

## 4. Hành vi hai mode

### `plain` (baseline: cache-aside)

1. `GET cache:product:<id>`. Có thì trả (`hit`).
2. Miss: query Postgres, `SET cache:product:<id> ... PX CACHE_TTL_MS`, trả (`miss-query`).

Không recheck, không lock.

### `coalesced` (thay đổi duy nhất: request coalescing bằng Redis lock)

1. `GET` cache. Có thì trả (`hit`).
2. Miss: thử `SET lock:product:<id> <token> NX PX LOCK_LEASE_MS`.
3. **Lấy được lock (holder):**
   1. `GET` cache lần nữa (recheck). Nếu có thì nhả lock rồi trả (`hit`, 0 query).
   2. Query Postgres.
   3. `SET cache ... PX CACHE_TTL_MS`.
   4. **Sau khi ghi cache xong** mới nhả lock bằng Lua compare-and-delete (chỉ xóa nếu giá trị = token của mình). Trả (`miss-query`).
4. **Không lấy được lock (waiter):** lặp mỗi `WAIT_POLL_MS`: `GET` cache; có thì trả (`miss-wait`). Quá `WAIT_TIMEOUT_MS` thì tự query Postgres, ghi cache, trả (`miss-fallback`).
5. Lỗi Redis khi lock/poll: coi như fallback, log lỗi, **không** nuốt im lặng.

Lua release:

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
```

Lock chỉ đúng với single-node Redis; không phải Redlock. Ghi vào limitations của `REPORT.md`.

## 5. Biến cấu hình

Đặt trong `.env.example` (mặc định) và được `/config` trả lại. Cùng giá trị cho cả hai mode, trừ nhóm "riêng coalesced".

| Biến | Mặc định | Nhóm | Ghi chú |
| --- | --- | --- | --- |
| `CACHE_TTL_MS` | 3000 | chung | `[calibrate]` phải dài hơn thời gian burst |
| `PG_POOL_MAX` | 10 | chung | mỗi instance |
| `SEED_REVIEWS` | 800000 | chung | `[calibrate]` chỉnh độ nặng query |
| `LOCK_LEASE_MS` | 5000 | riêng coalesced | phải lớn hơn thời gian query |
| `WAIT_POLL_MS` | 5 | riêng coalesced | cố định, không jitter |
| `WAIT_TIMEOUT_MS` | 2000 | riêng coalesced | hết thì fallback |
| `INSTANCE_NAME`, `PORT` | `app1`/`3001`, `app2`/`3002` | metadata theo instance | khác biệt duy nhất được phép giữa hai instance; không so sánh khi kiểm `/config` |

Giới hạn tài nguyên (`cpus`) cho từng container nằm trong `compose.yaml` `[calibrate]`.

## 6. Quy trình một lượt (runner)

1. `GET /healthz` và `GET /config` ở cả hai instance. Fail nếu `params`, `node_version` hoặc `git_commit` khác nhau (mục 2).
2. Warm-up (không tính vào kết quả): một chu kỳ miss → hit → expiry cho mỗi mode và 20 request tuần tự.
3. Làm đầy cache, kiểm `PTTL > 0`.
4. Snapshot stats `before` (sau warm-up, trước burst).
5. Chờ `EXISTS cache:product:1 == 0` (TTL tự hết, không dùng `DEL`). Ghi `expiry_confirmed_ts`.
6. Mở sẵn 200 keep-alive connection (100 mỗi instance). Bắn đồng loạt. Ghi `burst_start_ts`. Đo từng request bằng monotonic clock (từ lúc gửi đến lúc đọc xong body).
7. Chờ mọi request xong, snapshot stats `after`. `queries_per_expiry = calls_after − calls_before`.
8. Kiểm validity (mục 8), ghi file, chờ TTL hết cho lượt sau.

Thứ tự lượt: 10 cặp xen kẽ (5 cặp `plain→coalesced`, 5 cặp `coalesced→plain`), xáo thứ tự bằng seed ghi trong config.

## 7. Định dạng log

Thư mục mỗi lượt: `results/<pilot|official>/<run_id>/` với `run_id = YYYYMMDDTHHMMSSZ-<mode>-<pair>`.

| File | Nội dung |
| --- | --- |
| `config.json` | `/config` của hai instance + tham số runner (burst size, seed thứ tự, versions, máy, git commit) |
| `snapshots/before.json`, `snapshots/after.json` | `calls`, `queryid`, `total_exec_time`, thời điểm lấy |
| `requests.jsonl` | một dòng mỗi request (xem dưới) |
| `summary.json` | số liệu tổng hợp của lượt và kết quả validity |

Mỗi dòng `requests.jsonl`:

```json
{"run_id":"...","mode":"plain","seq":1,"instance":"app1","t_send_mono_ms":0.0,"duration_ms":0.0,"status":200,"payload_sha256":"...","cache_result":"miss-query","db_queries":1,"pool_wait_ms":0.0,"query_ms":0.0,"lock_wait_ms":0.0,"server_recv_ts":0.0}
```

`summary.json` tối thiểu: `mode, pair, run_id, queries_per_expiry, sum_db_queries_from_headers, p95_ms, p50_ms, max_ms, n_ok, n_error, burst_span_ms, hit_count, miss_query_count, miss_wait_count, miss_fallback_count, valid (bool), invalid_reasons (list)`.

Tổng hợp cuối (Task 6): bộ aggregate `benchmark/src/aggregate.js` nhận thư mục `results/<kind>/` (`kind` = `pilot` hoặc `official`, theo `RESULTS_KIND`), đọc mọi `<run_id>/` bên trong và ghi hai file **cùng thư mục đó**:

| File | Nội dung |
| --- | --- |
| `results/<kind>/summary.csv` | một dòng mỗi lượt, gồm cả lượt `valid=false` (cột `valid`, `invalid_reasons`) |
| `results/<kind>/report_table.md` | bảng dùng trong `REPORT.md`: p95 từng mode, `delta_p95_ms` theo cặp, median và min–max, số `miss-fallback` |

Phân việc: runner (Task 4) chỉ ghi file của từng lượt như trên, rồi gọi aggregate ở cuối lệnh `docker compose run --rm benchmark` để in bảng ra màn hình; aggregate (Task 6) không chạy benchmark. Mọi con số trong report/slides phải truy được về dòng trong các file này.

Quy ước: p95 = nearest-rank trên các request status 200. Thời gian ms, `delta_p95_ms = p95_coalesced − p95_plain` (âm nghĩa là p95 giảm). Giá trị `median của p95 từng lượt` và `median của chênh lệch từng cặp` được đặt tên riêng, không gộp.

## 8. Lượt không hợp lệ (đóng băng trước 22/11)

Lượt `valid=false` chỉ khi **phép đo hỏng**, tức bất kỳ điều kiện nào:

- có request status ≠ 200 hoặc timeout client;
- `payload_sha256` khác baseline;
- không xác nhận được expiry trước burst;
- `burst_span_ms = max(server_recv_ts) − min(server_recv_ts) > 100` `[calibrate]` (burst không đủ chồng lấn);
- `sum_db_queries_from_headers ≠ queries_per_expiry` (hai nguồn đếm query không khớp).

Lượt không hợp lệ được giữ nguyên log kèm `invalid_reasons`, rồi chạy bù. Không xóa âm thầm. Chỉ các lý do ở trên mới được dùng để chạy bù.

**Hành vi của intervention không phải lý do loại lượt.** Ở `coalesced`, `miss-fallback` (waiter timeout, lỗi Redis, lease hết sớm) và `queries_per_expiry > 1` là chi phí thực tế của cơ chế. Các lượt này, nếu phép đo hợp lệ, **vẫn nằm trong median chính** và được báo cáo kèm `miss_fallback_count` và `queries_per_expiry` từng lượt. Nếu muốn, REPORT có thể thêm một dòng sensitivity "median khi loại các lượt có fallback", ghi rõ số lượt bị loại, nhưng số chính không được loại chúng.

Cũng không có ngưỡng "plain phải gần 200 query": `queries_per_expiry` của plain là đại lượng được đo, không phải điều kiện nghiệm thu.

## 9. Điều kiện nghiệm thu pilot

Xem bảng checklist trong `docs/PILOT-CHECKLIST.md`. Contract coi là "đạt" khi tất cả mục trong đó pass trên hai instance.

## 10. Lịch sử thay đổi

| Version | Ngày | Thay đổi |
| --- | --- | --- |
| 1.0 | 17/11/2026 | Bản đầu, theo quyết định D1–D12. |
| 1.1 | 17/11/2026 | Theo review của Codex: (1) `/config` tách metadata (`instance`, `port`) khỏi `params` cần khớp; (2) fallback và query lặp ở coalesced giữ trong median chính, không còn là lý do loại lượt; (3) bỏ ngưỡng "plain gần 200 query". `SEED_REVIEWS` = 800000 sau khi đo query 34–40 ms. |
| 1.2 | 18/11/2026 | Theo đề xuất của Phúc ở issue #1: `summary.csv` và `report_table.md` được ghi vào `results/<kind>/` (pilot và official), không chỉ `results/official/`; làm rõ runner (Task 4) ghi dữ liệu từng lượt và gọi aggregate (Task 6) ở cuối lệnh. |
| 1.3 | 18/11/2026 | Rút lịch: bản final xong 25/11 (hạn nộp chính thức 29/11 là dự phòng); pilot 19–21/11, đóng băng trước 22/11, official 22/11. Không đổi API, định dạng log hay quy tắc đo. |
