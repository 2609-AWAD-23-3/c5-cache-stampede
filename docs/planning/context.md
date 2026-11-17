> Tài liệu lập kế hoạch lưu trữ (17/11/2026), do Codex soạn. Các link tới PDF đề và bản dịch trỏ thư mục `seminar/` trên máy cục bộ, không có trong repo. Khi mâu thuẫn, `CONTRACT.md` và `docs/ISSUES.md` thắng.

# Context cho Claude review Seminar C5

**Môn CSC13114 · Lớp CQ2023/3 · Cập nhật 17/11/2026**

Claude, hãy dùng file này làm context chung khi review kế hoạch và các task triển khai của nhóm. Với lần review đầu, hãy kiểm tra xem thiết kế thí nghiệm có trả lời đúng câu hỏi đã chọn, chạy lại được theo rubric và chia việc hợp lý cho ba người hay không. Khi có code, PR hoặc log, hãy review phần thực tế được gửi cùng file này. Trả lời bằng tiếng Việt và giữ thuật ngữ IT bằng tiếng Anh.

## 1. Nhóm, chủ đề và tình trạng hiện tại

- Thành viên gồm **Nguyễn Khắc Vượng**, **Bửu Huỳnh Vĩnh Phúc** và **Trần Quốc Vỹ**. Vỹ là người chuẩn bị context này để trao đổi với reviewer.
- Nhóm đã chọn **C5 — Multi-layer caching and cache stampede**. Dòng chủ đề do Vỹ cung cấp ghi bộ MSSV `23120328-23120409-23120410`. Việc đối chiếu dòng trên sheet đăng ký nằm ngoài lần kiểm tra workspace này.
- Mô tả C5 trong đề gợi ý đo hit rate và database load khi hot key hết hạn. Câu hỏi cụ thể của nhóm tập trung vào Postgres queries và p95 latency.

> When a hot cache key expires under 200 concurrent requests, how many Postgres queries does request coalescing with a Redis lock save compared with plain cache-aside (queries per expiry), and how much does it add to p95 latency (ms)?

| Hạng mục | Tình trạng tại thời điểm bàn giao |
| --- | --- |
| Đề và rubric | Có PDF tiếng Anh và bản dịch Markdown tiếng Việt trong thư mục `seminar/`. |
| Phạm vi nghiên cứu | Câu hỏi tiếng Anh và 200 concurrent requests do nhóm cung cấp. |
| Kế hoạch kỹ thuật | Codex brainstorm bản đầu. Sau đó Claude review và tạo D1–D12 cùng contract v1.0. Bàn giao mới nhất của Claude gọi đây là đề xuất để nhóm đọc lại trước khi chốt. |
| Implementation và số liệu | Đã có `c5-repo/` với Compose, DB init/seed, Dockerfile, stub Node.js và template hồ sơ nộp. `git rev-parse` xác nhận thư mục này chưa là Git repo. Endpoint sản phẩm trả `501`, runner là stub và thư mục kết quả chỉ có `.gitkeep`. Chưa có benchmark, slides hay bằng chứng tái chạy từ fresh clone. |
| Quyết định còn mở | Chốt khung repo và contract sau khi xử lý các điểm ở mục 1.1. Xác nhận owner, stack/version và các tham số cần hiệu chỉnh trong pilot. |

Nguồn trong workspace. PDF gốc có 8 trang, bản dịch hỗ trợ tra cứu nhanh. [PDF đề và rubric](<../SEMINAR — brief and rubric (CQ2023-3).pdf>) · [Bản dịch tiếng Việt](<../SEMINAR — brief and rubric (CQ2023-3)_vn.md>)

### 1.1. Bàn giao sau review đầu của Claude

