/**
 * #126: the RibbonDiffXml a publish would import is checked against
 * Microsoft's 2017 ribbon schemas (xmllint compiled to WebAssembly). Every
 * finding is a warning: Dataverse accepts ribbon XML the schemas don't
 * describe, so the schema never blocks a publish.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import {
	checkRibbonSchema,
	MAX_SCHEMA_FINDINGS,
	schemaDocument,
	validatorFailure,
	type KnownSchemaException,
	type XsdValidator,
} from "@/services/ribbonXsdCheck";
import { parseRibbonDiffParts, serializeRibbonDiffParts } from "@/services/ribbonDiffMerge";
import { parseRibbonXml } from "@/services/xmlParser";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import type { EntityMetadata } from "@/types/entity";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";
import type { Solution } from "@/types/solution";

// The real xmllint, unless a test makes its worker fail to start.
let failValidator = false;
vi.mock("xmllint-wasm", async (importOriginal) => {
	const real = await importOriginal<typeof import("xmllint-wasm")>();
	return {
		...real,
		validateXML: (options: Parameters<typeof real.validateXML>[0]) =>
			failValidator ? Promise.reject(new Event("error")) : real.validateXML(options),
	};
});

// xmllint starts a worker and compiles the WebAssembly on each check.
vi.setConfig({ testTimeout: 60_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BUTTON = "cbstest.account.Button.Go";
const COMMAND = "cbstest.account.Command.Go";

/** A layer the way CBS writes one: a button, its command, rules and label. */
const layer = ({
	buttonAttrs = "",
	actions = `<Actions><JavaScriptFunction Library="$webresource:cbstest_/go.js" FunctionName="go"><CrmParameter Value="PrimaryControl" /></JavaScriptFunction></Actions>`,
	commandBody,
}: { buttonAttrs?: string; actions?: string; commandBody?: string } = {}) => `<RibbonDiffXml>
  <CustomActions>
    <CustomAction Id="${BUTTON}.CustomAction" Location="Mscrm.HomepageGrid.account.MainTab.Management.Controls._children" Sequence="10"><CommandUIDefinition><Button Id="${BUTTON}" Command="${COMMAND}" Sequence="10" TemplateAlias="o1" LabelText="$LocLabels:${BUTTON}.LabelText" ModernImage="$webresource:cbstest_/go.svg"${buttonAttrs} /></CommandUIDefinition></CustomAction>
    <HideCustomAction HideActionId="cbstest.Mscrm.HomepageGrid.account.Delete.Hide" Location="Mscrm.HomepageGrid.account.Delete" />
  </CustomActions>
  <Templates><RibbonTemplates Id="Mscrm.Templates"></RibbonTemplates></Templates>
  <CommandDefinitions>
    <CommandDefinition Id="${COMMAND}">${
		commandBody ??
		`<EnableRules><EnableRule Id="cbstest.account.EnableRule.One" /></EnableRules><DisplayRules><DisplayRule Id="cbstest.account.DisplayRule.Modern" /></DisplayRules>${actions}`
	}</CommandDefinition>
  </CommandDefinitions>
  <RuleDefinitions>
    <TabDisplayRules />
    <DisplayRules><DisplayRule Id="cbstest.account.DisplayRule.Modern"><CommandClientTypeRule Type="Modern" /></DisplayRule></DisplayRules>
    <EnableRules><EnableRule Id="cbstest.account.EnableRule.One"><SelectionCountRule Minimum="1" AppliesTo="SelectedEntity" /></EnableRule></EnableRules>
  </RuleDefinitions>
  <LocLabels><LocLabel Id="${BUTTON}.LabelText"><Titles><Title languagecode="1033" description="Go" /></Titles></LocLabel></LocLabels>
</RibbonDiffXml>`;

/** CBS hands the check what serializeRibbonDiffParts writes (checkBeforePublish's xml). */
const asImported = (xml: string) => serializeRibbonDiffParts(parseRibbonDiffParts(xml));

