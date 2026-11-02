# Contributing to Command Bar Studio

Thanks for helping. This guide covers setup, the branch and PR workflow, what a PR needs
before it can merge, and the dev harness. Releases are described in
[RELEASING.md](RELEASING.md). The workflow is the same as in FetchXML Studio and Dataverse
Request Studio.

## Prerequisites

- **Node.js 22 or later** (`engines` in `package.json`; CI uses Node 24) and npm.
- **Power Platform ToolBox 1.2.7 or later** to run the tool for real (`minAPI` 1.2.7), in
  the desktop app or the VS Code extension.
- For the dev harness: the **Azure CLI** (`az login`) and a Dataverse **development** org.

## Setup

```bash
npm ci                 # exact versions from package-lock.json
npm run dev            # Vite dev server (no Dataverse)
npm run dev:harness    # the real UI in a browser against a live org; see below
```

Before opening a PR, run what CI runs:

```bash
npm run typecheck      # app + node configs + dev harness
npm run lint           # zero warnings
npm test               # or npm run test:coverage, as CI does
npm run validate       # PPTB manifest rules
npm run build
```

CI also fails on any **moderate, high or critical** `npm audit --omit=dev` finding, checks
the formatting (`npm run format:check`) and the package contents
(`.github/scripts/check-pack.mjs`), and checks that the version, `package-lock.json`, the
CHANGELOG section, the version badge and the bundled icon agree
(`node .github/scripts/check-release.mjs`, then `--dist` after the build). CI installs with
`npm ci --ignore-scripts`.

To try a build inside PPTB, load the repository folder as a local tool after
`npm run build`.

## Branches and PRs

- Branch from `dev`: `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<issue>-<slug>`
  or `docs/<issue>-<slug>`.
- Open the PR into `dev`. A fix for the release being stabilized goes into `release/X.Y`,
  and a fix for the current stable release goes into `main` as a `hotfix/*` branch. See
  [RELEASING.md](RELEASING.md) → *Where a fix goes*.
- Link the issue in the description: `Closes #123`, or `Part of #123` while manual checks
  are pending.
- The `check` status must pass. PRs into `dev` are squash-merged; merges between
  long-lived branches use a merge commit.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.

## What every PR includes

- **CHANGELOG:** user-facing changes go under `## [Unreleased]` in `CHANGELOG.md`, in the
  section that fits: `### ✨ Added`, `### 🔧 Changed`, `### 🔧 Fixed` or
  `### 🏗️ Technical`.
- **No version change.** The version, the README version badge and the dated CHANGELOG
  section change only in release-prep PRs, so PRs stay independent.
- **README:** update the feature docs when behaviour changes.
- **Tests:** unit tests for changes to parsing, XML generation, the publish merge or
  validation.

## Product rules

- **Ground behaviour in Microsoft Learn, then verify it live.** Cite the Learn page in the
  code or PR. When the docs and Dataverse disagree, Dataverse's actual behaviour wins, and
  the PR says what was verified and how.
- **Publishing keeps what's already there.** A publish writes the table's complete ribbon
  customization (what is published plus the session's changes) and verifies the result.
  Changes to publishing are verified live on a test table, and the table is restored.
- **Both hosts.** The tool runs in the PPTB desktop app and the VS Code extension. Use
  Dataverse requests that behave the same in both (see `publishService.ts` and
  `ribbonService.ts`).

## UI changes

- **Agree on the design first.** Share a prototype or screenshots in the issue before
  building.
- **Fluent UI v9 only** (`@fluentui/react-components`), following the PPTB theme in light
  and dark. PR screenshots show both themes.
- **Wording:** sentence case and "…" for ellipses. The same wording is shared with
  FetchXML Studio and Dataverse Request Studio.

## Dependencies

- Prefer the platform and existing dependencies. New dependencies need a reason in the PR.
- **Only versions published at least 14 days ago.** Dependabot's cooldown applies the same
  rule to its version updates.
- After changing dependencies, run `npm install` and commit `package-lock.json`.

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md). Never commit tokens,
org URLs with credentials, or `.env.local`.

