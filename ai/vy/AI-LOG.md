# AI-LOG fragment — Seminar C5 (Trần Quốc Vỹ)

Log của Vỹ cho phần mình dùng AI: brainstorm, kế hoạch, review thiết kế, contract, khung repo và chia task (Task 0 trong `docs/ISSUES.md`). Đây là một fragment trong thư mục `ai/`; ở Task 10 Vỹ tổng hợp các fragment của cả nhóm thành `AI-LOG.md` ở root. Bản này tổng hợp theo bước từ các phiên Codex và Claude ngày 2026-11-17, không phải transcript. Thao tác assistant thực hiện không được ghi thành việc Vỹ làm tay; phần By hand chỉ ghi điều Vỹ tự làm hoặc tự quyết định.

## 2026-11-17 — Bàn giao kế hoạch ban đầu

- **Tool**: Codex.
- **Asked for**: Đọc đề và rubric seminar, tạo bản bàn giao để Claude review: yêu cầu chính thức, kế hoạch kỹ thuật cho C5, phân công ba người và checklist review.
- **Kept**: `docs/planning/context.md` làm context chung, gồm câu hỏi C5, thông tin nhóm, deadline, rubric, kế hoạch benchmark và mẫu bàn giao task.
- **Changed**: Không có thay đổi từ Vỹ ở bước này; kế hoạch sau đó được chỉnh qua các vòng review bên dưới.
- **Rejected**: Chưa có.
- **By hand**: Vỹ cung cấp dòng chủ đề kèm bộ MSSV `23120328-23120409-23120410`; câu hỏi tiếng Anh và mức 200 concurrent request do nhóm cung cấp, nhóm đã chọn C5. Vỹ đưa bản bàn giao cho Claude.
- **Kiểm chứng**: Codex ghi rõ repo, code và benchmark chưa được xác minh; file ghi phân biệt yêu cầu chính thức với quyết định còn mở.

## 2026-11-17 — Claude review thiết kế lần 1

- **Tool**: Claude (Claude Code).
- **Asked for**: Review kế hoạch theo checklist trong `context.md`: câu hỏi và rubric, độ tin cậy phép đo, correctness của Redis lock, khả năng chạy lại, phân công.
- **Kept**: Claude đối chiếu dòng C5 trong bản dịch đề (metric hit rate và DB load), rồi đề xuất 2 instance app, query đủ nặng, poll interval cố định, fallback khi waiter timeout, 10 cặp xen kẽ, kiểm chéo `pg_stat_statements` với header `X-DB-Queries`. Vỹ chấp nhận cả bộ đề xuất.
- **Changed**: Câu hỏi nghiên cứu giữ nguyên. Kế hoạch đổi từ một instance sang hai instance, và từ 6 cặp sang 10 cặp.
- **Rejected**: Chưa loại đề xuất nào của Claude ở bước này.
- **By hand**: Vỹ trả lời các câu hỏi mở bằng "hãy follow theo những gì bạn đề xuất, mục tiêu là hoàn thiện seminar và tài liệu tối cao là yêu cầu đề bài và câu hỏi đã chọn".
- **Kiểm chứng**: Review chỉ ở mức thiết kế, chưa có code hay log. Claude nêu rõ điều suy ra từ thiết kế và điều còn cần chạy.

## 2026-11-17 — Claude viết quyết định, contract và khung repo

- **Tool**: Claude (Claude Code).
- **Asked for**: Ghi các quyết định D1–D12, viết `CONTRACT.md` và khung repo (Compose, seed DB, stub app và runner, template nộp bài, checklist pilot).
- **Kept**: Toàn bộ khung `c5-repo/`: `CONTRACT.md`, `compose.yaml`, `db/init/`, stub `app/` và `benchmark/`, `docs/PILOT-CHECKLIST.md`, template `REPORT.md`, `TALK.md`, `SELF_ASSESSMENT_REPORT.md`.
- **Changed**: Vỹ hỏi lại vai trò của Claude ("bạn đang đóng vai trò gì? không bàn giao cho codex hã") vì Claude đã viết khung thay vì chỉ review. Sau đó Vỹ quyết định giữ khung làm điểm xuất phát và đưa Claude về vai reviewer.
- **Rejected**: Chưa loại phần nào của khung ở bước này.
- **By hand**: Vỹ yêu cầu viết khung, hỏi khung do ai viết và đã review chưa, rồi yêu cầu chạy thử.
- **Kiểm chứng**: Claude kiểm cú pháp Compose bằng `docker compose config`.

## 2026-11-17 — Chạy thử khung trên Docker

