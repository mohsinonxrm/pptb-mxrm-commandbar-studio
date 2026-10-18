/** Start-up never ends on a blank tab (#89). */
import { describe, it, expect, vi, afterEach } from "vitest";
import { CONNECTION_TIMEOUT_MS, THEME_TIMEOUT_MS, connectToHost, renderStartupError } from "@/startup";

const connection = { id: "c1", name: "Dev", url: "https://org.crm.dynamics.com", environment: "Dev" } as ToolBoxAPI.Connection;
const host = (over: Record<string, unknown> = {}) => ({
	dataverseAPI: {},
	toolboxAPI: {
		utils: { getCurrentTheme: vi.fn(async () => "dark") },
		connections: { getActiveConnection: vi.fn(async () => connection) },
		...over,
	} as unknown as Partial<ToolBoxAPI.API>,
});

afterEach(() => vi.useRealTimers());

describe("connectToHost (#89)", () => {
	it("returns the connection and theme", async () => {
		await expect(connectToHost(host())).resolves.toMatchObject({ connection, theme: "dark", warnings: [] });
	});

	it("explains a missing host or an older host without the connection API", async () => {
		await expect(connectToHost({})).rejects.toThrow(/opened from Power Platform ToolBox/);
		await expect(connectToHost(host({ connections: {} }))).rejects.toThrow(/Update Power Platform ToolBox .* to 1\.2\.7 or later/);
	});

	it("starts in the light theme when the host has no theme API or doesn't answer", async () => {
		await expect(connectToHost(host({ utils: {} }))).resolves.toMatchObject({ theme: "light" });
		vi.useFakeTimers();
		const run = connectToHost(host({ utils: { getCurrentTheme: () => new Promise(() => {}) } }));
		await vi.advanceTimersByTimeAsync(THEME_TIMEOUT_MS);
		const r = await run;
		expect(r.theme).toBe("light");
		expect(r.warnings[0]).toMatch(/didn't answer/);
	});

	it("fails with a clear message when the connection never comes, or there is none", async () => {
		vi.useFakeTimers();
		const run = connectToHost(host({ connections: { getActiveConnection: () => new Promise(() => {}) } }));
		const settled = expect(run).rejects.toThrow(/didn't return the active connection/);
		await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT_MS);
		await settled;
		vi.useRealTimers();
		await expect(connectToHost(host({ connections: { getActiveConnection: async () => null } }))).rejects.toThrow(/No active connection/);
	});
});

describe("renderStartupError (#89)", () => {
	it("shows the reason, what to try and a retry button instead of a blank tab", () => {
		const root = document.createElement("div");
		root.textContent = "Loading…";
		renderStartupError(root, new Error("boom"));
		const alert = root.querySelector('[role="alert"]')!;
		expect(alert.textContent).toContain("Command Bar Studio couldn't start");
		expect(alert.textContent).toContain("boom");
		expect(alert.textContent).toContain("1.2.7 or later");
		expect(root.querySelector("button")?.textContent).toBe("Try again");
		expect(root.textContent).not.toContain("Loading…");
	});
});
