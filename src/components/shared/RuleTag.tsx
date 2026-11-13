import React from "react";
import {
	InteractionTag,
	InteractionTagPrimary,
	InteractionTagSecondary,
	Tooltip,
} from "@fluentui/react-components";
import { ruleShortName } from "@/utils/ruleLabel";
import { PLATFORM_ENABLE_RULES } from "@/constants/ruleKinds";

/**
 * A bound rule (#190, #184): the primary part opens the rule, the secondary
 * part unbinds it. Shows the part of the id that tells rules apart; the full id
 * is in the tooltip. Put several in a Fluent TagGroup for arrow-key navigation.
 */

export interface RuleTagProps {
	ruleId: string;
	kind: "enable" | "display";
	/** Leave out when the rule isn't in the loaded ribbon (#162): there's nothing to open. */
	onOpen?: () => void;
	/** Leave out when the rule can't be unbound here (read-only). */
	onRemove?: () => void;
}

export const RuleTag: React.FC<RuleTagProps> = ({ ruleId, kind, onOpen, onRemove }) => {
	const name = ruleShortName(ruleId);
	const kindText = kind === "enable" ? "enable rule" : "display rule";
	const platform =
		kind === "enable" ? PLATFORM_ENABLE_RULES.find((r) => r.id === ruleId) : undefined;
	const tip = onOpen
		? ruleId
		: platform
			? `${ruleId}: Microsoft's rule, "${platform.label}". It's in the application ribbon, so there's nothing to open here.`
			: `${ruleId} isn't in the loaded ribbon, so there's nothing to open here.`;
	return (
		<InteractionTag value={ruleId} size="small" appearance="outline">
			<Tooltip content={tip} relationship="description">
				<InteractionTagPrimary hasSecondaryAction={!!onRemove} onClick={onOpen}>
					{name}
				</InteractionTagPrimary>
			</Tooltip>
			{onRemove && (
				<InteractionTagSecondary
					aria-label={`Unbind ${kindText} ${name}`}
					onClick={onRemove}
				/>
			)}
		</InteractionTag>
	);
};

export default RuleTag;
