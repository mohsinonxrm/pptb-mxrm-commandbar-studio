import { bySequence } from "@/store/ribbonStore";
import { placeModernCommands } from "@/services/modernCommands";
import type { RibbonButton, RibbonTab } from "@/types/ribbon";
import type {
	ClassicModernOverride,
	ModernCommand,
	ModernCommandNode,
} from "@/types/modernCommand";

/** A command on the "How users see it" strip (#194): a ribbon button or a modern command. */
export type UsersBarItem =
	| {
			kind: "classic";
			id: string;
			button: RibbonButton;
			groupId: string;
			/** The migrated modern command users see in the button's place (#32). */
			replacedBy?: ModernCommand;
	  }
	| { kind: "modern"; id: string; command: ModernCommand };

/**
 * The tab's commands as the Unified Interface command bar lists them, before
 * any rule is applied (#194): groups and their buttons in Sequence order,
 * without the buttons your layer or a modern command hides, a button a
 * migrated modern command replaces shown as that command, and the visible
 * modern commands placed among them by Sequence. Display and enable rules
 * aren't evaluated: Simulate mode (#191) does that.
 */
export function usersBar(
	tab: RibbonTab,
	modern: readonly ModernCommandNode[],
	overrides: ReadonlyMap<string, readonly ClassicModernOverride[]>,
): UsersBarItem[] {
	// Every button, hidden ones too: a modern command is placed by Sequence among
	// all of them, as on the Modern command bar view, then the hidden ones go.
	const all = bySequence(tab.groups).flatMap((g) =>
		bySequence(g.buttons).map((b) => {
			const o = overrides.get(b.id) ?? [];
			// With every app's commands shown, an app's hide doesn't hide it for all (review).
			const hidden = b.hidden || (o.length > 0 && o.every((x) => x.effect === "hidden"));
			const replacedBy = o.find((x) => x.effect === "replaced")?.command;
			const item = {
				kind: "classic" as const,
				id: b.id,
				button: b,
				groupId: g.id,
				replacedBy,
			};
			return { item, hidden };
		}),
	);
	const shown = modern.filter((n) => !n.command.hidden && !n.command.disabled);
	const placement = placeModernCommands(
		all.map((c) => ({ id: c.item.id, sequence: c.item.button.sequence })),
		shown,
	);
	const asItem = (n: ModernCommandNode): UsersBarItem => ({
		kind: "modern",
		id: `modern:${n.command.id}`,
		command: n.command,
	});
	return [
		...all.flatMap(({ item, hidden }) => [
			...(placement.before.get(item.id) ?? []).map(asItem),
			...(hidden ? [] : [item]),
		]),
		...placement.trailing.map(asItem),
	];
}
