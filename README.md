# C5 — Multi-layer caching and cache stampede

Repository: https://github.com/2609-AWAD-23-3/c5-cache-stampede

Nhóm: Nguyễn Khắc Vượng, Bửu Huỳnh Vĩnh Phúc, Trần Quốc Vỹ — CSC13114, CQ2023/3. Bộ MSSV: 23120328, 23120409, 23120410.

Câu hỏi:

> When a hot cache key expires under 200 concurrent requests, how many Postgres queries does request coalescing with a Redis lock save compared with plain cache-aside (queries per expiry), and how much does it add to p95 latency (ms)?

Tài liệu kỹ thuật: [CONTRACT.md](CONTRACT.md). Báo cáo: [REPORT.md](REPORT.md).

## Yêu cầu

- Docker Desktop (Compose 5.x; máy chuẩn dùng Compose v5.7.0). Version dùng cho lần đo chính thức được ghi ở mục "Môi trường đo chính thức".
- Git. Không cần cài Node hay Postgres trên máy.

## Chạy từ fresh clone

```bash
git clone <repo-url> c5 && cd c5
cp .env.example .env
docker compose run --rm benchmark
```

Lệnh cuối tự dựng và chờ `postgres`, `redis`, `app1`, `app2` healthy, rồi chạy benchmark và in bảng kết quả. Raw output nằm ở `results/<RESULTS_KIND>/<run_id>/`.

> **Lưu ý khi chạy lại hoặc đổi cấu hình:**
> - **Đổi `SEED_REVIEWS` phải xóa volume DB trước:** Postgres chỉ chạy script seed (`db/init/`) khi khởi tạo volume mới. Nếu sửa `SEED_REVIEWS` trong `.env` (hoặc trên máy đã từng chạy version cũ), hãy chạy `docker compose down -v` trước khi chạy lại benchmark.
> - **Chạy trong thư mục kết quả sạch:** Cuối mỗi lần chạy, `benchmark/src/aggregate.js` tổng hợp **mọi** `<run_id>/` hiện có trong `results/<RESULTS_KIND>/`. Trước khi chạy chính thức (`RESULTS_KIND=official`) hoặc khi đo lại từ đầu, hãy đảm bảo thư mục `results/<RESULTS_KIND>/` sạch (chỉ giữ `.gitkeep`) để không gộp trùng các lượt cùng số `pair`. Khi chạy kiểm chứng sau khi repo đã có `results/official/`, dùng mặc định `RESULTS_KIND=pilot`.
> - **Máy đã từng chạy bản cũ cần build lại image:** `docker compose run` không tự dựng lại image đã có sẵn trên máy. Khi kéo commit mới về, chạy `docker compose build` (và `docker compose build benchmark` hoặc xóa image `c5-cache-stampede-*`) trước khi chạy lại.

Chạy nhanh để kiểm môi trường (một cặp):

```bash
PAIRS=1 docker compose run --rm benchmark
```

Chạy chính thức (ghi vào `results/official/`):

```bash
RESULTS_KIND=official docker compose run --rm benchmark
```

Dọn dẹp:

```bash
docker compose down -v
```

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
- **OS & Docker:** Windows 11 Home `10.0.26200` + WSL2 (`linux 6.6.87.2-microsoft-standard-WSL2`, `x64`); Docker Engine `29.9.3` (Docker Desktop, WSL2), Docker Compose `v5.7.0`.
- **Image pins (tag + digest):**
  - `postgres:16.16@sha256:3950ad7c3148ca2175ef1b6c36c9efbf78957ae8fbe8b3a5d7c35af50500382f`
  - `redis:7.4.12@sha256:2e3eb11462c4e3759e6972678dd051d150ff54b1e60714b3c33b701260172a90`
  - `node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a` (Node `v22.23.5`, Alpine `3.24.4`, dùng chung cho `app` và `benchmark`).
- **Thông số đóng băng (`[calibrate]`):** `SEED_REVIEWS=300000`, `CACHE_TTL_MS=3000`, `PG_POOL_MAX=10`, `LOCK_LEASE_MS=5000`, `WAIT_POLL_MS=5`, `WAIT_TIMEOUT_MS=2000`; `cpus`: `app1=1`, `app2=1`, `postgres=2`, `redis=1`, `benchmark=1`; `PAIRS=10`, `BURST_SIZE=200`, `ORDER_SEED=20261117`, ngưỡng `burst_span_ms <= 100 ms`.
- **Git commit & thời điểm official run:** Commit `3682b13` (chạy ngày 22/11/2026, 15:20–15:23 UTC; raw output ở `results/official/`). Tại commit `3682b13`, role `bench_ro` chưa có quyền `SELECT` trên `reviews`, nên `seed_reviews_count=300000` trong `config.json` của 20 lượt official lấy qua đường dự phòng `pg_class.reltuples` (đã đối chiếu bằng `SELECT count(*)` trực tiếp = `300000`); từ commit `8e97ebd` (PR #21) trở đi, `db/init/02-schema-seed.sh` đã thêm `GRANT SELECT ON reviews TO bench_ro` nên runner đếm trực tiếp bằng `count(*)` khi tạo volume mới.
- **Quy ước tổng hợp (`benchmark/src/aggregate.js`):**
  - `p50`/`p95`: nearest-rank trên các request `status == 200`.
  - `median_query_ms`: chỉ tính trên các request có thực thi query (`db_queries > 0`; loại bỏ waiter/hit).
  - Median của tập có số phần tử chẵn (ví dụ 10 cặp): trung bình cộng hai giá trị giữa.
  - `delta_p95_ms = p95_coalesced − p95_plain` (giá trị âm nghĩa là `p95` giảm).
