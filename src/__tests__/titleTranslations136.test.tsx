/**
 * #136: tab and group titles can be translated. A new group's title label is published with
 * every language the session gave it; the Translations view of a title edits them, renames
 * the base one, and is read-only for a title that isn't yours.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { EditorDrawer } from "@/components/panels/EditorDrawer";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { titleTranslationTarget } from "@/utils/titleTranslation";
import type { RibbonDefinition, RibbonGroup, RibbonLocation } from "@/types/ribbon";

if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}
vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = "cbstest_ribbontest";
const TAB = `Mscrm.HomepageGrid.${T}.MainTab`;
const OOB = `${TAB}.Management`;
const NEW = "cbstest.Tools.Group";
const group = (id: string, label: string): RibbonGroup =>
	({ id, label, sequence: 10, template: "Mscrm.Templates.Flexible2", buttons: [] }) as never;
const ribbon = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs:
		location === "HomepageGrid"
			? [
					{
						id: TAB,
						label: "Main",
						sequence: 10,
						tabDisplayRules: [],
						groups: [group(OOB, "$Resources:Ribbon.HomepageGrid.MainTab.Management")],
					},
				]
			: [],
});
const store = () => useRibbonStore.getState();
const ui = () => useUIStore.getState();

let container: HTMLDivElement;
let root: Root;
const drawer = () => document.querySelector<HTMLElement>('[role="dialog"]');
const until = async (ready: () => boolean) => {
	for (let i = 0; i < 250 && !ready(); i++)
		await act(async () => new Promise((r) => setTimeout(r, 20)));
	expect(ready()).toBe(true);
};
const input = (name: string) =>
	document.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!;
const typeInto = (el: HTMLInputElement, value: string) => {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
	act(() => {
		setter.call(el, value);
		el.dispatchEvent(new Event("input", { bubbles: true }));
	});
};

beforeEach(() => {
	store().loadWorkspace({
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
	act(() => ui().closeEditor());
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<EditorDrawer />
			</FluentProvider>,
		),
	);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#136 a new group's title", () => {
	it("is published with every language the session gave it", () => {
		const current = ribbon("HomepageGrid");
		current.tabs[0].groups.push(group(NEW, "Tools"));
		const xml = generateRibbonDiffXml({
			location: "HomepageGrid",
			current,
			baseline: ribbon("HomepageGrid"),
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [
				{
					id: `${NEW}.Title`,
					titles: [
						{ languageCode: 1033, description: "Old" },
						{ languageCode: 1036, description: "Outils" },
					],
				},
			],
			entityLogicalName: T,
		});
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		const titles = [...doc.querySelectorAll(`LocLabel[Id="${NEW}.Title"] Title`)].map(
			(t) => `${t.getAttribute("languagecode")}:${t.getAttribute("description")}`,
		);
		expect(titles).toEqual(["1033:Tools", "1036:Outils"]);
	});

	it("is translated in its own view: other languages, and the base one renames", async () => {
		act(() =>
			store().createGroup({
				location: "HomepageGrid",
				tabId: TAB,
				group: group(NEW, "Tools"),
			}),
		);
		act(() => ui().openTitleTranslations("HomepageGrid", "group", TAB, NEW));
		await until(() => !!input("Title (English (United States))"));
		expect(drawer()!.textContent).toContain("Group title translations");
		expect(input("Title (English (United States))").value).toBe("Tools");

		// Add French and type it
		const combo = drawer()!.querySelector<HTMLInputElement>('[role="combobox"]')!;
		typeInto(combo, "1036");
		act(() =>
			[...drawer()!.querySelectorAll("button")].find((b) => b.textContent === "Add")!.click(),
		);
		await until(() => !!input("Title (French)"));
		typeInto(input("Title (French)"), "Outils");
		expect(store().locLabels.find((l) => l.id === `${NEW}.Title`)?.titles).toEqual([
			{ languageCode: 1033, description: "Tools" },
			{ languageCode: 1036, description: "Outils" },
		]);

		// The base language renames the group, and the label follows
		typeInto(input("Title (English (United States))"), "Utilities");
		const g = store().ribbons.HomepageGrid.tabs[0].groups.find((x) => x.id === NEW)!;
		expect(g.label).toBe("Utilities");
		// Published with the new title and the French one
		const s = store();
		const xml = generateRibbonDiffXml({
			location: "HomepageGrid",
			current: s.ribbons.HomepageGrid,
			baseline: s.baseline.HomepageGrid,
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: s.locLabels,
			entityLogicalName: T,
		});
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		expect(
			[...doc.querySelectorAll(`LocLabel[Id="${NEW}.Title"] Title`)].map(
				(x) => `${x.getAttribute("languagecode")}:${x.getAttribute("description")}`,
			),
		).toEqual(["1033:Utilities", "1036:Outils"]);
	});

	it("is read-only for a title that isn't yours", async () => {
		act(() => ui().openTitleTranslations("HomepageGrid", "group", TAB, OOB));
		await until(() => !!input("Title (English (United States))"));
		expect(drawer()!.textContent).toContain("Group title translations");
		expect(drawer()!.textContent).toContain("Only your own tabs and groups can be translated");
		expect(input("Title (English (United States))").readOnly).toBe(true);
		expect(drawer()!.querySelector('[role="combobox"]')).toBeNull();
	});

	it("an LCID and Enter add that language once, not the first in the list too", async () => {
		act(() =>
			store().createGroup({
				location: "HomepageGrid",
				tabId: TAB,
				group: group(NEW, "Tools"),
			}),
		);
		act(() => ui().openTitleTranslations("HomepageGrid", "group", TAB, NEW));
		await until(() => !!input("Title (English (United States))"));
		const combo = drawer()!.querySelector<HTMLInputElement>('[role="combobox"]')!;
		act(() => combo.focus());
		typeInto(combo, "1036");
		act(() => {
			combo.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
		});
		act(() => {
			combo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		await until(() => !!input("Title (French)"));
		expect(input("Title (German)")).toBeNull();
		expect(document.querySelectorAll('input[aria-label="Title (French)"]')).toHaveLength(1);
	});
});

describe("#136 review: where a title's translations go", () => {
	const g = (id: string, label: string, titleToken?: string): RibbonGroup =>
		({
			...group(id, label),
			...(titleToken ? { source: { titleToken, attributes: {} } } : {}),
		}) as RibbonGroup;
	const ribbonsWith = (...groups: RibbonGroup[]) => ({
		HomepageGrid: {
			...ribbon("HomepageGrid"),
			tabs: [{ ...ribbon("HomepageGrid").tabs[0], groups }],
		},
	});
	const X = { id: "X", titles: [{ languageCode: 1033, description: "Tools" }] };
	const target = (
		container: RibbonGroup,
		loaded: RibbonGroup | undefined,
		ribbons: Record<string, RibbonDefinition>,
		yours = true,
	) =>
		titleTranslationTarget({
			container,
			loaded,
			yours,
			ribbons,
			locLabels: [X],
			baseLcid: 1033,
		});

	it("a loaded own title: its label, unless another control shares it", () => {
		const G = g("G", "$LocLabels:X");
		expect(target(G, G, ribbonsWith(G))).toEqual({ labelId: "X" });
		expect(target(G, G, ribbonsWith(G, g("H", "$LocLabels:X")))).toEqual({ reason: "shared" });
		expect(target(G, G, ribbonsWith(G), false)).toEqual({ reason: "not-yours" });
	});

	it("a copy keeps its source's title until it's changed; an import's loaded label is used", () => {
		const kept = g("C", "$Resources:Ribbon.Management", "$Resources:Ribbon.Management");
		expect(target(kept, undefined, ribbonsWith(kept))).toMatchObject({ reason: "kept" });
		const changed = g("C", "Copy", "$Resources:Ribbon.Management");
		expect(target(changed, undefined, ribbonsWith(changed))).toEqual({ labelId: "C.Title" });
		const imported = g("I", "Tools", "$LocLabels:X");
		expect(target(imported, undefined, ribbonsWith(imported))).toEqual({ labelId: "X" });
		expect(target(g("N", "New"), undefined, ribbonsWith())).toEqual({ labelId: "N.Title" });
	});
});
