/**
 * #22: the top bar shipped controls that did nothing (a "State simulator",
 * Save, Settings, Help), and in a narrow pane the side panes left the canvas
 * one group wide. #109's publish-all confirmation is in environmentSafeguards.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { TopBar } from "@/components/shell/TopBar";
import { dragPaneWidths, fitPaneWidths } from "@/utils/paneWidths";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("#22 the top bar", () => {
	let container: HTMLDivElement;
	let root: Root;
	const copied: string[] = [];
	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		(window as unknown as { toolboxAPI: unknown }).toolboxAPI = {
			utils: { copyToClipboard: async (text: string) => void copied.push(text) },
		};
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		delete (window as unknown as { toolboxAPI?: unknown }).toolboxAPI;
	});

	it("has no controls that do nothing, and Help copies the documentation link", async () => {
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<TopBar />
				</FluentProvider>,
			),
		);
		const labels = [...container.querySelectorAll("button, select")].map(
			(b) => b.getAttribute("aria-label") || b.textContent?.trim(),
		);
		expect(labels).not.toContain("State simulator");
		expect(labels).not.toContain("Settings");
		expect(labels).not.toContain("Save");

		act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Help"]')!.click());
		expect(document.body.textContent).toContain("kept as a draft for each table automatically");
		const copy = [...document.querySelectorAll("button")].find(
			(b) => b.textContent === "Copy documentation link",
		)!;
		await act(async () => copy.click());
		expect(copied).toEqual([
			"https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio#readme",
		]);
		expect(document.body.textContent).toContain("Copied: paste it into your browser.");
	});
});

describe("#22 side panes in a narrow window", () => {
	it("are left as set when there's room", () => {
		expect(fitPaneWidths(1600, 260, 340)).toEqual({ left: 260, right: 340 });
	});

	it("give way in proportion so the canvas keeps 40% of an 800 px window", () => {
		const { left, right } = fitPaneWidths(800, 260, 340);
		expect(800 - left - right).toBeGreaterThanOrEqual(320);
		expect(left / right).toBeCloseTo(260 / 340, 1);
	});

	it("never below their minimums; a hidden Properties pane takes nothing", () => {
		expect(fitPaneWidths(400, 260, 340)).toEqual({ left: 160, right: 200 });
		expect(fitPaneWidths(400, 260, 0)).toEqual({ left: 240, right: 0 });
	});
});

describe("#22 review: dragging a handle while the panes are fitted", () => {
	const drag = (side: "left" | "right", step: number, moves: number) => {
		let stored = { left: 260, right: 340 };
		const shown: number[] = [];
		for (let i = 0; i < moves; i++) {
			const next = dragPaneWidths(800, stored.left, stored.right, side, step);
			stored = { left: next.left ?? stored.left, right: next.right ?? stored.right };
			const fit = fitPaneWidths(800, stored.left, stored.right);
			shown.push(side === "left" ? fit.left : fit.right);
		}
		return shown;
	};

	it("widens the pane being dragged wider, on every move", () => {
		const left = drag("left", 5, 10);
		for (let i = 1; i < left.length; i++) expect(left[i]).toBeGreaterThan(left[i - 1]);
		expect(left[0]).toBeGreaterThan(fitPaneWidths(800, 260, 340).left);
		// The right handle widens Properties when dragged left.
		const right = drag("right", -5, 10);
		for (let i = 1; i < right.length; i++) expect(right[i]).toBeGreaterThan(right[i - 1]);
	});

	it("leaves the stored widths alone when nothing is fitted, and the hidden pane's width too", () => {
		expect(dragPaneWidths(1600, 260, 340, "left", 10)).toEqual({ left: 270 });
		expect(dragPaneWidths(400, 260, 0, "left", 10)).toEqual({ left: 250 });
	});
});
