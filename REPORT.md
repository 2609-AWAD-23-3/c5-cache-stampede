Repository: https://github.com/2609-AWAD-23-3/c5-cache-stampede

# C5 — Request coalescing với Redis lock so với cache-aside thường

## 1. Câu hỏi
> When a hot cache key expires under 200 concurrent requests, how many Postgres queries does request coalescing with a Redis lock save compared with plain cache-aside (queries per expiry), and how much does it add to p95 latency (ms)?

Phạm vi: chỉ đo layer Redis đứng trước Postgres. L1 in-process và CDN nằm ngoài phạm vi. In-process single-flight là phương án thay thế chưa đo.

**Trả lời ngắn.** Kết quả trên máy chuẩn, 10 cặp lượt đo, ghi dạng median (min–max):

- Mỗi lần key nóng hết hạn, `plain` chạy **200 (115–200)** query Postgres, `coalesced` chỉ chạy **1 (1–1)**. Coalescing tiết kiệm **199 (114–199) queries/expiry**.
- Coalescing **không làm tăng p95 mà làm giảm p95**: `delta_p95_ms` = **−3696.122 ms (−4353.170 đến −1863.389)**, âm ở cả 10/10 cặp. Cụ thể p95 của `plain` là 3925.724 ms, của `coalesced` là 138.881 ms.
- Lý do (xem mục 4): ở `plain`, 200 request cùng query nên phải xếp hàng chờ 20 connection Postgres (10 mỗi instance). Ở `coalesced`, chỉ một request query, 199 request còn lại chờ khoảng 43 ms rồi đọc kết quả từ cache.
- Con số ms phụ thuộc máy (mục 6.1). Kết quả lặp lại được trên máy khác là dấu của chênh lệch và độ lớn tương đối.

Số liệu lấy từ `results/official/report_table.md` và được tính lại độc lập trong `results/official/crosscheck_report.md`.

**Cách đọc số trong report.**

| Thuật ngữ | Nghĩa |
| --- | --- |
| `plain` | Baseline, cache-aside thường: request nào thấy cache trống cũng tự query Postgres rồi ghi lại cache. |
| `coalesced` | Thay đổi cần đo: khi cache trống, chỉ request lấy được Redis lock mới query Postgres. Các request khác chờ rồi đọc kết quả mà request đó ghi vào cache. |
| Lượt đo, một lần hết hạn (expiry) | Key `cache:product:1` tự hết TTL, rồi runner bắn ngay 200 request đồng thời vào product 1. Mỗi lượt đo là đúng một lần hết hạn. |
| Cặp | Một lượt `plain` và một lượt `coalesced` chạy liền nhau. 5 cặp chạy `plain` trước, 5 cặp chạy `coalesced` trước. |
| queries/expiry | Số lần Postgres chạy query mục tiêu trong một lượt, đếm bằng `pg_stat_statements` (số `calls` sau burst trừ trước burst) và kiểm chéo với header `X-DB-Queries` của từng response. |
| p50, p95 (ms) | 50% hoặc 95% số request của lượt xong trong khoảng thời gian này. Thời gian đo ở client, từ lúc gửi đến lúc đọc xong body. p95 cho biết nhóm request chậm nhất phải chờ bao lâu. |
| `delta_p95_ms` | p95 của `coalesced` trừ p95 của `plain` trong cùng một cặp. Âm nghĩa là coalescing làm p95 giảm, dương nghĩa là làm tăng. |
| median (min–max) | Median là giá trị đứng giữa của 10 lượt (hoặc 10 cặp). Trong ngoặc là giá trị nhỏ nhất và lớn nhất, dùng làm spread. |
| `hit`, `miss-query`, `miss-wait`, `miss-fallback` | Kết quả cache của từng request: `hit` là đọc được cache ngay; `miss-query` là tự query; `miss-wait` là chờ request giữ lock rồi đọc cache (chỉ `coalesced`); `miss-fallback` là chờ quá 2000 ms hoặc gặp lỗi Redis nên tự query (chỉ `coalesced`). |

