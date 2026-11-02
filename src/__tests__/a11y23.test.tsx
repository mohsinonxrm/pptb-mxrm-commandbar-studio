/**
 * #23: the pane resize handles work from the keyboard and report their size,
 * and dragging one doesn't write localStorage on every pointer move.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { ResizableHandle } from "@/components/shared/ResizableHandle";
import { throttledStorage } from "@/utils/throttledStorage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ResizableHandle", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	const render = (direction: "vertical" | "horizontal", onResize: (d: number) => void) => {
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<ResizableHandle
						direction={direction}
						onResize={onResize}
						value={260.4}
						min={160}
						max={500}
						aria-label="Resize left pane"
					/>
				</FluentProvider>,
			),
		);
		return container.querySelector<HTMLElement>('[role="separator"]')!;
	};

	const press = (el: HTMLElement, key: string, shiftKey = false) =>
		act(() => {
			el.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
		});

	it("is a focusable separator with its size and limits", () => {
		const handle = render("vertical", () => {});
		expect(handle.tabIndex).toBe(0);
		expect(handle.getAttribute("aria-label")).toBe("Resize left pane");
		expect(handle.getAttribute("aria-orientation")).toBe("vertical");
		expect(handle.getAttribute("aria-valuenow")).toBe("260");
		expect(handle.getAttribute("aria-valuemin")).toBe("160");
		expect(handle.getAttribute("aria-valuemax")).toBe("500");
		expect(handle.getAttribute("aria-valuetext")).toBe("260 pixels");
	});

	it("moves a vertical handle with Left and Right, further with Shift", () => {
		const onResize = vi.fn();
		const handle = render("vertical", onResize);
		press(handle, "ArrowRight");
		press(handle, "ArrowLeft");
		press(handle, "ArrowRight", true);
		press(handle, "ArrowUp");
		expect(onResize.mock.calls.map(([d]) => d)).toEqual([16, -16, 64]);
	});

	it("moves a horizontal handle with Up and Down", () => {
		const onResize = vi.fn();
		const handle = render("horizontal", onResize);
		press(handle, "ArrowUp");
		press(handle, "ArrowDown", true);
		press(handle, "ArrowLeft");
		expect(onResize.mock.calls.map(([d]) => d)).toEqual([-16, 64]);
	});
});

describe("throttledStorage", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	const fakeStorage = () => {
		const data = new Map<string, string>();
		return {
			data,
			storage: {
				getItem: (k: string) => data.get(k) ?? null,
				setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
				removeItem: (k: string) => void data.delete(k),
			} as unknown as Storage & { setItem: ReturnType<typeof vi.fn> },
		};
	};

	it("writes the newest value once per delay, and reads a pending write", () => {
		const { data, storage } = fakeStorage();
		const s = throttledStorage(() => storage, 250);
		for (let w = 200; w < 260; w++) s.setItem("cbs:ui", String(w));
		expect(storage.setItem).not.toHaveBeenCalled();
		expect(s.getItem("cbs:ui")).toBe("259");
		vi.advanceTimersByTime(250);
		expect(storage.setItem).toHaveBeenCalledTimes(1);
		expect(data.get("cbs:ui")).toBe("259");
	});

	it("writes at once when the page is hidden", () => {
		const { data, storage } = fakeStorage();
		const s = throttledStorage(() => storage, 250);
		s.setItem("cbs:ui", "300");
		window.dispatchEvent(new Event("pagehide"));
		expect(data.get("cbs:ui")).toBe("300");
		vi.advanceTimersByTime(250);
		expect(storage.setItem).toHaveBeenCalledTimes(1);
	});

	it("drops a pending write when the key is removed", () => {
		const { data, storage } = fakeStorage();
		const s = throttledStorage(() => storage, 250);
		s.setItem("cbs:ui", "300");
		s.removeItem("cbs:ui");
		vi.advanceTimersByTime(250);
		expect(data.has("cbs:ui")).toBe(false);
		expect(s.getItem("cbs:ui")).toBeNull();
	});
});
