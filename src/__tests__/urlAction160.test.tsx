/**
 * #160: the Open a URL action — a web resource or relative address is fine, a missing one is
 * an error, http:// a warning; Browse… picks a web resource; the window modes have their real
 * names and WinParams can be set; every query string parameter needs a name, and a web
 * resource accepts only its own names.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { EditorDrawer } from "@/components/panels/EditorDrawer";
import CrmParameterEditor from "@/components/shared/CrmParameterEditor";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { webResourceBrowserCallbackRegistry } from "@/utils/webResourceBrowserCallback";
import { validatePublishRibbonDiff } from "@/services/xmlValidator";
import type {
	ActionParameter,
	CommandDefinition,
	RibbonAction,
	RibbonDefinition,
	RibbonLocation,
	UrlAction,
} from "@/types/ribbon";

vi.mock("@/components/shared/MonacoEditor", () => ({ default: () => null }));
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}
vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = "cbstest_ribbontest";
const ID = "cbstest.Open.Command";
const url = (patch: Partial<UrlAction> = {}): RibbonAction =>
	({ kind: "url", address: "https://", params: [], ...patch }) as RibbonAction;
const ribbon = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});
const store = () => useRibbonStore.getState();
const action = () => store().commands.find((c) => c.id === ID)!.actions[0] as UrlAction;

let container: HTMLDivElement;
let root: Root;
const flush = async () => {
	for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const drawer = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const fieldOf = (label: string) =>
	[...document.querySelectorAll("label")]
		.find((l) => l.textContent?.trim() === label)
		?.closest<HTMLElement>(".fui-Field") as HTMLElement;
const inputOf = (label: string) => fieldOf(label).querySelector<HTMLInputElement>("input")!;
const typeInto = (input: HTMLInputElement, value: string) => {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
	act(() => {
		setter.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
};

async function open(actions: RibbonAction[]) {
	store().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon("HomepageGrid"),
			SubGrid: ribbon("SubGrid"),
			Form: ribbon("Form"),
			Application: ribbon("Application"),
		},
		commands: [{ id: ID, enableRules: [], displayRules: [], actions } as CommandDefinition],
		displayRules: [],
		enableRules: [],
		locLabels: [],
	} as never);
	act(() => useUIStore.getState().openCommandEditor(ID));
	for (let i = 0; i < 250 && (!drawer() || !fieldOf("Address")); i++)
		await act(async () => new Promise((r) => setTimeout(r, 20)));
}

beforeEach(() => {
	act(() => useUIStore.getState().closeEditor());
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<EditorDrawer />
			</FluentProvider>,
		),
	);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#160 the address", () => {
	it("a web resource, https or relative address is fine; none is an error; http:// a warning", async () => {
		await open([url()]);
		const address = inputOf("Address");
		expect(fieldOf("Address").textContent).toContain(
			"Enter the address to open, or pick a web resource.",
		);
		expect(fieldOf("Address").textContent).not.toContain("must start with https://");

		for (const ok of [
			"$webresource:cbstest_/page.html",
			"https://contoso.com/x",
			"/main.aspx?pagetype=custom",
		]) {
			typeInto(address, ok);
			expect(fieldOf("Address").textContent).not.toMatch(/Enter the address|Use https/);
		}
		typeInto(address, "http://contoso.com");
		expect(fieldOf("Address").textContent).toContain(
			"Use https://: a dialog can't show an http:// page.",
		);
		typeInto(address, "$webresource:");
		expect(fieldOf("Address").textContent).toContain("Enter the address to open");
		// A pasted reference into a pre-filled field doesn't double the prefix
		typeInto(address, "$webresource:$webresource:cbstest_/page.html");
		expect(action().address).toBe("$webresource:cbstest_/page.html");
	});

	it("Browse… sets a $webresource: address, and the hint names what a web resource reads", async () => {
		await open([url()]);
		const browse = [...fieldOf("Address").querySelectorAll("button")].find(
			(b) => b.textContent === "Browse…",
		)!;
		act(() => browse.click());
		await flush();
		act(() =>
			webResourceBrowserCallbackRegistry.invoke({ name: "cbstest_/page.html" } as never),
		);
		await flush();
		expect(action().address).toBe("$webresource:cbstest_/page.html");
		expect(fieldOf("Address").textContent).toContain(
			"A web resource reads only these query string names: data, typename",
		);
	});
});

describe("#160 the window", () => {
	it("names the modes as Microsoft does and keeps WinParams", async () => {
		await open([url({ address: "https://contoso.com" })]);
		const select = fieldOf("Open in").querySelector("select")!;
		expect([...select.options].map((o) => o.textContent)).toEqual([
			"New window (default)",
			"Modal dialog",
			"Modeless dialog",
		]);
		typeInto(inputOf("Window settings"), "dialogWidth:640px;dialogHeight:658px");
		expect(action().winParams).toBe("dialogWidth:640px;dialogHeight:658px");
		typeInto(inputOf("Window settings"), "  ");
		expect(action().winParams).toBeUndefined();
	});
});

describe("#160 query string parameters", () => {
	let container2: HTMLDivElement | undefined;
	let root2: Root | undefined;
	const render = (node: React.ReactNode) => {
		container2 = document.createElement("div");
		document.body.appendChild(container2);
		root2 = createRoot(container2);
		act(() => root2!.render(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>));
	};
	afterEach(() => {
		act(() => root2?.unmount());
		container2?.remove();
	});

	it("every kind needs a name, a new one is text, and a kind change keeps the name", () => {
		let params: ActionParameter[] = [{ kind: "StringParameter", value: "x" }];
		const onChange = vi.fn((p: ActionParameter[]) => (params = p));
		render(<CrmParameterEditor params={params} onChange={onChange} urlMode />);
		expect(container2!.textContent).toContain("Needs a name: it's the query string key.");

		const add = [...container2!.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("Add"),
		)!;
		act(() => add.click());
		expect(params[1]).toEqual({ kind: "StringParameter", value: "" });

		params = [{ kind: "StringParameter", name: "q", value: "x" }];
		act(() => root2!.unmount());
		container2!.remove();
		render(<CrmParameterEditor params={params} onChange={onChange} urlMode />);
		const type = container2!.querySelector("select")!;
		act(() => {
			type.value = "CrmParameter";
			type.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(params[0]).toEqual({
			kind: "CrmParameter",
			name: "q",
			value: "PrimaryEntityTypeName",
		});
	});

	it("a web resource accepts only its own names", () => {
		const params: ActionParameter[] = [
			{ kind: "StringParameter", name: "data", value: "x" },
			{ kind: "StringParameter", name: "recordId", value: "y" },
		];
		render(
			<CrmParameterEditor
				params={params}
				onChange={() => {}}
				urlMode
				allowedNames={["data", "id"]}
			/>,
		);
		const messages = container2!.textContent!.match(/A web resource accepts only data, id/g);
		expect(messages).toHaveLength(1);
	});
});

describe("#160 publish check", () => {
	it("an empty or bare prefix address has no address; a web resource has one", () => {
		const problems = (address: string) =>
			validatePublishRibbonDiff(
				`<RibbonDiffXml><CustomActions /><Templates><RibbonTemplates Id="Mscrm.Templates" /></Templates>` +
					`<CommandDefinitions><CommandDefinition Id="cbs.U"><EnableRules /><DisplayRules /><Actions><Url Address="${address}" /></Actions></CommandDefinition></CommandDefinitions>` +
					`<RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions><LocLabels /></RibbonDiffXml>`,
				{},
			)
				.filter((f) => f.code === "schema")
				.map((f) => f.message);
		for (const address of ["", "$webresource:", "https://"])
			expect(problems(address)).toContain("Command cbs.U: Url has no address");
		for (const address of ["$webresource:cbs_/page.html", "/main.aspx", "https://contoso.com"])
			expect(problems(address)).toEqual([]);
	});
});
