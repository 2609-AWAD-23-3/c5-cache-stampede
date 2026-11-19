# Benchmark Report Table

- Valid runs: **4** / 4 total (Plain: 2, Coalesced: 2, Complete valid pairs: 2)
- All latencies use nearest-rank percentile on `status == 200` requests.
- `delta_p95_ms = p95_coalesced - p95_plain` (negative means p95 latency decreased).

## 1. Aggregate Summary (median (min–max))

| Metric | Plain (`plain`) | Coalesced (`coalesced`) | Paired Difference / Saved |
| --- | --- | --- | --- |
| Queries per expiry (`queries_per_expiry`) | 200 (200–200) | 1 (1–1) | **queries_saved**: 199 (199–199) |
| Median of run p95 (`median_of_run_p95_ms`) | 4128.417 (4065.926–4190.909) ms | 155.984 (134.968–176.999) ms | **median_of_pair_delta_p95_ms**: -3972.434 (-4055.941–-3888.927) ms |
| Median of run p50 (`p50_ms`) | 2374.594 (2370.627–2378.561) ms | 116.042 (108.051–124.032) ms | delta_p50_ms: -2258.552 (-2270.51–-2246.595) ms |
| Burst span (`burst_span_ms`) | 55.055 (43.629–66.481) ms | 27.172 (26.698–27.645) ms | — |
| First-read hit rate (`hit_rate`) | 0 (0–0) | 0 (0–0) | — |
| Coalesced fallbacks (`miss_fallback_count`) | — | 0 (0–0) | — |

## 2. Paired Results

| Pair | Plain `run_id` | Plain queries | Plain p95 (ms) | Coalesced `run_id` | Coalesced queries | Coalesced p95 (ms) | `queries_saved` | `delta_p95_ms` (ms) | Coalesced fallbacks |
| ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `20261119T054624Z-plain-1` | 200 | 4190.909 | `20261119T054634Z-coalesced-1` | 1 | 134.968 | 199 | -4055.941 | 0 |
| 2 | `20261119T054646Z-plain-2` | 200 | 4065.926 | `20261119T054640Z-coalesced-2` | 1 | 176.999 | 199 | -3888.927 | 0 |

## 3. All Recorded Runs

| `run_id` | Pair | Mode | Valid | Queries | Header sum | p50 (ms) | p95 (ms) | max (ms) | Burst span (ms) | Hits | Miss-query | Miss-wait | Miss-fallback | Invalid reasons |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `20261119T054624Z-plain-1` | 1 | plain | true | 200 | 200 | 2378.561 | 4190.909 | 4381.765 | 66.481 | 0 | 200 | 0 | 0 | — |
| `20261119T054634Z-coalesced-1` | 1 | coalesced | true | 1 | 1 | 108.051 | 134.968 | 135.533 | 26.698 | 0 | 1 | 199 | 0 | — |
| `20261119T054640Z-coalesced-2` | 2 | coalesced | true | 1 | 1 | 124.032 | 176.999 | 180.305 | 27.645 | 0 | 1 | 199 | 0 | — |
| `20261119T054646Z-plain-2` | 2 | plain | true | 200 | 200 | 2370.627 | 4065.926 | 4168.165 | 43.629 | 0 | 200 | 0 | 0 | — |
