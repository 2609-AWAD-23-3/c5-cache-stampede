# C5 — Multi-layer caching and cache stampede

Repository: https://github.com/2609-AWAD-23-3/c5-cache-stampede

Nhóm: Nguyễn Khắc Vượng, Bửu Huỳnh Vĩnh Phúc, Trần Quốc Vỹ — CSC13114, CQ2023/3. Bộ MSSV: 23120328, 23120409, 23120410.

Câu hỏi:

> When a hot cache key expires under 200 concurrent requests, how many Postgres queries does request coalescing with a Redis lock save compared with plain cache-aside (queries per expiry), and how much does it add to p95 latency (ms)?

Tài liệu kỹ thuật: [CONTRACT.md](CONTRACT.md). Báo cáo: [REPORT.md](REPORT.md).

**Kết quả chính (10 cặp, máy chuẩn):** Mỗi lần key nóng hết hạn dưới 200 request đồng thời, `queries/expiry` giảm từ **200 (115–200)** ở `plain` xuống **1 (1–1)** ở `coalesced`, tiết kiệm **199 (114–199) queries/expiry**; `p95` không tăng mà giảm: `delta_p95_ms` median **−3696.122 ms (−4353.170 đến −1863.389)** (`plain` 3925.724 ms vs `coalesced` 138.881 ms), âm ở cả 10/10 cặp (`0` fallback).

## Yêu cầu

- **Docker Engine** kèm plugin `docker compose`. Các phiên bản đã chạy kiểm chứng trên 3 máy:
  - Máy chuẩn (Vượng): Docker Engine `29.9.3`, Docker Compose `v5.7.0` (Docker Desktop `4.99.0`, Windows 11 + WSL2; theo [docs/SOURCES.md](docs/SOURCES.md) mục 2).
  - Máy pilot (Phúc): Docker Engine `28.5.1` (theo [docs/SOURCES.md](docs/SOURCES.md) mục 2), Docker Compose `v2.40.3-desktop.1` (lấy từ `docker compose version` trên máy Phúc, Windows 11 + WSL2).
  - Máy kiểm chứng fresh clone (Vỹ): Docker Engine `29.6.1`, Docker Compose `v5.3.0` (Windows; theo [docs/SOURCES.md](docs/SOURCES.md) mục 2).
- **CPU / RAM:** Tổng giới hạn `cpus` của 5 container trong `compose.yaml` là **6** (`app1=1`, `app2=1`, `postgres=2`, `redis=1`, `benchmark=1`). Máy ít CPU hơn vẫn chạy được, nhưng giá trị độ trễ tuyệt đối (`ms`) sẽ khác.
- **Git** và kết nối mạng (lần đầu để pull image `postgres:16.16`, `redis:7.4.12`, `node:22.23.5-alpine` và chạy `npm ci` trong Docker build). Không cần cài Node.js hay PostgreSQL trên máy (chỉ cần Node 22 nếu chạy các lệnh kiểm tra tùy chọn).

## Chạy từ fresh clone

Các lệnh dưới đây đều chạy từ thư mục gốc của repo sau bước `cd c5-cache-stampede` và hoạt động trên **cả Bash (Linux/macOS/WSL) lẫn Windows PowerShell**:

1. Clone repo và tạo file `.env` từ mẫu:

```bash
git clone https://github.com/2609-AWAD-23-3/c5-cache-stampede.git
cd c5-cache-stampede
cp .env.example .env
```

2. Chạy kiểm nhanh **1 cặp** để xác nhận môi trường (`RESULTS_KIND` mặc định là `pilot` trong `.env`, không ghi đè `results/official/`):

```bash
docker compose run --rm -e PAIRS=1 benchmark
```

> Lưu ý cho **Windows PowerShell**: không dùng cú pháp `PAIRS=1 docker compose ...` (chỉ hợp lệ trên Bash); dùng flag `-e PAIRS=1` như trên để chạy được trên cả hai shell.

3. Nếu muốn chạy đủ **10 cặp** (theo `.env`, vẫn ghi vào `results/pilot/`):

```bash
docker compose run --rm benchmark
```

