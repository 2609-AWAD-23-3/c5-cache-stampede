# Benchmark Report Table

- Valid runs: **20** / 20 total (Plain: 10, Coalesced: 10, Complete valid pairs: 10)
- All latencies use nearest-rank percentile on `status == 200` requests.
- `delta_p95_ms = p95_coalesced - p95_plain` (negative means p95 latency decreased).

## 1. Aggregate Summary (median (min–max))

| Metric | Plain (`plain`) | Coalesced (`coalesced`) | Paired Difference / Saved |
| --- | --- | --- | --- |
| Queries per expiry (`queries_per_expiry`) | 200 (115–200) | 1 (1–1) | **queries_saved**: 199 (114–199) |
| Median of run p95 (`median_of_run_p95_ms`) | 3925.724 (2019.178–4537.887) ms | 138.881 (79.024–260.893) ms | **median_of_pair_delta_p95_ms**: -3696.122 (-4353.17–-1863.389) ms |
| Median of run p50 (`p50_ms`) | 1999.501 (521.92–2448.623) ms | 107.869 (62.924–168.247) ms | delta_p50_ms: -1896.245 (-2326.298–-414.409) ms |
| Burst span (`burst_span_ms`) | 48.714 (20.99–92.572) ms | 31.219 (13.01–98.135) ms | — |
| First-read hit rate (`hit_rate`) | 0 (0–0.425) | 0 (0–0.3) | — |
| Coalesced fallbacks (`miss_fallback_count`) | — | 0 (0–0) | — |

## 2. Paired Results

| Pair | Plain `run_id` | Plain queries | Plain p95 (ms) | Coalesced `run_id` | Coalesced queries | Coalesced p95 (ms) | `queries_saved` | `delta_p95_ms` (ms) | Coalesced fallbacks |
| ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `20261122T152108Z-plain-1` | 138 | 2019.178 | `20261122T152116Z-coalesced-1` | 1 | 155.789 | 137 | -1863.389 | 0 |
| 2 | `20261122T152122Z-plain-2` | 200 | 4537.887 | `20261122T152133Z-coalesced-2` | 1 | 184.717 | 199 | -4353.17 | 0 |
| 3 | `20261122T152145Z-plain-3` | 115 | 2231.651 | `20261122T152139Z-coalesced-3` | 1 | 95.24 | 114 | -2136.411 | 0 |
| 4 | `20261122T152153Z-plain-4` | 200 | 3852.697 | `20261122T152203Z-coalesced-4` | 1 | 213.427 | 199 | -3639.27 | 0 |
| 5 | `20261122T152216Z-plain-5` | 200 | 3998.75 | `20261122T152210Z-coalesced-5` | 1 | 141.205 | 199 | -3857.545 | 0 |
| 6 | `20261122T152226Z-plain-6` | 200 | 4064.757 | `20261122T152236Z-coalesced-6` | 1 | 127.734 | 199 | -3937.023 | 0 |
| 7 | `20261122T152248Z-plain-7` | 116 | 2406.628 | `20261122T152242Z-coalesced-7` | 1 | 136.557 | 115 | -2270.071 | 0 |
| 8 | `20261122T152303Z-plain-8` | 200 | 4013.868 | `20261122T152257Z-coalesced-8` | 1 | 260.893 | 199 | -3752.975 | 0 |
| 9 | `20261122T152313Z-plain-9` | 200 | 4027.221 | `20261122T152323Z-coalesced-9` | 1 | 95.246 | 199 | -3931.975 | 0 |
| 10 | `20261122T152335Z-plain-10` | 165 | 3281.436 | `20261122T152329Z-coalesced-10` | 1 | 79.024 | 164 | -3202.412 | 0 |

## 3. All Recorded Runs

