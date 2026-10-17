import { describe, expect, it, vi } from "vitest";
import { ensureFluentIconWebResource } from "@/services/iconWebResource";
import { fluentIconWebResourceName, toBase64Utf8, toSnakeCase } from "@/utils/iconWebResourceName";

const decode = (b64: string) =>
	new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

describe("fluentIconWebResourceName", () => {
	it("names the icon under <prefix>_/icons/cbs/", () => {
		expect(fluentIconWebResourceName("cbstest", "Add")).toBe("cbstest_/icons/cbs/add.svg");
		expect(fluentIconWebResourceName("cbstest", "CreditCard")).toBe(
			"cbstest_/icons/cbs/credit_card.svg",
		);
	});

	it("keeps filled icons apart from regular ones", () => {
		expect(fluentIconWebResourceName("cbstest", "Add", "filled")).toBe(
			"cbstest_/icons/cbs/add_filled.svg",
		);
	});

	it("tolerates a trailing underscore and rejects an empty prefix", () => {
		expect(fluentIconWebResourceName("cbstest_", "Add")).toBe("cbstest_/icons/cbs/add.svg");
		expect(() => fluentIconWebResourceName("  ", "Add")).toThrow(/publisher prefix/);
	});

	it("snake-cases PascalCase names", () => {
		expect(toSnakeCase("ArrowDownload")).toBe("arrow_download");
	});

	it("base64-encodes UTF-8", () => {
		expect(decode(toBase64Utf8("<svg>é</svg>"))).toBe("<svg>é</svg>");
	});
});

describe("ensureFluentIconWebResource", () => {
	const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
	const setup = (created: boolean) => ({
		toSvg: vi.fn(async (): Promise<string | null> => SVG),
		deps: {
			save: vi.fn(async () => ({
				id: "wr-1",
				created,
				updated: false,
				solutionUniqueName: "CBSLiveTest",
			})),
			publish: vi.fn(async () => undefined),
		},
	});

	it("uploads the SVG without overwriting an existing web resource, then publishes a new one", async () => {
		const { toSvg, deps } = setup(true);
		const res = await ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps);
		expect(res).toEqual({ name: "cbstest_/icons/cbs/add.svg", id: "wr-1", created: true });
		expect(toSvg).toHaveBeenCalledWith("Add", 20, "regular");
		expect(deps.save).toHaveBeenCalledWith(
			"cbstest_/icons/cbs/add.svg",
			toBase64Utf8(SVG),
			11,
			expect.objectContaining({ keepExisting: true }),
		);
		expect(deps.publish).toHaveBeenCalledWith("wr-1");
	});

	it("reuses an existing web resource without republishing it", async () => {
		const { toSvg, deps } = setup(false);
		const res = await ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps);
		expect(res.created).toBe(false);
		expect(deps.publish).not.toHaveBeenCalled();
	});

	it("serializes the chosen variant and treats a publish failure as non-fatal", async () => {
		const { toSvg, deps } = setup(true);
		deps.publish.mockRejectedValueOnce(new Error("busy"));
		const res = await ensureFluentIconWebResource("Add", "filled", "cbstest", toSvg, deps);
		expect(toSvg).toHaveBeenCalledWith("Add", 20, "filled");
		expect(res.name).toBe("cbstest_/icons/cbs/add_filled.svg");
		expect(res.publishError).toBe("busy");
	});

	it("fails before uploading when the icon cannot be serialized", async () => {
		const { toSvg, deps } = setup(true);
		toSvg.mockResolvedValueOnce(null);
		await expect(
			ensureFluentIconWebResource("Nope", "regular", "cbstest", toSvg, deps),
		).rejects.toThrow(/Nope/);
		expect(deps.save).not.toHaveBeenCalled();
	});
});
