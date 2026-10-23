/**
 * #122 — copy and save go through the PPTB host first, fall back to the
 * browser, and report failures instead of failing silently.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { copyText, saveTextFile } from "@/utils/hostIO";

const setHost = (api: unknown) =>
	((window as unknown as { toolboxAPI?: unknown }).toolboxAPI = api);
const setClipboard = (writeText?: (t: string) => Promise<void>) =>
	Object.defineProperty(navigator, "clipboard", {
		value: writeText ? { writeText } : undefined,
		configurable: true,
	});

afterEach(() => {
	setHost(undefined);
	setClipboard(undefined);
	vi.restoreAllMocks();
});

describe("copyText", () => {
	it("uses the host's clipboard", async () => {
		const host = vi.fn(async () => {});
		const browser = vi.fn(async () => {});
		setHost({ utils: { copyToClipboard: host } });
		setClipboard(browser);
		expect(await copyText("x")).toEqual({ ok: true });
		expect(host).toHaveBeenCalledWith("x");
		expect(browser).not.toHaveBeenCalled();
	});

	it("falls back to the browser without a host, or when the host fails", async () => {
		const browser = vi.fn(async () => {});
		setClipboard(browser);
		expect(await copyText("a")).toEqual({ ok: true });
		setHost({ utils: { copyToClipboard: vi.fn(async () => Promise.reject(new Error("no"))) } });
		expect(await copyText("b")).toEqual({ ok: true });
		expect(browser).toHaveBeenCalledTimes(2);
	});

	it("reports why when both fail", async () => {
		setHost({
			utils: { copyToClipboard: vi.fn(async () => Promise.reject(new Error("bridge down"))) },
		});
		setClipboard(vi.fn(async () => Promise.reject(new Error("NotAllowedError"))));
		expect(await copyText("x")).toEqual({
			ok: false,
			error: "host: bridge down; browser: NotAllowedError",
		});
		setHost(undefined);
		setClipboard(undefined);
		expect(await copyText("x")).toEqual({ ok: false, error: "no clipboard is available here" });
	});
});

describe("saveTextFile", () => {
	const filters = [{ name: "XML", extensions: ["xml"] }];

	it("uses the host's Save dialog and returns the path; a cancel isn't an error", async () => {
		const saveFile = vi.fn(async () => "C:/out/RibbonDiffXml_Form.xml");
		setHost({ fileSystem: { saveFile } });
		expect(await saveTextFile("RibbonDiffXml_Form.xml", "<x/>", filters)).toEqual({
			ok: true,
			path: "C:/out/RibbonDiffXml_Form.xml",
		});
		expect(saveFile).toHaveBeenCalledWith("RibbonDiffXml_Form.xml", "<x/>", filters);
		saveFile.mockResolvedValueOnce(null as unknown as string);
		expect(await saveTextFile("a.xml", "<x/>")).toEqual({ ok: false, canceled: true });
	});

	it("reports a host failure", async () => {
		setHost({
			fileSystem: { saveFile: vi.fn(async () => Promise.reject(new Error("EACCES"))) },
		});
		expect(await saveTextFile("a.xml", "<x/>")).toEqual({ ok: false, error: "EACCES" });
	});

	it("downloads in a browser without a host, revoking the URL later", async () => {
		vi.useFakeTimers();
		URL.createObjectURL = vi.fn(() => "blob:1");
		URL.revokeObjectURL = vi.fn();
		const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		expect(await saveTextFile("a.xml", "<x/>")).toEqual({ ok: true });
		expect(click).toHaveBeenCalled();
		expect(URL.revokeObjectURL).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
		vi.useRealTimers();
	});
});
