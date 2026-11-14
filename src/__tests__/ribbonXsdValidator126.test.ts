/**
 * #126: xmllint's stderr can hold lines that aren't about the ribbon. In PPTB
 * the .wasm isn't served as application/wasm, so the runtime notes a fallback
 * there; those lines must not become schema warnings.
 */
import { describe, it, expect, vi } from "vitest";
import { xmllintValidator } from "@/services/ribbonXsdCheck";

vi.mock("xmllint-wasm", () => ({
	validateXML: vi.fn(async () => ({
		valid: false,
		normalized: "",
		rawOutput: "",
		errors: [
			{
				rawMessage:
					"wasm streaming compile failed: TypeError: Incorrect response MIME type.",
				message: "TypeError: Incorrect response MIME type.",
				loc: { fileName: "wasm streaming compile failed", lineNumber: NaN },
			},
			{ rawMessage: "falling back to ArrayBuffer instantiation", message: "x", loc: null },
			{
				rawMessage:
					"ribbon.xml:4: element Button: Schemas validity error : Element 'Button' …",
				message: "element Button: Schemas validity error : Element 'Button' …",
				loc: { fileName: "ribbon.xml", lineNumber: 4 },
			},
		],
	})),
}));

describe("#126 xmllint output", () => {
	it("keeps only the errors about the ribbon XML", async () => {
		const result = await xmllintValidator({ xml: "<x/>", schema: "a.xsd", files: {} });
		expect(result).toEqual({
			valid: false,
			errors: [
				{
					message: "element Button: Schemas validity error : Element 'Button' …",
					lineNumber: 4,
				},
			],
		});
	});
});
