import { describe, it, expect } from "vitest";
import { summarizeRule } from "@/utils/ruleEngine";
import type { RuleStep } from "@/types/ribbon";

describe("summarizeRule — empty steps", () => {
	it("returns a meaningful string for empty steps list", () => {
		const result = summarizeRule([]);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});
});

describe("summarizeRule — individual rule kinds", () => {
	it("summarizes SelectionCountRule", () => {
		const step: RuleStep = { kind: "SelectionCountRule", minimum: 1 };
		expect(summarizeRule([step])).toContain("1");
	});

	it("summarizes EntityRule", () => {
		const step: RuleStep = { kind: "EntityRule", entityName: "account" };
		expect(summarizeRule([step])).toContain("account");
	});

	it("summarizes FormStateRule", () => {
		const step: RuleStep = { kind: "FormStateRule", state: "Existing" };
		expect(summarizeRule([step])).toContain("Existing");
	});

	it("summarizes CommandClientTypeRule", () => {
		const step: RuleStep = { kind: "CommandClientTypeRule", type: "Refresh" };
		const result = summarizeRule([step]);
		expect(result).toContain("Refresh");
	});

	it("summarizes CommandClientTypeRule — Modern maps to tablets description", () => {
		const step: RuleStep = { kind: "CommandClientTypeRule", type: "Modern" };
		const result = summarizeRule([step]);
		expect(result).toMatch(/tablet|Modern/i);
	});

	it("summarizes CrmClientTypeRule", () => {
		const step: RuleStep = { kind: "CrmClientTypeRule", type: "Web" };
		expect(summarizeRule([step])).toContain("Web");
	});

	it("summarizes CustomRule", () => {
		const step: RuleStep = {
			kind: "CustomRule",
			library: "$webresource:contoso_/scripts/rules.js",
			functionName: "Contoso.myRule",
		};
		const result = summarizeRule([step]);
		expect(result).toContain("Contoso.myRule");
	});

	it("summarizes EntityPrivilegeRule", () => {
		const step: RuleStep = {
			kind: "EntityPrivilegeRule",
			privilegeType: "Read",
			privilegeDepth: "Basic",
		};
		const result = summarizeRule([step]);
		expect(result).toContain("Read");
		expect(result).toContain("Basic");
	});

	it("summarizes EntityPropertyRule", () => {
		const step: RuleStep = {
			kind: "EntityPropertyRule",
			propertyName: "HasStateCode",
			propertyValue: true,
		};
		const result = summarizeRule([step]);
		expect(result).toContain("HasStateCode");
		expect(result).toContain("true");
	});

	it("summarizes FormTypeRule", () => {
		const step: RuleStep = { kind: "FormTypeRule", type: "Main" };
		expect(summarizeRule([step])).toContain("Main");
	});

	it("summarizes ValueRule", () => {
		const step: RuleStep = { kind: "ValueRule", field: "statuscode", value: "1" };
		const result = summarizeRule([step]);
		expect(result).toContain("statuscode");
		expect(result).toContain("1");
	});

	it("summarizes SkuRule", () => {
		const step: RuleStep = { kind: "SkuRule", sku: "Online" };
		expect(summarizeRule([step])).toContain("Online");
	});

	it("summarizes HideForTabletExperienceRule", () => {
		const step: RuleStep = { kind: "HideForTabletExperienceRule" };
		expect(summarizeRule([step])).toContain("tablet");
	});

	it("summarizes MiscellaneousPrivilegeRule", () => {
		const step: RuleStep = { kind: "MiscellaneousPrivilegeRule", privilegeName: "ExportToExcel" };
		expect(summarizeRule([step])).toContain("ExportToExcel");
	});

	it("summarizes OrganizationSettingRule", () => {
		const step: RuleStep = { kind: "OrganizationSettingRule", setting: "IsSharepointEnabled" };
		expect(summarizeRule([step])).toContain("IsSharepointEnabled");
	});

	it("summarizes PageRule", () => {
		const step: RuleStep = { kind: "PageRule", address: "main.aspx" };
		expect(summarizeRule([step])).toContain("main.aspx");
	});

	it("summarizes RecordPrivilegeRule", () => {
		const step: RuleStep = { kind: "RecordPrivilegeRule", privilegeType: "Write" };
		expect(summarizeRule([step])).toContain("Write");
	});

	it("summarizes RelationshipTypeRule", () => {
		const step: RuleStep = {
			kind: "RelationshipTypeRule",
			appliesTo: "SelectedEntity",
			relationshipType: "OneToMany",
		};
		expect(summarizeRule([step])).toContain("OneToMany");
	});

	it("summarizes SelectionCountRule with both min and max", () => {
		const step: RuleStep = { kind: "SelectionCountRule", minimum: 1, maximum: 10 };
		const result = summarizeRule([step]);
		expect(result).toContain("1");
		expect(result).toContain("10");
	});

	it("summarizes ShowOnQuickActionRule", () => {
		const step: RuleStep = { kind: "ShowOnQuickActionRule" };
		expect(summarizeRule([step])).toContain("quick action");
	});

	it("summarizes ShowOnGridAndQuickActionRule", () => {
		const step: RuleStep = { kind: "ShowOnGridAndQuickActionRule" };
		expect(summarizeRule([step])).toContain("grid");
	});

	it("summarizes ShowOnGridRule", () => {
		const step: RuleStep = { kind: "ShowOnGridRule" };
		expect(summarizeRule([step])).toContain("grid");
	});

	it("summarizes CrmOfflineAccessStateRule", () => {
		const step: RuleStep = { kind: "CrmOfflineAccessStateRule", state: "Online" };
		expect(summarizeRule([step])).toContain("Online");
	});

	it("summarizes OutlookVersionRule", () => {
		const step: RuleStep = { kind: "OutlookVersionRule", version: "2010" };
		expect(summarizeRule([step])).toContain("2010");
	});

	it("summarizes DeviceTypeRule", () => {
		const step: RuleStep = { kind: "DeviceTypeRule", type: "Tablet" };
		expect(summarizeRule([step])).toContain("Tablet");
	});

	it("summarizes OptionSetRule", () => {
		const step: RuleStep = {
			kind: "OptionSetRule",
			optionSet: "statecode",
			stateCode: "0",
			objectTypeCode: "1",
		};
		expect(summarizeRule([step])).toContain("statecode");
	});

	it("summarizes ReferencingAttributeRequiredRule", () => {
		const step: RuleStep = { kind: "ReferencingAttributeRequiredRule" };
		expect(summarizeRule([step])).toContain("required");
	});
});

