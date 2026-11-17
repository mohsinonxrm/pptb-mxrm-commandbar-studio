# Unified Interface command bar: recorded ground truth (#192)

**Recorded on:** 2026-10-29, CRM279420 (Dataverse 9.2.26092.168), Sales Hub. Using
`&ribbondebug=true`, at emulated widths of 1920, 1280 and 820 px.

**Fixtures:** in `src/__fixtures__/uci-preview/` (one per location), checked by
`src/__tests__/uciPreviewFixtures.test.ts`. They are the target for the #191 preview model.

| Location | Fixture | Page | Bar `aria-label` | `data-id` prefix |
|---|---|---|---|---|
| Main grid | `contact.HomePageGrid.json`, `account.HomePageGrid.json` | My Active Contacts / Accounts | `<Table> Commands` | `contact\|NoRelationship\|HomePageGrid` |
| Main form | `contact.Form.json` (existing, new and inactive record) | Contact form | `Commands` | `contact\|NoRelationship\|Form` |
| Sub-grid | `contact.SubGridStandard.json` | Contacts sub-grid on the account form | `Contact Commands` | `contact\|NoRelationship\|SubGridStandard` |
| Associated view | `contact.SubGridAssociated.json` | Account → Related → Contacts | `Contact Commands` | `contact\|NoRelationship\|SubGridAssociated` |

`cbstest_ribbontest` isn't in any app on this org, so contact (a test entity) and account were
recorded instead.

**The merged ribbon behind them** is in `ribbon/contact.All.xml` and `ribbon/account.All.xml`:
RetrieveEntityRibbon with the `All` filter, saved 2026-11-15 with the unmanaged layer empty. Use
`All`, as CBS does: on contact's main grid, the `HomepageGrid` filter leaves out Merge's
CommandDefinition and returns New's with other display rules. Since the 2026-10-29 recording,
Microsoft has added `Mscrm.QuickCampaignModernizationDisabled` to Quick Campaign's display rules.
The other commands recorded on contact's main grid (the fixture with rules) are unchanged.

**The probe** (`contact.HomePageGrid.probe.json`, 2026-11-15) records your own commands on
contact's main grid: the RibbonDiffXml in `probe/contact.HomePageGrid.RibbonDiffXml.xml`, three
JavaScript modern commands, RetrieveEntityRibbon's merged order and the bar with 0 and 1 rows
selected. The probe was imported into CBSLiveTest and removed again afterwards. Both are checked
by `src/__tests__/uciPreviewProbe192.test.ts`.

**Command Checker** (`commandChecker/2026-11-15.json`, 2026-11-15): for the main grids, contact's existing
and new form, and the Contacts sub-grid and associated view on an account, each command's flags
(shown, hidden, hidden by selection) and its rules with the True/False Command Checker listed. The
preview model (below) is checked against it by `src/__tests__/uciPreviewModel191.test.ts`.

## How the bar is built

