# AI-LOG fragment — Seminar C5 (Nguyễn Khắc Vượng)

## 2026-11-18 — Review PR #14 (lịch v1.3, final 25/11)

- **Tool**: Claude (Claude Code), GitHub CLI.
- **Asked for**: Kiểm PR đang chờ Vượng review và trong đó có gì cần Vượng làm; review thử, báo các điểm cần chú ý; soạn review có tag rồi đăng.
- **Kept**: Năm điểm review: (1) phương án cắt 10 → 6 cặp chưa có trong `CONTRACT.md` mục 6; (2) Task 7 review chéo hạn 22/11 trùng ngày official, quá muộn; (3) pilot 19–21/11 không khớp với hạn code 20/11 và chỗ calibrate; (4) "máy thứ hai" vừa bị cắt được vừa là điều kiện xong của Task 3; (5) `docs/planning/*` còn lịch cũ. Đăng dạng *Comment*, tag Vỹ và Phúc.
- **Changed**: Không sửa nội dung bản nháp trước khi đăng.
- **Rejected**: Không có.
- **By hand**: Vượng yêu cầu review, xem bản nháp và quyết định đăng. Sau khi Vỹ sửa, Vượng yêu cầu kiểm lại.
- **Kiểm chứng**: Claude đối chiếu diff với `CONTRACT.md`, các issue #4–#13 và milestone trên GitHub. Lần kiểm lại: commit `2622f13` sửa đủ 5 điểm; PR đã merge chỉ với approve của Phúc; `CONTRACT.md` còn ghi pilot "19–21/11" ở dòng 9 và 242.

## 2026-11-18 — Xác nhận Task 1 (issue #1)