Claude soạn `decisions-and-contract.md` và khung `c5-repo/`. Proposal mới dùng **hai app instance nhận 100 request mỗi instance**, **10 cặp chính thức**, một `SELECT` aggregate trên seed cố định và `pg_stat_statements` để kiểm đếm query. Kế hoạch sáu cặp ở mục 3 bên dưới là brainstorm ban đầu của Codex để tham chiếu. Ghi đúng phần Claude đã tạo trong `AI-LOG.md`. Các lượt sau, Claude nhận vai trò reviewer cho plan, PR và evidence do nhóm hoặc Codex triển khai. [D1–D12 của Claude](decisions-and-contract.md) · [Contract v1.0](../c5-repo/CONTRACT.md) · [Pilot checklist](../c5-repo/docs/PILOT-CHECKLIST.md)

Codex đã chạy `docker compose config --quiet` và `node --check` trên ba file JS. Các kiểm tra này pass. Smoke test trực tiếp hai stub Node.js trả `/healthz` 200 và `/products/1` 501; `/config` khác `port` sau khi bỏ qua `instance`. Chưa chạy full Compose stack hoặc benchmark. `/healthz` hiện là response stub nên status 200 chưa xác nhận kết nối Redis hay Postgres.

**Đề xuất giữ scaffold làm điểm xuất phát, rồi chốt bốn điểm trước khi viết service và runner.**

