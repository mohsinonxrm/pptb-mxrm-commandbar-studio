/**
 * #229, part 2 of the visual pass: the web resource browser uses the one
 * dialog shell, Enter chooses a row, and every way out clears the caller's
 * callback.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, Input, webLightTheme } from "@fluentui/react-components";
import { WebResourceBrowser } from "@/components/panels/WebResourceBrowser";
import { AppDialog } from "@/components/shared/AppDialog";
import { DraftRestoreDialog } from "@/components/modals/DraftRestoreDialog";
import { WordBreaks } from "@/components/shared/WordBreaks";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import { useSessionStore } from "@/store/sessionStore";
import type { RibbonButton } from "@/types/ribbon";
import { BottomPanel } from "@/components/bottom-panel/BottomPanel";
import { useDraftStore, draftKeyFor } from "@/store/draftStore";
import { useUIStore } from "@/store/uiStore";
import { webResourceBrowserCallbackRegistry } from "@/utils/webResourceBrowserCallback";
import type { WebResource } from "@/types/webResource";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const resources: WebResource[] = [
	{ id: "1", name: "new_/scripts/a.js", webResourceType: "js", isCustom: true },
	{ id: "2", name: "new_/icons/b.svg", webResourceType: "svg", isCustom: true },
];
const tone = vi.hoisted(() => ({ value: "dark" as "dark" | "light" }));
vi.mock("@/utils/imageTone", () => ({ imageTone: async () => tone.value }));
vi.mock("@/services/dataverse/webResourceService", async (original) => ({
	...(await original<object>()),
	loadWebResources: async () => resources,
	saveWebResource: async () => ({}),
	loadWebResourceImage: async () => "data:image/svg+xml;base64,PHN2Zy8+",
}));

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
	webResourceBrowserCallbackRegistry.clear();
	useUIStore.setState({ webResourceBrowserOpen: false });
});

async function openBrowser() {
	useUIStore.setState({ webResourceBrowserOpen: true });
	await act(async () => {
		root.render(
			<FluentProvider theme={webLightTheme}>
				<WebResourceBrowser />
			</FluentProvider>,
		);
	});
	await act(async () => {
		await new Promise((r) => setTimeout(r, 0));
	});
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const button = (text: string) =>
	[...dialog().querySelectorAll<HTMLButtonElement>("button")].find(
		(b) => b.textContent?.trim() === text,
	)!;

describe("#229 web resource browser", () => {
	it("is the shared dialog, in sentence case, with the list of resources", async () => {
		await openBrowser();
		expect(dialog().querySelector("h2")?.textContent).toBe("Choose a web resource");
		expect(dialog().querySelector('[aria-label="Close"]')).not.toBeNull();
		expect(dialog().querySelector('[data-web-resource="new_/scripts/a.js"]')).not.toBeNull();
	});

	it("Enter on a row chooses it", async () => {
		const chosen: string[] = [];
		webResourceBrowserCallbackRegistry.set((wr) => chosen.push(wr.name));
		await openBrowser();
		const row = dialog().querySelector<HTMLElement>('[data-web-resource="new_/scripts/a.js"]')!;
		// The row's own Enter handler. That the grid's focus manager lets Enter
		// through (useFocusableGroup) was checked live in PPTB: jsdom doesn't run it.
		act(() => {
			row.focus();
			row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(row.tabIndex).toBeGreaterThanOrEqual(0);
		expect(chosen).toEqual(["new_/scripts/a.js"]);
		expect(useUIStore.getState().webResourceBrowserOpen).toBe(false);
	});

	it("Cancel clears the caller's callback", async () => {
		webResourceBrowserCallbackRegistry.set(() => {});
		await openBrowser();
		act(() => button("Cancel").click());
		expect(webResourceBrowserCallbackRegistry.hasPending()).toBe(false);
		expect(useUIStore.getState().webResourceBrowserOpen).toBe(false);
	});
});

describe("#229 dialogs", () => {
	const render = (ui: React.ReactElement) =>
		act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));

	it("a field marked data-autofocus takes focus from the close button", async () => {
		render(
			<AppDialog open onOpenChange={() => {}} title="New group">
				<Input aria-label="Label" data-autofocus />
			</AppDialog>,
		);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
		expect(document.activeElement?.getAttribute("aria-label")).toBe("Label");
	});

	it("the draft offer starts on Restore, not on Discard", async () => {
		useDraftStore.setState({
			pending: { savedAt: "2026-11-01T00:00:00Z" } as never,
			restoreError: null,
		});
		render(<DraftRestoreDialog />);
		await act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
		expect(document.activeElement?.textContent).toBe("Restore changes");
		act(() => useDraftStore.setState({ pending: null }));
	});

	it("an icon's name may wrap between its words", () => {
		render(
			<span data-testid="name">
				<WordBreaks text="ClipboardPaste" />
			</span>,
		);
		const name = container.querySelector('[data-testid="name"]')!;
		expect(name.textContent).toBe("ClipboardPaste");
		expect(name.querySelectorAll("wbr")).toHaveLength(1);
	});
});

describe("#229 bottom panel while loading", () => {
	const render = (ui: React.ReactElement) =>
		act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));

	it("says the grids fill in once loaded, not that there's nothing", () => {
		useUIStore.setState({ bottomCollapsed: false, bottomPanelHeight: 400 });
		useDraftStore.setState({ target: null });
		render(<BottomPanel />);
		expect(container.textContent).toContain("Shown once the table's ribbon is loaded.");
		expect(container.textContent).not.toContain("No commands.");

		act(() => useDraftStore.setState({ target: draftKeyFor("account") }));
		expect(container.textContent).toContain("No commands.");
		act(() => useDraftStore.setState({ target: null }));
	});
});

describe("#229 dark theme", () => {
	const render = (ui: React.ReactElement) =>
		act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
	const iconButton = {
		id: "x.Seq",
		label: "Sequences",
		kind: "button",
		image32: "$webresource:msdyn_/Icons/Sequence.svg",
	} as RibbonButton;

	const settle = () =>
		act(async () => {
			await new Promise((r) => setTimeout(r, 0));
		});
	afterEach(() => {
		useUIStore.setState({ themeMode: "light" });
		useSessionStore.setState({ connectionUrl: "" } as never);
		tone.value = "dark";
	});

	it("a dark glyph reads light in the dark theme; in light, it's as drawn", async () => {
		useSessionStore.setState({ connectionUrl: "https://org.crm.dynamics.com" } as never);
		useUIStore.setState({ themeMode: "dark" });
		render(<RibbonButtonIcon button={iconButton} size={16} />);
		await settle();
		expect(container.querySelector("img")?.style.filter).toBe("invert(1) hue-rotate(180deg)");

		act(() => useUIStore.setState({ themeMode: "light" }));
		expect(container.querySelector("img")?.style.filter).toBe("");
	});

	it("a coloured image is left as drawn, and a caller's filter is kept", async () => {
		useSessionStore.setState({ connectionUrl: "https://org.crm.dynamics.com/2" } as never);
		useUIStore.setState({ themeMode: "dark" });
		tone.value = "light";
		render(<RibbonButtonIcon button={iconButton} size={16} />);
		await settle();
		expect(container.querySelector("img")?.style.filter).toBe("");

		tone.value = "dark";
		useSessionStore.setState({ connectionUrl: "https://org.crm.dynamics.com/3" } as never);
		render(
			<RibbonButtonIcon
				button={iconButton}
				size={16}
				style={{ filter: "grayscale(40%) opacity(0.85)" }}
			/>,
		);
		await settle();
		await settle();
		expect(container.querySelector("img")?.style.filter).toBe(
			"invert(1) hue-rotate(180deg) grayscale(40%) opacity(0.85)",
		);
	});
});
