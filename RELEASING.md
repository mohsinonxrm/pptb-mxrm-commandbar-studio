# Releasing Command Bar Studio

The npm package `@mohsinonxrm/pptb-commandbar-studio` is published by CI
(`.github/workflows/release.yml`) when a `v*` tag is pushed. Nobody runs `npm publish`
locally. The same process is used by FetchXML Studio and Dataverse Request Studio.

## Branches

| Branch | Holds | Tags | npm |
|---|---|---|---|
| `main` | The current **stable** release, plus hotfixes | `vX.Y.Z` | `latest` |
| `release/X.Y` | The next minor release while it **stabilizes**; exists from the feature freeze until `X.Y.0` ships | `vX.Y.0-beta.N`, `vX.Y.0-rc.N` | `beta` |
| `dev` | Development of the release after that; **never frozen** | none | — |
| `support/X.Y` | Critical fixes for the previous minor release; created only when needed (see *Supported versions*) | `vX.Y.Z` | `support-X.Y` |

- Work happens on branches cut from `dev`, merged into `dev` by PR (squash is fine).
- Merges **between** long-lived branches (`main`, `release/*`, `support/*`, `dev`) always
  use a **merge commit**, so history is shared and fixes are never lost.
- CI (`ci.yml`) runs on every PR and on pushes to `dev`, `main`, `release/**` and
  `support/**`. A ruleset on those branches requires PRs and the `check` status.

## Every PR

- Add your user-facing changes under `## [Unreleased]` in `CHANGELOG.md`, and update the
  README's feature docs if behaviour changes.
- Don't change the version: it's set when a release is cut. That keeps PRs independent,
  so they can merge in any order.
- Put `Closes #N` in the PR description. PRs into `dev` close the issue on merge. For PRs
  into `main`, `release/*` or `support/*`, the issue closes when the squash commit (which
  includes the description) reaches `dev` through the forward merge.

## Where a fix goes

**Fix on the oldest supported branch that has the bug, then merge forward:**
`support/X.Y` → `main` → `release/X.Y` → `dev`. Never copy a fix backwards from `dev`.

| The bug exists in | Fix PR into | Release | Then merge forward |
|---|---|---|---|
| The current stable release (and later) | `hotfix/X.Y.Z` → `main` | tag `vX.Y.Z` on `main` → `latest` | `main` → `release/*` (if open) → `dev` |
| Only the release being stabilized | `release/X.Y` | tag `vX.Y.0-beta.N` → `beta` | `release/X.Y` → `dev` |
| Only `dev` | `dev` | with the next release | — |
| The previous minor only (support window) | `support/X.Y` | tag `vX.Y.Z` → `support-X.Y` | to `main` if it applies there too |

When a forward merge conflicts badly because the code has moved on, re-apply the fix on
the newer branch in a small companion PR instead.

**Resolving forward-merge conflicts** in `CHANGELOG.md`, `package.json`, `package-lock.json`
and `assets/badges/version.svg`: keep the **higher** of the two versions (semver), with its lock
fields and badge, and the target branch's own `[Unreleased]` entries on top (drop any that the
incoming dated section already lists); add the incoming dated sections in version order, highest
first. So the newest dated section is always the branch's version, which `check-release.mjs`
checks. For example, a `0.9.1` hotfix merged into `dev` at `0.9.0` makes `dev` `0.9.1`; merged
into `dev` at `0.10.0-beta.2`, `dev` stays `0.10.0-beta.2` with `[0.9.1]` below its section.

## Every release: what changes

Each release-prep PR (beta, rc, stable, hotfix or support) changes exactly these, and nothing
else needs a manual edit:

