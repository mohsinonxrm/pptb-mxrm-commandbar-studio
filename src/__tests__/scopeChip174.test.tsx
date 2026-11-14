/**
 * #174, #264: the solution chip is the scope chip FetchXML Studio and Dataverse Request Studio
 * share — outline in every state (Publish stays the one primary button), "Solution: Name vX.Y.Z"
 * with Unmanaged and prefix badges, a titled popover with "Changes apply right away." and Done,
 * and a first-run tip per environment.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { TopBar } from "@/components/shell/TopBar";
import { useUIStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";

vi.mock("@/hooks/usePublishPlan", () => ({
	usePublishPlan: () => ({ changes: [], unsupported: [] }),
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

const ENV = "https://org.crm.dynamics.com/";
const sol = {
	id: "s1",
	uniqueName: "SalesCore",
	friendlyName: "Sales Core",
	version: "1.2.0.7",
	isManaged: false,
	publisherPrefix: "cso",
	publisherUniqueName: "contoso",
	publisherName: "Contoso",
};
const initialUI = useUIStore.getState();
let container: HTMLDivElement;
let root: Root;
const flush = async () => {
	for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const render = () =>
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<TopBar />
			</FluentProvider>,
		),
	);
const chip = () =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
		/^(Choose scope|Solution: )/.test(b.getAttribute("aria-label") ?? ""),
	)!;
const byText = (text: string) =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) => b.textContent?.trim() === text,
	);

beforeEach(() => {
	useUIStore.setState({ ...initialUI, scopeTipDismissed: [] }, true);
	useSessionStore.setState({
		solutions: [sol],
		activeSolution: null,
		connectionUrl: ENV,
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

describe("#174 the solution chip", () => {
	it("reads Choose scope when nothing is chosen (#264)", async () => {
		render();
		await flush();
		expect(chip().getAttribute("aria-label")).toBe("Choose scope");
		expect(chip().textContent).toContain("Choose scope");
		// Outline, not primary: Griffel's atomic classes don't say which, so the PPTB check
		// (and its screenshot) covers the look.
	});

	it("names the solution with three version parts and its badges", async () => {
		useSessionStore.setState({ activeSolution: sol } as never);
		render();
		await flush();
		expect(chip().getAttribute("aria-label")).toBe("Solution: Sales Core v1.2.0");
		expect(chip().textContent).toContain("Solution: Sales Core v1.2.0");
		expect(chip().textContent).toContain("Unmanaged");
		expect(chip().textContent).toContain("cso_");
	});

	it("opens a titled popover with the caption, and Done closes it", async () => {
		useSessionStore.setState({ activeSolution: sol } as never);
		render();
		act(() => useUIStore.getState().setSolutionPickerOpen(true));
		await flush();
		const text = document.body.textContent ?? "";
		expect(text).toContain("Unmanaged solution");
		expect(text).toContain("Command Bar Studio edits one unmanaged solution at a time.");
		expect(text).toContain("Changes apply right away.");
		act(() => byText("Done")!.click());
		expect(useUIStore.getState().solutionPickerOpen).toBe(false);
	});
});

describe("#174 the first-run tip", () => {
	it("shows once per environment until dismissed; Choose scope opens the picker", async () => {
		render();
		await flush();
		expect(document.body.textContent).toContain("Choose where entities come from");
		act(() =>
			[...document.querySelectorAll<HTMLButtonElement>("button")]
				.filter((b) => b.textContent?.trim() === "Choose scope")
				.find((b) => b !== chip())!
				.click(),
		);
		await flush();
		expect(useUIStore.getState().scopeTipDismissed).toEqual([ENV]);
		expect(useUIStore.getState().solutionPickerOpen).toBe(true);

		// Another environment shows it again; Got it dismisses it there
		act(() => useUIStore.getState().setSolutionPickerOpen(false));
		act(() => useSessionStore.setState({ connectionUrl: "https://other/" } as never));
		await flush();
		expect(document.body.textContent).toContain("Choose where entities come from");
		act(() => byText("Got it")!.click());
		await flush();
		expect(document.body.textContent).not.toContain("Choose where entities come from");
		expect(useUIStore.getState().scopeTipDismissed).toEqual([ENV, "https://other/"]);
	});

	it("doesn't show once a solution is chosen", async () => {
		useSessionStore.setState({ activeSolution: sol } as never);
		render();
		await flush();
		expect(document.body.textContent).not.toContain("Choose where entities come from");
	});

	it("gives focus back to the chip when dismissed, and after Done (#174 review)", async () => {
		render();
		await flush();
		act(() => byText("Got it")!.click());
		(document.activeElement as HTMLElement | null)?.blur();
		await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
		expect(document.activeElement).toBe(chip());

		act(() => useUIStore.getState().setSolutionPickerOpen(true));
		await flush();
		act(() => byText("Done")!.click());
		(document.activeElement as HTMLElement | null)?.blur();
		await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
		expect(document.activeElement).toBe(chip());
	});

	it("marks the default publisher with an icon, not colour alone", async () => {
		useSessionStore.setState({
			activeSolution: {
				...sol,
				publisherPrefix: "new",
				publisherUniqueName: "DefaultPublisherorg",
			},
		} as never);
		render();
		await flush();
		const badge = [...chip().querySelectorAll(".fui-Badge")].find((b) =>
			b.textContent?.includes("new_"),
		)!;
		expect(badge.querySelector("svg")).not.toBeNull();
	});
});
