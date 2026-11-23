# Kiểm nguồn và version (Task 7)

Ngày đọc: **23/11/2026**. Người kiểm: Vỹ (có hỗ trợ Claude; trang docs đọc qua công cụ tải trang, Docker Hub, npm registry và GitHub đọc trực tiếp). Mỗi dòng dưới đây là một claim về version hoặc hành vi trong repo, kèm link và kết quả. Bảng này là nguồn để chép sang `REPORT.md` mục 7.

## 1. Version chạy trong repo

| Thành phần | Version dùng | Dùng ở | Kết quả kiểm | Nguồn (đọc 23/11/2026) |
| --- | --- | --- | --- | --- |
| PostgreSQL | 16.16 (`postgres:16.16@sha256:3950ad7c…`) | `compose.yaml` | Có thật, phát hành 2026-11-12, có bản vá bảo mật; nhánh 16 hỗ trợ đến 2028-11-09; 16.16 là minor mới nhất | https://www.postgresql.org/docs/release/16.16/ · https://www.postgresql.org/support/versioning/ |
| Redis | 7.4.12 (`redis:7.4.12@sha256:2e3eb114…`) | `compose.yaml` | Có thật, phát hành 2026-10-26, đánh dấu bản vá bảo mật; nhánh 7.4.x còn được hỗ trợ | https://github.com/redis/redis/releases/tag/7.4.12 · https://github.com/redis/redis/security/policy |
| Node.js | 22.23.5 (`node:22.23.5-alpine@sha256:1314fb30…`) | `app/Dockerfile`, `benchmark/Dockerfile` | Có thật, phát hành 2026-11-11, bản vá bảo mật; Node 22 ở trạng thái Maintenance LTS, hết hỗ trợ 2027-04-30 | https://nodejs.org/en/blog/release/v22.23.5 · https://github.com/nodejs/release#release-schedule |
| Alpine Linux | 3.24.4 (bên trong image Node đã pin) | image Node | Đúng: `cat /etc/alpine-release` trong image đã pin trả `3.24.4` (chạy 23/11/2026); 3.24.4 thông báo 2026-11-05; nhánh 3.24 hỗ trợ đến 2028-06-01 | https://alpinelinux.org/releases/ · https://alpinelinux.org/posts/alpine-3.21.10-3.22.8-3.23.8-3.24.4-released/ |
| Digest 3 image | như trên | `compose.yaml`, Dockerfile | Khớp Docker Hub cho cả ba tag (kiểm bằng API) | https://hub.docker.com/v2/repositories/library/postgres/tags/16.16 · …/redis/tags/7.4.12 · …/node/tags/22.23.5-alpine |
| `pg` (node-postgres) | 8.23.1 (`package-lock.json`) | `app/`, `benchmark/` | Là bản mới nhất (`latest`) trên npm | https://registry.npmjs.org/-/package/pg/dist-tags |
| `redis` (node-redis) | 4.7.1, client 1.6.1 | `app/`, `benchmark/` | Là bản mới nhất của nhánh 4.x (tag `maintenance-v4`); bản mới nhất chung là 6.3.1, nên dùng nhánh cũ có chủ ý do lockfile khóa | https://registry.npmjs.org/-/package/redis/dist-tags |
| `undici` | 6.29.1 | `benchmark/` | Là bản mới nhất của nhánh 6 (tag `six`); bản mới nhất chung là 8.13.1 | https://registry.npmjs.org/-/package/undici/dist-tags |

## 2. Môi trường chạy (Docker)

| Máy | Docker | Nguồn / ghi chú |
| --- | --- | --- |
| Máy chuẩn (Vượng), official 22/11 | Docker Engine 29.9.3, Compose v5.7.0 | Docker Desktop 4.99.0 (2026-11-09) đi kèm Engine v29.9.3 và Compose v5.7.0: https://docs.docker.com/desktop/release-notes/ ; Engine 29.9.3 phát hành 2026-11-03: https://docs.docker.com/engine/release-notes/29/ |
| Máy pilot (Phúc) | Docker Engine 28.5.1 | Engine 28.5.1 phát hành 2025-10-08: https://docs.docker.com/engine/release-notes/28/ |
| Máy Vỹ (fresh clone 23/11) | Docker Engine 29.6.1, Compose v5.3.0 | Lấy từ `docker version` và `docker compose version` trên máy; chưa đối chiếu release notes |

Lưu ý: "29.9.3" là số của Docker Engine, không phải của Docker Desktop (Docker Desktop đánh số 4.x). Compose hiện đánh số 5.x (bản mới nhất 5.8.0, 2026-11-17): https://github.com/docker/compose/releases