1. **One flat bar.** The tabs and groups of the location's ribbon flatten into one list. No
   group or tab title shows anywhere (also checked live on #135).
2. **Order:**
   - **Tab, then group, then control:** tabs sort by tab Sequence, then groups by group
     Sequence (in every recording the merged groups were in Sequence order).
   - **Within a group:** controls appear **in the order RetrieveEntityRibbon returns them**,
     not by Sequence. In contact's ExportData group, `ImportDataFromExcel` (Sequence 21) comes
     after `ExportSelectedToExcel` (230) in the XML, and renders in that position. The
     preview model has to keep the merged document order.
   - **Several tabs** can contribute to one bar (e.g. `Related@120` → Quick Campaign comes after
     every `MainTab@100` command).
   - **Your own CustomActions (probe):** the merge puts an added control **before the first
     existing sibling, in document order, whose Sequence is greater**, or at the end if none is.
     It isn't a sort: in ExportData, a button at Sequence 22 goes before Run Report (30), not
     after Import from Excel (21), and one at 45 goes before Export Selected (230). The bar then
     shows the merged document order.
   - The added group (`{tab}.Groups._children`) and MaxSize step (`{tab}.Scaling._children`)
     land where the rule puts them. Those lists were already in Sequence order, though, so they
     don't tell the rule apart from a sort.
   - **Not recorded:** an added control with the same Sequence as an existing one. "Greater" is
     inferred, not seen.
3. **Modern commands go into the classic bar by their sequence.** `appaction.sequence` encodes a
   classic position: `1,000,000,000 + (tabSequence − 100) × 1,000,000 + groupSequence ×
   10,000 + controlSequence`. For example, `Mscrm.HomepageGrid.contact.NewRecord` is
   1,000,100,010 and `RefreshModernButton` is 1,000,110,017 (spike #206).
   - **A new modern command** goes into the group its sequence names, **before the first
     command there, in merged document order, whose Sequence is greater**: the merge's rule.
     The probe's 1,000,500,100 (ExportData, 100) shows it. In ExportData, the first command with
     a Sequence above 100 is Export Selected (230). It isn't shown with nothing selected, so the
     modern command appears just before Import from Excel. 1,000,100,027 lands after the probe's
     Mgmt26, and 1,000,500,023 after its Seq22.
   - Seen live, not in the fixture: Command Checker lists them the same way, inside the classic
     group (Modern27 under Management).
4. **System items that aren't in the ribbon:**
   - **Main grid:** Focused view (`changeVisualization-…`) and Show Chart (`ShowChartPane`)
     come first.
   - **End of the bar:** Open Dashboards (`OpenEntityDashboard`), then Command checker, come
     last on grids. Command checker is also last on forms, sub-grids and associated views.
   - **Associated view:** it adds Show Chart first.
   - **Sub-grid:** it adds "See the records associated with this view"
     (`<Grid>-navigateToAssociatedGrid-<relationship>-0`) before Command checker.
5. **Overflow:**
   - **Order is kept:** the bar's order is kept, and items move from the end of the bar into
     ⋮ (asserted by the tests: same order at every width).
   - **How many stay visible:** it depends on the width available *to that bar*. On the
     contact grid at 1920, 1280 and 820 px:

     | Selection | 1920 px | 1280 px | 820 px |
     |---|---|---|---|
     | None | 11 | 6 | 3 |
     | 1 or 2 rows | 12 | 7 | 3 |

     The form shows 12, 6 and 3 at those widths. The associated view shows 10 (all), 6 and 3
     with no selection, and 12, 7 and 4 with a selection.
   - **Sub-grid:** its bar is sized by the sub-grid card, not the window. At 1920 and 1280 px
     the Contacts sub-grid is a narrow third column and *every* command is under ⋮. At 820 px
     (one column) one fits.
   - **No ⋮ when everything fits:** new contact form at any width; associated view at
     1920 px with nothing selected.
6. **Rendered kinds:**
   - **FlyoutAnchor:** renders as a menu (chevron).
   - **SplitButton:** usually renders as a split (`$splitButtonId` part). Exceptions:
     - `DeleteMenu` (SplitButton) renders as a **plain button** on the grid;
     - `Send` (Email a Link) is a split with nothing selected, but a plain button once a row
       is selected.
7. **Selection changes the whole bar (main grid):**
   - **No selection:** New, Delete, Refresh, Visualize this view, Email a Link, Run Flow,
     Run Report, Excel Templates, Export to Excel, Import from Excel, Quick Campaign.
   - **One row:** Edit, Activate, Deactivate, Delete, Merge, Sequences, Open org chart, Add to
     Marketing List, Assign, Share, Email a Link, Follow/Unfollow, Run Flow, Run Report, Word
     Templates, Export to Excel (selected), Quick Campaign.
   - **Two rows:** the same minus Open org chart and Word Templates (both
     `SelectionCountExactlyOne`).
   - **Sub-grids and associated views:** two rows selected is one row minus Word Templates.
   - **The rule (Command Checker, 2026-11-15):** with rows selected, a command is "hidden by
     selection" when its enable rules have no SelectionCountRule (at any depth; `Mscrm.AnySelection`
     has one) **and** no item of its menu has one. It's not about the control's kind: Excel
     Templates (a flyout filled when opened, no items of its own) and Import from Excel (a split
     button whose items don't count the selection) are hidden by it; Email a Link (a split button
     whose "Of Selected Items" counts it) and Quick Campaign (whose items do) aren't. Every item
     Command Checker listed with a row selected (account and contact grids, sub-grid,
     associated view) matches this. Command Checker says it too: such a command "is not an
     item-level command: item-level commands have a SelectionCount rule".
   - **Your own commands (probe):** with a row selected, the probe's plain buttons and its new
     modern commands (no rules of their own) all disappear. The one button whose command has
     `Mscrm.AnySelection` stays, and also shows with nothing selected.
8. **Row menus (quick actions):**
   - **Card-list sub-grid:** each row has its own ⋮ (nothing needs to be selected). It lists
     the selected-row commands that are **plain buttons**, in **reverse** bar order: Export to
     Excel first, Edit last. Flyouts and split buttons (Quick Campaign, Run Flow, Run Report,
     Word Templates) are left out. The order is the same whether the menu opens up or down,
     and the items carry no `data-id`. Fixture: `rowMenu` in `contact.SubGridStandard.json`.
   - **Main grid:** no row menu; right-click only focuses the cell.
9. **Inactive (read-only) form:** the form shows "Read-only: This record's status: Inactive".
   On the bar:
   - Save and Save & Close are gone;
   - Activate replaces Deactivate. Activate (Sequence 50) comes before Open org chart (52),
     and Deactivate (60) after it, so document order still explains the position;
   - Add to Marketing List and Sequences are hidden;
   - everything else keeps its place.

## The preview model (#191, phase B)

`src/services/uciPreview/` turns a location's ribbon into the bar above. Simulate mode (phase C)
will draw it; "How users see it" already uses its order.

- **Order (`bar.ts`):** tabs and groups by Sequence; controls in merged document order. When the
  ribbon is parsed, each control records its group and its place there (`source.position`). A
  control still in that group, with the Id and Sequence it was loaded with, keeps its place; any
  other (new, moved, re-sequenced or copied) goes where the merge will put it (point 2). So
  publishing, or the store sorting a group after a move, doesn't change the order. Modern commands go into the group their sequence names (point 3,
  also below a tab Sequence of 100: a form's main tab is 10). The chart designer's contextual tab
  (`…VisualizationTab`) is left out: Command Checker lists it under `Mscrm.ContextualCommandBar`.
  System items lead and close the bar (point 4).
- **Rules (`rules.ts`):** each step is evaluated for the page, the selection or form state and the
  web client (Modern, Web, online, no Outlook, no legacy page), or it can't be simulated and says
  why: custom JavaScript, the organization's features or settings, the record's data or access,
  the sub-grid's relationship. Entity and miscellaneous privileges are assumed held only for a
  System Administrator; a record's own privileges (`RecordPrivilegeRule`) never are, since an
  inactive record denies Write even to an administrator. A rule that comes out False without
  any assumption stays False. A rule no
  ribbon defines is ignored: Word Templates shows on the grid although its
  `Mscrm.IsFolderNotSelected` isn't defined. False wins an AND, true wins an OR, and an unknown
  stays unknown when inverted.
- **Recorded outcomes (`recordedRules.json`):** where CBS can't evaluate a rule, or assumed a
  privilege, Command Checker's outcome for it on CRM279420 (a System Administrator, Sales Hub)
  stands in for that page and selection or form state, for any entity (a value that differed
  between entities is kept per entity). Recorded on 2026-11-15 for contact and account, and on
  2026-11-16 for case, opportunity, lead, quote, order, invoice, product, the Activities grid and
  the new forms of those and of email, task, phone call and appointment. A rule none of whose steps depends on
  the page, selection or form state (features, settings, client type) uses a recording from any
  page; one with entity or miscellaneous privileges too, from any state of the same page. It's generated from
  `src/__fixtures__/uci-preview/commandChecker/*.json` (one file per day), which hold each command's rules as Command
  Checker listed them. Only a group's own controls count: the items of a menu nobody opened list
  values for another state (with a row selected, the Delete item under Delete lists
  `Mscrm.SelectionCountAtLeastOne` as False). A rule two commands list differently in one context
  is left out: Save, now a modern command, lists `Mscrm.CanSavePrimaryEntityType` as True and Save
  as Complete lists it as False. Command Checker evaluates a command's rules until one is False
  and lists the rest as "Skipped", so a hidden command's later rules are never recorded.
- **Two of Unified Interface's own readings:** it treats the Activity entity (`activitypointer`)
  as an activity, though its metadata says it isn't (`Mscrm.PrimaryIsNotActivity` is False on the
  Activities grid), and the model does too. On a new email form it lists `Mscrm.PrimaryIsActive`
  (`FormStateRule Existing`) as True beside `Mscrm.FormStateNotNew` as False; the model keeps the
  rule's definition, and the recorded table has email's value (`RULE_EXCEPTIONS` in the tests).
