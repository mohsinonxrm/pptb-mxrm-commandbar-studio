# Releasing Command Bar Studio

The npm package `@mohsinonxrm/pptb-commandbar-studio` is published by CI
(`.github/workflows/release.yml`) when a `v*` tag is pushed. Nobody runs `npm publish`
locally.

## Branches

- Work happens on branches cut from `dev` and squash-merged into `dev` by PR.
- A release is a PR from `dev` into `main`. Merge it with a **merge commit**, so `main`
  and `dev` keep the same history.
- CI (`ci.yml`) runs on every PR and on pushes to `dev` and `main`.

## Cutting a release

1. On a branch from `dev`, set the version and date the changelog:

   ```bash
   npm version 0.6.0 --no-git-tag-version          # or e.g. 0.6.0-beta.1
   ```

   In `CHANGELOG.md`, rename `## [Unreleased]` to `## [0.6.0] - YYYY-MM-DD` and add a
   new empty `## [Unreleased]` above it. Open a PR into `dev`.

2. Open the release PR `dev → main` and merge it with a merge commit.

3. Tag the merge commit on `main` and push the tag:

   ```bash
   git switch main && git pull
   git tag v0.6.0 && git push origin v0.6.0
   ```

4. `release.yml` checks that the tag matches `package.json`, runs the tests, validation
   and build, publishes to npm, and creates the GitHub Release. Versions with a
   pre-release part (`-beta.1`) go to the `beta` npm tag and are marked as pre-releases;
   everything else goes to `latest`.

## One-time setup

- **npm trusted publisher**: on npmjs.com → package → *Settings* → *Trusted publishing*
  → *GitHub Actions*: user `mohsinonxrm`, repository `pptb-mxrm-commandbar-studio`,
  workflow `release.yml`. No npm token is needed.
- `repository.url` in `package.json` must point at this GitHub repository, or
  provenance and trusted publishing fail.

## Tool icon and README images

- The tool icon is bundled at `dist/icons/icon.svg` by the `cbs-tool-icon` plugin in
  `vite.config.ts` (PPTB resolves `package.json` `icon` relative to `dist/`). Versions
  with a pre-release part get `icons/icon-insider.svg`, others `icons/icon.svg`.
- PPTB shows the README in its main window, whose CSP only allows images from GitHub
  and `*.githubusercontent.com`, and escapes raw HTML. Keep README images as files in
  the repo (badges live in `assets/badges/`) referenced by absolute
  `raw.githubusercontent.com/.../refs/heads/main/...` URLs, and don't use
  `img.shields.io` or HTML tags. Update the badge SVGs when the versions they show change.
