# C5 — Multi-layer caching and cache stampede

Repository: https://github.com/2609-AWAD-23-3/c5-cache-stampede

Nhóm: Nguyễn Khắc Vượng, Bửu Huỳnh Vĩnh Phúc, Trần Quốc Vỹ — CSC13114, CQ2023/3. Bộ MSSV: 23120328, 23120409, 23120410.

Câu hỏi:

> When a hot cache key expires under 200 concurrent requests, how many Postgres queries does request coalescing with a Redis lock save compared with plain cache-aside (queries per expiry), and how much does it add to p95 latency (ms)?

Tài liệu kỹ thuật: [CONTRACT.md](CONTRACT.md). Báo cáo: [REPORT.md](REPORT.md).

## Yêu cầu

- Docker Desktop (Compose v2). Version dùng cho lần đo chính thức được ghi ở mục "Môi trường đo chính thức".
- Git. Không cần cài Node hay Postgres trên máy.

## Chạy từ fresh clone

```bash
git clone <repo-url> c5 && cd c5
cp .env.example .env
docker compose run --rm benchmark
```

Lệnh cuối tự dựng và chờ `postgres`, `redis`, `app1`, `app2` healthy, rồi chạy benchmark và in bảng kết quả. Raw output nằm ở `results/<RESULTS_KIND>/<run_id>/`.

> **Trạng thái hiện tại:** repo mới có khung. `app/` và `benchmark/` là stub nên lệnh trên chưa chạy được benchmark. Đã kiểm hoạt động: `docker compose up -d --wait postgres redis` (seed, role, `pg_stat_statements`). README được cập nhật khi Task 2–5 xong và được kiểm bằng fresh clone.

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

Điền ở Task 5 sau pilot: CPU, RAM, OS, Docker version, image tags/digest, Node version, git commit dùng cho official run.