## 2. Setup
### 2.1 Môi trường và version
- **Máy chuẩn (máy Vượng):** AMD Ryzen 7 H 260 (8 nhân, 16 luồng), RAM 31.3 GB, Windows 11 Home 10.0.26300. Docker Engine 29.9.3, Compose v5.7.0; container chạy trong máy ảo WSL2 (16 CPU, 15.3 GB). Chi tiết ở README, mục "Môi trường đo chính thức".
- **Container:** PostgreSQL 16.16, Redis 7.4.12, Node.js 22.23.5 (Alpine 3.24.4), thư viện `pg` 8.23.1 và `redis` 4.7.1, pin theo digest (mục 7). Giới hạn CPU: `app1` 1, `app2` 1, `postgres` 2, `redis` 1, runner 1.
- **Lần đo chính thức:** commit `3682b13`, ngày 22/11/2026, 10 cặp.

### 2.2 Data và query
- **Dữ liệu:** database `shop` có `products` (10 dòng) và `reviews` (300000 dòng), seed xác định (không dùng `random()`). Mỗi product có 30000 review; product 1 là key nóng.
- **Query:** đếm review và tính điểm trung bình của product 1 (`LEFT JOIN`, `GROUP BY`; câu đầy đủ ở `CONTRACT.md` mục 3). Cột `reviews.product_id` cố ý không có index nên mỗi query duyệt cả bảng.
- **Độ nặng:** chạy một mình, query mất p50 32.9 ms, p90 39.2 ms (30 lần, `results/calibration/20261119T051447Z-seed300000.json`), trong khoảng mục tiêu 20–50 ms. Ở 800000 review là p50 84.9 ms (`...051312Z-seed800000.json`), ngoài khoảng, nên chọn 300000.

### 2.3 Load và cách đo
- **Tải đồng thời và chờ hết hạn:** Trước khi đo các cặp, runner chạy bước warm-up (một chu kỳ `miss → hit → expiry` cho mỗi mode và 20 request tuần tự qua hai instance, không tính vào kết quả) để tránh xuất phát từ trạng thái lạnh (`CONTRACT.md` mục 6). Khi đo, runner bắn đồng loạt 200 request chia đều qua hai instance (`app1` 100, `app2` 100) bằng các kết nối HTTP keep-alive mở sẵn (`undici.Pool`); trước mỗi burst, runner làm đầy cache (`PTTL > 0`) rồi đợi key tự hết hạn qua `EXISTS == 0` (không gọi `DEL`).
- **Đếm query và đo latency:** Số query Postgres mỗi lần hết hạn (`queries_per_expiry`) lấy từ hiệu `calls_after − calls_before` trong `pg_stat_statements` (lọc theo role `app_user` và câu query mục tiêu, không reset stats), kiểm chéo với tổng header `X-DB-Queries` của cả 200 response. Độ trễ từng request đo ở phía client bằng monotonic clock (`performance.now()`, từ lúc gửi request đến lúc đọc xong response body); `p50` và `p95` tính theo công thức nearest-rank trên các request `status == 200`.
- **Cấu trúc lượt đo và điều kiện hợp lệ:** Thực nghiệm gồm 10 cặp xen kẽ (5 cặp `plain→coalesced` và 5 cặp `coalesced→plain`, xáo thứ tự bằng `ORDER_SEED=20261117`). Theo `CONTRACT.md` mục 8, một lượt chỉ `valid=true` khi đủ 200 response `200`, `payload_sha256` khớp baseline, xác nhận được expiry trước burst, `burst_span_ms ≤ 100 ms` và `Σ X-DB-Queries == queries_per_expiry` (lượt không hợp lệ được giữ nguyên log kèm `invalid_reasons` và chạy bù).
- **Quy ước tổng hợp (`benchmark/src/aggregate.js`):** Tách riêng `median_of_run_p95_ms` (median `p95` của 10 lượt) và `median_of_pair_delta_p95_ms` (median của `delta_p95_ms = p95_coalesced − p95_plain` theo từng cặp; dấu âm nghĩa là `p95` giảm). Với tập số phần tử chẵn (10 cặp), median là trung bình cộng hai giá trị giữa; `median_query_ms` chỉ tính trên các request có thực thi query (`db_queries > 0`, loại trừ waiter và hit).

## 3. Baseline, thay đổi và thiết kế lock
Hai mode chạy trong cùng một service; runner chọn mode cho từng request bằng header `X-Cache-Mode`.

### 3.1 Baseline `plain` (cache-aside)
Đọc cache; `hit` thì trả ngay. Miss thì tự query Postgres, ghi cache với TTL 3000 ms rồi trả. Không có lock, nên mọi request thấy cache trống trước khi request đầu ghi xong đều tự query (cache stampede).