| `run_id` | Pair | Mode | Valid | Queries | Header sum | p50 (ms) | p95 (ms) | max (ms) | Burst span (ms) | Hits | Miss-query | Miss-wait | Miss-fallback | Invalid reasons |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `20261122T152108Z-plain-1` | 1 | plain | true | 138 | 138 | 710.619 | 2019.178 | 2109.506 | 76.312 | 62 | 138 | 0 | 0 | — |
| `20261122T152116Z-coalesced-1` | 1 | coalesced | true | 1 | 1 | 108.227 | 155.789 | 157.537 | 57.732 | 8 | 1 | 191 | 0 | — |
| `20261122T152122Z-plain-2` | 2 | plain | true | 200 | 200 | 2448.623 | 4537.887 | 4559.061 | 40.105 | 0 | 200 | 0 | 0 | — |
| `20261122T152133Z-coalesced-2` | 2 | coalesced | true | 1 | 1 | 122.325 | 184.717 | 186.485 | 42.398 | 0 | 1 | 199 | 0 | — |
| `20261122T152139Z-coalesced-3` | 3 | coalesced | true | 1 | 1 | 71.404 | 95.24 | 96.534 | 26.919 | 0 | 1 | 199 | 0 | — |
| `20261122T152145Z-plain-3` | 3 | plain | true | 115 | 115 | 531.37 | 2231.651 | 2420.008 | 59.885 | 85 | 115 | 0 | 0 | — |
| `20261122T152153Z-plain-4` | 4 | plain | true | 200 | 200 | 2054.913 | 3852.697 | 3961.283 | 57.323 | 0 | 200 | 0 | 0 | — |
| `20261122T152203Z-coalesced-4` | 4 | coalesced | true | 1 | 1 | 132.102 | 213.427 | 214.725 | 34.695 | 0 | 1 | 199 | 0 | — |
| `20261122T152210Z-coalesced-5` | 5 | coalesced | true | 1 | 1 | 80.892 | 141.205 | 147.967 | 14.487 | 0 | 1 | 199 | 0 | — |
| `20261122T152216Z-plain-5` | 5 | plain | true | 200 | 200 | 2196.034 | 3998.75 | 4093.796 | 20.99 | 0 | 200 | 0 | 0 | — |
| `20261122T152226Z-plain-6` | 6 | plain | true | 200 | 200 | 2179.138 | 4064.757 | 4178.155 | 32.036 | 0 | 200 | 0 | 0 | — |
| `20261122T152236Z-coalesced-6` | 6 | coalesced | true | 1 | 1 | 112.172 | 127.734 | 129.027 | 13.01 | 0 | 1 | 199 | 0 | — |
| `20261122T152242Z-coalesced-7` | 7 | coalesced | true | 1 | 1 | 107.511 | 136.557 | 143.275 | 27.939 | 0 | 1 | 199 | 0 | — |
| `20261122T152248Z-plain-7` | 7 | plain | true | 116 | 116 | 521.92 | 2406.628 | 2517.062 | 73.22 | 84 | 116 | 0 | 0 | — |
| `20261122T152257Z-coalesced-8` | 8 | coalesced | true | 1 | 1 | 168.247 | 260.893 | 263.67 | 98.135 | 60 | 1 | 139 | 0 | — |
| `20261122T152303Z-plain-8` | 8 | plain | true | 200 | 200 | 2312.933 | 4013.868 | 4129.52 | 35.961 | 0 | 200 | 0 | 0 | — |
| `20261122T152313Z-plain-9` | 9 | plain | true | 200 | 200 | 1944.089 | 4027.221 | 4041.64 | 24.42 | 0 | 200 | 0 | 0 | — |
| `20261122T152323Z-coalesced-9` | 9 | coalesced | true | 1 | 1 | 74.41 | 95.246 | 96.787 | 14.983 | 0 | 1 | 199 | 0 | — |
| `20261122T152329Z-coalesced-10` | 10 | coalesced | true | 1 | 1 | 62.924 | 79.024 | 80.343 | 34.498 | 0 | 1 | 199 | 0 | — |
| `20261122T152335Z-plain-10` | 10 | plain | true | 165 | 165 | 1581.412 | 3281.436 | 3471.515 | 92.572 | 35 | 165 | 0 | 0 | — |
