/**
 * #62 (flyout menus) × #66 (controls written inside new tabs / groups): a new
 * flyout created in a new group is written inside the group's CustomAction
 * with its whole <Menu>, and its menu items are owned, edited and deleted in
 * place once that group is in the unmanaged layer.
 */
import { describe, it, expect } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { mergeScopeChanges, ownControlIds, parseRibbonDiffParts } from "@/services/ribbonDiffMerge";
import type { RibbonButton, RibbonDefinition } from "@/types/ribbon";

const T = "account";
const TAB = `Mscrm.HomepageGrid.${T}.MainTab`;
const LOADED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${TAB}" Command="${TAB}" Sequence="10">
    <Scaling Id="${TAB}.Scaling">
      <MaxSize Id="${TAB}.Management.MaxSize" GroupId="${TAB}.Management" Sequence="10" Size="LargeLarge"/>
      <Scale Id="${TAB}.Management.Scale" GroupId="${TAB}.Management" Sequence="80" Size="Popup"/>
    </Scaling>
    <Groups Id="${TAB}.Groups">
      <Group Id="${TAB}.Management" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="${TAB}.Management.Controls"/></Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI>
<CommandDefinitions/><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

const GROUP = "mxrm.account.HomepageGrid.Tools.Group";
const item = (id: string, label: string, sequence: number): RibbonButton => ({
	id,
	label,
	kind: "button",
	sequence,
	templateAlias: "o1",
	commandId: `${id}.Command`,
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
});

function withFlyoutInNewGroup(): { current: RibbonDefinition; baseline: RibbonDefinition } {
	const baseline = parseRibbonXml(LOADED, "HomepageGrid", T).ribbon;
	const current: RibbonDefinition = JSON.parse(JSON.stringify(baseline));
	current.tabs[0].groups.push({
		id: GROUP,
		label: "Tools",
		sequence: 20,
		template: "Mscrm.Templates.Flexible2",
		buttons: [
			{
				...item("mxrm.Fly", "Fly", 10),
				kind: "flyout",
				menu: {
					id: "mxrm.Fly.Menu",
					sections: [
						{
							id: "mxrm.Fly.Section",
							title: "Actions",
							sequence: 10,
							displayMode: "Menu16",
							controlsId: "mxrm.Fly.Section.Controls",
							controls: [item("mxrm.Fly.A", "A", 10), item("mxrm.Fly.B", "B", 20)],
						},
					],
				},
			},
		],
	});
	return { current, baseline };
}

const generate = (current: RibbonDefinition, baseline: RibbonDefinition) =>
	generateRibbonDiffXml({
		current,
		baseline,
		commands: ["mxrm.Fly", "mxrm.Fly.A", "mxrm.Fly.B"].map((id) => ({
			id: `${id}.Command`,
			enableRules: [],
			displayRules: [],
			actions: [{ kind: "javascript", library: "$webresource:mxrm_/x.js", functionName: "go", params: [] }],
		})) as never,
		enableRules: [],
		displayRules: [],
		locLabels: [],
		entityLogicalName: T,
		location: "HomepageGrid",
	});

const doc = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

describe("a new flyout in a new group (#62 × #66)", () => {
	it("is written inside the group's CustomAction with its menu, items included", () => {
		const { current, baseline } = withFlyoutInNewGroup();
		const xml = generate(current, baseline);
		const cas = Array.from(doc(xml).getElementsByTagName("CustomAction"));
		const groupCa = cas.find((c) => c.getAttribute("Location") === `${TAB}.Groups._children`)!;
		const fly = groupCa.querySelector('Group > Controls > FlyoutAnchor[Id="mxrm.Fly"]')!;
		expect(fly).toBeTruthy();
		const items = Array.from(fly.querySelectorAll("Menu > MenuSection > Controls > Button")).map((b) =>
			b.getAttribute("Id"),
		);
		expect(items).toEqual(["mxrm.Fly.A", "mxrm.Fly.B"]);
		// No separate CustomAction for the flyout or its items.
		expect(cas.filter((c) => /mxrm\.Fly/.test(c.getAttribute("Id") ?? ""))).toEqual([]);
		// Every item's command is written.
		const commandIds = Array.from(doc(xml).getElementsByTagName("CommandDefinition")).map((c) => c.getAttribute("Id"));
		expect(commandIds).toEqual(expect.arrayContaining(["mxrm.Fly.Command", "mxrm.Fly.A.Command", "mxrm.Fly.B.Command"]));
		// The group's MaxSize takes a free Sequence (#66), not its own 20 or the Scale's 80.
		const maxSize = cas
			.map((c) => c.querySelector(`MaxSize[GroupId="${GROUP}"]`))
			.find(Boolean)!;
		expect(Number(maxSize.getAttribute("Sequence"))).toBeGreaterThan(10);
		expect(Number(maxSize.getAttribute("Sequence"))).toBeLessThan(80);
		expect(maxSize.getAttribute("Sequence")).not.toBe("20");
	});

	it("once in the layer, its items are owned, edited and deleted in place", () => {
		const { current, baseline } = withFlyoutInNewGroup();
		const existing = parseRibbonDiffParts(generate(current, baseline));
		expect([...ownControlIds(existing)]).toEqual(expect.arrayContaining([GROUP, "mxrm.Fly", "mxrm.Fly.A", "mxrm.Fly.B"]));

		// Next session: the layer's group is in the baseline; item A is renamed, B deleted.
		const loaded: RibbonDefinition = JSON.parse(JSON.stringify(current));
		const edited: RibbonDefinition = JSON.parse(JSON.stringify(current));
		const fly = edited.tabs[0].groups[1].buttons[0];
		fly.menu!.sections[0].controls[0].label = "A renamed";
		fly.menu!.sections[0].controls.splice(1, 1);
		const delta = parseRibbonDiffParts(generate(edited, loaded));
		const merged = mergeScopeChanges(existing, delta, { deletedControlIds: ["mxrm.Fly.B"] });

		const all = [...merged.customActions.values()].join("");
		const groupCas = [...merged.customActions.values()].filter((x) => x.includes(`<Group Id="${GROUP}"`));
		expect(groupCas).toHaveLength(1);
		const a = doc(groupCas[0]).querySelector('Button[Id="mxrm.Fly.A"]')!;
		expect(a).toBeTruthy();
		expect(doc(groupCas[0]).querySelector('Button[Id="mxrm.Fly.B"]')).toBeNull();
		// The edit replaced A in place: one definition of A in the layer.
		expect(all.match(/Id="mxrm\.Fly\.A"/g)).toHaveLength(1);
		// B's command left with it.
		expect(merged.commandDefinitions.has("mxrm.Fly.B.Command")).toBe(false);
	});
});
