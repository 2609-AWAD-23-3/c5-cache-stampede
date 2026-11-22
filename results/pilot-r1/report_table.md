# Benchmark Report Table

- Valid runs: **10** / 10 total (Plain: 5, Coalesced: 5, Complete valid pairs: 5)
- All latencies use nearest-rank percentile on `status == 200` requests.
- `delta_p95_ms = p95_coalesced - p95_plain` (negative means p95 latency decreased).

## 1. Aggregate Summary (median (min–max))

| Metric | Plain (`plain`) | Coalesced (`coalesced`) | Paired Difference / Saved |
| --- | --- | --- | --- |
| Queries per expiry (`queries_per_expiry`) | 200 (200–200) | 1 (1–1) | **queries_saved**: 199 (199–199) |
| Median of run p95 (`median_of_run_p95_ms`) | 1820.438 (1643.611–1995.993) ms | 41.825 (39.255–82.684) ms | **median_of_pair_delta_p95_ms**: -1762.677 (-1956.738–-1598.673) ms |
| Median of run p50 (`p50_ms`) | 1027.155 (840.404–1110.883) ms | 31.647 (30.969–71.089) ms | delta_p50_ms: -983.206 (-1079.64–-809.113) ms |
| Burst span (`burst_span_ms`) | 11.266 (7.551–33.938) ms | 11.852 (5.183–24.895) ms | — |
| First-read hit rate (`hit_rate`) | 0 (0–0) | 0 (0–0) | — |
| Coalesced fallbacks (`miss_fallback_count`) | — | 0 (0–0) | — |

## 2. Paired Results

| Pair | Plain `run_id` | Plain queries | Plain p95 (ms) | Coalesced `run_id` | Coalesced queries | Coalesced p95 (ms) | `queries_saved` | `delta_p95_ms` (ms) | Coalesced fallbacks |
| ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | `20261122T091044Z-plain-1` | 200 | 1995.993 | `20261122T091052Z-coalesced-1` | 1 | 39.255 | 199 | -1956.738 | 0 |
| 2 | `20261122T091104Z-plain-2` | 200 | 1820.438 | `20261122T091058Z-coalesced-2` | 1 | 57.761 | 199 | -1762.677 | 0 |
| 3 | `20261122T091112Z-plain-3` | 200 | 1681.357 | `20261122T091119Z-coalesced-3` | 1 | 82.684 | 199 | -1598.673 | 0 |
| 4 | `20261122T091126Z-plain-4` | 200 | 1910.431 | `20261122T091133Z-coalesced-4` | 1 | 39.381 | 199 | -1871.05 | 0 |
| 5 | `20261122T091146Z-plain-5` | 200 | 1643.611 | `20261122T091139Z-coalesced-5` | 1 | 41.825 | 199 | -1601.786 | 0 |

## 3. All Recorded Runs

| `run_id` | Pair | Mode | Valid | Queries | Header sum | p50 (ms) | p95 (ms) | max (ms) | Burst span (ms) | Hits | Miss-query | Miss-wait | Miss-fallback | Invalid reasons |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `20261122T091044Z-plain-1` | 1 | plain | true | 200 | 200 | 1091.342 | 1995.993 | 2104.278 | 33.938 | 0 | 200 | 0 | 0 | — |
| `20261122T091052Z-coalesced-1` | 1 | coalesced | true | 1 | 1 | 31.647 | 39.255 | 40.893 | 8.659 | 0 | 1 | 199 | 0 | — |
| `20261122T091058Z-coalesced-2` | 2 | coalesced | true | 1 | 1 | 43.949 | 57.761 | 60.668 | 14.389 | 0 | 1 | 199 | 0 | — |
| `20261122T091104Z-plain-2` | 2 | plain | true | 200 | 200 | 1027.155 | 1820.438 | 1829.266 | 7.551 | 0 | 200 | 0 | 0 | — |
| `20261122T091112Z-plain-3` | 3 | plain | true | 200 | 200 | 880.202 | 1681.357 | 1782.931 | 11.8 | 0 | 200 | 0 | 0 | — |
| `20261122T091119Z-coalesced-3` | 3 | coalesced | true | 1 | 1 | 71.089 | 82.684 | 84.253 | 24.895 | 0 | 1 | 199 | 0 | — |
| `20261122T091126Z-plain-4` | 4 | plain | true | 200 | 200 | 1110.883 | 1910.431 | 1922.359 | 11.266 | 0 | 200 | 0 | 0 | — |
| `20261122T091133Z-coalesced-4` | 4 | coalesced | true | 1 | 1 | 31.243 | 39.381 | 40.303 | 11.852 | 0 | 1 | 199 | 0 | — |
| `20261122T091139Z-coalesced-5` | 5 | coalesced | true | 1 | 1 | 30.969 | 41.825 | 42.331 | 5.183 | 0 | 1 | 199 | 0 | — |
| `20261122T091146Z-plain-5` | 5 | plain | true | 200 | 200 | 840.404 | 1643.611 | 1743.464 | 7.754 | 0 | 200 | 0 | 0 | — |
