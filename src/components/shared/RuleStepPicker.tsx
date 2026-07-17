import React, { useState } from "react";
import { makeStyles, tokens, Input, Button, Text } from "@fluentui/react-components";
import type { RuleStep } from "@/types/ribbon";
import { RULE_KIND_GROUPS, RULE_KIND_LABELS } from "@/constants/ruleKinds";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	search: {
		marginBottom: tokens.spacingVerticalXS,
	},
	group: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXXS,
	},
	groupLabel: {
		color: tokens.colorNeutralForeground3,
		paddingTop: tokens.spacingVerticalXS,
	},
	kindButton: {
		justifyContent: "flex-start",
		textAlign: "left",
	},
});

interface RuleStepPickerProps {
	onSelect: (step: RuleStep) => void;
	disableEnableOnlyKinds?: boolean;
}

const ENABLE_ONLY_INCOMPATIBLE: RuleStep["kind"][] = [
	"EntityPrivilegeRule",
	"EntityPropertyRule",
	"DeviceTypeRule",
	"OptionSetRule",
	"CrmOutlookClientVersionRule",
];

const QUICK_ACTION_OOB_ONLY: RuleStep["kind"][] = [
	"ShowOnQuickActionRule",
	"ShowOnGridAndQuickActionRule",
	"ShowOnGridRule",
];

function createDefaultStep(kind: RuleStep["kind"]): RuleStep {
	switch (kind) {
		case "CommandClientTypeRule":
			return { kind, type: "Refresh", default: true };
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
			return { kind, library: "$webresource:", functionName: "", default: true };
		case "ValueRule":
			return { kind, field: "", value: "" };
		case "SkuRule":
			return { kind, sku: "Online" };
		case "OrRule":
			return {
				kind,
				rules: [
					{ kind: "FormStateRule", state: "Existing" },
					{ kind: "SelectionCountRule", minimum: 1 },
				],
			};
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
		case "ShowOnQuickActionRule":
			return { kind };
		case "ShowOnGridAndQuickActionRule":
			return { kind };
		case "ShowOnGridRule":
			return { kind };
		default:
			return { kind } as RuleStep;
	}
}

export const RuleStepPicker: React.FC<RuleStepPickerProps> = ({
	onSelect,
	disableEnableOnlyKinds = false,
}) => {
	const styles = useStyles();
	const [search, setSearch] = useState("");

	const filtered = RULE_KIND_GROUPS.map((group) => ({
		...group,
		kinds: group.kinds.filter((k) => {
			if (disableEnableOnlyKinds && ENABLE_ONLY_INCOMPATIBLE.includes(k)) return false;
			if (QUICK_ACTION_OOB_ONLY.includes(k)) return false;
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
			<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
				Quick action rules are OOB references and should be bound by ID (for example,
				Mscrm.ShowOnQuickAction), not created as custom step kinds.
			</Text>
			<Input
				className={styles.search}
				placeholder="Search rule kinds…"
				value={search}
				onChange={(_, d) => setSearch(d.value)}
			/>
			{filtered.map((group) => (
				<div key={group.label} className={styles.group}>
					<Text size={100} weight="semibold" className={styles.groupLabel}>
						{group.label}
					</Text>
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
		</div>
	);
};

export default RuleStepPicker;
