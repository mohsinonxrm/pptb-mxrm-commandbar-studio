/**
 * #275: several values packed into a web resource's one `data` parameter, unpacked again when the
 * action opens, and read back by the page whether or not the ribbon encodes the value again.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { DataValuesHelper } from "@/components/shared/DataValuesHelper";
import {
	DATA_PAGE_SNIPPET,
	dataPageSnippet,
	decodeDataValues,
	encodeDataValues,
	findDataParameter,
	withDataValues,
	type DataValue,
} from "@/utils/dataParameter";
import type { ActionParameter } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const ROWS: DataValue[] = [
	{ name: "first", value: "First Value" },
	{ name: "second", value: "a&b=c 50% ü" },
];

/** Runs the page snippet against an address and returns the values it read. */
function readOnPage(search: string): URLSearchParams {
	const run = new Function("location", `${DATA_PAGE_SNIPPET}\nreturn values;`) as (l: {
		search: string;
	}) => URLSearchParams;
	return run({ search });
}

describe("#275 packing values into data", () => {
	it("encodes name=value pairs, then the whole string once more, with no = or & of its own", () => {
		const value = encodeDataValues(ROWS);
		expect(value).not.toMatch(/[=&]/);
		expect(decodeURIComponent(value)).toBe(
			"first=First%20Value&second=a%26b%3Dc%2050%25%20%C3%BC",
		);
	});

	it("decodes back to the same rows", () => {
		expect(decodeDataValues(encodeDataValues(ROWS))).toEqual(ROWS);
		expect(decodeDataValues("")).toEqual([]);
	});

	it("leaves out rows without a name, and gives nothing for no rows", () => {
		expect(decodeDataValues(encodeDataValues([{ name: " ", value: "x" }, ROWS[0]]))).toEqual([
			ROWS[0],
		]);
		expect(encodeDataValues([{ name: "", value: "x" }])).toBe("");
	});

	it("doesn't claim a value it didn't write", () => {
		expect(decodeDataValues("hello")).toBeNull();
		expect(decodeDataValues("a=1&b=2")).toBeNull();
		expect(decodeDataValues("%E0%A4%A")).toBeNull();
	});

	it("the page reads the values whether or not the ribbon encodes data again", () => {
		const value = encodeDataValues(ROWS);
		for (const search of [`?data=${encodeURIComponent(value)}&id=1`, `?data=${value}&id=1`]) {
			const values = readOnPage(search);
			expect(values.get("first")).toBe("First Value");
			expect(values.get("second")).toBe("a&b=c 50% ü");
		}
	});
});

describe("#275 the action's data parameter", () => {
	const named: ActionParameter = {
		kind: "CrmParameter",
		name: "id",
		value: "FirstPrimaryItemId",
	};

	it("is added at the end, updated in place, and removed when no value is left", () => {
		const added = withDataValues([named], ROWS);
		expect(added).toEqual([
			named,
			{ kind: "StringParameter", name: "data", value: encodeDataValues(ROWS) },
		]);
		const updated = withDataValues(added, [ROWS[0]]);
		expect(updated[1]).toEqual({
			kind: "StringParameter",
			name: "data",
			value: encodeDataValues([ROWS[0]]),
		});
		expect(withDataValues(updated, [])).toEqual([named]);
		expect(withDataValues([named], [])).toEqual([named]);
	});

	it("only a parameter named exactly data is used, as the list's check requires (#160)", () => {
		const params: ActionParameter[] = [{ kind: "StringParameter", name: "Data", value: "x" }];
		expect(findDataParameter(params)).toBeNull();
		expect(withDataValues(params, ROWS).map((p) => p.name)).toEqual(["Data", "data"]);
	});

	it("keeps its place, empty, while every row is still unnamed", () => {
		const params = withDataValues([named], ROWS);
		const unnamed = withDataValues(params, [{ name: "", value: "First Value" }]);
		expect(unnamed).toEqual([named, { kind: "StringParameter", name: "data", value: "" }]);
	});
});

describe("#275 review: values the helper didn't write, and odd text", () => {
	it("isn't claimed when it's encoded some other way", () => {
		expect(decodeDataValues("https%3A%2F%2Fx.com%2F%3Fa%3D1")).toBeNull();
		expect(decodeDataValues("%7B%22a%22%3D1%7D")).toBeNull();
		// Microsoft's sample format: pairs encoded once.
		expect(decodeDataValues("first%3DFirst%20Value%26second%3DSecond%20Value")).toBeNull();
	});

	it("+, #, emoji and empty values come back on the page both ways", () => {
		const rows = [
			{ name: "plus", value: "a+b" },
			{ name: "hash", value: "#frag" },
			{ name: "emoji", value: "\u{1F600} \u65E5\u672C" },
			{ name: "my name", value: "" },
		];
		const value = encodeDataValues(rows);
		expect(value).not.toMatch(/[+#=&]/);
		for (const search of [`?data=${encodeURIComponent(value)}`, `?data=${value}`]) {
			const values = readOnPage(search);
			for (const r of rows) expect(values.get(r.name)).toBe(r.value);
		}
	});

	it("half an emoji doesn't break encoding", () => {
		expect(() => encodeDataValues([{ name: "x", value: "\uD83D" }])).not.toThrow();
	});

	it("the page code names the first value", () => {
		expect(dataPageSnippet("ticket")).toContain('values.get("ticket")');
		expect(dataPageSnippet("ticket")).toContain("the ribbon encoded the address once more");
	});
});

describe("#275 the helper", () => {
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
	const render = (params: ActionParameter[], onChange = vi.fn()) => {
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<DataValuesHelper params={params} onChange={onChange} />
				</FluentProvider>,
			),
		);
		return onChange;
	};
	const inputs = () => [...container.querySelectorAll("input")] as HTMLInputElement[];

	it("unpacks the data parameter into rows and shows the page code", () => {
		render([{ kind: "StringParameter", name: "data", value: encodeDataValues(ROWS) }]);
		expect(inputs().map((i) => i.value)).toEqual([
			"first",
			"First Value",
			"second",
			"a&b=c 50% ü",
		]);
		expect(container.querySelector("pre")?.textContent).toBe(DATA_PAGE_SNIPPET);
	});

	it("removing a row writes the rest back", () => {
		const onChange = render([
			{ kind: "StringParameter", name: "data", value: encodeDataValues(ROWS) },
		]);
		const remove = container.querySelector<HTMLButtonElement>('[aria-label="Remove value 1"]')!;
		act(() => remove.click());
		expect(onChange).toHaveBeenCalledWith([
			{ kind: "StringParameter", name: "data", value: encodeDataValues([ROWS[1]]) },
		]);
	});

	it("leaves a data parameter it didn't write alone, and says why", () => {
		render([{ kind: "CrmParameter", name: "data", value: "FirstPrimaryItemId" }]);
		expect(inputs()).toEqual([]);
		expect(container.textContent).toContain("already holds a value of its own");
		render([{ kind: "StringParameter", name: "data", value: "plain" }]);
		expect(container.textContent).toContain("already holds a value of its own");
	});

	it("drops its rows when the data parameter is removed in the list", () => {
		render([{ kind: "StringParameter", name: "data", value: encodeDataValues(ROWS) }]);
		expect(inputs()).toHaveLength(4);
		render([]);
		expect(inputs()).toEqual([]);
	});

	it("says a context value can't go in data", () => {
		render([]);
		expect(container.textContent).toContain("A context value");
		expect(container.querySelector("pre")).toBeNull();
	});
});