| What | How | Checked by |
|---|---|---|
| **Version** (semver: `X.Y.Z`, `X.Y.Z-beta.N` or `X.Y.Z-rc.N`) in `package.json` and `package-lock.json` | `npm version X.Y.Z[-beta.N] --no-git-tag-version` updates both | `check-release.mjs` (CI and `release.yml`); the tag must match too |
| **CHANGELOG** | Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` and add an empty `## [Unreleased]` above it | `check-release.mjs`: the newest section is the version, dated, with entries |
| **Version badge** (`assets/badges/version.svg`) | `npm run version-badge` | `check-release.mjs`: the file is what the script writes for the version |
| **Icon** | Nothing to do: the build bundles the gold Insider icon for `-beta.N` / `-rc.N` and the release icon for `X.Y.Z` | `check-release.mjs --dist` compares `dist/icons/icon.svg` with the right source |
| **npm package** | Published by `release.yml` on the tag, with provenance, to `beta`, `latest` or `support-X.Y` | `release.yml` |
| **GitHub Release** | Created by `release.yml` on the tag: pre-release for betas, latest for stable on `main`. Its notes are the channel, the PPTB requirement and the CHANGELOG section, then GitHub's PR list | `release.yml` |

CI runs `check-release.mjs` on every PR and on pushes to `dev`, `main`, `release/**` and
`support/**`, so a release-prep PR that misses one of them fails before it merges; on other PRs
it confirms the branch is still consistent (#246).

Branches cut before the check existed run the workflow of their own commit: they get neither
the check nor the notes from the CHANGELOG. Check those by hand against this table, and paste
the CHANGELOG section into the GitHub Release after it's created.

## Release lifecycle

### 1. Feature freeze: cut the release branch

Once the release's scope is in `dev`:

```bash
git switch dev && git pull && git switch -c release/0.6 && git push -u origin release/0.6
```

`dev` carries on with the next release straight away.

### 2. Betas (from `release/X.Y`)

1. On a branch from `release/0.6` (e.g. `release/0.6.0-beta.2`):
   - `npm version 0.6.0-beta.2 --no-git-tag-version`
   - in `CHANGELOG.md`, rename `## [Unreleased]` to `## [0.6.0-beta.2] - YYYY-MM-DD` and
     add a new empty `## [Unreleased]` above it
   - `npm run version-badge` (rewrites `assets/badges/version.svg` from `package.json`)

   and PR it into `release/0.6` (see *Every release: what changes*).
2. Tag the PR's merge commit on `release/0.6`:
   `git switch release/0.6 && git pull && git tag v0.6.0-beta.2 && git push origin v0.6.0-beta.2`.
3. Run *After every release* (below), then merge `release/0.6` into `dev` with a PR
   (`merge/release-0.6-into-dev`, merge commit) so `dev` has the fixes.

`-beta.N` and `-rc.N` publish to the npm `beta` tag as a GitHub pre-release; `latest`
doesn't change. The build bundles the gold Insider icon for pre-releases.

### 3. Stabilizing (beta → stable)

Before promoting a beta to `latest`:

1. **Milestone clear:** every issue in the milestone is closed or moved.
2. **Smoke test** the latest beta, installed from npm, in the PPTB version the tool
   targets (`minAPI`), in the **desktop app and the VS Code extension**. Run the manual
   checks the tracking issue lists, including a publish on a test table.
3. **Soak:** 7 days with no new P0/P1 bug against the latest beta. Each fix ships as a
   new `beta.N`, and the clock restarts.
4. **Health:** CI green on `release/X.Y`; `npm audit --omit=dev --audit-level=high`
   reports 0.

### 4. Stable release (to `main`)

1. Release-prep PR into `release/0.6`: `npm version 0.6.0 --no-git-tag-version`, a
   `[0.6.0]` CHANGELOG section that summarises the betas above their history, and
   `npm run version-badge`.
2. PR `release/0.6` → `main`, merged with a merge commit.
3. Tag the merge commit on `main`: `git switch main && git pull && git tag v0.6.0 && git push origin v0.6.0`.
4. Run *After every release*, then merge `main` into `dev` (merge commit) and delete
   `release/0.6`.

## Hotfixes (to the current stable release)

1. Branch `hotfix/0.6.1` from `main`; fix, set the version (`0.6.1`), date its CHANGELOG
   section, run `npm run version-badge`; PR into `main` (merge commit).
2. Tag `v0.6.1` on `main` → npm `latest`, then run *After every release*.
3. Merge `main` forward into `release/*` (if one is open) and `dev`, keeping the higher version
   (*Resolving forward-merge conflicts*) and each target's `[Unreleased]` entries.

## Supported versions

- **The current stable release** (`main`) gets fixes as hotfixes.
- **The previous minor release** gets **critical and security fixes for 30 days** after
  the next minor ships, **only when the next minor requires a newer PPTB** (decided
  2026-10-27). Otherwise users can always update, and the previous minor is deprecated when
  the next one ships. When such a fix is needed, create `support/X.Y` from its last tag
  (e.g. `git switch -c support/X.Y vX.Y.Z && git push -u origin support/X.Y`),
  PR the fix into it, bump the patch version, and tag `vX.Y.Z` there. It publishes to the npm
  `support-X.Y` tag, never `latest`, and isn't marked as the latest GitHub Release.
- **0.5.x is end of life** (decided 2026-10-22): every version before 0.6.2 is deprecated on
  npm, since they bundle DOMPurify 3.2.7 (critical advisories), and 0.5.x gets no `support/0.5`
  line. Users on PPTB before 1.2.7 need to update PPTB to use 0.6.2 or later.
- **0.6.x is end of life at 0.7.0** (decided 2026-10-24): 0.6.2 is deprecated on npm and gets
  no `support/0.6` line, since 0.7.0 needs the same PPTB (1.2.7).
- **0.7.x is end of life at 0.8.0** (decided 2026-10-27): 0.7.0 is deprecated on npm and gets
  no `support/0.7` line, since 0.8.0 needs the same PPTB (1.2.7).
- Older versions aren't supported. `SECURITY.md` lists the supported versions.

## Milestones and tracking

- Each release has a milestone (`v0.6.0`, `v0.6.1`). It's the release that **ships** the
  change, and its closed issues are the list of what the release contains. Close issues
  as they're done; that doesn't lose track of them.
- What each beta contains is its `[X.Y.Z-beta.N]` CHANGELOG section and its GitHub
  pre-release notes.
- A **"Release X.Y.Z" tracking issue** in the minor release's milestone holds the
  stabilizing checklist. The milestone closes when the stable release ships.

## What `release.yml` does

Checks the tag matches `package.json` and chooses the channel from the version and the
tagged commit:

| Tag | Tagged commit must be on | npm tag | GitHub Release |
|---|---|---|---|
| `vX.Y.Z-beta.N`, `vX.Y.Z-rc.N` | any branch (normally `release/X.Y`) | `beta` | pre-release |
| `vX.Y.Z` | `support/X.Y` | `support-X.Y` | not marked latest |
| `vX.Y.Z` | `main`, with `X.Y` = main's own version line | `latest` | latest |

`support/X.Y` is checked first: it merges forward into `main`, so an older line's commit can
be on `main` too, and it must never move `latest` back.

Any other tag fails before publishing. The GitHub Release notes are built from the CHANGELOG
section (`check-release.mjs --notes`); edit the release afterwards only to add context, such as
how a fix was verified or a known issue.

It runs in separate jobs, so the code that installs and runs dependencies never holds
publishing rights (#250, as FetchXML Studio #188):

| Job | Runs on | Permissions | What it does |
|---|---|---|---|
| `build` | always | read the repository | Checks the tag and chooses the channel; checks the release metadata (`check-release.mjs`); `npm ci --ignore-scripts` (no cache); the runtime audit, typecheck, lint, tests, validation, build, the bundled icon, the DOMPurify check; writes the release notes (previewed in the run summary); packs the tarball and checks its contents. |
| `publish` | tag push only | npm OIDC token (`id-token: write`) | Installs no project dependencies: downloads the tarball and publishes it with provenance. |
| `rehearse` | manual run only | none | `npm publish --dry-run` of the tarball, without provenance or an npm token. |
| `github-release` | tag push only | write the repository | Creates the GitHub Release with the notes `build` wrote. |

Node (24.22.0), npm (11.21.1) and the actions (by full commit SHA, the tag in a comment) are
pinned to versions at least 14 days old. Dependabot proposes newer actions on `dev`; other
branches get them when `dev` reaches them through a release. Move the Node and npm pins by
hand. Only one release run per ref runs at a time. If a run fails after publishing, use
*Re-run failed jobs*: a full re-run stops at `publish`, since npm never accepts a version twice.

**Rehearse a release** after the version bump and before the tag, on a branch whose workflow
changed: `gh workflow run release.yml --ref <branch>` (or Actions → *Release* → *Run workflow*
once the default branch has the manual trigger). It runs every check and `npm publish
--dry-run`, and creates no GitHub Release. A stable or hotfix version that isn't on `main` yet
is rehearsed as the channel its tag will get (`latest`, or `support-X.Y` when that branch
exists), with a warning; the tag push still decides the channel. npm's dry run refuses a version that's already
published, so on an unbumped branch the rehearsal stops with a notice after the checks. It
doesn't exercise the npm token exchange or provenance signing. A manual run never publishes,
even on a tag.

## After every release

1. **npm:** `npm view @mohsinonxrm/pptb-commandbar-studio dist-tags` shows the new version on
   its tag. The registry can take a few minutes to show it after the run.
2. **Icon:** unpack the published tarball (`npm pack @mohsinonxrm/pptb-commandbar-studio@X.Y.Z`,
   then `tar -xzf *.tgz`, in an empty folder) and compare `package/dist/icons/icon.svg` with
   `icons/icon-insider.svg` (betas) or `icons/icon.svg`.
3. **GitHub Release:** add any context the CHANGELOG doesn't carry.
4. **Tracking issue:** comment on the release's tracking issue (the soak restarts with each beta).
5. **Forward merge** into the newer branches (*Where a fix goes*).
6. **Deprecate** the version it replaces (the previous beta, or the previous patch). The owner
   runs it, since npm asks for 2FA, with the message used so far, e.g.
   `npm deprecate @mohsinonxrm/pptb-commandbar-studio@0.8.0-beta.1 "Pre-release superseded by 0.8.0. Install the latest version instead."`
7. **Milestone:** close it when its stable release ships.

## Tool icon and README images

- The tool icon is bundled at `dist/icons/icon.svg` by the `cbs-tool-icon` plugin in
  `vite.config.ts` (PPTB resolves `package.json` `icon` relative to `dist/`). Versions
  with a pre-release part get `icons/icon-insider.svg`, others `icons/icon.svg`.
- PPTB shows the README in its main window, whose CSP only allows images from GitHub
  and `*.githubusercontent.com`, and escapes raw HTML. Keep README images as files in
  the repo (badges live in `assets/badges/`) referenced by absolute
  `raw.githubusercontent.com/.../refs/heads/main/...` URLs, and don't use
  `img.shields.io` or HTML tags. The version badge is generated
  (`npm run version-badge`); update the other badge SVGs by hand when the versions they
  show change.

## One-time setup

- **npm trusted publisher**: npmjs.com → package → *Settings* → *Trusted publishing* →
  *GitHub Actions*: user `mohsinonxrm`, repository `pptb-mxrm-commandbar-studio`,
  workflow `release.yml`, no environment, *Allow npm publish*. No npm token is needed.
- `repository.url` in `package.json` must point at this GitHub repository, or provenance
  and trusted publishing fail.
- A ruleset on `dev`, `main`, `release/**` and `support/**` requiring PRs and the `check`
  status.
- Repository *Settings* → *Pull Requests* → squash merging → default commit message
  **"Pull request title and description"**, so `Closes #N` travels with the commit.
