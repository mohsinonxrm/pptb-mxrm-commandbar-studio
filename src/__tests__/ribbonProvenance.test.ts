import { describe, it, expect } from "vitest";
import {
	isSystemRibbonId,
	heuristicOrigin,
	applyButtonOrigin,
	applyProvenanceToRibbons,
	type ButtonProvenance,
} from "@/utils/ribbonProvenance";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

function makeButton(id: string): RibbonButton {
	return {
		id,
		label: id,
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId: "",
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
	};
}

describe("isSystemRibbonId", () => {
	it("matches Mscrm.* and Microsoft.* only", () => {
		expect(isSystemRibbonId("Mscrm.Form.account.MainTab.Save.SavePrimary")).toBe(true);
		expect(isSystemRibbonId("Microsoft.Foo")).toBe(true);
	});
	it("does NOT match first-party / ISV / user prefixes", () => {
		// The whole point: prefixes can't tell OOB from a managed first-party/ISV
		// solution — only layer data can. The heuristic just flags true platform ids.
		for (const id of [
			"msdyn.account.FieldService",
			"msdyncrm.x",
			"adx_portalButton",
			"contoso.account.MyButton",
			"mxrm.account.Button.MyButton",
		]) {
			expect(isSystemRibbonId(id)).toBe(false);
		}
	});
});

describe("heuristicOrigin", () => {
	it("returns oob for a system id not in a CustomAction", () => {
		expect(heuristicOrigin("Mscrm.Foo", false)).toBe("oob");
	});
	it("returns unmanaged for a non-system id", () => {
		expect(heuristicOrigin("msdyn.Foo", false)).toBe("unmanaged");
	});
	it("returns unmanaged when defined via a CustomAction (any id)", () => {
		expect(heuristicOrigin("Mscrm.Foo", true)).toBe("unmanaged");
	});
});

describe("applyButtonOrigin", () => {
	it("derives legacy flags from origin", () => {
		const oob = makeButton("a");
		applyButtonOrigin(oob, { origin: "oob" });
		expect([oob.oob, oob.custom, oob.managed]).toEqual([true, false, false]);

		const managed = makeButton("b");
		applyButtonOrigin(managed, {
			origin: "managed",
			solutionName: "Field Service",
			publisherName: "Microsoft",
		});
		expect([managed.oob, managed.custom, managed.managed]).toEqual([false, false, true]);
		expect(managed.solutionName).toBe("Field Service");
		expect(managed.publisherName).toBe("Microsoft");

		const unmanaged = makeButton("c");
		applyButtonOrigin(unmanaged, { origin: "unmanaged" });
		expect([unmanaged.oob, unmanaged.custom, unmanaged.managed]).toEqual([false, true, false]);
	});
});

describe("applyProvenanceToRibbons", () => {
	function ribbonsWith(buttons: RibbonButton[]): Record<RibbonLocation, RibbonDefinition> {
		const def = (location: RibbonLocation): RibbonDefinition => ({
			location,
			entityLogicalName: "account",
			tabs: [
				{
					id: "T",
					label: "T",
					sequence: 10,
					tabDisplayRules: [],
					groups: [{ id: "G", label: "G", sequence: 10, template: "", buttons }],
				},
			],
		});
		return {
			HomepageGrid: def("HomepageGrid"),
			SubGrid: { location: "SubGrid", entityLogicalName: "account", tabs: [] },
			Form: { location: "Form", entityLogicalName: "account", tabs: [] },
			Application: { location: "Application", entityLogicalName: "account", tabs: [] },
		};
	}

	it("overlays layer provenance onto matching buttons, leaving others untouched", () => {
		const a = makeButton("msdyn.account.FS");
		applyButtonOrigin(a, { origin: "unmanaged" }); // parser heuristic guess
		const b = makeButton("Mscrm.Save");
		applyButtonOrigin(b, { origin: "oob" });
		const ribbons = ribbonsWith([a, b]);

		const provenance = new Map<string, ButtonProvenance>([
			["msdyn.account.FS", { origin: "managed", solutionName: "Field Service", publisherName: "Microsoft" }],
		]);
		applyProvenanceToRibbons(ribbons, provenance);

		// a was corrected from heuristic "unmanaged" → authoritative "managed"
		expect(a.origin).toBe("managed");
		expect(a.managed).toBe(true);
		expect(a.custom).toBe(false);
		expect(a.solutionName).toBe("Field Service");
		// b had no layer entry → keeps its heuristic origin
		expect(b.origin).toBe("oob");
	});

	it("is a no-op when the provenance map is empty (keeps heuristic)", () => {
		const a = makeButton("msdyn.account.FS");
		applyButtonOrigin(a, { origin: "unmanaged" });
		const ribbons = ribbonsWith([a]);
		applyProvenanceToRibbons(ribbons, new Map());
		expect(a.origin).toBe("unmanaged");
	});
});
