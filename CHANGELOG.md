# Command Bar Studio — Changelog

All notable changes to Command Bar Studio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### ⚡ Performance

- **Tables open faster (#151, #4).**
  - **Provenance:** working out which managed solution adds each control took one
    `msdyn_componentlayers` query per component, one after another. That was 35–44 queries
    (3.6–5.3 s) for account or contact, more on orgs with more apps, and the canvas waited for
    it. Those queries also always came back empty. It's now one query of the managed ribbon
    layers plus one for the solution names (~0.2 s), and managed buttons show their real
    solution and publisher. That includes buttons in managed tabs, and application-ribbon
    buttons on the table's own command bars (such as AI Builder's flyout).
  - **Metadata:** opening a solution reads its tables' metadata 40 per request, instead of one
    request per table (0.15 s instead of 0.8–1.7 s for 50–400 tables, and no throttling).
  - **Application ribbon:** it's reused for 5 minutes when you switch tables in the same
    environment. Retry or another environment reads it again. After a publish it's read on
    every load for 5 minutes, because Dataverse can take that long to return the new version.
  - **Progress:** the loading spinner names the table and the step it's on.

### ✨ Added

- **Built-in buttons show captions and icons (#6).** The canvas used to show keys such as
  `Ribbon.HomepageGrid.MainTab.New` and a placeholder icon for most out-of-the-box buttons.
  - **Captions:** the texts managed solutions define (for example "Focused view" or
    "Learning Path") are read with each table, in the org's base language. The table
    doesn't wait for them; the captions update when they arrive.
  - **Platform keys:** Dataverse resolves these itself, and CBS can't read them yet (see
    below). They show their last meaningful segment instead: `…MainTab.New` → "New",
    `…View.TabName` → "View".
  - **Icons:** about 80 out-of-the-box `ModernImage` names (New, Export to Excel, Flows,
    Email a Link, Assign, …) get Fluent icons. A button whose icon is a `$webresource:`
    image shows that image.
  - **Only references:** only a label that refers to a text CBS can't read gets a caption.
    Literal labels, and controls without one, are shown as they are.
  - **Display only:** what publishes is the label and icon as loaded.

  The real texts of platform keys only come from `GetClientMetadata`, a 162 MB response,
  which is more than Power Platform ToolBox passes to a tool (128 MB).

### 🔧 Fixed

