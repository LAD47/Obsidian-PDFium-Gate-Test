# Release procedure

This document is the authoritative release procedure for **PDFium Gate Test**.

The purpose of this procedure is to keep source transfer, Git history, generated runtime, frozen archives, and BRAT releases reproducible. Do not improvise a different upload path for normal releases.

## Release principles

- The local Git working copy is the controlled transfer point for project files.
- Do **not** bulk-upload or reconstruct a release by writing repository files one by one through a GitHub connector or web UI.
- The GitHub connector is useful for inspection and post-push verification, not for replacing the repository file tree.
- Canonical source lives under `src/`; generated runtime remains generated and committed as required by the existing build workflow.
- A release is not frozen until the `Build generated runtime` workflow has succeeded and `main` includes any generated-runtime commit produced by that workflow.
- `archive/<version>` is immutable release evidence. Never repoint or rewrite an existing archive branch.
- A GitHub/BRAT release is a release-distribution baseline. It becomes a user-confirmed runtime baseline only after explicit testing in Obsidian.


## Stable and test release channels — decided future policy

This section records a product/release decision that becomes mandatory before PDFium Gate is distributed to ordinary users through the Obsidian Community directory.

### Public product identity

The public product name is:

```text
PDFium Gate
```

The intended permanent Obsidian plugin ID is:

```text
pdfium-gate
```

The current pre-release/test identity (`PDFium Gate Test` / `obsidian-pdfium-gate-test`) is temporary. Do not change the plugin ID ad hoc. The identity change must be performed in a dedicated, controlled build with an audit of code, paths, settings, documentation, GitHub/release automation, and installation behavior.

After the public ID has been adopted, stable and test builds use the **same plugin ID**. Do not create a second installed plugin such as `pdfium-gate-beta`; two independently installed variants could compete for the same PDF integration and configuration.

### Two distribution channels

PDFium Gate will have two deliberately separate release channels:

**Stable channel**

- Distributed through the official Obsidian Community directory.
- Intended for ordinary users.
- Contains only releases that have completed the project's verification and explicit practical testing.
- Obsidian manages normal stable installation and updating.
- Stable releases are normal GitHub Releases, not prereleases.
- After public launch, the default branch manifest must represent the currently approved stable release and must not be advanced merely because a test build exists.

**Test channel**

- Distributed as GitHub prereleases from the same repository and the same codebase.
- Intended only for users who explicitly opt in to testing.
- Uses prerelease versions such as `1.1.0-beta.1`, `1.1.0-beta.2`, etc.
- Must not cause ordinary Community-directory users to receive test code.
- BRAT may remain useful during development, but it is **not a required dependency** of the long-term PDFium Gate test program.
- A test release may additionally provide a simple ZIP containing the installable plugin files so testers can install it manually.

Stable and test versions are alternative versions of the same plugin; they are not intended to run side by side.

### Test-program UI inside PDFium Gate

A future Settings section may expose a voluntary test-program surface, for example:

```text
Test program

Installed version:   1.0.0
Stable version:      1.0.0
Latest test version: 1.1.0-beta.3

[ View test version ]
```

The purpose of this UI is discovery and informed opt-in, not self-updating.

The plugin may:

- tell the user which version is installed;
- show the latest stable and test versions;
- explain that test builds may contain defects;
- recommend a complete Vault backup before testing;
- open the appropriate GitHub prerelease or installation instructions.

The Community-distributed plugin must **not download and replace its own executable plugin files or silently switch itself to a test build**. Installation/update of plugin code remains external to the running plugin and must respect Obsidian Community policies.

Any network access used only to discover release information must be documented transparently in the README and implemented conservatively.

### Test-release package

A test prerelease should expose the normal installable files:

```text
main.js
manifest.json
styles.css
```

It may also expose a convenience archive such as:

```text
pdfium-gate-1.1.0-beta.3.zip
```

containing those files at the ZIP root.

Manual test installation replaces the installed `pdfium-gate` plugin files and therefore requires an Obsidian/plugin restart as documented in the test instructions.

### Promotion from test to stable

A beta build does not become stable merely because CI is green.

Promotion requires:

1. repository verification succeeds;
2. the build has been explicitly tested in the target Obsidian environment;
3. required regression tests are accepted;
4. no known blocker remains for the release;
5. the exact stable candidate is frozen under `archive/<stable-version>`;
6. a normal (non-prerelease) GitHub Release is created with the approved stable version;
7. only then is the stable/default-branch manifest advanced for Community distribution.

This separation is intended to ensure that normal users receive only versions we have consciously approved, while volunteer testers can remain ahead of the stable channel.

### Returning from test to stable

Testers must always have a documented path back to the stable Community version. Because stable and test builds share the same plugin identity, returning to stable means replacing/removing the test installation and reinstalling or restoring the approved Community release according to the current documented procedure.

### Current 0.1.x development exception

The existing `0.1.x` line remains a pre-release development/test line. The current BRAT-oriented workflow may continue while the product is not yet in the Obsidian Community directory.

Before the first public Community release, the repository workflows and this document must be updated so that:

- test prereleases can advance without exposing them as stable Community updates;
- stable releases are explicitly promoted;
- the default branch and manifest follow the stable-channel rules above;
- the public identity is `PDFium Gate` / `pdfium-gate`.


