import { useSessionStore } from "@/store/sessionStore";

/**
 * Generates a valid, unique ribbon element ID following the convention:
 * {PublisherPrefix}.{EntityName}.{Name}.{Suffix}
 *
 * Example: contoso.account.CreditCheck.Button
 */
export function generateRibbonId(
	entityName: string,
	name: string,
	suffix: string,
	existingIds: Set<string>,
): string {
	const prefix = getPublisherPrefix();
	const base = `${prefix}.${sanitize(entityName)}.${sanitize(name)}.${sanitize(suffix)}`;
	return ensureUnique(base, existingIds);
}

export function generateCommandId(
	entityName: string,
	name: string,
	existingIds: Set<string>,
): string {
	const prefix = getPublisherPrefix();
	const base = `${prefix}.${sanitize(entityName)}.${sanitize(name)}.Command`;
	return ensureUnique(base, existingIds);
}

export function generateRuleId(
	name: string,
	type: "Enable" | "Display",
	existingIds: Set<string>,
): string {
	const prefix = getPublisherPrefix();
	const base = `${prefix}.${sanitize(name)}.${type}Rule`;
	return ensureUnique(base, existingIds);
}

/**
 * The distinctive part of a command id, used to name rules created for it:
 * `cbstest.contact.HomepageGrid.Approve.Command` → `Approve`,
 * `Mscrm.AssignSelectedRecord` → `AssignSelectedRecord`.
 */
export function ruleNameFromCommandId(commandId: string): string {
	return commandId.replace(/\.Command$/, "").split(".").pop() || "Rule";
}

export function generateLocLabelId(buttonId: string, part: "LabelText" | "ToolTip"): string {
	return `${buttonId}.${part}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPublisherPrefix(): string {
	try {
		return useSessionStore.getState().publisherPrefix || "new";
	} catch {
		return "new";
	}
}

function sanitize(value: string): string {
	// Remove characters not valid in XML IDs; collapse spaces to nothing
	return value.replace(/[^a-zA-Z0-9._]/g, "").replace(/^[^a-zA-Z]/, "x");
}

function ensureUnique(base: string, existingIds: Set<string>): string {
	if (!existingIds.has(base)) return base;
	let i = 2;
	while (existingIds.has(`${base}${i}`)) i++;
	return `${base}${i}`;
}

/**
 * Ids for a new button (or menu item) and its command:
 * `{prefix}.{entity}.{location}.{Label}.Button` / `….Command`. The location
 * keeps the same label on the grid, sub-grid and form from producing colliding
 * ids in the table's single RibbonDiffXml; `existingIds` (every control and
 * command already loaded) de-duplicates.
 */
export function newButtonIds(
	prefix: string,
	entityName: string,
	location: string,
	label: string,
	existingIds: Set<string>,
): { id: string; commandId: string } {
	const safeName = label.replace(/[^a-zA-Z0-9_]/g, "") || "Button";
	const base = `${prefix}.${entityName}.${location}.${safeName}`;
	let stem = base;
	for (let n = 2; existingIds.has(`${stem}.Button`) || existingIds.has(`${stem}.Command`); n++) {
		stem = `${base}${n}`;
	}
	return { id: `${stem}.Button`, commandId: `${stem}.Command` };
}

/**
 * Validates that a ribbon element ID contains no whitespace or forbidden characters.
 */
export function validateRibbonId(id: string): string | null {
	if (/\s/.test(id)) return "ID must not contain whitespace";
	if (!id) return "ID must not be empty";
	if (!/^[a-zA-Z]/.test(id)) return "ID must start with a letter";
	return null;
}
