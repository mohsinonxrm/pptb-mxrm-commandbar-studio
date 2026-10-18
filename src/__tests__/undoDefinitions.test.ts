import { describe, it, expect, beforeEach } from "vitest";
import { HIDE_DISPLAY_RULES, useRibbonStore } from "@/store/ribbonStore";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

// #34 — undo / redo cover the whole editable workspace: commands, rules,
// LocLabels and pending un-hides, not only the canvas.

const store = () => useRibbonStore.getState();

function ribbon(location: RibbonLocation, withButton: boolean): RibbonDefinition {
	return {
		location,
		entityLogicalName: "account",
		tabs: withButton
			? [
					{
						id: "Tab1",
						label: "Main",
						sequence: 10,
						tabDisplayRules: [],
						groups: [
							{
								id: "Group1",
								label: "Group",
								sequence: 10,
								template: "Mscrm.Templates.Flexible2",
								buttons: [
									{
										id: "Button1",
										label: "Button 1",
										kind: "button",
										sequence: 10,
										templateAlias: "o1",
										commandId: "Cmd1",
										hidden: false,
										oob: false,
										custom: true,
										managed: false,
									},
								],
							},
						],
					},
				]
			: [],
	};
}

const buttons = () => store().ribbons.HomepageGrid.tabs[0].groups[0].buttons;
const command = (id: string) => store().commands.find((c) => c.id === id);

beforeEach(() => {
	store().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon("HomepageGrid", true),
			SubGrid: ribbon("SubGrid", false),
			Form: ribbon("Form", false),
			Application: ribbon("Application", false),
		},
		commands: [{ id: "Cmd1", enableRules: ["Enable1"], displayRules: ["Display1"], actions: [] }],
		enableRules: [{ id: "Enable1", steps: [] }],
		displayRules: [{ id: "Display1", steps: [] }],
		locLabels: [{ id: "Button1.LabelText", titles: [{ languageCode: 1033, description: "One" }] }],
	});
});

