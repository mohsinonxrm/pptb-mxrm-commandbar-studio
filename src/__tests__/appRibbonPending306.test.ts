/**
 * #306: Dataverse adds the application ribbon's CustomActions to the merged ribbon on publish, but
 * its commands and rules later. After an application-ribbon publish CBS reads the merged ribbon
 * and says what hasn't arrived, instead of reporting only the layer as verified.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { strToU8, zipSync } from "fflate";
import { mergedRibbonGaps, hasGaps } from "@/services/mergedRibbonGaps";
import { parseRibbonDiffParts } from "@/services/ribbonDiffMerge";

const LAYER = `<RibbonDiffXml>
  <CustomActions>
    <CustomAction Id="p.Button.CustomAction" Location="Mscrm.GlobalTab.New.Controls._children" Sequence="2010">
      <CommandUIDefinition><Button Id="p.Button" Command="p.Command" LabelText="$LocLabels:p.Label" TemplateAlias="o1" Sequence="2010"/></CommandUIDefinition>
    </CustomAction>
  </CustomActions>
  <Templates><RibbonTemplates Id="Mscrm.Templates"/></Templates>
  <CommandDefinitions>
    <CommandDefinition Id="p.Command"><EnableRules><EnableRule Id="p.Enable"/></EnableRules><DisplayRules><DisplayRule Id="p.Display"/></DisplayRules><Actions><Url Address="https://learn.microsoft.com/"/></Actions></CommandDefinition>
  </CommandDefinitions>
  <RuleDefinitions>
    <TabDisplayRules/>
    <DisplayRules><DisplayRule Id="p.Display"><CrmClientTypeRule Type="Web"/></DisplayRule></DisplayRules>
    <EnableRules><EnableRule Id="p.Enable"><CrmClientTypeRule Type="Web"/></EnableRule></EnableRules>
  </RuleDefinitions>
  <LocLabels><LocLabel Id="p.Label"><Titles><Title languagecode="1033" description="Probe"/></Titles></LocLabel></LocLabels>
</RibbonDiffXml>`;

/** A merged application ribbon, as RetrieveApplicationRibbon returns it: no LocLabels at all. */
const merged = (opts: {
	command: boolean;
	rules: boolean;
}) => `<RibbonDefinitions><RibbonDefinition>
  <UI><Ribbon><Tabs><Tab Id="Mscrm.GlobalTab"><Groups><Group Id="Mscrm.GlobalTab.New"><Controls>
    <Button Id="p.Button" Command="p.Command" LabelText="$LocLabels:p.Label" TemplateAlias="o1" Sequence="2010"/>
  </Controls></Group></Groups></Tab></Tabs></Ribbon></UI>
  <Templates><RibbonTemplates Id="Mscrm.Templates"/></Templates>
  <CommandDefinitions>
    <CommandDefinition Id="Mscrm.Sales.ShowGatherFeedbackMenu"><EnableRules/><DisplayRules/><Actions/></CommandDefinition>
    ${opts.command ? '<CommandDefinition Id="p.Command"><EnableRules/><DisplayRules/><Actions/></CommandDefinition>' : ""}
  </CommandDefinitions>
  <RuleDefinitions>
    <TabDisplayRules/>
    <DisplayRules>${opts.rules ? '<DisplayRule Id="p.Display"><CrmClientTypeRule Type="Web"/></DisplayRule>' : ""}</DisplayRules>
    <EnableRules>${opts.rules ? '<EnableRule Id="p.Enable"><CrmClientTypeRule Type="Web"/></EnableRule>' : ""}</EnableRules>
  </RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

const zipped = (xml: string) => {
	let b = "";
	for (const c of zipSync({ "RibbonXml.xml": strToU8(xml) })) b += String.fromCharCode(c);
	return btoa(b);
};

afterEach(() => {
	delete (window as unknown as { dataverseAPI?: unknown }).dataverseAPI;
	vi.resetModules();
});

describe("#306 what the merged application ribbon doesn't have yet", () => {
	const layer = parseRibbonDiffParts(LAYER);

	it("finds the layer's commands and rules the merged ribbon lacks", () => {
		const gaps = mergedRibbonGaps(merged({ command: false, rules: false }), layer);
		expect(gaps).toEqual({
			commands: ["p.Command"],
			enableRules: ["p.Enable"],
			displayRules: ["p.Display"],
		});
		expect(hasGaps(gaps)).toBe(true);
	});

	it("finds nothing once they're merged, and doesn't look for LocLabels (the merged XML has none)", () => {
		const gaps = mergedRibbonGaps(merged({ command: true, rules: true }), layer);
		expect(hasGaps(gaps)).toBe(false);
	});
});

describe("#306 the publish result says so", () => {
	const pendingWith = async (execute: (req: { operationName: string }) => Promise<unknown>) => {
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = { execute: vi.fn(execute) };
		const { applicationRibbonPending } = await import("@/services/dataverse/publishService");
		return applicationRibbonPending(parseRibbonDiffParts(LAYER));
	};

	it("names what Dataverse hasn't added yet, says why the buttons don't show, and not to publish again", async () => {
		const message = await pendingWith(async () => ({
			CompressedApplicationRibbonXml: zipped(merged({ command: false, rules: true })),
		}));
		expect(message).toMatch(
			/^Published, but Dataverse hasn't added 1 command\(s\) \(p\.Command\)/,
		);
		expect(message).toContain("a button whose command is missing isn't shown");
		expect(message).toContain("You don't need to publish again.");
		// How long it took, as measured live.
		expect(message).toContain("20 to 40 minutes after publishing");
		expect(message).not.toContain("enable rule");
	});

	it("says nothing when everything is there", async () => {
		const message = await pendingWith(async () => ({
			CompressedApplicationRibbonXml: zipped(merged({ command: true, rules: true })),
		}));
		expect(message).toBeUndefined();
	});

	it("says it couldn't check when the application ribbon can't be read", async () => {
		const message = await pendingWith(async () => {
			throw new Error("0x80040216 boom");
		});
		expect(message).toMatch(/couldn't read the application ribbon .*0x80040216 boom/);
	});
});
