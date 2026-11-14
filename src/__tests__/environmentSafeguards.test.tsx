/**
 * #121 — every write names its target environment; Production needs a typed confirmation;
 * an upload never replaces an existing web resource without asking, and never a managed one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { parseRibbonXml } from "@/services/xmlParser";
import {
	isProductionEnvironment,
	isTypedConfirmation,
	requiresTypedConfirmation,
} from "@/components/shared/targetScopeRules";
import {
	upsertWebResource,
	WebResourceSaveCancelled,
	type UpsertWebResourceOptions,
} from "@/services/dataverse/webResourceService";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import type { EntityMetadata } from "@/types/entity";
import type { Solution } from "@/types/solution";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

// jsdom has no ResizeObserver; Fluent's MessageBar uses it for reflow.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

// The pre-publish check reads the org; here it finds nothing.
vi.mock("@/services/dataverse/publishService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/publishService")>()),
	checkBeforePublish: vi.fn(async () => ({ findings: [] })),
}));

describe("targetScopeRules", () => {
	it("asks for a typed confirmation on Production only", () => {
		expect(isProductionEnvironment("Production")).toBe(true);
		expect(isProductionEnvironment(" production ")).toBe(true);
		expect(isProductionEnvironment("Dev")).toBe(false);
		expect(isProductionEnvironment(undefined)).toBe(false);
		expect(requiresTypedConfirmation("Production")).toBe(true);
		expect(requiresTypedConfirmation("UAT")).toBe(false);
	});

	it("accepts the word ignoring case and spaces, never an empty word", () => {
		expect(isTypedConfirmation(" CBSTEST_RibbonTest ", "cbstest_ribbontest")).toBe(true);
		expect(isTypedConfirmation("cbstest", "cbstest_ribbontest")).toBe(false);
		expect(isTypedConfirmation("", "")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The publish dialog
// ---------------------------------------------------------------------------

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
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});
const entity: EntityMetadata = {
	metadataId: "md",
	logicalName: T,
	displayName: "CBS Ribbon Test",
	isCustomEntity: true,
	isIntersect: false,
};
const solution = {
	id: "s1",
	uniqueName: "CBSLiveTest",
	friendlyName: "CBS Live Test",
	version: "1.0.0.0",
	isManaged: false,
	publisherPrefix: "cbstest",
	publisherUniqueName: "cbstest",
	publisherName: "CBS Test",
} as Solution;

let environment: "Dev" | "Production";
let container: HTMLDivElement;
let root: Root;
const flush = async () => {
	for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
// "Publish 1 change" (#188): it says how many changes it publishes.
const publishButton = () =>
	[...document.querySelectorAll("button")].find((b) =>
		/^Publish( \d+ changes?)?$/.test(b.textContent?.trim() ?? ""),
	) as HTMLButtonElement | undefined;
// The options are folded away until opened (#188).
const openOptions = async () => {
	const header = [...document.querySelectorAll("button")].find(
		(b) => b.textContent?.trim() === "Options",
	)!;
	act(() => header.click());
	await flush();
};
const confirmInput = () =>
	document.querySelector<HTMLInputElement>(`input[aria-label="Type ${T} to confirm"]`);
function type(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
	act(() => {
		setter.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

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

describe("the publish dialog names its target and guards Production (#121)", () => {
	beforeEach(() => {
		(window as unknown as { toolboxAPI: unknown }).toolboxAPI = {
			connections: {
				getConnection: async () => ({
					id: "c1",
					name: "Contoso",
					url: "https://contoso.crm.dynamics.com",
					environment,
				}),
			},
		};
		useSessionStore.setState({
			activeSolution: solution,
			activeEntity: entity,
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
		useUIStore.setState({ bulkPublishOpen: false });
		delete (window as unknown as { toolboxAPI?: unknown }).toolboxAPI;
	});

	it("on Production, Publish waits for the table's logical name", async () => {
		environment = "Production";
		await openPublishDialog();
		const text = document.body.textContent ?? "";
		expect(text).toContain("Production environment");
		expect(text).toContain("Contoso");
		expect(text).toContain("https://contoso.crm.dynamics.com");
		expect(text).toContain("CBS Live Test");
		expect(publishButton()?.disabled).toBe(true);

		type(confirmInput()!, "cbstest");
		await flush();
		expect(publishButton()?.disabled).toBe(true);

		type(confirmInput()!, T.toUpperCase());
		await flush();
		expect(publishButton()?.disabled).toBe(false);
	});

	it("asks for the word when the connection becomes Production while the dialog is open", async () => {
		environment = "Dev";
		useSessionStore.setState({ environment: "Dev" });
		await openPublishDialog();
		expect(publishButton()?.disabled).toBe(false);

		// PPTB's connection edit: same connection, its type set to Production (#120's "details").
		environment = "Production";
		act(() => useSessionStore.setState({ environment: "Production" }));
		await flush();
		expect(document.body.textContent).toContain("Production environment");
		expect(confirmInput()).not.toBeNull();
		expect(publishButton()?.disabled).toBe(true);
	});

	it("reads the connection again on Publish, and stops when it became Production", async () => {
		environment = "Dev";
		await openPublishDialog();
		expect(publishButton()?.disabled).toBe(false);

		// The host's connection changed without the session hearing of it yet.
		environment = "Production";
		act(() => publishButton()!.click());
		await flush();
		expect(document.body.textContent).not.toContain("Publishing...");
		expect(confirmInput()).not.toBeNull();
		expect(publishButton()?.disabled).toBe(true);
	});

	it("Publish is enabled again after the dialog is closed and reopened (#33 validation)", async () => {
		// As in a background window: Fluent's closing animation never ends, so the
		// dialog's content stays mounted after it closes.
		const animate = (Element.prototype as { animate?: unknown }).animate;
		(Element.prototype as { animate?: unknown }).animate = () => ({
			finished: new Promise(() => undefined),
			onfinish: null,
			oncancel: null,
			playState: "running",
			cancel() {},
			finish() {},
			pause() {},
			play() {},
			persist() {},
			commitStyles() {},
			addEventListener() {},
			removeEventListener() {},
		});
		try {
			await closeAndReopen();
		} finally {
			(Element.prototype as { animate?: unknown }).animate = animate;
		}
	});

	async function closeAndReopen() {
		environment = "Dev";
		await openPublishDialog();
		expect(publishButton()?.disabled).toBe(false);
		// Cancel: the dialog's content can stay mounted (a closing animation that never ends,
		// e.g. in a background window), so the target block must report again on reopening.
		act(() =>
			[...document.querySelectorAll("button")]
				.find((b) => b.textContent?.trim() === "Cancel")!
				.click(),
		);
		await flush();
		// Still mounted (the case this covers), and Publish works on reopening.
		expect(document.body.textContent).toContain("Publish CBS Ribbon Test");
		act(() => useUIStore.setState({ bulkPublishOpen: true }));
		await flush();
		expect(publishButton()?.disabled).toBe(false);
	}

	it("Publish waits for a reload when the base language couldn't be read at load (#106)", async () => {
		environment = "Dev";
		useRibbonStore.setState({ baseLanguageUnknown: true });
		try {
			await openPublishDialog();
			expect(document.body.textContent).toContain(
				"base language couldn't be read when the table loaded",
			);
			expect(publishButton()?.disabled).toBe(true);
		} finally {
			useRibbonStore.setState({ baseLanguageUnknown: false });
		}
	});

	it("on Dev, the target is named and Publish needs no typing", async () => {
		environment = "Dev";
		await openPublishDialog();
		const text = document.body.textContent ?? "";
		expect(text).toContain("Contoso");
		expect(text).not.toContain("Production environment");
		expect(confirmInput()).toBeNull();
		expect(publishButton()?.disabled).toBe(false);
	});

	it("publishing all customizations needs its own confirmation, naming the environment (#109)", async () => {
		environment = "Dev";
		useSessionStore.setState({ connectionName: "Contoso" });
		await openPublishDialog();
		await openOptions();
		const dropdown = [...document.querySelectorAll<HTMLElement>("[role=combobox]")].find((b) =>
			b.textContent?.includes("Only these ribbons"),
		)!;
		act(() => dropdown.click());
		await flush();
		const option = [...document.querySelectorAll<HTMLElement>("[role=option]")].find((o) =>
			o.textContent?.includes("Every unpublished customization"),
		)!;
		act(() => option.click());
		await flush();
		expect(document.body.textContent).toContain(
			"This publishes every unpublished customization in Contoso",
		);
		expect(publishButton()?.disabled).toBe(true);
		const checkbox = [
			...document.querySelectorAll<HTMLInputElement>("input[type=checkbox]"),
		].find((c) =>
			c
				.closest("label, div")
				?.textContent?.includes("Publish all unpublished customizations in Contoso"),
		)!;
		act(() => checkbox.click());
		await flush();
		expect(publishButton()?.disabled).toBe(false);
	});

	it("the publish comment is written to the Console log (#109)", async () => {
		environment = "Dev";
		await openPublishDialog();
		await openOptions();
		const comment = document.querySelector<HTMLTextAreaElement>("textarea")!;
		const setter = Object.getOwnPropertyDescriptor(
			HTMLTextAreaElement.prototype,
			"value",
		)!.set!;
		act(() => {
			setter.call(comment, "Adds the New one button");
			comment.dispatchEvent(new Event("input", { bubbles: true }));
		});
		useRuntimeLogStore.getState().clear();
		// No Dataverse here: the publish itself fails, after the comment is logged.
		await act(async () => publishButton()!.click());
		await flush();
		expect(useRuntimeLogStore.getState().entries.map((e) => e.message)).toContain(
			"Publish comment: Adds the New one button",
		);
		// Closing clears it: it isn't logged again with the next publish.
		const cancel = [...document.querySelectorAll("button")].find((b) =>
			/^(Cancel|Close)$/.test(b.textContent?.trim() ?? ""),
		)!;
		act(() => cancel.click());
		act(() => useUIStore.setState({ bulkPublishOpen: true }));
		await flush();
		await openOptions();
		expect(document.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
	});
});

// ---------------------------------------------------------------------------
// Web resource uploads over an existing name
// ---------------------------------------------------------------------------

function fakeApi(existing: { ismanaged: boolean } | null) {
	return {
		queryData: vi.fn(async () => ({
			value: existing ? [{ webresourceid: "wr-1", ismanaged: existing.ismanaged }] : [],
		})),
		update: vi.fn(async () => undefined),
		create: vi.fn(async () => ({ id: "wr-new" })),
		execute: vi.fn(async () => ({})),
	};
}
const upload = (
	api: ReturnType<typeof fakeApi>,
	onExisting?: UpsertWebResourceOptions["onExisting"],
) =>
	upsertWebResource(
		api as unknown as DataverseAPI.API,
		"cbstest_/icons/logo.svg",
		"PHN2Zy8+",
		11,
		{
			solutionUniqueName: "CBSLiveTest",
			onExisting,
		},
	);

describe("upsertWebResource with onExisting (#121)", () => {
	it("asks, and replaces the content when told to", async () => {
		const api = fakeApi({ ismanaged: false });
		const onExisting = vi.fn(async () => "replace" as const);
		const result = await upload(api, onExisting);
		expect(onExisting).toHaveBeenCalledWith({
			id: "wr-1",
			name: "cbstest_/icons/logo.svg",
			managed: false,
		});
		expect(api.update).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ id: "wr-1", updated: true, created: false });
	});

	it("keeps the existing content, and still adds it to the solution", async () => {
		const api = fakeApi({ ismanaged: false });
		const result = await upload(api, async () => "keep");
		expect(api.update).not.toHaveBeenCalled();
		expect(api.execute).toHaveBeenCalledWith(
			expect.objectContaining({ operationName: "AddSolutionComponent" }),
		);
		expect(result).toMatchObject({ id: "wr-1", updated: false });
	});

	it("writes nothing when cancelled", async () => {
		const api = fakeApi({ ismanaged: false });
		await expect(upload(api, async () => "cancel")).rejects.toBeInstanceOf(
			WebResourceSaveCancelled,
		);
		expect(api.update).not.toHaveBeenCalled();
		expect(api.create).not.toHaveBeenCalled();
		expect(api.execute).not.toHaveBeenCalled();
	});

	it("says a managed web resource is managed, and never replaces it", async () => {
		const api = fakeApi({ ismanaged: true });
		const onExisting = vi.fn(async () => "replace" as const);
		await expect(upload(api, onExisting)).rejects.toThrow(
			/managed web resource .* can't be replaced/,
		);
		expect(onExisting).toHaveBeenCalledWith(expect.objectContaining({ managed: true }));
		expect(api.update).not.toHaveBeenCalled();
		expect(api.execute).not.toHaveBeenCalled();
	});

	it("keeps a managed web resource when told to", async () => {
		const api = fakeApi({ ismanaged: true });
		const result = await upload(api, async () => "keep");
		expect(api.update).not.toHaveBeenCalled();
		expect(result).toMatchObject({ id: "wr-1", updated: false });
	});

	it("doesn't ask for a new name", async () => {
		const api = fakeApi(null);
		const onExisting = vi.fn(async () => "cancel" as const);
		const result = await upload(api, onExisting);
		expect(onExisting).not.toHaveBeenCalled();
		expect(result).toMatchObject({ id: "wr-new", created: true });
	});

	it("without onExisting (the command editor saving its script) the content is replaced as before", async () => {
		const api = fakeApi({ ismanaged: false });
		await upload(api);
		expect(api.update).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// The replace prompt
// ---------------------------------------------------------------------------

describe("the replace prompt (#121)", () => {
	type Hook = ReturnType<
		typeof import("@/hooks/useReplaceWebResourceConfirm").useReplaceWebResourceConfirm
	>;
	let hook: Hook;
	let host: HTMLDivElement;
	let hostRoot: Root;

	beforeEach(async () => {
		const { useReplaceWebResourceConfirm } =
			await import("@/hooks/useReplaceWebResourceConfirm");
		function Probe() {
			hook = useReplaceWebResourceConfirm();
			return hook.dialog;
		}
		host = document.createElement("div");
		document.body.appendChild(host);
		hostRoot = createRoot(host);
		act(() =>
			hostRoot.render(
				<FluentProvider theme={webLightTheme}>
					<Probe />
				</FluentProvider>,
			),
		);
	});

	afterEach(() => {
		act(() => hostRoot.unmount());
		host.remove();
	});

	const buttons = () =>
		[...document.querySelectorAll("[role=dialog] button")].map((b) => b.textContent?.trim());

	it("offers Replace for an unmanaged one, only Keep or Cancel for a managed one", async () => {
		let answer: Promise<string> | undefined;
		act(() => {
			answer = hook.onExisting({ id: "1", name: "a.svg", managed: false });
		});
		await flush();
		expect(buttons()).toEqual(["Cancel", "Keep existing", "Replace"]);
		act(() =>
			(document.querySelectorAll("[role=dialog] button")[2] as HTMLButtonElement).click(),
		);
		await expect(answer).resolves.toBe("replace");

		act(() => {
			answer = hook.onExisting({ id: "2", name: "b.svg", managed: true });
		});
		await flush();
		expect(buttons()).toEqual(["Cancel", "Keep existing"]);
		expect(document.body.textContent).toContain("can't be replaced");
		act(() =>
			(document.querySelectorAll("[role=dialog] button")[1] as HTMLButtonElement).click(),
		);
		await expect(answer).resolves.toBe("keep");
	});

	it("cancels an earlier question still open, and the open one on a connection change", async () => {
		let first: Promise<string> | undefined;
		let second: Promise<string> | undefined;
		act(() => {
			first = hook.onExisting({ id: "1", name: "a.svg", managed: false });
		});
		act(() => {
			second = hook.onExisting({ id: "2", name: "b.svg", managed: false });
		});
		await expect(first).resolves.toBe("cancel");

		act(() =>
			useSessionStore.setState({
				connectionVersion: useSessionStore.getState().connectionVersion + 1,
			}),
		);
		await expect(second).resolves.toBe("cancel");
	});
});
