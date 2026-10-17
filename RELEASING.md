# Releasing Command Bar Studio

The npm package `@mohsinonxrm/pptb-commandbar-studio` is published **only by CI**
(`.github/workflows/release.yml`), from a `vX.Y.Z[-beta.N]` tag on `main`. Nobody runs
`npm publish` from a laptop.

## Branch flow

```
feature/<issue>-slug ─┐
fix/<issue>-slug ─────┼─► PR → dev (merge commit)
chore/... ────────────┘
                              dev ─► release PR → main (merge commit, NOT squash)
                                                   │
                                                   └─► tag vX.Y.Z on main ─► release.yml
```

- All work happens on branches cut from `dev`, and each branch is merged into `dev` by PR
  with a **merge commit**.
- A release is a PR from `dev` into `main`, also merged with a **merge commit**. Never
  use squash or rebase here, because that makes the histories of `main` and `dev` diverge.
- CI (`ci.yml`) runs on every PR into `dev` / `main` and on every push to `dev`.

## Cutting a release

1. **Bump the version and the CHANGELOG on `dev`** (through a PR, since `dev` is
   protected):

   ```bash
   git switch dev && git pull
   git switch -c chore/release-v0.6.0
   npm run release            # asks for the increment; or: npx release-it 0.6.0
   # pre-release:  npm run release:pre   → e.g. 0.6.0-beta.0, 0.6.0-beta.1, …
   git push -u origin chore/release-v0.6.0
   gh pr create --base dev --title "chore(release): v0.6.0"
   ```

   `release-it` (configured in `.release-it.json`) only does the following:
   - bumps `version` in `package.json` and `package-lock.json`
   - turns the `## [Unreleased]` section of `CHANGELOG.md` into
     `## [0.6.0] - YYYY-MM-DD`, using `@release-it/keep-a-changelog`, and adds a new empty
     `Unreleased` section
   - commits the result as `chore(release): v0.6.0`

   It does **not** tag, push, publish to npm or create a GitHub Release. CI does those
   from `main`.

   > `npm run release:dry` previews the changelog. It still runs `npm version` (a
   > release-it quirk), so run `git restore package.json package-lock.json` afterwards.

2. **Open the release PR** `dev → main` and merge it with a **merge commit** once CI is
   green.

3. **Tag the merge commit on `main`** and push the tag:

   ```bash
   git switch main && git pull
   git tag -a v0.6.0 -m "v0.6.0"
   git push origin v0.6.0
   ```

4. **`release.yml` takes over**. It:
   - checks that the tag is `vX.Y.Z[-pre]`, that the tagged commit is reachable from
     `main`, and that the tag equals `v` + `package.json` version
   - checks that `CHANGELOG.md` has a `## [X.Y.Z]` section, which becomes the release
     notes
   - runs `npm ci`, the tests, `pptb-validate`, the build, and a package contents/size
     check
   - runs `npm publish --provenance --access public` through **npm trusted publishing**
     (OIDC, no `NPM_TOKEN`). Versions with a pre-release identifier (`-beta.N`, `-rc.N`, …)
     are published with `--tag beta`; everything else goes to `latest`
   - runs `gh release create vX.Y.Z` with the CHANGELOG section as the notes, marked as a
     pre-release for pre-release versions

   If a run fails after publishing, re-run it, or use **Actions → Release → Run
   workflow** with the tag. Steps that already finished (npm publish, GitHub Release)
   are skipped.

5. **Bring `main` back into `dev`** if `main` has anything `dev` doesn't (with merge
   commits, it normally only has the release merge commit):
   `git switch dev && git merge --no-ff main`, done through a PR.

## One-time setup (repository owner)

- **npm trusted publisher.** On npmjs.com, go to package
  `@mohsinonxrm/pptb-commandbar-studio` → *Settings* → *Trusted publishing* → *GitHub
  Actions*, and set:
  - Organization or user: `mohsinonxrm`
  - Repository: `pptb-mxrm-commandbar-studio`
  - Workflow filename: `release.yml`
  - Environment: leave empty, unless you add `environment:` to the job
  - Allow **`npm publish`**

  A trusted-publisher configuration expires if it isn't used for a publish within
  2 days, so set it up right before the first CI release. After the first successful
  OIDC publish, consider setting *Publishing access* to "Require two-factor
  authentication and disallow tokens".
- Trusted publishing requires **npm CLI ≥ 11.5.1** and **Node ≥ 22.14.0** on a
  GitHub-hosted runner. The workflow uses Node 24 with npm 11.
- `package.json` → `repository.url` must keep pointing at this GitHub repository, or
  provenance and trusted publishing fail.
