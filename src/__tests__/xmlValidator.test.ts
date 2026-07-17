import { describe, it, expect } from "vitest";
import { validateRibbonDiffXml } from "@/services/xmlValidator";
import type { LocLabel } from "@/types/ribbon";

// ── Helpers ────────────────────────────────────────────────────────────────

const VALID_MINIMAL = `<?xml version="1.0" encoding="utf-8"?>
<RibbonDiffXml>
  <CustomActions/>
  <Templates><RibbonTemplates Id="Mscrm.Templates"/></Templates>
  <CommandDefinitions/>
  <RuleDefinitions>
    <TabDisplayRules/>
    <DisplayRules/>
    <EnableRules/>
  </RuleDefinitions>
  <LocLabels/>
</RibbonDiffXml>`;

const VALID_WITH_BUTTON = `<?xml version="1.0" encoding="utf-8"?>
<RibbonDiffXml>
  <CustomActions>
    <CustomAction Id="Contoso.account.Test.CustomAction"
                  Location="Group1.Controls._children" Sequence="10">
      <CommandUIDefinition>
        <Button Id="Contoso.account.Test.Button"
                Command="Contoso.account.Test.Command"
                LabelText="$LocLabels:Contoso.account.Test.LabelText"
                TemplateAlias="o1" Sequence="10"/>
      </CommandUIDefinition>
    </CustomAction>
  </CustomActions>
  <Templates><RibbonTemplates Id="Mscrm.Templates"/></Templates>
  <CommandDefinitions/>
  <RuleDefinitions>
    <TabDisplayRules/><DisplayRules/><EnableRules/>
  </RuleDefinitions>
  <LocLabels>
    <LocLabel Id="Contoso.account.Test.LabelText">
      <Titles><Title languagecode="1033" description="Test"/></Titles>
    </LocLabel>
  </LocLabels>
</RibbonDiffXml>`;

// ── Valid XML passes ────────────────────────────────────────────────────────

describe("validateRibbonDiffXml — valid XML", () => {
	it("returns no errors for minimal valid RibbonDiffXml", () => {
		const errors = validateRibbonDiffXml(VALID_MINIMAL);
		expect(errors).toHaveLength(0);
	});

	it("returns no errors for XML with known LocLabel reference", () => {
		const locLabels: LocLabel[] = [
			{
				id: "Contoso.account.Test.LabelText",
				titles: [{ languageCode: 1033, description: "Test" }],
			},
		];
		const validErrors = validateRibbonDiffXml(VALID_WITH_BUTTON, undefined, locLabels);
		expect(validErrors).toHaveLength(0);
	});
});

// ── LocLabel reference check ───────────────────────────────────────────────

describe("validateRibbonDiffXml — LocLabel references", () => {
	it("returns error for a $LocLabels reference with no matching LocLabel entry", () => {
		const locLabels: LocLabel[] = []; // empty — no labels registered
		validateRibbonDiffXml(VALID_WITH_BUTTON, undefined, locLabels); // validator skips when empty
		// With an empty locLabels set where size > 0 is needed — validator skips when empty
		// Pass a dummy label so the validator actually checks
		const withDummy: LocLabel[] = [
			{ id: "Other.Label", titles: [{ languageCode: 1033, description: "Other" }] },
		];
		const errors2 = validateRibbonDiffXml(VALID_WITH_BUTTON, undefined, withDummy);
		const messages = errors2.map((e) => e.message);
		const hasMissingLabel = messages.some(
			(m) => m.includes("LocLabel") || m.includes("label reference"),
		);
		expect(hasMissingLabel).toBe(true);
	});
});

// ── ID whitespace check ───────────────────────────────────────────────────

describe("validateRibbonDiffXml — ID validation", () => {
	it("returns error for an element ID containing whitespace", () => {
		const xml = `<?xml version="1.0" encoding="utf-8"?>
<RibbonDiffXml>
  <CustomActions>
    <CustomAction Id="Contoso account Bad Id" Location="Group.Controls._children" Sequence="10">
      <CommandUIDefinition><Button Id="Bad Button Id" Command="Cmd" LabelText="Label" TemplateAlias="o1" Sequence="10"/></CommandUIDefinition>
    </CustomAction>
  </CustomActions>
  <Templates><RibbonTemplates Id="Mscrm.Templates"/></Templates>
  <CommandDefinitions/><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions>
  <LocLabels/>
</RibbonDiffXml>`;
		const errors = validateRibbonDiffXml(xml);
		expect(errors.length).toBeGreaterThan(0);
		const hasWhitespaceError = errors.some((e) => e.message.includes("whitespace"));
		expect(hasWhitespaceError).toBe(true);
	});
});

// ── Malformed XML ─────────────────────────────────────────────────────────

describe("validateRibbonDiffXml — parse errors", () => {
	it("returns parse error for malformed XML", () => {
		const badXml = "<RibbonDiffXml><Unclosed>";
		const errors = validateRibbonDiffXml(badXml);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0].message).toMatch(/parse error/i);
	});
});

// ── Unescaped & detection ─────────────────────────────────────────────────

describe("validateRibbonDiffXml — ampersand detection", () => {
	it("returns error for string-level unescaped & pattern", () => {
		const xmlWithAmpersand = VALID_MINIMAL.replace(
			"<LocLabels/>",
			"<LocLabels><!-- https://example.com?a=1& b=2 --></LocLabels>",
		);
		const errors = validateRibbonDiffXml(xmlWithAmpersand);
		// The validator checks for "& " patterns
		const hasAmpError = errors.some((e) => e.message.includes("&"));
		expect(hasAmpError).toBe(true);
	});
});
