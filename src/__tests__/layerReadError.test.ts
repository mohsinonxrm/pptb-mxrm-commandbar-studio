/**
 * #110 — a layer read that fails no longer passes silently: the workspace
 * still loads and says which layer wasn't read; a ribbon response without its
 * compressed XML fails with a clear error.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
	APPLICATION_RIBBON_CACHE_MS,
	fetchRibbonWorkspace,
	invalidateApplicationRibbonCache,
} from "@/services/dataverse/ribbonService";
import { useSessionStore } from "@/store/sessionStore";
import { emptyRibbonDiffParts, type RibbonDiffParts } from "@/services/ribbonDiffMerge";

// ribbonService reads window.dataverseAPI when it loads: install one that
// forwards to each test's handlers first.
const api = vi.hoisted(() => {
	const handlers: {
		queryData: (q: string) => Promise<unknown>;
		execute: (req: unknown) => Promise<unknown>;
	} = {
		queryData: async () => ({}),
		execute: async () => ({}),
	};
	(window as unknown as { dataverseAPI: unknown }).dataverseAPI = {
		queryData: (q: string) => handlers.queryData(q),
		execute: (req: unknown) => handlers.execute(req),
	};
	return handlers;
});

const T = "cbstest_ribbontest";
const layerResult: { entity: RibbonDiffParts | Error; app: RibbonDiffParts | Error } = {
	entity: emptyRibbonDiffParts(),
	app: emptyRibbonDiffParts(),
};
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchUnmanagedRibbonParts: vi.fn(async (entity: string | null) => {
		const r = entity ? layerResult.entity : layerResult.app;
		if (r instanceof Error) throw r;
		return r;
	}),
}));

const MERGED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="Mscrm.HomepageGrid.${T}.MainTab" Command="Mscrm.HomepageGrid.${T}.MainTab" Sequence="10"><Groups Id="g">
    <Group Id="Mscrm.HomepageGrid.${T}.MainTab.Management" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="c">
      <Button Id="cbs.Go" Command="cbs.Go.Command" Sequence="900" LabelText="Go" TemplateAlias="o1" />
    </Controls></Group>
  </Groups></Tab>
</Tabs></Ribbon></UI><CommandDefinitions/><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`;
const APP = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs/></Ribbon></UI><CommandDefinitions/><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`;

function zipped(xml: string) {
	let b = "";
	for (const c of zipSync({ "RibbonXml.xml": strToU8(xml) })) b += String.fromCharCode(c);
	return btoa(b);
}

let entityResponse: unknown;
let appResponse: unknown;

beforeEach(() => {
	invalidateApplicationRibbonCache();
	useSessionStore.setState({ connectionUrl: "https://org-a.crm.dynamics.com" });
	layerResult.entity = emptyRibbonDiffParts();
	layerResult.app = emptyRibbonDiffParts();
	entityResponse = { CompressedEntityXml: zipped(MERGED) };
	appResponse = { CompressedApplicationRibbonXml: zipped(APP) };
	api.queryData = async (q: string) => {
		if (q.startsWith("organizations")) return { value: [{ languagecode: 1033 }] };
		if (q.startsWith("RetrieveEntityRibbon(")) return entityResponse;
		throw new Error(`unexpected query ${q}`);
	};
	api.execute = async () => appResponse;
});

describe("#110 layer read errors", () => {
	it("both layers read: no error", async () => {
		const ws = await fetchRibbonWorkspace(T);
		expect(ws.layerReadError).toBeUndefined();
		expect(ws.ribbons.HomepageGrid.tabs).toHaveLength(1);
	});

	it("the table's layer can't be read: the ribbon loads and the error says which layer and why", async () => {
		layerResult.entity = new Error("503 Service Unavailable");
		const ws = await fetchRibbonWorkspace(T);
		expect(ws.ribbons.HomepageGrid.tabs).toHaveLength(1);
		expect(ws.layerReadError).toBe(`the ${T} table's customizations: 503 Service Unavailable`);
	});

	it("both layers fail: both are named", async () => {
		layerResult.entity = new Error("timeout");
		layerResult.app = new Error("401");
		const ws = await fetchRibbonWorkspace(T);
		expect(ws.layerReadError).toContain(`the ${T} table's customizations: timeout`);
		expect(ws.layerReadError).toContain("the application ribbon's customizations: 401");
	});

	it("RetrieveEntityRibbon without CompressedEntityXml fails clearly", async () => {
		entityResponse = {};
		await expect(fetchRibbonWorkspace(T)).rejects.toThrow(
			`Dataverse returned no ribbon for ${T}`,
		);
	});

	it("RetrieveApplicationRibbon without CompressedApplicationRibbonXml fails clearly", async () => {
		appResponse = { CompressedApplicationRibbonXml: "" };
		await expect(fetchRibbonWorkspace(T)).rejects.toThrow(
			"Dataverse returned no application ribbon",
		);
	});
});

describe("#4 the application ribbon is reused for a few minutes", () => {
	it("a table switch reuses it; a different environment, a clear or the time limit reads it again", async () => {
		let calls = 0;
		api.execute = async () => {
			calls++;
			return appResponse;
		};
		await fetchRibbonWorkspace(T);
		await fetchRibbonWorkspace(T);
		expect(calls).toBe(1);

		useSessionStore.setState({ connectionUrl: "https://org-b.crm.dynamics.com" });
		await fetchRibbonWorkspace(T);
		expect(calls).toBe(2);

		invalidateApplicationRibbonCache();
		await fetchRibbonWorkspace(T);
		expect(calls).toBe(3);

		const now = Date.now();
		const spy = vi.spyOn(Date, "now").mockReturnValue(now + APPLICATION_RIBBON_CACHE_MS + 1);
		await fetchRibbonWorkspace(T);
		expect(calls).toBe(4);
		spy.mockRestore();
	});
});

describe("#4 the load reports its steps", () => {
	it("in order", async () => {
		const steps: string[] = [];
		await fetchRibbonWorkspace(T, (s) => steps.push(s));
		expect(steps).toEqual([
			"Reading your customizations…",
			"Reading the table's ribbon and the application ribbon…",
			"Matching labels and ownership…",
		]);
	});
});