- **Tool**: Claude (Claude Code), GitHub CLI.
- **Asked for**: Kiểm issue Task 1 xem có cần comment gì không.
- **Kept**: Comment "pass" cho `CONTRACT.md` v1.2 và `docs/ISSUES.md`, nhận Task 2 (#4) và Task 3 (#5), nhờ Vỹ tick checklist và đóng issue.
- **Changed**: Không.
- **Rejected**: Chưa có.
- **By hand**: Vượng đồng ý đăng và dặn không được đóng issue; Claude không đóng, Vỹ tự đóng sau đó.
- **Kiểm chứng**: Claude kiểm Vượng đã approve PR #2 và #3, và issue vẫn `OPEN` sau khi đăng.

## 2026-11-18 — Task 2: service hai mode cache

- **Tool**: Claude (Claude Code), Docker Desktop.
- **Asked for**: Làm Task 2 theo `CONTRACT.md` mục 2–4, chạy kiểm thử, **không commit** để Vượng review trước.
- **Kept**: Bản Claude viết trên nhánh `feat/task2-service`, giữ sau khi Vượng review:
  - `app/src/products.js`: `plain` (cache-aside) và `coalesced` (`SET NX PX` lock, recheck, query, ghi cache rồi mới nhả lock bằng Lua compare-and-delete; waiter poll `WAIT_POLL_MS`, quá `WAIT_TIMEOUT_MS` hoặc lỗi Redis thì `miss-fallback`); body JSON thứ tự key cố định.
  - `app/src/index.js`: `/healthz` kiểm Redis `PING` và Postgres `SELECT 1`; `/products/:id` trả đủ 7 header, `400`/`404`/`500`; log JSON sự kiện lock (`lock_acquired`, `cache_set`, `lock_released`, `lock_not_owned`, `fallback`); `keepAliveTimeout` 120 s; tắt gọn khi `SIGTERM`.
  - `app/package-lock.json` để Dockerfile dùng `npm ci`.
- **Changed**: Sau review của Vượng:
  - Lỗi Redis trong `products.js`: request đã chạy query không còn trả `500` mà luôn trả `200` kèm `X-DB-Queries`, để tổng header khớp `pg_stat_statements`. Coalesced: lỗi `GET` cache đầu tiên và lỗi recheck của holder chuyển sang fallback (ghi cache xong mới nhả lock); holder `SET` cache lỗi sau khi query thì trả body với `miss-fallback`. Plain: `SET` cache lỗi vẫn trả body với `miss-query`. Plain `GET` lỗi vẫn `500` vì chưa query. Mọi lỗi đều log kèm `request_id`, `mode`, tên bước. Claude viết phần sửa.
  - Lệch chữ với contract (`pool.query` so với `pool.connect()` + `client.query()`; `X-Request-Id` không log từng request): giữ code, soạn bản nháp contract v1.4 chỉ đổi câu chữ (mục 2, mục 3, mục 4.5, pilot 20–21/11) và ghi chú giải thích cho PR Task 2. PR contract chưa mở.
- **Rejected**: Đổi code về `pool.query` (mất số đo `X-Pool-Wait-Ms`, cần để giải thích p95); log mọi request (làm thay đổi chính p95 đang đo); thêm công tắc `LOG_REQUESTS` (luôn phải tắt khi đo nên không cần).
- **By hand**: Vượng chọn làm Task 2 ngay và yêu cầu không commit để tự review. Vượng tự review code và nêu 3 điểm: (1) `products.js` dùng `pool.connect()` + `client.query()` lệch chữ với `CONTRACT.md` mục 3; (2) lỗi Redis ở recheck hoặc `SET` cache của holder trả `500` thay vì fallback theo mục 4.5; (3) `X-Request-Id` chỉ có trong log của `coalesced`. Vượng hỏi vì sao không sửa điểm 1 và 3, hỏi nên sửa thế nào cho đúng chủ đề seminar, rồi chọn hướng Claude đề xuất: sửa code điểm 2, sửa câu chữ contract cho điểm 1 và 3. Vượng không tự sửa dòng code nào.
- **Kiểm chứng**:
  - Smoke test (script tạm, không nằm trong repo) trên Docker Compose thật, `SEED_REVIEWS=800000`: 12/12 pass — body đúng chuỗi chuẩn của contract ở cả hai mode; hit cho `X-DB-Queries=0` và delta `calls` = 0; một request sau khi TTL tự hết cho 1 query; `400` khi mode sai, `404` khi không có product.
  - Runner của Phúc (PR #15, `PAIRS=1`): coalesced **hợp lệ** — 1 query, 199 `miss-wait`, 0 fallback, p95 186.7 ms, `burst_span` 18.2 ms. Plain **không hợp lệ** — 11–35/200 request timeout sau khoảng 10 s, nên tổng header lệch với `pg_stat_statements`.
  - `EXPLAIN ANALYZE` trên DB rảnh: 65–80 ms mỗi query, cao hơn mục tiêu 20–50 ms (Vỹ đo 34–40 ms trên máy khác ngày 17/11). Đây là việc calibrate `SEED_REVIEWS` của Task 3, chưa chỉnh.
  - Sau khi sửa lỗi Redis: test giả lập lỗi bằng Redis và pool giả (script tạm, không nằm trong repo) 10/10 pass, gồm thứ tự "ghi cache trước, nhả lock sau" ở nhánh recheck lỗi và lock được nhả khi `SET` lỗi. Smoke test trên Docker chạy lại 12/12 pass; coalesced burst 200 vẫn 1 query, 199 `miss-wait`; log không có `redis_error`.
  - Claude tự nhận ra burst trong smoke test bắn bằng `fetch` từ máy Windows không đồng thời thật (plain chỉ ra 2 `miss-query`), nên kết quả burst plain của smoke test không dùng làm bằng chứng; burst thật lấy từ runner của Phúc.

## 2026-11-19 — Merge PR #16 và mở PR contract v1.4 (#17)

- **Tool**: Claude (Claude Code), GitHub CLI.
- **Asked for**: Kiểm comment trong PR #16; merge PR #16; mở PR contract v1.4 theo bản nháp đã thống nhất.
- **Kept**: PR #16 có approve của Vỹ và Phúc, không có comment inline; squash merge. PR #17 chỉ sửa câu chữ `CONTRACT.md` (mục 2, 3, 4.5, pilot 20–21/11 ở đầu file và dòng 1.3, thêm dòng 1.4), reviewer Phúc và Vỹ.
- **Changed**: Thêm vào v1.4 việc sửa dòng lịch sử 1.3 theo nhắc nhở của Vỹ trong review #16.
- **Rejected**: Gợi ý của Vỹ commit script test vào `app/test/` không làm trong PR #16 mà dời sang Task 3.
- **By hand**: Vượng quyết định merge và mở PR v1.4.
- **Kiểm chứng**: `gh pr view` xác nhận trạng thái `MERGED`; `CONTRACT.md` không còn chuỗi "19–21/11".

## 2026-11-19 — Task 3: hạ tầng, calibrate và test lock

- **Tool**: Claude (Claude Code), Docker Desktop.
- **Asked for**: Làm Task 3 trên máy chuẩn (máy Vượng; máy Vỹ là máy thứ hai). Không commit trước khi Vượng review.
- **Kept**: Bản Claude làm trên nhánh `feat/task3-infra`, giữ sau khi Vượng review (có sửa, xem Changed):
  - Pin image theo tag cụ thể + digest: `postgres:16.16`, `redis:7.4.12` (`compose.yaml`), `node:22.23.5-alpine` (`app/Dockerfile`). Kiểm tag cụ thể trùng image với tag trôi đang dùng.
  - `SEED_REVIEWS` 800000 → 300000 trong `.env.example`, `compose.yaml`, `db/init/02-schema-seed.sh`. Giữ `cpus` mặc định.
  - `app/test/`: `lib.mjs` (helper), `calibrate-query.mjs` (#9), `lock-tests.mjs` (#10–14), `smoke.mjs`, `fault.test.mjs` (Redis/pool giả, thêm case recheck hit); script `npm` trong `app/package.json`.
  - Điền checklist #9–14 và mục "Calibrate hạ tầng" trong `docs/PILOT-CHECKLIST.md`; evidence trong `results/calibration/`, `results/calibration-cpus/`, `results/lock-tests/20261119T054509Z/`.
- **Changed**: Sau review của Vượng, Claude sửa:
  - Contract: thêm commit `cfdd84e` vào PR #17 (v1.4): `SEED_REVIEWS` 300000 ở mục 5, ví dụ body `review_count` 30000 ở mục 2, ghi chú dòng 1.1 đo trên máy Vỹ; cập nhật title và mô tả PR #17.
  - `lock-tests.mjs`: mỗi case chạy trong `try/finally`; `restore()` luôn unpause Postgres, xóa key test, tạo lại app1/app2 với env mặc định (kể cả khi app1 bị kill); xử lý Ctrl+C; chạy `restore()` cả trước case đầu; vòng chờ lock hết hạn ở #13 có giới hạn 10 s.
  - `compose.yaml`: healthcheck Postgres đổi sang TCP (`pg_isready -h 127.0.0.1`).
  - Chạy lại lock test và runner `PAIRS=2` vào thư mục sạch, xóa evidence cũ bị trùng; cập nhật số trong checklist; ghi chú "đổi seed phải `docker compose down -v`" vào checklist.
- **Rejected**: Thêm số dòng seed vào `/config` của app (đổi cấu trúc `/config`, phải qua contract); thay vào đó đề nghị Phúc ghi `count(*)` vào `config.json` của runner và ghi chú `down -v` trong README (file của Phúc).
- **By hand**: Vượng chốt máy chuẩn là máy mình, máy Vỹ là máy dự phòng. Vượng tự review bản Task 3 và nêu 4 điểm: (1) contract (cả PR #17) vẫn ghi `SEED_REVIEWS=800000`, dòng 1.1 cần ghi đo trên máy Vỹ; (2) `lock-tests.mjs` không dọn dẹp khi lỗi giữa chừng (app kẹt `LOCK_LEASE_MS=10` hoặc Postgres còn `pause`, mà `/config` hai instance vẫn khớp nên runner không phát hiện); (3) đổi seed không áp dụng lên DB đã có vì anonymous volume được giữ khi tạo lại container, `/config` không báo số dòng seed; (4) evidence `results/calibration-cpus/` bị trùng pair 1. Vượng đồng ý hướng sửa Claude đề xuất.
- **Kiểm chứng**:
  - Query đơn lẻ qua app (n=30, plain): seed 800000 p50 84.9 / p90 119.2 ms (không đạt); 400000 p50 38.8 / p90 48.1; 350000 p50 33.1 / p90 41.8; 300000 p50 32.9 / p90 39.2 / max 49.2 ms. Chọn 300000.
  - Runner `PAIRS=2` (thư mục sạch), seed 300000, `cpus` mặc định: 4/4 lượt hợp lệ, không còn cảnh báo trùng; plain 200 query, p95 4066–4191 ms; coalesced 1 query, p95 135–177 ms; `burst_span_ms` 27–66. (Lần đầu chạy `PAIRS=1` rồi `PAIRS=2` chung thư mục, 6/6 hợp lệ nhưng pair 1 bị trùng; đã xóa.)
  - `npm run test:lock` (bản có `try/finally`): #10–14 pass. #10: 1 query, có 1 `recheck_hit` thật. #12 (`LOCK_LEASE_MS=10`): 3 query, 3 `lock_not_owned`. #13 (SIGKILL holder): 10 waiter `miss-fallback` sau 2000.5–2008.3 ms, request sau lease `miss-query`. #14 (lock giả): 50/50 `miss-fallback`, log và header khớp delta `calls`. Sau khi chạy xong, `/config` của app1 trả `lock_lease_ms` 5000 (đã về mặc định). Chưa thử trường hợp case ném lỗi giữa chừng hoặc Ctrl+C.
  - Kiểm điểm 3 của Vượng bằng thực nghiệm: đổi `SEED_REVIEWS=50000` rồi `up` thì bảng vẫn 300000 dòng (cùng volume); `down` rồi `up` thì 50000 dòng (volume mới). Lúc kiểm, phát hiện thêm Postgres báo healthy khi seed chưa xong (`count(*) = 0`); sau khi đổi healthcheck sang TCP, ngay khi healthy đã đủ 300000 dòng.
  - `npm test` 11/11, `npm run test:smoke` 13/13.
  - Lần chạy lock test đầu: script tái dùng socket keep-alive tới container đã bị tạo lại (`ECONNRESET`), sửa bằng `resetAgent()`. Lần hai: #11 báo FAIL sai vì một holder gặp `recheck_hit` hợp lệ không có `cache_set`; sửa điều kiện kiểm trong script, không sửa service.
