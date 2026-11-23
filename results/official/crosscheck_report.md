# Crosscheck results/official

- Lượt trong thư mục: 20; hợp lệ (tính lại): 20; cặp đủ hai mode hợp lệ: 10

## Số chính (tính lại từ requests.jsonl và snapshots)

- queries_per_expiry plain: 200 (115–200); coalesced: 1 (1–1); queries_saved: 199 (114–199)
- median p95 plain: 3925.724 (2019.178–4537.887) ms; coalesced: 138.881 (79.024–260.893) ms
- median delta_p95_ms theo cặp: -3696.122 (-4353.17–-1863.389) ms (âm nghĩa là coalesced có p95 thấp hơn)

## Theo cặp (truy về log)

| Pair | plain run | coalesced run | plain queries | plain p95 | coalesced p95 | delta_p95_ms | saved |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 20261122T152108Z-plain-1 | 20261122T152116Z-coalesced-1 | 138 | 2019.178 | 155.789 | -1863.389 | 137 |
| 2 | 20261122T152122Z-plain-2 | 20261122T152133Z-coalesced-2 | 200 | 4537.887 | 184.717 | -4353.17 | 199 |
| 3 | 20261122T152145Z-plain-3 | 20261122T152139Z-coalesced-3 | 115 | 2231.651 | 95.24 | -2136.411 | 114 |
| 4 | 20261122T152153Z-plain-4 | 20261122T152203Z-coalesced-4 | 200 | 3852.697 | 213.427 | -3639.27 | 199 |
| 5 | 20261122T152216Z-plain-5 | 20261122T152210Z-coalesced-5 | 200 | 3998.75 | 141.205 | -3857.545 | 199 |
| 6 | 20261122T152226Z-plain-6 | 20261122T152236Z-coalesced-6 | 200 | 4064.757 | 127.734 | -3937.023 | 199 |
| 7 | 20261122T152248Z-plain-7 | 20261122T152242Z-coalesced-7 | 116 | 2406.628 | 136.557 | -2270.071 | 115 |
| 8 | 20261122T152303Z-plain-8 | 20261122T152257Z-coalesced-8 | 200 | 4013.868 | 260.893 | -3752.975 | 199 |
| 9 | 20261122T152313Z-plain-9 | 20261122T152323Z-coalesced-9 | 200 | 4027.221 | 95.246 | -3931.975 | 199 |
| 10 | 20261122T152335Z-plain-10 | 20261122T152329Z-coalesced-10 | 165 | 3281.436 | 79.024 | -3202.412 | 164 |

## Nguyên nhân từ log (các lượt đã chọn)

| Mode | median pool_wait_ms | median lock_wait_ms | median query_ms | hit | miss-query | miss-wait | miss-fallback |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| plain | 1609.19 | 0 | 383.232 | 266 | 1734 | 0 | 0 |
| coalesced | 0 | 42.749 | 43.069 | 68 | 10 | 1922 | 0 |

Request đứng ở vị trí p95 của từng lượt (dòng trong `requests.jsonl`): thời gian của nó gồm chờ pool, chờ lock và chạy query.

| run_id | dòng | cache_result | pool_wait_ms | lock_wait_ms | query_ms | burst_span_ms | hit |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 20261122T152108Z-plain-1 | 173 | miss-query | 1732.501 | 0 | 204.887 | 76.312 | 62 |
| 20261122T152116Z-coalesced-1 | 164 | miss-wait | 0 | 21.388 | 0 | 57.732 | 8 |
| 20261122T152122Z-plain-2 | 194 | miss-query | 3809.525 | 0 | 685.554 | 40.105 | 0 |
| 20261122T152133Z-coalesced-2 | 179 | miss-wait | 0 | 42.138 | 0 | 42.398 | 0 |
| 20261122T152145Z-plain-3 | 170 | miss-query | 1965.66 | 0 | 204.535 | 59.885 | 85 |
| 20261122T152139Z-coalesced-3 | 27 | miss-wait | 0 | 72.34 | 0 | 26.919 | 0 |
| 20261122T152153Z-plain-4 | 185 | miss-query | 3594.914 | 0 | 207.516 | 57.323 | 0 |
| 20261122T152203Z-coalesced-4 | 77 | miss-wait | 0 | 173.973 | 0 | 34.695 | 0 |
| 20261122T152216Z-plain-5 | 189 | miss-query | 3583.493 | 0 | 390.013 | 20.99 | 0 |
| 20261122T152210Z-coalesced-5 | 152 | miss-wait | 0 | 38.791 | 0 | 14.487 | 0 |
| 20261122T152226Z-plain-6 | 172 | miss-query | 3228.791 | 0 | 793.148 | 32.036 | 0 |
| 20261122T152236Z-coalesced-6 | 179 | miss-wait | 0 | 86.597 | 0 | 13.01 | 0 |
| 20261122T152248Z-plain-7 | 180 | miss-query | 2168.688 | 0 | 198.365 | 73.22 | 84 |
| 20261122T152242Z-coalesced-7 | 70 | miss-wait | 0 | 57.804 | 0 | 27.939 | 0 |
| 20261122T152303Z-plain-8 | 173 | miss-query | 3379.155 | 0 | 597.612 | 35.961 | 0 |
| 20261122T152257Z-coalesced-8 | 180 | miss-wait | 0 | 112.164 | 0 | 98.135 | 60 |
| 20261122T152313Z-plain-9 | 190 | miss-query | 3516.162 | 0 | 485.08 | 24.42 | 0 |
| 20261122T152323Z-coalesced-9 | 118 | miss-wait | 0 | 44.145 | 0 | 14.983 | 0 |
| 20261122T152335Z-plain-10 | 179 | miss-query | 3047.959 | 0 | 207.342 | 92.572 | 35 |
| 20261122T152329Z-coalesced-10 | 8 | miss-wait | 0 | 50.459 | 0 | 34.498 | 0 |

## Kết quả đối chiếu

**PASS**: mọi số tính lại khớp summary.json, summary.csv và report_table.md.
