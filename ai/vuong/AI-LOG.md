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
