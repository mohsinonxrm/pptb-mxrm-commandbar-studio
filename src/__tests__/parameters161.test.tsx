/**
 * #161: the CrmParameter picker says what each value passes, marks the deprecated type codes,
 * and shows a loaded value it doesn't list as itself instead of the first option.
 */
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import CrmParameterEditor from "@/components/shared/CrmParameterEditor";
import { CRM_PARAMETER_VALUES, crmParameterDescription } from "@/constants/crmParameters";
import type { ActionParameter } from "@/types/ribbon";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;
function render(params: ActionParameter[], urlMode = false) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() =>
		root!.render(
			<FluentProvider theme={webLightTheme}>
				<CrmParameterEditor params={params} onChange={() => {}} urlMode={urlMode} />
			</FluentProvider>,
		),
	);
}
afterEach(() => {
	act(() => root?.unmount());
	container?.remove();
	document.body.innerHTML = "";
});
const valueSelect = () => [...document.querySelectorAll("select")].at(-1)!;

describe("#161 the CrmParameter picker", () => {
	it("says what the value passes", () => {
		render([{ kind: "CrmParameter", value: "FirstPrimaryItemId" }]);
		expect(document.body.textContent).toContain(
			"The id of the record being viewed. Empty on a main grid",
		);
	});

	it("marks the deprecated type codes and warns when one is used", () => {
		render([{ kind: "CrmParameter", value: "PrimaryEntityTypeCode" }]);
		const texts = [...valueSelect().options].map((o) => o.textContent);
		expect(texts).toContain("PrimaryEntityTypeCode (deprecated)");
		expect(texts).toContain("SelectedEntityTypeCode (deprecated)");
		expect(document.body.textContent).toContain("Deprecated: use PrimaryEntityTypeName.");
	});

	it("shows a value it doesn't list as itself", () => {
		render([{ kind: "CrmParameter", value: "SomethingNew" as never }]);
		expect(valueSelect().value).toBe("SomethingNew");
		expect(document.body.textContent).toContain("A value CBS doesn't list, kept as loaded.");
	});

	it("shows a value a Url can't take as itself, not as the first option", () => {
		render(
			[
				{
					kind: "CrmParameter",
					name: "refs",
					value: "SelectedControlSelectedItemReferences",
				},
			],
			true,
		);
		expect(valueSelect().value).toBe("SelectedControlSelectedItemReferences");
	});

	it("every value has a description", () => {
		for (const p of CRM_PARAMETER_VALUES) expect(crmParameterDescription(p.value)).toBeTruthy();
	});
});
