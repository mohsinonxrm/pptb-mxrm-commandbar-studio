import { describe, expect, it } from "vitest";
import { fluentIconToSvg } from "@/components/shared/FluentIcon";

describe("fluentIconToSvg (#51)", () => {
	it("serializes a Fluent icon to a standalone SVG file", async () => {
		const svg = await fluentIconToSvg("Add", 20);
		expect(svg).toBeTruthy();
		expect(svg).toMatch(/^<svg /);
		expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(svg).toContain('width="20"');
		expect(svg).toContain('height="20"');
		expect(svg).toContain("<path");
		// CBS-only class names / ARIA have no meaning in a web resource file.
		expect(svg).not.toMatch(/\sclass=/);
		expect(svg).not.toMatch(/aria-hidden|data-fui-icon|font-size/);
		expect(svg).toContain('viewBox="0 0 20 20"');
		expect(svg).toContain('fill="currentColor"');
		const doc = new DOMParser().parseFromString(svg!, "image/svg+xml");
		expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
	});

	it("renders the filled variant differently from the regular one", async () => {
		const regular = await fluentIconToSvg("Star", 20, "regular");
		const filled = await fluentIconToSvg("Star", 20, "filled");
		expect(regular).toBeTruthy();
		expect(filled).toBeTruthy();
		expect(filled).not.toBe(regular);
	});

	it("returns null for an unknown icon", async () => {
		expect(await fluentIconToSvg("NotARealIcon")).toBeNull();
	});
});
