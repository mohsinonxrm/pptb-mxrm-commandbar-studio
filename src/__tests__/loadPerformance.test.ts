/**
 * #151 / #4: table loads no longer wait on per-component layer queries that
 * returned nothing, and a solution's tables are read 40 per request.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchRibbonProvenance } from "@/services/dataverse/ribbonProvenanceService";
import { fetchEntitiesByMetadataIds } from "@/services/dataverse/entityService";
import {
	applyButtonOrigin,
	applyProvenanceToRibbons,
	type ButtonProvenance,
} from "@/utils/ribbonProvenance";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

let queries: string[];
let handler: (q: string) => unknown;
beforeEach(() => {
	queries = [];
	(window as unknown as { dataverseAPI: unknown }).dataverseAPI = {
		queryData: vi.fn(async (q: string) => {
			queries.push(q);
			return handler(q);
		}),
	};
});
afterEach(() => {
	delete (window as unknown as { dataverseAPI?: unknown }).dataverseAPI;
});

const SALES = "11111111-1111-1111-1111-111111111111";
const SYSTEM = "fd140aad-4df4-11dd-bd17-0019b9312238";
const ca = (inner: string) =>
	`<CustomAction Id="x" Location="L._children"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;

describe("#151 provenance from the managed ribbondiffs", () => {
	it("one query for the CustomActions and one for solution names; System's controls are left out", async () => {
		handler = (q) => {
			if (q.startsWith("ribbondiffs")) {
				return {
					value: [
						{
							solutionid: SALES,
							rdx: ca(
								'<FlyoutAnchor Id="msdyn.Fly"><Menu Id="msdyn.Fly.Menu"><MenuSection Id="S"><Controls Id="C"><Button Id="msdyn.Fly.Item"/></Controls></MenuSection></Menu></FlyoutAnchor>',
							),
						},
						{ solutionid: SYSTEM, rdx: ca('<Button Id="Mscrm.Platform"/>') },
					],
				};
			}
			if (q.startsWith("solutions")) {
				return {
					value: [
						{
							solutionid: SALES,
							uniquename: "msdynce_Sales",
							publisherid: { friendlyname: "Microsoft" },
						},
						{
							solutionid: SYSTEM,
							uniquename: "System",
							publisherid: { friendlyname: "Microsoft" },
						},
					],
				};
			}
			throw new Error(`unexpected ${q}`);
		};
		const map = await fetchRibbonProvenance("account");
		expect(queries).toHaveLength(2);
		expect(queries[0]).toContain("ribbondiffs?$select=rdx,solutionid");
		expect(queries[0]).toContain(
			"(entity eq 'account' or entity eq null) and ismanaged eq true and difftype le 1",
		);
		expect(queries.some((q) => q.startsWith("msdyn_componentlayers"))).toBe(false);
		expect(map.get("msdyn.Fly")).toEqual({
			origin: "managed",
			solutionName: "msdynce_Sales",
			publisherName: "Microsoft",
		});
		// Controls written inside it are named too.
		expect(map.get("msdyn.Fly.Item")?.solutionName).toBe("msdynce_Sales");
		expect(map.has("Mscrm.Platform")).toBe(false);
	});

	it("application-ribbon ids with {!EntityLogicalName} match the table's resolved ids", async () => {
		handler = (q) => {
			if (q.startsWith("ribbondiffs")) {
				return {
					value: [
						{
							solutionid: SALES,
							rdx: ca('<FlyoutAnchor Id="AIBuilder.{!EntityLogicalName}.Flyout"/>'),
						},
					],
				};
			}
			if (q.startsWith("solutions"))
				return { value: [{ solutionid: SALES, uniquename: "msdynce_Sales" }] };
			throw new Error(`unexpected ${q}`);
		};
		const map = await fetchRibbonProvenance("account");
		expect(map.get("AIBuilder.account.Flyout")?.solutionName).toBe("msdynce_Sales");
		// The application ribbon keeps the token.
		expect(map.get("AIBuilder.{!EntityLogicalName}.Flyout")?.solutionName).toBe(
			"msdynce_Sales",
		);
	});

	it("a control System adds and another managed solution redefines is that solution's", async () => {
		handler = (q) => {
			if (q.startsWith("ribbondiffs")) {
				return {
					value: [
						{ solutionid: SYSTEM, rdx: ca('<Button Id="Shared.Btn"/>') },
						{ solutionid: SALES, rdx: ca('<Button Id="Shared.Btn"/>') },
					],
				};
			}
			if (q.startsWith("solutions")) return { value: [] };
			throw new Error(`unexpected ${q}`);
		};
		// Both solutions were looked up by the first test.
		const map = await fetchRibbonProvenance("account");
		expect(map.get("Shared.Btn")?.solutionName).toBe("msdynce_Sales");
	});

	it("a failed read leaves the classification as it was", async () => {
		handler = () => {
			throw new Error("503");
		};
		expect((await fetchRibbonProvenance("account")).size).toBe(0);
	});
});

describe("#151 the overlay never relabels your controls or out-of-the-box ones", () => {
	const button = (id: string, origin: NonNullable<RibbonButton["origin"]>): RibbonButton => {
		const b = {
			id,
			label: id,
			kind: "button",
			sequence: 1,
			templateAlias: "o1",
			commandId: "",
			hidden: false,
			oob: false,
			custom: false,
			managed: false,
		} as RibbonButton;
		applyButtonOrigin(b, { origin });
		return b;
	};
	it("names managed and unresolved controls only", () => {
		const managed = button("msdyn.Managed", "managed");
		const guess = button("isv.Guess", "unmanaged");
		const mine = button("cbs.Mine", "unmanaged");
		const oob = button("Mscrm.Marketing.AddToList", "oob");
		const def = (location: RibbonLocation): RibbonDefinition => ({
			location,
			entityLogicalName: "account",
			tabs: [],
		});
		const ribbons = {
			HomepageGrid: {
				...def("HomepageGrid"),
				tabs: [
					{
						id: "T",
						label: "T",
						sequence: 1,
						tabDisplayRules: [],
						groups: [
							{
								id: "G",
								label: "G",
								sequence: 1,
								template: "",
								buttons: [managed, guess, mine, oob],
							},
						],
					},
				],
			},
			SubGrid: def("SubGrid"),
			Form: def("Form"),
			Application: def("Application"),
		};
		const p: ButtonProvenance = {
			origin: "managed",
			solutionName: "msdynce_Sales",
			publisherName: "Microsoft",
		};
		const map = new Map([managed, guess, mine, oob].map((b) => [b.id, p]));
		applyProvenanceToRibbons(ribbons, map, new Set(["cbs.Mine"]));
		expect(managed.solutionName).toBe("msdynce_Sales");
		expect(guess.origin).toBe("managed");
		expect(mine.origin).toBe("unmanaged");
		expect(oob.origin).toBe("oob");
		expect(oob.solutionName).toBeUndefined();
	});
});

describe("#4 a solution's tables are read 40 per request", () => {
	const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
	const row = (mid: string, i: number) => ({
		MetadataId: mid,
		LogicalName: `t${i}`,
		DisplayName: { UserLocalizedLabel: { Label: `Table ${i}` } },
		IsCustomEntity: true,
		IsIntersect: false,
	});

	it("85 tables take 3 requests", async () => {
		const ids = Array.from({ length: 85 }, (_, i) => id(i));
		handler = (q) => ({ value: ids.filter((m) => q.includes(m)).map((m, i) => row(m, i)) });
		const tables = await fetchEntitiesByMetadataIds(ids);
		expect(queries).toHaveLength(3);
		expect(
			queries.every(
				(q) => q.startsWith("EntityDefinitions?$select=") && q.includes("MetadataId eq"),
			),
		).toBe(true);
		expect(tables).toHaveLength(85);
	});

	it("a chunk that fails is read table by table", async () => {
		const ids = [id(1), id(2)];
		handler = (q) => {
			if (q.includes("$filter")) throw new Error("400");
			const m = ids.find((x) => q.includes(x))!;
			return row(m, ids.indexOf(m));
		};
		let inFlight = 0;
		let most = 0;
		const inner = handler;
		handler = async (q) => {
			inFlight++;
			most = Math.max(most, inFlight);
			await Promise.resolve();
			inFlight--;
			return inner(q);
		};
		const tables = await fetchEntitiesByMetadataIds(ids);
		expect(tables.map((t) => t.metadataId)).toEqual(ids);
		// One at a time, in case the chunk failed because of throttling.
		expect(most).toBe(1);
		expect(queries.filter((q) => q.startsWith("EntityDefinitions("))).toHaveLength(2);
	});
});
