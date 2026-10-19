/** A chunk the host fails to serve must not leave a blank tab (#89, VS Code extension). */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RootErrorBoundary } from "@/components/shared/RootErrorBoundary";

afterEach(() => vi.restoreAllMocks());

describe("RootErrorBoundary (#89)", () => {
	it("shows the error screen when a lazy chunk fails to load", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const Broken = lazy(() =>
			Promise.reject(
				new Error("Failed to fetch dynamically imported module: /assets/XmlDrawer.js"),
			),
		);
		const container = document.createElement("div");
		const root = createRoot(container);
		await act(async () => {
			root.render(
				<RootErrorBoundary>
					<Suspense fallback={null}>
						<Broken />
					</Suspense>
				</RootErrorBoundary>,
			);
		});
		const alert = container.querySelector('[role="alert"]');
		expect(alert?.querySelector("h1")?.textContent).toBe("Command Bar Studio stopped working");
		expect(alert?.textContent).toContain("Failed to fetch dynamically imported module");
		expect(alert?.textContent).toContain("Close the Command Bar Studio tab and open the tool again.");
		act(() => root.unmount());
	});

	it("shows the error screen when a child throws on the first render", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const Throws = () => {
			throw new Error("boom");
		};
		const container = document.createElement("div");
		const root = createRoot(container);
		act(() =>
			root.render(
				<RootErrorBoundary>
					<Throws />
				</RootErrorBoundary>,
			),
		);
		expect(container.querySelector('[role="alert"] h1')?.textContent).toBe(
			"Command Bar Studio stopped working",
		);
		expect(container.textContent).toContain("boom");
		act(() => root.unmount());
	});

	it("renders its children when nothing fails", async () => {
		const container = document.createElement("div");
		const root = createRoot(container);
		await act(async () =>
			root.render(
				<RootErrorBoundary>
					<p>ok</p>
				</RootErrorBoundary>,
			),
		);
		expect(container.textContent).toBe("ok");
		act(() => root.unmount());
	});
});
