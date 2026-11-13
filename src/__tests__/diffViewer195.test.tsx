/**
 * #195 review: Compare with published says "No changes" only when nothing is
 * pending — a changed command or rule leaves the generated XML the same — and
 * "Show the full XML anyway" lasts for one opening. Both sides repaint when
 * their XML tokens arrive, so the diff isn't left uncoloured.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { CompareView } from "@/components/panels/CompareView";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";

/**
 * A diff editor whose two sides report token changes like Monaco's. Each mount
 * has its own models. Unmounting disposes them unless asked to keep them, then
 * the editor, as @monaco-editor/react 4.7 does; a model disposed while its editor
 * still holds it throws, as Monaco does (#266).
 */
const fake = vi.hoisted(() => {
	const side = () => {
		const listeners: (() => void)[] = [];
		const disposeHandlers: (() => void)[] = [];
		return {
			listeners,
			disposeHandlers,
			onDidDispose: (fn: () => void) => void disposeHandlers.push(fn),
			render: (() => {}) as (force?: boolean) => void,
			onDidChangeModelTokens: (fn: () => void) => {
				listeners.push(fn);
				return { dispose: () => listeners.splice(listeners.indexOf(fn), 1) };
			},
		};
	};
	const state = { disposed: [] as string[] };
	const models = (editor: { disposed: boolean }) => {
		const model = (name: string) => ({
			dispose: () => {
				if (!editor.disposed)
					throw new Error(
						"TextModel got disposed before DiffEditorWidget model got reset",
					);
				state.disposed.push(name);
			},
		});
		return { original: model("original"), modified: model("modified") };
	};
	return { original: side(), modified: side(), state, models };
});
// Monaco itself doesn't run in jsdom; CompareView loads its setup first (#118)
vi.mock("@/utils/monacoSetup", () => ({}));
vi.mock("@monaco-editor/react", async () => {
	const { useEffect } = await import("react");
	return {
		DiffEditor: ({
			onMount,
			keepCurrentOriginalModel,
			keepCurrentModifiedModel,
		}: {
			onMount?: (editor: unknown) => void;
			keepCurrentOriginalModel?: boolean;
			keepCurrentModifiedModel?: boolean;
		}) => {
			useEffect(() => {
				const editor = { disposed: false };
				const models = fake.models(editor);
				onMount?.({
					updateOptions: () => {},
					getModel: () => models,
					getOriginalEditor: () => fake.original,
					getModifiedEditor: () => fake.modified,
					// Monaco 0.57's diff editor never fires its own onDidDispose (#266)
					onDidDispose: () => ({ dispose: () => {} }),
				});
				return () => {
					if (!keepCurrentOriginalModel) models.original.dispose();
					if (!keepCurrentModifiedModel) models.modified.dispose();
					// Disposing the diff editor disposes its two code editors
					for (const side of [fake.original, fake.modified])
						side.disposeHandlers.splice(0).forEach((fn) => fn());
					editor.disposed = true;
				};
			}, [onMount, keepCurrentOriginalModel, keepCurrentModifiedModel]);
			return <div>DIFF EDITOR</div>;
		},
	};
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

/** The view while Compare is open, as the editor drawer shows it (#186). */
function Host() {
	const open = useUIStore((s) => s.diffViewerOpen);
	return open ? <CompareView /> : null;
}

let container: HTMLDivElement;
let root: Root;
const initialUI = useUIStore.getState();
const initialRibbon = useRibbonStore.getState();
const body = () => document.body.textContent ?? "";
const byName = (name: string) =>
	[...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useUIStore.setState(initialUI, true);
	useRibbonStore.setState(initialRibbon, true);
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<Host />
			</FluentProvider>,
		),
	);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#195 Compare with published", () => {
	it("says there are no changes when nothing is pending, until asked once", async () => {
		act(() => useUIStore.getState().openDiffViewer("compare"));
		expect(body()).toContain("No changes since the last publish");
		await act(async () => byName("Show the full XML anyway")!.click());
		expect(body()).not.toContain("No changes since the last publish");

		act(() => useUIStore.getState().closeDiffViewer());
		act(() => useUIStore.getState().openDiffViewer("compare"));
		expect(body()).toContain("No changes since the last publish");
	});

	it("repaints both sides once when their XML tokens arrive, and stops on dispose", async () => {
		// Earlier tests mount the editor too; start from a clean fake.
		fake.original.listeners.length = 0;
		fake.modified.listeners.length = 0;
		fake.modified.disposeHandlers.length = 0;
		const renders = { original: 0, modified: 0 };
		fake.original.render = () => void renders.original++;
		fake.modified.render = () => void renders.modified++;
		act(() => useRibbonStore.setState({ commands: [{ id: "x" }] as never }));
		act(() => useUIStore.getState().openDiffViewer("compare"));
		await act(async () => {
			await Promise.resolve();
		});
		expect(fake.modified.listeners).toHaveLength(1);
		// A burst of token events (both sides) is one repaint per side.
		act(() => {
			fake.original.listeners.forEach((fn) => fn());
			fake.modified.listeners.forEach((fn) => fn());
			fake.modified.listeners.forEach((fn) => fn());
		});
		await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
		expect(renders).toEqual({ original: 1, modified: 1 });
		fake.modified.disposeHandlers.forEach((fn) => fn());
		expect(fake.original.listeners).toHaveLength(0);
		expect(fake.modified.listeners).toHaveLength(0);
	});

	it("closes without disposing the models before the diff editor (#266)", async () => {
		// Earlier tests' editors dispose their models on the next tick
		await act(() => new Promise((r) => setTimeout(r)));
		fake.state.disposed.length = 0;
		act(() => useRibbonStore.setState({ commands: [{ id: "x" }] as never }));
		act(() => useUIStore.getState().openDiffViewer("compare"));
		await act(async () => {
			await Promise.resolve();
		});
		expect(() => act(() => useUIStore.getState().closeDiffViewer())).not.toThrow();
		expect(fake.state.disposed).toEqual([]);
		await act(() => new Promise((r) => setTimeout(r)));
		expect(fake.state.disposed).toEqual(["original", "modified"]);
	});

	it("shows the diff when a command changed, though the ribbon didn't", () => {
		act(() =>
			useRibbonStore.setState({
				commands: [{ id: "cbs.account.Run.Command" }] as never,
				mutationsSincePublish: 0,
			}),
		);
		act(() => useUIStore.getState().openDiffViewer("compare"));
		expect(body()).not.toContain("No changes since the last publish");
	});
});
