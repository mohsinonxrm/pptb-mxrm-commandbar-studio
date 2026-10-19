## Summary

What changes and why. Link the issue: `Closes #123`, or `Part of #123` when manual checks
are still pending.

**Target branch** (see [RELEASING.md](../blob/dev/RELEASING.md) → *Where a fix goes*):
`dev` for new work; `release/X.Y` for a fix to the release being stabilized; `main`
(`hotfix/*`) for a fix to the current stable release.

## How it was tested

Commands run, and any live-org / PPTB verification (PPTB version and host: desktop app or
VS Code extension …).

- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass
- [ ] `npm run validate` and `npm run build` pass
- [ ] Tests added or updated for parser, XML generation, merge or publish changes
- [ ] `CHANGELOG.md` `[Unreleased]` updated (if user-facing); version **not** changed
- [ ] README feature docs updated (if behaviour changes)

### UI changes (if any)

- [ ] Reviewed with the maintainer before building (prototype or screenshots)
- [ ] Screenshots in **light and dark** themes
- [ ] Fluent UI v9 only; sentence case, "…" for ellipses

### Publishing changes (if any)

- [ ] Verified live: publish on a test table, then check the layer and the app's command bar
- [ ] The test table was restored afterwards

## Release-prep PRs only

- [ ] `npm version X.Y.Z[-beta.N] --no-git-tag-version`; `package.json` and the lockfile match
- [ ] `[Unreleased]` renamed to a dated `[X.Y.Z…]` section; `npm run version-badge` run
- [ ] Insider icon bundled for pre-releases (`dist/icons/icon.svg`)
