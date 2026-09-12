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

## Future file-type extensibility and user-facing information models

PDF is the first supported content type, but it must not become an architectural assumption that prevents future support for other Chromium-renderable file types. Future candidates may include HTML/HTM, SVG, JPEG/JPG, PNG, WebP and AVIF. This is an extensibility premise, not a promise that those formats are currently supported.

The internal architecture should therefore evolve toward one file-type-neutral metadata foundation with type/profile-specific metadata definitions on top. File type answers how content is handled or rendered; the metadata profile answers which information is relevant to register about that content. These are separate concepts.

The user interface should deliberately hide this internal abstraction in normal use. Less-experienced users should not need to understand a common metadata architecture or a `metadata profile` concept in order to use the product. Instead, the product should present context-appropriate information models such as **Document information** for PDFs, **Web page information** for saved HTML pages and **Image information** for image formats. The underlying mechanisms may be shared while the visible terminology and fields remain natural for the content type.

The interaction model should stay consistent across file types: the information panel lives in a predictable place, edit/save behavior is consistent, and field widgets behave the same way. Consistency should come from workflow, not from forcing unrelated content types into the same visible field set.

Do not solve future extensibility by creating one large universal schema containing every possible field and hiding most of it by file type. Prefer separate metadata profiles that reuse common schema/validation/persistence machinery. Likewise, avoid type-prefixed user properties such as `pdf_sender` or `html_author` when the natural property name can be scoped by its profile and identified by a stable field UUID.

New foundational metadata work should therefore be file-type-neutral where practical, while PDF remains the first concrete product implementation. Do not build speculative HTML/image functionality merely because the architecture permits it; add new file types only as separate, concrete product work.

## Non-negotiable ownership rules

- One canonical owner for each mutable state field.
- Cross-feature work uses explicit root-bound operation ports rather than peer-feature addressing.
- Production identity and routing fail closed when ambiguous.
- Persisted Markdown/YAML/configuration is source of truth; RAM indexes and caches are derived state.
- Runtime adapters isolate Obsidian/Electron/Chromium-specific mechanisms from product ownership.
- New work extends existing canonical owners before introducing new parallel paths.