describe("#126 Microsoft's ribbon schema", () => {
	it("a layer the way CBS writes it has no findings, for an entity and the application ribbon", async () => {
		expect(await checkRibbonSchema({ xml: asImported(layer()), entity: true })).toEqual([]);
		expect(await checkRibbonSchema({ xml: asImported(layer()), entity: false })).toEqual([]);
	});

	it("an unknown attribute is a warning that names the control", async () => {
		const findings = await checkRibbonSchema({
			xml: asImported(layer({ buttonAttrs: ' Bogus="1"' })),
			entity: true,
		});
		expect(findings).toEqual([
			{
				severity: "warning",
				code: "xsd",
				elementId: BUTTON,
				message: `${BUTTON}: Element 'Button', attribute 'Bogus': The attribute 'Bogus' is not allowed.`,
			},
		]);
	});

	it("elements out of order are a warning that names the command", async () => {
		const findings = await checkRibbonSchema({
			xml: asImported(
				layer({
					commandBody: `<Actions><Url Address="https://contoso.com" /></Actions><EnableRules /><DisplayRules />`,
				}),
			),
			entity: true,
		});
		expect(findings.length).toBeGreaterThan(0);
		for (const f of findings) {
			expect(f.severity).toBe("warning");
			expect(f.code).toBe("xsd");
			expect(f.elementId).toBe(COMMAND);
			expect(f.message).toMatch(new RegExp(`^${COMMAND.replace(/\./g, "\\.")}: Element '`));
		}
	});

	it("marks a finding this publish doesn't write as already published", async () => {
		const xml = asImported(layer({ buttonAttrs: ' Bogus="1"' }));
		const untouched = await checkRibbonSchema({
			xml,
			entity: true,
			changedKeys: [`commandDefinitions:${COMMAND}`],
		});
		expect(untouched.map((f) => f.message)).toEqual([
			`${BUTTON}: Element 'Button', attribute 'Bogus': The attribute 'Bogus' is not allowed. (already in the published customizations)`,
		]);
		const changed = await checkRibbonSchema({
			xml,
			entity: true,
			changedKeys: [`customActions:ca:${BUTTON}.CustomAction`],
		});
		expect(changed[0].message).not.toContain("already in the published");
	});

	it("a pattern proven on a live org gets no warning", async () => {
		const exception: KnownSchemaException = {
			what: "Bogus on a Button",
			provedBy: "test",
			matches: ({ detail, tag }) => tag === "Button" && detail.includes("'Bogus'"),
		};
		expect(
			await checkRibbonSchema(
				{ xml: asImported(layer({ buttonAttrs: ' Bogus="1"' })), entity: true },
				undefined,
				[exception],
			),
		).toEqual([]);
	});

	it("an entity's layer is checked as RibbonEntityDiffXmlType, inside a wrapper on line 1", () => {
		const { xml, owners } = schemaDocument(parseRibbonDiffParts(layer()), true);
		const lines = xml.split("\n");
		expect(lines[0]).toBe("<CbsEntityRibbon><RibbonDiffXml>");
		expect(lines.at(-1)).toBe("</RibbonDiffXml></CbsEntityRibbon>");
		// Every start tag on a line of its own, owned by its element.
		const buttonLine = lines.findIndex((l) => l.includes(`<Button Id="${BUTTON}"`));
		expect(owners[buttonLine]).toEqual({
			key: `customActions:ca:${BUTTON}.CustomAction`,
			tag: "Button",
			elementId: BUTTON,
		});
		const paramLine = lines.findIndex((l) => l.includes("<CrmParameter"));
		expect(owners[paramLine]).toMatchObject({ tag: "CrmParameter", elementId: COMMAND });
	});

	it("an attribute value with a line break stays on its line", () => {
		const parts = parseRibbonDiffParts(
			layer({ buttonAttrs: ' ToolTipDescription="one&#10;two &amp; &quot;three&quot;"' }),
		);
		const { xml, owners } = schemaDocument(parts, true);
		const lines = xml.split("\n");
		expect(lines).toHaveLength(owners.length);
		expect(lines.find((l) => l.includes("ToolTipDescription"))).toContain(
			'ToolTipDescription="one&#10;two &amp; &quot;three&quot;"',
		);
	});

	it("text with a line break doesn't shift the lines: the finding still names its command", async () => {
		const xml = asImported(
			layer({
				commandBody:
					'<EnableRules /><DisplayRules /><Actions><Url Address="https://contoso.com" /></Actions><Bogus>one&#10;two&#13;three</Bogus>',
			}),
		);
		const { xml: doc, owners } = schemaDocument(parseRibbonDiffParts(xml), true);
		expect(doc.split("\n")).toHaveLength(owners.length);
		const findings = await checkRibbonSchema({ xml, entity: true });
		expect(findings).toHaveLength(1);
		expect(findings[0].elementId).toBe(COMMAND);
		expect(findings[0].message).toContain("Element 'Bogus'");
	});

	it(`lists at most ${MAX_SCHEMA_FINDINGS} findings and sums up the rest`, async () => {
		const xml = asImported(layer());
		const line = schemaDocument(parseRibbonDiffParts(xml), true)
			.xml.split("\n")
			.findIndex((l) => l.includes("<Button "));
		const many: XsdValidator = async () => ({
			valid: false,
			errors: Array.from({ length: MAX_SCHEMA_FINDINGS + 10 }, (_, i) => ({
				message: `element Button: Schemas validity error : Element 'Button', attribute 'A${i}': The attribute 'A${i}' is not allowed.`,
				lineNumber: line + 1,
			})),
		});
		const findings = await checkRibbonSchema({ xml, entity: true }, many);
		expect(findings).toHaveLength(MAX_SCHEMA_FINDINGS + 1);
		expect(findings.at(-1)?.message).toBe(
			"…and 10 more the schema doesn't allow. View XML shows the whole RibbonDiffXml.",
		);
		expect(findings.every((f) => f.severity === "warning")).toBe(true);
	});

	it("says in a sentence why the validator couldn't run", () => {
		expect(validatorFailure(new Event("error")).message).toBe(
			"the validator's Web Worker couldn't start",
		);
		expect(
			validatorFailure(Object.assign(new Error("ribbon.xml:9: error"), { code: 9 })).message,
		).toBe("the ribbon XML is too large for the schema check");
		expect(validatorFailure(new Error("Aborted(OOM)")).message).toBe(
			"the ribbon XML is too large for the schema check",
		);
		const long = validatorFailure(new Error(`${"x".repeat(300)}\nsecond line`)).message;
		expect(long).toHaveLength(201);
		expect(long.endsWith("…")).toBe(true);
	});

	it("rejects when the validator can't run, so the dialog can say so", async () => {
		const failing: XsdValidator = () =>
			Promise.reject(new Error("Workers aren't allowed here"));
		await expect(
			checkRibbonSchema({ xml: asImported(layer()), entity: true }, failing),
		).rejects.toThrow("Workers aren't allowed here");
	});
});

