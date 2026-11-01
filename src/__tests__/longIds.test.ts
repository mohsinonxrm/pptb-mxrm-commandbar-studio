/**
 * Long generated ids (#86): a `$LocLabels:` id over 128 characters used by a
 * menu item makes PublishXml fail after the import (measured live); copies of
 * out-of-the-box flyouts produced such ids and showed raw `$Resources:` keys.
 */
import { describe, it, expect } from "vitest";
import {
	MAX_LOC_LABEL_ID_LENGTH,
	buttonLabelId,
	buttonTooltipBodyId,
	buttonTooltipTitleId,
	sectionTitleLabelId,
} from "@/utils/locLabelRef";
import { copyControl, menuItemsOf } from "@/utils/ribbonMenu";
import { validatePublishRibbonDiff } from "@/services/xmlValidator";
import type { RibbonButton } from "@/types/ribbon";

const OOB = "Mscrm.HomepageGrid.AllEntities.VisualizationTab.Charts";
const button = (id: string, over: Partial<RibbonButton> = {}): RibbonButton => ({
	id,
	label: "$Resources:Ribbon.VisualizationTab.Charts.Bar",
	kind: "button",
	sequence: 10,
	templateAlias: "o1",
	commandId: "Mscrm.Enabled",
	hidden: false,
	oob: true,
	custom: false,
	managed: false,
	origin: "oob",
	source: {
		labelToken: "$Resources:Ribbon.VisualizationTab.Charts.Bar",
		tooltipTitleToken: "$Resources:Ribbon.VisualizationTab.Charts.Bar",
		tooltipBodyToken: "$LocLabels:someone.else.Tooltip",
		attributes: {},
	},
	...over,
});
const barFlyout = button(`${OOB}.BarFlyout`, {
	kind: "flyout",
	menu: {
		id: `${OOB}.Bar.Menu`,
		sections: [
			{
				id: `${OOB}.Bar.MenuSection0`,
				sequence: 10,
				controlsId: `${OOB}.Bar.Controls0`,
				controls: ["Bar", "StackedBar", "StackedBar100"].map((n, i) =>
					button(`${OOB}.Bar.${n}`, { sequence: (i + 1) * 10 }),
				),
			},
		],
	},
});

describe("generated label ids are at most 128 characters (#86)", () => {
	it("leaves short ids alone and shortens long ones stably and distinctly", () => {
		expect(buttonLabelId("cbs.Go")).toBe("cbs.Go.LabelText");
		const long = `${OOB}.BarFlyout_copy_1792354294864.${OOB}.Bar.StackedBar100`;
		const ids = [
			buttonLabelId(long),
			buttonTooltipTitleId(long),
			buttonTooltipBodyId(long),
			sectionTitleLabelId(long),
		];
		for (const id of ids) expect(id.length).toBeLessThanOrEqual(MAX_LOC_LABEL_ID_LENGTH);
		expect(ids[2].endsWith(".ToolTipDescription")).toBe(true);
		expect(buttonLabelId(long)).toBe(buttonLabelId(long));
		expect(buttonLabelId(`${long}2`)).not.toBe(buttonLabelId(long));
	});
});

describe("copies of an out-of-the-box flyout (#86)", () => {
	const copy = copyControl(barFlyout, `${OOB}.BarFlyout_copy_1792354294864`);

	it("give menu children short, unique ids and label ids that publish", () => {
		const items = menuItemsOf(copy);
		expect(items.map((i) => i.id)).toEqual([
			`${copy.id}.Bar`,
			`${copy.id}.StackedBar`,
			`${copy.id}.StackedBar100`,
		]);
		expect(copy.menu!.id).toBe(`${copy.id}.Menu`);
		expect(copy.menu!.sections[0].controlsId).toBe(`${copy.id}.Controls0`);
		for (const i of items)
			expect(buttonTooltipBodyId(i.id).length).toBeLessThanOrEqual(MAX_LOC_LABEL_ID_LENGTH);
	});

	it("keep platform ($Resources:) texts and drop the original's own labels", () => {
		for (const c of [copy, ...menuItemsOf(copy)]) {
			expect(c.source?.labelToken).toBe("$Resources:Ribbon.VisualizationTab.Charts.Bar");
			expect(c.source?.tooltipTitleToken).toBe(
				"$Resources:Ribbon.VisualizationTab.Charts.Bar",
			);
			expect(c.source?.tooltipBodyToken).toBeUndefined();
		}
	});

	it("de-duplicates items whose last segments collide", () => {
		const twins = button("cbs.Fly", {
			kind: "flyout",
			menu: {
				id: "cbs.Fly.Menu",
				sections: [
					{
						id: "x.Section",
						sequence: 10,
						controlsId: "x.Controls",
						controls: [button("a.Edit"), button("b.Edit")],
					},
				],
			},
		});
		const ids = menuItemsOf(copyControl(twins, "cbs.Fly2")).map((i) => i.id);
		expect(new Set(ids).size).toBe(2);
		expect(ids).toEqual(["cbs.Fly2.Edit", "cbs.Fly2.Edit_2"]);
	});
});

