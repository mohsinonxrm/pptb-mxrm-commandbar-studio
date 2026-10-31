/**
 * #187 PR 2: Import XML in two columns. The editor keeps its height; the
 * preview beside it says how many changes and problems, lists each change with
 * its kind, and lists every problem (no message bar per error). A problem with a
 * line moves the editor there, and Import says how many changes it brings.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { ImportXmlModal } from "@/components/modals/ImportXmlModal";
import { parseRibbonXml } from "@/services/xmlParser";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";
import type { EntityMetadata } from "@/types/entity";

const editor = vi.hoisted(() => ({
	revealed: [] as number[],
	readOnly: false,
	setValue: (_: string) => {},
}));
vi.mock("@/components/shared/MonacoEditor", async () => {
	const { useEffect } = await import("react");
	return {
		default: function FakeMonaco({
			value,
			onChange,
			onMount,
			readOnly,
		}: {
			value: string;
			onChange?: (v: string) => void;
			onMount?: (editor: unknown) => void;
			readOnly?: boolean;
		}) {
			editor.readOnly = !!readOnly;
			editor.setValue = (v) => onChange?.(v);
			useEffect(() => {
				onMount?.({
					revealLineInCenter: (line: number) => editor.revealed.push(line),
					setPosition: () => {},
					focus: () => {},
				});
			}, [onMount]);
			return <pre data-testid="editor">{value}</pre>;
		},
	};
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; Fluent's MessageBar uses it.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const T = "cbstest_ribbontest";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const MGMT = `${MAIN}.Management`;
const MERGED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${MAIN}" Command="${MAIN}" Sequence="10"><Groups Id="${MAIN}.Groups">
    <Group Id="${MGMT}" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="${MGMT}.Controls">
      <Button Id="Mscrm.HomepageGrid.${T}.Edit" Command="Mscrm.EditSelectedRecord" Sequence="20" LabelText="Edit" TemplateAlias="o1" />
    </Controls></Group>
  </Groups></Tab>
</Tabs></Ribbon></UI><CommandDefinitions>
  <CommandDefinition Id="Mscrm.EditSelectedRecord"><EnableRules/><DisplayRules/><Actions/></CommandDefinition>
</CommandDefinitions><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`;

const IMPORT = `<RibbonDiffXml>
  <CustomActions>
    <CustomAction Id="cbs.Approve.CustomAction" Location="${MGMT}.Controls._children" Sequence="40">
      <CommandUIDefinition>
        <Button Id="cbs.Approve" Command="cbs.Approve.Command" Sequence="40" LabelText="Approve" TemplateAlias="o1" />
      </CommandUIDefinition>
    </CustomAction>
  </CustomActions>
  <CommandDefinitions>
    <CommandDefinition Id="cbs.Approve.Command"><EnableRules/><DisplayRules/><Actions/></CommandDefinition>
  </CommandDefinitions>
  <RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions>
</RibbonDiffXml>`;

const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});

let container: HTMLDivElement;
let root: Root;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const buttonNamed = (text: string | RegExp) =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
		typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? ""),
	);
const preview = () => document.querySelector<HTMLElement>('section[aria-label="Preview"]')!;

function open(xml: string) {
	act(() => useUIStore.getState().openImportXml(xml));
}

beforeEach(() => {
	const parsed = parseRibbonXml(MERGED, "HomepageGrid", T);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: parsed.ribbon,
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: parsed.commands,
		displayRules: parsed.displayRules,
		enableRules: parsed.enableRules,
		locLabels: [],
	});
	useSessionStore.setState({
		activeEntity: {
			metadataId: "md",
			logicalName: T,
			displayName: "CBS Ribbon Test",
			isCustomEntity: true,
			isIntersect: false,
		} as EntityMetadata,
	});
	useSelectionStore.getState().setLocation("HomepageGrid");
	editor.revealed = [];
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<ImportXmlModal />
			</FluentProvider>,
		),
	);
});
afterEach(() => {
	act(() => useUIStore.getState().closeImportXml());
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#187 Import XML", () => {
	it("one hint above the editor, the preview beside it", () => {
		open("");
		expect(dialog().textContent).toContain("Import RibbonDiffXml");
		expect(dialog().textContent).toContain("Paste RibbonDiffXml");
		expect(dialog().textContent).toContain(
			"From Ribbon Workbench or a solution's customizations.xml. Only CBS Ribbon Test's part is used.",
		);
		expect(preview().textContent).toContain("Preview shows what the import changes");
		expect(buttonNamed("Import")?.disabled).toBe(true);
	});

	it("Preview counts the changes, lists them by kind, and Import says how many", () => {
		open(IMPORT);
		const before = useRibbonStore.getState().past.length;
		act(() => buttonNamed("Preview")!.click());
		expect(preview().textContent).toMatch(/Preview · \d+ changes?, 0 problems/);
		const changes = preview().querySelector('[aria-label="Changes"]')!;
		expect(changes.textContent).toContain("Add");
		expect(changes.textContent).toContain("cbs.Approve");
		// Nothing has changed yet.
		expect(useRibbonStore.getState().past.length).toBe(before);
		expect(buttonNamed("Preview again")).toBeTruthy();

		const importButton = buttonNamed(/^Import \d+ changes?$/)!;
		act(() => importButton.click());
		expect(useRibbonStore.getState().past.length).toBe(before + 1);
		expect(preview().textContent).toMatch(/Imported \d+ changes?/);
		expect(editor.readOnly).toBe(true);
		expect(buttonNamed("Close")).toBeTruthy();
	});

	it("problems are one list; one with a line moves the editor there, and errors block Import", () => {
		open(IMPORT.replace('Id="cbs.Approve"', 'Id="cbs.Bad Id"'));
		act(() => buttonNamed("Preview")!.click());
		const problems = preview().querySelector('[aria-label="Problems"]')!;
		expect(problems.textContent).toContain("Error");
		expect(problems.textContent).toMatch(/Line 5: Element ID "cbs\.Bad Id"/);
		expect(dialog().querySelectorAll(".fui-MessageBar")).toHaveLength(0);
		act(() => buttonNamed(/^Line 5:/)!.click());
		expect(editor.revealed).toEqual([5]);
		expect(buttonNamed(/^Import/)!.disabled).toBe(true);
	});

	it("editing the XML after a preview clears it", () => {
		open(IMPORT);
		act(() => buttonNamed("Preview")!.click());
		expect(preview().querySelector('[aria-label="Changes"]')).not.toBeNull();
		act(() => editor.setValue(IMPORT + " "));
		expect(preview().querySelector('[aria-label="Changes"]')).toBeNull();
		expect(buttonNamed("Preview")).toBeTruthy();
	});
});

describe("#187 a parse error reads as the parser's message", () => {
	it("drops Chromium's page boilerplate and keeps the line", async () => {
		const { validateRibbonDiffXml } = await import("@/services/xmlValidator");
		const chromium = new DOMParser().parseFromString(
			"<root><parsererror>This page contains the following errors:error on line 4 at column 42: Extra content at the end of the document\nBelow is a rendering of the page up to the first error.</parsererror></root>",
			"application/xml",
		);
		const spy = vi.spyOn(DOMParser.prototype, "parseFromString").mockReturnValue(chromium);
		try {
			const [error] = validateRibbonDiffXml("<RibbonDiffXml/>");
			expect(error.message).toBe(
				"XML parse error: error on line 4 at column 42: Extra content at the end of the document",
			);
			expect(error.lineHint).toBe("Line 4");
		} finally {
			spy.mockRestore();
		}
	});
});
