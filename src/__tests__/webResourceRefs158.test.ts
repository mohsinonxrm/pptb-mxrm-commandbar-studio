/**
 * #158: web resources are referenced with the `$webresource:` directive (the
 * only form that makes a solution dependency) in CustomRule libraries and image
 * attributes too. #159: a typed `$LocLabels:` token CBS doesn't have is
 * written as is, never as a placeholder label whose text is its id.
 */
import { describe, it, expect } from "vitest";
import {
	effectiveModernImage,
	generateRibbonDiffXml,
	generateRuleStep,
	webResourceRef,
} from "@/services/xmlGenerator";
import { normalizeLibrary } from "@/services/xmlGenerator";
import { parseRibbonXml } from "@/services/xmlParser";
import { validatePublishRibbonDiff } from "@/services/xmlValidator";
import type { RibbonButton, RibbonDefinition } from "@/types/ribbon";

describe("#158 web resource references", () => {
	it("get the directive; platform paths, URLs and an existing directive stay", () => {
		expect(webResourceRef("new_/js/rules.js")).toBe("$webresource:new_/js/rules.js");
		expect(webResourceRef("/WebResources/new_/js/rules.js")).toBe(
			"$webresource:new_/js/rules.js",
		);
		expect(webResourceRef("WebResources/new_/x.svg")).toBe("$webresource:new_/x.svg");
		expect(webResourceRef("$Webresource:Main_system_library.js")).toBe(
			"$Webresource:Main_system_library.js",
		);
		expect(webResourceRef("/_imgs/ribbon/New_16.png")).toBe("/_imgs/ribbon/New_16.png");
		expect(webResourceRef("https://contoso.com/x.js")).toBe("https://contoso.com/x.js");
		expect(webResourceRef("")).toBe("");
	});

	it("a CustomRule's library gets the directive, like a JavaScript action's", () => {
		const xml = generateRuleStep({
			kind: "CustomRule",
			functionName: "cbs.check",
			library: "new_/js/rules.js",
		});
		expect(xml).toContain('Library="$webresource:new_/js/rules.js"');
	});

	const control = (extra: Partial<RibbonButton>): RibbonButton => ({
		id: "cbs.Btn",
		label: "Btn",
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId: "cbs.Btn.Command",
		hidden: false,
		oob: false,
		custom: true,
		managed: false,
		...extra,
	});

	it("a bare image path is written with the directive and kept as the ModernImage", () => {
		const button = control({ image16: "new_/icons/x.svg", image32: "new_/icons/x.svg" });
		expect(effectiveModernImage(button)).toBe("$webresource:new_/icons/x.svg");
		const empty = (location: RibbonDefinition["location"]): RibbonDefinition => ({
			location,
			entityLogicalName: "account",
			tabs: [],
		});
		const current: RibbonDefinition = {
			...empty("HomepageGrid"),
			tabs: [
				{
					id: "Mscrm.HomepageGrid.account.MainTab",
					label: "Main",
					sequence: 10,
					tabDisplayRules: [],
					groups: [
						{
							id: "Mscrm.HomepageGrid.account.MainTab.Management",
							label: "Management",
							sequence: 10,
							template: "Mscrm.Templates.Flexible2",
							buttons: [button],
						},
					],
				},
			],
		};
		const xml = generateRibbonDiffXml({
			current,
			baseline: {
				...current,
				tabs: [
					{ ...current.tabs[0], groups: [{ ...current.tabs[0].groups[0], buttons: [] }] },
				],
			},
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: "account",
			location: "HomepageGrid",
		});
		const el = new DOMParser()
			.parseFromString(`<r>${xml}</r>`, "application/xml")
			.querySelector('Button[Id="cbs.Btn"]')!;
		expect(el.getAttribute("Image16by16")).toBe("$webresource:new_/icons/x.svg");
		expect(el.getAttribute("Image32by32")).toBe("$webresource:new_/icons/x.svg");
		expect(el.getAttribute("ModernImage")).toBe("$webresource:new_/icons/x.svg");

		// #159: a typed label reference CBS doesn't have is written as is, with no placeholder label.
		const typed = generateRibbonDiffXml({
			current: {
				...current,
				tabs: [
					{
						...current.tabs[0],
						groups: [
							{
								...current.tabs[0].groups[0],
								buttons: [control({ label: "$LocLabels:contoso.Shared.Save" })],
							},
						],
					},
				],
			},
			baseline: {
				...current,
				tabs: [
					{ ...current.tabs[0], groups: [{ ...current.tabs[0].groups[0], buttons: [] }] },
				],
			},
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: "account",
			location: "HomepageGrid",
		});
		const doc = new DOMParser().parseFromString(`<r>${typed}</r>`, "application/xml");
		expect(doc.querySelector('Button[Id="cbs.Btn"]')?.getAttribute("LabelText")).toBe(
			"$LocLabels:contoso.Shared.Save",
		);
		expect(doc.querySelector('LocLabel[Id="contoso.Shared.Save"]')).toBeNull();
	});
});

describe("#158 review", () => {
	it("relative paths stay; a loaded image path doesn't replace a loaded ModernImage", () => {
		expect(webResourceRef("../WebResources/new_/x.png")).toBe("../WebResources/new_/x.png");
		const loaded = {
			id: "cbs.Loaded",
			label: "L",
			kind: "button" as const,
			sequence: 10,
			templateAlias: "o1",
			commandId: "c",
			hidden: false,
			oob: false,
			custom: true,
			managed: false,
			icon: "new",
			image16: "new_/icons/x.png",
			image32: "new_/icons/x.png",
			source: {
				attributes: {
					Id: "cbs.Loaded",
					ModernImage: "New",
					Image16by16: "new_/icons/x.png",
					Image32by32: "new_/icons/x.png",
				},
				modernImage: "New",
			},
		};
		expect(effectiveModernImage(loaded)).toBe("New");
	});

	it("a loaded /WebResources/ library still round-trips (editable), and the pre-publish check warns", () => {
		expect(normalizeLibrary("/WebResources/new_/a.js")).toBe("/WebResources/new_/a.js");
		const xml = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs /></Ribbon></UI><CommandDefinitions>
  <CommandDefinition Id="cbs.Cmd"><EnableRules /><DisplayRules /><Actions><JavaScriptFunction FunctionName="cbs.run" Library="/WebResources/new_/a.js" /></Actions></CommandDefinition>
</CommandDefinitions><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`;
		const cmd = parseRibbonXml(xml, "HomepageGrid", "account").commands.find(
			(c) => c.id === "cbs.Cmd",
		)!;
		expect(cmd.actions.map((a) => a.kind)).toEqual(["javascript"]);
		const findings = validatePublishRibbonDiff(
			`<RibbonDiffXml><CustomActions /><Templates><RibbonTemplates Id="Mscrm.Templates" /></Templates><CommandDefinitions><CommandDefinition Id="cbs.Cmd"><EnableRules /><DisplayRules /><Actions><JavaScriptFunction FunctionName="cbs.run" Library="/WebResources/new_/a.js" /></Actions></CommandDefinition></CommandDefinitions><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions><LocLabels /></RibbonDiffXml>`,
		).filter((f) => f.code === "webresource-path");
		expect(findings).toHaveLength(1);
		expect(findings[0].severity).toBe("warning");
		expect(findings[0].message).toMatch(/use \$webresource:new_\/a\.js/);
	});
});