## Standard local working copy

The normal Windows working copy is:

```text
C:\GitHub\Obsidian-PDFium-Gate-Test
```

It must be a normal Git clone of:

```text
https://github.com/LAD47/Obsidian-PDFium-Gate-Test.git
```

Before applying a new project ZIP, verify that the working copy is on `main`, up to date, and clean:

```powershell
cd C:\GitHub\Obsidian-PDFium-Gate-Test
git switch main
git pull --ff-only
git status
```

Do not replace project files while there are uncommitted changes.

## Applying a complete project ZIP

A complete project ZIP used for development handoff must:

- contain the project files at the ZIP root;
- exclude `.git`;
- exclude `node_modules`;
- exclude temporary build/download files that do not belong in the repository.

A complete ZIP represents the **entire intended project tree**, not only changed files.

### Important: remove stale files

Simply extracting a complete ZIP over the existing working copy is not sufficient. A file removed from the new version would otherwise remain on disk and could accidentally survive in Git.

After confirming that `git status` is clean, remove everything in the working copy **except `.git`**, then extract the complete ZIP into the working-copy root.

Example PowerShell, run only from the verified repository directory:

```powershell
cd C:\GitHub\Obsidian-PDFium-Gate-Test

if (git status --porcelain) {
    throw "Working tree is not clean. Stop before replacing files."
}

Get-ChildItem -Force |
    Where-Object { $_.Name -ne '.git' } |
    Remove-Item -Recurse -Force

Expand-Archive -Path "C:\path\to\obsidian-pdfium-gate-test-<version>.zip" -DestinationPath . -Force

git status
```

The `.git` directory must never be deleted, replaced, or included in the handoff ZIP.

For a deliberately small documentation-only patch ZIP, an overlay extraction is acceptable when the patch is explicitly labeled as a patch and no file deletion is intended.

## Review before commit

After applying the ZIP, inspect what Git sees:

```powershell
git status
git diff --stat
git diff
```

For a normal versioned build, verify that `manifest.json` and `package.json` contain the same intended version.

Run the complete local verification pipeline:

```powershell
npm run check
```

Do not commit if the check fails or if `git status` contains unexpected files.

## Commit and push to main

When the local tree and checks are correct:

```powershell
git add -A
git status
git commit -m "<version>: <short description>"
git push origin main
```

`git add -A` is intentional: it records additions, modifications, and deletions.

## Wait for generated-runtime verification

After pushing, GitHub Actions runs **Build generated runtime** for relevant source/build changes.

The workflow runs the repository verification pipeline and may create an additional commit containing updated generated runtime files (`main.js` and/or `main-bridge.js`).

Therefore:

1. Wait until **Build generated runtime** is green.
2. If the workflow created a generated-runtime commit, that commit is part of the release candidate.
3. Synchronize the local clone again before freezing the release:

```powershell
git pull --ff-only
git status
```

The working tree must be clean.

Never create `archive/<version>` from the pre-build commit when GitHub Actions has subsequently changed generated runtime.

## Freeze the archive branch

Read the version from `manifest.json` and verify that it also matches `package.json`.

Before creating the archive branch, check that it does not already exist:

```powershell
$version = node -p "require('./manifest.json').version"
git ls-remote --heads origin "refs/heads/archive/$version"
```

Expected result for a new release: **no output**.

If the archive branch already exists, stop and investigate. Do not overwrite it.

Create the frozen branch directly from the current verified `HEAD`:

```powershell
git push origin HEAD:refs/heads/archive/$version
```

This branch is the immutable source snapshot for that release.

## Publish the BRAT prerelease

Use GitHub Actions and run the workflow:

```text
Publish BRAT release
```

The publishing workflow must resolve the already-frozen `archive/<version>` branch and verify that its manifest version matches `main`.

The GitHub prerelease must target:

```text
archive/<version>
```

and contain these BRAT assets:

```text
main.js
manifest.json
styles.css
```

Do not manually assemble a BRAT release from unrelated local files.

## Post-publish verification

After publication, independently verify GitHub before calling the release complete:

- `main` contains the intended source commit and any generated-runtime commit;
- `manifest.json` and `package.json` report the intended version;
- the relevant GitHub Actions run is green;
- `archive/<version>` exists and points to the final verified commit;
- `archive/<version>/manifest.json` reports the intended version;
- GitHub prerelease/tag `<version>` exists;
- the prerelease targets `archive/<version>`;
- release assets include exactly the required BRAT files: `main.js`, `manifest.json`, and `styles.css`;
- the files on GitHub match the intended release content.

Only after these checks should the GitHub/BRAT publication be treated as complete.

## Runtime confirmation

GitHub/release verification and application verification are separate milestones.

A release may be described as a **clean GitHub/release baseline** after the checks above. It must not be described as a **user-confirmed working runtime baseline** until it has been explicitly tested in the target Obsidian environment.

## Recovery rule

If anything in the transfer, build, archive, or publish sequence is uncertain, stop before creating or changing a release. Return to the last known-good clean `main`, inspect `git status`, and repeat the documented procedure. Do not repair a release by ad-hoc per-file uploads.
