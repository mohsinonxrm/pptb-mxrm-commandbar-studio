/**
 * #153: the pre-publish check catches the schema errors the import rejects,
 * before anything is written: an empty rule, an OrRule with one alternative,
 * a JavaScript action without a function, NaN numbers, empty required values.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { validatePublishRibbonDiff } from "@/services/xmlValidator";
import { schemaProblems } from "@/services/ribbonSchemaChecks";
import { CrmParameterEditor } from "@/components/shared/CrmParameterEditor";
import type { ActionParameter } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const diff = (commands: string, enableRules = "", displayRules = "") =>
	`<RibbonDiffXml><CustomActions /><Templates><RibbonTemplates Id="Mscrm.Templates" /></Templates>` +
	`<CommandDefinitions>${commands}</CommandDefinitions><RuleDefinitions><TabDisplayRules />` +
	`<DisplayRules>${displayRules}</DisplayRules><EnableRules>${enableRules}</EnableRules></RuleDefinitions><LocLabels /></RibbonDiffXml>`;
const command = (id: string, actions: string) =>
	`<CommandDefinition Id="${id}"><EnableRules /><DisplayRules /><Actions>${actions}</Actions></CommandDefinition>`;

const schema = (xml: string, changedKeys?: string[]) =>
	validatePublishRibbonDiff(xml, changedKeys ? { changedKeys } : {}).filter(
		(f) => f.code === "schema",
	);

describe("#153 schema checks before a publish", () => {
	it("an empty rule and an OrRule with one alternative are errors", () => {
		const findings = schema(
			diff(
				"",
				`<EnableRule Id="cbs.Empty" />`,
				`<DisplayRule Id="cbs.OneOr"><OrRule><Or><FormStateRule State="Create" /></Or></OrRule></DisplayRule>`,
			),
		);
		expect(findings.map((f) => [f.severity, f.elementId])).toEqual([
			["error", "cbs.OneOr"],
			["error", "cbs.Empty"],
		]);
		expect(findings.map((f) => f.message).join("\n")).toMatch(/has no steps/);
		expect(findings.map((f) => f.message).join("\n")).toMatch(/at least 2 alternatives/);
	});

	it("a JavaScript action needs a function name and a library; numbers must be numbers", () => {
		const messages = schema(
			diff(
				command(
					"cbs.A",
					`<JavaScriptFunction FunctionName="" Library="$webresource:cbs_/a.js" />`,
				) +
					command(
						"cbs.B",
						`<JavaScriptFunction FunctionName="do it" Library=""><IntParameter Value="NaN" /></JavaScriptFunction>`,
					) +
					command(
						"cbs.C",
						`<JavaScriptFunction FunctionName="cbs.ok" Library="$webresource:cbs_/a.js"><DecimalParameter Value="1.5" /><IntParameter Value="2" /></JavaScriptFunction>`,
					),
				`<EnableRule Id="cbs.Count"><SelectionCountRule Minimum="NaN" Maximum="3" /></EnableRule>`,
			),
		).map((f) => f.message);
		expect(messages).toEqual(
			expect.arrayContaining([
				"Command cbs.A: JavaScriptFunction has no FunctionName",
				"Command cbs.B: JavaScriptFunction has no Library",
				'Command cbs.B: FunctionName "do it" isn\'t a JavaScript function name (letters, digits, _, $ and dots)',
				'Command cbs.B: IntParameter Value="NaN" is not a whole number',
				'Enable rule cbs.Count: SelectionCountRule Minimum="NaN" is not a whole number',
			]),
		);
		expect(messages.filter((m) => m.startsWith("Command cbs.C:"))).toEqual([]);
	});

	it("a Url needs an address and named parameters; rule steps need their required values", () => {
		const messages = schema(
			diff(
				command("cbs.U", `<Url Address="https://"><StringParameter Value="x" /></Url>`),
				"",
				`<DisplayRule Id="cbs.V"><ValueRule Field="" Value="" /><PageRule Address="" /></DisplayRule>`,
			),
		).map((f) => f.message);
		expect(messages).toEqual([
			"Command cbs.U: Url has no address",
			"Command cbs.U: a StringParameter of the Url has no Name",
			"Display rule cbs.V: ValueRule has no Field",
			"Display rule cbs.V: PageRule has no Address",
		]);
	});

	it("a problem only in what's already published is a warning", () => {
		const findings = schema(diff("", `<EnableRule Id="cbs.Old" />`), [
			"commandDefinitions:cbs.Other",
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0].severity).toBe("warning");
		expect(findings[0].message).toMatch(/already in the published customizations/);
	});

	it("Microsoft's ribbons in the fixtures pass (no false positives), but for one platform rule", () => {
		const dir = resolve(__dirname, "../__fixtures__/ribbon");
		const problems: string[] = [];
		for (const file of readdirSync(dir).filter((f) => f.endsWith(".xml"))) {
			const doc = new DOMParser().parseFromString(
				readFileSync(resolve(dir, file), "utf-8"),
				"application/xml",
			);
			for (const el of Array.from(doc.getElementsByTagName("*"))) {
				const top =
					el.tagName === "CommandDefinition" ||
					((el.tagName === "EnableRule" || el.tagName === "DisplayRule") &&
						el.parentElement?.parentElement?.tagName === "RuleDefinitions");
				if (top) problems.push(...schemaProblems(el));
			}
		}
		// Microsoft's own ribbon isn't imported as a RibbonDiffXml; copied into
		// a layer, this rule would be rejected (OrDisplayRuleType minOccurs="2").
		expect([...new Set(problems)]).toEqual([
			"Display rule Mscrm.ShowPivotXlsx: an OrRule needs at least 2 alternatives (it has 1)",
		]);
	});
});

describe("#153 a cleared number parameter isn't stored as NaN", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("keeps the last valid value", () => {
		let params: ActionParameter[] = [{ kind: "IntParameter", value: 3 }];
		const onChange = vi.fn((next: ActionParameter[]) => (params = next));
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<CrmParameterEditor params={params} onChange={onChange} />
				</FluentProvider>,
			),
		);
		const input = container.querySelector<HTMLInputElement>('input[type="number"]')!;
		const type = (value: string) =>
			act(() => {
				Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
					input,
					value,
				);
				input.dispatchEvent(new Event("input", { bubbles: true }));
			});
		type("");
		type("2.5");
		expect(onChange).not.toHaveBeenCalled();
		type("7");
		expect(params).toEqual([{ kind: "IntParameter", value: 7 }]);
		expect(
			onChange.mock.calls.flat(2).some((p) => Number.isNaN((p as { value: number }).value)),
		).toBe(false);
	});
});