4. Chạy bộ **official** (`RESULTS_KIND=official`, lệnh dùng để tạo bộ số trong `REPORT.md`):

```bash
docker compose run --rm -e RESULTS_KIND=official benchmark
```

> Chỉ chạy lệnh này khi muốn đo lại bộ official vào thư mục `results/official/` **trống** (chỉ giữ `.gitkeep`; xem mục "Chạy lại và lỗi thường gặp"). Khi chạy kiểm chứng sau khi repo đã có `results/official/`, dùng mặc định `RESULTS_KIND=pilot`.

5. Dọn container và volume DB sau khi chạy xong:

```bash
docker compose down -v
```

### Thời gian dự kiến

- **Lần đầu pull & build:** `docker compose --profile bench build` khi đã có image nền mất **~4.5 giây** (đo trên máy pilot Phúc: `4.48 giây`, Windows 11 + WSL2, i5-12500H); nếu máy chưa có sẵn 3 image nền (`postgres:16.16`, `redis:7.4.12`, `node:22.23.5-alpine`), bước pull từ Docker Hub và `npm ci` trong container mất thêm khoảng **1–3 phút** (**ước lượng**, tùy tốc độ mạng).
- **Chạy 1 cặp (`PAIRS=1`) từ volume DB trống** (dựng stack, seed `300000` dòng `reviews`, chờ healthy, warm-up, đo 1 cặp và in bảng): **~33 giây** (đo thực tế trên PowerShell máy pilot Phúc: `32.91 giây`, trong đó phần warm-up + 1 cặp mất ~14 giây).
- **Chạy đủ 10 cặp (`PAIRS=10`):** phần đo 10 cặp mất khoảng **2.5–3 phút** (theo log official run trên máy chuẩn của Vượng: lượt đầu `15:21:08Z`, lượt cuối `15:23:35Z` ngày 22/11/2026), cộng ~20 giây khởi tạo/seed nếu bắt đầu từ volume sạch.

### Output mẫu và cách đọc

Khi chạy `docker compose run --rm -e PAIRS=1 benchmark` (đã test trên PowerShell), terminal sẽ in quá trình khởi tạo container, bước warm-up, trạng thái từng lượt và bảng tổng hợp:

```text
Running warm-up...
[pair 1/1] Starting 20261123T081638Z-plain-1 (attempt 1)...
[pair 1/1] 20261123T081638Z-plain-1 VALID | queries=130 | p50=453.417ms | p95=1347.343ms | span=32.006ms
[pair 1/1] Starting 20261123T081646Z-coalesced-1 (attempt 1)...
[pair 1/1] 20261123T081646Z-coalesced-1 VALID | queries=1 | p50=43.735ms | p95=56.084ms | span=13.655ms

# Benchmark Report Table

- Valid runs: **2** / 2 total (Plain: 1, Coalesced: 1, Complete valid pairs: 1)
...
| Queries per expiry (`queries_per_expiry`) | 130 (130–130) | 1 (1–1) | **queries_saved**: 129 (129–129) |
| Median of run p95 (`median_of_run_p95_ms`) | 1347.343 (1347.343–1347.343) ms | 56.084 (56.084–56.084) ms | **median_of_pair_delta_p95_ms**: -1291.259 (-1291.259–-1291.259) ms |
```

- **Kiểm tính hợp lệ (`VALID`):** Mỗi lượt phải đạt `VALID` (đủ 200 response `200`, payload khớp SHA-256 baseline, xác nhận cache hết hạn tự nhiên trước burst, `burst_span_ms <= 100 ms` và `Σ X-DB-Queries == delta pg_stat_statements.calls`).
- **Kỳ vọng ở `coalesced`:** `queries=1`, `miss_fallback_count=0`, và `delta_p95_ms` **âm** (`p95` giảm mạnh so với `plain`).
- **Số của `plain` và đơn vị `ms` phụ thuộc máy:** Trên máy khác, `queries` của `plain` dao động (trong khoảng `1–200`, ví dụ `130` ở lượt mẫu trên hoặc `115–200` trên máy chuẩn) và số `ms` tuyệt đối thay đổi theo CPU/lập lịch — điều lặp lại ổn định giữa các máy là `coalesced` giữ được `1` query và `delta_p95_ms` âm.