## Running against a live org (dev harness)

`npm run dev` opens CBS in a plain browser tab, but there is no PPTB host there, so
every Dataverse call fails. The **dev harness** runs the real UI against a live
Dataverse environment instead. Use it for end-to-end checks (load solution → edit →
publish → verify in the app), screenshots, or Playwright-style automation.

### How it works

- `dev/harness/index.html` is a separate dev-only entry page. It loads
  `dev/harness/pptbStub.ts` first, which installs stand-ins for `window.toolboxAPI` and
  `window.dataverseAPI`, and then loads `/src/main.tsx` unchanged.
- The `dataverseAPI` stub (`dev/harness/dataverseStub.ts`) shapes requests the same way
  PPTB's host does (desktop-app v1.2.7, `dataverseManager.ts`):
  - entity-set pluralization for `retrieve` / `create` / `update`
  - `execute()` URLs and function parameter aliases, with enum literals such as
    `Microsoft.Dynamics.CRM.RibbonLocationFilters'All'` passed unquoted
  - `deploySolution` → `ImportSolution`
  - `publishCustomizations` → `PublishXml` / `PublishAllXml`

  (CBS itself sends ImportSolution / PublishXml through `execute()` and RetrieveEntityRibbon
  through `queryData()`, so the requests are the same in the desktop app and the VS Code
  extension, whose helpers differ.)
  - `getImportJobStatus` → `importjobs(id)`
- The stub sends requests to `/__dv/*` on the Vite dev server. A dev-server middleware
  (`dev/harness/vite-plugin-dataverse-proxy.ts`) forwards them to
  `<org>/api/data/v9.2/*` and adds a bearer token from the Azure CLI. **The token stays in
  the Node process.** It is never sent to the browser, never logged, and never written
  to disk. It is cached in memory and refreshed about 5 minutes before it expires.
- The proxy only runs under `vite serve`, and only when `CBS_HARNESS_ORG` is set. It
  refuses to start if the dev server is bound to anything other than localhost. It only
  answers loopback requests that carry the harness header and a localhost `Origin` /
  `Host`, and it only forwards to the org's `/api/data/v9.2/` path.
- Nothing under `dev/` is part of `vite build`, the `tsc -b` app build, or the npm
  package.

### Run it

1. Install the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) and
   sign in with an account that has access to the environment (use a **development**
   environment, because publishing changes the org's ribbon):

   ```bash
   az login                       # add --tenant <tenant-id> if you have several tenants
   az account get-access-token --resource https://<org>.crm.dynamics.com  # sanity check
   ```

2. Start the harness with the org URL:

   ```bash
   # bash / zsh
   CBS_HARNESS_ORG=https://<org>.crm.dynamics.com npm run dev:harness
   ```

   ```powershell
   # PowerShell
   $env:CBS_HARNESS_ORG = "https://<org>.crm.dynamics.com"; npm run dev:harness
   ```

   ```bat
   :: cmd.exe
   set CBS_HARNESS_ORG=https://<org>.crm.dynamics.com&& npm run dev:harness
   ```

   This opens `http://localhost:5173/dev/harness/`. The terminal logs each proxied call:
   method, path, status and duration only.

3. Optional: append `?theme=dark` or `?theme=light` to force the host theme. Otherwise
   it follows `prefers-color-scheme`.

### Limits

- The stub implements only the host APIs that CBS uses. Anything else is `undefined`.
- `openInConnectionBrowser` opens a normal new tab, so you may need to sign in there.
- `showNotification` writes to the browser console.
- This doesn't replace testing inside PPTB itself. A final smoke test in PPTB is still
  required before a release.

| Variable          | Required | Description                                                                 |
| ----------------- | -------- | --------------------------------------------------------------------------- |
| `CBS_HARNESS_ORG` | yes      | Org URL, e.g. `https://contoso.crm.dynamics.com`. Enables the `/__dv` proxy. |
