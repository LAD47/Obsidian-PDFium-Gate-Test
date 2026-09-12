# Testing, verification and benchmark boundaries

Machine-enforced contracts are part of the architecture. Verification should prefer behavior simulation where practical and source-pattern gates where single-owner/forbidden-pattern invariants are the subject.

## Verify philosophy and architecture completion

`scripts/verify/contracts/` is organized by architectural/runtime contracts.

Important gates include:

- structure/source-of-truth;
- runtime input routing;
- selection/output behavior;
- RuntimeDriver ownership and coordinate contracts;
- identity/locator fail-closed behavior;
- deterministic release build/root-only load;
- startup/restored-wrapper lifecycle simulation;
- explicit production dataflow and single annotator transport;
- renderer feature/port/state ownership;
- Main Bridge feature/port/state ownership;
- annotator request-handler/dependency ownership;
- final architecture-completion gate.

When behavior can be tested through input → output/runtime simulation, prefer that over brittle source-text matching. Source-text gates remain appropriate for forbidden architecture patterns and single-owner invariants.

`11-architecture-completion.js` makes the structural target machine-enforced. It requires simultaneously:

- renderer hidden cross-feature calls = 0;
- renderer shared mutable-state writers = 0;
- renderer implementation dependency cycles = 0;
- Main Bridge hidden cross-feature calls = 0;
- Main Bridge shared state writers = 0;
- Main Bridge implementation dependency cycles = 0;
- annotator hidden cross-handler calls = 0;
- annotator runtime transport listener owners = 1;
- keyboard navigation algorithm modules = 3;
- keyboard request handler remains below its architecture regression ceiling.

## Benchmark / instrumentation boundary

Scale testing is intentionally isolated from product ownership.

`MetadataBenchmarkFeature` owns only benchmark fixture generation, reporting UI and cleanup. It does not write or update ordinary document records through an alternate product persistence path. Generated fixture records are serialized with the canonical metadata record contract and placed in the same visible/indexed Markdown record layout as normal records so the stress test exercises the real storage shape.

`DocumentRecordsFeature` remains the sole owner of RAM-index mutation. Benchmark instrumentation therefore enters through explicit operations:

- `setDocumentRecordBenchmarkEventSuppression(enabled)`
- `runDocumentRecordIndexBenchmark()`

Cold/full rebuild timing is recorded by the existing `rebuildDocumentRecordIndex()` owner. The benchmark feature never clears or mutates `documentRecords` state directly.

Bulk fixture generation uses direct filesystem writes solely to avoid turning 10k–100k fixture creation events into the benchmark itself. Marked benchmark UUIDs and the dedicated `PDFium Benchmark/` PDF root allow lifecycle suppression to be scoped to benchmark fixtures. Suppression is reset naturally by plugin restart. Measurement must be performed after restart so Obsidian has discovered the files and the canonical cold index is built from disk.

Cleanup is fail-closed: the dedicated root is only recursively removed when a valid benchmark manifest marker is present, and metadata record deletion uses deterministic benchmark UUID paths. Ordinary `PDF Metadata` records are never selected by root-wide deletion.

The benchmark layer must remain removable without changing record format, schema, DocumentInfo, Bases editing, PDF identity, RuntimeDriver, selection or annotation behavior.

## Documentation integrity gate

`scripts/check-architecture-docs.js` verifies that the root architecture index links to the complete canonical document set and that every linked Markdown file exists. It is part of `npm run check`. This gate protects documentation navigation only; it does not replace runtime architecture verification.
