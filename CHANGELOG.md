# Command Bar Studio — Changelog

All notable changes to Command Bar Studio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### 🛡️ Pre-publish validation ([#35](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/35))

- The publish dialog checks the RibbonDiffXml each scope would import (your
  existing unmanaged layer plus this session's changes) before **Publish** is
  enabled. **Errors block the publish**: dropped Power Fx / Custom API actions,
  flyout / split buttons without a menu, controls' commands or commands' rules
  that are defined nowhere, scaling steps of a tab on the same Sequence (Unified
  Interface then drops every custom control of the table) and duplicate control
  ids. **Warnings don't**: rule kinds in the wrong kind of rule, `$LocLabels:`
  references without a label in the customization, missing web resources or
  ones outside the solution, scaling sizes that aren't a layout of the group's
  template, and new ids without the publisher prefix. Problems only in what is
  already published are warnings. A check that takes over 30 s is reported as
  incomplete and doesn't hold Publish back; publishing re-runs the check and
  imports nothing on an error.

### 🚀 Publish gaps ([#46](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/46), [#47](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/47), [#48](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/48), [#49](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/49), [#50](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/50), [#52](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/52), [#26](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/26))

- **Hidden by customizations** — controls hidden by a `HideCustomAction` in the
  table's (or application ribbon's) unmanaged layer are listed in the properties
  pane, with **Unhide**; the hide is removed on the next publish.
- **Deleting your own tabs and groups** removes them from the unmanaged layer,
  together with the buttons placed in them, their labels, scaling, tab display
  rules and commands nothing else uses. Deleting tabs / groups from other
  solutions is reported instead of silently ignored.
- **Translation-only edits** of labels your layer defines, and display-rule edits
  of your own tabs, are published. Edits CBS can't write are reported.
- **Base language** — edited labels are written in the organisation's base
  language; other languages are kept. Labels show in the base language.
- **Moving / re-ordering your own buttons** moves their CustomAction in place.
- **Busy environments** — publish waits for running solution operations and
  retries imports / publishes that fail with `0x80071151`; after publishing it
  verifies the published ribbon layer and explains Unified Interface caching.
- **Reload right after publish** fills in button commands missing from
  `RetrieveEntityRibbon` from the unmanaged layer.

### 🧪 Dev harness ([#24](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/24))

- **`npm run dev:harness`** runs the real UI in a normal browser against a live
  Dataverse org (`CBS_HARNESS_ORG=https://<org>.crm.dynamics.com`). It uses a stub of the
  PPTB host APIs that mirrors PPTB 1.2.7's request shaping, and a localhost-only Vite
  proxy that attaches an Azure CLI token server-side. Dev-only, so it is not part of the
  build or the npm package. See `CONTRIBUTING.md`.

### 🧰 Build, packaging & repo hygiene ([#20](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/20))

- **Lint fixed** — ESLint now uses a flat `eslint.config.js` with the
  `typescript-eslint` package (previously `eslint.config.ts` imported a missing
  dependency). `npm run lint` lints the whole repo with `--max-warnings 0`.
- **No more compiled config files in git** — `tsconfig.node.json` emits only
  declarations into `node_modules/.tmp`; the stale `vite.config.js`,
  `vitest.config.js` and their `.d.ts` files are removed
  (Vite was loading `vite.config.js` ahead of `vite.config.ts`).
- **Committed lockfile** — `package-lock.json` is now tracked. The package no longer
  ships `npm-shrinkwrap.json`.
