import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";

// #34 review — Ctrl+Z / Ctrl+Y in a text field undo the text, not the workspace.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Shortcuts() {
	useKeyboardShortcuts();
	return null;
}

let container: HTMLDivElement;
let root: Root;

const press = (target: EventTarget, key: string, shiftKey = false, code?: string) =>
	act(() => {
		target.dispatchEvent(
			new KeyboardEvent("keydown", {
				key,
				code: code ?? `Key${key.toUpperCase()}`,
				ctrlKey: true,
				shiftKey,
				bubbles: true,
			}),
		);
	});

const labelOf = () => useRibbonStore.getState().locLabels[0]?.titles[0].description;

beforeEach(() => {
	const empty = (location: "HomepageGrid" | "SubGrid" | "Form" | "Application") => ({
		location,
		entityLogicalName: "account",
		tabs: [],
	});
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: empty("HomepageGrid"),
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [],
		enableRules: [],
		displayRules: [],
		locLabels: [{ id: "L", titles: [{ languageCode: 1033, description: "One" }] }],
	});
	useRibbonStore.getState().upsertLocLabel({ id: "L", titles: [{ languageCode: 1033, description: "Two" }] });

	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => root.render(<Shortcuts />));
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("undo / redo shortcuts", () => {
	it("undo and redo the workspace outside text fields", () => {
		press(document.body, "z");
		expect(labelOf()).toBe("One");
		press(document.body, "y");
		expect(labelOf()).toBe("Two");
	});

	// Browsers report the upper-case letter with Shift or Caps Lock (#123).
	it("Ctrl+Shift+Z redoes, as the browser reports it (key \"Z\")", () => {
		press(document.body, "z");
		expect(labelOf()).toBe("One");
		press(document.body, "Z", true);
		expect(labelOf()).toBe("Two");
	});

	it("work with Caps Lock on", () => {
		press(document.body, "Z");
		expect(labelOf()).toBe("One");
		press(document.body, "Y");
		expect(labelOf()).toBe("Two");
		act(() => useUIStore.getState().setCommandPaletteOpen(false));
		press(document.body, "K");
		expect(useUIStore.getState().commandPaletteOpen).toBe(true);
		act(() => useUIStore.getState().setCommandPaletteOpen(false));
	});

	it("work on a non-Latin layout, by the key's position", () => {
		press(document.body, "я", false, "KeyZ");
		expect(labelOf()).toBe("One");
		press(document.body, "Я", true, "KeyZ");
		expect(labelOf()).toBe("Two");
	});

	// AltGr is Ctrl+Alt on Windows: AltGr+S types "ś" on a Polish keyboard (#123 review).
	it("leave AltGr letters alone, and Ctrl+Shift+S / K don't publish or open the palette", () => {
		act(() => useUIStore.setState({ bulkPublishOpen: false, commandPaletteOpen: false }));
		const input = document.createElement("input");
		document.body.append(input);
		const altGr = new KeyboardEvent("keydown", {
			key: "ś",
			code: "KeyS",
			ctrlKey: true,
			altKey: true,
			bubbles: true,
			cancelable: true,
		});
		act(() => void input.dispatchEvent(altGr));
		expect(altGr.defaultPrevented).toBe(false);
		expect(useUIStore.getState().bulkPublishOpen).toBe(false);
		act(() => {
			document.body.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ż", code: "KeyZ", ctrlKey: true, altKey: true, bubbles: true }),
			);
		});
		expect(labelOf()).toBe("Two");
		press(document.body, "S", true);
		press(document.body, "K", true);
		expect(useUIStore.getState().bulkPublishOpen).toBe(false);
		expect(useUIStore.getState().commandPaletteOpen).toBe(false);
		input.remove();
	});

	it("leave the workspace alone in an input, a textarea or the code editor", () => {
		const input = document.createElement("input");
		const textarea = document.createElement("textarea");
		const monaco = document.createElement("div");
		monaco.className = "monaco-editor";
		const inMonaco = document.createElement("span");
		monaco.appendChild(inMonaco);
		document.body.append(input, textarea, monaco);

		for (const target of [input, textarea, inMonaco]) {
			press(target, "z");
			expect(labelOf()).toBe("Two");
		}
		act(() => useRibbonStore.getState().undo());
		for (const target of [input, textarea, inMonaco]) {
			press(target, "y");
			expect(labelOf()).toBe("One");
		}
		input.remove();
		textarea.remove();
		monaco.remove();
	});
});