- **What the second capture changed** (2026-11-16, commands CBS can't tell about, before → after):
  Case's new form 19 → 2, Email's 18 → 3, Order's 4 → 2, opportunity's existing form 10 → 2,
  the Activities grid 8 → 0, opportunity's grid with a row selected 3 → 0. The rest are mostly the
  Outlook mail app's buttons, whose later rules Command Checker skipped.
- **Agreement:** on all 31 captured pages, every rule CBS works out without a recording agrees
  with Command Checker, command by command. The one that didn't,
  `Mscrm.ShowOnInteractionCentricHideOnModern` (True only through `DeviceTypeRule
  InteractionCentric`), made that device type "can't simulate".
- **Another command:** Unified Interface runs a few controls through a command other than the
  ribbon's: Show As (`ChangeDataSetControlButton`) through `Mscrm.Disabled`, on every grid and
  sub-grid captured, so it never shows. The model hides it. On a main grid whose view has more
  than one control, Unified Interface's own Show As leads the bar instead (Simulate's **First
  item**, below); a sub-grid's Show As wasn't recorded.
- **Known gaps** (`KNOWN_GAPS` in the tests): on the recorded bars, the model can't decide
  Quick Campaign with a row selected, and the Outlook mail app's form buttons, because no outcome
  was recorded for a rule they need there. Apart from those, each bar comes out as recorded.
