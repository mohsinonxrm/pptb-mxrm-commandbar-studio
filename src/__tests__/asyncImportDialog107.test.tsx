/**
 * #107: the publish dialog offers Cancel while ribbons import, says honestly what a cancel
 * leaves behind, keeps the change to publish, and shows a failed import's log read-only.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { parseRibbonXml } from "@/services/xmlParser";
import { emptyRibbonDiffParts } from "@/services/ribbonDiffMerge";
import { PublishCancelledError } from "@/services/dataverse/publishService";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import type { EntityMetadata } from "@/types/entity";
import type { Solution } from "@/types/solution";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver; Fluent's MessageBar uses it for reflow.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const fake = vi.hoisted(() => ({
	publishRibbon: (async () => undefined) as (input: { signal?: AbortSignal }) => Promise<unknown>,
	fetchImportJobLog: (async () => null) as (id: string) => Promise<string | null>,
}));
// The pre-publish check finds nothing; the publish and the log read are the test's.
vi.mock("@/services/dataverse/publishService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/publishService")>()),
	checkBeforePublish: vi.fn(async () => ({ findings: [], xml: "" })),
	publishRibbon: (input: { signal?: AbortSignal }) => fake.publishRibbon(input),
	fetchImportJobLog: (id: string) => fake.fetchImportJobLog(id),
}));
vi.mock("@/components/shared/MonacoEditor", () => ({
	MonacoEditor: ({ value, readOnly }: { value: string; readOnly?: boolean }) => (
		<pre data-testid="xml" data-readonly={String(!!readOnly)}>
			{value}
		</pre>
	),
}));
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchLayerSnapshot: vi.fn(async () => null),
}));

const T = "cbstest_ribbontest";
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
const FAILED_JOB =
	'<importexportxml><solutionManifests><solutionManifest processed="true">' +
	'<result result="failure" errorcode="0x80048033" errortext="Publisher &quot;new&quot; is reserved" />' +
	"</solutionManifest></solutionManifests></importexportxml>";
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
const buttonNamed = (text: string) =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) => b.textContent?.trim() === text,
	);
const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? "";

async function openPublishDialog() {
	const { default: BulkPublishModal } = await import("@/components/modals/BulkPublishModal");
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
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

describe("#107 the publish dialog: Cancel and View import log", () => {
	beforeEach(() => {
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
				publisherUniqueName: "cbstest",
				publisherName: "CBS Test",
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
		// A pending change: a new button.
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

	it("a failed import says why, and View import log shows the import job's data read-only", async () => {
		fake.publishRibbon = async () => {
			throw Object.assign(
				new Error(
					`The import failed: Solution import failed. — Dataverse couldn't import the solution (0x80048033): Publisher "new" is reserved`,
				),
				{ importJobId: "job-1" },
			);
		};
		const fetched: string[] = [];
		fake.fetchImportJobLog = async (id) => {
			fetched.push(id);
			return FAILED_JOB;
		};
		await openPublishDialog();
		act(() => buttonNamed("Publish 1 change")!.click());
		await flush();
		expect(dialogText()).toContain("Publish failed (1 error)");
		expect(dialogText()).toContain(`Publisher "new" is reserved`);
		// Nothing was published: the change is still offered.
		expect(buttonNamed("Publish 1 change")?.disabled).toBe(false);

		act(() => buttonNamed("View import log")!.click());
		await flush();
		expect(fetched).toEqual(["job-1"]);
		expect(dialogText()).toContain(`Import log: ${T}`);
		const log = document.querySelector('[data-testid="xml"]')!;
		expect(log.textContent).toBe(FAILED_JOB);
		expect(log.getAttribute("data-readonly")).toBe("true");
		act(() => buttonNamed("Back to summary")!.click());
		await flush();
		expect(dialogText()).toContain("Publish failed (1 error)");
	});

	it("says so when the import log can't be read", async () => {
		fake.publishRibbon = async () => {
			throw Object.assign(new Error("The import failed: status 31"), {
				importJobId: "job-1",
			});
		};
		fake.fetchImportJobLog = async () => {
			throw new Error("Not found");
		};
		await openPublishDialog();
		act(() => buttonNamed("Publish 1 change")!.click());
		await flush();
		act(() => buttonNamed("View import log")!.click());
		await flush();
		expect(dialogText()).toContain("The import log couldn't be read: Not found");
	});

	it("Cancel while importing stops the run, says Dataverse may still finish, and keeps the change", async () => {
		let signal: AbortSignal | undefined;
		fake.publishRibbon = (input) =>
			new Promise((_, reject) => {
				signal = input.signal;
				input.signal!.addEventListener("abort", () =>
					reject(
						new PublishCancelledError(
							"You cancelled the publish. Command Bar Studio stopped waiting, but Dataverse may still finish the import.",
							"job-2",
						),
					),
				);
			});
		await openPublishDialog();
		act(() => buttonNamed("Publish 1 change")!.click());
		await flush();
		expect(signal?.aborted).toBe(false);
		expect(buttonNamed("Publishing…")?.disabled).toBe(true);
		const cancel = buttonNamed("Cancel")!;
		expect(cancel.disabled).toBe(false);
		act(() => cancel.click());
		await flush();
		expect(signal?.aborted).toBe(true);
		const text = dialogText();
		expect(text).toContain("Publish cancelled");
		expect(text).toContain("An import that was already running may still finish in Dataverse.");
		expect(text).toContain("Dataverse may still finish the import.");
		expect(text).not.toContain("Publish failed");
		// No spinner left; the change is still pending, so Publish is offered again.
		expect(buttonNamed("Publishing…")).toBeUndefined();
		expect(document.querySelector('[role="progressbar"]')).toBeNull();
		expect(buttonNamed("Publish 1 change")?.disabled).toBe(false);
		expect(buttonNamed("View import log")).toBeDefined();
		// Cancel closes the dialog again once the run is over.
		act(() => buttonNamed("Cancel")!.click());
		await flush();
		expect(useUIStore.getState().bulkPublishOpen).toBe(false);
	});

	it("a second click on Publish doesn't start a second run", async () => {
		let runs = 0;
		let finish: () => void = () => undefined;
		fake.publishRibbon = () =>
			new Promise((resolve) => {
				runs++;
				finish = () =>
					resolve({
						elementCount: 0,
						preservedCount: 0,
						importJobId: "job-3",
						parts: emptyRibbonDiffParts(),
						changedKeys: [],
					});
			});
		await openPublishDialog();
		const publish = buttonNamed("Publish 1 change")!;
		act(() => {
			publish.click();
			publish.click();
		});
		await flush();
		expect(runs).toBe(1);
		finish();
		await flush();
		expect(dialogText()).toContain("Published 1 change");
	});

	it("closing the dialog's content mid-run stops waiting", async () => {
		let signal: AbortSignal | undefined;
		fake.publishRibbon = (input) =>
			new Promise(() => {
				signal = input.signal;
			});
		await openPublishDialog();
		act(() => buttonNamed("Publish 1 change")!.click());
		await flush();
		expect(signal?.aborted).toBe(false);
		act(() => root.unmount());
		expect(signal?.aborted).toBe(true);
		// afterEach unmounts again: a second unmount is harmless.
		root = createRoot(container);
	});
});
