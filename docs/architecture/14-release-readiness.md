# Release readiness and public versioning

This document records release-governance decisions that must be stable before the first public beta. It does not change runtime behavior.

## Public version sequence

Internal `0.1.x` builds remain development history. The planned public sequence is:

- `0.9.0`, `0.9.1`, ... — Beta releases;
- `0.99.0`, `0.99.1`, ... — Release Candidate phase;
- `1.0.0` — first stable release;
- after 1.0: patch for compatible bug fixes, minor for compatible features, major for intentionally incompatible changes.

`manifest.json` and the GitHub release/tag use the same plain `x.y.z` version. Beta/Release Candidate is expressed as release status/name rather than adding a prerelease suffix to the manifest version.

## Persisted-format review before public release

Before public/live release, any change to persisted formats, file layouts, configuration structures, IDs, or other user-data representations requires an explicit migration/backward-compatibility review. Pre-release test data may be destructively changed only while that test-phase policy remains explicitly in force.

## Distribution direction

GitHub Releases are the intended test/public artifact channel. During private beta, BRAT may be used for test installation/update workflows. Final plugin name, plugin ID, author metadata, license and Community Plugins submission details must be frozen before the first public beta.