// ---------------------------------------------------------------------------
// The publish dialog: schema findings are warnings, and Publish stays enabled.
// ---------------------------------------------------------------------------

let checkedXml = "";
vi.mock("@/services/dataverse/publishService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/publishService")>()),
	checkBeforePublish: vi.fn(async () => ({
		findings: [],
		xml: checkedXml,
		changedKeys: [`customActions:ca:${BUTTON}.CustomAction`],
	})),
}));
vi.mock("@/services/dataverse/webResourceService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/webResourceService")>()),
	lookupWebResources: vi.fn(async () => ({})),
}));

const T = "cbstest_ribbontest";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const MGMT = `${MAIN}.Management`;
const RIBBON = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${MAIN}" Command="${MAIN}" Sequence="10"><Groups Id="${MAIN}.Groups">
    <Group Id="${MGMT}" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="${MGMT}.Controls">
      <Button Id="Mscrm.HomepageGrid.${T}.Edit" Command="Mscrm.EditSelectedRecord" Sequence="20" LabelText="Edit" TemplateAlias="o1" />
    </Controls></Group>
  </Groups></Tab>
</Tabs></Ribbon></UI><CommandDefinitions>
  <CommandDefinition Id="Mscrm.EditSelectedRecord"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction FunctionName="edit" Library="$webresource:lib.js"/></Actions></CommandDefinition>