### 3.2 Thay đổi `coalesced` (request coalescing bằng Redis lock)
Chỉ nhánh cache miss khác baseline:
1. Miss thì thử lấy lock: `SET lock:product:1 <token> NX PX 5000` (`NX`: chỉ đặt khi chưa có; `<token>`: chuỗi ngẫu nhiên riêng của request; `PX 5000`: lease 5000 ms).
2. **Holder** (lấy được lock) đọc lại cache (recheck); nếu đã có thì nhả lock và trả `hit`. Nếu chưa, query, ghi cache, **rồi mới** nhả lock (để request đến sau thấy cache đã có) bằng script Lua compare-and-delete (chỉ xóa khi lock còn là của mình).
3. **Waiter** đọc cache mỗi 5 ms (`miss-wait`); quá 2000 ms thì tự query (`miss-fallback`). Lỗi Redis ở bước đọc cache, lấy lock, recheck hoặc poll cũng đi theo nhánh fallback và được log.

Ba tham số riêng: `LOCK_LEASE_MS` 5000, `WAIT_POLL_MS` 5, `WAIT_TIMEOUT_MS` 2000. Lease phải lớn hơn thời gian query của holder; ở lần đo chính thức query lâu nhất của holder là 79.2 ms (`results/official/*/requests.jsonl`). `SET NX PX` và Lua compare-and-delete khớp mẫu Redis khuyến nghị cho Redis 7.4 (mục 7).

### 3.3 Giữ cố định
Hai mode dùng cùng endpoint `GET /products/1`, body (runner so SHA-256), SQL, seed 300000, TTL 3000 ms, pool 10 connection mỗi instance, giới hạn CPU, 200 request mỗi burst (100/100 hai instance), client, image và commit `3682b13` (`CONTRACT.md` mục 3–6). Chỉ khác nhánh cache miss và ba tham số lock ở trên.

### 3.4 Kiểm lock
Năm tình huống chạy ngày 19/11/2026 trên máy chuẩn (`npm run test:lock`; bằng chứng `results/lock-tests/20261119T054509Z/case-N.json`, N là mục 10–14 của `docs/PILOT-CHECKLIST.md`):
- **10, 11 (burst 200, cấu hình mặc định):** 1 query (delta `pg_stat_statements.calls` = tổng `X-DB-Queries`): 1 `miss-query`, 119 `miss-wait`, 80 `hit`. Có 1 holder đọc lại cache thấy đã có và không query (recheck). Đúng 1 holder ghi cache, `cache_set` trước `lock_released`.
- **12 (`LOCK_LEASE_MS=10`, ngắn hơn query):** 3 query thay vì 1; cả 3 lần nhả lock trả `lock_not_owned`, Lua không xóa lock không phải của mình.
- **13 (kill holder khi đang query):** lock của holder chết còn khi waiter hết timeout; 10 waiter đều `miss-fallback` sau 2000.5–2008.3 ms, mỗi waiter 1 query; lock hết lease thì request mới lấy được lock.
- **14 (lock giả không bao giờ nhả, 50 request):** 50/50 `miss-fallback`, `lock_wait_ms` 2003.0–2010.5 ms.

Mục 12–14 cố ý gây lỗi; lần đo chính thức có 0 `miss-fallback`. Kết quả cho thấy lock chạy đúng thiết kế ở cả năm tình huống; khi lỗi xảy ra, hậu quả quan sát được là query thừa hoặc chờ thêm, các request vẫn nhận được kết quả; riêng request của holder bị kill ở tình huống 13 mất kết nối.

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

Request coalescing cắt số query Postgres mỗi lần key nóng hết hạn từ 200 (115–200) xuống 1, tiết kiệm median 199 query/lượt và giảm `p95` từ 3925.724 ms xuống 138.881 ms mà không phát sinh `miss-fallback`.

