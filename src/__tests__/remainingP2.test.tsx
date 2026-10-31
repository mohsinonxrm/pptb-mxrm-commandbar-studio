/**
 * The remaining v0.8.0 P2s: #168 (a ribbon package without RibbonXml.xml),
 * #169 (group Command, Scale PopupSize), #163 (tab reorder), #164 (duplicates'
 * Sequences and ids), #133 (PopulateQueryCommand), #150 (Download status).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { strToU8, zipSync } from "fflate";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { decompressRibbonZip } from "@/utils/decompressRibbonZip";
import { parseRibbonXml } from "@/services/xmlParser";
import { generateRibbonDiffXml, generateScaleStep } from "@/services/xmlGenerator";
import { planScope } from "@/services/publishPlan";
import { mergeScopeChanges, parseRibbonDiffParts } from "@/services/ribbonDiffMerge";
import { validatePublishRibbonDiff } from "@/services/xmlValidator";
import { controlCommandIds } from "@/utils/controlKinds";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";
import type {
	RibbonButton,
	RibbonDefinition,
	RibbonGroup,
	RibbonLocation,
	RibbonTab,
} from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const T = "account";
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});
const tab = (id: string, sequence: number, groups: RibbonGroup[] = []): RibbonTab => ({
	id,
	label: id,
	sequence,
	commandId: `${id}.Command`,
	tabDisplayRules: [],
	groups,
});
const group = (id: string, sequence: number, buttons: RibbonButton[] = []): RibbonGroup => ({
	id,
	label: id,
	sequence,
	template: "Mscrm.Templates.Flexible2",
	buttons,
});
const button = (id: string, sequence: number): RibbonButton => ({
	id,
	label: id,
	kind: "button",
	sequence,
	templateAlias: "o1",
	commandId: `${id}.Command`,
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
});
function load(tabs: RibbonTab[], ownContainers: string[] = [], ownControls: string[] = []) {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: { location: "HomepageGrid", entityLogicalName: T, tabs },
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
		layers: {
			entity: {
				controlIds: ownControls,
				containerIds: ownContainers,
				locLabelIds: [],
				hides: [],
			},
			application: null,
		},
	});
}
const ribbon = () => useRibbonStore.getState().ribbons.HomepageGrid;
const plan = () => {
	const s = useRibbonStore.getState();
	return planScope({
		locations: [{ current: s.ribbons.HomepageGrid, baseline: s.baseline.HomepageGrid }],
		commands: [],
		baselineCommands: [],
		enableRules: [],
		baselineEnableRules: [],
		displayRules: [],
		baselineDisplayRules: [],
		layer: {
			containerIds: s.layers.entity?.containerIds ?? [],
			locLabelIds: [],
		},
	});
};

describe("#168 a ribbon package without RibbonXml.xml", () => {
	it("fails, naming what it has, instead of loading its first file", async () => {
		const zip = zipSync({ "[Content_Types].xml": strToU8("<Types/>") });
		const b64 = btoa(String.fromCharCode(...zip));
		await expect(decompressRibbonZip(b64)).rejects.toThrow(
			/without RibbonXml\.xml \(it has \[Content_Types\]\.xml\)/,
		);
	});
});

describe("#169 round-trip", () => {
	it("a Scale step's PopupSize is read and written back", () => {
		const xml = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="T" Command="T" Sequence="10"><Scaling Id="T.Scaling"><Scale Id="T.S1" GroupId="T.G" Sequence="10" Size="Popup" PopupSize="LargeLarge" /></Scaling><Groups Id="T.Groups" /></Tab>
</Tabs></Ribbon></UI><CommandDefinitions /><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`;
		const step = parseRibbonXml(xml, "HomepageGrid", T).ribbon.scalingByTab!["T"].scales[0];
		expect(step.popupSize).toBe("LargeLarge");
		expect(generateScaleStep("Scale", step)).toContain('PopupSize="LargeLarge"');
	});

	it("an imported group's Command is written back", () => {
		const g = {
			...group("cbs.Grp", 10),
			source: { attributes: { Id: "cbs.Grp", Command: "cbs.Grp.Command" } },
		};
		const current: RibbonDefinition = {
			...empty("HomepageGrid"),
			tabs: [tab("Mscrm.HomepageGrid.account.MainTab", 10, [g])],
		};
		const xml = generateRibbonDiffXml({
			current,
			baseline: {
				...empty("HomepageGrid"),
				tabs: [tab("Mscrm.HomepageGrid.account.MainTab", 10)],
			},
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: T,
			location: "HomepageGrid",
		});
		expect(xml).toMatch(/<Group Id="cbs\.Grp"[^>]* Command="cbs\.Grp\.Command"/);
	});
});

describe("#163 tab order", () => {
	it("a new tab dragged between others gets a Sequence between them", () => {
		load([tab("A", 10), tab("B", 20)]);
		useRibbonStore.setState((s) => {
			const r = structuredClone(s.ribbons);
			r.HomepageGrid.tabs.push(tab("cbs.New", 30));
			return { ribbons: r };
		});
		useRibbonStore.getState().reorderTabs("HomepageGrid", ["A", "cbs.New", "B"]);
		const seq = ribbon().tabs.map((t) => t.sequence);
		expect(seq[0] < seq[1] && seq[1] < seq[2]).toBe(true);
	});

	it("your own tab's new Sequence publishes; out-of-the-box tabs swapped are reported", () => {
		load([tab("A", 10), tab("B", 20), tab("cbs.Own", 30)], ["cbs.Own"]);
		useRibbonStore.getState().reorderTabs("HomepageGrid", ["A", "cbs.Own", "B"]);
		const p = plan();
		expect(p.unsupported).toEqual([]);
		const own = ribbon().tabs.find((t) => t.id === "cbs.Own")!;
		expect(p.resequencedTabs).toEqual([{ id: "cbs.Own", sequence: own.sequence }]);
		expect(own.sequence > 10 && own.sequence < 20).toBe(true);

		// The merge writes it into the layer's CustomAction and Tab.
		const layer = parseRibbonDiffParts(
			`<RibbonDiffXml><CustomActions><CustomAction Id="cbs.Own.CustomAction" Location="Mscrm.Tabs._children" Sequence="30"><CommandUIDefinition><Tab Id="cbs.Own" Command="cbs.Own.Command" Sequence="30"><Scaling Id="cbs.Own.Scaling" /><Groups Id="cbs.Own.Groups" /></Tab></CommandUIDefinition></CustomAction></CustomActions></RibbonDiffXml>`,
		);
		const merged = mergeScopeChanges(layer, parseRibbonDiffParts("<RibbonDiffXml />"), {
			resequencedContainers: p.resequencedTabs,
		});
		const ca = [...merged.customActions.values()][0];
		expect(ca).toContain(
			`<CustomAction Id="cbs.Own.CustomAction" Location="Mscrm.Tabs._children" Sequence="${own.sequence}"`,
		);
		expect(ca).toContain(
			`<Tab Id="cbs.Own" Command="cbs.Own.Command" Sequence="${own.sequence}"`,
		);

		load([tab("A", 10), tab("B", 20)]);
		useRibbonStore.getState().reorderTabs("HomepageGrid", ["B", "A"]);
		expect(plan().unsupported.join("\n")).toMatch(/Reordering tab "(A|B)"/);
	});
});

describe("#164 duplicates", () => {
	beforeEach(() => useSessionStore.setState({ publisherPrefix: "cbs", activeSolution: null }));

	it("copies sit right after the original, in order, and their ids start with the prefix", () => {
		const MAIN = "Mscrm.HomepageGrid.account.MainTab";
		const GROUP = `${MAIN}.Management`;
		load([
			tab(MAIN, 10, [group(GROUP, 10, [button("Mscrm.New", 10), button("Mscrm.Edit", 20)])]),
		]);
		useRibbonStore.getState().duplicateButton("HomepageGrid", MAIN, GROUP, "Mscrm.New");
		useRibbonStore.getState().duplicateButton("HomepageGrid", MAIN, GROUP, "Mscrm.New");
		const buttons = ribbon().tabs[0].groups[0].buttons;
		expect(buttons.map((b) => b.id.replace(/_copy_\d+$/, "_copy"))).toEqual([
			"Mscrm.New",
			"cbs.Mscrm.New_copy",
			"cbs.Mscrm.New_copy",
			"Mscrm.Edit",
		]);
		const seq = buttons.map((b) => b.sequence);
		expect(new Set(seq).size).toBe(seq.length);
		expect([...seq].sort((a, b) => a - b)).toEqual(seq);
	});

	it("with no room between built-in neighbours, a copy is shown where it publishes", () => {
		const MAIN = "Mscrm.HomepageGrid.account.MainTab";
		const GROUP = `${MAIN}.Management`;
		load([
			tab(MAIN, 10, [group(GROUP, 10, [button("Mscrm.New", 10), button("Mscrm.Edit", 11)])]),
		]);
		useRibbonStore.getState().duplicateButton("HomepageGrid", MAIN, GROUP, "Mscrm.New");
		const buttons = ribbon().tabs[0].groups[0].buttons;
		const seq = buttons.map((b) => b.sequence);
		expect([...seq].sort((a, b) => a - b)).toEqual(seq);
		expect(buttons.at(-1)!.id).toMatch(/^cbs\.Mscrm\.New_copy_/);
	});

	it("the pre-publish check warns about siblings with the same Sequence", () => {
		const ca = (id: string) =>
			`<CustomAction Id="${id}.CA" Location="X.Controls._children" Sequence="15"><CommandUIDefinition><Button Id="${id}" Command="Mscrm.X" Sequence="15" LabelText="x" TemplateAlias="o1" /></CommandUIDefinition></CustomAction>`;
		const findings = validatePublishRibbonDiff(
			`<RibbonDiffXml><CustomActions>${ca("cbs.A")}${ca("cbs.B")}</CustomActions><Templates><RibbonTemplates Id="Mscrm.Templates" /></Templates><CommandDefinitions /><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions><LocLabels /></RibbonDiffXml>`,
		).filter((f) => f.code === "duplicate-sequence");
		expect(findings).toHaveLength(1);
		expect(findings[0].severity).toBe("warning");
	});
});

describe("#133 PopulateQueryCommand", () => {
	it("is checked to exist, and a copy carries it", () => {
		const findings = validatePublishRibbonDiff(
			`<RibbonDiffXml><CustomActions><CustomAction Id="cbs.F.CA" Location="X.Controls._children" Sequence="10"><CommandUIDefinition><FlyoutAnchor Id="cbs.F" Command="Mscrm.Enabled" PopulateDynamically="true" PopulateQueryCommand="cbs.Populate.Typo" Sequence="10" LabelText="F" TemplateAlias="o1" /></CommandUIDefinition></CustomAction></CustomActions><Templates><RibbonTemplates Id="Mscrm.Templates" /></Templates><CommandDefinitions /><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions><LocLabels /></RibbonDiffXml>`,
			{ known: { commandIds: ["Mscrm.Enabled"] } },
		).filter((f) => f.code === "undefined-command");
		expect(findings.map((f) => [f.severity, f.message])).toEqual([
			["error", expect.stringContaining("PopulateQueryCommand cbs.Populate.Typo")],
		]);
		const flyout = {
			...button("cbs.F", 10),
			kind: "flyout" as const,
			source: { attributes: { Id: "cbs.F", PopulateQueryCommand: "cbs.Populate" } },
		};
		expect(controlCommandIds(flyout)).toEqual(["cbs.F.Command", "cbs.Populate"]);
	});
});

describe("#150 the XML drawer's Download", () => {
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
		delete (window as unknown as { toolboxAPI?: unknown }).toolboxAPI;
	});

	it("clears a Copy's message while the Save dialog is open", async () => {
		let finish!: (path: string) => void;
		(window as unknown as { toolboxAPI: unknown }).toolboxAPI = {
			utils: { copyToClipboard: async () => undefined },
			fileSystem: { saveFile: () => new Promise<string>((r) => (finish = r)) },
		};
		load([]);
		useSelectionStore.getState().setLocation("HomepageGrid");
		const { XmlView } = await import("@/components/panels/XmlView");
		await act(async () =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<XmlView location="HomepageGrid" />
				</FluentProvider>,
			),
		);
		const btn = (text: string) =>
			[...document.body.querySelectorAll("button")].find((b) => b.textContent === text)!;
		await act(async () => btn("Copy").click());
		expect(document.body.textContent).toContain("Copied the XML to the clipboard.");
		await act(async () => btn("Download").click());
		expect(document.body.textContent).not.toContain("Copied the XML to the clipboard.");
		await act(async () => finish("C:/x.xml"));
		expect(document.body.textContent).toContain("Saved to C:/x.xml.");
	});
});

describe("review of #163 / #164 / #169", () => {
	beforeEach(() => useSessionStore.setState({ publisherPrefix: "cbs", activeSolution: null }));
	const MAIN = "Mscrm.HomepageGrid.account.MainTab";

	it("duplicating a group never renumbers a loaded group; the copy goes where it publishes", () => {
		load(
			[tab(MAIN, 10, [group("cbs.A", 10), group("cbs.B", 11), group("Mscrm.C", 12)])],
			["cbs.A", "cbs.B"],
		);
		useRibbonStore.getState().duplicateGroup("HomepageGrid", MAIN, "cbs.A");
		const groups = ribbon().tabs[0].groups;
		expect(groups.filter((g) => !g.id.includes("_copy_")).map((g) => g.sequence)).toEqual([
			10, 11, 12,
		]);
		const seq = groups.map((g) => g.sequence);
		expect([...seq].sort((a, b) => a - b)).toEqual(seq);
		expect(new Set(seq).size).toBe(seq.length);
	});

	it("an imported group's own Command is defined with it", () => {
		const g = {
			...group("cbs.Grp", 10),
			source: { attributes: { Id: "cbs.Grp", Command: "cbs.Grp.Command" } },
		};
		const xml = generateRibbonDiffXml({
			current: { ...empty("HomepageGrid"), tabs: [tab(MAIN, 10, [g])] },
			baseline: { ...empty("HomepageGrid"), tabs: [tab(MAIN, 10)] },
			commands: [
				{
					id: "cbs.Grp.Command",
					enableRules: [],
					displayRules: [],
					actions: [
						{
							kind: "javascript",
							library: "$webresource:cbs_/a.js",
							functionName: "cbs.go",
							params: [],
						},
					],
				},
			],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: T,
			location: "HomepageGrid",
		});
		expect(xml).toContain('<CommandDefinition Id="cbs.Grp.Command"');
	});

	it("a tab with no room between neighbours is shown where it publishes", () => {
		load([tab("A", 10), tab("B", 11), tab("cbs.Own", 30)], ["cbs.Own"]);
		useRibbonStore.getState().reorderTabs("HomepageGrid", ["A", "cbs.Own", "B"]);
		const seq = ribbon().tabs.map((t) => t.sequence);
		expect([...seq].sort((a, b) => a - b)).toEqual(seq);
		expect(plan().unsupported).toEqual([]);
	});

	it("with the layer unread, reordering says why instead of 'not yours'", () => {
		load([tab("A", 10), tab("B", 20)]);
		useRibbonStore.setState((s) => ({ layers: { ...s.layers, entity: null } }));
		useRibbonStore.getState().reorderTabs("HomepageGrid", ["B", "A"]);
		const s = useRibbonStore.getState();
		const p = planScope({
			locations: [{ current: s.ribbons.HomepageGrid, baseline: s.baseline.HomepageGrid }],
			commands: [],
			baselineCommands: [],
			enableRules: [],
			baselineEnableRules: [],
			displayRules: [],
			baselineDisplayRules: [],
		});
		expect(p.unsupported.join("\n")).toMatch(/couldn't be read/);
	});
});
