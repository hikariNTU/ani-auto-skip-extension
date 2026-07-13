# AGENTS.md

## Build
```bash
npm run build      # compiles src/ (TS) -> dist/
npm run dev        # watch mode, auto-reloads unpacked extension
npm run typecheck  # tsc --noEmit
```
Load `dist/` (not `src/`) as the unpacked extension in Chrome.

## Pack
```bash
npm run build        # dist/ must be up to date first
npm run pack:windows  # or
npm run pack:linux
```
Zips `dist/` into `dist.zip`.

## Bump version
```bash
npm run bump patch   # or minor / major
```
Syncs version across `package.json`, `package-lock.json`, and `src/manifest.json`.

## CI/CD
`.github/workflows/release.yml` runs on every push to `main`:
1. `npm run build` then `npm run pack:linux` → `dist.zip`
2. Reads `version` from `package.json`; if tag `vX.Y.Z` doesn't exist yet, creates a GitHub Release tagged `vX.Y.Z` with auto-generated release notes (commit history since last release) and `dist.zip` attached.

So: bump the version and merge to `main` to cut a release. Pushes with no version change are a no-op (tag already exists).

Web store upload step: not yet added — TBD.