- **Privileges aren't simply held by an administrator:** on the account grid, a System
  Administrator with every privilege at Global depth gets `Mscrm.HomepageGrid.account.Relationship`
  (privileges on relationship roles) as False, so Relationship never shows (checked by hand with
  a row selected). The capture of that state missed the end of Command Checker's list, so no
  recording corrects it: the model shows Relationship there (`KNOWN_WRONG` in the tests).
- **Selection (`hiddenBySelection`):** point 7.
- **Not recorded:** two rows selected and the inactive form (only one contact and one account
  existed on 2026-11-15, one opportunity on 2026-11-16), nor other entities' existing forms and
  selected rows, so a custom rule there can't be simulated.
- **Metadata cache:** on 2026-11-15, hours after the probe was removed (the server's ribbon had
  none of it), Command Checker on the contact grid still listed the probe's buttons, and still
  did after Regenerate ribbon metadata and publishing contact. Unified Interface's cached
  command-bar metadata in that browser hadn't caught up; the tests skip ids the saved ribbon
  doesn't have.

## Simulate mode (#191, phase C)

**Edit ⇄ Simulate** (the switch in the location row, Ctrl+Shift+M) swaps the canvas for a
Dynamics 365 page with the location's command bar as a System Administrator gets it in Unified
Interface on the web, from the model above. The page around the bar is illustrative; the bar is
drawn to Unified Interface's measurements (CRM279420, 2026-11-15): a white card 44 px high with
8 px corners, 32 px commands with 16 px icons and 14 px Segoe UI, and the commands that don't
fit under a ⋮ button 44 px wide, last ones first.

- **The simulation strip** sets what the rules see: the rows selected (main grid, sub-grid), the
  record's state (form), sub-grid or associated view, the page's width, and whether hidden
  commands are listed (struck through, with why). Commands CBS can't tell about are dashed and
  say what they depend on; your own carry a dot.
- **First item** (main grid): Unified Interface leads the bar with Focused view (Sales Hub, on
  account, contact, quote, order, invoice and product; lead opens in it), with Show As where the
  view has more than one control (opportunity, case), or with neither. The app and the view set
  it, not the ribbon, so it's a choice in the strip.
- **Split buttons** are drawn split only while the menu offers something: Delete is plain with no
  rows selected (its Delete item needs a selection, Bulk Delete is hidden), and Email a Link is
  plain with rows selected (its Of Current View item doesn't count them). All 25 split buttons on
  the recorded bars agree (`drawnAs`).
- **Labels:** Unified Interface's text for platform labels where it was recorded
  (`resourceLabels.json`), managed solutions' LocLabels as CBS reads them (#6), and labels that
  take the entity's name (`$LocLabels(EntityDisplayName):`, Customer Service's "New {0}") with it
  filled in.
- **The entity's properties** (`EntityPropertyRule`: has activities, notes, connections, a
  statecode…) are read once per entity, so those rules are evaluated, not "can't tell".