- **Dấu của `delta_p95_ms`:** Âm ở cả 10/10 cặp (`−4353.170` đến `−1863.389 ms`), tức request coalescing **giảm** mạnh p95 thay vì làm tăng độ trễ p95.
- **Nguyên nhân từ log `plain`:** 200 request đồng thời qua 2 instance (`PG_POOL_MAX=10`/instance → tối đa 20 query song song tranh 2 CPU Postgres) đẩy median `pool_wait_ms` lên `1609.2 ms` và median `query_ms` lên `383.2 ms` (gấp ~11.6 lần mức p50 đơn lẻ `32.9 ms` ở `results/calibration/20261119T051447Z-seed300000.json`). Ở request vị trí p95, `pool_wait_ms + query_ms` chiếm ~99% độ trễ (median `3888.0 ms` trên `3925.7 ms`).
- **Nguyên nhân từ log `coalesced`:** Chỉ 1 holder query (`pool_wait_ms = 0`, `query_ms` median `43.1 ms`), 199 waiter chờ `lock_wait_ms` median `42.7 ms`, `0` fallback. Tại request vị trí p95 (đều là `miss-wait`), các thành phần được log chiếm median `54.1 ms` trên `138.9 ms`; phần còn lại (median `64.9 ms`, tối đa `148.7 ms`) chưa xác định được nguồn vì app không log thời gian từ lúc vào handler đến lúc đọc cache và client không log riêng thời gian gửi.
- **Spread của `plain` (`115–200` queries/expiry):** 4/10 lượt `plain` (cặp 1, 3, 7, 10: `138`, `115`, `116`, `165` queries) có `35–85` `hit` (`hit_rate` tới `0.425`, ví dụ `results/official/20261122T152145Z-plain-3/summary.json`, `results/official/20261122T152248Z-plain-7/summary.json`); toàn bộ hit nằm ở một instance khi nhánh đọc cache của instance đó diễn ra sau lúc instance kia đã ghi cache.

## 5. Khuyến nghị và khi nên tránh

Mỗi ý dưới đây ghi rõ mức bằng chứng: **đo được** (có trong log), **suy luận** (rút ra từ log nhưng không đo trực tiếp) hoặc **chưa đo**.

### Khuyến nghị

**Nên dùng request coalescing với Redis lock cho hot key có query đắt và nhiều request đồng thời lúc key hết hạn.** Trong thí nghiệm này, coalescing giảm số query mỗi lần hết hạn từ 200 xuống 1 và giảm p95 khoảng 3.7 s (**đo được**, mục 4). Phần p95 giảm được là do bỏ được hàng đợi ở connection pool: ở `plain`, request đứng vị trí p95 dành khoảng 99% thời gian cho việc chờ pool và chạy query, còn ở `coalesced` không request nào phải chờ pool (mục 4).

Khi dùng cần chỉnh và theo dõi ba điểm sau:

- **`LOCK_LEASE_MS` phải dài hơn thời gian query của holder khi có tải.** Holder là request giữ lock. Nếu lease hết trước khi holder ghi xong cache, request khác lấy được lock và query lặp lại. Test chủ ý với lease 10 ms cho 3 query thay vì 1 (**đo được**, `results/lock-tests/20261119T054509Z/case-12.json`). Trong official, query của holder lâu nhất 79.237 ms, còn lease là 5000 ms.
- **`WAIT_TIMEOUT_MS` phải dài hơn thời gian holder refill cache.** Nếu ngắn hơn, các request đang chờ cùng hết thời gian, cùng tự query, và stampede quay lại. Test chủ ý giữ lock 15 s cho kết quả 50/50 request `miss-fallback`, mỗi request 1 query (**đo được**, `case-14.json`). Trong official, request chờ lâu nhất là 198.302 ms, còn timeout là 2000 ms, nên có 0 fallback.
- **Theo dõi `miss_fallback_count` và queries/expiry trong vận hành.** Hai số này tăng là dấu hiệu lease hoặc timeout không còn hợp với thời gian query thật.

### Khi nên tránh hoặc cần cân nhắc