| Điểm cần chốt | Evidence và đề xuất |
| --- | --- |
| **So sánh `/config`** | Hai instance dùng port khác nhau và stub trả `port`. Contract hiện chỉ cho phép `instance` khác. So sánh các trường ảnh hưởng phép đo, đồng thời lưu `port` và `instance` dưới metadata topology. [Contract, HTTP API](../c5-repo/CONTRACT.md#2-http-api) · [Stub](../c5-repo/app/src/index.js) |
| **Fallback và tiêu chí loại lượt** | Fallback hoặc nhiều query có thể là kết quả thật của `coalesced`. Nếu burst đúng protocol và metric còn đo được, giữ các lượt này khi tính hiệu quả thực tế và báo số fallback. Dành việc chạy bù cho lỗi protocol hoặc lỗi thu thập làm số liệu không đáng tin. Với HTTP error hoặc timeout, ghi rõ tỷ lệ lỗi và mẫu dùng để tính p95. [Contract, lượt không hợp lệ](../c5-repo/CONTRACT.md#8-lượt-không-hợp-lệ-đóng-băng-trước-2311) |
| **Điều kiện pilot cho baseline** | Checklist hiện đòi plain có query count gần 200 và gợi ý chỉnh seed nếu lệch. Một burst 200 có thể có nhiều hit sau refill. Chọn workload đại diện trước khi thu kết quả chính thức. Nghiệm thu dựa vào expiry thật, concurrency và hai nguồn đếm query khớp nhau. [Pilot checklist](../c5-repo/docs/PILOT-CHECKLIST.md) |
| **Định nghĩa hit rate** | Contract định nghĩa `hit` là lần đọc Redis đầu tiên thành công, đồng thời gắn `hit` khi holder recheck sau lần miss. Dùng hit rate tại lần đọc đầu cho cả hai mode và ghi recheck riêng để giải thích tác dụng coalescing. [Contract, response header và cache behavior](../c5-repo/CONTRACT.md) |

## 2. Yêu cầu chính thức của đề

Seminar chiếm **7% điểm môn học**, chấm trên **100 điểm**. Nhóm tối đa ba người. Có thể viết và trình bày bằng tiếng Anh hoặc tiếng Việt. Đề cho phép dùng assistant và chấm cả cách nhóm kiểm chứng output, thông tin kỹ thuật và source.

### Thí nghiệm và bằng chứng

- Có một câu hỏi, một baseline và một thay đổi. Giữ cùng máy, data và load. Ghi rõ các yếu tố giữ cố định trong `REPORT.md`.
- Từ fresh clone, làm theo `README.md` và chạy **một command** để in số liệu và ghi raw output vào `results/`.
- Chạy **ít nhất 5 lần** và báo cáo median cùng độ phân tán. Nếu điều kiện thực tế khiến nhóm chạy ít hơn, đề yêu cầu giải thích lý do và ghi số lần thật. Số liệu trong report và slides cần truy được về log. Trường hợp kết quả giảng viên chạy lệch ngoài spread đã báo cáo, rubric dùng kết quả tái chạy của giảng viên để chấm.
- Chỉ load test hệ thống thuộc quyền của nhóm. Các nhận định về version, ngày phát hành, API và trạng thái tool như `stable` hoặc `experimental` cần official documentation hoặc release notes kèm ngày đọc. Nếu dùng model API trả phí trong study, đề yêu cầu giới hạn chi phí và có replay mode từ raw response. C5 hiện đề xuất chạy local.

### Sản phẩm nộp và rubric

Nhóm cung cấp một **public GitHub repository** để clone và nộp **một ZIP của repository có `.git`**. Một thành viên nộp bằng tài khoản `<StudentID>@student.hcmus.edu.vn`. Tên ZIP theo mẫu `23120328-23120409-23120410_<total>.zip`, trong đó `<total>` là điểm nhóm tự chấm.

| File hoặc thành phần | Yêu cầu |
| --- | --- |
| `README.md` | Hướng dẫn từng bước từ fresh clone đến command đo. |
| Command đo, `results/` | Raw output của mọi lần chạy được dùng trong báo cáo. |
| `REPORT.md` | **Tối đa 3 trang**, link repository ở dòng đầu. Có câu hỏi, setup (versions, máy, data, load), baseline, thay đổi, số liệu có đơn vị và spread, khuyến nghị, khi nào nên tránh dùng, giới hạn của phép đo và source. |
| `slides.pdf` | Slides của bài thuyết trình, số liệu dễ đọc và truy được về log. |
| `TALK.md` | Link video **tối đa 8 phút**, người có link xem được. Mỗi thành viên trình bày một phần. Video mở đầu bằng câu hỏi, cho thấy phép đo hoặc log, nêu số liệu chính kèm đơn vị và spread, kết thúc bằng khuyến nghị. |
| `AI-LOG.md` | Ghi tool nào dùng cho phần nào. Để đạt band cao khi dùng AI, có mục `Changed` / `Rejected` thực tế và ít nhất một lỗi assistant mà nhóm phát hiện, kèm cách phát hiện. `Tool: none` là entry hợp lệ nếu nhóm chọn không dùng AI. |
| `SELF_ASSESSMENT_REPORT.md` | Một dòng mỗi tiêu chí, điểm tự chấm và bằng chứng trỏ tới file, section, raw log hoặc timestamp trong video. Thêm phần ngắn về việc chưa làm được. Tự chấm tiêu chí thuyết trình trên video. Template trên Classroom, tổng bảng khớp `<total>` trong tên ZIP. |

| Tiêu chí | Điểm |
| --- | ---: |
| Câu hỏi và baseline | 15 |
| Khả năng chạy lại phép đo | 30 |
| Phát hiện và khuyến nghị | 20 |
| Thuyết trình | 15 |
| Source và độ chính xác của thông tin | 10 |
| `AI-LOG.md` | 10 |

Điểm tự chấm được đối chiếu với điểm giảng viên trước khi áp dụng quy định red team. Theo bảng trong đề, chênh lệch trong ±10 giữ nguyên, +11 đến +20 trừ 3, +21 đến +30 trừ 6, trên +30 trừ 10 và −21 trở xuống trừ 3. Thiếu `SELF_ASSESSMENT_REPORT.md` bị trừ 10 và bỏ qua tổng trên tên ZIP. Dòng tự chấm thiếu evidence được tính là đã khai điểm cho phần chưa làm. Điểm sau điều chỉnh tối thiểu là 0.

### Các mốc chính thức

| Thời gian | Việc cần làm |
| --- | --- |
| **22:00 Chủ nhật 15/11/2026** | Hạn đăng ký chủ đề trên sheet. |
| **22:00 Chủ nhật 29/11/2026** | Hạn nộp ZIP. Nếu tham gia bình chọn, một thành viên đăng bài Facebook trước cùng hạn với `#AWADSeminar23_3`, tiêu đề, câu hỏi, một số liệu chính và link video. Việc tham gia bình chọn là tùy chọn. |
| **Thứ Hai 30/11/2026** | Classroom công bố các cặp red team. |
| **22:00 Thứ Ba 01/12/2026** | Đóng bình chọn. Chỉ tính reaction của sinh viên trong lớp, một lượt mỗi người. |
| **22:00 Thứ Tư 02/12/2026** | Hạn mở một issue `[red-team] <your student IDs>` trên repo được phân. Ghi command đã chạy, kết quả đặt cạnh số liệu của nhóm đó và ít nhất một phát hiện có evidence. Thiếu issue đúng hạn bị **trừ 10 điểm**. Công bố các nhóm thuyết trình ngày 02/12. |
| **03/12, 10/12 và 17/12/2026** | Thuyết trình trong giờ lý thuyết. Chín nhóm được chọn qua bình chọn, ba nhóm mỗi buổi. Mỗi nhóm có 10 phút trình bày và 5 phút hỏi đáp. Điểm tiêu chí 4 lấy phần thuyết trình trực tiếp nếu cao hơn video. |

Nhóm Facebook dùng cho bình chọn. [AWAD FIT HCMUS](https://www.facebook.com/groups/awad.fit.hcmus)

## 3. Plan kỹ thuật đề xuất cho Claude review

### Service và baseline

Demo local một API đọc chi tiết sản phẩm, ví dụ `GET /products/1`. Đề xuất **Node.js + Redis + Postgres**, dựng bằng Docker Compose. Chọn một hot product từ seed data cố định. Dùng một câu `SELECT` xác định cho mỗi lần cần fetch dữ liệu. Stack có thể đổi theo mức quen thuộc của nhóm, miễn giữ cùng một service và data path cho hai chế độ.

| Thành phần | `plain` | `coalesced` |
| --- | --- | --- |
| Cache hit | Đọc Redis và trả cùng response. | Đọc Redis và trả cùng response. |
| Cache miss | Request thấy miss tự query Postgres rồi ghi Redis. | Request lấy lock kiểm tra lại cache, chỉ query nếu vẫn miss, ghi Redis rồi nhả lock. Request còn lại chờ có giới hạn và đọc kết quả từ Redis. |
| Các biến chung | Cùng endpoint, payload, câu SQL, seed, cache TTL, Postgres pool, request client, timeout, host và logging cần thiết. | Dùng chung các biến bên trái. Lock lease và cách chờ là cấu hình riêng của intervention, được ghi lại. |

Dùng lock riêng theo cache key, token riêng cho mỗi lần acquire và TTL cho lock. `SET ... NX PX` là cơ chế acquire đề xuất. Nhả lock bằng thao tác nguyên tử chỉ xóa khi token khớp. Kiểm tra lại cache sau khi lấy lock để tránh query lặp nếu một request khác vừa refill. Chốt policy khi đợi quá hạn, khi holder lỗi và khi lease hết trước refill. Log để nhận biết timeout, fallback hoặc lần query bổ sung nếu các tình huống đó xảy ra. [Redis — cache-aside với node-redis](https://redis.io/docs/latest/develop/use-cases/cache-aside/nodejs/) · [Redis — distributed locks](https://redis.io/docs/latest/manual/patterns/distributed-locks/)

Redis là cache trước Postgres trong demo chính. Có một điểm cần Claude review sớm: mô hình này có đủ cho C5 theo câu hỏi đã chọn không, và có nên thu cache hit rate như metric phụ để đáp ứng mô tả trong đề không? Nhóm ưu tiên giữ đúng một thay đổi chính. Nếu cần thêm layer hoặc metric, dùng cùng cách thiết lập và đo ở cả hai chế độ.

### Quy trình cho một lượt đo

1. Kiểm tra service sẵn sàng, seed đúng. Làm warm-up theo cùng một quy trình để trạng thái Postgres và connection pool có thể so sánh. Làm đầy cache cho hot key và xác nhận có TTL. Cấu hình cache TTL đủ để cache vừa refill không hết hạn thêm lần nữa trong đợt tải.
2. Lấy snapshot query stats cho câu `SELECT` mục tiêu **sau warm-up và trước burst**. Dùng hiệu `pg_stat_statements.calls` trước/sau và lọc theo DB, app user cùng SQL mục tiêu. Xác định `queryid` trong môi trường đang chạy nếu dùng nó để lọc. Lưu snapshot cùng run ID để audit. [PostgreSQL — `pg_stat_statements`](https://www.postgresql.org/docs/current/pgstatstatements.html)
3. Chờ Redis xác nhận key đã hết hạn thật. Ghi mốc kiểm tra rồi phát **200 request vào cùng endpoint và product ID**. Dùng cùng cấu hình HTTP client, giới hạn connection phù hợp và cùng chính sách retry. Ghi độ rộng thời gian phát đợt request. Trong pilot, đối chiếu request overlap ở service nếu log client chưa đủ chứng minh tải đồng thời.
4. Dùng đồng hồ monotonic ở client để đo từ lúc phát request đến lúc đọc xong response body. Lưu request ID, duration, status/timeout và kết quả kiểm tra payload. Sau khi burst hoàn tất và các query liên quan đã kết thúc, lấy snapshot thứ hai. Nếu request lỗi hoặc timeout, lưu bằng chứng, số lỗi và policy đưa chúng vào phân tích.
5. Lưu mode, pair/run ID, cấu hình, các mốc expiry/burst, raw request records, query snapshots và summary. Kết quả từ cùng một command phải đủ để tính lại bảng report. Ghi cấu hình máy, versions và commit dùng cho benchmark chính thức.

### Lặp, tổng hợp và cách diễn giải

- Đề xuất **6 cặp chính thức**. Ba cặp chạy `plain → coalesced` và ba cặp chạy ngược lại, xen kẽ. Mỗi chế độ có sáu lượt, mỗi lượt có một expiry và một burst 200 request. Chốt protocol và cách đánh dấu lượt lỗi trước khi thu số dùng trong report. Giữ lại raw log của lượt lỗi cùng lý do nếu phải chạy lại.
- `queries_per_expiry = calls_after − calls_before`. `queries_saved = queries_plain − queries_coalesced`, đơn vị `queries/expiry`.
- Tính p95 cho mỗi burst bằng một phương pháp percentile cố định và ghi cách xử lý lỗi/timeout. `delta_p95_ms = p95_coalesced − p95_plain`. Giá trị âm nghĩa là p95 giảm. Báo cáo p95 từng chế độ và chênh lệch, kèm median và min–max trên các lượt hoặc cặp tương ứng. Đặt tên rõ cho `median của p95 từng lượt` và `median của chênh lệch từng cặp`.
- Hướng kiểm chứng trong pilot gồm **cache hit cho 0 query mục tiêu**, **một request sau expiry cho 1 query mục tiêu**, **response hai mode giống nhau** và **burst 200 đủ chồng lấn**. Có thể đối chiếu query stats với log app trong pilot. Đây là kỳ vọng cần kiểm tra, hiện chưa có kết quả.
- Plain có thể phát sinh ít hơn 200 query nếu một phần request đến sau refill. Coalesced có thể tăng p95 do chờ hoặc giảm p95 nếu giảm được queue ở Postgres. Dùng số liệu để báo mức chênh lệch. Nếu muốn giải thích nguyên nhân, kiểm tra thêm evidence về DB queue, lock wait hoặc cache hit/miss.
- Nêu giới hạn phạm vi gồm một hot key, một dạng query, môi trường local, Redis và Postgres trong cấu hình đã đo. Nếu dư thời gian sau benchmark chính, cân nhắc một mức tải thấp hơn như 20 concurrent requests để kiểm tra kết luận có đổi theo tải hay không.

Ví dụ command đề xuất là `docker compose run --rm benchmark` sau các bước setup trong README. Runner có thể nằm trong Docker Compose network để gọi API, Redis và query stats. Khi triển khai Compose, dùng healthcheck để benchmark chỉ bắt đầu khi dependency thực sự sẵn sàng. Tên command, versions và các bước setup sẽ được xác nhận bằng fresh clone. [Docker Docs — startup order](https://docs.docker.com/compose/how-tos/startup-order/)

## 4. Phân công đề xuất và giao diện bàn giao

Đây là phương án để nhóm xác nhận. Mỗi người sở hữu một đầu ra đủ lớn, review chéo ở điểm bàn giao và trình bày phần mình làm.

| Người | Phần việc và file sở hữu | Đầu ra để người tiếp theo làm việc |
| --- | --- | --- |
| **Nguyễn Khắc Vượng** | **Service và môi trường.** Sở hữu `app/`, `compose.yaml`, cấu hình Redis/Postgres và seed DB. Viết hai chế độ cache, lock và xử lý timeout. Kiểm tra hit, miss, expiry và tính tương đương của payload. | Service dựng được. Phúc biết endpoint, cách chọn mode, cache key, SQL mục tiêu và cách truy cập query stats. Bàn giao config dùng chung cho hai chế độ. |
| **Bửu Huỳnh Vĩnh Phúc** | **Benchmark và evidence.** Sở hữu `benchmark/` và `results/`. Viết runner điều phối expiry, tạo burst, đọc query stats, thu latency/status, tổng hợp paired results và chạy chính thức. | Command chạy hai chế độ và lưu raw logs, snapshots cùng summary. Vỹ có thể tính lại từng số báo cáo từ evidence. |
| **Trần Quốc Vỹ** | **Phương pháp đo, review pilot, phân tích và tích hợp.** Chốt protocol với nhóm. Sở hữu `README.md`, `REPORT.md`, nội dung slides, `TALK.md`, `SELF_ASSESSMENT_REPORT.md` và bản tổng hợp `AI-LOG.md`. Kiểm fresh clone, đối chiếu report/slides với log, làm bộ nộp. | Protocol và tiêu chí kiểm pilot có trước lần chạy chính thức. Repo, ZIP có `.git`, video và bảng tự chấm được đối chiếu với log. |

Chốt sớm contract giữa service và runner gồm `GET /products/:id`, JSON response, cách chọn mode như `X-Cache-Mode: plain|coalesced`, cache key/prefix, SQL mục tiêu, cách xác định readiness, biến cấu hình và định dạng raw log. Một người giữ file dùng chung, ví dụ Vượng cập nhật `compose.yaml` khi Phúc đưa yêu cầu của runner. Vỹ lấy bảng kết quả từ output của Phúc để viết report. Mỗi người lưu bằng chứng AI của phần mình để Vỹ tổng hợp. Có thể dùng một branch/PR cho mỗi phần và review theo các mốc pilot, chạy chính thức, nộp bài.

| Mốc nội bộ đề xuất | Kết quả kỳ vọng |
| --- | --- |
| **17–18/11** | Chốt contract, protocol và người phụ trách. Vượng làm service, Phúc dựng runner theo contract, Vỹ viết khung tiêu chí kiểm pilot và báo cáo. |
| **19–22/11** | Tích hợp và có ít nhất một cặp pilot với raw log để review expiry, query count, response và concurrency. |
| **23–25/11** | Chốt cấu hình, thu sáu cặp chính thức, chạy lại từ fresh clone. So sánh trên máy chuẩn, ghi riêng nếu kiểm thêm trên máy khác. |
| **26–28/11** | Hoàn thiện report, slides, record video, tự chấm, kiểm link và ZIP. |
| **29/11** | Nộp trước 22:00. Đăng Facebook nếu nhóm muốn bình chọn. |
| **30/11–02/12** | Vỹ điều phối red team, Phúc chạy lại study được phân, Vượng kiểm tra baseline hoặc code để bổ sung evidence. Đặt chung kết quả trong một issue trước hạn. |

## 5. Claude cần review gì ngay bây giờ?

1. **Đúng câu hỏi và rubric.** Hai chế độ có thực sự chỉ khác cơ chế coalescing không? Phạm vi một Redis cache và metrics đã chọn có đủ cho C5 không? Nếu đề yêu cầu xử lý thêm hit rate hoặc multi-layer, đề xuất thay đổi nhỏ nhất giữ được baseline công bằng.
2. **Độ tin cậy của phép đo.** Cách xác nhận TTL expiry, phát 200 concurrent requests, lấy delta `calls` và tính p95 có chỗ nào sẽ làm số liệu lệch? Chỉ rõ cần làm gì để phân biệt warm cache, client queue, DB queue, query lặp và timeout.
3. **Correctness của Redis lock.** Kiểm tra race quanh cache recheck, lock release, lease expiry và waiter timeout. Nêu case nào cần kiểm trong pilot và mong thấy evidence nào.
4. **Khả năng chạy lại.** Sắp xếp warm-up, thứ tự cặp, tiêu chí lượt lỗi, phiên bản, raw log và one-command runner đã đủ chưa? Đề xuất cách kiểm nhẹ nhất có thể chạy được từ fresh clone.
5. **Phân công và lịch.** Rà chỗ hai người có thể sửa chung file hoặc chờ nhau, chỗ bàn giao còn thiếu, và phần nào nên giản lược để có pilot trước 22/11. Giữ ba phần việc trọn gói theo người.

Với lần review đầu, trả về các phát hiện theo mức độ ảnh hưởng. Mỗi mục nên nêu **vấn đề → tác động tới metric hoặc rubric → thay đổi đề xuất → cách xác minh**. Ưu tiên các quyết định cần chốt trước khi code và câu hỏi còn mở cần nhóm trả lời.

## 6. Cách tiếp tục review task triển khai

Mỗi lần Vỹ hoặc một thành viên gửi task, ưu tiên bối cảnh mới nhất và kiểm trạng thái thực tế của artifact tương ứng. Một lượt bàn giao có thể dùng mẫu sau ngay trong chat.

```text
Task, người phụ trách, mục tiêu:
Phạm vi muốn review:
Repo/branch và commit hoặc PR/diff, nếu có:
File, command, run ID, log hoặc artifact liên quan:
Tiêu chí muốn xác minh và điểm cần reviewer tập trung:
```

| Task được gửi | Trọng tâm review |
| --- | --- |
| **Service, Redis lock, Compose** | So sánh hai mode từ HTTP entry point đến SQL. Kiểm cache recheck, token release, TTL, lỗi, config dùng chung, seed và service readiness. Dùng file và dòng code cụ thể nếu có. |
| **Runner và protocol** | Kiểm cửa sổ lấy query stats, expiry thật, concurrency, HTTP/DB connection limits, đơn vị và percentile, số request lỗi, run order và khả năng truy raw log. Đối chiếu log với code thực thi. |
| **Kết quả, report hoặc slides** | Tính lại số chính từ log, kiểm dấu của `delta_p95_ms`, spread, đơn vị, giới hạn kết luận và source chính thức đúng với version được đo. Đối chiếu headline trên slides với báo cáo. |
| **Release bài nộp hoặc red team** | Kiểm fresh clone, command, artifact, tên ZIP, `.git`, link video, evidence tự chấm hoặc nội dung issue và deadline tương ứng. |

Trong kết quả review, phân biệt điều được xác nhận bằng source/log, điều suy ra từ code và điều còn cần chạy hoặc cần artifact. Với lỗi có thể tái hiện, ghi command hoặc bước xác minh và dấu hiệu mong đợi. Khi người gửi chỉ đưa plan, review ở mức thiết kế. Khi có execution evidence, đối chiếu trước khi kết luận task đã pass. Những nhận định của Claude sẽ được nhóm đối chiếu với source và ghi lại trong `AI-LOG.md` khi phù hợp.
