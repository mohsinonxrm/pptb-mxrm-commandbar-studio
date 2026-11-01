/**
 * #229, part 2 of the visual pass: the web resource browser uses the one
 * dialog shell, Enter chooses a row, and every way out clears the caller's
 * callback.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { WebResourceBrowser } from "@/components/panels/WebResourceBrowser";
import { useUIStore } from "@/store/uiStore";
import { webResourceBrowserCallbackRegistry } from "@/utils/webResourceBrowserCallback";
import type { WebResource } from "@/types/webResource";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const resources: WebResource[] = [
	{ id: "1", name: "new_/scripts/a.js", webResourceType: "js", isCustom: true },
	{ id: "2", name: "new_/icons/b.svg", webResourceType: "svg", isCustom: true },
];
vi.mock("@/services/dataverse/webResourceService", () => ({
	loadWebResources: async () => resources,
	saveWebResource: async () => ({}),
	WebResourceSaveCancelled: class extends Error {},
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
		act(() => {
			row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
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
