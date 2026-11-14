import React from "react";
import {
	InteractionTag,
	InteractionTagPrimary,
	InteractionTagSecondary,
	Tooltip,
} from "@fluentui/react-components";
import { ruleShortName } from "@/utils/ruleLabel";

/**
 * A bound rule (#190, #184): the primary part opens the rule, the secondary
 * part unbinds it. Shows the part of the id that tells rules apart; the full id
 * is in the tooltip. Put several in a Fluent TagGroup for arrow-key navigation.
 */

export interface RuleTagProps {
	ruleId: string;
	kind: "enable" | "display";
	onOpen: () => void;
	/** Leave out when the rule can't be unbound here (read-only). */
	onRemove?: () => void;
}

export const RuleTag: React.FC<RuleTagProps> = ({ ruleId, kind, onOpen, onRemove }) => {
	const name = ruleShortName(ruleId);
	const kindText = kind === "enable" ? "enable rule" : "display rule";
	return (
		<InteractionTag value={ruleId} size="small" appearance="outline">
			<Tooltip content={ruleId} relationship="description">
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
