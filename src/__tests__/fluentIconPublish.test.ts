/**
 * #51 — a Fluent icon picked in CBS is published as its SVG web resource:
 * the picker sets image16/image32 to `$webresource:<prefix>_/icons/cbs/<name>.svg`,
 * the generator writes that as ModernImage, and the publish planner accepts
 * the icon change on an existing button.
 */
import { describe, expect, it } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import { effectiveModernImage, generateRibbonDiffXml } from "@/services/xmlGenerator";
import { planScope } from "@/services/publishPlan";
import { fluentIconWebResourceName } from "@/utils/iconWebResourceName";
import type { RibbonButton, RibbonDefinition } from "@/types/ribbon";

const RIBBON = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="Mscrm.HomepageGrid.contact.MainTab" Command="Mscrm.HomepageGrid.contact.MainTab" Sequence="10">
    <Groups Id="Mscrm.HomepageGrid.contact.MainTab.Groups">
      <Group Id="Mscrm.HomepageGrid.contact.MainTab.Management" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="Mscrm.HomepageGrid.contact.MainTab.Management.Controls">
          <Button Id="Mscrm.HomepageGrid.contact.NewRecord" Command="Mscrm.NewRecordFromGrid" Sequence="10" LabelText="New" TemplateAlias="o1" ModernImage="New" Image16by16="/_imgs/ribbon/New_16.png" />
        </Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI><CommandDefinitions/><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const firstButton = (def: RibbonDefinition) => def.tabs[0].groups[0].buttons[0];

/** What IconPickerModal writes for a picked Fluent icon (`icon` carries no variant). */
function pickFluentIcon(
	button: RibbonButton,
	pascalName: string,
	variant: "regular" | "filled" = "regular",
) {
	const ref = `$webresource:${fluentIconWebResourceName("cbstest", pascalName, variant)}`;
	Object.assign(button, { icon: pascalName.toLowerCase(), image16: ref, image32: ref });
	return ref;
}

function load() {
	return parseRibbonXml(RIBBON, "HomepageGrid", "contact");
}

describe("Fluent icon on an existing button (#51)", () => {
	it("is publishable and written as ModernImage", () => {
		const parsed = load();
		const baseline = parsed.ribbon;
		const current = clone(baseline);
		const ref = pickFluentIcon(firstButton(current), "Add");
		expect(ref).toBe("$webresource:cbstest_/icons/cbs/add.svg");

		const plan = planScope({
			locations: [{ current, baseline }],
			commands: parsed.commands,
			baselineCommands: parsed.commands,
			enableRules: parsed.enableRules,
			baselineEnableRules: parsed.enableRules,
			displayRules: parsed.displayRules,
			baselineDisplayRules: parsed.displayRules,
		});
		expect(plan.unsupported).toEqual([]);
		expect(plan.hasChanges).toBe(true);

		const xml = generateRibbonDiffXml({
			current,
			baseline,
			commands: parsed.commands,
			enableRules: parsed.enableRules,
			displayRules: parsed.displayRules,
			locLabels: [],
			entityLogicalName: "contact",
			location: "HomepageGrid",
		});
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		const btn = doc.querySelector('Button[Id="Mscrm.HomepageGrid.contact.NewRecord"]')!;
		expect(btn).not.toBeNull();
		expect(btn.getAttribute("ModernImage")).toBe(ref);
		expect(btn.getAttribute("Image16by16")).toBe(ref);
		expect(btn.getAttribute("Image32by32")).toBe(ref);
	});

	it("a bare Fluent name without its web resource is still reported", () => {
		const parsed = load();
		const baseline = parsed.ribbon;
		const current = clone(baseline);
		firstButton(current).icon = "add";
		const plan = planScope({
			locations: [{ current, baseline }],
			commands: parsed.commands,
			baselineCommands: parsed.commands,
			enableRules: parsed.enableRules,
			baselineEnableRules: parsed.enableRules,
			displayRules: parsed.displayRules,
			baselineDisplayRules: parsed.displayRules,
		});
		expect(plan.unsupported.some((u) => u.includes("icon"))).toBe(true);
	});
});

describe("effectiveModernImage", () => {
	it("keeps the loaded value while the icon is unchanged", () => {
		expect(effectiveModernImage(firstButton(load().ribbon))).toBe("New");
	});

	it("uses the picked icon's web resource once the icon changes", () => {
		const b = firstButton(load().ribbon);
		const ref = pickFluentIcon(b, "Star");
		expect(effectiveModernImage(b)).toBe(ref);
	});

	it("uses the picked web resource when the icon name equals the loaded ModernImage (filled variant)", () => {
		const b = firstButton(load().ribbon); // ModernImage="New" → icon "new"
		const ref = pickFluentIcon(b, "New", "filled");
		expect(b.icon).toBe("new"); // same as the loaded icon: only the images tell the variant
		expect(ref).toBe("$webresource:cbstest_/icons/cbs/new.filled.svg");
		expect(effectiveModernImage(b)).toBe(ref);
	});

	it("uses the picked web resource when the regular icon's name equals the loaded ModernImage", () => {
		const b = firstButton(load().ribbon);
		const ref = pickFluentIcon(b, "New");
		expect(effectiveModernImage(b)).toBe(ref);
	});

	it("keeps the loaded ModernImage when only a non-web-resource image path changes", () => {
		const b = firstButton(load().ribbon);
		b.image16 = "/_imgs/ribbon/Other_16.png";
		expect(effectiveModernImage(b)).toBe("New");
	});

	it("keeps the loaded ModernImage when loaded web resource images are unchanged", () => {
		const b = firstButton(load().ribbon);
		b.source!.attributes["Image32by32"] = "$webresource:cbstest_/legacy32.png";
		b.image32 = "$webresource:cbstest_/legacy32.png";
		expect(effectiveModernImage(b)).toBe("New");
	});

	it("is undefined for a preview-only Fluent name", () => {
		const b = firstButton(load().ribbon);
		b.icon = "star";
		expect(effectiveModernImage(b)).toBeUndefined();
	});
});