- **Saved web resources are published (#156).** Saving a command's script in the command
  editor, or replacing a file through **Upload**, updated the web resource but didn't publish
  it, so users kept the old script or icon until someone ran Publish All. They're published
  now. If the publish fails, the save is kept and CBS says so.
- **Translations and Properties agree on the base language (#157).** The Translations
  dialog's base-language row edited a copy that the publish then overwrote with the
  Properties text. It now edits the button's own text; other languages are unchanged.
- **Web resources are always referenced with `$webresource:` (#158).** That's the only form
  that makes the solution depend on the web resource.
  - A custom rule's library and a typed image path get the directive.
  - A typed `/WebResources/…` image path becomes `$webresource:…`.
  - A loaded `/WebResources/…` library is kept as is, and the pre-publish check warns about
    it.
  - Platform (`/_imgs/…`) and relative paths, and URLs, are kept as they are.
- **A typed `$LocLabels:` reference is kept as is (#159).** A label that CBS doesn't have was
  published as a placeholder whose text was its own id. It's now written as a reference,
  like another solution's label, and the pre-publish check warns when nothing defines it.
  The XML import's message about it no longer says the publish would fail.
- **Duplicating a built-in group keeps its title.** A group titled by a platform text
  (`$Resources:`) or another solution's label was copied with the key itself as its title
  ("Ribbon.HomepageGrid.MainTab.Management (copy)"), and that text was published. Like a
  copied button, the copy now keeps the title as it is, so it shows the same text as the
  original. Other groups' copies are still titled "… (copy)". To retitle such a copy, rename
  it before you publish: once published, only titles of your own can be renamed. The
  Console says so when you duplicate.
- **The pre-publish check catches what the import would reject (#153).** These used to fail
  only at import, after CBS had started writing. Now they're found first, and nothing is
  written:
  - a rule with no steps;
  - an OrRule with one alternative;
  - a JavaScript action or custom rule without a valid function name or library;
  - a URL action without an address or with an unnamed parameter;
  - a rule step with a required value left empty;
  - a number that isn't one.

  The same problems in customizations that are already published are warnings. A cleared
  number parameter now keeps its last value instead of being written as `NaN`.
- **Changing a control's Kind writes valid XML (#154).**
  - A control keeps only the attributes its new element allows. For example, a flyout
    turned into a button no longer carries `PopulateDynamically`.
  - A menu item can be a button or a flyout, which is all a menu can hold.
  - A loaded control's Kind is locked: changing it would replace the control another
    solution or an earlier publish defined. Add a new control instead.
- **A tab has one display rule (#155).** Adding a second rule replaced the first, so a new
  tab could disappear from where it was meant to show.
  - **Tab rules** now edits a single rule, and the tab shows where any of its steps
    matches.
  - **Applies to** and **Context** can be **Any**.
  - A table's tab picks that table or any, instead of a free-text name.
  - A tab your customizations don't add is read-only.
  - A new tab with no steps says it gets the default rule when you publish.
- **Publishing all customizations needs its own confirmation (#109).** **Also publish all
  customizations** publishes every unpublished customization in the environment, including
  other people's work in progress. It now shows a warning naming the environment, and
  **Publish** waits for you to confirm it. The **Publish comment**, which was collected and
  then dropped, is written to the Console log with the publish.
- **The top bar has no controls that do nothing (#22).**
  - The **State simulator**, **Save** and **Settings** controls are removed. Changes are
    already kept as a draft for each table automatically, and Ctrl+S opens Publish.
  - **Help** now shows the shortcuts and copies the documentation link.
- **Narrow panes (#22).**
  - When the window is narrow, the Tables and Properties panes give way so the canvas
    keeps at least 40% of the width, as far as their minimum widths allow. In an 800 px pane it used to show one group at a
    time.
  - The top bar's solution name and search box shorten instead of overlapping.
- **Command editor (#22):** removing an action no longer hands its card's state to the next
  one.

## [0.7.0-beta.3] - 2026-10-24

The third beta of 0.7.0 (npm `beta`): one fix. The **Show on Unified Interface** filter added a
rule that hid the button in Unified Interface. Requires Power Platform ToolBox 1.2.7 or later.

### 🔧 Fixed

- **Client-type filters target the right client (#152).** Unified Interface evaluates
  `CommandClientTypeRule` as **`Modern`**: Microsoft's `Mscrm.ShowOnlyOnModern`
  (`Type="Modern"`) shows a button there, and `Mscrm.HideOnModern` (`Type="Modern"` with
  `InvertResult="true"`) hides it. CBS labelled `Refresh` as Unified Interface, so **Show on
  Unified Interface (Refresh)** added a rule that **hid the button in Unified Interface**.
  - The quick filter is now **Show on Unified Interface (Modern)**, and `Refresh` is labelled as
    the legacy web client. New client-type steps default to `Modern`.
  - A filter never reuses an inverted rule such as `Mscrm.HideOnModern`.
  - Adding a filter replaces (unbinds) another client-type filter on the same command, because
    display rules must all pass and two would hide the button everywhere.
  - If you used the old filter, the command has a `<command id>.Refresh.DisplayRule` and the
    button is hidden in Unified Interface. Click **Show on Unified Interface (Modern)** to replace
    it, then publish. This affects 0.5.x–0.7.0-beta.2.

## [0.7.0-beta.2] - 2026-10-23

The second beta of 0.7.0 (npm `beta`): correctness. A publish keeps the publisher's details and
never assumes the base language; deletes clean up exactly what they leave unused; copies keep
other solutions' labels; an unreadable layer is reported; and the XML drawer, shortcuts, drafts
and the Tables list are fixed. Requires Power Platform ToolBox 1.2.7 or later.

### 🔧 Fixed

- **A publish no longer clears the publisher's contact details (#104).** The solution package
  CBS imports had empty publisher `<EMailAddress>`, `<SupportingWebsiteUrl>` and `<Addresses>`,
  and an import clears what they leave empty (verified live: e-mail, website and address were
  wiped). CBS now reads the solution and its publisher before importing and writes their
  descriptions, e-mail, website, addresses and option-value prefix as they are; if it can't read
  them, nothing is imported (the prefix no longer defaults to 10000).
- **The system Default solution isn't offered as a publish target (#105)**; the Common Data
  Services Default Solution still is.
- **The organization's base language is never assumed (#106).** A failed read of
  `organizations.languagecode` was taken as English (1033), so a package could be written in the
  wrong language. It is read twice; a publish that still can't read it stops before writing
  anything, and on load a warning says labels are shown in English.
- **Deleting a control cleans up exactly what it leaves unused (#108).** Whether its command,
  rules and labels are still used is read from the elements, not matched as text: a rule
  referenced with `Id` after another attribute is now removed with its command, and a rule is
  no longer kept by a rule of the other kind with the same id.
- **An unmanaged layer that can't be read is reported (#110).** The ribbon still loads, but a
  warning on the canvas says labels may show as ids and ownership is unknown, with Retry (which
  asks first when you have unpublished changes). A ribbon response without its compressed XML
  now fails with a clear error.
- **Copies keep labels another solution defines (#137).** Duplicate button, Duplicate group and
  Customise button published a copy of, say, an msdyn button with a new label reading the
  original label's id. The copy now references the same label, as it does platform texts; if
  you edit its text, it gets a label of its own and the shared one is left alone. The
  Translations editor follows the same rule: another solution's label is read-only there, so it
  is never overwritten in your layer for every control that uses it. While a layer can't be read
  (#110), copies keep no label references, since they could be your own labels.
- **The XML drawer's Copy and Download work in PPTB and report what happened (#122).** They go
  through the host's clipboard and Save dialog (the browser's as a fallback) and say whether the
  XML was copied, where it was saved, or why it couldn't be. The console's Copy log falls back to
  the browser outside PPTB too, and Import XML from the command palette says when it couldn't
  read the clipboard.
- **Keyboard shortcuts work with Shift and Caps Lock (#123).** Ctrl+Shift+Z / Cmd+Shift+Z redoes,
  and Ctrl+Z / Y / K / S / D work with Caps Lock on and on non-Latin keyboard layouts. AltGr
  letters (Polish "ś" is AltGr+S) are typed, never taken as shortcuts.
- **A restored draft that was undone isn't offered again after a publish (#129).** A redo of the
  restore saves it again.
- **The whole row of a table in the Tables list is clickable (#5)**, not just its name.

## [0.7.0-beta.1] - 2026-10-23

The first beta of 0.7.0 (npm `beta`): publish safety. A connection change, a Production target,
a change published or imported elsewhere while you publish, and dynamic flyouts are now handled;
renaming and duplicating groups are fixed. Requires Power Platform ToolBox 1.2.7 or later.

### ✨ Added

- **Every write names its target environment (#121).** Same safeguards as FetchXML Studio:
  - the top bar shows the connection's name and type, with Production highlighted;
  - the publish dialog shows the environment (name, type, URL), the solution, the tables and what
    the publish writes; on a **Production** connection, **Publish** waits until you type the
    table's logical name (or `application ribbon`), including when the connection is set to
    Production while the dialog is open;
  - an upload (web resource browser, icon picker SVG) over an existing web resource asks first:
    **Replace**, **Keep existing** or **Cancel**; a managed one can only be kept;
  - the command editor's **Save Web Resource** shows the environment it saves to;
  - README: **What this tool changes** lists every write.

### 🔧 Fixed

- **Connection changes while the tool is open (#120).** Power Platform ToolBox can switch a running
  tool to another connection (desktop app and VS Code extension). Command Bar Studio now follows:
  - the solution and table loaded from the previous environment are closed, and their unpublished
    changes are kept as a draft for that environment (offered again when the tool is back on it);
  - the solutions and the current user load again for the new connection, and a banner names both
    environments;
  - a change of the connection's name or environment type only updates them;
  - every write (import, publish, web resource save) first checks that the tool is still on the
    connection it started on, so a publish never continues into the newly selected environment.
    Token refreshes and edits to other connections change nothing.
- **A publish no longer overwrites a change made elsewhere meanwhile (#102).** The import replaces
  the table's whole unmanaged ribbon layer, and it can start minutes after the layer was read
  (waiting for a busy environment, then a second import). The layer is now read again just before
  each import, after any wait; if other ribbon changes for the table were published meanwhile
  (another session, tool or solution import), nothing is imported and the message names the added,
  removed or changed elements: reload the table and publish again. When that happens between the
  two imports, your changes are already published, and the publish ends with a warning instead of
  importing again. (Changes imported elsewhere but not published can't be seen by this check; see
  #103 below.)
- **Ribbon changes imported elsewhere but not published are kept (#103).** Dataverse shows only
  published ribbon customizations, so a solution imported but not yet published was invisible to
  the publish and was replaced by it (verified live: the layer tables, RetrieveEntityRibbon and a
  solution export all show only the published state). A publish now publishes the table (or the
  application ribbon) first, so those changes become part of the layer it merges into. The publish
  at the end publishes everything pending for the table anyway, so nothing else changes. A publish
  the pre-publish check refuses as loaded still writes nothing; if it fails after the table was
  published first, the message says so. The publish first waits until no other solution operation
  runs, and an import that has to wait for another import stops instead of importing over what
  that import may have left unpublished.

- **Dynamic flyouts can be published (#101).** A flyout or split button that is populated at
  runtime (`PopulateDynamically` with a `PopulateQueryCommand`, e.g. a copy of the out-of-the-box
  **Flow** flyout) has no static menu; the pre-publish check reported it as an empty drop-down and
  blocked the publish. It is accepted now (a dynamic one without a `PopulateQueryCommand` is only
  warned about), and `PopulateDynamically` is read as a boolean ("true" or "1") everywhere.

- **Rename is offered only where it can be published (#33).** Renaming a tab or group publishes
  when it is new, or your unmanaged customizations add it with a translatable title (its label's
  text changes). For out-of-the-box and managed tabs and groups, **Rename…** in the group menu is
  disabled and says why, and a tab can't be renamed in place — before, the rename was only refused
  at publish. (Overriding those is #135; Unified Interface doesn't show group titles.)
- **A duplicated group's title is text (#33).** Duplicating a group whose title is a label
  (`$LocLabels:`) or a platform text (`$Resources:`) published the token with " (copy)" as its
  title; the copy now gets the title's text, in the base language, with " (copy)".

### 🏗️ Technical

- **Dependency security (#117).** `npm audit` reports 0 vulnerabilities, runtime and dev.
  - `monaco-editor` 0.55.1 → 0.57.0, now listed under `dependencies` (it ships in the bundle).
    Its DOMPurify is overridden to 3.4.17, which clears the mutation-XSS advisories and three
    critical ones published since (GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr, GHSA-c6gr-qvv4-5v3f);
    Monaco imports its own copy, so the build bundles the npm package in its place (0.6.2). The
    Monaco worker imports follow 0.56's new package layout.
  - `vitest` 3 → 5.0.3, which also replaces `@vitest/mocker` and drops `tinypool` (dev-only
    advisories, one critical).
  - CI's runtime audit fails on **moderate** findings and above (was high).
  - Dependabot groups take minor and patch updates only; a major arrives as its own PR, and
    eslint 10 waits for `eslint-plugin-jsx-a11y`.

## [0.6.2] - 2026-10-22

A security hotfix: 0.6.1's DOMPurify fix didn't reach the shipped bundle.

### 🔒 Security

- **The Monaco editor now really uses DOMPurify 3.4.17.** Monaco ships its own copy of DOMPurify
  (3.2.7 in Monaco 0.55.1) and imports that copy, not the npm package, so 0.6.1's npm override
  satisfied `npm audit` but left 3.2.7 in the bundle. The build now replaces Monaco's copy with
  the installed `dompurify` (3.4.17), which clears GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr and
  GHSA-c6gr-qvv4-5v3f among others. Nothing else changes; the editors (the XML drawer and the
  command editor) work as before.
- **CI and the release workflow check the bundled DOMPurify** against the installed version, so a
  bundle with Monaco's own copy can't be published again.

## [0.6.1] - 2026-10-22

A security hotfix for 0.6.0. **Superseded by 0.6.2:** the fix below didn't reach the bundle.

### 🔒 Security

- **DOMPurify 3.4.17 in the Monaco editor.** `monaco-editor` 0.55.1 pins DOMPurify 3.2.7, which
  has advisories rated up to critical (including GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr and
  GHSA-c6gr-qvv4-5v3f). An npm override resolves the npm dependency to 3.4.17 and
  `npm audit --omit=dev` reports 0 vulnerabilities, but Monaco imports its own bundled copy, so
  the published 0.6.1 still contains DOMPurify 3.2.7. Fixed in 0.6.2.

## [0.6.0] - 2026-10-18

The v0.6.0 milestone: publishing that keeps what's already in your customizations and verifies
what it wrote, editing what isn't yours (Customise Command / Customise button), menus, new tabs
and groups, restoring unsaved changes, pre-publish validation, and Power Platform ToolBox 1.2.7,
in the desktop app and the VS Code extension. 0.5.x stays available for PPTB versions before
1.2.7 (see `SECURITY.md`).

### ⚠️ Requires Power Platform ToolBox 1.2.7

- **Power Platform ToolBox 1.2.7 ([#10](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/10)).**
  - **Requires PPTB 1.2.7 or later** — `features` is now `{ "connections": 1, "minAPI": "1.2.7" }`
    (the legacy `multiConnection` field is deprecated; older PPTB builds don't understand
    `connections`, so they show the tool as incompatible).
  - **`@pptb/types` ^1.2.7** (validator now in `@pptb/validate`); removed the last
    `execute` type cast.
  - **Theme** follows the host when PPTB raises `settings:updated`, not only when the
    tool becomes visible again.

### ✨ Added

- **Publishing keeps what's already there ([#11](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/11)).**
  - Publish reads the solution's existing unmanaged ribbon layer and merges your changes into it
    in one import, so customizations made elsewhere (for example with Ribbon Workbench) are kept.
    Every publish is imported twice so Unified Interface picks it up, and the published layer is
    read back and checked.
  - Load: when the server returns an out-of-date copy of a command or rule right after a publish
    (it can lag 10 minutes or more), the copy in your customizations is used ([#52](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/52)).
- **Flyout and split-button menus ([#27](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/27)).**
  - Menus are modelled, parsed and published: add, edit, hide and delete menu items, create new
    flyouts and split buttons with sections.
  - Duplicating a flyout gives its items short ids of their own, and label ids stay within 128
    characters: longer ones inside a menu made publishing fail after the import ([#86](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/86)).
    Copies keep platform (`$Resources:`) texts instead of showing the resource key.
- **New tabs and groups ([#58](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/58), [#59](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/59)).**
  - Buttons in a new group on an existing tab are written with the group; new tabs get a command
    and a display rule, are rebuilt on reload, and can be renamed and deleted.
  - Group scaling uses free sequences: colliding ones made Unified Interface drop every custom
    control of the table. Layers written by earlier versions are repaired on the next publish.
- **Editing what isn't yours ([#25](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/25), [#26](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/26), [#31](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/31)).**
  - **Customise Command** copies an out-of-the-box command into your customizations so it can be
    changed; **Customise button** copies a button and hides the original.
  - Moving a button that isn't yours moves your copy and hides the original, as one undo step.
  - Edits to existing commands and rules are published.
- **Restoring unsaved changes ([#16](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/16)).**
  - **Restore** now brings back everything that was going to be published: the canvas,
    commands, rules, labels and translations, un-hides, and customised / uncustomised
    commands. It goes on top of the ribbon as loaded now, so the restored changes publish
    (before, they were taken as the loaded state and nothing could be published). Undo
    takes the restore back as one step (the draft is kept).
  - The offer is a dialog shown only once the table has finished loading, so a restore is no
    longer overwritten by the load, and nothing can be edited until you choose **Restore**
    or **Discard**. When the table's ribbon changed on the server since the draft was saved,
    the dialog says so: review the publish plan before publishing.
  - Drafts are kept per org, solution and table. Loading a table no longer deletes its
    draft; a draft is removed after publishing everything, when undoing back to the loaded
    ribbon, or with **Discard**. A publish that fails for the table keeps it (and the table
    still counts as changed). Drafts saved by earlier versions, and drafts older than 30
    days, are discarded at startup.
  - Switching table or solution with unpublished changes asks first: **Keep as draft**
    (offered again when you reopen the table in that solution), **Discard** or **Cancel**.
  - A draft stores only what differs from the loaded ribbon (changed, added and removed tabs,
    groups, buttons, commands, rules and labels), deflated: a few KB instead of over a million
    characters per table, so drafts of several tables fit in `localStorage`. What the server
    added since the draft was saved is kept on restore.
  - When a draft can't be saved (browser storage full), a banner says so (and when the last
    saved draft is from), and **Keep as draft** is disabled (and never switches) so the
    changes aren't lost.
- **Pre-publish validation ([#35](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/35)).**
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
- **Importing RibbonDiffXml ([#30](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/30)).**
  - Import is lossless (labels in every language, rules, hides) and merges into the workspace as
    one undo step; the result publishes.
- **Modern commands ([#32](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/32)).**
  - Modern commands (`appaction`) are shown read-only next to the classic buttons, with an App
    filter; classic buttons (and flyout menu items) a migrated modern command hides or replaces
    are flagged.
- **Orphaned customizations ([#64](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/64)).**
  - Customizations in your layer that the ribbon never shows (for example on the Charts tab, or in
    a group that no longer exists) are listed with the reason and can be deleted. Right after a
    publish, what it just wrote can't be deleted from there.
- **Power Platform ToolBox for VS Code ([#89](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/89)).**
  - The tool now works in the Power Platform ToolBox VS Code extension (1.1.0): it loads instead
    of showing a blank tab, reads table ribbons, and publishes. Before, its code files were
    requested from the wrong address there.
  - Loading, importing and publishing send the same Dataverse requests in the desktop app and in
    VS Code, so the extension's different helpers don't change what is imported or published.

### 🔧 Changed

- **Canvas opens on the main tab ([#64](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/64)).**
  - Loading a table or switching location opens the table's **main tab** instead of the
    first tab listed (on the Home Grid that was the Charts tab).
  - The Charts / `AllEntities` tabs show a warning (in every view):
    Unified Interface never shows their buttons, and they don't come back on reload.
  - **Orphaned customizations:** buttons, menu items, groups and tabs your unmanaged
    customizations add that the ribbon doesn't return anywhere (added to the Charts tab, to a
    group or menu that no longer exists, at a misspelled Location, …) are listed in the
    Properties pane with where they are and why they aren't shown; a canvas banner points
    there. **Delete** removes one on the next publish, together with the command, rules and
    labels nothing else uses (undoable until then). Other publishes keep them untouched.
  - The pre-publish check warns when a publish adds something at such a Location.
- **Unsupported command actions ([#28](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/28)).**
  - The command editor no longer offers **Power Fx** or **Custom API** actions:
    classic ribbon commands can't run them (they exist only in modern commanding).
    A command that still has one (from an older saved session) shows an error with
    **Remove**, and publishing it is blocked with a message saying what to do.
- **No form-specific ribbon scope ([#14](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/14)).**
  - Removed the **Specific form only** option (and its form picker) from the properties
    pane. Form-specific ribbons aren't supported on Unified Interface and CBS never wrote
    them; form command bar changes apply to every main form of the table, as the pane
    now says.
- **Undo and redo ([#34](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/34)).**
  - Undo / redo cover commands, rules and labels too, and typing is one step.
- **Deleting safely ([#17](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/17), [#18](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/18), [#75](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/75)).**
  - Delete only removes your own buttons, groups and tabs; for anything else it offers Hide.
    Keyboard shortcuts stay out of text fields and dialogs.
  - Rename group, change template and confirmations are proper dialogs (`window.prompt` /
    `confirm` don't work in Power Platform ToolBox); accessible names use readable titles.
- **Icons and web resources ([#19](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/19), [#51](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/51)).**
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

### 🔧 Fixed

- **Publish gaps ([#46](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/46), [#47](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/47), [#48](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/48), [#49](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/49), [#50](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/50), [#52](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/52), [#26](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/26)).**
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
- **Record open override and properties-pane fixes ([#22](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/22)).**
  - **Override default record open behavior** (`Mscrm.OpenRecordItem`, home grid and sub-grid)
    now publishes, can be turned off, and survives a reload. Following Microsoft's recipe, turning
    it on adds the `Mscrm.OpenRecordItem` command and an **Open record** button that uses it to the
    location's command bar; turning it off removes only that button (your own buttons using the
    command stay), and the command once no button uses it. Publishing is blocked while the
    command's JavaScript action has no web resource or function, and the pre-publish check warns
    when that button is hidden or the command gets display rules.
  - The **Translations** chips list only the button's own labels (`Btn1` no longer shows `Btn10`'s).
  - **Switching solution** clears the table list, the loaded table's ribbon, its pending edits and
    undo history, and the selection (the restore banner still offers the auto-saved edits when the
    table is opened again). Picking the solution that is already active keeps everything.
  - Removing or re-ordering **rule steps** no longer moves a step's inputs to its neighbour, and an
    undo / redo of the steps no longer leaves them on the wrong step.
  - The **Command Editor** closes when the command it shows is undone away.
- **Icons on copies and picked web resources ([#60](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/60), [#61](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/61)).**
  - A button **duplicated** or **copied from Solution Elements** keeps its icon (the loaded
    ModernImage and image16/image32); a copy from Solution Elements also keeps its command
    and tooltips. Label tokens of the original are still not reused.
  - Picking an **existing web resource** in the icon picker adds it to the active unmanaged
    solution, so a solution export carries the icon (with a warning when no unmanaged
    solution is selected; an error when the typed name doesn't exist).
  - Dropping onto a button in the modern command bar no longer applies the drop twice
    (a Solution Elements copy was created twice and a drag-move ran twice, the second time
    into the tab's first group).
- **Rules and actions round trip ([#29](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/29), [#42](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/42)).**
  - Rules and actions are kept exactly as loaded (unknown kinds verbatim); generated XML is
    schema-valid.
  - ToggleButton, Label, DropDown, MRUSplitButton, Spinner and GalleryButton show on the canvas
    (read-only), can be hidden and unhidden, and are never dropped. Tab and group `Description`s
    round trip, and tabs inside customizations no longer appear as phantom tabs.
- **Startup and closing ([#10](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/10), [#89](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/89)).**
  - Power Platform ToolBox asks before closing the tool while an import or publish runs.
  - A start-up failure (or a host that doesn't answer) shows what went wrong and what to try,
    instead of a blank tab. So does an error later on that the tool can't recover from.
- **Tool icon ([#54](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/54)).**
  - The icon is now bundled at `dist/icons/icon.svg` (PPTB resolves `icon` relative to
    `dist/`); `package.json` `icon` is `icons/icon.svg` and the repo-root `icons/` folder
    is no longer shipped. Pre-release versions get a gold-cornered **Insider** variant.
  - The `viewBox` is cropped to the hexagon so the icon fills PPTB's 20 px slot.
- **README images in PPTB ([#9](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/9)).**
  - The badges are now SVGs committed under `assets/badges/` and referenced by
    `raw.githubusercontent.com` URL. PPTB's main window only allows images from GitHub,
    so the `img.shields.io` badges never loaded there.

### 🏗️ Technical

- **Release process from FetchXML Studio.** `main` holds the stable release, betas are
  tagged on `release/X.Y`, fixes merge forward, and the previous minor gets critical fixes
  for 30 days (`RELEASING.md`, `SECURITY.md`, `CONTRIBUTING.md`, the PR template).
  - `release.yml` chooses the npm tag from the version and the tagged branch: `-beta.N` /
    `-rc.N` → `beta`, a stable tag on `main` → `latest`, on `support/X.Y` → `support-X.Y`.
    Anything else fails before publishing.
  - CI also runs on `release/**` and `support/**`, and fails on high or critical
    `npm audit --omit=dev` findings.
  - Dependabot proposes grouped weekly npm and GitHub Actions updates into `dev`, with a
    14-day cooldown.
  - A README version badge, generated with `npm run version-badge`. `engines` asks for
    Node 22 or later, and `@pptb/types` is pinned to 1.2.7.
- **Dev harness ([#24](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/24)).**
  - **`npm run dev:harness`** runs the real UI in a normal browser against a live
    Dataverse org (`CBS_HARNESS_ORG=https://<org>.crm.dynamics.com`). It uses a stub of the
    PPTB host APIs that mirrors PPTB 1.2.7's request shaping, and a localhost-only Vite
    proxy that attaches an Azure CLI token server-side. Dev-only, so it is not part of the
    build or the npm package. See `CONTRIBUTING.md`.
- **Build, packaging & repo hygiene ([#20](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/20)).**
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
- **CI/CD ([#21](https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues/21)).**
  - **CI** (`.github/workflows/ci.yml`) runs on every PR and on pushes to `dev` and
    `main`: typecheck, lint, tests, `pptb-validate`, build, and a package contents/size
    check.
  - **Release** (`.github/workflows/release.yml`) runs when a `v*` tag is pushed. It
    publishes to npm through trusted publishing (OIDC + provenance, no token; `--tag beta`
    for pre-releases) and creates the GitHub Release. See `RELEASING.md`.
  - **Simpler tooling** — removed husky + commitlint (git hooks), release-it, the old Dependabot
    config (replaced, see above), coverage, the bundle analyzer and unused testing-library packages (12 dev dependencies
    in total).

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