## 3. Hành vi được dựa vào

| Claim trong repo | Kết quả kiểm | Nguồn |
| --- | --- | --- |
| `pg_stat_statements.calls` là số lần thực thi; `track=all` tính cả câu lệnh lồng nhau; module phải nằm trong `shared_preload_libraries` | Đúng. Lưu ý trang ghi: số liệu chỉ cập nhật khi câu lệnh kết thúc và chỉ cho thao tác thành công | https://www.postgresql.org/docs/16/pgstatstatements.html |
| `bench_ro` có `pg_read_all_stats` đọc được stats và query text của user khác | Đúng | https://www.postgresql.org/docs/16/predefined-roles.html · trang `pg_stat_statements` ở trên |
| `SET key value NX PX ms` khóa theo lease | Đúng; `NX` và `PX` có từ Redis 2.6.12 | https://redis.io/docs/latest/commands/set/ |
| Nhả lock bằng Lua compare-and-delete theo token | Khớp mẫu Redis khuyến nghị cho phiên bản trước 8.4 (từ 8.4 có `DELEX … IFEQ`, không áp dụng cho 7.4) | https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/ |
| Lua script chạy atomic | Đúng ("Redis guarantees the script's atomic execution") | https://redis.io/docs/latest/develop/programmability/eval-intro/ |
| Giới hạn của lock một instance Redis | Trang chính thức nêu: chấp nhận được khi thỉnh thoảng có race; replication bất đồng bộ nên failover có thể phá mutual exclusion; Redis không dùng đồng hồ monotonic cho TTL. Nên nêu trong mục "giới hạn của lock" của REPORT | cùng trang distributed-locks |
| Pool `pg` mặc định `max` = 10 và request chờ trong hàng đợi FIFO khi hết connection (cơ sở của `X-Pool-Wait-Ms`) | Đúng với `pool.connect()`; trang không nói rõ `pool.query` cũng xếp hàng. App lấy connection qua `pool.connect()` (CONTRACT mục 3) nên áp dụng được | https://node-postgres.com/apis/pool |

## 4. Điểm đã sửa và điểm còn mở

- Đã sửa: nhãn "Docker Desktop 29.9.3" thành "Docker Engine 29.9.3" (`docs/PILOT-CHECKLIST.md`); các `#N` chỉ checklist trong `docs/PILOT-CHECKLIST.md`, `app/test/calibrate-query.mjs` và `app/test/lock-tests.mjs` thành "mục N" (các `#N` chỉ issue hoặc PR thật được giữ).
- Đã sửa ở PR #23 (Phúc): `README.md` mục "Yêu cầu" trước đây ghi "Compose v2", nay ghi Compose 5.x (máy chuẩn v5.7.0); README mục "Môi trường đo chính thức" ghi Docker Engine 29.9.3; README có thêm lưu ý máy đã từng chạy bản cũ cần build lại image (xem mục 5).
- Chưa xác minh: Engine 29.6.1 trên máy Vỹ chưa đối chiếu release notes (không ảnh hưởng kết quả official vì official chạy trên máy chuẩn).

## 5. Fresh clone lần cuối (máy Vỹ, sau đóng băng)

- Clone `main` tại commit `8e97ebd` (có `results/official/`), `cp .env.example .env`, `PAIRS=1 docker compose run --rm benchmark` (RESULTS_KIND mặc định `pilot`, không đụng `results/official/`). Docker Engine 29.6.1, Compose v5.3.0, Windows.
- Kết quả: 2/2 lượt hợp lệ, `config.json` ghi `git_commit` `8e97ebd`, `seed_reviews_count` 300000 (đếm bằng `count(*)` nhờ dòng `GRANT SELECT ON reviews TO bench_ro` của PR #21), Node v22.23.5. Plain 121 query, coalesced 1 query, `delta_p95_ms` −1487.062 ms (dấu âm giống official). Số query của plain phụ thuộc máy (đã nêu trong `docs/RESULT-ANALYSIS.md`), nên không so với official.
- Lượt chạy đầu dùng nhầm image cũ: máy đã có image `c5-cache-stampede-benchmark` và `-app1/-app2` dựng từ lần clone ngày 20/11, `docker compose run` không dựng lại, nên `config.json` thiếu `seed_reviews_count` (code runner cũ). Sau khi xóa ba image này và chạy lại thì đủ. Máy hoàn toàn mới không gặp lỗi này, nhưng máy đã từng chạy bản cũ cần `docker compose build` (hoặc xóa image) trước; lưu ý này đã được thêm vào README ở PR #23.
