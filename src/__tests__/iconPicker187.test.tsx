/**
 * #187 PR 4: the icon picker. The icons are buttons in one arrow-key group,
 * Regular / Filled are two toggles whose labels don't change, the selection
 * names the icon (not a raw ModernImage string), web resources are listed in
 * full with a count, and Upload is a real drop zone with a Choose SVG button.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { IconPickerModal } from "@/components/modals/IconPickerModal";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";
import type { Solution } from "@/types/solution";

const svc = vi.hoisted(() => ({
	resources: [] as { id: string; name: string; webResourceType: string; isCustom: boolean }[],
	saved: [] as string[],
}));
vi.mock("@/services/dataverse/webResourceService", () => ({
	loadWebResources: async () => svc.resources,
	saveWebResource: async (name: string) => {
		svc.saved.push(name);
		return {};
	},
	addExistingWebResourceToActiveSolution: async () => ({}),
	WebResourceSaveCancelled: class extends Error {},
}));
vi.mock("@/services/iconWebResource", () => ({
	ensureFluentIconWebResource: async (name: string, variant: string, prefix: string) => ({
		name: `${prefix}_/icons/fluent/${name.toLowerCase()}_${variant}.svg`,
		created: true,
	}),
}));
vi.mock("@/services/hostConnection", () => ({ writeGuard: () => () => {} }));

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; Fluent's MessageBar uses it.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const T = "account";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const GROUP = `${MAIN}.Management`;
const ribbon = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs:
		location === "HomepageGrid"
			? [
					{
						id: MAIN,
						label: "Main",
						sequence: 10,
						tabDisplayRules: [],
						groups: [
							{
								id: GROUP,
								label: "Management",
								sequence: 10,
								template: "Mscrm.Templates.Flexible2",
								buttons: [
									{
										id: "cbs.Approve",
										label: "Approve",
										kind: "button",
										sequence: 10,
										templateAlias: "o1",
										commandId: "cbs.Approve.Command",
										hidden: false,
										oob: false,
										custom: true,
										managed: false,
										origin: "unmanaged",
									},
								],
							},
						],
					},
				]
			: [],
});
const approve = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups[0].buttons[0];

let container: HTMLDivElement;
let root: Root;
const flush = async () => {
	for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const buttonNamed = (text: string | RegExp) =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
		typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? ""),
	);
const tab = (name: string) =>
	[...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
		t.textContent?.startsWith(name),
	)!;

beforeEach(async () => {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon("HomepageGrid"),
			SubGrid: ribbon("SubGrid"),
			Form: ribbon("Form"),
			Application: ribbon("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
	} as never);
	useSessionStore.setState({
		publisherPrefix: "cbs",
		activeSolution: {
			id: "s1",
			uniqueName: "CBSLiveTest",
			friendlyName: "CBS Live Test",
			version: "1.0.0.0",
			isManaged: false,
			publisherPrefix: "cbs",
		} as Solution,
	});
	useSelectionStore.getState().selectButtonInContext("HomepageGrid", MAIN, GROUP, "cbs.Approve");
	svc.resources = [];
	svc.saved = [];
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<IconPickerModal />
			</FluentProvider>,
		),
	);
	act(() => useUIStore.getState().openIconPicker());
	await flush();
});
afterEach(() => {
	act(() => useUIStore.getState().closeIconPicker());
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#187 the icon picker", () => {
	it("icons are buttons; the selection names the icon, and Use sets it", async () => {
		expect(dialog().textContent).toContain("Choose an icon");
		const icon = buttonNamed("Add")!;
		expect(icon.getAttribute("aria-pressed")).toBe("false");
		act(() => icon.click());
		expect(icon.getAttribute("aria-pressed")).toBe("true");
		const status = dialog().querySelector('[role="status"]')!;
		expect(status.textContent).toContain("Add · Regular");
		expect(dialog().textContent).not.toContain("ModernImage=");

		// Two toggles: the labels stay, the pressed one changes.
		act(() => buttonNamed("Filled")!.click());
		expect(buttonNamed("Filled")!.getAttribute("aria-pressed")).toBe("true");
		expect(buttonNamed("Regular")!.getAttribute("aria-pressed")).toBe("false");
		expect(dialog().querySelector('[role="status"]')!.textContent).toContain("Add · Filled");

		await act(async () => buttonNamed("Use Add")!.click());
		await flush();
		expect(approve().image16).toBe("$webresource:cbs_/icons/fluent/add_filled.svg");
		expect(useUIStore.getState().iconPickerOpen).toBe(false);
	});

	it("search narrows the icons, and says so when none match", () => {
		const search = dialog().querySelector<HTMLInputElement>(
			'input[aria-label="Search icons"]',
		)!;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
		act(() => {
			setter.call(search, "zzz");
			search.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(dialog().textContent).toContain("No icon matches.");
	});

	it("web resources are listed with a count that says when search should narrow them", async () => {
		svc.resources = Array.from({ length: 350 }, (_, i) => ({
			id: `wr${i}`,
			name: `cbs_/icons/i${i}.svg`,
			webResourceType: "svg",
			isCustom: true,
		}));
		act(() => tab("Web resources").click());
		await flush();
		const list = dialog().querySelector('[aria-label="SVG web resources"]')!;
		// Not a silent cap (#187): it says how many there are and how to find the rest.
		expect(list.querySelectorAll("button")).toHaveLength(300);
		expect(dialog().textContent).toContain(
			"Showing 300 of 350 SVG web resources. Search to find others.",
		);
		act(() => buttonNamed("cbs_/icons/i42.svg")!.click());
		expect(
			dialog().querySelector<HTMLInputElement>('input[placeholder*="publisher_"]')!.value,
		).toBe("cbs_/icons/i42.svg");
		await act(async () => buttonNamed("Use web resource")!.click());
		await flush();
		expect(approve().image32).toBe("$webresource:cbs_/icons/i42.svg");
	});

	it("Upload takes a dropped SVG, refuses another file, and has a Choose SVG button", async () => {
		act(() => tab("Upload SVG").click());
		expect(buttonNamed("Choose SVG…")).toBeTruthy();
		const zone = [...dialog().querySelectorAll("div")].find((d) =>
			d.textContent?.startsWith("Drop an SVG file here"),
		)!;
		const drop = (file: File) =>
			act(async () => {
				const event = new Event("drop", { bubbles: true }) as Event & {
					dataTransfer: { files: File[] };
				};
				Object.defineProperty(event, "dataTransfer", { value: { files: [file] } });
				zone.dispatchEvent(event);
			});
		await drop(new File(["x"], "logo.png", { type: "image/png" }));
		expect(dialog().textContent).toContain("logo.png isn't an SVG file.");
		await drop(new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }));
		await flush();
		expect(svc.saved).toEqual(["cbs_/icons/logo.svg"]);
	});
});
