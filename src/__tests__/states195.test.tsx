/**
 * #195: before a solution or table is open the canvas says what to do next
 * (and offers nothing that can't work yet); loading shows a skeleton with a
 * status line; a failed load says why in plain language, with Retry and
 * copyable details.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { RibbonCanvas } from "@/components/ribbon-canvas/RibbonCanvas";
import { useUIStore } from "@/store/uiStore";

vi.mock("@/components/panels/XmlView", () => ({ default: () => null }));
vi.mock("@/components/panels/CommandEditorPanel", () => ({ default: () => null }));
vi.mock("@/components/panels/RuleEditorPanel", () => ({ default: () => null }));
vi.mock("@/components/modals/BulkPublishModal", () => ({ default: () => null }));
vi.mock("@/components/modals/NewButtonModal", () => ({ default: () => null }));
vi.mock("@/components/modals/NewGroupModal", () => ({ default: () => null }));
vi.mock("@/components/modals/NewTabModal", () => ({ default: () => null }));
vi.mock("@/components/modals/ImportXmlModal", () => ({ default: () => null }));
vi.mock("@/components/command-palette/CommandPalette", () => ({ default: () => null }));
vi.mock("@/components/panels/TranslationsView", () => ({ default: () => null }));
vi.mock("@/components/modals/IconPickerModal", () => ({ default: () => null }));
vi.mock("@/components/panels/WebResourceBrowser", () => ({ default: () => null }));
vi.mock("@/components/panels/CompareView", () => ({ default: () => null }));
vi.mock("@/components/modals/HideInsteadOfDeleteModal", () => ({ default: () => null }));

const copied = vi.hoisted(() => ({ texts: [] as string[] }));
vi.mock("@/utils/hostIO", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/hostIO")>()),
	copyText: async (text: string) => {
		copied.texts.push(text);
		return { ok: true };
	},
}));

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

let container: HTMLDivElement;
let root: Root;
const initialUI = useUIStore.getState();
function render(ui: React.ReactElement) {
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
}
const byName = (name: string) =>
	[...document.body.querySelectorAll("button")].find(
		(b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name,
	);
const click = async (el: Element | undefined) => {
	if (!el) throw new Error("not found");
	await act(async () => (el as HTMLElement).click());
};

beforeEach(() => {
	copied.texts = [];
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useUIStore.setState(initialUI, true);
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#195 before anything is open", () => {
	it("asks for a solution, with nothing else on the canvas", async () => {
		render(<RibbonCanvas emptyState="noSolution" />);
		expect(container.textContent).toContain("Choose a solution to start");
		expect(container.textContent).not.toContain("Add first group");
		expect(container.querySelector('[aria-label="Where the command bar appears"]')).toBeNull();
		await click(byName("Choose solution"));
		expect(useUIStore.getState().solutionPickerOpen).toBe(true);
	});

	it("asks for a table, and Choose table opens the top bar's table picker (#194)", async () => {
		render(<RibbonCanvas emptyState="noTable" />);
		expect(container.textContent).toContain("Pick a table");
		expect(container.textContent).not.toContain("Add first group");
		await click(byName("Choose table"));
		expect(useUIStore.getState().tablePickerOpen).toBe(true);
	});
});

describe("#195 loading and failing", () => {
	it("loading shows progress and a status line naming the table and step", () => {
		render(<RibbonCanvas isLoadingRibbon loadingTable="Account" loadingStep="Reading rules" />);
		expect(container.querySelector('[role="progressbar"]')).toBeTruthy();
		const status = [...container.querySelectorAll('[role="status"]')].find((s) =>
			s.textContent?.includes("Loading"),
		);
		expect(status?.textContent).toBe("Loading Account · Reading rules");
	});

	it("a failed load says why in plain language, with Retry and copyable details", async () => {
		const retry = vi.fn();
		const error = "GET RetrieveEntityRibbon → 401 Unauthorized";
		render(
			<RibbonCanvas
				loadingTable="Account"
				ribbonLoadError={error}
				onRetryRibbonLoad={retry}
			/>,
		);
		expect(container.textContent).toContain("Couldn't load Account's ribbon");
		expect(container.textContent).toContain("Your connection may have expired.");
		await click(byName("Retry"));
		expect(retry).toHaveBeenCalledOnce();
		await click(byName("Details"));
		expect(container.textContent).toContain(error);
		await click(byName("Copy details"));
		expect(copied.texts).toEqual([error]);
		expect(byName("Copied")).toBeTruthy();
	});
});
