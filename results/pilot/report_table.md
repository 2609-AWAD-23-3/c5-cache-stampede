# Benchmark Report Table

- Valid runs: **10** / 10 total (Plain: 5, Coalesced: 5, Complete valid pairs: 5)
- All latencies use nearest-rank percentile on `status == 200` requests.
- `delta_p95_ms = p95_coalesced - p95_plain` (negative means p95 latency decreased).

## 1. Aggregate Summary (median (min–max))

| Metric | Plain (`plain`) | Coalesced (`coalesced`) | Paired Difference / Saved |
| --- | --- | --- | --- |
| Queries per expiry (`queries_per_expiry`) | 200 (200–200) | 1 (1–1) | **queries_saved**: 199 (199–199) |
| Median of run p95 (`median_of_run_p95_ms`) | 1631.086 (1560.935–1842.136) ms | 38.009 (34.256–45.639) ms | **median_of_pair_delta_p95_ms**: -1585.447 (-1800.614–-1522.926) ms |
| Median of run p50 (`p50_ms`) | 853.649 (784.815–1038.34) ms | 32.935 (27.376–34.21) ms | delta_p50_ms: -820.714 (-1004.987–-756.091) ms |
| Burst span (`burst_span_ms`) | 9.254 (7.123–36.07) ms | 8.888 (4.353–13.332) ms | — |
| First-read hit rate (`hit_rate`) | 0 (0–0) | 0 (0–0.005) | — |
| Coalesced fallbacks (`miss_fallback_count`) | — | 0 (0–0) | — |

## 2. Paired Results

| Pair | Plain `run_id` | Plain queries | Plain p95 (ms) | Coalesced `run_id` | Coalesced queries | Coalesced p95 (ms) | `queries_saved` | `delta_p95_ms` (ms) | Coalesced fallbacks |
| ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `20261122T080434Z-plain-1` | 200 | 1842.136 | `20261122T080442Z-coalesced-1` | 1 | 41.522 | 199 | -1800.614 | 0 |
| 2 | `20261122T080454Z-plain-2` | 200 | 1631.086 | `20261122T080448Z-coalesced-2` | 1 | 45.639 | 199 | -1585.447 | 0 |
| 3 | `20261122T080501Z-plain-3` | 200 | 1575.707 | `20261122T080509Z-coalesced-3` | 1 | 34.531 | 199 | -1541.176 | 0 |
| 4 | `20261122T080515Z-plain-4` | 200 | 1758.834 | `20261122T080523Z-coalesced-4` | 1 | 34.256 | 199 | -1724.578 | 0 |
| 5 | `20261122T080535Z-plain-5` | 200 | 1560.935 | `20261122T080529Z-coalesced-5` | 1 | 38.009 | 199 | -1522.926 | 0 |

## 3. All Recorded Runs

| `run_id` | Pair | Mode | Valid | Queries | Header sum | p50 (ms) | p95 (ms) | max (ms) | Burst span (ms) | Hits | Miss-query | Miss-wait | Miss-fallback | Invalid reasons |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `20261122T080434Z-plain-1` | 1 | plain | true | 200 | 200 | 1038.34 | 1842.136 | 1938.552 | 36.07 | 0 | 200 | 0 | 0 | — |
| `20261122T080442Z-coalesced-1` | 1 | coalesced | true | 1 | 1 | 33.353 | 41.522 | 42.176 | 8.888 | 0 | 1 | 199 | 0 | — |
| `20261122T080448Z-coalesced-2` | 2 | coalesced | true | 1 | 1 | 34.21 | 45.639 | 46.212 | 4.353 | 0 | 1 | 199 | 0 | — |
| `20261122T080454Z-plain-2` | 2 | plain | true | 200 | 200 | 835.359 | 1631.086 | 1641.043 | 7.123 | 0 | 200 | 0 | 0 | — |
| `20261122T080501Z-plain-3` | 3 | plain | true | 200 | 200 | 784.815 | 1575.707 | 1588.382 | 9.254 | 0 | 200 | 0 | 0 | — |
| `20261122T080509Z-coalesced-3` | 3 | coalesced | true | 1 | 1 | 28.724 | 34.531 | 34.866 | 13.332 | 1 | 1 | 198 | 0 | — |
| `20261122T080515Z-plain-4` | 4 | plain | true | 200 | 200 | 940.641 | 1758.834 | 1839.745 | 13.232 | 0 | 200 | 0 | 0 | — |
| `20261122T080523Z-coalesced-4` | 4 | coalesced | true | 1 | 1 | 27.376 | 34.256 | 34.858 | 8.218 | 0 | 1 | 199 | 0 | — |
| `20261122T080529Z-coalesced-5` | 5 | coalesced | true | 1 | 1 | 32.935 | 38.009 | 38.448 | 10.252 | 0 | 1 | 199 | 0 | — |
| `20261122T080535Z-plain-5` | 5 | plain | true | 200 | 200 | 853.649 | 1560.935 | 1658.875 | 7.185 | 0 | 200 | 0 | 0 | — |
