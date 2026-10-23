/**
 * #108 — after a delete, whether a command, rule or label is still used is read
 * from the elements, not matched as text: no orphans left behind, and nothing
 * still referenced removed.
 */
import { describe, it, expect } from "vitest";
import {
	emptyRibbonDiffParts,
	mergeScopeChanges,
	parseRibbonDiffParts,
} from "@/services/ribbonDiffMerge";

const GROUP = "Mscrm.HomepageGrid.cbstest_ribbontest.MainTab.Management";
const ca = (id: string, control: string) =>
	`<CustomAction Id="${id}.CA" Location="${GROUP}.Controls._children" Sequence="50"><CommandUIDefinition>${control}</CommandUIDefinition></CustomAction>`;
const btn = (id: string, attrs: string) =>
	`<Button Id="${id}" Sequence="50" TemplateAlias="o1" ${attrs} />`;
const cmd = (id: string, rules = "") =>
	`<CommandDefinition Id="${id}"><EnableRules>${rules}</EnableRules><DisplayRules /><Actions><JavaScriptFunction Library="$webresource:cbs_/x.js" FunctionName="run" /></Actions></CommandDefinition>`;
const cmdWith = (id: string, enable: string, display: string) =>
	`<CommandDefinition Id="${id}"><EnableRules>${enable}</EnableRules><DisplayRules>${display}</DisplayRules><Actions><JavaScriptFunction Library="$webresource:cbs_/x.js" FunctionName="run" /></Actions></CommandDefinition>`;
const enable = (id: string) =>
	`<EnableRule Id="${id}"><CrmClientTypeRule Type="Web" /></EnableRule>`;
const display = (id: string) =>
	`<DisplayRule Id="${id}"><CrmClientTypeRule Type="Web" /></DisplayRule>`;
const label = (id: string) =>
	`<LocLabel Id="${id}"><Titles><Title languagecode="1033" description="${id}" /></Titles></LocLabel>`;

const layer = (o: {
	actions: string[];
	commands?: string[];
	enable?: string[];
	display?: string[];
	labels?: string[];
}) =>
	parseRibbonDiffParts(
		`<RibbonDiffXml><CustomActions>${o.actions.join("")}</CustomActions>` +
			`<CommandDefinitions>${(o.commands ?? []).join("")}</CommandDefinitions>` +
			`<RuleDefinitions><TabDisplayRules /><DisplayRules>${(o.display ?? []).join("")}</DisplayRules>` +
			`<EnableRules>${(o.enable ?? []).join("")}</EnableRules></RuleDefinitions>` +
			`<LocLabels>${(o.labels ?? []).join("")}</LocLabels></RibbonDiffXml>`,
	);
const deleting = (existing: ReturnType<typeof layer>, ...ids: string[]) =>
	mergeScopeChanges(existing, emptyRibbonDiffParts(), { deletedControlIds: ids });