describe("undo / redo of definitions (#34)", () => {
	it("undoes and redoes a command edit", () => {
		store().upsertCommand({ ...command("Cmd1")!, enableRules: [] });
		expect(store().past).toHaveLength(1);
		expect(store().past[0]).toMatchObject({ op: "edited", target: "Cmd1" });

		store().undo();
		expect(command("Cmd1")!.enableRules).toEqual(["Enable1"]);
		expect(store().mutationsSincePublish).toBe(0);

		store().redo();
		expect(command("Cmd1")!.enableRules).toEqual([]);
		expect(store().mutationsSincePublish).toBe(1);
	});

	it("undoes an added command", () => {
		store().upsertCommand({ id: "Cmd2", enableRules: [], displayRules: [], actions: [] });
		expect(command("Cmd2")).toBeDefined();
		store().undo();
		expect(command("Cmd2")).toBeUndefined();
	});

	it("undoes and redoes enable and display rule edits", () => {
		const step = { kind: "CommandClientTypeRule", type: "Modern" } as const;
		store().upsertEnableRule({ id: "Enable1", steps: [step] });
		store().upsertDisplayRule({ id: "Display1", steps: [step] });
		expect(store().past).toHaveLength(2);

		store().undo();
		expect(store().displayRules[0].steps).toEqual([]);
		expect(store().enableRules[0].steps).toEqual([step]);
		store().undo();
		expect(store().enableRules[0].steps).toEqual([]);

		store().redo();
		store().redo();
		expect(store().enableRules[0].steps).toEqual([step]);
		expect(store().displayRules[0].steps).toEqual([step]);
	});

	it("undoes a rule id change together with the commands that reference it", () => {
		expect(store().renameDisplayRuleId("Display1", "Display1b")).toBe(true);
		expect(command("Cmd1")!.displayRules).toEqual(["Display1b"]);

		store().undo();
		expect(store().displayRules.map((r) => r.id)).toEqual(["Display1"]);
		expect(command("Cmd1")!.displayRules).toEqual(["Display1"]);
	});

	it("undoes a command id change on the canvas and in the definitions together", () => {
		expect(store().renameCommandId("Cmd1", "Cmd1b")).toBe(true);
		expect(buttons()[0].commandId).toBe("Cmd1b");

		store().undo();
		expect(buttons()[0].commandId).toBe("Cmd1");
		expect(command("Cmd1")).toBeDefined();
		expect(command("Cmd1b")).toBeUndefined();
	});

	it("undoes and redoes a LocLabel (translation) edit", () => {
		store().upsertLocLabel({
			id: "Button1.LabelText",
			titles: [
				{ languageCode: 1033, description: "One" },
				{ languageCode: 1031, description: "Eins" },
			],
		});
		expect(store().locLabels[0].titles).toHaveLength(2);

		store().undo();
		expect(store().locLabels[0].titles).toEqual([{ languageCode: 1033, description: "One" }]);
		store().redo();
		expect(store().locLabels[0].titles).toHaveLength(2);
	});

	it("undoes a pending un-hide", () => {
		store().setLayerHideUnhidden("entity", "Hidden.Button", true);
		expect(store().pendingUnhides.entity).toEqual(["Hidden.Button"]);
		store().undo();
		expect(store().pendingUnhides.entity).toEqual([]);
		store().redo();
		expect(store().pendingUnhides.entity).toEqual(["Hidden.Button"]);
	});

	it("records nothing for an upsert that changes nothing", () => {
		store().upsertCommand({ ...command("Cmd1")! });
		store().upsertLocLabel({ ...store().locLabels[0] });
		store().setLayerHideUnhidden("entity", "Hidden.Button", false);
		expect(store().past).toHaveLength(0);
		expect(store().mutationsSincePublish).toBe(0);
	});

	it("hiding with display rules is one undo step", () => {
		expect(store().hideWithDisplayRules("Cmd1")).toBe(true);
		expect(command("Cmd1")!.displayRules).toEqual(["Display1", ...HIDE_DISPLAY_RULES]);
		expect(store().past).toHaveLength(1);

		store().undo();
		expect(command("Cmd1")!.displayRules).toEqual(["Display1"]);
		expect(store().past).toHaveLength(0);

		store().redo();
		expect(command("Cmd1")!.displayRules).toEqual(["Display1", ...HIDE_DISPLAY_RULES]);
	});

	it("a new edit clears redo", () => {
		store().upsertCommand({ ...command("Cmd1")!, enableRules: [] });
		store().undo();
		expect(store().future).toHaveLength(1);
		store().upsertLocLabel({ id: "x", titles: [] });
		expect(store().future).toHaveLength(0);
	});
});

describe("batch (#34)", () => {
	const createButtonWithCommand = () =>
		store().batch(() => {
			store().createButton({
				location: "HomepageGrid",
				tabId: "Tab1",
				groupId: "Group1",
				button: {
					id: "Button2",
					label: "Button 2",
					kind: "button",
					sequence: 20,
					templateAlias: "o1",
					commandId: "Cmd2",
					hidden: false,
					oob: false,
					custom: true,
					managed: false,
				},
			});
			store().upsertCommand({ id: "Cmd2", enableRules: [], displayRules: [], actions: [] });
		});

	it("undo after a button create removes both the button and its command", () => {
		createButtonWithCommand();
		expect(buttons().map((b) => b.id)).toEqual(["Button1", "Button2"]);
		expect(command("Cmd2")).toBeDefined();
		expect(store().past).toHaveLength(1);
		expect(store().past[0]).toMatchObject({ op: "added", target: "Button 2" });
		expect(store().mutationsSincePublish).toBe(1);

		store().undo();
		expect(buttons().map((b) => b.id)).toEqual(["Button1"]);
		expect(command("Cmd2")).toBeUndefined();
		expect(store().mutationsSincePublish).toBe(0);

		store().redo();
		expect(buttons().map((b) => b.id)).toEqual(["Button1", "Button2"]);
		expect(command("Cmd2")).toBeDefined();
	});

	it("nested batches join the outer one; an empty batch records nothing", () => {
		store().batch(() => {
			store().upsertEnableRule({ id: "Enable2", steps: [] });
			store().batch(() => store().upsertCommand({ ...command("Cmd1")!, enableRules: ["Enable2"] }));
		});
		expect(store().past).toHaveLength(1);
		store().batch(() => store().upsertCommand({ ...command("Cmd1")! }));
		expect(store().past).toHaveLength(1);

		store().undo();
		expect(store().enableRules.map((r) => r.id)).toEqual(["Enable1"]);
		expect(command("Cmd1")!.enableRules).toEqual(["Enable1"]);
	});

	it("undo / redo do nothing inside a batch", () => {
		store().upsertCommand({ ...command("Cmd1")!, enableRules: [] });
		store().batch(() => {
			store().undo();
			expect(command("Cmd1")!.enableRules).toEqual([]);
		});
		expect(store().past).toHaveLength(1);
	});

	it("a load inside a batch resets history like any load", () => {
		store().upsertCommand({ ...command("Cmd1")!, enableRules: [] });
		store().batch(() => {
			store().upsertCommand({ id: "Cmd3", enableRules: [], displayRules: [], actions: [] });
			store().loadRibbons(store().ribbons);
		});
		expect(store().past).toHaveLength(0);
		expect(store().future).toHaveLength(0);
	});
});

