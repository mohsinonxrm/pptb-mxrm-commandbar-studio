/**
 * #216: Compare with published shows what Publish imports — the layer as read against the
 * RibbonDiffXml Publish builds — so a change only the merge writes (a moved tab) shows.
 * When that can't be built, it compares the generated XML and says why.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { CompareView } from "@/components/panels/CompareView";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { parseRibbonDiffParts } from "@/services/ribbonDiffMerge";

const mocks = vi.hoisted(() => ({
	build: vi.fn(),
	plan: {
		entityPlan: { hasChanges: true } as unknown,
		appPlan: { hasChanges: false } as unknown,
		includeApplicationRibbon: false,
		unsupported: [] as string[],
	},
}));
vi.mock("@/services/dataverse/publishService", async (importOriginal) => ({
	withCheckTimeout: (await importOriginal<typeof import("@/services/dataverse/publishService")>())
		.withCheckTimeout,
	buildMergedRibbonDiffXml: mocks.build,
}));
vi.mock("@/hooks/usePublishPlan", () => ({
	ENTITY_LOCATIONS: ["HomepageGrid", "SubGrid", "Form"],
	usePublishPlan: () => mocks.plan,
}));
vi.mock("@/utils/monacoSetup", () => ({}));
vi.mock("@monaco-editor/react", () => ({
	DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
		<div>
			<pre data-side="original">{original}</pre>
			<pre data-side="modified">{modified}</pre>
		</div>
	),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const LAYER = `<RibbonDiffXml><CustomActions><CustomAction Id="cbs.Tab.Move" Location="Mscrm.Tabs._children" Sequence="10"><CommandUIDefinition><Tab Id="cbs.Tab" Sequence="10" /></CommandUIDefinition></CustomAction></CustomActions></RibbonDiffXml>`;
const MERGED = LAYER.replaceAll('Sequence="10"', 'Sequence="90"');

let container: HTMLDivElement;
let root: Root;
const initialRibbon = useRibbonStore.getState();
const side = (name: string) => document.querySelector(`[data-side="${name}"]`)?.textContent ?? "";
const until = async (ready: () => boolean) => {
	for (let i = 0; i < 200 && !ready(); i++)
		await act(async () => new Promise((r) => setTimeout(r, 10)));
	expect(ready()).toBe(true);
};

beforeEach(() => {
	mocks.build.mockReset();
	useRibbonStore.setState({ ...initialRibbon, mutationsSincePublish: 1 }, true);
	useSessionStore.setState({
		activeEntity: { logicalName: "cbstest_ribbontest", schemaName: "cbstest_RibbonTest" },
	} as never);
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});
const render = () =>
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<CompareView />
			</FluentProvider>,
		),
	);

describe("#216 Compare with published", () => {
	it("compares the layer as read with what Publish imports", async () => {
		const parts = parseRibbonDiffParts(LAYER);
		mocks.build.mockResolvedValue({ xml: MERGED, layer: parts });
		render();
		await until(() => side("modified") !== "");
		expect(mocks.build).toHaveBeenCalledTimes(1);
		expect(mocks.build.mock.calls[0][0].entity.logicalName).toBe("cbstest_ribbontest");
		expect(side("modified")).toBe(MERGED);
		expect(side("original")).toContain('Sequence="10"');
		expect(document.body.textContent).toContain("what Publish imports (right)");
		// The moved tab is a change, not +0 / −0
		expect(document.body.textContent).not.toMatch(/\+0 lines.*-0 lines/);
	});

	it("compares the generated XML, and says why, when Publish's XML can't be built", async () => {
		mocks.build.mockRejectedValue(new Error("no connection"));
		render();
		await until(() =>
			document.body.textContent!.includes("Couldn't build what Publish writes"),
		);
		expect(document.body.textContent).toContain("(no connection)");
		expect(document.body.textContent).toContain("The published XML (left)");
	});

	it("doesn't read the layer for changes Publish can't write yet", async () => {
		mocks.plan.unsupported = ["Scaling changes on Main (not supported yet)"];
		try {
			render();
			await until(() => document.body.textContent!.includes("can't write some of these"));
			expect(mocks.build).not.toHaveBeenCalled();
		} finally {
			mocks.plan.unsupported = [];
		}
	});

	it("says when the application ribbon's changes are left out", async () => {
		mocks.plan.appPlan = { hasChanges: true };
		try {
			mocks.build.mockResolvedValue({ xml: MERGED, layer: parseRibbonDiffParts(LAYER) });
			render();
			await until(() => side("modified") !== "");
			expect(document.body.textContent).toContain(
				"Your application ribbon changes aren't shown",
			);
		} finally {
			mocks.plan.appPlan = { hasChanges: false };
		}
	});

	it("gives up after 30 s and compares the generated XML", async () => {
		mocks.build.mockReturnValue(new Promise(() => {}));
		vi.useFakeTimers();
		try {
			render();
			await act(async () => {
				await vi.advanceTimersByTimeAsync(30_000);
			});
		} finally {
			vi.useRealTimers();
		}
		await until(() => document.body.textContent!.includes("didn't finish within 30 s"));
	});
});
