# Issue board C5 (v4, 17/11/2026)

12 issue (Task 0 đã xong). Mỗi mục là một GitHub issue: assignee, milestone. **Quy ước:** title của issue và PR viết bằng tiếng Anh (cột "Title" bên dưới); description và nội dung viết bằng tiếng Việt cho dễ đọc. Việc nhỏ (review, README, AI-LOG…) nằm trong checklist của task lớn, không tách issue riêng.

| Mốc | Hạn | Nội dung |
| --- | --- | --- |
| M1 | 18/11 | repo public, contract được cả ba xác nhận |
| M2 | 22/11 | service, runner, pilot đủ evidence |
| M3 | 25/11 | đóng băng cấu hình, chạy official |
| M4 | 28/11 | report, slides, video, tự chấm |
| M5 | 29/11 22:00 | nộp ZIP |
| M6 | 02/12 22:00 | issue red team |

## Bảng tổng

| Task | Title (tiếng Anh, dùng làm title issue) | Tên | Assignee | Mốc | Phụ thuộc |
| ---: | --- | --- | --- | --- | --- |
| 0 | Task 0: Brainstorm, plan, design review, contract and repo skeleton | Brainstorm, kế hoạch, review thiết kế, contract và khung repo | **Vỹ** (đã xong) | — | — |
| 1 | Task 1: Create public repo and finalize contract | Tạo repo public và chốt contract | Vỹ | M1 | 0 |
| 2 | Task 2: Service with plain and coalesced cache modes | Service: hai mode cache | Vượng | M2 | 1 |
| 3 | Task 3: Infrastructure, calibration and lock tests | Hạ tầng, calibrate và test lock | Vượng | M2 | 2 |
| 4 | Task 4: Benchmark runner | Runner đo | Phúc | M2 | 1 |
| 5 | Task 5: Pilot, freeze and official runs | Pilot, đóng băng và chạy official | Phúc | M3 | 2, 3, 4 |
| 6 | Task 6: Aggregation and result analysis | Aggregate và phân tích kết quả | Vỹ | M3 | 4, 5 |
| 7 | Task 7: Cross-review, source verification and fresh clone | Review chéo, kiểm nguồn và fresh clone | Vỹ | M2–M3 | 2, 3, 4 |
| 8 | Task 8: REPORT and README | REPORT và README | Vỹ (Vượng và Phúc viết phần của mình) | M4 | 5, 6 |
| 9 | Task 9: Slides and video | Slides và video | cả ba (Vỹ ghép) | M4 | 8 |
| 10 | Task 10: AI-LOG merge, self-assessment, ZIP and submission | AI-LOG, tự chấm, ZIP và nộp | Vỹ (Vượng và Phúc giữ log riêng trong `ai/`) | M5 | 8, 9 |
| 11 | Task 11: Red team | Red team | cả ba | M6 | 10 |

Phân bổ: **Vượng** Task 2, 3 (+ phần trong 8, 9, 10). **Phúc** Task 4, 5 (+ phần trong 8, 9, 10). **Vỹ** Task 0, 1, 6, 7 và giữ 8, 9, 10 làm đầu mối tích hợp. Vượng và Phúc mỗi người có hai task kỹ thuật nặng; Vỹ có nhiều task hơn nhưng nhẹ hơn về code, nặng về phối hợp và tài liệu. Nếu Vỹ thấy nặng hoặc nhẹ so với hai bạn, đổi chủ Task 6 hoặc Task 7.

## Task 0: Brainstorm, kế hoạch, review thiết kế, contract và khung repo — Vỹ — ĐÃ XONG

Đã có trong repo:
- `docs/planning/context.md`: bàn giao kế hoạch ban đầu (đề, rubric, thiết kế thí nghiệm).
- Review thiết kế lần 1 (Claude), review khung repo (Codex).
- `docs/planning/decisions-and-contract.md`: quyết định D1–D12 (bị `CONTRACT.md` thay thế khi mâu thuẫn).
- repo này: `CONTRACT.md` v1.1, `compose.yaml`, DB seed, stub `app/` và `benchmark/`, template `REPORT.md`, `TALK.md`, `AI-LOG.md`, `SELF_ASSESSMENT_REPORT.md`, `docs/PILOT-CHECKLIST.md`, `docs/ISSUES.md`.
- Đã kiểm: Postgres và Redis lên healthy, seed đúng, query đơn lẻ 34–40 ms với `SEED_REVIEWS=800000`.

Log AI của Task 0 nằm ở `ai/vy/AI-LOG.md` (đã viết): khung repo và contract do Claude viết, các lỗi Claude mắc và cách phát hiện. `AI-LOG.md` ở root để trống đến Task 10.

## Task 1: Tạo repo public và chốt contract — Vỹ — M1 18/11

- `git init`, tạo repo public trên GitHub, push khung `c5-repo/`, tạo milestone M1–M6 và các issue Task 2–11.
- Mời Vượng và Phúc đọc `CONTRACT.md` v1.1; mỗi người comment xác nhận hoặc đề xuất sửa trong PR.
- Mọi thay đổi contract đi qua PR và ghi vào lịch sử thay đổi.

Xong khi: cả ba clone được repo và đã xác nhận contract.

## Task 2: Service — hai mode cache — Vượng — M2 22/11

- `app/`: `GET /products/:id` cho `plain` và `coalesced` theo `CONTRACT.md` mục 2–4, đủ header, Lua release, waiter poll/timeout/fallback.
- `/healthz` kiểm Redis và Postgres thật; `/config` đúng cấu trúc v1.1.

