# Text normalization contract

`text-normalization.js` is the single compatibility boundary for representation differences between Chromium native `selectionText` and PDF.js `textContent` used by native Obsidian selection-link mapping.

Rules:
1. Chromium `selectionText` remains textual truth.
2. New mismatches are diagnosed before they are normalized.
3. A rule is activated only when its context can prove that mapping is safe.
4. Candidate characters stay inactive until a real PDF demonstrates the mismatch.
5. Core selection/link code must call this module rather than add ad-hoc character exceptions.

To add a future rule:
- capture the first mismatch with selection-link diagnostics;
- add or promote one catalog entry;
- implement the narrow resolver predicate;
- add a positive test and at least one negative/ambiguity test;
- regression-test native Obsidian link compatibility.