- **Không chấp nhận được độ trễ xấu nhất bằng khoảng `WAIT_TIMEOUT_MS`.** Khi holder chết giữa chừng, các request đang chờ phải đợi hết timeout mới tự query. Trong test giết holder, chúng fallback sau 2000.5–2008.3 ms (**đo được**, `case-13.json`).
- **Key ít request đồng thời.** Nhóm chỉ đo mức 200 request (**chưa đo** mức thấp hơn). Khi ít request, `plain` gần như không phải xếp hàng chờ pool. Trong khi đó `coalesced` vẫn tốn thêm bước lấy lock, và request đang chờ có thể đọc được cache muộn tới `WAIT_POLL_MS` = 5 ms sau khi holder đã ghi xong (`docs/PILOT-CHECKLIST.md` mục 16). Vì vậy ở tải thấp, coalescing có thể làm p95 tăng nhẹ (**suy luận**).
- **Query rẻ, hoặc pool và Postgres còn dư sức.** Lợi ích về p95 trong thí nghiệm đến chủ yếu từ hàng đợi pool, nên khi không có hàng đợi này thì lợi ích nhỏ hơn nhiều. Phần tiết kiệm số query thì vẫn còn (**suy luận**).
- **Redis đã gần quá tải.** Request đang chờ đọc cache mỗi 5 ms. Với thời gian chờ median 42.749 ms, mỗi request đọc khoảng 8–9 lần, tức khoảng 1700 lệnh `GET` cho 199 request mỗi lần hết hạn (**suy luận** từ log; tải Redis **chưa đo**).
- **Cần mutual exclusion chặt, ví dụ lock bảo vệ thao tác ghi dữ liệu.** Lock trên một Redis node không bảo đảm loại trừ khi failover, vì replication bất đồng bộ (theo trang distributed locks của Redis, mục 7). Với refill cache, nếu lock hỏng thì hậu quả chỉ là có thêm query, nên vẫn chấp nhận được. Với việc ghi dữ liệu thì không nên dùng kiểu lock này.
- **Phương án thay thế (chưa đo):** in-process single-flight (gộp request trong một instance, không cần Redis), làm mới cache trước khi hết hạn, hoặc trả dữ liệu cũ trong lúc làm mới (stale-while-revalidate). Nhóm chưa đo các cách này nên không so sánh số.

## 6. Giới hạn

### 6.1 Giới hạn của phép đo

