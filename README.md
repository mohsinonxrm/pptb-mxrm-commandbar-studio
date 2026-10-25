# Command Bar Studio for Power Platform ToolBox

A fully featured visual designer for Dataverse **classic ribbon / command bar
customizations** — the spiritual successor to [Ribbon Workbench](https://www.develop1.net/public/rwb/ribbonworkbench.aspx)
reimagined with React 18, Fluent UI v9, and live Dataverse integration via
[Power Platform ToolBox](https://www.powerplatformtoolbox.com/).

![Version](https://raw.githubusercontent.com/mohsinonxrm/pptb-mxrm-commandbar-studio/refs/heads/main/assets/badges/version.svg)
![Power Platform ToolBox 1.2.7 or later](https://raw.githubusercontent.com/mohsinonxrm/pptb-mxrm-commandbar-studio/refs/heads/main/assets/badges/pptb.svg)
![@pptb/types 1.2.7](https://raw.githubusercontent.com/mohsinonxrm/pptb-mxrm-commandbar-studio/refs/heads/main/assets/badges/pptb-types.svg)
![React 18](https://raw.githubusercontent.com/mohsinonxrm/pptb-mxrm-commandbar-studio/refs/heads/main/assets/badges/react.svg)
![TypeScript 5.8](https://raw.githubusercontent.com/mohsinonxrm/pptb-mxrm-commandbar-studio/refs/heads/main/assets/badges/typescript.svg)
![Fluent UI v9](https://raw.githubusercontent.com/mohsinonxrm/pptb-mxrm-commandbar-studio/refs/heads/main/assets/badges/fluent-ui.svg)
![License AGPL-3.0-only](https://raw.githubusercontent.com/mohsinonxrm/pptb-mxrm-commandbar-studio/refs/heads/main/assets/badges/license.svg)

> **Classic commands only.** CBS targets Dataverse `RibbonDiffXml` — the
> classic commanding system. It does not modify Power Fx / Modern Commanding
> defined in the Command Designer.

---

## ✨ Features

### 🎨 Visual Ribbon Canvas
- **Classic ribbon view** — faithful tabbed ribbon with groups, large icon tiles, and @dnd-kit drag-and-drop reorder with a styled `DragOverlay` ghost (brand border, shadow, `grabbing` cursor) and animated 2 px drop-line indicators between button slots
- **Modern command bar view** — flat command bar exactly as rendered in Unified Interface
- **List view** — sortable data grid of all buttons with inline visibility toggle
- All 4 ribbon locations: **Home Grid**, **Sub Grid**, **Form**, **Application**
- Tab drag-to-reorder, inline rename (double-click), `+ Add tab`
- Context menus on buttons and groups — hide/show, duplicate, move, rename, delete, override OOB
- A copy (duplicate, customise button) keeps the labels another solution defines, so it shows the same text; edit its text to give it labels of its own
- If your unmanaged ribbon customizations can't be read when a table loads, a warning says so (labels may show as ids, ownership is unknown), with **Retry**

### 📋 Properties Pane
- Identity: label, translations (multi-LCID), tooltip, icon picker, image16/32, kind, sequence, template alias
- Translations edit the labels a button publishes to; another solution's label, shared with every control that uses it, is read-only there
- Command binding with action summary chips
- Display rules + Enable rules pill lists with inline add/remove
- Scaling summary with link to full editor
- Advanced: form ribbon scope selector, `Mscrm.OpenRecordItem` override toggle, client-type filter shortcuts (Unified Interface evaluates as `Modern`; one filter per command)
- Conflict banner — surfaces managed-solution provenance via solution-layer API

### ⚡ Command Editor
- JavaScript function: library (with Browse… to Web Resource Browser), function name, positional CrmParameter editor
- URL action: address, PassParams, WinMode, named CrmParameters with querystring key
- **Power Fx expression** — inline Monaco editor (syntax-highlighted, word wrap) with variable hints (`ThisRecord`, `Selection`, `Self`) and async-rule note
- Custom API / Web API action
- Enable rules + Display rules binding
- References tab showing exact buttons + tab/group breadcrumb
- Versions tab from history
- Security advisory: all command definitions are visible in browser source

### 📐 Rule Editor
- All 30 RuleStep kinds from `RibbonTypes.xsd` — Enable rules and Display rules
- Drag-to-reorder steps
- OrRule with nested "Add nested step"
- InvertResult + Default value toggles per step
- Plain-English `summarizeRule()` output
- CustomRule async note (Promise\<boolean\> on Unified Interface)

### 🔤 Localization Editor
- Multi-LCID label / tooltip title / tooltip body per button
- Locale chip row with active/inactive state
- "Insert line break" (`&#x200b;&#x200b;`)
- 20 built-in LCIDs; add any custom LCID by number

### 🖼️ Icon Picker
- **Fluent icons** tab — 85 icon catalogue with category filter + regular/filled variant; auto-uploads selected icon as SVG web resource
- **Web resources** tab — browseable list of SVG resources in the org with search
- **Custom upload** tab — drag-and-drop SVG → create web resource

### 🗂️ Scaling Editor
- MaxSize + Scale step sequence management
- Document-order-based scaling behavior per MS docs (order of `<Scale>` elements, not Sequence values)
- Validation: non-overlapping MaxSize/Scale ranges

### 🗃️ Tab Display Rules Editor
- `EntityRule` (all 4 contexts) + `PageRule`
- Info note: entity-scoped tabs can only use EntityRule; global tabs can use both

### 🌐 Web Resource Browser
- Virtualized list with type filter, custom-only toggle, search
- Upload new resource directly from the browser
- Edit JS/CSS/XML files in Monaco

### 🔗 URL Action Composer
- Base URL, PassParams (full 6-parameter table per MS docs), custom CrmParameters
- Live URL preview; `&` → `&amp;` escaping handled automatically
- WinMode: Navigate / Dialog / Popup

### 📊 XML Drawer + Diff Viewer
- Per-location RibbonDiffXml view in Monaco (read-only + editable import path)
- **Copy** and **Download** use Power Platform ToolBox's clipboard and Save dialog (the browser's outside it) and say whether the XML was copied, where it was saved, or why not
- "Format XML" button
- Monaco `DiffEditor` compare-to-baseline
- CBS-specific completions: `$LocLabels:`, `$webresource:`, `Command=`, `ModernImage=`

### 🔄 Publish Pipeline
- Read → merge → write: reads the table's existing unmanaged ribbon layer (CustomActions, commands, rules, labels) and merges your changes into it, so customizations made elsewhere (e.g. with Ribbon Workbench) are kept
- Pre-publish validation — blocking errors stop the import; warnings are logged
- Solution ZIP packaging with `behavior=2` (shell-only) root component — does **not** pull in all entity subcomponents
- Import → publish → re-import → publish, so Unified Interface picks up the change
- Waits and retries while the environment is busy with another import, publish or ribbon-metadata job
- Post-publish verification — reads the published layer back and checks every element this publish changed has the imported content
- The package carries the solution's description and its publisher's description, e-mail, website, addresses and option-value prefix as they are, so an import never clears them; if they can't be read, nothing is imported
- Labels are written in the organization's base language, read before every publish; if it can't be read, the publish stops. The system Default solution isn't offered as a target
- `Mscrm.OpenRecordItem` override support — emitted as a system-command override when the user defines a JS action on it

### 🧩 Solution Conflict Drawer
- Provenance detection via `msdyn_componentlayer` (falls back to namespace heuristic when unavailable)
- Banner in properties pane for managed-solution buttons
- Live solution-layer fetch in the drawer

### ⌨️ Keyboard Shortcuts + Command Palette
- `Ctrl+K` — Command Palette (search buttons, commands, rules, entities, actions)
- `Ctrl+Z/Y`, `Ctrl+Shift+Z` — Undo / Redo (80-entry stack)
- `Ctrl+D` — Duplicate selected button
- `Ctrl+S` — Open Bulk Publish
- Shortcuts work with Caps Lock on and on non-Latin layouts; AltGr letters (e.g. Polish `ś`) are typed, never taken as shortcuts
- `Delete/Backspace` — Delete button (with OOB confirm)
- `F2` — Inline rename tab / group
- Arrow keys — navigate buttons on canvas

### 💾 Persistence
- Unpublished changes are saved as a draft in `localStorage` after every change, per org,
  solution and table: everything the publish needs (canvas, commands, rules, labels,
  un-hides, customised / uncustomised commands). Only what differs from the loaded ribbon
  is stored, compressed: a few KB per table
- When the table loads again, a dialog offers to **Restore** the draft on top of the ribbon
  as loaded (one undo step) or **Discard** it. Drafts older than 30 days are discarded
- Switching table or solution with unpublished changes asks first: **Keep as draft**,
  **Discard** or **Cancel**. When the browser storage is full, a banner says so and
  **Keep as draft** is disabled, so the changes are never dropped silently
- Pane widths, collapsed state, view mode all persisted

---

## ✏️ What this tool changes

Command Bar Studio only reads from Dataverse until you use one of the operations below. Every
write shows the **target environment** first: the connection's name and type (Production
highlighted) are always in the top bar and next to every button that writes, and the publish
dialog names the environment, solution and tables. On a **Production** connection you type the
table's logical name (or `application ribbon`) before **Publish** is enabled; the other
operations add or change a single web resource and don't ask for it. Writes run as the connected user, or the
user PPTB is impersonating, and only go to the connection the tool was on when the operation
started (if the tool's connection changes in Power Platform ToolBox, the operation stops).

| Operation | When | What it does in Dataverse |
|---|---|---|
| **Publish** | **Publish All** in the top bar, or Ctrl+S | Builds a solution package for the selected unmanaged solution with the table's **complete** ribbon customization (what is in the solution's layer, plus your changes) and imports it **twice** (`ImportSolution` with `OverwriteUnmanagedCustomizations`), then publishes the table (`PublishXml`) and reads the layer back to verify it. It first publishes the table (`PublishXml`), so ribbon changes imported elsewhere but not yet published become part of the layer it reads, instead of being replaced; the publish at the end would publish them anyway. Just before each import it reads the layer again: if it changed since it was read (published from another session or tool), nothing is imported. The same for the application ribbon, when the solution contains the Application Ribbons component. **Also publish all customizations** adds `PublishAllXmlAsync`, which publishes everything unpublished in the environment. |
| **Upload a web resource** | Web resource browser → **Upload**; icon picker → **Upload SVG** | Creates a web resource named `<prefix>_/<folder>/<file name>` and adds it to the selected unmanaged solution (`AddSolutionComponent`). If one with that name exists you choose **Replace** (its content changes everywhere it is used), **Keep existing** or **Cancel**; a managed one can only be kept. |
| **Pick a Fluent icon** | Icon picker → Fluent icons | Creates the SVG web resource `<prefix>_/icons/cbs/<icon>.svg` (an existing one is reused, never overwritten), adds it to the solution and publishes it (`PublishXml`). |
| **Pick an existing web resource as an icon** | Icon picker → Web resource | Adds the web resource to the selected unmanaged solution (`AddSolutionComponent`). |
| **Save a script** | Command editor → JavaScript action → **Save Web Resource** | Updates the content of the script you opened and adds it to the solution. The button shows the environment it saves to. |

Nothing else writes to Dataverse:
- **Unsaved changes** are kept as a draft in the browser storage of Power Platform ToolBox on your machine (`localStorage`), per environment, solution and table. A note of the last publish is kept for the session (`sessionStorage`).
- **Export** writes a RibbonDiffXml file where you choose; **Import RibbonDiffXml** only changes the workspace until you publish.

## 🖼️ Interface Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ TopBar: Solution picker │ Ctrl+K │ Undo/Redo │ Save │ Publish   │
│ SubHeader: Breadcrumb   │ N changes since publish │ Preview …   │
├──────────────────┬──────────────────────────────┬───────────────┤
│ Left Pane        │ Ribbon Canvas                │ Properties    │
│ • Tables         │ Location: Home/Sub/Form/App  │ • Identity    │
│   (solution      │ Tab strip (drag-reorder)     │ • Command     │
│   scope only)    │ View: Classic / Modern / List│ • Rules       │
│ • Solution       │ Groups + Buttons (DnD)       │ • Scaling     │
│   Elements       │                              │ • Advanced    │
│   – Buttons      │                              │               │
│   – Commands     │                              │               │
│   – Rules        │                              │               │
│   – Templates    │                              │               │
├──────────────────┴──────────────────────────────┴───────────────┤
│ Bottom Panel: Commands │ Display Rules │ Enable Rules │ History  │
│              │ Console (runtime + publish log)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

Command Bar Studio runs **inside [Power Platform ToolBox](https://www.powerplatformtoolbox.com/)**. It requires the PPTB host to be available — authentication and Dataverse connectivity are provided by the host.

1. Install Power Platform ToolBox **1.2.7 or later**
2. Connect to a Dataverse environment
3. Open Command Bar Studio from the tool list
4. Pick an unmanaged solution from the TopBar
5. Select a table from the left pane
6. Edit ribbon buttons visually; click **Publish** when done

Icons you pick or upload, and scripts you save, are created as web resources and
added to the selected solution. A Fluent icon is uploaded as an SVG web resource named
`<prefix>_/icons/cbs/<icon>.svg` (`<icon>.filled.svg` for the filled variant).

If you turn on Dataverse impersonation for the tool in PPTB 1.2.7, web resources,
the solution import and the publish run as the impersonated user.

---

## 🛠️ Development

### Setup

```bash
git clone https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio.git
cd pptb-mxrm-commandbar-studio
npm install
```

### Common scripts

```bash
# Vite dev server (standalone — no PPTB host; ribbon APIs not available)
npm run dev

# TypeScript-only check (fast)
npm run typecheck

# Production build
npm run build

# Preview the production build locally
npm run preview

# Run tests
npm test

# Lint (zero warnings allowed)
npm run lint

# Check / apply Prettier formatting
npm run format:check
npm run format

# Validate the PPTB tool manifest
npm run validate
```

### Standalone vs PPTB-embedded

CBS runs in two modes:

- **Standalone** (`npm run dev`) — opens in a regular browser tab. Useful for UI
  iteration. All Dataverse calls fail because `window.dataverseAPI` is absent.
- **Dev harness** (`npm run dev:harness`) — the real UI in a browser tab against a
  live Dataverse org, via a stubbed PPTB host and an Azure CLI–authenticated dev-server
  proxy. See [CONTRIBUTING.md](CONTRIBUTING.md#running-against-a-live-org-dev-harness).
- **Embedded in PPTB** — loads inside the PPTB iframe. The host injects
  `window.dataverseAPI` (typed) and `window.toolboxAPI`. All publish, load, and
  web-resource operations work against the active connection.

---

## 📦 Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| **React** | 18.3 | UI framework |
| **TypeScript** | 5.8 | Strict mode, discriminated unions throughout |
| **Vite** | 7 | Build tooling + HMR |
| **Fluent UI v9** | 9.62 | Microsoft design system (Drawer, Dialog, DataGrid, Combobox…) |
| **Monaco Editor** | 0.57 | XML / JS / diff editing across XmlDrawer, DiffViewer, Command Editor |
| **@dnd-kit** | 6.3 | Drag-to-reorder for tabs, ribbon buttons (DragOverlay ghost + DroppableSlot indicators), and rule steps |
| **@fluentui-contrib/react-data-grid-react-window** | 1.4 | Virtualized entity list + web resource browser |
| **Zustand** | 5 | Global state (ribbons, selection, UI, session) |
| **fflate** | 0.8 | ZIP compression for solution package + ribbon XML decompression |
| **@pptb/types** | 1.2.7 | Power Platform ToolBox host API types (`window.dataverseAPI`, `window.toolboxAPI`) |
| **Vitest** | 3 | Test runner — 148 tests across 8 suites |

---

## 📁 Project Layout

```
src/
  components/
    shell/               — TopBar, SubHeader, Layout (resizable 4-pane)
    ribbon-canvas/       — RibbonCanvas, ClassicRibbon, ModernCommandBar, RibbonListView
    properties-pane/     — PropertiesPane + 6 section components
    bottom-panel/        — BottomPanel (Commands / Rules / History / Console tabs)
    panels/              — CommandEditor, RuleEditor, ScalingEditor, TabDisplayRules,
                           ConflictDrawer, WebResourceBrowser, UrlComposer,
                           DiffViewer, XmlDrawer
    modals/              — BulkPublish, IconPicker, LocalizationEditor, NewButton/Group/Tab,
                           HideOobWarning, ImportXml, MoveToFlyout
    command-palette/     — CommandPalette (Ctrl+K)
    shared/              — MonacoEditor, FluentIcon, CrmParameterEditor,
                           RuleStepEditor, RuleStepPicker, ResizableHandle
  services/
    xmlGenerator.ts      — RibbonDiffXml generator (all 30 rule kinds)
    xmlParser.ts         — Merged ribbon XML parser (all 30 rule kinds)
    xmlValidator.ts      — Pre-import validation with user-friendly messages
    publishPlan.ts       — What a publish changes per location (and what it can't)
    ribbonDiffMerge.ts   — Merges your changes into the existing unmanaged layer
    dataverse/
      ribbonService.ts         — RetrieveEntityRibbon / RetrieveApplicationRibbon
      publishService.ts        — Layer merge, solution ZIP packaging, import, publish and verification
      ribbonProvenanceService.ts — msdyn_componentlayer solution-layer provenance
      conflictService.ts       — fetchConflictLayersForElement
      webResourceService.ts    — loadWebResources / loadWebResourceByName / loadWebResourceContent
  store/
    ribbonStore.ts       — Ribbon state, 80-entry undo/redo, mutationsSincePublish
    selectionStore.ts    — Selected location / tab / group / button
    uiStore.ts           — Modal open states, pane widths, view mode (persisted)
    sessionStore.ts      — Solutions, entities, connection, publisher prefix
    runtimeLogStore.ts   — Console tab entries
  utils/
    ruleEngine.ts        — summarizeRule() + evaluateRule() for all 30 kinds
    idGenerator.ts       — Publisher-prefixed unique ribbon IDs
    webResourceBrowserCallback.ts — Module-level callback registry for WRB selection
    ribbonProvenance.ts  — applyProvenanceToRibbons + heuristicOrigin
    monacoCompletions.ts — $LocLabels: / $webresource: / Command= completions
  types/
    ribbon.ts            — Full domain model: RibbonButton, RuleStep (30 kinds), …
  __tests__/             — 148 Vitest tests
  __fixtures__/          — ribbon/account-full.xml, all-rule-kinds.xml, ribbondiff/…
```

---

## 🤝 Contributing

Contributions are welcome! Please use [Conventional Commits](https://www.conventionalcommits.org/)
style messages (`feat:`, `fix:`, `chore:` …).

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit: `git commit -m 'feat(canvas): add drag overlay'`
4. Push: `git push origin feat/my-feature`
5. Open a Pull Request → `dev`

**Branch model:**
- `dev` — working branch; all PRs target this
- `main` — protected; only release-tagged merges

---

## 📋 Roadmap

- [x] ~~ClassicRibbon drag migration to `@dnd-kit` with `DragOverlay` ghost~~ ✅ shipped in 0.5.0
- [ ] `QueueUpdateRibbonClientMetadata` for targeted ribbon-only publish (vs. broad `publishCustomizations`)
- [ ] Power Fx LSP / language server integration
- [ ] Import error line highlighting in Monaco
- [ ] Accessibility audit — verify full WCAG 2.1 AA compliance against spec §28
- [ ] ClassicRibbon button drag: migrate from `useDraggable` to `useSortable` for live in-place reordering animation

---

## 📄 License

Licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0-only)](LICENSE). See `LICENSE` for details.

---

## 🙏 Acknowledgments

- **[Scott Durrow](https://www.develop1.net/)** — creator of [Ribbon Workbench](https://www.develop1.net/public/rwb/ribbonworkbench.aspx),
  the original community tool for Dataverse ribbon customization and the direct
  inspiration for Command Bar Studio. CBS exists to carry that work forward inside
  the Power Platform ToolBox ecosystem.
- **[Power Platform ToolBox](https://github.com/PowerPlatformToolBox/desktop-app)** — host platform providing authenticated Dataverse access
- **[Fluent UI](https://react.fluentui.dev/)** — Microsoft design system
- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** — VS Code editor component

---

Built with ❤️ for the Power Platform community
