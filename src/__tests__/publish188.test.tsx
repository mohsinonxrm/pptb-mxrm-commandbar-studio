/**
 * #188: the publish dialog says what it publishes first, one row per change,
 * and why Publish is blocked above them; the top bar counts the same rows.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { planScope } from "@/services/publishPlan";
import { summarizePublish } from "@/services/publishSummary";
import { parseRibbonXml } from "@/services/xmlParser";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import type { EntityMetadata } from "@/types/entity";
import type { Solution } from "@/types/solution";
import type {
	CommandDefinition,
	RibbonButton,
	RibbonDefinition,
	RibbonLocation,
} from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = "cbstest_ribbontest";
const ribbonWith = (location: RibbonLocation, buttons: RibbonButton[]): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [
		{
			id: `Mscrm.${location}.${T}.MainTab`,
			label: "Main",
			sequence: 10,
			tabDisplayRules: [],
			groups: [
				{
					id: `Mscrm.${location}.${T}.MainTab.Management`,
					label: "Management",
					sequence: 10,
					template: "Mscrm.Templates.Flexible2",
					buttons,
				},
			],
		},
	],
});
const button = (id: string, label: string, patch: Partial<RibbonButton> = {}): RibbonButton =>
	({
		id,
		label,
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId: `${id}.Command`,
		hidden: false,
		oob: false,
		custom: true,
		managed: false,
		origin: "unmanaged",
		...patch,
	}) as RibbonButton;
const command = (id: string): CommandDefinition =>
	({ id, enableRules: [], displayRules: [], actions: [] }) as unknown as CommandDefinition;

function summarize(
	pairs: { current: RibbonDefinition; baseline: RibbonDefinition }[],
	commands: CommandDefinition[] = [],
	baselineCommands: CommandDefinition[] = [],
) {
	const plan = planScope({
		locations: pairs,
		commands,
		baselineCommands,
		enableRules: [],
		baselineEnableRules: [],
		displayRules: [],
		baselineDisplayRules: [],
	});
	return summarizePublish({
		locations: pairs,
		plan,
		baselineCommands,
		baselineEnableRuleIds: [],
		baselineDisplayRuleIds: [],
		buttonName: (b) => b.label,
		titleOf: (l) => l,
	}).map((c) => `${c.kind}: ${c.action} ${c.name}${c.detail ? ` ${c.detail}` : ""}`);
}

describe("#188 what Publish writes, in words", () => {
	it("one row for a button added to several locations, its new command included", () => {
		const added = (l: RibbonLocation) =>
			button(`cbstest.${l}.Credit`, "Credit Check", { commandId: "cbstest.Credit" });
		expect(
			summarize(
				[
					{
						current: ribbonWith("HomepageGrid", [added("HomepageGrid")]),
						baseline: ribbonWith("HomepageGrid", []),
					},
					{
						current: ribbonWith("Form", [added("Form")]),
						baseline: ribbonWith("Form", []),
					},
				],
				[command("cbstest.Credit")],
			),
		).toEqual(["new: Add Credit Check to the main grid and main form"]);
	});

	it("hides, changes, shows again and deletes", () => {
		const edit = button("Mscrm.Edit", "Edit", { oob: true, custom: false, origin: "oob" });
		const mine = button("cbstest.Mine", "Mine");
		const gone = button("cbstest.Gone", "Gone", { sequence: 30 });
		const back = button("cbstest.Back", "Back", { hidden: true, sequence: 40 });
		expect(
			summarize([
				{
					current: ribbonWith("HomepageGrid", [
						{ ...edit, hidden: true },
						{ ...mine, label: "Mine 2" },
						{ ...back, hidden: false },
					]),
					baseline: ribbonWith("HomepageGrid", [edit, mine, gone, back]),
				},
			]),
		).toEqual([
			"hide: Hide Edit on the main grid",
			"change: Change Mine 2 on the main grid",
			"show: Show Back again on the main grid",
			"delete: Delete Gone from the main grid",
		]);
	});

	it("a changed command is a row of its own", () => {
		const b = button("cbstest.B", "B", { commandId: "cbstest.Cmd" });
		const loaded = command("cbstest.Cmd");
		const edited = { ...loaded, actions: [{ kind: "url", address: "https://x" }] } as never;
		expect(
			summarize(
				[
					{
						current: ribbonWith("HomepageGrid", [b]),
						baseline: ribbonWith("HomepageGrid", [b]),
					},
				],
				[edited],
				[loaded],
			),
		).toEqual(["change: Change command cbstest.Cmd"]);
	});
});

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------

const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const MGMT = `${MAIN}.Management`;
const XML = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${MAIN}" Command="${MAIN}" Sequence="10"><Groups Id="${MAIN}.Groups">
    <Group Id="${MGMT}" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="${MGMT}.Controls">
      <Button Id="Mscrm.HomepageGrid.${T}.Edit" Command="Mscrm.EditSelectedRecord" Sequence="20" LabelText="Edit" TemplateAlias="o1" />
    </Controls></Group>
  </Groups></Tab>
</Tabs></Ribbon></UI><CommandDefinitions>
  <CommandDefinition Id="Mscrm.EditSelectedRecord"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction FunctionName="edit" Library="$webresource:lib.js"/></Actions></CommandDefinition>
</CommandDefinitions><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`;
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});

let container: HTMLDivElement;
let root: Root;
const flush = async () => {
	for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const buttonNamed = (text: string | RegExp) =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
		typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? ""),
	);
const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? "";

async function openPublishDialog() {
	const { default: BulkPublishModal } = await import("@/components/modals/BulkPublishModal");
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<BulkPublishModal />
			</FluentProvider>,
		),
	);
	act(() => useUIStore.setState({ bulkPublishOpen: true }));
	await flush();
}

describe("#188 the publish dialog", () => {
	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		(window as unknown as { toolboxAPI: unknown }).toolboxAPI = {
			connections: {
				getConnection: async () => ({
					id: "c1",
					name: "Contoso",
					url: "https://contoso.crm.dynamics.com",
					environment: "Dev",
				}),
			},
		};
		useSessionStore.setState({
			activeSolution: {
				id: "s1",
				uniqueName: "CBSLiveTest",
				friendlyName: "CBS Live Test",
				version: "1.0.0.0",
				isManaged: false,
				publisherPrefix: "cbstest",
			} as Solution,
			activeEntity: {
				metadataId: "md",
				logicalName: T,
				displayName: "CBS Ribbon Test",
				isCustomEntity: true,
				isIntersect: false,
			} as EntityMetadata,
			solutionRibbonComponentIds: [],
			publisherPrefix: "cbstest",
		});
		const parsed = parseRibbonXml(XML, "HomepageGrid", T);
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
		useRibbonStore.getState().createButton({
			location: "HomepageGrid",
			tabId: MAIN,
			groupId: MGMT,
			button: {
				id: "cbstest.New",
				label: "New one",
				kind: "button",
				templateAlias: "o1",
				commandId: "Mscrm.EditSelectedRecord",
				hidden: false,
				oob: false,
				custom: true,
				managed: false,
			},
		});
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		document.body.innerHTML = "";
		useUIStore.setState({ bulkPublishOpen: false });
		delete (window as unknown as { toolboxAPI?: unknown }).toolboxAPI;
	});

	it("says what it publishes first, and how many changes on the button", async () => {
		await openPublishDialog();
		expect(dialogText()).toContain("Publish CBS Ribbon Test");
		const list = document.querySelector('[aria-label="Changes to publish"]')!;
		expect(list.textContent).toContain("Add New one to the main gridNew");
		expect(buttonNamed("Publish 1 change")?.disabled).toBe(false);
		// The options are folded away.
		expect(document.querySelector("textarea")).toBeNull();
		expect(dialogText()).not.toContain("PublishAllXmlAsync");
	});

	it("says why Publish is blocked, above the changes, and opens Problems", async () => {
		// Renaming a tab no solution of yours adds can't be published.
		act(() => useRibbonStore.getState().renameTab("HomepageGrid", MAIN, "Renamed"));
		await openPublishDialog();
		const text = dialogText();
		expect(text).toContain("1 change can't be published yet");
		expect(text.indexOf("can't be published yet")).toBeLessThan(text.indexOf("to publish"));
		expect(text).toContain("Problems · 1");
		expect(text).toContain(`Renaming tab ${MAIN}`);
		expect(buttonNamed(/^Publish/)?.disabled).toBe(true);
	});

	it("View XML stays in the dialog and keeps the comment", async () => {
		await openPublishDialog();
		act(() => buttonNamed("Options")!.click());
		await flush();
		const comment = document.querySelector<HTMLTextAreaElement>("textarea")!;
		const setter = Object.getOwnPropertyDescriptor(
			HTMLTextAreaElement.prototype,
			"value",
		)!.set!;
		act(() => {
			setter.call(comment, "Adds New one");
			comment.dispatchEvent(new Event("input", { bubbles: true }));
		});
		act(() => buttonNamed("View XML")!.click());
		await flush();
		expect(dialogText()).toContain("What Publish imports");
		expect(useUIStore.getState().bulkPublishOpen).toBe(true);
		act(() => buttonNamed("Back to summary")!.click());
		await flush();
		expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Adds New one");
	});
});
