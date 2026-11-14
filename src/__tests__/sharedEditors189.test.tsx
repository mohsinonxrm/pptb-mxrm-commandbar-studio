/**
 * #189 PR 2: the shared editors. Parameter rows have labelled fields, grouped
 * context values and a field message for a missing name; rule steps show
 * friendly option names, spin buttons for numbers and help in InfoLabels; the
 * step picker searches with a SearchBox; provenance actions sit in the bar's
 * actions area.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import CrmParameterEditor from "@/components/shared/CrmParameterEditor";
import RuleStepEditor from "@/components/shared/RuleStepEditor";
import RuleStepPicker from "@/components/shared/RuleStepPicker";
import type { ActionParameter, RuleStep } from "@/types/ribbon";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; Fluent's MessageBar uses it.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;
function render(node: React.ReactNode) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => root!.render(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>));
}
afterEach(() => {
	act(() => root?.unmount());
	container?.remove();
	document.body.innerHTML = "";
});
const labels = () =>
	[...document.querySelectorAll("label")].map((l) => l.textContent?.trim()).filter(Boolean);

describe("#189 parameter rows", () => {
	it("label every field, group the context values, and name a missing query string key", () => {
		let params: ActionParameter[] = [
			{ kind: "CrmParameter", value: "PrimaryControl" },
			{ kind: "BoolParameter", value: false },
		];
		const onChange = vi.fn((p: ActionParameter[]) => (params = p));
		render(<CrmParameterEditor params={params} onChange={onChange} urlMode />);
		expect(labels()).toEqual(expect.arrayContaining(["Type", "Name", "Value"]));
		const [type, value] = [...document.querySelectorAll("select")];
		expect([...type.options].map((o) => o.textContent)).toEqual([
			"From the context",
			"Text",
			"True or false",
			"Whole number",
			"Decimal number",
		]);
		expect([...value.querySelectorAll("optgroup")].map((g) => g.label)).toContain("Record");
		expect(document.body.textContent).toContain("Needs a name: it's the query string key.");
		// No coloured dot with only a title any more.
		expect(document.querySelector("[title]")).toBeNull();

		const toggle = document.querySelector<HTMLInputElement>('input[role="switch"]')!;
		act(() => toggle.click());
		expect(params[1]).toEqual({ kind: "BoolParameter", value: true });
	});
});

describe("#189 rule steps", () => {
	const editor = (step: RuleStep, onChange = vi.fn()) => {
		render(<RuleStepEditor step={step} onChange={onChange} onRemove={() => {}} />);
		return onChange;
	};

	it("show friendly names for the values the XML keeps", () => {
		const onChange = editor({ kind: "FormStateRule", state: "Existing" });
		const select = document.querySelector("select")!;
		expect(select.selectedOptions[0].textContent).toBe("Existing record");
		act(() => {
			select.value = "Create";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(onChange).toHaveBeenCalledWith({ kind: "FormStateRule", state: "Create" });
		expect(
			document.querySelector('button[aria-label="Remove Form state step"]'),
		).not.toBeNull();
		// Help is an InfoLabel, not a hover-only title.
		expect(document.body.textContent).toContain("If it can't be evaluated");
		// The InfoLabel is the field's label, not a label inside it (#189 review).
		expect(document.querySelectorAll("label label")).toHaveLength(0);
		expect(
			[...document.querySelectorAll("label")].filter((l) =>
				l.textContent?.includes("If it can't be evaluated"),
			),
		).toHaveLength(1);
		expect(document.querySelector("[title]")).toBeNull();
	});

	it("counts are spin buttons that keep whole numbers", () => {
		const onChange = editor({ kind: "SelectionCountRule", minimum: 1 });
		const spins = [...document.querySelectorAll<HTMLInputElement>('input[role="spinbutton"]')];
		expect(spins).toHaveLength(2);
		expect(spins[0].value).toBe("1");
		// ArrowUp steps it, as the increment button does on mouse-down.
		act(() => {
			spins[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
		});
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ kind: "SelectionCountRule", minimum: 1, maximum: 1 }),
		);
	});
});

describe("#189 the step picker", () => {
	it("searches with a SearchBox and says when nothing matches", () => {
		const onSelect = vi.fn();
		render(<RuleStepPicker onSelect={onSelect} container="display" />);
		const search = document.querySelector<HTMLInputElement>(
			'input[aria-label="Search steps"]',
		)!;
		const set = (v: string) =>
			act(() => {
				Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
					search,
					v,
				);
				search.dispatchEvent(new Event("input", { bubbles: true }));
			});
		set("table");
		const kinds = [...document.querySelectorAll('[aria-label="Kinds of step"] button')].map(
			(b) => b.textContent,
		);
		expect(kinds).toEqual(expect.arrayContaining(["Table", "Table privilege"]));
		act(() =>
			(
				[...document.querySelectorAll("button")].find(
					(b) => b.textContent === "Table",
				) as HTMLButtonElement
			).click(),
		);
		expect(onSelect).toHaveBeenCalledWith({ kind: "EntityRule" });
		set("zzz");
		expect(document.body.textContent).toContain("No kind of step matches.");
		// The Quick action note is an InfoLabel now, not a paragraph.
		expect(document.body.textContent).not.toContain("should be bound by ID");
	});
});