describe("history and baselines (#34)", () => {
	it("undo never touches the baselines; publishing keeps history", () => {
		store().upsertCommand({ ...command("Cmd1")!, enableRules: [] });
		store().setButtonProp("HomepageGrid", "Tab1", "Group1", "Button1", { label: "Renamed" });
		store().markPublished();
		expect(store().baselineCommands[0].enableRules).toEqual([]);
		expect(store().past).toHaveLength(2);

		store().undo();
		store().undo();
		expect(command("Cmd1")!.enableRules).toEqual(["Enable1"]);
		expect(buttons()[0].label).toBe("Button 1");
		expect(store().baselineCommands[0].enableRules).toEqual([]);
		expect(store().baseline.HomepageGrid.tabs[0].groups[0].buttons[0].label).toBe("Renamed");
	});

	it("loading a workspace clears history", () => {
		store().upsertCommand({ ...command("Cmd1")!, enableRules: [] });
		store().undo();
		store().upsertLocLabel({ id: "x", titles: [] });
		store().loadWorkspace({
			ribbons: store().ribbons,
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
		});
		expect(store().past).toHaveLength(0);
		expect(store().future).toHaveLength(0);
	});

	it("restore goes back to before an entry, keeps baselines and stays redoable", () => {
		store().upsertCommand({ ...command("Cmd1")!, enableRules: [] });
		store().upsertDisplayRule({ id: "Display2", steps: [] });
		store().setButtonProp("HomepageGrid", "Tab1", "Group1", "Button1", { label: "Renamed" });
		const baseline = store().baseline;

		store().restore(1);
		expect(store().past).toHaveLength(1);
		expect(store().future).toHaveLength(2);
		expect(command("Cmd1")!.enableRules).toEqual([]);
		expect(store().displayRules.map((r) => r.id)).toEqual(["Display1"]);
		expect(buttons()[0].label).toBe("Button 1");
		expect(store().baseline).toBe(baseline);

		store().redo();
		store().redo();
		expect(store().displayRules.map((r) => r.id)).toEqual(["Display1", "Display2"]);
		expect(buttons()[0].label).toBe("Renamed");
	});

	it("caps history for definition edits and every kept step still undoes", () => {
		for (let i = 0; i < 90; i++) {
			store().upsertLocLabel({ id: "Button1.LabelText", titles: [{ languageCode: 1033, description: `v${i}` }] });
		}
		expect(store().past).toHaveLength(80);
		while (store().past.length > 0) store().undo();
		// The oldest 10 steps fell off the cap: undo stops at v9.
		expect(store().locLabels[0].titles[0].description).toBe("v9");
		expect(store().future).toHaveLength(80);
	});
});