- **Tool icon shipped** — added the tool icon (referenced by the manifest but missing
  from 0.5.x packages; now bundled under `dist/`, see #54) and `SECURITY.md`.
- **GitHub templates** — bug and feature issue forms and a pull request template;
  `.github/` is no longer git-ignored.
- **Prettier** — added `.prettierrc` (matching the existing tab/double-quote
  style) plus `format` / `format:check` scripts. The codebase has not been
  mass-reformatted yet.

### 🚀 CI/CD ([#21](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/21))

- **CI** (`.github/workflows/ci.yml`) runs on every PR and on pushes to `dev` and
  `main`: typecheck, lint, tests, `pptb-validate`, build, and a package contents/size
  check.
- **Release** (`.github/workflows/release.yml`) runs when a `v*` tag is pushed. It
  publishes to npm through trusted publishing (OIDC + provenance, no token; `--tag beta`
  for pre-releases) and creates the GitHub Release. See `RELEASING.md`.
- **Simpler tooling** — removed husky + commitlint (git hooks), release-it, Dependabot,
  coverage, the bundle analyzer and unused testing-library packages (12 dev dependencies
  in total).

### 🧩 Power Platform ToolBox 1.2.7 ([#10](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/10))

- **Requires PPTB 1.2.7 or later** — `features` is now `{ "connections": 1, "minAPI": "1.2.7" }`
  (the legacy `multiConnection` field is deprecated; older PPTB builds don't understand
  `connections`, so they show the tool as incompatible).
- **`@pptb/types` ^1.2.7** (validator now in `@pptb/validate`); removed the last
  `execute` type cast.
- **Theme** follows the host when PPTB raises `settings:updated`, not only when the
  tool becomes visible again.

### 🖼️ Tool icon ([#54](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/54))

- The icon is now bundled at `dist/icons/icon.svg` (PPTB resolves `icon` relative to
  `dist/`); `package.json` `icon` is `icons/icon.svg` and the repo-root `icons/` folder
  is no longer shipped. Pre-release versions get a gold-cornered **Insider** variant.
- The `viewBox` is cropped to the hexagon so the icon fills PPTB's 20 px slot.

### 📝 README images in PPTB ([#9](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/9))

- The badges are now SVGs committed under `assets/badges/` and referenced by
  `raw.githubusercontent.com` URL. PPTB's main window only allows images from GitHub,
  so the `img.shields.io` badges never loaded there.

### 🎨 Icons and web resources ([#19](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/19), [#51](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/51))

- **Web resources are added to the active solution** — icons, uploads from the web
  resource browser and scripts saved from the command editor are added to the active
  unmanaged solution (`AddSolutionComponent`), so the ribbon's dependency travels with
  the solution. Saving a web resource without an unmanaged solution selected shows a
  warning (it only lands in the Default solution); the icon picker requires one.
- **Fluent icons are published** — picking a Fluent icon uploads it as an SVG web
  resource named `<prefix>_/icons/cbs/<icon>.svg` (`<icon>.filled.svg` for the filled
  variant), reusing an existing one with that name, and the button's `ModernImage`
  points at it. The web resource is published (retrying while another solution
  operation runs) whenever it hasn't been published in this session yet, so an icon
  whose first publish failed is published on the next pick.
  The filled/regular switch is now honoured, also when the icon's name equals the
  button's original `ModernImage`. If the upload fails the button is left
  unchanged and the picker shows the error (previously the button kept a preview-only
  icon that was never published). The properties pane shows the `ModernImage` that
  Publish will write.

## [0.5.0] - 2026-07-16

### 🎉 First Beta Release

Command Bar Studio 0.5.0-beta — a fully featured visual designer for Dataverse
classic ribbon / command bar customizations, running inside Power Platform ToolBox.

#### ✨ Features

- **Visual ribbon canvas** — Classic (tabbed groups + large icon tiles), Modern
  (flat command bar), and List (data grid) views for all 4 ribbon locations
  (HomepageGrid, SubGrid, Form, Application)
- **Classic ribbon drag-and-drop** — Migrated from HTML5 native drag to **@dnd-kit**
  with a styled `DragOverlay` ghost tile (brand border, box-shadow, `grabbing` cursor).
  `DroppableSlot` zones between buttons show a 2 px animated drop-line indicator.
  `DroppableGroupContainer` highlights the target group. `PointerSensor` with 5 px
  activation constraint so ordinary clicks still select buttons. Keyboard sensor
  retained for accessibility.
- **Properties pane** — Label/tooltip/icon/kind/sequence/templateAlias editing;
  locale chip row; command binding; display/enable rule pills; scaling summary;
  advanced section (form scope, OpenRecordItem override, client-type filter)
- **Command editor** — JavaScript (library Browse… to Web Resource Browser), URL (PassParams,
  WinMode, named params), **Power Fx** (inline Monaco editor — syntax-highlighted,
  word wrap, no line numbers — with variable hints and async-rule note), Custom API;
  References tab with button breadcrumbs; Versions tab
- **Rule editor** — All 30 `RuleStep` kinds from `RibbonTypes.xsd`; drag-to-reorder;
  OrRule nesting with nested “Add step”; InvertResult + Default toggles;
  plain-English `summarizeRule()` output
- **Localization editor** — Multi-LCID label / tooltip title / tooltip body;
  20 built-in LCIDs; line-break insertion (`&#x200b;&#x200b;`)
- **Icon picker** — Fluent icons (auto-uploaded as SVG web resource), web resource
  browser, custom SVG upload
- **Scaling editor** — MaxSize / Scale step sequence management per MS docs
- **Tab display rules editor** — EntityRule (all 4 contexts) + PageRule
- **Web Resource Browser** — Virtualized; upload; edit JS/CSS/XML in Monaco;
  callback registry so selection propagates back to caller (Image16/32, library field)
- **URL Action Composer** — PassParams table, CrmParameter querystring keys, live preview
- **XML Drawer** — Per-location RibbonDiffXml in Monaco; Format XML; CBS completions
- **Diff / Compare Viewer** — Monaco `DiffEditor` baseline comparison
- **Bulk Publish dialog** — Per-entity change counts; progress overlay; ribbonmetadatasettoprocess monitoring
- **Solution Conflict Drawer** — `msdyn_componentlayer` provenance; managed-solution
  banner in properties pane auto-populated after ribbon load
- **Command Palette** (Ctrl+K) — buttons, commands, rules, entities, actions
- **Undo/Redo** — 80-entry history stack; `mutationsSincePublish` counter
- **localStorage persistence** — Auto-save + restore banner on startup

#### 🏗️ Architecture

- **Delta-only `RibbonDiffXml`** — only changed elements emitted; system `Mscrm.*`
  commands/rules never re-emitted; OOB commands with JS actions (e.g.
  `Mscrm.OpenRecordItem`) correctly emitted as overrides
- **Correct `behavior=2` (shell-only)** entity root component — does not drag in
  every attribute / form / view on import
- **ImportJobId required** — supplied to every `deploySolution` call; 5-minute poll
  with progress beats
- **Post-publish observability** — `ribbonmetadatasettoprocess` polling after
  `publishCustomizations()` surfaces silent ribbon-compile failures
- **Parser: all 30 rule kinds** — `EntityPrivilegeRule`, `RecordPrivilegeRule`,
  `ShowOnGridRule`, `DeviceTypeRule`, `RelationshipTypeRule`, and 14 more;
  previously these were silently dropped, risking security-rule corruption on republish
- **TabDisplayRules DOM scope** — read from document-level `RuleDefinitions > TabDisplayRules`,
  not from inside `<Tab>` elements (parser bug that caused tab rules to always appear empty)
- **Group selector fixed** — `:scope > Groups > Group` (dropped rogue `, Group` clause
  that matched groups inside `CustomAction > CommandUIDefinition`, creating phantom groups)
- **`getWebResourceContent` uses `api.retrieve`** instead of `queryData` with key
  predicate — correct single-record fetch that works reliably with PPTB's `dataverseAPI`
- **Web resource browser callback registry** — module-level one-shot callback
  so Image16/32 and Command Editor library-field Browse selections propagate correctly
  (previously selecting a resource in the browser did nothing — the `onSelect` prop
  was never wired through the global Layout overlay)
- **`@dnd-kit` DragOverlay** — ClassicRibbon button drag fully migrated from HTML5
  native drag to `@dnd-kit` (`useDraggable`, `useDroppable`, `DragOverlay`)
- **`@pptb/types` 1.2.3** — latest Power Platform ToolBox host API types

#### 🧪 Tests

- **148 / 148 passing** across 8 Vitest suites
- `all-rule-kinds.xml` fixture — covers every `RuleStep` kind in a round-trip
  parse → generate → re-parse test; regression guard for the 18 formerly-missing
  parser kinds, TabDisplayRules DOM scope, and group selector

---

## [0.1.0] - 2025-01-01

### Initial scaffold

- Project initialization with Vite + React 18 + TypeScript 5 + Fluent UI v9
- Shell layout, ribbon canvas stubs, Zustand stores, XML generator/parser scaffolding

