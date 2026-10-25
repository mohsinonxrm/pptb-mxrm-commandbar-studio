import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Button, FluentProvider, webLightTheme } from "@fluentui/react-components";
import { AppDialog, DangerButton } from "@/components/shared/AppDialog";
import { PropertySection, PropertySections } from "@/components/shared/PropertySection";
import { IdField } from "@/components/shared/IdField";
import { LocationInfo } from "@/components/shared/LocationInfo";
import { MessageSlot, type SlotMessage } from "@/components/shared/MessageSlot";
import { RuleTag } from "@/components/shared/RuleTag";
import { ruleShortName } from "@/utils/ruleLabel";
import { LOCATION_INFO, locationRibbonId } from "@/constants/locationInfo";

// #190 — the shared Fluent pieces the UI/UX issues build on.

const copied = vi.hoisted(() => ({ texts: [] as string[], ok: true }));
vi.mock("@/utils/hostIO", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/hostIO")>()),
	copyText: async (text: string) => {
		copied.texts.push(text);
		return copied.ok ? { ok: true } : { ok: false, error: "denied" };
	},
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

let host: HTMLDivElement;
let root: Root;

function render(ui: React.ReactElement) {
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
}
const text = () => document.body.textContent ?? "";
const buttonNamed = (name: string) =>
	[...document.body.querySelectorAll("button")].find(
		(b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name,
	);
const click = async (el: Element | undefined) => {
	if (!el) throw new Error("element not found");
	await act(async () => {
		(el as HTMLElement).click();
	});
};

beforeEach(() => {
	localStorage.clear();
	copied.texts = [];
	copied.ok = true;
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(() => {
	act(() => root.unmount());
	host.remove();
	document.body.innerHTML = "";
});

describe("AppDialog", () => {
	it("puts title, content and actions in the dialog, with a close button", async () => {
		const onOpenChange = vi.fn();
		render(
			<AppDialog
				open
				onOpenChange={onOpenChange}
				title="Import RibbonDiffXml"
				startActions={<Button>View XML</Button>}
				actions={<Button appearance="primary">Import 2 changes</Button>}
			>
				Paste the XML.
			</AppDialog>,
		);
		const dialog = document.body.querySelector('[role="dialog"]');
		expect(dialog?.textContent).toContain("Import RibbonDiffXml");
		expect(dialog?.textContent).toContain("Paste the XML.");
		expect(buttonNamed("View XML")).toBeTruthy();
		expect(buttonNamed("Import 2 changes")).toBeTruthy();
		await click(buttonNamed("Close"));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("has no close button as an alert", () => {
		render(
			<AppDialog open onOpenChange={() => {}} title="Discard changes?" modalType="alert">
				Body
			</AppDialog>,
		);
		expect(document.body.querySelector('[role="alertdialog"]')).toBeTruthy();
		expect(buttonNamed("Close")).toBeUndefined();
	});

	it("DangerButton is a primary button that clicks", async () => {
		const onClick = vi.fn();
		render(<DangerButton onClick={onClick}>Delete group</DangerButton>);
		await click(buttonNamed("Delete group"));
		expect(onClick).toHaveBeenCalledOnce();
	});
});

describe("PropertySections", () => {
	const ui = () => (
		<PropertySections storageKey="test" defaultOpen={["a"]}>
			<PropertySection value="a" title="Appearance">
				Label field
			</PropertySection>
			<PropertySection value="b" title="Advanced" info="Rarely needed settings.">
				Sequence field
			</PropertySection>
		</PropertySections>
	);
	const header = (name: string) =>
		[...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);

	it("opens the default sections and remembers what the user opens", async () => {
		render(ui());
		expect(header("Appearance")?.getAttribute("aria-expanded")).toBe("true");
		expect(header("Advanced")?.getAttribute("aria-expanded")).toBe("false");
		await click(header("Advanced"));
		expect(header("Advanced")?.getAttribute("aria-expanded")).toBe("true");

		act(() => root.unmount());
		root = createRoot(host);
		render(ui());
		expect(header("Advanced")?.getAttribute("aria-expanded")).toBe("true");
	});

	it("puts the info button beside the header, not inside it", () => {
		render(ui());
		const info = buttonNamed("About Advanced");
		expect(info).toBeTruthy();
		expect(header("Advanced")?.contains(info!)).toBe(false);
	});
});

describe("IdField", () => {
	const ID = "cbstest.Mscrm.HomepageGrid.account.MainTab.Credit.CreditCheck.Button";

	it("shows the id read-only with a label and copies it", async () => {
		render(<IdField label="Button ID" value={ID} />);
		const input = document.body.querySelector("input") as HTMLInputElement;
		expect(input.value).toBe(ID);
		expect(input.readOnly).toBe(true);
		const label = document.body.querySelector(`label[for="${input.id}"]`);
		expect(label?.textContent).toBe("Button ID");
		await click(buttonNamed("Copy button id") ?? document.body.querySelectorAll("button")[0]);
		expect(copied.texts).toEqual([ID]);
		expect(text()).toContain("Button ID copied");
	});

	it("says when copying failed", async () => {
		copied.ok = false;
		render(<IdField label="Command ID" value="x.Command" hideLabel />);
		await click(document.body.querySelectorAll("button")[0]);
		expect(text()).toContain("Couldn't copy the command id");
		expect(document.body.querySelector("input")?.getAttribute("aria-label")).toBe("Command ID");
	});
});

describe("LocationInfo", () => {
	it("opens the location's explanation and ribbon id", async () => {
		render(<LocationInfo location="Form" table="account" />);
		expect(text()).not.toContain(LOCATION_INFO.Form.body);
		await click(buttonNamed("About this location"));
		expect(text()).toContain(LOCATION_INFO.Form.body);
		expect(text()).toContain("Mscrm.Form.account");
	});

	it("is icon-only when compact", () => {
		render(<LocationInfo location="SubGrid" compact />);
		const b = document.body.querySelector("button");
		expect(b?.textContent?.trim()).toBe("");
	});

	it("names every location in Unified Interface terms", () => {
		expect(LOCATION_INFO.HomepageGrid.label).toBe("Main grid");
		expect(LOCATION_INFO.Form.label).toBe("Main form");
		expect(LOCATION_INFO.SubGrid.label).toBe("Sub-grid");
		expect(locationRibbonId("SubGrid", "contact")).toBe("Mscrm.SubGrid.contact");
		expect(locationRibbonId("HomepageGrid")).toBe("Mscrm.HomepageGrid.<table>");
	});
});

describe("MessageSlot", () => {
	const msgs = (orphans = "3"): SlotMessage[] => [
		{
			id: "orphans",
			intent: "warning",
			title: `${orphans} customizations point at missing controls`,
			signature: orphans,
		},
		{ id: "layer", intent: "error", title: "Couldn't read your layer", dismissible: false },
	];

	it("shows the most severe message, and the rest behind +n more", async () => {
		render(<MessageSlot scope="t" messages={msgs()} />);
		expect(text()).toContain("Couldn't read your layer");
		expect(text()).not.toContain("3 customizations point at missing controls");
		await click(buttonNamed("+1 more"));
		expect(text()).toContain("3 customizations point at missing controls");
		expect(buttonNamed("Show fewer")).toBeTruthy();
	});

	it("remembers a dismiss until the message changes", async () => {
		render(<MessageSlot scope="t" messages={msgs()} />);
		await click(buttonNamed("+1 more"));
		await click(buttonNamed("Dismiss: 3 customizations point at missing controls"));
		expect(text()).not.toContain("3 customizations");
		// The error can't be dismissed.
		expect(text()).toContain("Couldn't read your layer");
		expect(buttonNamed("Dismiss: Couldn't read your layer")).toBeUndefined();

		act(() => root.unmount());
		root = createRoot(host);
		render(<MessageSlot scope="t" messages={msgs()} />);
		expect(text()).not.toContain("3 customizations");

		render(<MessageSlot scope="t" messages={msgs("4")} />);
		await click(buttonNamed("+1 more"));
		expect(text()).toContain("4 customizations point at missing controls");
	});

	it("ignores a saved dismissal list it can't read", () => {
		localStorage.setItem("cbs.ui.dismissed.t", JSON.stringify(["orphans"]));
		render(<MessageSlot scope="t" messages={msgs().slice(0, 1)} />);
		expect(text()).toContain("3 customizations");
	});

	it("keeps dismissals per scope and renders nothing when empty", async () => {
		render(<MessageSlot scope="a" messages={msgs().slice(0, 1)} />);
		await click(buttonNamed("Dismiss: 3 customizations point at missing controls"));
		expect(host.textContent).toBe("");
		render(<MessageSlot scope="b" messages={msgs().slice(0, 1)} />);
		expect(text()).toContain("3 customizations");
	});
});

describe("RuleTag", () => {
	it("names rules by the segment that tells them apart", () => {
		expect(ruleShortName("cbstest.account.ExactlyOneSelected.EnableRule")).toBe(
			"ExactlyOneSelected",
		);
		expect(ruleShortName("cbstest.UnifiedInterfaceOnly.DisplayRule")).toBe(
			"UnifiedInterfaceOnly",
		);
		expect(ruleShortName("Mscrm.SelectionCountExactlyOne")).toBe("SelectionCountExactlyOne");
		expect(ruleShortName("EnableRule")).toBe("EnableRule");
	});

	it("opens and unbinds", async () => {
		const onOpen = vi.fn();
		const onRemove = vi.fn();
		render(
			<RuleTag
				ruleId="cbstest.account.ExactlyOneSelected.EnableRule"
				kind="enable"
				onOpen={onOpen}
				onRemove={onRemove}
			/>,
		);
		await click(buttonNamed("ExactlyOneSelected"));
		expect(onOpen).toHaveBeenCalledOnce();
		await click(buttonNamed("Unbind enable rule ExactlyOneSelected"));
		expect(onRemove).toHaveBeenCalledOnce();
	});

	it("has no unbind part when read-only", () => {
		render(<RuleTag ruleId="a.B.DisplayRule" kind="display" onOpen={() => {}} />);
		expect(buttonNamed("Unbind display rule B")).toBeUndefined();
	});
});
