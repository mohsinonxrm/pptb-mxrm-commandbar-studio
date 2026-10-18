/** PPTB prevent-close around imports and publishes (#10). */
import { describe, it, expect, vi, afterEach } from "vitest";
import { withCloseGuard } from "@/utils/pptbRuntime";

type Api = { preventClose?: () => Promise<boolean>; releasePreventClose?: () => Promise<boolean> };
const setApi = (api: Api | undefined) => {
	(window as unknown as { toolboxAPI?: Api }).toolboxAPI = api;
};

afterEach(() => setApi(undefined));

describe("withCloseGuard (#10)", () => {
	it("prevents close while the work runs and releases it afterwards, also on failure", async () => {
		const calls: string[] = [];
		setApi({
			preventClose: vi.fn(async () => (calls.push("prevent"), true)),
			releasePreventClose: vi.fn(async () => (calls.push("release"), true)),
		});
		await expect(withCloseGuard(async () => (calls.push("work"), 42))).resolves.toBe(42);
		await expect(
			withCloseGuard(async () => {
				calls.push("fail");
				throw new Error("import failed");
			}),
		).rejects.toThrow("import failed");
		expect(calls).toEqual(["prevent", "work", "release", "prevent", "fail", "release"]);
	});

	it("nested and parallel runs share one guard", async () => {
		const prevent = vi.fn(async () => true);
		const release = vi.fn(async () => true);
		setApi({ preventClose: prevent, releasePreventClose: release });
		let finish!: () => void;
		const slow = withCloseGuard(() => new Promise<void>((r) => (finish = r)));
		await withCloseGuard(() => withCloseGuard(async () => undefined));
		expect(release).not.toHaveBeenCalled();
		finish();
		await slow;
		expect(prevent).toHaveBeenCalledTimes(1);
		expect(release).toHaveBeenCalledTimes(1);
	});

	it("doesn't wait more than a moment for a host that never answers", async () => {
		vi.useFakeTimers();
		try {
			setApi({ preventClose: () => new Promise<boolean>(() => {}), releasePreventClose: () => new Promise<boolean>(() => {}) });
			const work = vi.fn(async () => "done");
			const run = withCloseGuard(work);
			await vi.advanceTimersByTimeAsync(2000);
			expect(work).toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(2000);
			await expect(run).resolves.toBe("done");
		} finally {
			vi.useRealTimers();
		}
	});

	it("never blocks the work on a host without the API or a failing call", async () => {
		setApi(undefined);
		await expect(withCloseGuard(async () => "ok")).resolves.toBe("ok");
		setApi({
			preventClose: () => {
				throw new Error("not supported");
			},
			releasePreventClose: () => Promise.reject(new Error("nope")),
		});
		await expect(withCloseGuard(async () => "still ok")).resolves.toBe("still ok");
	});
});