- **Phạm vi hẹp.** Thí nghiệm có một hot key (product 1), một dạng query, một mức tải (200 request, 100 mỗi instance), Redis và Postgres mỗi thứ một node, chạy local bằng Docker. Kết luận không tự động đúng khi có nhiều key nóng cùng lúc, khi tải thấp hơn hoặc khi chạy trên cluster.
- **Client và server chạy chung một máy.** Container benchmark (1 CPU) chạy cùng máy với app, Redis và Postgres. Mỗi container có giới hạn `cpus`, nhưng tất cả vẫn dùng chung CPU vật lý của Docker trên WSL2, nên tranh chấp tài nguyên ảnh hưởng tới latency. Ví dụ, query của `plain` khi có tải có median 383.232 ms, trong khi chạy một mình chỉ mất 32.9 ms (p50, `results/calibration/20261119T051447Z-seed300000.json`).
- **Spread chỉ phản ánh biến thiên trong một lần chạy.** 10 cặp chạy liên tục trong khoảng 2.5 phút (15:21–15:23 UTC, 22/11/2026) trên một máy. Spread này không cho biết số liệu thay đổi thế nào giữa các máy hay giữa các ngày.
- **Số ms phụ thuộc máy.** Pilot trên máy Phúc (Intel i5-12500H, Docker Engine 28.5.1, 5 cặp, `results/pilot-r1/report_table.md`) cho p95 của `plain` là 1820.438 ms và của `coalesced` là 41.825 ms, delta median −1762.677 ms. Trên máy chuẩn, hai giá trị p95 tương ứng là 3925.724 ms và 138.881 ms. Điều giữ nguyên trên cả hai máy là `coalesced` chạy 1 query mỗi lần hết hạn và delta âm ở mọi cặp. Người chạy lại nên so dấu và độ lớn tương đối, không so con số ms.
- **`plain` không phải lúc nào cũng chạy 200 query.** 4/10 lượt chỉ có 115–165 query, vì một số request đọc được cache mà instance kia vừa ghi. Đó là lý do `queries_saved` có spread 114–199. Nhóm chưa xác định được vì sao chỉ một số lượt có hit. Timestamp `server_recv_ts` được lấy lúc request vào handler, không phải lúc đọc cache, nên không dùng để giải thích được (`docs/RESULT-ANALYSIS.md` mục 3).
- **Một phần latency của `coalesced` chưa giải thích được.** Ở request đứng vị trí p95, các thời gian mà app có log (chờ lock, chờ pool, query) chỉ chiếm median 54 ms trên 139 ms. Phần còn lại chưa xác định được nguồn, vì app không log đoạn từ lúc vào handler đến lúc đọc cache, và client cũng không log riêng thời gian gửi (số chi tiết ở mục 4).
- **Burst sát ngưỡng hợp lệ.** Một lượt chỉ hợp lệ khi `burst_span_ms` ≤ 100 ms (`CONTRACT.md` mục 8). Giá trị lớn nhất là 98.135 ms, ở cặp 8, lượt `coalesced`. Chỉ số này cũng dựa trên `server_recv_ts`, tức thời điểm request vào handler.
- **Số dòng seed là giá trị ước lượng.** `seed_reviews_count` = 300000 trong official lấy từ `pg_class.reltuples`, vì commit `3682b13` chưa cấp quyền `SELECT` trên `reviews` cho `bench_ro`. Sau đó nhóm đếm lại bằng `count(*)` và được đúng 300000 (PR #21).

### 6.2 Giới hạn của lock
- **Chỉ một node Redis, không phải Redlock.** Redis nêu: chấp nhận được khi thỉnh thoảng có race, vì replication bất đồng bộ nên failover có thể cho hai client cùng giữ lock, và TTL của Redis không dựa trên đồng hồ monotonic (mục 7). Chưa thử failover. Dữ liệu ở đây chỉ đọc nên hậu quả chỉ là thêm query (suy luận, chưa đo).
- **Lease hết trước khi holder xong thì sinh query trùng** (tình huống 12: 3 query). Lease 5000 ms lớn hơn nhiều query lâu nhất của holder ở lần đo chính thức (79.2 ms), nên cấu hình chính thức không gặp.
- **Holder chết thì waiter đợi hết `WAIT_TIMEOUT_MS`** rồi mỗi waiter tự query (tình huống 13: 10 waiter, 10 query). Chưa đo với 199 waiter.
- **Chưa đo** tải Redis do waiter poll mỗi 5 ms.

## 7. Nguồn

Mọi link dưới đây đọc ngày **23/11/2026**. Bảng đầy đủ, gồm từng claim và kết quả kiểm, nằm trong [`docs/SOURCES.md`](docs/SOURCES.md).

Version đã dùng (pin bằng digest trong `compose.yaml` và Dockerfile):

- PostgreSQL 16.16, phát hành 2026-11-12: https://www.postgresql.org/docs/release/16.16/ ; chính sách hỗ trợ (nhánh 16 được hỗ trợ đến 2028-11-09): https://www.postgresql.org/support/versioning/
- Redis 7.4.12, phát hành 2026-10-26: https://github.com/redis/redis/releases/tag/7.4.12 ; nhánh còn được hỗ trợ: https://github.com/redis/redis/security/policy
- Node.js 22.23.5, phát hành 2026-11-11, Maintenance LTS đến 2027-04-30: https://nodejs.org/en/blog/release/v22.23.5 ; https://github.com/nodejs/release#release-schedule
- Alpine Linux 3.24.4 (bên trong image Node): https://alpinelinux.org/releases/
- Digest image trên Docker Hub: https://hub.docker.com/v2/repositories/library/postgres/tags/16.16 , https://hub.docker.com/v2/repositories/library/redis/tags/7.4.12 , https://hub.docker.com/v2/repositories/library/node/tags/22.23.5-alpine
- Thư viện npm `pg` 8.23.1, `redis` 4.7.1, `undici` 6.29.1: https://registry.npmjs.org/-/package/pg/dist-tags , https://registry.npmjs.org/-/package/redis/dist-tags , https://registry.npmjs.org/-/package/undici/dist-tags
- Docker Desktop 4.99.0 kèm Docker Engine 29.9.3 và Compose v5.7.0 (máy chuẩn): https://docs.docker.com/desktop/release-notes/ ; https://docs.docker.com/engine/release-notes/29/ ; Docker Engine 28.5.1 (máy pilot): https://docs.docker.com/engine/release-notes/28/

Hành vi mà thiết kế dựa vào:

- `pg_stat_statements` (`calls`, `track=all`, `shared_preload_libraries`): https://www.postgresql.org/docs/16/pgstatstatements.html
- Role `pg_read_all_stats` cho `bench_ro`: https://www.postgresql.org/docs/16/predefined-roles.html
- Redis `SET ... NX PX`: https://redis.io/docs/latest/commands/set/
- Lock bằng Redis, nhả lock bằng Lua compare-and-delete, giới hạn khi failover: https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/
- Lua script chạy atomic: https://redis.io/docs/latest/develop/programmability/eval-intro/
- Pool của `pg` (`max` mặc định 10, xếp hàng khi hết connection): https://node-postgres.com/apis/pool
