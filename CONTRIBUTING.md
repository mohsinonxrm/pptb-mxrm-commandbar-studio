# Contributing to Command Bar Studio

Thanks for helping out! This file covers the local workflow. See
[SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## Workflow

1. Create a branch from `dev`: `feature/<issue>-short-slug` or `fix/<issue>-short-slug`.
2. Use [Conventional Commits](https://www.conventionalcommits.org/) style messages
   (`feat:`, `fix:`, `chore:` …).
3. Open a pull request into `dev`. CI must pass; PRs into `dev` are squash-merged. The
   release PR `dev → main` uses a **merge commit** (see [RELEASING.md](RELEASING.md)).

## Setup

```bash
npm ci            # installs from the committed package-lock.json
npm run typecheck # app + node configs + dev harness
npm run lint      # zero warnings allowed
npm test
npm run build
```

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
