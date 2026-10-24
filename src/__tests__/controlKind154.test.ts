/**
 * #154: changing a control's Kind wrote XML the import rejects. A control
 * keeps only the attributes its element allows, a menu item can only be a
 * button or a flyout, and a loaded control's kind isn't changed.
 */
import { describe, it, expect } from "vitest";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { planScope } from "@/services/publishPlan";
import { useRibbonStore } from "@/store/ribbonStore";
import { newMenu } from "@/utils/ribbonMenu";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

const T = "account";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const GROUP = `${MAIN}.Management`;

const control = (
	id: string,
	kind: RibbonButton["kind"],
	attributes: Record<string, string> = {},
): RibbonButton => ({
	id,
	label: id,
	kind,
	sequence: 10,
	templateAlias: "o1",
	commandId: `${id}.Command`,
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	origin: "unmanaged",
	...(Object.keys(attributes).length
		? { source: { attributes: { Id: id, ...attributes } } }
		: {}),
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

const generate = (current: RibbonDefinition) =>
	generateRibbonDiffXml({
		current,
		baseline: ribbon([]),
		commands: [],
		enableRules: [],
		displayRules: [],
		locLabels: [],
		entityLogicalName: T,
		location: "HomepageGrid",
	});

const element = (xml: string, tag: string) =>
	new DOMParser()
		.parseFromString(`<r>${xml.replace(/<\?xml[^>]*>/, "")}</r>`, "application/xml")
		.getElementsByTagName(tag)[0];

describe("#154 a control keeps only the attributes its element allows", () => {
	it("an imported flyout turned into a button loses PopulateDynamically", () => {
		const xml = generate(
			ribbon([
				control("cbs.Imported", "button", {
					PopulateDynamically: "true",
					PopulateQueryCommand: "cbs.Populate",
					Alt: "kept",
				}),
			]),
		);
		const el = element(xml, "Button");
		expect(el).toBeDefined();
		expect(el.hasAttribute("PopulateDynamically")).toBe(false);
		expect(el.hasAttribute("PopulateQueryCommand")).toBe(false);
		expect(el.getAttribute("Alt")).toBe("kept");
	});

	it("a button turned into a split button loses ModernCommandType; a check box has no images", () => {
		const split = element(
			generate(
				ribbon([
					control("cbs.Split", "splitButton", { ModernCommandType: "ControlCommand" }),
				]),
			),
			"SplitButton",
		);
		expect(split.hasAttribute("ModernCommandType")).toBe(false);
		const check = element(
			generate(
				ribbon([
					control("cbs.Check", "checkBox", {
						Image32by32: "/_imgs/x.png",
						ModernImage: "Add",
					}),
				]),
			),
			"CheckBox",
		);
		expect(check.hasAttribute("Image32by32")).toBe(false);
		expect(check.hasAttribute("ModernImage")).toBe(false);
		expect(check.hasAttribute("LabelText")).toBe(true);
	});
});

describe("#154 menu items are buttons or flyouts", () => {
	const flyoutWith = (item: RibbonButton) => {
		const flyout = control("cbs.Fly", "flyout");
		flyout.menu = newMenu(flyout.id);
		flyout.menu.sections[0].controls.push(item);
		return flyout;
	};

	it("the publish plan reports a check box in a menu", () => {
		const plan = planScope({
			locations: [
				{
					current: ribbon([flyoutWith(control("cbs.Fly.Check", "checkBox"))]),
					baseline: ribbon([]),
				},
			],
			commands: [],
			baselineCommands: [],
			enableRules: [],
			baselineEnableRules: [],
			displayRules: [],
			baselineDisplayRules: [],
		});
		expect(plan.unsupported.join("\n")).toContain(
			'Menu item "cbs.Fly.Check" (cbs.Fly.Check) is a CheckBox',
		);
	});

	const empty = (location: RibbonLocation): RibbonDefinition => ({
		location,
		entityLogicalName: T,
		tabs: [],
	});
	function load(loaded: RibbonButton[]) {
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: ribbon(loaded),
				SubGrid: empty("SubGrid"),
				Form: empty("Form"),
				Application: empty("Application"),
			},
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
		});
	}
	const find = (id: string) => {
		const group = useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups[0];
		return [
			...group.buttons,
			...group.buttons.flatMap((b) => b.menu?.sections.flatMap((s) => s.controls) ?? []),
		].find((b) => b.id === id)!;
	};

	it("the store keeps a loaded control's kind and a menu item's kind outside button / flyout", () => {
		load([flyoutWith(control("cbs.Fly.Item", "button")), control("cbs.Loaded", "button")]);
		const set = useRibbonStore.getState().setButtonProp;
		set("HomepageGrid", MAIN, GROUP, "cbs.Loaded", { kind: "splitButton", label: "Renamed" });
		expect(find("cbs.Loaded").kind).toBe("button");
		// The rest of the edit still applies.
		expect(find("cbs.Loaded").label).toBe("Renamed");

		// A new flyout's item: button ↔ flyout only.
		useRibbonStore.setState((s) => {
			const ribbons = structuredClone(s.ribbons);
			ribbons.HomepageGrid.tabs[0].groups[0].buttons.push(
				flyoutWith(control("cbs.NewFly.Item", "button")),
			);
			ribbons.HomepageGrid.tabs[0].groups[0].buttons.at(-1)!.id = "cbs.NewFly";
			return { ribbons };
		});
		set("HomepageGrid", MAIN, GROUP, "cbs.NewFly.Item", { kind: "checkBox" });
		expect(find("cbs.NewFly.Item").kind).toBe("button");
		set("HomepageGrid", MAIN, GROUP, "cbs.NewFly.Item", { kind: "flyout" });
		expect(find("cbs.NewFly.Item").kind).toBe("flyout");
		// A new top-level control can be any kind.
		set("HomepageGrid", MAIN, GROUP, "cbs.NewFly", { kind: "splitButton" });
		expect(find("cbs.NewFly").kind).toBe("splitButton");
	});
});

