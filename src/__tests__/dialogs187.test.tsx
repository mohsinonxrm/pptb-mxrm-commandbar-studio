/**
 * #187: the Hide dialog explains its two ways without jargon and defaults to
 * display rules only when nothing else uses the command (decided on #193); New
 * group offers the platform's templates, as Change template does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { HideOobWarningModal } from "@/components/modals/HideOobWarningModal";
import { NewGroupModal } from "@/components/modals/NewGroupModal";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIN = "Mscrm.HomepageGrid.contact.MainTab";
const btn = (id: string, label: string, commandId: string): RibbonButton =>
	({
		id,
		label,
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId,
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
		origin: "oob",
	}) as RibbonButton;
const ribbon = (location: RibbonLocation, buttons: RibbonButton[] = []): RibbonDefinition => ({
	location,
	entityLogicalName: "contact",
	tabs: buttons.length
		? [
				{
					id: MAIN,
					label: "Contacts",
					sequence: 10,
					tabDisplayRules: [],
					groups: [
						{
							id: `${MAIN}.Management`,
							label: "Management",
							sequence: 10,
							template: "Mscrm.Templates.Flexible2",
							buttons,
						},
					],
				},
			]
		: [],
});
function load(buttons: RibbonButton[], formButtons: RibbonButton[] = []) {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon("HomepageGrid", buttons),
			SubGrid: ribbon("SubGrid"),
			Form: ribbon("Form", formButtons),
			Application: ribbon("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
	} as never);
}

let container: HTMLDivElement;
let root: Root;
const render = (ui: React.ReactElement) =>
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const radio = (text: string) =>
	[...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) =>
		document.querySelector(`label[for="${r.id}"]`)?.textContent?.startsWith(text),
	)!;
const button = (text: string) =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) => b.textContent?.trim() === text,
	)!;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#187 hiding a button that isn't yours", () => {
	const hide = (props: Partial<React.ComponentProps<typeof HideOobWarningModal>> = {}) => {
		const onConfirmHide = vi.fn();
		const onConfirmDisplayRule = vi.fn();
		render(
			<HideOobWarningModal
				open
				buttonLabel="Edit"
				buttonId="Mscrm.HomepageGrid.contact.Edit"
				commandId="Mscrm.EditSelectedRecord"
				onConfirmHide={onConfirmHide}
				onConfirmDisplayRule={onConfirmDisplayRule}
				onCancel={() => {}}
				{...props}
			/>,
		);
		return { onConfirmHide, onConfirmDisplayRule };
	};

	it("defaults to display rules when nothing else uses the command", () => {
		load([btn("Mscrm.HomepageGrid.contact.Edit", "Edit", "Mscrm.EditSelectedRecord")]);
		const { onConfirmHide, onConfirmDisplayRule } = hide();
		expect(dialog().textContent).toContain('Hide "Edit"?');
		expect(radio("Hide it with display rules").checked).toBe(true);
		expect(dialog().textContent).toContain("No other button uses its command.");
		expect(dialog().textContent).not.toMatch(/HideCustomAction|Mscrm\./);
		act(() => button("Hide button").click());
		expect(onConfirmDisplayRule).toHaveBeenCalledOnce();
		expect(onConfirmHide).not.toHaveBeenCalled();
	});

	it("defaults to this button only when the command is shared, naming the others", () => {
		load(
			[
				btn("Mscrm.HomepageGrid.contact.Edit", "Edit", "Mscrm.EditSelectedRecord"),
				btn("Mscrm.HomepageGrid.contact.Open", "Open", "Mscrm.EditSelectedRecord"),
			],
			// Same label on another location: it says where.
			[btn("Mscrm.Form.contact.Edit", "Edit", "Mscrm.EditSelectedRecord")],
		);
		const { onConfirmHide } = hide();
		expect(radio("Hide this button only").checked).toBe(true);
		expect(dialog().textContent).toContain(
			"Also hides 2 other buttons that use its command: Open, Edit (main form).",
		);
		act(() => button("Hide button").click());
		expect(onConfirmHide).toHaveBeenCalledOnce();
	});

	it("offers only this button without a command, and says why from Delete", () => {
		load([]);
		hide({ commandId: undefined, deleteBlockedReason: "It comes from Microsoft." });
		expect(dialog().textContent).toContain('Can\'t delete "Edit"');
		expect(radio("Hide it with display rules").disabled).toBe(true);
		expect(radio("Hide this button only").checked).toBe(true);
		expect(dialog().textContent).toContain("Not available: this button has no command.");
	});
});

describe("#187 new group", () => {
	it("offers the platform templates, Flexible2 first choice, and no made-up ones", () => {
		load([]);
		act(() => useUIStore.setState({ newGroupOpen: true }));
		render(<NewGroupModal />);
		const options = [...dialog().querySelectorAll("option")].map((o) => o.textContent);
		expect(options).toContain("Flexible2 (recommended)");
		expect(options).not.toContain("Layout3");
		expect(dialog().querySelector<HTMLSelectElement>("select")!.value).toBe(
			"Mscrm.Templates.Flexible2",
		);
	});
});