- **Activities:** every activity's list (email, task, phone call, appointment) is the Activities
  grid, with the Activity entity's (`activitypointer`) bar, not the activity's own. Simulate says
  so on an activity's main grid; open the Activity entity to simulate it. An activity's form and
  sub-grids are its own.
- **The app:** a classic ribbon is the same in every app; a button that differs by app does so
  through custom JavaScript, whose outcome was recorded in Sales Hub. Modern commands follow the
  app chosen in the Modern commands view.

## Against the documented behaviour (#191, #192 review comments)

| Documented | Recorded |
|---|---|
| Selection hides commands without a SelectionCountRule unless they use `Mscrm.AnySelection`; flyouts and split buttons are exempt (KB 4481268) | **Holds, but the exemption is about menu items, not the control's kind.** New, Refresh and Visualize this view disappear on selection. Delete, Run Flow and Run Report (`AnySelection`) stay. A flyout or split button stays only when an item of its menu counts the selection (Quick Campaign, Email a Link); Excel Templates and Import from Excel don't have one and are "hidden by selection" in Command Checker (point 7). |
| `Mscrm.HideOnModern` commands don't show, and Command Checker doesn't list them | **Confirmed** (Detect and Copy on contact's grid; live check 2026-10-28, see #192 and #36). |
| A HideCustomAction removes a command | **Confirmed** (the probe hides Quick Campaign; it's gone with 0 or 1 rows selected). |
| Not ribbon-defined: Create view, Help, See all records, Share, Show as, Show Chart, Open Dashboards | **Partly.** Show Chart, Open Dashboards and See all records were recorded as system items. Share **is** ribbon-defined here (`Mscrm.HomepageGrid.contact.Sharing`). Focused view is a system item too. |
| Sub-grids show only Add, Show List and Delete; their names and icons can't be changed (Ribbons available) | **Not on this org.** The Contacts sub-grid offers the full `Mscrm.SubGrid.contact` set: Add New, Add Existing, Refresh, Quick Campaign, Run Flow, Run Report, Excel Templates, Export; with a selection, Edit, Activate, Deactivate, Delete, Merge, Assign, Share, Email a Link, Follow, Word Templates and Export Selected. Labels carry the entity name ("Add New Contact", "Delete Contact"). **Their names, icons and commands can be changed:** an override of `Mscrm.SubGrid.contact.AddNewStandard` changed its label, tooltip, `ModernImage` and command on the sub-grid (#167, 2026-10-29). |
| Only a few commands show, the rest are in a flyout | **Confirmed**; the counts are in point 5 above. |
| Tabs and groups have no visual indication | **Confirmed.** |

## Other observations

- **A HomepageGrid id on a form bar:** `Mscrm.HomepageGrid.contact.MBPF.ConvertTo` (Process)
  renders on the contact **form** bar.
- **Unsupported control types:** Label, ToggleButton, DropDown, CheckBox, Spinner, ComboBox
  and TextBox render as empty 0×0 items. Only Button renders (#37, live 2026-10-28).
- **Metadata refresh:** Unified Interface keeps serving the previous command-bar metadata for a
  long time after a ribbon import or an `appaction` change: up to about 25 minutes, after
  Command Checker → Regenerate ribbon metadata plus a metadata version change. Before each
  recording, check the bar shows the expected state (#188, #192).
  - **On 2026-11-15** the probe's classic changes showed at once after importing and publishing
    twice, as CBS publishes. So did the two modern commands created before the first visit to
    the app.
  - A modern command created a minute after that visit took about 20 minutes to appear. In the
    meantime, publishing the entity, publishing the app, re-importing and clearing the page's
    IndexedDB and Cache Storage (a hard refresh too) didn't show it: the server serves what it
    built.

- **Sub-grid layout depends on its width:** in a narrow form column the sub-grid is a card
  list (hover an avatar to get its row checkbox; clicking the avatar opens the record). At
  820 px it is a grid with row checkboxes. Resizing re-renders the form and clears the
  selection.
- **Unstable system id:** the trailing index of
  `<Grid>-navigateToAssociatedGrid-<relationship>-N` changes between page loads (`-0`,
  `-2`). The fixtures record it as `-0`; match it by prefix.

## Not recorded

- **Forms the user can't edit for security reasons** (as opposed to inactive records): the
  test user is a System Administrator, and a second licensed user would be needed. They're left
  out on purpose: the inactive form already records the read-only bar, and privilege rules are
  "can't simulate" in the preview anyway.