- **Tool**: Claude (Claude Code), Docker Desktop.
- **Asked for**: Chạy Postgres và Redis, kiểm seed, role `bench_ro`, `pg_stat_statements` và thời gian query.
- **Kept**: Seed đúng (product 1 có 30000 review ở mức 300000 dòng, `avg_rating` 3.0), `bench_ro` đọc được stats, `SEED_REVIEWS=800000`.
- **Changed**: Tăng `SEED_REVIEWS` từ 300000 lên 800000 sau khi query chỉ mất 11.8–13.8 ms, thấp hơn mục tiêu 20–50 ms. Đo lại 34.3–40.3 ms. Sửa ví dụ response trong contract từ `3.0` thành `3`.
- **Rejected**: Chưa có.
- **By hand**: Vỹ bật Docker Desktop khi Claude báo daemon chưa chạy, rồi bảo chạy lại.
- **Kiểm chứng**: `psql \timing` dưới role `app_user`, 5–10 lần chạy mỗi mức; `EXPLAIN` cho thấy `Seq Scan` không có parallel worker. Dọn container và volume sau khi đo.

## 2026-11-17 — Codex review khung repo, Claude sửa contract

- **Tool**: Codex (review), Claude (sửa).
- **Asked for**: Codex kiểm tra khung (cú pháp Compose và JavaScript, chạy hai stub) và nêu điểm cần sửa trước khi chia việc. Claude xử lý từng điểm.
- **Kept**: Cả ba điểm của Codex: `/config` chỉ so sánh `params`, `node_version`, `git_commit`; lượt coalesced có fallback hoặc query lặp vẫn nằm trong median chính; bỏ ngưỡng "plain gần 200 query". Contract lên v1.1.
- **Changed**: `CONTRACT.md`, `docs/PILOT-CHECKLIST.md`, stub `app/src/index.js` và ghi chú trong `decisions-and-contract.md` cho khớp v1.1.
- **Rejected**: Không loại điểm nào của Codex. Claude thừa nhận cả ba điểm là lỗi do mình viết sai.
- **By hand**: Vỹ chuyển review của Codex cho Claude.
- **Kiểm chứng**: `node --check` stub, xem `/config` trả cấu trúc mới.

## 2026-11-17 — Chia task và đưa lên GitHub issue

- **Tool**: Claude (Claude Code).
- **Asked for**: Chia việc ba người, về sau chia theo issue, cho Vỹ nhận thêm việc.
- **Kept**: Bản 12 task trong `docs/ISSUES.md`, trong đó Task 0 là phần Vỹ đã làm (brainstorm, kế hoạch, review, contract, khung repo).
- **Changed**: Vỹ yêu cầu bỏ ghi giờ, gộp từ 34 issue xuống 12 task, tăng phần việc của Vỹ cho cân với hai bạn, và thêm Task 0.
- **Rejected**: Bản 34 issue có ghi giờ công, và bản chia đầu trong đó Vỹ có ít việc hơn hai bạn; cả hai đã bị bỏ.
- **By hand**: Vỹ quyết định để Vượng và Phúc làm phần kỹ thuật và chọn Vượng review các task trước khi đăng lên GitHub.
- **Kiểm chứng**: Claude tính lại tổng giờ từ bảng issue bằng script, phát hiện bảng chat trước ghi sai (22.5 cho cả ba, thực tế 21.5 / 21.5 / 23), rồi bỏ hẳn giờ công khỏi bản cuối.

## Lỗi assistant được phát hiện trong quá trình làm

| # | Lỗi | Assistant | Cách phát hiện | Cách sửa |
| --- | --- | --- | --- | --- |
| 1 | Seed `rating` tương quan với `product_id`, khiến `avg_rating` của product 1 luôn bằng 1.0 | Claude | Claude tự tính tay khi soạn seed, rồi kiểm bằng truy vấn thật: 30000 review, `avg_rating` 3.0 | đổi công thức rating trong `db/init/02-schema-seed.sh` |
| 2 | Query mục tiêu quá nhanh (11.8–13.8 ms) so với mục tiêu 20–50 ms, nên stampede không hiện ra | Claude | chạy `psql \timing` trên Docker | `SEED_REVIEWS` lên 800000, đo lại 34.3–40.3 ms |
| 3 | Ví dụ response ghi `avg_rating` 3.0 nhưng JSON serialize ra `3`, sai kỳ vọng khi so hash body | Claude | xem output thật của query | sửa ví dụ trong `CONTRACT.md` |
| 4 | `/config` so sánh cả `port` trong khi hai instance dùng port khác nhau, runner sẽ dừng trước khi đo | Claude | review của Codex, chạy stub trên máy | v1.1: tách metadata khỏi `params` |
| 5 | Loại lượt coalesced có fallback khỏi median chính, làm kết quả đẹp hơn thực tế | Claude | review của Codex | v1.1: giữ trong median, báo cáo riêng |
| 6 | Đặt ngưỡng "plain gần 200 query" như điều kiện pilot | Claude | review của Codex | v1.1: bỏ ngưỡng |
| 7 | Bảng tổng giờ công ghi nhầm cho cả ba người | Claude | Claude tính lại từ bảng issue bằng script | sửa, sau đó bỏ giờ công |
