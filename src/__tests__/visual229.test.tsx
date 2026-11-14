/**
 * #229, part 1 of the screen-based visual pass: a locked button's Properties
 * fields read as text (not resource keys) and look read-only, Dataverse's
 * table placeholders read as words, and Microsoft's underscore keys read as
 * captions.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { IdentitySection } from "@/components/properties-pane/IdentitySection";
import { StructurePane } from "@/components/left-pane/StructurePane";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useDraftStore, draftKeyFor } from "@/store/draftStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { captionFromKey, displayText } from "@/utils/displayText";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("#229 texts", () => {
	it("Dataverse's table placeholders read as words", () => {
		expect(displayText("{!EntityPluralDisplayName}", [], 1033, {})).toBe(
			"‹table name, plural›",
		);
		expect(displayText("New {!EntityDisplayName}", [], 1033, {})).toBe("New ‹table name›");
	});

	it("an underscore resource key reads as its caption", () => {
		expect(captionFromKey("Mscrm_Form_Other_MainTab_Save_SaveAndNew_ToolTipTitle")).toBe(
			"Save And New",
		);
		// Not a key: a word with underscores, or a lower-case id.
		expect(captionFromKey("my_custom_label")).toBeUndefined();
		expect(captionFromKey("Mscrm_Save")).toBeUndefined();
		// From a resource token, any underscore key is one.
		expect(captionFromKey("WebResource_Tab_Caption", true)).toBe("Web Resource");
		expect(captionFromKey("Form_Editor_Insert_Tab_Caption", true)).toBe("Insert");
		expect(displayText("$Resources:WebResource_Tab_Caption", [], 1033, {})).toBe(
			"Web Resource",
		);
		// A label's own text with underscores is left as it is (review).
		const own = [{ id: "x", titles: [{ languageCode: 1033, description: "Send_Email" }] }];
		expect(displayText("$LocLabels:x", own, 1033, {})).toBe("Send_Email");
	});
});

const MAIN = "Mscrm.Form.account.MainTab";
const saveAndNew = {
	id: "Mscrm.Form.account.SaveAndNew",
	label: "Ribbon.Form.MainTab.Save.SaveAndNew",
	tooltipTitle: "Mscrm_Form_Other_MainTab_Save_SaveAndNew_ToolTipTitle",
	tooltipBody: "Ribbon.Tooltip.SaveAndNew",
	kind: "button",
	sequence: 40,
	templateAlias: "o1",
	commandId: "Mscrm.SaveAndNewPrimary",
	hidden: false,
	oob: true,
	custom: false,
	managed: false,
	origin: "oob",
	source: {
		labelToken: "$Resources:Ribbon.Form.MainTab.Save.SaveAndNew",
		tooltipTitleToken: "$Resources:Mscrm_Form_Other_MainTab_Save_SaveAndNew_ToolTipTitle",
		tooltipBodyToken: "$Resources:Ribbon.Tooltip.SaveAndNew",
		attributes: {},
	},
} as RibbonButton;
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : "account",
	tabs: [],
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: empty("HomepageGrid"),
			SubGrid: empty("SubGrid"),
			Form: {
				...empty("Form"),
				tabs: [
					{
						id: MAIN,
						label: "Form",
						sequence: 10,
						tabDisplayRules: [],
						groups: [
							{
								id: `${MAIN}.Save`,
								label: "Save",
								sequence: 10,
								template: "Flexible2",
								buttons: [saveAndNew],
							},
						],
					},
				],
			},
			Application: empty("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
		baseLanguageCode: 1033,
	} as never);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("#229 Properties of a button that isn't yours", () => {
	it("shows its texts as the canvas does, read-only, with the key as the hint", () => {
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<IdentitySection
						button={saveAndNew}
						location="Form"
						tabId={MAIN}
						groupId={`${MAIN}.Save`}
						part="appearance"
					/>
				</FluentProvider>,
			),
		);
		const field = (label: string) =>
			[...container.querySelectorAll<HTMLElement>(".fui-Field")].find(
				(f) => f.querySelector("label")?.textContent === label,
			)!;
		const label = field("Label");
		const input = label.querySelector<HTMLInputElement>("input")!;
		expect(input.value).toBe("Save And New");
		expect(input.readOnly).toBe(true);
		expect(label.textContent).toContain("From Ribbon.Form.MainTab.Save.SaveAndNew");
		expect(field("Tooltip title").querySelector("input")!.value).toBe("Save And New");
		expect(field("Tooltip body").querySelector("textarea")!.value).toBe("Save And New");
		expect(field("Tooltip body").querySelector("textarea")!.readOnly).toBe(true);
	});
});

describe("#229 review", () => {
	const render = (ui: React.ReactElement) =>
		act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));

	it("your own button still edits its label as it is", () => {
		const mine = {
			...saveAndNew,
			origin: "unmanaged",
			custom: true,
			oob: false,
		} as RibbonButton;
		render(
			<IdentitySection
				button={mine}
				location="Form"
				tabId={MAIN}
				groupId={`${MAIN}.Save`}
				part="appearance"
			/>,
		);
		const input = [...container.querySelectorAll<HTMLElement>(".fui-Field")]
			.find((f) => f.querySelector("label")?.textContent === "Label")!
			.querySelector("input")!;
		expect(input.value).toBe("Ribbon.Form.MainTab.Save.SaveAndNew");
		expect(input.readOnly).toBe(false);
	});

	it("a rename starts from the title itself, not from how it's shown", () => {
		act(() =>
			useRibbonStore
				.getState()
				.createTab("Form", { id: "mxrm.account.Tab", label: "New {!EntityDisplayName}" }),
		);
		useSessionStore.setState({ activeEntity: { logicalName: "account" } } as never);
		useDraftStore.setState({ target: draftKeyFor("account") });
		useSelectionStore.getState().setLocation("Form");
		useSelectionStore.getState().setTabId(MAIN);
		render(<StructurePane />);
		const tab = container.querySelector<HTMLElement>(
			'[role="treeitem"][data-structure-key="tab:mxrm.account.Tab"]',
		)!;
		expect(tab.textContent).toContain("New ‹table name›");
		act(() => {
			tab.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
		});
		expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe(
			"New {!EntityDisplayName}",
		);
	});
});