describe("#154 review: what is left alone", () => {
	const flyoutWith = (item: RibbonButton) => {
		const flyout = control("mgd.Fly", "flyout");
		flyout.menu = newMenu(flyout.id);
		flyout.menu.sections[0].controls.push(item);
		return flyout;
	};
	const plan = (current: RibbonDefinition, baseline: RibbonDefinition) =>
		planScope({
			locations: [{ current, baseline }],
			commands: [],
			baselineCommands: [],
			enableRules: [],
			baselineEnableRules: [],
			displayRules: [],
			baselineDisplayRules: [],
		});

	it("a loaded menu item of another kind that this publish doesn't write isn't reported", () => {
		const loaded = () =>
			ribbon([
				flyoutWith(control("mgd.Fly.Check", "checkBox")),
				control("own.Btn", "button"),
			]);
		const current = loaded();
		current.tabs[0].groups[0].buttons[1].label = "Renamed";
		expect(plan(current, loaded()).unsupported.join("\n")).not.toContain("Menu item");
	});

	it("a refused kind-only change isn't an undo step", () => {
		const empty = (location: RibbonLocation): RibbonDefinition => ({
			location,
			entityLogicalName: T,
			tabs: [],
		});
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: ribbon([control("cbs.Loaded", "button")]),
				SubGrid: empty("SubGrid"),
				Form: empty("Form"),
				Application: empty("Application"),
			},
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
		});
		const before = useRibbonStore.getState();
		useRibbonStore
			.getState()
			.setButtonProp("HomepageGrid", MAIN, GROUP, "cbs.Loaded", { kind: "checkBox" });
		const after = useRibbonStore.getState();
		expect(after.past).toHaveLength(before.past.length);
		expect(after.mutationsSincePublish).toBe(before.mutationsSincePublish);
	});
});
