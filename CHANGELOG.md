# Command Bar Studio — Changelog

All notable changes to Command Bar Studio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### 🔧 Changed

- **The Insider icon's gold corner is bigger, two-tone and flush with the edge (#236).** Betas
  show a gold corner on the tool icon. It was small and light, and a blue sliver showed between it
  and the hexagon's edge. It's now about 1.5 times larger, sits on both edges, and is split on the
  same diagonal as the blue in two golds (`#CC8A00` and `#F2A100`), so it reads at the 20–24 px
  PPTB shows. FetchXML Studio and Dataverse Request Studio use the same stamp. Restart PPTB to see
  it: PPTB keeps tool icons until it restarts.

### 🔧 Fixed

- **The Structure pane's hint wraps inside its padding.** With no table chosen, the second line
  of "Choose a table to see its tabs, groups and buttons." started at the pane's edge.

### 🏗️ Technical

- **Release workflow hardening (#250, as FetchXML Studio #188).**
  - **Separate jobs:** `release.yml` is split into `build`, `publish` and `github-release`.
    - The job that installs and runs the dependencies (`npm ci --ignore-scripts`, no cache, the
      checks, the build) can only read the repository.
    - Only `publish` can get the npm OIDC token, only for a tag push, and it installs no
      project dependencies: it publishes the tarball `build` packed.
    - Only `github-release` can write to the repository.
  - **More checks before publishing:** the release build now also runs the runtime audit,
    typecheck, lint and the package-contents check, so a tag on a commit that skipped CI can't
    publish.
  - **Pinned versions:** npm is pinned to 11.21.1 instead of `npm@latest`, and Node to 24.22.0.
    The actions are pinned by commit SHA (checkout v7.0.1, setup-node v7.1.0, upload-artifact
    v7.0.2, download-artifact v8.0.2). Each is at least 14 days old, the project's dependency
    rule.
  - **Rehearsal:** the workflow can run by hand as a rehearsal: every check and
    `npm publish --dry-run`, with no npm token and no GitHub Release. A manual run never
    publishes, even on a tag.
  - **`latest` can't move back:** a stable tag gets `latest` only for main's own version line,
    and a `support/X.Y` commit is checked first. Support branches merge forward into `main`, so
    re-running an older line's release after that merge could have published it to `latest`.
  - **CI:** uses `npm ci --ignore-scripts` and the same action pins, and doesn't keep the
    checkout's token.
- **Releases check what they must update (#246, as FetchXML Studio #270).** A new
  `check-release.mjs` runs in CI (every PR, and pushes to the long-lived branches) and in the
  release build. It fails when any of these don't match `package.json`'s version:
  - the version's shape (`X.Y.Z`, `X.Y.Z-beta.N` or `X.Y.Z-rc.N`);
  - `package-lock.json`;
  - the CHANGELOG (a dated `[X.Y.Z]` section with entries, under `[Unreleased]`);
  - the version badge (`assets/badges/version.svg` must be what `npm run version-badge` writes);
  - after the build, the bundled icon (the Insider icon for pre-releases).

  The GitHub Release notes are now built from the CHANGELOG section, after a line on the channel
  and the PPTB requirement, with GitHub's PR list after them. Before, they were the PR list
  alone, replaced by hand. A rehearsal previews them in the run summary. RELEASING.md has a
  table of what every release changes, and an *After every release* checklist (the npm tag, the
  published icon, the tracking issue, the forward merge, deprecating the replaced version).
  Forward merges keep the higher version.

## [0.9.0-beta.1] - 2026-11-01

The first beta of 0.9.0 (npm `beta`): the UX overhaul in Fluent 2, and Edit mode.
- **Edit mode:** a Structure tree of tabs, groups and buttons; group cards you can reorder;
  "How users see it", a preview of the command bar; a Solution tab; a table picker in the top
  bar; and a List view that fits and sorts.
- **One editor drawer** for commands, rules, scripts, XML, Compare and Translations, with Done and
  one Undo step per drawer.
- **Properties:** sections by kind, read-only for buttons that aren't yours until you customise
  them, with texts shown as the canvas shows them.
- **The publish dialog** says what will publish and why Publish is blocked.
- **Every dialog** uses one shell and opens on the right control.
- **A screen-based visual pass** at 1024 and 1920 px, in light and dark.

It includes everything in 0.8.0. Requires Power Platform ToolBox 1.2.7 or later, as 0.8 does.

### 🏗️ Technical

- **Formatting is enforced (#118, item 1).** The codebase is formatted with Prettier once, in its
  own commit (146 files: line wrapping, indentation, trailing commas and parentheses; no behaviour
  change). CI now runs `npm run format:check` after lint, so unformatted code fails the build.
  This comes first in the UI/UX work (#193), so later diffs show only real changes.
- **Shared Fluent UI components (#190).** These are the pieces the UI/UX issues build on, so each
  surface looks and behaves the same:
  - `AppDialog`: one dialog shell in three widths (440 / 600 / 960 px). Only the content scrolls,
    so the actions never leave the dialog. A close button, and `DangerButton` for destructive
    actions.
  - `PropertySection`: collapsible properties sections with one heading style. The open sections
    are remembered.
  - `IdField`: a long id shown read-only and truncated, with the full id in a tooltip and a copy
    button.
  - `LocationInfo`: "About this location", with an explanation of each ribbon location in Unified
    Interface terms. It replaces permanent banners (#181).
  - `MessageSlot`: one message bar at a time with "+n more". Dismissing is remembered until the
    message changes.
  - `RuleTag`: a bound rule, named by the part of its id that tells rules apart instead of
    "EnableRule". Click to open, ✕ to unbind.
  - **Lint guard:** components can't add raw `button`/`input`/`select`/`textarea`/`table`
    elements, or text in an extra-small Badge. The files that still do are listed in
    `eslint.config.js` and come off the list as their issues are fixed.

### 🔧 Changed

- **The top bar fits PPTB's widths (#179).** At about 1000–1200 px, the old top bar and sub-header
  wrapped "Publish All" onto two lines. They also pushed View as, XML and Tab rules off-screen or
  under the Properties pane. Now:
  - **One top bar** replaces the sub-header row (36 px more for the canvas). It holds the
    environment, solution, search, undo/redo, an **XML** menu (View XML, Import XML…, Compare with
    published), **Open in Dynamics 365**, a **View** menu (Properties docked / floating / hidden,
    the bottom panel) and Help.
  - **Narrow windows:** tools that don't fit move into a **⋯** menu. **Publish** is never hidden.
  - **Publish** says what it does ("Publish 2 changes"). With nothing to publish it's disabled,
    and its tooltip says why.
  - **Solution button:** shows just the solution's name. A warning icon appears when new ids would
    use the org's default publisher prefix. The prefix, with an explanation, is in the picker.
  - **Environment:** below 1200 px it shows just its type badge. The full URL is in a tooltip
    you can reach with the keyboard.
  - **Tool-wide messages** (connection changed, draft couldn't be saved) sit under the top bar
    and push the panes down. They used to cover the left pane's tabs and the Properties header.
  - **Below 1200 px wide,** the left pane becomes a rail that opens it as a drawer. Properties
    opens as a drawer when you select something; the canvas stays usable behind it, so picking
    another button updates it. At 1024 px the canvas went from about a third of the width to
    nearly all of it.
  - **The bottom panel starts collapsed** (new installs) and opens when you choose one of its
    tabs.
- **The rows above the canvas fit and work from the keyboard (#180).** The location row was
  hand-rolled tabs that the keyboard couldn't reach. The ribbon tab strip stacked each tab's label,
  its full id and a delete button into 32 px, and pushed Add tab and Tab rules off-screen.
  - **Locations use Unified Interface names:** Main grid · Main form · Sub-grid · Application. They
    form a Fluent tab list (arrow keys, Enter) with a **More** menu when they don't fit.
  - **About this location (ⓘ)** explains each location and shows its ribbon id.
  - **App and View are compact menus** instead of 170 px drop-downs. The canvas's own XML button is
    gone: the top bar's XML menu is the one entry point.
  - **Ribbon tabs show their label only.** The id is in a tooltip. Double-click or F2 still renames.
    **Tab options (⋯)** holds Rename…, Tab display rules…, **Move left / Move right** (the keyboard
    way to reorder; dragging still works), and Delete tab….
  - **Add tab and Tab rules** (with its rule count) stay reachable however many tabs there are.
    When a rename isn't allowed, the reason is announced to screen readers.
- **Fewer, readable messages (#181).** Up to five permanent banners used to stack above the
  canvas, and two or three more above a built-in button's properties. The long ones were clipped
  to one line.
  - **Gone from the canvas:** the Form, Sub-grid and Application notes are now in **About this
    location**. A custom tab's Unified Interface note is behind an info button in the tab strip.
  - **One message at a time, with "+n more":** things you need to act on share a single slot.
    These are the unread-layer warning (with Retry), the Charts-tab warning, and the orphans
    message (with Show). Dismissing the orphans message is remembered until their number changes.
  - **Properties shows one notice for a button that isn't yours** (out of the box, managed, or
    customized by several solutions). It comes with Customise button, Create override and View
    solution layers. A modern command that replaces the button is the second notice.
  - **Explanations became info buttons or hints:**
    - "Disabled buttons are hidden in Unified Interface" in the rules sections;
    - "enable rules allow fewer step types" in the rule editor;
    - the ampersand note on a URL action's address.
  - **Removed:** the developer note about "Monaco editing … integration path", and the "Your own
    command." bar (its badge says it).
- **Clear empty, loading and error states (#195).**
  - **Before a solution is chosen,** the canvas offered "This tab has no groups yet · Add
    first group". Now it says **Choose a solution to start**, and its button opens the solution
    picker.
  - **With a solution but no table:** **Pick a table**. Choose table opens the tables drawer in
    a narrow window, or puts you in the table search otherwise.
  - **Loading** shows a progress bar, a skeleton in the shape of the canvas, and a status line
    with the table and step.
  - **A failed load** is a titled error with a plain-language cause (for example "Your
    connection may have expired." for a 401) and Retry. The raw details are in a collapsible
    section with Copy details.
  - **Compare with nothing changed** says "No changes since the last publish", with **Show the
    full XML anyway**, instead of a diff of identical XML.
  - **Publish with nothing to publish** is disabled with a reason (see the top bar above).
- **Confirmation dialogs** use the shared dialog shell: 440 px wide, with the confirm button
  red when it deletes or discards something.
- **Badges fit their text (#182).** Fluent's extra-small badge is a 10 px dot, so "NEW",
  "Modern (migrated)", "Hidden by modern", control kinds and app names spilled over their
  neighbours. Text badges are now the small size and never shrink below their text. On the
  Modern command bar, buttons keep their full label and the row scrolls instead of squeezing
  them. Your own Classic tiles are marked with a labelled dot ("Yours: added by your
  customizations") instead of "NEW" text over the label.
- **One button menu everywhere (#182).** Right-clicking a button on the Classic or Modern canvas
  opens the same menu with the same items in the same order:
  - Edit properties, Change icon, Edit labels;
  - Hide or Show, Create override, Customise;
  - Duplicate, **Move to ▸** (a submenu of groups, not one item per group);
  - **Delete…** last, in red, and it asks first.

  It opens at the button, so Shift+F10 and the Menu key work too; it used to open at the top
  left from the keyboard. Notes such as "Microsoft's global command bar buttons can't be
  changed" are headings in the menu, not greyed-out items.

- **Properties says what is selected (#184).** A header stays at the top while you scroll: the
  button's icon and label, whose it is (**Yours**, **Out of the box** or **Managed · solution**)
  and its kind. Its close button clears the selection when docked, or closes the drawer in a
  narrow window (where it replaces the drawer's own). The fields are in collapsible sections
  that remember what you opened:
  - **Appearance:** label, translations, tooltips, icon, Visible, and the **Button ID**;
  - **Position:** the group and the order, with a hint;
  - **Command:** the **Command ID** with **Edit command**;
  - **Display rules** and **Enable rules**, with a count;
  - **Scaling:** the tab it applies to, by name. A note says Unified Interface ignores it,
    instead of a warning box on every button.
  - **Advanced:** kind (now "Split button", not `splitButton`), template alias with a hint, and
    the rest.

  Both ids are read-only with a copy button and the full id in a tooltip. The doubled padding,
  dividers and left border are gone.
- **Show on, rules and binding in Properties (#184).**
  - **Show on** (in Appearance) is one choice, All clients / Unified Interface only / Classic web
    client only, instead of three badges that each added a filter. It shows what the command's
    display rules already say, or **Custom** when they don't match one choice. It names the other
    buttons that use the same command, since they change too. On Microsoft's commands it's
    read-only: customise the command first. Choosing Unified Interface only also removes
    `Mscrm.HideOnModern` from your command, which together with it would hide the button
    everywhere.
  - **Bound rules** are tags: the name opens the rule, ✕ unbinds it. They work from the keyboard;
    the old pills didn't.
  - **Binding a rule or a command** uses a list you can filter by typing, instead of a long
    drop-down. **Bind** stays disabled until you pick one.
- **Properties on Microsoft's buttons is read-only (#184).** Their Label, tooltips, order,
  template alias, languages, icon and images can't be edited directly, and the fields now say so
  ("Customise this button, or create an override, to edit these fields.") instead of looking
  editable. Your own buttons, and Microsoft's once customised or overridden, stay editable.
  Also in Properties:
  - The languages of a button's text are keyboard-reachable tags, and its Image16/32 are links.
    Before, they were click-only badges and raw buttons.
  - "ModernImage (auto)" is now **Modern image**, with a hint saying what it is.
  - The record-open override (OpenRecordItem) and the form note explain themselves behind an
    info button, instead of about 110 words of small text, internal XML paths and an issue
    number. The raw "Tab:" id line is gone.
  - Deleting an orphaned customization you published recently asks in a dialog with a red
    **Delete anyway**, instead of a second inline button.
  - The Hidden, Orphaned and read-only lists use one heading style.
- **Clearer dialogs (#187).**
  - **Hiding a button that isn't yours** offers two plain choices:
    - **Hide this button only:** you can show it again under Hidden by customizations.
    - **Hide it with display rules on its command:** easy to undo, but it hides every button
      that uses the command, and the dialog names them. A button on another location says
      where, e.g. "Edit (main form)", in this dialog and under Show on.

    Display rules are the default only when no other button uses the command. Before, the
    permanent HideCustomAction was the default, and the text was full of jargon.
  - **Discard** in the unpublished-changes and restore-draft dialogs is red and says **Discard
    changes**; **Restore changes** says what it does.
  - **New group** offers the platform's group templates, as Change template does. The made-up
    "Layout3" is gone.
  - **New tab** has one hint instead of two info bars. The id it will get is read-only with a
    copy button, and the location is named in the title ("New tab on the home grid") instead of
    "Location: HomepageGrid".
  - New button, Rename group, Change template, New group, New tab and the two
    unpublished-changes dialogs all use the shared dialog shell. Their actions never leave the
    dialog, and titles are in sentence case. The dialogs' extra entrance animation is removed.
- **The publish dialog says what it publishes first (#188).**
  - **One row per change**, in words, with a badge (New, Change, Move, Show, Hide, Delete):
    "Add **Credit Check** to the main grid and main form", "Hide **Edit** on the main grid".
  - **Same count everywhere:** the top bar's **Publish n changes** and the dialog's primary
    button count these rows, not edits. Five edits of one label are one change.
  - **When Publish is blocked, it says why**, above the changes: no solution, changes that can't
    be published yet, problems the check found, nothing to publish, or publishing everything
    without its confirmation. Problems opens by itself.
  - **Folded away until needed:** Problems, Warnings, Good to know, and Options. Options holds
    what else to publish, the solution version (the switch now comes before the field) and the
    comment. "PublishAllXmlAsync" is no longer shown.
  - **View XML** shows the complete RibbonDiffXml each import writes (your layer with the
    changes merged in) inside the dialog. Going back keeps the comment and the confirmation;
    before, it closed the dialog.
  - **Progress in words** ("Publishing…", "Done", "Failed"). Afterwards it says "Published 2
    changes to CBS Ribbon Test", and that Unified Interface can take up to about 25 minutes to
    show it (Command Checker's **Regenerate ribbon metadata** shows it sooner).
  - The title names what publishes ("Publish CBS Ribbon Test") instead of "Publish to Dataverse",
    and the dialog uses the shared dialog shell.
- **One editor drawer (#186, part 1).** The command and rule editors are views of one drawer
  instead of drawers stacked on drawers.
  - **A rule opened from the command editor** replaces the view, with a **Back** button to the
    command and a trail ("Edit command › Edit enable rule"). One backdrop, never two.
  - **The header says what you're editing** ("Edit command", "Edit display rule"), with the id
    read-only and a copy button. A command also shows whose it is: Yours, Your copy, or
    Read-only.
  - **One Done button**, with "Changes apply as you edit · Ctrl Z to undo". Closing it any way is
    safe: changes already apply as you make them.
  - **One undo step per drawer:** everything changed between opening the drawer and Done is
    undone with a single Ctrl Z.
  - The drawer's body is the only thing that scrolls; the editors' own padded scroll areas are
    gone.
- **The command editor, redone (#186, part 2).**
  - **Its tabs sit in the drawer's header**, so they never scroll away: Actions, Enable rules (n),
    Display rules (n) and Used by (n). The tab you're on is kept while you look at a rule.
  - **Out-of-the-box commands are read-only until you customise them.** Before, editing one
    customised it without asking. The fields look read-only, one line says why, and
    **Customise command** is next to it. Viewing the script and opening a rule still work.
  - **One Add action menu** (Run JavaScript, Open a URL) instead of a dropdown and two buttons.
  - **Each action is a card** with a drag handle, Move up / Move down in its ⋮ menu, and Remove.
  - **View script / Edit script** open the script inside the drawer, filling its height, with
    Back to the command. Edit script saves straight to Dataverse, and says so. The "Monaco"
    wording and the "integration path" note are gone.
  - **Pass parameters** is a labelled switch instead of a button reading "✓ PassParams ON".
  - **Plain labels and hints:** Library, Function ("The function's full name, including its
    namespace."), Parameters, in order; the address error is a field message.
  - **Rename** is a pencil next to your own command's id, with the error under the field.
    Settings and Versions are gone (History in the bottom panel covers the second).
  - **Used by** names each button and where it is ("Main grid › Main › Management").
  - **Rules are tags:** open one with a click, unbind it with its ×. **New enable rule** now also
    adds the rule to the command.
- **Rules, tab display rules and scaling (#186, part 3).**
  - **The editor drawer is 720 px wide for every view**, so it doesn't change width when you open a
    rule from a command and go back. A rule's nested Or steps no longer scroll sideways: parameter
    rows shrink and wrap instead of sizing themselves to their longest option.
  - **The rule view** says "Passes when every step below is true." Steps are numbered, with a
    drag handle and Move up / Move down in a ⋮ menu (the "Drag" text button is gone). The header
    shows the rule's id with copy, **Rename** for a rule that isn't Microsoft's (errors under the
    field; the "Apply ID change" row is gone) and how many commands use it. "In words" heads the
    summary.
  - **Tab display rules open in the editor drawer and apply as you edit.** Save and Cancel are
    gone: Done, and one Ctrl Z undoes everything done there. Steps are numbered cards; on the
    application ribbon Add step offers a table step or a page step. An empty page address is a
    field error (and Publish's check still blocks it). A tab another solution adds says so and is
    read-only.
  - **Scaling is read-only for now (#165).** Changes to scaling could never be published, so the
    Scaling editor is removed until #165 makes them publishable. Properties shows the tab's
    groups and scaling steps, and says scaling only shapes the classic ribbon.
- **XML and Compare in the editor drawer (#186, part 4).**
  - **The XML of your changes opens on the location you're looking at**, not always on the home
    grid, with Unified Interface names on its tabs. Copy, Download, Format and Import this XML sit
    in a toolbar. Import takes the drawer's place instead of opening a dialog over it.
  - **Compare with published** fills the drawer's height; Side by side / Unified are tabs.
  - **History's View diff shows what that change did.** Before, every entry showed everything
    since the last publish while saying it showed the entry's change.
  - **No more "View solution layers".** Its drawer listed every solution in the environment as
    a "layer" of the button, and called the newest the winner, whatever the button was. Dataverse
    layers ribbon customizations per table, not per button; the button's notice still names the
    managed solution and publisher it comes from.
- **List view:** the buttons table no longer runs under the modern commands below it on a short
  window. It's as tall as its rows, up to ten, and scrolls for more.
- **Import RibbonDiffXml in two columns (#187, part 2).**
  - **The editor keeps its height.** Before, it shrank to almost nothing after a preview, as the
    message bars piled up under it. The preview now sits beside it and scrolls on its own.
  - **One line above the editor** ("From Ribbon Workbench or a solution's customizations.xml. Only
    <table>'s part is used.") replaces the 70-word introduction.
  - **The preview counts what it found** ("Preview · 2 changes, 1 problem"), lists each change with
    an Add / Update / Hide badge, and lists every problem in one list instead of a message bar per
    error. A problem with a line ("Line 3: …") moves the editor to that line.
  - **Import says how many changes it brings** ("Import 2 changes") and is off while there are
    errors. Preview becomes "Preview again". After the import there's one Close button.
  - **XML parse errors read as the parser's message**, without the browser's "This page contains
    the following errors" wrapper.
  - The dialog uses the shared dialog shell at its large size.
- **Translations in the editor drawer, applied as you type (#187, part 3).**
  - **No Save or Cancel:** a change applies as you type, and one Ctrl Z undoes the whole edit.
    The base language is still the button's own text (#157) and can't be emptied ("A button needs
    a label."). Other languages are written to the button's labels with the base text kept in
    step; opening it writes nothing.
  - **Languages by name** ("German · 1031") instead of emoji flags, which Windows showed as
    letter pairs. Each language is a card of labelled fields ("Label (German)"), not a raw table
    of browser inputs that turned into white boxes in dark theme.
  - **Add a language** from a list, or by LCID; a language you add stores nothing until it has
    text. Remove one with its delete button, which the keyboard reaches.
  - **A line-break button** in each label field; the hint no longer garbles its own example.
  - **A built-in or another solution's button is read-only here too**, as in Properties.
- **The icon picker, redone (#187, part 4).**
  - **Icons are buttons** in one group the arrow keys move through; Enter picks one. Before they
    were clickable boxes the keyboard couldn't reach.
  - **Regular / Filled are two toggles** whose labels stay put; the switch's label flipped with
    its state.
  - **The selection names the icon** ("Edit · Filled") and the web resource it's saved as, instead
    of a raw `ModernImage="$webresource:…"` string.
  - **Web resources:** the first 300 show, and the count says so ("Showing 300 of 1,240 SVG web
    resources. Search to find others."); before, the list stopped at 200 without a word. The rows
    are buttons, and the field takes a plain name.
  - **Upload SVG is a real drop zone** with a **Choose SVG…** button; before it said "Drag an SVG
    here" and ignored the drop. A file that isn't an SVG is refused with a message.
  - Errors and notes are message bars, and the dialog uses the shared dialog shell.
- **The command palette, redone (#189, part 1).**
  - **A real dialog:** focus stays in it, and Escape or a click outside closes it. Its search box
    is Fluent's, readable in dark theme and with a focus outline.
  - **The highlighted result follows the arrow keys** (Home and End too), stays in view, and is
    announced to screen readers. Enter chooses it.
  - **Choosing a button selects it on the canvas**, on its location and tab; before, it only
    closed the palette. Its line names where it is ("Main form › Main › Management") without raw
    location names or `$LocLabels:` tokens.
  - **Grouped results** (Actions, Buttons, Commands, Rules, Tables) with readable kinds, and a
    count of what's left when a group is cut ("12 more: keep typing to narrow it down").
  - **`/` shows only actions and `@` only tables**; `/` used to filter nothing.
  - **Only actions that can run are listed:** Undo and Redo when there's something to undo or
    redo, Translations for a selected button you can edit, New button when there's a group.
  - **No theme toggle:** the theme follows Power Platform ToolBox's setting.
- **The shared editors, redone (#189, part 2).**
  - **Parameter rows label every field** (Type, Name, Value) and use plain type names ("From the
    context", "Text", "True or false", "Whole number", "Decimal number"). Context values are
    grouped (Context, Record, Selection context, Grid selection, Org/User) instead of one list of
    23. A URL parameter without a name says so under its field instead of showing a coloured dot,
    and true / false is a switch.
  - **Rule steps show friendly names** for the values the XML keeps ("Existing record", "Primary
    table (the form or grid)", "Sub-grid", "User (Basic)", "One-to-many"…), use spin buttons for
    counts and versions ("At least" / "At most"), and explain "If it can't be evaluated" and
    "Invert result" on screen instead of in hover-only tooltips. Their fields wrap in a grid.
  - **Kinds of step have plain names** ("Table privilege", "Your JavaScript", "Column value",
    "Selected records"…), in groups such as Client and device, Form, Table and Your code. The
    step picker searches with a Fluent search box and the arrow keys; the Quick action note is an
    info button.
  - **Provenance actions** (Customise, Uncustomise, Discard) sit in the message bar's actions area.
- **Tables are picked in the top bar (#194, step 1).** The left pane's Tables tab is replaced by a
  Table combobox next to the solution, the first step of Edit mode.
  - **The list** groups the solution's tables as Custom and Standard, with their logical names.
    Typing filters by display or logical name. Alt+↓ opens it, and Escape closes it.
  - **Markers:** the open table shows its number of unpublished changes. Another table with a
    draft saved on this computer shows "Draft", and managed tables show a lock.
  - **Switching** still asks first when there are unpublished changes.
  - **"Choose table"** on the empty canvas opens the list, at any window width.
  - **The left pane** shows Solution Elements only, until the Structure tree arrives (#194,
    step 2).
- **The location's tabs, groups and buttons are a tree in the left pane (#194, step 2).** The left
  pane has two tabs: **Structure** (the default) and **Solution**, which shows Solution Elements
  as before. The ribbon tab strip above the canvas is gone.
  - **The tree** shows tab › group › control for the location you're on. Groups show how many
    controls they have, and controls show their Sequence or **Hidden**, a dot for yours, and are
    listed in Sequence order.
  - **Choosing a node** (click or Enter) shows that tab on the canvas, or selects the group or
    control on the canvas and in Properties. A selection made on the canvas is shown in the tree,
    with its group opened. The arrow keys move through the tree.
  - **Each node has a menu:** right-click, Shift+F10, the Menu key, or its **⋯** button. A tab's
    menu has Rename…, Tab display rules… (with the rule count), Add group…, Move up / Move down
    and Delete tab…. Groups and controls have the same menus as on the Classic canvas; a group's
    menu now also has **Add button…**. F2 renames a tab or group, or says why it can't be renamed.
  - **Filter** by label or id: a match's tab and group stay open.
  - **Add tab** is next to the filter. How Unified Interface shows a custom tab is behind an info
    button in the location row.
  - **Below 1200 px** the rail button opens Structure and Solution as a drawer. Choosing a group or
    control closes it and opens Properties; a node's menu keeps it open.
- **Group cards (#194, step 3).** A new **Group cards** view, the default for anyone who hasn't
  chosen a view: a card per group of the tab, with its template, and its buttons in Sequence order.
  - **Rows** show the icon, the label, **Hidden** or **Yours**, and the Sequence. Click a row (or
    Enter) to select it; right-click, Shift+F10 or the Menu key opens the button's menu.
  - **Drag rows** to reorder them or move them to another card, with the pointer or the keyboard:
    Space picks a row up, the arrow keys move it, Space or Enter drops it and Escape cancels. A
    button that isn't yours moves as your copy, as on the Classic canvas (#26).
  - **Each card's ⋮ menu** is the group menu: Add button…, Rename…, Duplicate group, Change
    template…, **Move left / Move right** and Delete group. **+ Add button** is at the foot of the
    card.
- **"How users see it" (#194, step 4).** Above the group cards, the tab's commands as the Unified
  Interface command bar lists them: groups and buttons in Sequence order, without the ones your
  customizations or a modern command hide, a button a migrated modern command replaces under that
  command's name, and the visible modern commands among them. What doesn't fit goes into a **⋮ n**
  menu, as in Unified Interface, and the selected command is always in view. Choosing a command
  selects it on the cards, in the tree and in Properties. It's marked **Preview: rules not applied**:
  display and enable rules are evaluated by Simulate mode (#191).
- **Visual pass, part 1 (#229).** From screenshots of CBS in PPTB Desktop at 1024 and 1920 px:
  - **Properties of a button that isn't yours** shows its Label and tooltips as the canvas does
    ("Save And New", not `Ribbon.Form.MainTab.Save.SaveAndNew`), in fields that look read-only; the
    key they come from is the field's hint.
  - **Placeholders and resource keys read as words:** the application ribbon's
    `{!EntityPluralDisplayName}` tabs show "‹table name, plural›", and keys such as
    `WebResource_Tab_Caption` or `Mscrm_…_ToolTipTitle` show "Web Resource" or the button's name.
  - **No content text below Caption 1 (12 px):** small text, badges and counters are a size up across
    Edit mode, the panes, the bottom panel and the dialogs (the Classic canvas's tiles excepted).
  - **The bottom panel's grids no longer scroll sideways** because of their own vertical scrollbar.
- **Visual pass, part 2 (#229):** every dialog, the editor drawer's views and the publish dialog,
  from screenshots in PPTB Desktop at 1024 and 1920 px.
  - **Dialogs open on the right control.** New button, New group, New tab and Rename start in their
    name field, not on the close button. Unpublished changes from an earlier session start on
    **Restore changes**, so Enter keeps your work instead of discarding it.
  - **Small dialogs' buttons fit on one line** ("Create group", "Change template" no longer wrap).
  - **Choose a web resource** (from Properties or a JavaScript action) uses the same dialog as the
    rest of CBS. Its list fills the dialog at any window size, Enter chooses a row, and Cancel or Close
    never delivers a choice later.
  - **Below 1200 px, Properties opens under the top bar**, so Publish, Search and the tools stay in
    reach while you edit.
  - **The List view's header sticks to the top edge;** rows no longer show above it as you scroll.
  - **Rule steps fit the drawer:** a step's dropdowns no longer run out of its box, and the step
    list opens inside the drawer.
  - **Translations:** Label, Tooltip title and Tooltip body line up at the top.
  - **The publish dialog** shows **What Publish imports** wide, and Solution version at the size of
    the fields around it.
  - **Icon names wrap between words** ("Clipboard / Paste", not "ClipboardPast / e").
  - **Help lists the shortcuts** one to a line. **Compare** shows a count of none in neutral, not
    red. The bottom panel's grids say they fill in once the ribbon loads, instead of "No
    commands." while it loads. One level into the editor drawer, the header no longer repeats the
    Back button's name.
  - **The URL Action Composer is gone.** Nothing opened it, and URL actions are edited in the command
    editor.
- **Visual pass, dark theme (#229):** every view, the panes and the dialogs captured with PPTB in
  dark.
  - **Button images read in the dark theme.** Ribbon images are drawn for a light command bar, so dark
    glyphs (Sequences, AI Builder) nearly vanished. An image whose visible pixels are dark is now
    shown inverted, in every view including the Classic ribbon; coloured and light images (Power BI,
    Launch playbook) are shown as drawn.
  - **The List view's Modern badge stays in its column:** after a long label, it ran into Kind.
- **The bottom panel's Commands and rules are grids (#185).** Hundreds of rows stay quick
  (virtualized), the header stays put while the rows scroll, and nothing scrolls sideways: ids are
  cut to their column with the whole id in a tooltip.
  - **A command's rules are tags** that show the part of the id that tells them apart
    (`ExactlyOneSelected`, not `EnableRule`), and open that rule.
  - **One target per row:** a click or Space marks the row, **Edit**, Enter or a double-click opens
    the editor. The rules' constant Type column is gone.
  - **Counts** are badges on the tabs; a tab opens a collapsed panel.
  - **Used by** counts the same way as the Solution tab: a command by the tabs, groups and controls
    that use it, a rule by the commands that list it, per kind.
- **Search fields are SearchBoxes (#185),** with a clear button: the bottom panel's filters and the web
  resource browser's search.
- **The Solution tab's + makes a New enable rule or a New display rule (#185),** not always an enable
  rule. Template rows are plain rows, and branch counts are badges.
- **The List view fits and sorts (#183).** The grid is as tall as its rows, so only the canvas
  scrolls, with the header kept in view; nothing scrolls sideways at 1024 px.
  - **Columns:** #, Label (with its icon, and the id in its tooltip), Kind (`Split button`, not
    `splitButton`), Group, Visible and **⋯**. ID and Command are in the **Columns** menu.
  - **Sorting** works on every column; rows start in the order the tab shows them.
  - **Rows are selected** with a click or Enter, as everywhere else (no radio buttons); the row's
    menu is the button menu (**⋯**, right-click, Shift+F10).
  - **Modern commands** are a collapsible section below the grid, with columns that truncate
    instead of scrolling sideways.
  - **Menus no longer select what they're opened on,** in the List and on the group cards: in a
    narrow window that opened Properties, which took the focus and closed the menu.
- **The Solution tab is one tree (#194, step 5).** Buttons, Commands, Rules and Templates are
  branches with a count, searched together; a branch with matches opens. Each row shows the part of
  its id that tells it apart (e.g. `ExactlyOneSelected`, not `EnableRule`), with the whole id as its
  description, and how much it's used (`used 3×`, Enable / Display). A branch lists 100 rows at a
  time (**Show n more**), so the 498 commands of a table open at once. Choosing a command or rule
  opens its editor; a button is selected, and its menu (right-click, Shift+F10 or ⋯) has **Go to
  button** and **Add to** each group of the open tab, which adds your copy of it there. **+** makes a
  new command or rule.
- **Two rail buttons below 1200 px (#194).** **Structure** and **Solution** each open the left pane
  as a drawer on that tab.
- **Groups can be moved within their tab (#194).** Like tabs (#163), a group your customizations add,
  or a new one, gets a Sequence between its new neighbours and the publish writes it. Two other
  groups can't change places, so Move left / Move right are off there and say why. In the Structure
  tree they read **Move up / Move down**.
- **A moved button is placed in Sequence order (#194).** Dropping a button before another now
  places it among the destination group's buttons in Sequence order, the order Unified Interface
  shows, not the order the ribbon XML happened to list them in.

### 🔧 Fixed

- **Compare's XML diff is coloured (#195).** With a table open and a change pending, Compare
  showed most of the XML without syntax colours: the editor painted before the colours were
  ready and didn't repaint. It now repaints when they arrive.

## [0.8.0] - 2026-11-01

Publish correctness and load performance. Tables open faster, and built-in buttons show captions
and icons. The pre-publish check catches what the import would reject. Saved web resources are
published, and tab reorders, duplicates and Kind changes publish as shown. This release is
0.8.0-beta.1, whose notes below are the full list. Requires Power Platform ToolBox 1.2.7 or
later, as 0.7 does.

### Highlights

- **Faster tables (#151, #4):**
  - Provenance takes one query instead of one per component (about 0.2 s instead of 3.6–5.3 s
    for account or contact).
  - Metadata is read in batches, and the application ribbon is reused between tables.
- **Built-in buttons show captions and icons (#6).** The texts managed solutions define are
  read with each table, and about 80 out-of-the-box icons map to Fluent icons. These are for
  display only.
- **Nothing is written that the import would reject (#153, #154, #155):**
  - empty rules, single-branch OrRules, missing functions or libraries, and bad numbers are
    caught before the publish;
  - a Kind change keeps only valid attributes;
  - a tab has exactly one display rule.
- **Publish behaviour:**
  - saved scripts and icons are published (#156);
  - Translations and Properties agree on the base language (#157);
  - web resources are referenced with `$webresource:` (#158);
  - typed `$LocLabels:` references are kept (#159).
- **Tabs and duplicates:**
  - reordering tabs publishes (#163);
  - duplicates are placed where they're shown and get your publisher prefix (#164);
  - dynamic flyouts' populate commands are checked (#133).
- **Publish dialog and shell:**
  - "Also publish all customizations" needs its own confirmation (#109);
  - the top bar has no controls that do nothing, and narrow panes keep the canvas usable (#22).

### ⚠️ Upgrading from 0.7.x

- **Changes you'll notice:**
  - **Top bar:** the State simulator, Save and Settings controls are gone. Drafts are
    automatic, and Ctrl+S opens Publish.
  - **Kind:** a loaded control's Kind is locked.
  - **Tab rules:** **Tab rules** edits a single rule.
- **Nothing else changes:** the PPTB requirement and the published format are the same.
- **0.7.x is end of life:** 0.7.0 is deprecated on npm and gets no support window, because
  0.8.0 needs the same PPTB (see `SECURITY.md`).
- **Known issue:** a few platform resource keys without dots still show as raw keys on the
  canvas, e.g. `OpenAllRecordsViewImageButtonText` (#201).

## [0.8.0-beta.1] - 2026-10-25

The first beta of 0.8.0 (npm `beta`), on publish correctness and load performance:
- tables open faster;
- built-in buttons show captions and icons;
- the pre-publish check catches what the import would reject;
- saved web resources are published;
- tab reorders, duplicates and Kind changes publish as shown.

It includes everything in 0.7.0-beta.3. Requires Power Platform ToolBox 1.2.7 or later.

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

- **Reordering tabs publishes (#163).** Dragging a tab changed only the canvas, so the
  publish had nothing to publish and the order reverted. A new tab, or one your
  customizations add, now gets a Sequence between its neighbours, and that Sequence is
  published. Reordering another solution's tabs is reported, since only their Sequence
  orders them. When there's no free Sequence between two tabs, the tab is shown where it
  will publish.
- **Duplicates are placed where they're shown (#164).**
  - **Placement:** a copied button, menu item or group gets a Sequence between its
    original and the next item (it used to get the original's + 5, which could collide
    or pass the neighbour). When built-in neighbours leave no room, the copy is shown
    where it will publish.
  - **Ids:** a copy of another solution's element starts with your publisher prefix.
  - **Solution Elements:** a button dropped from there goes after the group's last button.
  - **Pre-publish check:** it warns when sibling customizations share a Sequence.
- **A dynamic flyout's PopulateQueryCommand is checked (#133).** A command that's misspelled
  or defined nowhere, which left the drop-down empty, is reported. A copied flyout
  carries its populate command.
- **Smaller fixes:**
  - A ribbon package without `RibbonXml.xml` fails with a clear error instead of loading
    an empty ribbon (#168).
  - An imported group's `Command` (and its definition) and a Scale step's `PopupSize` are
    no longer dropped (#169).
  - Starting a Download in the XML drawer clears an earlier Copy message (#150).
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

## [0.7.0] - 2026-10-24

Publish safety and correctness. A publish follows the connection and names the environment it
writes to. It keeps changes made or imported elsewhere and the publisher's details, and cleans up
exactly what a delete leaves unused. **Show on Unified Interface** now targets Unified Interface.
This release is 0.7.0-beta.1 to beta.3, and their notes below are the full list. Requires Power
Platform ToolBox 1.2.7 or later, as 0.6 does.

### Highlights

- **Safety:**
  - A publish follows a PPTB connection change and never continues into the newly selected
    environment (#120).
  - Every write names its environment, and Production asks for a typed confirmation (#121).
  - Uploads ask before replacing a web resource.
- **Changes made elsewhere are kept:**
  - A change published elsewhere during a publish isn't overwritten; the publish stops and says
    what changed (#102).
  - Ribbon changes imported elsewhere but not published are published first and kept (#103).
- **Correctness:**
  - The publisher's e-mail, website and addresses are kept (#104).
  - The base language is never assumed (#106).
  - Deletes clean up exactly what they leave unused (#108).
  - Copies keep labels other solutions define (#137).
  - An unreadable layer is reported, with Retry (#110).
  - Dynamic flyouts can be published (#101).
- **Unified Interface filter (#152):** **Show on Unified Interface (Modern)** adds
  `Type="Modern"`. The old filter added `Refresh`, which hid the button in Unified Interface.
- **Editor:**
  - XML drawer Copy and Download work in both hosts (#122).
  - Shortcuts work with Shift, Caps Lock and other keyboard layouts (#123).
  - Drafts (#129) and the Tables list (#5) are fixed.
  - Rename is offered only where it can be published (#33).
- **Dependencies:** `npm audit` reports 0 vulnerabilities (#117).

### ⚠️ Upgrading from 0.6.x

- If you used **Show on Unified Interface (Refresh)**, the command has a
  `<command id>.Refresh.DisplayRule`, and the button is hidden in Unified Interface. Click
  **Show on Unified Interface (Modern)** to replace it, then publish (#152).
- Nothing else changes: the PPTB requirement and the published format are the same.
- **0.6.x is end of life:** 0.6.2 is deprecated on npm and gets no support window, since 0.7.0
  needs the same PPTB (see `SECURITY.md`).

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

