/**
 * #157: the Translations dialog's base-language row was a copy kept in the
 * LocLabel, while the canvas, Properties and the publish use the button's own
 * text, which then overwrote it. The base row now reads and writes the
 * button's text; other languages stay the label's titles.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { LocalizationEditor } from "@/components/modals/LocalizationEditor";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import type { LocLabel, RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = "account";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const GROUP = `${MAIN}.Management`;
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});
const ribbon = (buttons: RibbonButton[]): RibbonDefinition => ({
	location: "HomepageGrid",
	entityLogicalName: T,
	tabs: [
		{
			id: MAIN,
			label: "Main",
			sequence: 10,
			tabDisplayRules: [],
			groups: [
				{
					id: GROUP,
					label: "Management",
					sequence: 10,
					template: "Mscrm.Templates.Flexible2",
					buttons,
				},
			],
		},
	],
});

function load(buttons: RibbonButton[], locLabels: LocLabel[] = []) {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon(buttons),
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels,
	});
}
const publishXml = () => {
	const s = useRibbonStore.getState();
	return new DOMParser().parseFromString(
		generateRibbonDiffXml({
			current: s.ribbons.HomepageGrid,
			baseline: s.baseline.HomepageGrid,
			commands: s.commands,
			enableRules: s.enableRules,
			displayRules: s.displayRules,
			locLabels: s.locLabels,
			entityLogicalName: T,
			location: "HomepageGrid",
			languageCode: s.baseLanguageCode,
		}),
		"application/xml",
	);
};
const button = (id: string) =>
	useRibbonStore
		.getState()
		.ribbons.HomepageGrid.tabs[0].groups[0].buttons.find((b) => b.id === id)!;

describe("#157 the Translations dialog's base language is the button's own text", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		useUIStore.setState({ localizationEditorOpen: false, localizationEditorButtonId: null });
	});

	function open(buttonId: string) {
		act(() => useUIStore.getState().openLocalizationEditor(buttonId));
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<LocalizationEditor />
				</FluentProvider>,
			),
		);
	}
	const baseLabelInput = () => document.body.querySelector<HTMLInputElement>("table input")!;
	function type(input: HTMLInputElement, value: string) {
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
				input,
				value,
			);
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
	}
	const save = () =>
		act(() =>
			[...document.body.querySelectorAll("button")]
				.find((b) => b.textContent === "Save translations")!
				.click(),
		);

	it("a new button: the base row shows its text, and what's typed there is published", () => {
		load([]);
		act(() =>
			useRibbonStore.getState().createButton({
				location: "HomepageGrid",
				tabId: MAIN,
				groupId: GROUP,
				button: {
					id: "cbs.New",
					label: "Foo",
					kind: "button",
					templateAlias: "o1",
					commandId: "cbs.New.Command",
					hidden: false,
					oob: false,
					custom: true,
					managed: false,
				},
			}),
		);
		open("cbs.New");
		expect(baseLabelInput().value).toBe("Foo");
		type(baseLabelInput(), "Bar");
		save();
		expect(button("cbs.New").label).toBe("Bar");
		const titles = [
			...publishXml().querySelectorAll('LocLabel[Id="cbs.New.LabelText"] Title'),
		].map((t) => t.getAttribute("description"));
		expect(titles).toEqual(["Bar"]);
	});

	it("your own label: the base text and the other languages publish together, the token kept", () => {
		const own: RibbonButton = {
			id: "cbs.Own",
			label: "Old",
			kind: "button",
			sequence: 10,
			templateAlias: "o1",
			commandId: "cbs.Own.Command",
			hidden: false,
			oob: false,
			custom: true,
			managed: false,
			origin: "unmanaged",
			source: {
				attributes: { Id: "cbs.Own", LabelText: "$LocLabels:cbs.Own.LabelText" },
				labelToken: "$LocLabels:cbs.Own.LabelText",
			},
		};
		load(
			[own],
			[
				{
					id: "cbs.Own.LabelText",
					titles: [
						{ languageCode: 1033, description: "Old" },
						{ languageCode: 1031, description: "Alt" },
					],
				},
			],
		);
		open("cbs.Own");
		expect(baseLabelInput().value).toBe("Old");
		type(baseLabelInput(), "New");
		save();
		expect(button("cbs.Own").label).toBe("New");
		const doc = publishXml();
		expect(doc.querySelector('Button[Id="cbs.Own"]')?.getAttribute("LabelText")).toBe(
			"$LocLabels:cbs.Own.LabelText",
		);
		const titles = Object.fromEntries(
			[...doc.querySelectorAll('LocLabel[Id="cbs.Own.LabelText"] Title')].map((t) => [
				t.getAttribute("languagecode"),
				t.getAttribute("description"),
			]),
		);
		expect(titles).toEqual({ "1033": "New", "1031": "Alt" });
	});

	it("saving without a change writes no label, so nothing blocks the publish (#157 review)", async () => {
		const { planScope } = await import("@/services/publishPlan");
		const loaded: RibbonButton = {
			id: "Mscrm.HomepageGrid.account.NewRecord",
			label: "Ribbon.HomepageGrid.New",
			kind: "button",
			sequence: 10,
			templateAlias: "o1",
			commandId: "Mscrm.NewRecordFromGrid",
			hidden: false,
			oob: true,
			custom: false,
			managed: false,
			origin: "oob",
			source: {
				attributes: {
					Id: "Mscrm.HomepageGrid.account.NewRecord",
					LabelText: "$Resources:Ribbon.HomepageGrid.New",
				},
				labelToken: "$Resources:Ribbon.HomepageGrid.New",
			},
		};
		load([loaded]);
		const before = useRibbonStore.getState();
		open(loaded.id);
		save();
		const after = useRibbonStore.getState();
		expect(after.locLabels).toEqual(before.locLabels);
		expect(after.ribbons).toEqual(before.ribbons);
		const plan = planScope({
			locations: [
				{ current: after.ribbons.HomepageGrid, baseline: after.baseline.HomepageGrid },
			],
			commands: [],
			baselineCommands: [],
			enableRules: [],
			baselineEnableRules: [],
			displayRules: [],
			baselineDisplayRules: [],
			locLabels: after.locLabels,
			baselineLocLabels: [],
		});
		expect(plan.unsupported).toEqual([]);
	});
});
