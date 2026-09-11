# 0.1.203 — metadata-resolved + layout-ready + idle cached startup benchmark

Use the existing 10,000-record dataset and existing 0.1.201 cache. Install 0.1.203 and fully restart Obsidian. Run `PDF: Benchmark — kjør metadata-benchmark`.

Expected warm-cache correctness:

- `previousBuild.reason`: `cold-start-idle` (unless a user action demanded metadata first)
- `startupScheduleMode`: `idle-after-layout-ready+metadata-resolved`
- `startupGateOrder`: either `metadata-resolved>layout-ready` or `layout-ready>metadata-resolved`
- `cacheHits`: 10000
- `cacheMisses`: 0
- `diskReadParseMs`: 0
- ambiguity/invalid counts: 0

Repeat at least two full restarts. The purpose is to see whether the cache-load time is more stable than 0.1.202 when the first idle callback happened unusually early. Also test immediate DocumentInfo after restart: on-demand readiness must work even if the startup gate has not completed.