Xong khi: payload hai mode khớp hash; cache hit cho `X-DB-Queries=0`; một request sau expiry cho 1 query; PR có Vỹ review.

## Task 3: Hạ tầng, calibrate và test lock — Vượng — M2 22/11

- Rà `compose.yaml`, seed; calibrate `SEED_REVIEWS` và `cpus` trên máy chuẩn; ghi số đo.
- Test lock chủ ý (checklist #10–14): recheck, thứ tự ghi cache trước nhả lock, lease ngắn hơn query, giết holder, waiter timeout. Mỗi case có log.
- Chạy fresh clone trên máy Vượng, làm đúng README, `PAIRS=1`.

Xong khi: checklist #9–14 có evidence; fresh clone chạy được trên máy thứ hai.

## Task 4: Runner đo — Phúc — M2 22/11

- `benchmark/` theo `CONTRACT.md` mục 6–8: kiểm `/healthz` và `/config`, warm-up, chờ expiry thật, snapshot `pg_stat_statements`, burst 200 qua hai instance (keep-alive, monotonic clock), ghi `requests.jsonl`, `summary.json`, validity, thứ tự cặp xen kẽ.
- Một command: `docker compose run --rm benchmark`.
- Phát triển song song bằng stub service, không chờ Task 2.

Xong khi: chạy được một cặp từ fresh clone, log đủ field, lượt invalid giữ log kèm `invalid_reasons`; PR có Vỹ review.

## Task 5: Pilot, đóng băng và chạy official — Phúc — M3 25/11

- Chạy pilot 5 lượt mỗi mode, điền `docs/PILOT-CHECKLIST.md` kèm evidence (mục #6, #7 chỉ cần phép đo hợp lệ, không có ngưỡng đạt/trượt).
- Cùng Vỹ đóng băng giá trị `[calibrate]` rồi ghi vào contract và README.
- Chạy official 10 cặp xen kẽ trên máy chuẩn, ghi môi trường và commit, commit `results/official/`.

Xong khi: checklist đủ evidence; `results/official/` có mọi lượt kể cả lượt invalid kèm lý do.

## Task 6: Aggregate và phân tích kết quả — Vỹ — M3 25/11

- Viết bộ tổng hợp: `summary.csv`, `report_table.md`, p95 nearest-rank, `delta_p95_ms` theo cặp, median và min–max.
- Phân tích nguyên nhân từ log: pool wait, lock wait, số `miss-fallback`; báo cáo đúng dấu của delta.
- Mọi số trong report truy được về dòng trong log.

Xong khi: tính lại độc lập được các con số chính từ `requests.jsonl`.

## Task 7: Review chéo, kiểm nguồn và fresh clone — Vỹ — M2–M3

- Review PR của Task 2, 3, 4 theo mẫu bàn giao trong `context.md`; gửi Claude review khi cần.
- Kiểm official docs và release notes (Redis, Postgres, Docker, Node): version, ngày đọc cho mục "Nguồn".
- Fresh clone lần cuối trên máy Vỹ sau khi đóng băng.

Xong khi: không còn finding mở; mỗi claim về version có link kèm ngày đọc.

## Task 8: REPORT và README — Vỹ giữ, cả ba viết phần mình — M4 28/11

- Vượng: Setup, baseline và thay đổi, thiết kế lock, giới hạn của lock.
- Phúc: Kết quả, spread, README (điền môi trường đo).
- Vỹ: Câu hỏi, Khuyến nghị và khi nên tránh, Nguồn; ghép và cắt còn ≤ 3 trang, link repo ở dòng đầu.

Xong khi: đủ mục theo đề, số trùng log, một người ngoài làm theo README chạy được `PAIRS=1`.

## Task 9: Slides và video — cả ba, Vỹ ghép — M4 28/11

- Mỗi người làm slides và quay phần của mình; Vỹ dựng bộ khung chung, ghép, đối chiếu headline với report.
- Video ≤ 8 phút, mở đầu bằng câu hỏi, cho thấy phép đo hoặc log, nêu số liệu chính kèm đơn vị và spread, kết thúc bằng khuyến nghị; link vào `TALK.md`.

Xong khi: `slides.pdf` và video xong, ai cũng có phần trình bày.

## Task 10: AI-LOG, tự chấm, ZIP và nộp — Vỹ — M5 29/11 22:00

- Mỗi người giữ fragment trong `ai/<tên>/AI-LOG.md` (xem `ai/README.md`), ghi Changed, Rejected, lỗi assistant phát hiện. Vỹ tổng hợp ba fragment thành `AI-LOG.md` ở root, giữ trung thực phần By hand của từng người.
- `SELF_ASSESSMENT_REPORT.md`: mỗi tiêu chí kèm evidence; tổng khớp `<total>` trong tên ZIP.
- Đóng gói ZIP có `.git` tên `23120328-23120409-23120410_<total>.zip`; kiểm repo public, link video, fresh clone cuối; nộp bằng tài khoản `<StudentID>@student.hcmus.edu.vn`; đăng Facebook nếu tham gia bình chọn.

Xong khi: nộp trước 22:00 29/11.

## Task 11: Red team — cả ba — M6 02/12 22:00

- Vượng: kiểm baseline hoặc code của nhóm được phân.
- Phúc: chạy lại study được phân, ghi command và số liệu.
- Vỹ: viết issue `[red-team] <student IDs>` từ evidence của hai bạn, có command, kết quả cạnh số liệu của nhóm kia và ít nhất một phát hiện có evidence.

Xong khi: issue mở trước 22:00 02/12 (thiếu bị trừ 10 điểm).