## Kết quả nằm ở đâu

Runner ghi toàn bộ dữ liệu đo vào `results/<RESULTS_KIND>/` (mặc định `.env.example` đặt `RESULTS_KIND=pilot`):

- Mỗi lượt đo tạo một thư mục `results/<kind>/<run_id>/` gồm 4 loại file:
  1. `config.json` (`/config` hai instance, thông số runner, `git_commit`, `seed_reviews_count`, CPU/RAM WSL2).
  2. `snapshots/before.json` và `snapshots/after.json` (`calls`, `queryid`, `total_exec_time` của `pg_stat_statements` và timestamp trước/sau burst).
  3. `requests.jsonl` (mỗi dòng 1 request với latency client, `X-Cache-Result`, `X-DB-Queries`, `X-Pool-Wait-Ms`, `X-Query-Ms`, `X-Lock-Wait-Ms`).
  4. `summary.json` (tổng hợp và kết quả kiểm tra `valid` của lượt đó).
- Hai file tổng hợp toàn bộ các lượt trong `results/<kind>/`: `summary.csv` (một dòng mỗi lượt, giữ cả lượt `valid=false` nếu có) và `report_table.md` (bảng tổng hợp in ra cuối lệnh chạy).
- **`results/official/`** chứa bộ dữ liệu 10 cặp chính thức dùng trong [REPORT.md](REPORT.md) (commit `3682b13`) — **không ghi đè lên thư mục này** (dùng `RESULTS_KIND=pilot` mặc định khi chạy kiểm chứng).

## Chạy lại và lỗi thường gặp

- **Đổi `SEED_REVIEWS` phải xóa volume DB trước:** Postgres chỉ chạy script seed (`db/init/`) khi khởi tạo volume mới. Nếu sửa `SEED_REVIEWS` trong `.env` (hoặc từng chạy schema cũ), chạy `docker compose down -v` trước khi chạy lại.
- **Chạy trong thư mục kết quả sạch:** Cuối mỗi lần chạy, `benchmark/src/aggregate.js` tổng hợp **mọi** `<run_id>/` hiện có trong `results/<RESULTS_KIND>/`. Trước khi đo một bộ mới (nhất là `RESULTS_KIND=official`), hãy đảm bảo thư mục đích chỉ giữ `.gitkeep` để không gộp trùng các lượt cùng số `pair`.
- **Máy đã từng chạy bản cũ cần build lại toàn bộ image:** `docker compose run` không tự dựng lại image đã có sẵn trên máy. Khi kéo commit mới về, chạy `docker compose --profile bench build` trước khi chạy lại (lưu ý `docker compose build` không có `--profile bench` sẽ bỏ qua service `benchmark`).

## Kiểm lại số official (tùy chọn)
<!-- Vỹ -->

## Test phụ (tùy chọn)

Các script trong `app/test/` kiểm riêng service và lock, không cần để chạy benchmark. Cần Node 22 trên máy (không cần `npm ci`); chạy trong thư mục `app/`. `test:smoke`, `test:lock` và `calibrate` cần stack đang chạy (`docker compose up -d --wait app1 app2`).

| Lệnh | Kiểm gì |
| --- | --- |
| `npm test` | nhánh recheck và lỗi Redis của `app/src/products.js` bằng Redis giả; không cần Docker |
| `npm run test:smoke` | payload hai mode cùng SHA-256, cache hit cho 0 query, một request sau expiry cho 1 query |
| `npm run test:lock` | test lock mục 10–14 của `docs/PILOT-CHECKLIST.md`; ghi bằng chứng vào `results/lock-tests/<thời điểm>/` |
| `npm run calibrate` | đo thời gian query đơn lẻ (mục 9); ghi vào `results/calibration/` |

`test:lock` đổi trạng thái stack (đổi `LOCK_LEASE_MS`, `kill` app1, `pause` Postgres) rồi trả về cấu hình mặc định sau mỗi case, nên đừng chạy cùng lúc với benchmark.

