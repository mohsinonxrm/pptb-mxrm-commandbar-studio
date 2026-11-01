import React, { useState } from "react";
import {
	makeStyles,
	tokens,
	Button,
	Caption1,
	InfoLabel,
	SearchBox,
	useArrowNavigationGroup,
} from "@fluentui/react-components";
import type { RuleStep } from "@/types/ribbon";
import {
	RULE_KIND_GROUPS,
	RULE_KIND_LABELS,
	isRuleKindAllowed,
	type RuleContainer,
} from "@/constants/ruleKinds";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	searchRow: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		marginBottom: tokens.spacingVerticalXS,
	},
	search: { flex: 1, minWidth: 0 },
	group: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXXS,
	},
	groupLabel: {
		color: tokens.colorNeutralForeground3,
		fontWeight: tokens.fontWeightSemibold,
		paddingTop: tokens.spacingVerticalXS,
	},
	kindButton: {
		justifyContent: "flex-start",
		textAlign: "left",
	},
});

interface RuleStepPickerProps {
	onSelect: (step: RuleStep) => void;
	/** Only kinds the schema allows in this rule type are offered (#41). */
	container?: RuleContainer;
	/** Picking a step for an `<Or>` group: a nested OrRule is not allowed. */
	insideOr?: boolean;
}

function createDefaultStep(kind: RuleStep["kind"]): RuleStep {
	switch (kind) {
		case "CommandClientTypeRule":
			// Unified Interface (#152).
			return { kind, type: "Modern" };
		case "CrmClientTypeRule":
			return { kind, type: "Web" };
		case "FormStateRule":
			return { kind, state: "Existing" };
		case "FormTypeRule":
			return { kind, type: "Main" };
		case "SelectionCountRule":
			return { kind, minimum: 1 };
		case "EntityRule":
			return { kind };
		case "CustomRule":
			return { kind, library: "$webresource:", functionName: "" };
		case "ValueRule":
			return { kind, field: "", value: "" };
		case "SkuRule":
			return { kind, sku: "Online" };
		case "OrRule":
			return {
				kind,
				groups: [
					[{ kind: "FormStateRule", state: "Existing" }],
					[{ kind: "FormStateRule", state: "Create" }],
				],
			};
		case "FeatureControlRule":
			return { kind, featureControlBit: "", expectedValue: true };
		case "OrganizationSettingRule":
			return { kind, setting: "IsSharepointEnabled" };
		case "EntityPrivilegeRule":
			return { kind, privilegeType: "Read", privilegeDepth: "Basic" };
		case "EntityPropertyRule":
			return { kind, propertyName: "IsCustomizable", propertyValue: true };
		case "RecordPrivilegeRule":
			return { kind, privilegeType: "Read" };
		case "RelationshipTypeRule":
			return { kind, appliesTo: "SelectedEntity" };
		case "MiscellaneousPrivilegeRule":
			return { kind, privilegeName: "ExportToExcel" };
		case "FormEntityContextRule":
			return { kind, entityName: "" };
		case "PageRule":
			return { kind, address: "" };
		case "CrmOfflineAccessStateRule":
			return { kind, state: "Online" };
		case "CrmOutlookClientTypeRule":
			return { kind, type: "CrmForOutlook" };
		case "CrmOutlookClientVersionRule":
			return { kind, major: 15, minor: 0, build: 0, revision: 0 };
		case "DeviceTypeRule":
			return { kind, type: "Web" };
		case "OptionSetRule":
			return { kind, optionSet: "", stateCode: "", objectTypeCode: "" };
		case "OutlookItemTrackingRule":
			return { kind, trackedInCrm: true };
		case "OutlookRenderTypeRule":
			return { kind, type: "Web" };
		case "OutlookVersionRule":
			return { kind, version: "2010" };
		case "HideForTabletExperienceRule":
			return { kind };
		case "ReferencingAttributeRequiredRule":
			return { kind };
		default:
			return { kind } as RuleStep;
	}
}

export const RuleStepPicker: React.FC<RuleStepPickerProps> = ({
	onSelect,
	container,
	insideOr = false,
}) => {
	const styles = useStyles();
	const [search, setSearch] = useState("");
	// Arrow keys move through the kinds (#189): Tab enters and leaves the list once.
	const navigation = useArrowNavigationGroup({ axis: "vertical" });

	const filtered = RULE_KIND_GROUPS.map((group) => ({
		...group,
		kinds: group.kinds.filter((k) => {
			if (container && !isRuleKindAllowed(k, container, insideOr)) return false;
			if (insideOr && k === "OrRule") return false;
			const label = RULE_KIND_LABELS[k] ?? k;
			return (
				!search ||
				label.toLowerCase().includes(search.toLowerCase()) ||
				k.toLowerCase().includes(search.toLowerCase())
			);
		}),
	})).filter((g) => g.kinds.length > 0);

	return (
		<div className={styles.root}>
			<div className={styles.searchRow}>
				<SearchBox
					className={styles.search}
					placeholder="Search steps"
					aria-label="Search steps"
					value={search}
					onChange={(_, d) => setSearch(d.value)}
				/>
				<InfoLabel info="Show on grid or quick action comes from Microsoft's rules (Mscrm.ShowOnGrid, Mscrm.ShowOnQuickAction): add them to the command by ID instead.">
					<span className={styles.groupLabel}>Not here?</span>
				</InfoLabel>
			</div>
			<div role="group" aria-label="Kinds of step" {...navigation}>
				{filtered.map((group) => (
					<div key={group.label} className={styles.group}>
						<Caption1 className={styles.groupLabel}>{group.label}</Caption1>
						{group.kinds.map((k) => (
							<Button
								key={k}
								appearance="subtle"
								className={styles.kindButton}
								onClick={() => onSelect(createDefaultStep(k))}
							>
								{RULE_KIND_LABELS[k] ?? k}
							</Button>
						))}
					</div>
				))}
				{filtered.length === 0 && <Caption1>No kind of step matches.</Caption1>}
			</div>
		</div>
	);
};

export default RuleStepPicker;
