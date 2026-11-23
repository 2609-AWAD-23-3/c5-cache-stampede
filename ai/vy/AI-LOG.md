# AI-LOG fragment — Seminar C5 (Trần Quốc Vỹ)

Log của Vỹ cho phần mình dùng AI: brainstorm, kế hoạch, review thiết kế, contract, khung repo và chia task (Task 0 trong `docs/ISSUES.md`). Đây là một fragment trong thư mục `ai/`; ở Task 10 Vỹ tổng hợp các fragment của cả nhóm thành `AI-LOG.md` ở root. Bản này tổng hợp theo bước từ các phiên Codex và Claude ngày 2026-11-17 và các phiên Claude ngày 2026-11-19, 20, 22 (review PR, fresh clone, Task 6), không phải transcript. Thao tác assistant thực hiện không được ghi thành việc Vỹ làm tay; phần By hand chỉ ghi điều Vỹ tự làm hoặc tự quyết định.

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

## 2026-11-19 — Task 7: Claude review PR #17 và PR #18

- **Tool**: Claude (Claude Code), `gh`.
- **Asked for**: Kiểm hai PR của Vượng đang chờ review: contract v1.4 (PR #17) và Task 3 hạ tầng, calibrate, lock tests (PR #18), soạn comment để Vỹ chốt trước khi đăng.
- **Kept**: Claude đối chiếu nội dung PR với code và contract (câu chữ mục 2/3/4.5, `SEED_REVIEWS` 300000, `review_count` 30000, pin image theo digest, healthcheck, `lock-tests.mjs`, `fault.test.mjs`). Cả hai PR được Vỹ approve và đã merge. Lưu ý số 1 trong review PR #18 là cấp `SELECT` trên `reviews` cho `bench_ro`; Vượng làm ở PR #21.
- **Changed**: Không có thay đổi code từ Vỹ; thay đổi nằm ở PR của Vượng.
- **Rejected**: Chưa có.
- **By hand**: Vỹ yêu cầu "comment vào đây để chốt trước", rồi "Đăng cả hai và approve".
- **Kiểm chứng**: Review đọc code và diff; kết quả chạy thật của Task 3 do Vượng ghi trong PR, chưa chạy lại trong bước này (fresh clone ở bước sau).

## 2026-11-20 — Task 7: Fresh clone và sửa `checklist #N` bị GitHub autolink

- **Tool**: Claude (Claude Code), Docker Desktop, `gh`.
- **Asked for**: Chạy fresh clone sau khi PR #18 merge, trả lời comment của Vượng ở issue #5, rồi sửa các chỗ `checklist #N` bị GitHub tự gắn link sang issue hoặc PR.
- **Kept**: Fresh clone chạy được trên máy Vỹ. Plain ra 186 query thay vì 200 (14 request gặp cache vì máy nhanh hơn); Claude ghi nhận là phụ thuộc máy, không phải lỗi. Cách sửa autolink: viết "checklist mục N". Đã sửa ở issue #5, issue #7, mô tả PR #18, các review của Claude trên PR #16 và #18, và comment của Vượng ở issue #5.
- **Changed**: Vỹ chốt để Vượng tự điền mục 15 của checklist ("checklist 15 này chắc để vượng sửa luôn vì sửa trùng file có nguy cơ conflict") và chốt phạm vi sửa autolink: "tạm không cần sửa trong source", rồi "sửa hết luôn đi, vì vấn đề này cần sửa mặc dù đã được close".
- **Rejected**: Chưa sửa các chỗ `#N` trong file nguồn ở bước này (hoãn đến lúc có PR docs).
- **By hand**: Vỹ phát hiện link sai ("mấy cái #checklist đều đang bị lỗi dẫn đến là nó toàn link tới issue hay pr") và quyết định phạm vi sửa. Docker Desktop chưa chạy; Claude khởi động bằng PowerShell.
- **Kiểm chứng**: Chạy `docker compose` từ bản clone mới tại `D:\Workspace\Web\seminar\fresh`, ghi log; số query đọc từ kết quả chạy.

## 2026-11-22 — Task 7 và 5: Review PR #19, chốt `CACHE_TTL_MS`, contract v1.5 (PR #20)

- **Tool**: Claude (Claude Code), `gh`.
- **Asked for**: Review PR #19 của Phúc (pilot vòng 1), giải thích các điểm Phúc cần Vỹ quyết định (burst, calibrate, `CACHE_TTL_MS`), đăng comment, và sửa câu chữ `CACHE_TTL_MS` trong contract.
- **Kept**: `CACHE_TTL_MS` giữ 3000. Claude giải thích TTL chỉ dùng để chờ key hết hạn trước mỗi burst, và "thời gian burst" nghĩa là thời gian gửi hết 200 request (`burst_span_ms`, ≤ 100 ms), không phải thời gian chờ xong của plain. Contract lên v1.5 (PR #20, Vỹ mở). Thư mục pilot đổi thành `results/pilot-r1/` (theo vòng, không theo ngày).
- **Changed**: Claude đề xuất `results/pilot-<ngày>/`; Vỹ hỏi "nếu đổi thành results/pilot-20261122/, thì chạy pilot khác chung ngày cũng dính trùng tên folder mà bạn?" nên đổi sang đặt theo vòng. Review PR #19 đổi từ Approve sang Request changes (xem bảng lỗi), rồi Approve lại sau commit của Phúc và Approve lần nữa sau commit sửa dòng 5 của `docs/PILOT-CHECKLIST.md`.
- **Rejected**: Claude dự định để câu "Vỹ sẽ chốt" trong comment đăng dưới tài khoản Vỹ; Vỹ sửa thành "mình chốt".
- **By hand**: Vỹ hỏi lại các khái niệm chưa rõ ("brust là gì nhỉ?", "calibrate là gì, brust plain là thời gian bắn brust hay sao?"), quyết định giữ 3000, yêu cầu "thay đổi luôn đi" cho contract và yêu cầu đổi review sang Request changes.
- **Kiểm chứng**: Claude đọc diff PR #19 và `results/pilot-r1/` (10/10 lượt `VALID`); chưa tính lại số pilot độc lập ở bước này.

## 2026-11-22 — Task 5 và 6: Chốt đóng băng, review PR #21, kiểm độc lập và phân tích official

- **Tool**: Claude (Claude Code), `gh`, Node.js.
- **Asked for**: Soạn comment ở issue #7 để chốt đóng băng `[calibrate]`, số cặp và người chạy official; review PR #21 của Vượng (official 10 cặp); viết script kiểm độc lập và phân tích cho Task 6.
- **Kept**: Comment ở issue #7 đề xuất giữ giá trị pilot, chạy 10 cặp, Vượng chạy official trên máy chuẩn; Phúc xác nhận. Review PR #21: Claude tính lại từ `requests.jsonl`, `snapshots` và `config.json` của 20 lượt (cùng commit `3682b13`, 20/20 hợp lệ, khớp `summary.json` và `report_table.md`), Vỹ approve, Vượng merge. Task 6: `benchmark/crosscheck/crosscheck.mjs` (không import `aggregate.js`), `results/official/crosscheck_report.md`, `docs/RESULT-ANALYSIS.md`; sửa phạm vi Task 6 và các `#N` trong `docs/ISSUES.md`. Kết quả đối chiếu PASS: median `delta_p95_ms` −3696.122 ms (p95 giảm), queries plain 200 (115–200) và coalesced 1.
- **Changed**: Vỹ hỏi "đã có các lần chạy trước, nhưng cần lần chạy sau khi đóng băng hã?"; Claude giải thích contract coi pilot dùng để chốt cấu hình, official chạy sau đóng băng, nên không lấy số pilot làm kết quả. Claude đã viết bản đầu của script chạy trên pilot; Vỹ quyết định bỏ ("bỏ luôn cũng được, đợi máy chuẩn chạy rồi viết script sau"), bản đó bị xóa, và script được viết lại sau khi PR #21 merge. Câu về việc Vỹ bắt đầu Task 6 trong comment ở issue #7 được sửa lại cho rõ người mở PR gắn `Closes #7`.
- **Rejected**: Dùng số pilot-r1 làm kết quả chính, và đăng bản nháp comment có lời chào ("không cần chào").
- **By hand**: Vỹ quyết định phân công Task 5 và yêu cầu "hoàn thiện task6 đi, đừng commit vội để tôi check". Các câu hỏi về PR ("ủa nếu đợi máy chuẩn chạy thì commit ở issue nào?") do Vỹ đặt ra.
- **Kiểm chứng**: Script chạy PASS trên `results/official` (20 lượt). Thử âm tính trên bản sao `results/official` bị sửa tay (một request đổi status 200 thành 500 và một giá trị p95 trong `summary.csv`): script báo lệch và thoát mã 1, bản sao đã xóa. Hai điểm là suy luận từ số liệu, không đo trực tiếp: query plain chậm do tranh CPU, và các lượt plain có hit đều có `burst_span_ms` lớn; `docs/RESULT-ANALYSIS.md` nêu rõ chưa kết luận nhân quả. Phần thời gian của coalesced không được log (khoảng 65 ms ở request p95) cũng ghi rõ là chưa giải thích được.
- **Sau review của Phúc (PR #22)**: Phúc chỉ ra hai chỗ trong `docs/RESULT-ANALYSIS.md`: "khoảng 35 ms" nên là p50 32.9 ms từ file calibrate, và "request đến muộn" chưa chính xác vì `server_recv_ts` của request hit đầu tiên sớm hơn lúc cache được ghi. Đã sửa cả hai, đồng thời bỏ câu gán 65 ms không log cho "client hoặc event loop" vì nguồn chưa xác định. Ba góp ý nhỏ về `crosscheck.mjs` cũng đã làm: kiểm số request bằng `burst_size`, kiểm request status 200 thiếu `X-DB-Queries`, và kiểm payload chỉ trên request status 200. Thử âm tính: xóa một dòng request và xóa `db_queries` ở một request đều cho FAIL đúng lý do; official vẫn PASS.

## 2026-11-23 — Task 7: Kiểm nguồn, version và fresh clone lần cuối

- **Tool**: Claude (Claude Code), subagent đọc trang web, trình duyệt tích hợp, Docker Hub và npm registry, Docker Desktop.
- **Asked for**: Kiểm version và các khẳng định kỹ thuật trong repo với tài liệu chính thức (Task 7), rồi "vậy hoàn thiện toàn bộ task 7 ở local trước đi": bảng nguồn, fresh clone, sửa các điểm còn mở.
- **Kept**: `docs/SOURCES.md` (version, link, ngày đọc 23/11/2026, kết quả kiểm). Digest ba image khớp Docker Hub; PostgreSQL 16.16, Redis 7.4.12, Node 22.23.5, Alpine 3.24.4 xác nhận có thật. Sửa nhãn "Docker Desktop 29.9.3" thành "Docker Engine 29.9.3" (Vỹ chọn giữ Engine), sửa các `#N` chỉ checklist trong `docs/PILOT-CHECKLIST.md`, `app/test/calibrate-query.mjs`, `app/test/lock-tests.mjs`.
- **Changed**: Claude đưa ra ba việc trước, Vỹ chốt: giữ Docker Engine ("không cần thay đổi mà giữ docker engine được không") và làm trước ở local.
- **Rejected**: Không hỏi Vượng số Docker Desktop thật; ghi theo Engine.
- **By hand**: Vỹ nghi ngờ kết quả của subagent ("tìm lại bằng browser, có thể agent nó tìm chưa kỹ đấy"), nên Claude đọc lại bằng trình duyệt các điểm agent bỏ sót hoặc báo sai.
- **Kiểm chứng**: Digest kiểm bằng API Docker Hub; `cat /etc/alpine-release` trong image đã pin trả 3.24.4; Redis 7.4 hỗ trợ theo SECURITY.md của redis/redis; Node 22 Maintenance LTS, hết hỗ trợ 2027-04-30 theo nodejs/release; `pg`, `redis`, `undici` đối chiếu dist-tags trên npm. Fresh clone `main` tại `8e97ebd` chạy `PAIRS=1` hợp lệ 2/2; lượt đầu dùng nhầm image cũ từ 20/11 nên thiếu `seed_reviews_count`, sau khi xóa image và chạy lại thì có (300000). Một số trang docs (Postgres, Redis, Docker, node-postgres) chỉ được đọc qua công cụ tải trang; các trang bị cắt dài chỉ dựa vào phần đọc nguyên văn.

## 2026-11-23 — Task 8: Skeleton REPORT/README, viết mục 1, 5, 6.1, 7 của REPORT

- **Tool**: Claude (Claude Code), GitHub CLI (`gh`), Node.js.
- **Asked for**: "brainstorm thật kỹ để làm skeleton report và readme ở task 8 ... phần nào của ai thì ghi rõ vào, sau đó bàn giao qua comment của task 8"; sau đó "viết phần của mình trong report đi, viết phải đầy đủ và dễ hiểu".
- **Kept**: Comment bàn giao trên issue #10 (skeleton từng mục, người viết, nguồn số liệu, bảng đối chiếu với đề, mốc). Trong `REPORT.md`: mục 1 (trả lời ngắn và bảng cách đọc số), mục 5 (khuyến nghị và khi nên tránh, mỗi ý ghi đo được / suy luận / chưa đo), mục 6.1 (giới hạn của phép đo), mục 7 (nguồn kèm ngày đọc, lấy từ `docs/SOURCES.md`).
- **Changed**: Chia lại việc so với issue: mục 2.3 sang Phúc vì runner là Task 4 của Phúc; mục 6.1 (issue chưa giao) cho Vỹ. Sau khi ghép với PR #23, bỏ hai chỗ lặp số của mục 4 trong mục 5 và 6.1, thay bằng trỏ về mục 4.
- **Rejected**: Giới hạn số từ cho từng mục mà Claude tự đặt trong bản đầu của skeleton (xem lỗi 13).
- **By hand**: Vỹ yêu cầu ưu tiên đủ và dễ hiểu thay vì ngắn, và hỏi lại giới hạn 3 trang có trong đề không.
- **Kiểm chứng**: Giới hạn "tối đa 3 trang" kiểm lại trong PDF đề ("At most three pages") và bản dịch, chỉ áp cho `REPORT.md`. Mọi số trong mục 1, 5, 6.1 đối chiếu với `results/official/report_table.md`, `results/official/crosscheck_report.md`, `results/pilot-r1/report_table.md`, `results/lock-tests/20261119T054509Z/` và `docs/PILOT-CHECKLIST.md`; hai số tối đa (query của holder 79.237 ms, thời gian chờ lock 198.302 ms) tính trực tiếp từ `results/official/*/requests.jsonl`. Lệnh build trong README kiểm bằng `docker compose config --services` (không có `benchmark` khi không bật profile `bench`).

## 2026-11-23 — Task 8: Review PR #26, #27, mục "Kiểm lại số official" và ghép

- **Tool**: Claude (Claude Code), GitHub CLI (`gh`), Node.js, Docker, Chrome headless (in PDF).
- **Asked for**: Review PR #26 (Vượng) và PR #27 (Phúc); "viết phần Kiểm lại số official trong README"; sau khi hai PR merge: "kiểm tra và hoàn thiện task 8 ... các mục chưa tick thì check src rồi tick hộ các thành viên".
- **Kept**: Review PR #26 (Approve, rồi Approve lại sau khi Vượng sửa) và PR #27 (Request changes vì 2 chỗ README sai với file, rồi Approve sau khi Phúc sửa). Tick trên comment bàn giao issue #10 các mục README của Phúc (PR #27), mục 2.1, 2.2, 3, 6.2 và "Test phụ" của Vượng (PR #26). Mục "Kiểm lại số official" trong `README.md` (hai cách chạy: Node 22, hoặc image Node đã pin qua Docker; kết quả đúng trông thế nào). Thêm Compose `v2.40.3-desktop.1` của máy pilot vào `docs/SOURCES.md` mục 2.
- **Changed**: Bản đầu review PR #26 là Request changes vì câu cuối mục 3.4; Vỹ thấy quá chặt nên đổi sang Approve kèm góp ý, Vượng tự sửa sau đó. Mục "Kiểm lại số official" viết trước trên nhánh riêng, sau khi PR #27 merge thì chuyển vào chỗ placeholder Phúc đặt sẵn.
- **Rejected**: Cắt `REPORT.md` xuống 3 trang. Bản ghép dài 3511 từ, in PDF A4 từ bản render gần giống GitHub ra 10 trang; cắt còn 3 trang phải bỏ hơn một nửa phần giải thích. Vỹ quyết định giữ nguyên và chấp nhận rủi ro.
- **By hand**: Vỹ quyết định mức review cho PR #26, quyết định không cắt REPORT, và nhắc rằng merge PR là việc của người mở PR.
- **Kiểm chứng**: Review PR #27 đối chiếu `compose.yaml` (`profiles: ["bench"]`), `.env.example`, `benchmark/src/run.js` (dòng 201, 440, 538), `aggregate.js` (dòng 333), key thật của `snapshots/*.json` và `config.json`, tên thư mục `results/official/` (lượt đầu `152108Z`, lượt cuối `152335Z`). Review PR #26 đối chiếu `results/lock-tests/20261119T054509Z/case-10..14.json` (tổng kết quả 200, 200, 50; `holder_response: "Error: socket hang up"`). Trên `main` sau khi merge #27: `crosscheck.mjs` in `**PASS**` (exit 0), `aggregate.js` in `Valid runs: **20** / 20`, `git diff results/official` rỗng; lệnh Docker trong README chạy thử trong PowerShell. `REPORT.md` không còn comment chia việc; bảng mục 4 khớp `results/official/report_table.md`.
- **Soát lần cuối** (Vỹ hỏi "readme và report đã sẵn sàng để là bản final?"): đối chiếu lại với yêu cầu của đề (`docs/planning/context.md` mục 2), kiểm mọi đường dẫn được nhắc trong hai file đều tồn tại, và tính lại từ `requests.jsonl` các số nguyên nhân ở REPORT mục 4. Bốn lượt `plain` dưới 200 query là cặp 1, 3, 7, 10 (138, 115, 116, 165 query; 62, 85, 84, 35 hit). Ở request vị trí p95, pool + query có median 3887.968 ms; phần đã log của `coalesced` là 54.1 ms, phần còn lại có median 64.9 ms, max 148.7 ms. `pool_wait_ms` 1609.19 và `query_ms` 383.232 là median của median từng lượt (`summary.json`), khớp `crosscheck_report.md`. Sửa thêm ba chỗ:
  - Số ở mục 5 và 6.1 của REPORT viết lẫn dấu phẩy thập phân ("3,7 s", "2,5 phút") và dấu chấm hàng nghìn ("1.700"), trong khi phần còn lại dùng dấu chấm thập phân. Đổi thành 3.7 s, 2.5 phút, 1700.
  - Bảng "Cấu trúc" trong README cập nhật theo repo hiện tại: thêm `benchmark/crosscheck/` và các thư mục con của `results/`; ghi `TALK.md`, `slides.pdf`, `SELF_ASSESSMENT_REPORT.md` là việc của Task 9–10; bỏ cụm "bộ aggregate" vì không rõ chỉ file nào.
  - `docs/SOURCES.md` ghi rằng mọi `#N` trong hai file `.mjs` đã đổi thành "mục N", nhưng PR #24 chỉ sửa một chuỗi và một comment (xem lỗi 14).
- **Cập nhật trạng thái bị sót** (Vỹ: "đảm bảo report không có phần nào trong trạng thái chờ sửa hay chờ quyết định ... nhờ bạn làm hộ luôn"):
  - Quét `REPORT.md` và `README.md`: không còn chỗ chờ sửa hay chờ quyết định. Các cụm "chưa đo" và "chưa xác định" còn lại là giới hạn có chủ đích.
  - Quét checkbox chưa tick ở mọi issue. Tick hộ Phúc 2 mục tự nhắc trên issue #7 (Task 5): `results/official/` có đúng 20 thư mục lượt, không gộp trùng; README có lưu ý chạy vào thư mục sạch.
  - `docs/ISSUES.md`: đánh dấu Task 1–7 đã xong (issue #1, #4–#9 đã đóng). Thêm quyết định không cắt REPORT vào Task 8.
  - `SELF_ASSESSMENT_REPORT.md`: ghi việc vượt 3 trang vào "Chưa làm được" để Task 10 tự trừ điểm.
- **Chạy thử `PAIRS=1` theo README** (mục cuối của Task 8):
  - Claude viết prompt để một session Claude Code khác đóng vai người ngoài nhóm: chỉ dùng README, clone vào thư mục mới, không xóa image cũ, và chỉ đăng kết quả lên issue #10 khi Vỹ đồng ý.
  - Session đó chạy được trên commit `9e4934d`: 2/2 `VALID`; `plain` 118 query, p95 1437.259 ms; `coalesced` 1 query, p95 89.552 ms; delta −1347.707 ms.
  - Claude đối chiếu bản nháp comment với `results/pilot/summary.csv` của bản clone đó: khớp.
  - Giới hạn: máy chạy là máy Vỹ, đã có sẵn image nền, nên chưa kiểm bước pull và `npm ci` lần đầu. Người chạy là AI, không phải người thật ngoài nhóm.
  - Chỗ README thiếu mà session đó tìm ra: không nói phải mở Docker Desktop trước khi chạy. Đã thêm một ý vào mục "Yêu cầu" của README (phần của Phúc).

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
| 8 | Approve PR #19 trong khi comment ghi "nên sửa trước khi Task 7 chạy fresh clone" (chuyển `results/pilot/` sang `results/pilot-r1/`), nên Phúc có thể merge mà chưa sửa | Claude | Vỹ chỉ ra: "vậy mà bạn là approve :)) troll tôi hã, rút kinh nghiệm nhé" | đổi sang Request changes, Approve lại sau commit của Phúc; ghi thành quy tắc: điểm phải sửa trước merge thì Request changes |
| 9 | Bản nháp comment dưới tài khoản Vỹ viết "Vỹ sẽ chốt" | Claude | Vỹ đọc bản nháp: "không phải là tôi sẽ chốt à" | đổi thành "mình chốt" |
| 10 | Viết `checklist #N` trong review và comment, GitHub tự gắn link sang issue hoặc PR cùng số | Claude | Vỹ thấy link sai trong issue #5 | đổi thành "checklist mục N" ở các chỗ đã đăng; trong file nguồn đã sửa `docs/ISSUES.md`, còn `docs/PILOT-CHECKLIST.md` (dòng 26 và 31) và `app/test/calibrate-query.mjs` (dòng 34) |
| 11 | Bản đầu script Task 6 tính `median_query_ms` trên mọi request, lệch `summary.json` của coalesced (0 so với 10.039 ms) | Claude | chạy đối chiếu trên pilot-r1 | tính trên request có `db_queries > 0`; định nghĩa này `aggregate.js` đang dùng, contract chưa ghi |
| 12 | Báo cáo của subagent thiếu hoặc sai: nói `redis` mới nhất là 6.2.1 (thực tế 6.3.1), không tìm được ngày EOL của Node 22 và không xác nhận được hỗ trợ của Redis 7.4 | Claude (subagent) | Vỹ nghi ngờ kết quả, Claude đọc lại bằng trình duyệt và npm registry | dùng dữ liệu đọc lại: 6.3.1; Node 22 EOL 2027-04-30; Redis 7.4.x được hỗ trợ theo SECURITY.md |
| 13 | Bản đầu skeleton Task 8 tự chia giới hạn 3 trang thành số từ tối đa cho từng mục và yêu cầu Phúc rút mục 4, làm như đề ưu tiên viết ngắn | Claude | Vỹ đọc comment bàn giao và yêu cầu ưu tiên đủ, dễ hiểu | bỏ giới hạn số từ trong comment (issue #10); giới hạn 3 trang chỉ kiểm khi ghép, cắt chỗ trùng trước, không cắt phần giải thích |
| 14 | `docs/SOURCES.md` (PR #24) ghi mọi `#N` chỉ checklist trong `app/test/calibrate-query.mjs` và `app/test/lock-tests.mjs` đã đổi thành "mục N", nhưng diff chỉ sửa một chuỗi và một comment; các comment khác vẫn là `#10`–`#14` | Claude | Lần soát cuối Task 8: `git grep` các `#N` trên `main` rồi so với diff của PR #24 | sửa câu trong `docs/SOURCES.md` cho đúng phạm vi đã sửa; comment trong file code giữ nguyên vì GitHub không tự gắn link ở đó |