## Cấu trúc

| Đường dẫn | Chủ sở hữu | Nội dung |
| --- | --- | --- |
| `app/` | Vượng | service Node.js, hai mode cache |
| `db/init/` | Vượng | extension, role, schema, seed xác định |
| `compose.yaml` | Vượng | topology (stanza `benchmark`: Phúc) |
| `benchmark/` | Phúc | runner, tổng hợp |
| `results/` | Phúc | raw output (`pilot/`, `official/`) |
| `CONTRACT.md`, `docs/`, `TALK.md`, `slides.pdf`, `SELF_ASSESSMENT_REPORT.md`, bộ aggregate | Vỹ | contract, tài liệu gốc và bộ nộp |
| `README.md` | Phúc | hướng dẫn chạy, điền môi trường đo |
| `REPORT.md` | cả ba (mỗi người viết phần của mình), Vỹ ghép | xem `docs/ISSUES.md` |
| `ai/<tên>/AI-LOG.md` | từng người | log AI riêng; `AI-LOG.md` ở root do Vỹ tổng hợp ở Task 10 |

## Môi trường đo chính thức

- **Máy chuẩn:** Máy Vượng — `AMD Ryzen 7 H 260 w/ Radeon 780M Graphics` (host: 8 nhân / 16 luồng, RAM vật lý `31.3 GB` theo `docs/PILOT-CHECKLIST.md`; `config.json` của official run ghi nhận tài nguyên WSL2 VM: `cpu_count: 16`, `total_memory_mb: 15642`).
- **OS & Docker:** Windows 11 Home `10.0.26300` + WSL2 (`linux 6.6.87.2-microsoft-standard-WSL2`, `x64`); Docker Engine `29.9.3` (Docker Desktop, WSL2), Docker Compose `v5.7.0`.
- **Image pins (tag + digest):**
  - `postgres:16.16@sha256:3950ad7c3148ca2175ef1b6c36c9efbf78957ae8fbe8b3a5d7c35af50500382f`
  - `redis:7.4.12@sha256:2e3eb11462c4e3759e6972678dd051d150ff54b1e60714b3c33b701260172a90`
  - `node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a` (Node `v22.23.5`, Alpine `3.24.4`, dùng chung cho `app` và `benchmark`).
- **Thông số đóng băng (`[calibrate]`):** `SEED_REVIEWS=300000`, `CACHE_TTL_MS=3000`, `PG_POOL_MAX=10`, `LOCK_LEASE_MS=5000`, `WAIT_POLL_MS=5`, `WAIT_TIMEOUT_MS=2000`; `cpus`: `app1=1`, `app2=1`, `postgres=2`, `redis=1`, `benchmark=1`; `PAIRS=10`, `BURST_SIZE=200`, `ORDER_SEED=20261117`, ngưỡng `burst_span_ms <= 100 ms`.
- **Git commit & thời điểm official run:** Commit `3682b13` (chạy ngày 22/11/2026, 15:21–15:23 UTC; raw output ở `results/official/`). Tại commit `3682b13`, role `bench_ro` chưa có quyền `SELECT` trên `reviews`, nên `seed_reviews_count=300000` trong `config.json` của 20 lượt official lấy qua đường dự phòng `pg_class.reltuples` (đã đối chiếu bằng `SELECT count(*)` trực tiếp = `300000`); từ commit `8e97ebd` (PR #21) trở đi, `db/init/02-schema-seed.sh` đã thêm `GRANT SELECT ON reviews TO bench_ro` nên runner đếm trực tiếp bằng `count(*)` khi tạo volume mới.
- **Quy ước tổng hợp (`benchmark/src/aggregate.js`):**
  - `p50`/`p95`: nearest-rank trên các request `status == 200`.
  - `median_query_ms`: chỉ tính trên các request có thực thi query (`db_queries > 0`; loại bỏ waiter/hit).
  - Median của tập có số phần tử chẵn (ví dụ 10 cặp): trung bình cộng hai giá trị giữa.
  - `delta_p95_ms = p95_coalesced − p95_plain` (giá trị âm nghĩa là `p95` giảm).
