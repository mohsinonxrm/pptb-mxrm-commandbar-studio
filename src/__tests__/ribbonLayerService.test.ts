import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchUnmanagedRibbonParts } from "@/services/dataverse/ribbonLayerService";

describe("fetchUnmanagedRibbonParts", () => {
	const queries: string[] = [];

	beforeEach(() => {
		queries.length = 0;
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = {
			queryData: vi.fn(async (q: string) => {
				queries.push(q);
				if (q.startsWith("ribbondiffs") && !q.includes("skiptoken"))
					return {
						value: [
							{
								diffid: "a.LabelText",
								difftype: 3,
								rdx: '<LocLabel Id="a.LabelText"><Titles><Title languagecode="1033" description="A"/></Titles></LocLabel>',
							},
						],
						"@odata.nextLink": "https://org.crm.dynamics.com/api/data/v9.2/ribbondiffs?$skiptoken=2",
					};
				if (q.startsWith("ribbondiffs"))
					return {
						value: [
							{
								diffid: "a.CustomAction",
								difftype: 0,
								rdx: '<CustomAction Id="a.CustomAction" Location="X._children"><CommandUIDefinition><Button Id="a"/></CommandUIDefinition></CustomAction>',
							},
						],
					};
				return { value: [] };
			}),
		};
	});

	it("never orders by a picklist column (Dataverse rejects it with 0x80040250)", async () => {
		await fetchUnmanagedRibbonParts("contact");
		for (const q of queries) {
			const orderby = /\$orderby=([^&]*)/.exec(q)?.[1] ?? "";
			expect(orderby).not.toMatch(/difftype|ruletype/);
		}
	});

	it("follows nextLink and filters the application ribbon with entity eq null", async () => {
		const parts = await fetchUnmanagedRibbonParts(null);
		expect(queries[0]).toContain("entity eq null and ismanaged eq false");
		expect(queries).toContain("ribbondiffs?$skiptoken=2");
		expect(parts.locLabels.has("a.LabelText")).toBe(true);
		expect(parts.customActions.size).toBe(1);
	});
});
