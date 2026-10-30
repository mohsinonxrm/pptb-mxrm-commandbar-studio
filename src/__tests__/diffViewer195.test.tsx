/**
 * #195 review: Compare with published says "No changes" only when nothing is
 * pending — a changed command or rule leaves the generated XML the same — and
 * "Show the full XML anyway" lasts for one opening.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { DiffViewer } from "@/components/panels/DiffViewer";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";

vi.mock("@monaco-editor/react", () => ({ DiffEditor: () => <div>DIFF EDITOR</div> }));

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
const initialRibbon = useRibbonStore.getState();
const body = () => document.body.textContent ?? "";
const byName = (name: string) =>
	[...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useUIStore.setState(initialUI, true);
	useRibbonStore.setState(initialRibbon, true);
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<DiffViewer />
			</FluentProvider>,
		),
	);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#195 Compare with published", () => {
	it("says there are no changes when nothing is pending, until asked once", async () => {
		act(() => useUIStore.getState().openDiffViewer("compare"));
		expect(body()).toContain("No changes since the last publish");
		await act(async () => byName("Show the full XML anyway")!.click());
		expect(body()).not.toContain("No changes since the last publish");

		act(() => useUIStore.getState().closeDiffViewer());
		act(() => useUIStore.getState().openDiffViewer("compare"));
		expect(body()).toContain("No changes since the last publish");
	});

	it("shows the diff when a command changed, though the ribbon didn't", () => {
		act(() =>
			useRibbonStore.setState({
				commands: [{ id: "cbs.account.Run.Command" }] as never,
				mutationsSincePublish: 0,
			}),
		);
		act(() => useUIStore.getState().openDiffViewer("compare"));
		expect(body()).not.toContain("No changes since the last publish");
	});
});