describe("parameterised platform texts (#86 review)", () => {
	it("are kept on copies like plain $Resources: texts", () => {
		const b = button("cbs.New", {
			source: {
				labelToken: "$Resources:Ribbon.HomepageGrid.MainTab.New",
				tooltipBodyToken: "$Resources(EntityDisplayName):Ribbon.Tooltip.New",
				attributes: {},
			},
		});
		expect(copyControl(b, "cbs.New2").source?.tooltipBodyToken).toBe(
			"$Resources(EntityDisplayName):Ribbon.Tooltip.New",
		);
	});
});

describe("pre-publish check (#86)", () => {
	const label = (n: number) => `l.${"x".repeat(n - 2)}`;
	const xml = (inMenu: boolean, n: number) =>
		`<RibbonDiffXml><CustomActions><CustomAction Id="cbs.Fly.CustomAction" Location="Mscrm.HomepageGrid.t.MainTab.Management.Controls._children">` +
		`<CommandUIDefinition>` +
		(inMenu
			? `<FlyoutAnchor Id="cbs.Fly" Command="Mscrm.Enabled"><Menu Id="cbs.Fly.Menu"><MenuSection Id="cbs.Fly.S"><Controls Id="cbs.Fly.C"><Button Id="cbs.Fly.I" Command="Mscrm.Enabled" LabelText="$LocLabels:${label(n)}"/></Controls></MenuSection></Menu></FlyoutAnchor>`
			: `<Button Id="cbs.Btn" Command="Mscrm.Enabled" LabelText="$LocLabels:${label(n)}"/>`) +
		`</CommandUIDefinition></CustomAction></CustomActions><LocLabels><LocLabel Id="${label(n)}"><Titles><Title languagecode="1033" description="x"/></Titles></LocLabel></LocLabels></RibbonDiffXml>`;
	const lengthFindings = (inMenu: boolean, n: number) =>
		validatePublishRibbonDiff(xml(inMenu, n)).filter((f) => f.code === "label-id-length");

	it("blocks a menu item's label id over 128 characters", () => {
		expect(lengthFindings(true, 128)).toEqual([]);
		expect(lengthFindings(true, 129)).toEqual([expect.objectContaining({ severity: "error" })]);
	});

	it("blocks it in a CustomAction that adds an item to an existing menu", () => {
		const added = (n: number) =>
			`<RibbonDiffXml><CustomActions><CustomAction Id="cbs.Item.CustomAction" Location="Mscrm.HomepageGrid.t.Send.Controls._children">` +
			`<CommandUIDefinition><Button Id="cbs.Item" Command="Mscrm.Enabled" LabelText="$LocLabels:${label(n)}"/></CommandUIDefinition></CustomAction></CustomActions></RibbonDiffXml>`;
		const find = (menuControlsIds?: string[]) =>
			validatePublishRibbonDiff(added(129), { menuControlsIds }).filter(
				(f) => f.code === "label-id-length",
			);
		expect(find(["Mscrm.HomepageGrid.t.Send.Controls"])).toEqual([
			expect.objectContaining({ severity: "error" }),
		]);
		expect(find()).toEqual([expect.objectContaining({ severity: "warning" })]);
	});

	it("only warns for a top-level control", () => {
		expect(lengthFindings(false, 160)).toEqual([
			expect.objectContaining({ severity: "warning" }),
		]);
	});
});