describe("#108 references read from the elements", () => {
	it("a command still used only as another control's PopulateQueryCommand is kept", () => {
		const existing = layer({
			actions: [
				ca("cbs.A", btn("cbs.A", 'Command="cbs.Shared"')),
				ca(
					"cbs.Fly",
					`<FlyoutAnchor Id="cbs.Fly" Sequence="60" TemplateAlias="o1" Command="cbs.Fly.Cmd" PopulateDynamically="true" PopulateQueryCommand="cbs.Shared" />`,
				),
			],
			commands: [cmd("cbs.Shared"), cmd("cbs.Fly.Cmd")],
		});
		const merged = deleting(existing, "cbs.A");
		expect(merged.customActions.has("ca:cbs.A.CA")).toBe(false);
		expect(merged.commandDefinitions.has("cbs.Shared")).toBe(true);

		// Once nothing references it, it goes.
		expect(deleting(existing, "cbs.A", "cbs.Fly").commandDefinitions.has("cbs.Shared")).toBe(
			false,
		);
	});

	it("a command whose id ends another command's id isn't kept by it", () => {
		const existing = layer({
			actions: [
				ca("cbs.A", btn("cbs.A", 'Command="Go"')),
				ca("cbs.B", btn("cbs.B", 'Command="cbs.Go"')),
			],
			commands: [cmd("Go"), cmd("cbs.Go")],
		});
		const merged = deleting(existing, "cbs.A");
		expect(merged.commandDefinitions.has("Go")).toBe(false);
		expect(merged.commandDefinitions.has("cbs.Go")).toBe(true);
	});

	it("a rule referenced with Id not first is removed with its command", () => {
		const existing = layer({
			actions: [ca("cbs.A", btn("cbs.A", 'Command="cbs.A.Cmd"'))],
			commands: [
				cmdWith(
					"cbs.A.Cmd",
					`<EnableRule Default="true" Id="cbs.A.Enable" />`,
					`<DisplayRule InvertResult="false" Id="cbs.A.Display" />`,
				),
			],
			enable: [enable("cbs.A.Enable")],
			display: [display("cbs.A.Display")],
		});
		const merged = deleting(existing, "cbs.A");
		expect(merged.commandDefinitions.has("cbs.A.Cmd")).toBe(false);
		expect(merged.enableRules.has("cbs.A.Enable")).toBe(false);
		expect(merged.displayRules.has("cbs.A.Display")).toBe(false);
	});

	it("a rule is kept only by a reference of the same kind, not by a matching Id elsewhere", () => {
		const existing = layer({
			actions: [
				ca("cbs.A", btn("cbs.A", 'Command="cbs.A.Cmd"')),
				ca("cbs.B", btn("cbs.B", 'Command="cbs.B.Cmd"')),
			],
			commands: [
				cmd("cbs.A.Cmd", `<EnableRule Id="cbs.Rule" />`),
				// B uses a display rule with the same id, and an enable rule whose id ends in it.
				cmdWith(
					"cbs.B.Cmd",
					`<EnableRule Id="x.cbs.Rule" />`,
					`<DisplayRule Id="cbs.Rule" />`,
				),
			],
			enable: [enable("cbs.Rule"), enable("x.cbs.Rule")],
			display: [display("cbs.Rule")],
		});
		const merged = deleting(existing, "cbs.A");
		expect(merged.enableRules.has("cbs.Rule")).toBe(false);
		expect(merged.enableRules.has("x.cbs.Rule")).toBe(true);
		expect(merged.displayRules.has("cbs.Rule")).toBe(true);
	});

	it("a shared rule stays while another command uses it", () => {
		const existing = layer({
			actions: [
				ca("cbs.A", btn("cbs.A", 'Command="cbs.A.Cmd"')),
				ca("cbs.B", btn("cbs.B", 'Command="cbs.B.Cmd"')),
			],
			commands: [
				cmd("cbs.A.Cmd", `<EnableRule Id="cbs.Rule" />`),
				cmd("cbs.B.Cmd", `<EnableRule Default="false" Id="cbs.Rule" />`),
			],
			enable: [enable("cbs.Rule")],
		});
		expect(deleting(existing, "cbs.A").enableRules.has("cbs.Rule")).toBe(true);
	});

	it("a label is kept only while an attribute uses exactly it", () => {
		const existing = layer({
			actions: [
				ca(
					"cbs.A",
					btn(
						"cbs.A",
						'Command="cbs.A.Cmd" LabelText="$LocLabels:cbs.Label" ToolTipTitle="$LocLabels:cbs.Tip"',
					),
				),
				// B shows A's tooltip label, and a label whose id starts with A's label id.
				ca(
					"cbs.B",
					btn(
						"cbs.B",
						'Command="cbs.B.Cmd" LabelText="$LocLabels:cbs.Label.Long" ToolTipTitle="$LocLabels:cbs.Tip"',
					),
				),
			],
			commands: [cmd("cbs.A.Cmd"), cmd("cbs.B.Cmd")],
			labels: [label("cbs.Label"), label("cbs.Label.Long"), label("cbs.Tip")],
		});
		const merged = deleting(existing, "cbs.A");
		expect(merged.locLabels.has("cbs.Label")).toBe(false);
		expect(merged.locLabels.has("cbs.Label.Long")).toBe(true);
		expect(merged.locLabels.has("cbs.Tip")).toBe(true);
	});
});