</CommandDefinitions><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`;
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});

let container: HTMLDivElement;
let root: Root;
const flush = async (rounds = 5) => {
	for (let i = 0; i < rounds; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? "";
const publishButton = () =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
		/^Publish \d/.test(b.textContent?.trim() ?? ""),
	);
/** Until the schema check (a worker) has answered. */
async function waitFor(predicate: () => boolean) {
	for (let i = 0; i < 200 && !predicate(); i++)
		await act(async () => new Promise((r) => setTimeout(r, 50)));
}

describe("#126 in the publish dialog", () => {
	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		(window as unknown as { toolboxAPI: unknown }).toolboxAPI = {
			connections: {
				getConnection: async () => ({
					id: "c1",
					name: "Contoso",
					url: "https://contoso.crm.dynamics.com",
					environment: "Dev",
				}),
			},
		};
		useSessionStore.setState({
			activeSolution: {
				id: "s1",
				uniqueName: "CBSLiveTest",
				friendlyName: "CBS Live Test",
				version: "1.0.0.0",
				isManaged: false,
				publisherPrefix: "cbstest",
			} as Solution,
			activeEntity: {
				metadataId: "md",
				logicalName: T,
				displayName: "CBS Ribbon Test",
				isCustomEntity: true,
				isIntersect: false,
			} as EntityMetadata,
			solutionRibbonComponentIds: [],
			publisherPrefix: "cbstest",
			baseLanguageCode: 1033,
		} as never);
		const parsed = parseRibbonXml(RIBBON, "HomepageGrid", T);
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: parsed.ribbon,
				SubGrid: empty("SubGrid"),
				Form: empty("Form"),
				Application: empty("Application"),
			},
			commands: parsed.commands,
			displayRules: parsed.displayRules,
			enableRules: parsed.enableRules,
			locLabels: [],
		});
		useRibbonStore.getState().createButton({
			location: "HomepageGrid",
			tabId: MAIN,
			groupId: MGMT,
			button: {
				id: "cbstest.New",
				label: "New one",
				kind: "button",
				templateAlias: "o1",
				commandId: "Mscrm.EditSelectedRecord",
				hidden: false,
				oob: false,
				custom: true,
				managed: false,
			},
		});
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		document.body.innerHTML = "";
		useUIStore.setState({ bulkPublishOpen: false });
		delete (window as unknown as { toolboxAPI?: unknown }).toolboxAPI;
	});

	async function open() {
		const { default: BulkPublishModal } = await import("@/components/modals/BulkPublishModal");
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<BulkPublishModal />
				</FluentProvider>,
			),
		);
		act(() => useUIStore.setState({ bulkPublishOpen: true }));
		await flush();
	}

	it("lists what the schema doesn't allow under Warnings, and Publish stays enabled", async () => {
		checkedXml = asImported(layer({ buttonAttrs: ' Bogus="1"' }));
		await open();
		await waitFor(() => dialogText().includes("Warnings · 1"));
		expect(dialogText()).toContain("Warnings · 1");
		// Warnings are folded away until opened (#188).
		act(() =>
			[...document.querySelectorAll<HTMLButtonElement>("button")]
				.find((b) => b.textContent?.startsWith("Warnings"))!
				.click(),
		);
		await flush();
		const text = dialogText();
		expect(text).toContain("Microsoft's schema from 2017 doesn't allow these");
		expect(text).toContain(`${BUTTON}: Element 'Button', attribute 'Bogus'`);
		expect(publishButton()?.disabled).toBe(false);
	});

	it("where the validator can't run, Good to know says so and Publish stays enabled", async () => {
		checkedXml = asImported(layer({ buttonAttrs: ' Bogus="1"' }));
		failValidator = true;
		try {
			await open();
			await waitFor(() => dialogText().includes("Good to know · 2"));
			act(() =>
				[...document.querySelectorAll<HTMLButtonElement>("button")]
					.find((b) => b.textContent?.startsWith("Good to know"))!
					.click(),
			);
			await flush();
			const text = dialogText();
			expect(text).toContain(
				"Microsoft's ribbon schema check couldn't run here (the validator's Web Worker couldn't start). It never blocks publishing.",
			);
			expect(text).not.toContain("Warnings ·");
			expect(publishButton()?.disabled).toBe(false);
		} finally {
			failValidator = false;
		}
	});

	it("a clean layer adds no warning", async () => {
		checkedXml = asImported(layer());
		await open();
		await waitFor(() => !dialogText().includes("Checking against Microsoft's ribbon schema"));
		expect(dialogText()).not.toContain("Warnings ·");
		expect(dialogText()).not.toContain("Microsoft's ribbon schema");
		expect(publishButton()?.disabled).toBe(false);
	});
});