describe("summarizeRule — InvertResult", () => {
	it("reflects InvertResult in summary text with NOT prefix", () => {
		const step: RuleStep = { kind: "FormStateRule", state: "Existing", invertResult: true };
		const result = summarizeRule([step]);
		expect(result).toContain("NOT");
	});

	it("does not include NOT when invertResult is false", () => {
		const step: RuleStep = { kind: "FormStateRule", state: "Existing", invertResult: false };
		const result = summarizeRule([step]);
		expect(result).not.toContain("NOT");
	});
});

describe("summarizeRule — OrRule nesting", () => {
	it("handles OrRule with nested steps", () => {
		const step: RuleStep = {
			kind: "OrRule",
			rules: [
				{ kind: "FormStateRule", state: "Create" },
				{ kind: "FormStateRule", state: "Existing" },
			],
		};
		const result = summarizeRule([step]);
		expect(result).toContain("Create");
		expect(result).toContain("Existing");
		expect(result).toContain("OR");
	});

	it("joins multiple top-level steps with AND", () => {
		const steps: RuleStep[] = [
			{ kind: "FormStateRule", state: "Existing" },
			{ kind: "SelectionCountRule", minimum: 1 },
		];
		const result = summarizeRule(steps);
		expect(result).toContain("AND");
	});
});
