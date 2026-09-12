# Core architecture principles

These are the architectural rules that should remain stable unless a concrete feature, demonstrated bug class, or required platform change proves that a contract must change.

## Architecture stability policy

The foundational architecture reached its intended target in 0.1.180 and was explicitly user-regression-tested with A–F working perfectly. From this point, architecture stability is a product requirement, not an invitation for continued structural cleanup.

Normal future work should add behavior through the existing canonical owners, root-bound operation ports, single-writer state ownership, RuntimeDriver boundary, annotator request ownership and explicit bridge contracts. Do not refactor foundational architecture merely for aesthetics, smaller files, speculative abstraction, or because another organization could also work.

A foundational architecture change is permitted only when driven by a concrete need:

- a product feature cannot be implemented cleanly within current contracts;
- a demonstrated bug class proves that an ownership/identity/lifecycle/state/transport contract is wrong or incomplete;
- a required Obsidian/Electron/Chromium platform change invalidates an existing contract.

For any such change, first audit the full bug/assumption class and canonical owner, keep one canonical route, avoid parallel fallbacks, preserve fail-closed identity and established selection/coordinate semantics unless explicitly required, and extend verify so the revised contract is machine-enforced.

## Non-negotiable ownership rules

- One canonical owner for each mutable state field.
- Cross-feature work uses explicit root-bound operation ports rather than peer-feature addressing.
- Production identity and routing fail closed when ambiguous.
- Persisted Markdown/YAML/configuration is source of truth; RAM indexes and caches are derived state.
- Runtime adapters isolate Obsidian/Electron/Chromium-specific mechanisms from product ownership.
- New work extends existing canonical owners before introducing new parallel paths.
