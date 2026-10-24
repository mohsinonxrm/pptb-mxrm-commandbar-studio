/**
 * #6: the canvas showed keys ("Ribbon.HomepageGrid.MainTab.New") and a
 * placeholder icon for most built-in buttons. Captions now come from your
 * layer's labels, then the managed solutions' LocLabels, then the key's last
 * segment; out-of-the-box ModernImage names get Fluent icons and
 * `$webresource:` images are drawn. Display only: nothing that publishes changes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { captionFromKey, displayText } from "@/utils/displayText";
import { fetchManagedLocLabels } from "@/services/dataverse/ribbonProvenanceService";
import { hasFluentIcon } from "@/components/shared/FluentIcon";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import { useSessionStore } from "@/store/sessionStore";
import type { LocLabel, RibbonButton } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const label = (id: string, ...titles: [number, string][]): LocLabel => ({
	id,
	titles: titles.map(([languageCode, description]) => ({ languageCode, description })),
});

describe("#6 captions", () => {
	it("a key reads as its last meaningful segment", () => {
		expect(captionFromKey("Ribbon.HomepageGrid.MainTab.New")).toBe("New");
		expect(captionFromKey("Ribbon.HomepageGrid.Data.Export.ExportToExcel")).toBe(
			"Export To Excel",
		);
		expect(captionFromKey("Ribbon.VisualizationTab.Save.Save.Label")).toBe("Save");
		expect(captionFromKey("Ribbon.HomepageGrid.View.TabName")).toBe("View");
		expect(captionFromKey("AIBuilder.Flyout.Label")).toBe("AI Builder");
		// Not keys: captions and short ids stay as they are.
		expect(captionFromKey("Email a Link")).toBeUndefined();
		expect(captionFromKey("cbs.Button")).toBeUndefined();
	});

	it("your layer's label, then a managed solution's, then the key", () => {
		const own = [label("cbs.Mine.LabelText", [1033, "Mine"])];
		const managed = {
			"GuidedHelp.LabelText": label(
				"GuidedHelp.LabelText",
				[1033, "Learning Path"],
				[1031, "Lernpfad"],
			),
			"cbs.Mine.LabelText": label("cbs.Mine.LabelText", [1033, "Not this"]),
		};
		expect(displayText("$LocLabels:cbs.Mine.LabelText", own, 1033, managed)).toBe("Mine");
		// The parser leaves an unresolved label as its id: a managed solution's text, in the language asked for.
		expect(displayText("GuidedHelp.LabelText", own, 1033, managed)).toBe("Learning Path");
		expect(displayText("GuidedHelp.LabelText", own, 1031, managed)).toBe("Lernpfad");
		expect(displayText("Ribbon.HomepageGrid.MainTab.New", own, 1033, managed)).toBe("New");
		expect(displayText("Send", own, 1033, managed)).toBe("Send");
	});
});

describe("#6 the managed solutions' label texts", () => {
	let queries: string[];
	beforeEach(() => {
		queries = [];
	});
	afterEach(() => {
		delete (window as unknown as { dataverseAPI?: unknown }).dataverseAPI;
	});

	it("one query of the managed LocLabel rows; application-ribbon ids in both spellings", async () => {
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = {
			queryData: vi.fn(async (q: string) => {
				queries.push(q);
				return {
					value: [
						{
							rdx: '<LocLabel Id="Ribbon.HomepageGrid.OpenFocusedView.Button.LabelText"><Titles><Title languagecode="1033" description="Focused view" /></Titles></LocLabel>',
						},
						{
							rdx: '<LocLabel Id="AIBuilder.{!EntityLogicalName}.Label"><Titles><Title languagecode="1033" description="AI Builder" /></Titles></LocLabel>',
						},
						{ rdx: "not xml" },
					],
				};
			}),
		};
		const labels = await fetchManagedLocLabels("account");
		expect(queries).toHaveLength(1);
		expect(queries[0]).toContain(
			"(entity eq 'account' or entity eq null) and ismanaged eq true and difftype eq 3",
		);
		expect(labels.map((l) => l.id)).toEqual([
			"Ribbon.HomepageGrid.OpenFocusedView.Button.LabelText",
			"AIBuilder.{!EntityLogicalName}.Label",
			"AIBuilder.account.Label",
		]);
		expect(labels[0].titles).toEqual([{ languageCode: 1033, description: "Focused view" }]);
	});

	it("a failed read gives none", async () => {
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = {
			queryData: vi.fn(async () => {
				throw new Error("503");
			}),
		};
		expect(await fetchManagedLocLabels("account")).toEqual([]);
	});
});

describe("#6 icons", () => {
	it("out-of-the-box ModernImage names have icons", () => {
		for (const name of [
			"new",
			"export_to_excel",
			"flows",
			"email_link",
			"assign",
			"de_activate",
			"add",
		]) {
			expect(hasFluentIcon(name)).toBe(true);
		}
		expect(hasFluentIcon("$webresource:msdyn_/x.svg")).toBe(false);
		expect(hasFluentIcon(undefined)).toBe(false);
	});

	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		useSessionStore.setState({ connectionUrl: "https://org-a.crm.dynamics.com" });
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		delete (window as unknown as { dataverseAPI?: unknown }).dataverseAPI;
	});

	const control = (extra: Partial<RibbonButton>): RibbonButton => ({
		id: "msdyn.Ai",
		label: "AI",
		kind: "button",
		sequence: 10,
		hidden: false,
		oob: false,
		custom: false,
		managed: true,
		...extra,
	});

	it("a $webresource: image is drawn, loaded once", async () => {
		const queryData = vi.fn(async () => ({
			value: [{ content: "PHN2Zy8+", webresourcetype: 11 }],
		}));
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = { queryData };
		const button = control({
			icon: "$webresource:msdyn_ai.svg",
			source: { attributes: {}, modernImage: "$webresource:msdyn_AI.svg" },
		});
		await act(async () => root.render(<RibbonButtonIcon button={button} size={24} />));
		await act(async () => new Promise((r) => setTimeout(r, 0)));
		expect(container.querySelector("img")?.getAttribute("src")).toBe(
			"data:image/svg+xml;base64,PHN2Zy8+",
		);
		expect(queryData).toHaveBeenCalledWith(expect.stringContaining("name eq 'msdyn_AI.svg'"));
		await act(async () => root.render(<RibbonButtonIcon button={{ ...button }} size={16} />));
		expect(queryData).toHaveBeenCalledTimes(1);
	});

	it("a control with a Fluent icon doesn't load its image", async () => {
		const queryData = vi.fn();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = { queryData };
		const button = control({ icon: "new", image32: "$webresource:cbs_/new.svg" });
		await act(async () => root.render(<RibbonButtonIcon button={button} size={24} />));
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector("svg")).not.toBeNull();
		expect(queryData).not.toHaveBeenCalled();
	});
});
