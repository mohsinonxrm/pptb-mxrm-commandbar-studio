# Unified Interface command bar: recorded ground truth (#192)

**Recorded on:** 2026-10-29, CRM279420 (Dataverse 9.2.26092.168), Sales Hub. Using
`&ribbondebug=true`, at emulated widths of 1920, 1280 and 820 px.

**Fixtures:** in `src/__fixtures__/uci-preview/` (one per location), checked by
`src/__tests__/uciPreviewFixtures.test.ts`. They are the target for the #191 preview model.

| Location | Fixture | Page | Bar `aria-label` | `data-id` prefix |
|---|---|---|---|---|
| Main grid | `contact.HomePageGrid.json`, `account.HomePageGrid.json` | My Active Contacts / Accounts | `<Table> Commands` | `contact\|NoRelationship\|HomePageGrid` |
| Main form | `contact.Form.json` (existing and new record) | Contact form | `Commands` | `contact\|NoRelationship\|Form` |
| Sub-grid | `contact.SubGridStandard.json` | Contacts sub-grid on the account form | `Contact Commands` | `contact\|NoRelationship\|SubGridStandard` |
| Associated view | `contact.SubGridAssociated.json` | Account → Related → Contacts | `Contact Commands` | `contact\|NoRelationship\|SubGridAssociated` |

`cbstest_ribbontest` isn't in any app on this org, so contact (a test table) and account were
recorded instead.

## How the bar is built

1. **One flat bar.** The tabs and groups of the location's ribbon flatten into one list. No
   group or tab title shows anywhere (also checked live on #135).
2. **Order:**
   - **Tab, then group, then control:** tabs sort by tab Sequence, then groups by group
     Sequence.
   - **Within a group:** controls appear **in the order RetrieveEntityRibbon returns them**,
     not by Sequence. In contact's ExportData group, `ImportDataFromExcel` (Sequence 21) comes
     after `ExportSelectedToExcel` (230) in the XML, and renders in that position. The
     preview model has to keep the merged document order.
   - **Several tabs** can contribute to one bar (e.g. `Related@120` → Quick Campaign comes after
     every `MainTab@100` command).
3. **Migrated modern commands sort the same way.** Their `appaction.sequence` encodes the
   classic position: `1,000,000,000 + (tabSequence − 100) × 1,000,000 + groupSequence ×
   10,000 + controlSequence`. For example, `Mscrm.HomepageGrid.contact.NewRecord` is
   1,000,100,010 and `RefreshModernButton` is 1,000,110,017 (spike #206).
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

## Against the documented behaviour (#191, #192 review comments)

| Documented | Recorded |
|---|---|
| Selection hides commands without a SelectionCountRule unless they use `Mscrm.AnySelection`; flyouts and split buttons are exempt (KB 4481268) | **Mostly holds.** New, Refresh and Visualize this view disappear on selection. Delete, Run Flow and Run Report (`AnySelection`) stay, and so does Quick Campaign (a flyout). **But** Excel Templates (a flyout) and Import from Excel (a split button) also disappear. Their enable rules (`ExportToExcel.ValidForXlsxExport`, `EnableImportForWeb`) are custom rules that may decide this, so treat "exempt" as "not hidden *by selection alone*". |
| `Mscrm.HideOnModern` commands don't show, and Command Checker doesn't list them | **Confirmed** (Detect and Copy on contact's grid; live check 2026-10-28, see #192 and #36). |
| Not ribbon-defined: Create view, Help, See all records, Share, Show as, Show Chart, Open Dashboards | **Partly.** Show Chart, Open Dashboards and See all records were recorded as system items. Share **is** ribbon-defined here (`Mscrm.HomepageGrid.contact.Sharing`). Focused view is a system item too. |
| Sub-grids show only Add, Show List and Delete; their names and icons can't be changed (Ribbons available) | **Not on this org.** The Contacts sub-grid offers the full `Mscrm.SubGrid.contact` set: Add New, Add Existing, Refresh, Quick Campaign, Run Flow, Run Report, Excel Templates, Export; with a selection, Edit, Activate, Deactivate, Delete, Merge, Assign, Share, Email a Link, Follow, Word Templates and Export Selected. Labels carry the table name ("Add New Contact", "Delete Contact"). **Their names, icons and commands can be changed:** an override of `Mscrm.SubGrid.contact.AddNewStandard` changed its label, tooltip, `ModernImage` and command on the sub-grid (#167, 2026-10-29). |
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

## Not recorded

- **Sub-grid:** 2 rows selected (automated sub-grid row selection was unreliable), and 1 row
  selected at 820 px.
- **Quick actions:** the row-level commands in the grid.
- **Read-only and inactive forms.**
- **Interleaving of new modern commands with classic ones:** a modern command at sequence
  1,000,100,015 rendered between New (1,000,100,010) and Delete, but no classic-only position
  was mapped beyond that (#206).
