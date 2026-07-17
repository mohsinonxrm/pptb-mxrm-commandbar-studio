import React, { useState } from "react";
import {
	makeStyles,
	tokens,
	DrawerBody,
	DrawerHeader,
	DrawerHeaderTitle,
	OverlayDrawer,
	Button,
	Field,
	Input,
	Text,
	Badge,
	Subtitle2,
	Select,
	Divider,
} from "@fluentui/react-components";
import { DismissRegular, AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import type { ScalingDefinition, ScaleStep } from "@/types/ribbon";

const useStyles = makeStyles({
	drawer: {
		width: "600px",
		maxWidth: "95vw",
	},
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalM,
		padding: tokens.spacingHorizontalM,
		overflowY: "auto",
	},
	stepRow: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalXS,
		padding: tokens.spacingHorizontalS,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	stepHeader: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
	stepFields: {
		display: "flex",
		gap: tokens.spacingHorizontalS,
		flexWrap: "wrap",
		alignItems: "flex-end",
	},
	sectionLabel: {
		color: tokens.colorNeutralForeground3,
		textTransform: "uppercase",
		fontSize: tokens.fontSizeBase100,
		letterSpacing: "0.5px",
		fontWeight: tokens.fontWeightSemibold,
	},
	warningNote: {
		backgroundColor: tokens.colorStatusWarningBackground1,
		borderRadius: tokens.borderRadiusMedium,
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalS}`,
		fontSize: tokens.fontSizeBase100,
	},
});

const SIZE_OPTIONS = [
	"Large",
	"LargeLarge",
	"LargeMedium",
	"LargeSmall",
	"MediumLarge",
	"MediumMedium",
	"MediumSmall",
	"SmallMedium",
	"SmallSmall",
	"Popup",
];

export const ScalingEditorPanel: React.FC = () => {
	const styles = useStyles();
	const open = useUIStore((s) => s.scalingEditorOpen);
	const closeScalingEditor = useUIStore((s) => s.closeScalingEditor);

	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const setScaling = useRibbonStore((s) => s.setScaling);

	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const persistedScaling = tabId ? ribbon.scalingByTab?.[tabId] : undefined;

	const [maxSizes, setMaxSizes] = useState<ScaleStep[]>([]);
	const [scales, setScales] = useState<ScaleStep[]>([]);

	React.useEffect(() => {
		if (!open || !tab) return;

		if (persistedScaling) {
			setMaxSizes([...persistedScaling.maxSizes]);
			setScales([...persistedScaling.scales]);
			return;
		}

		setMaxSizes([
			{
				id: `MaxSize.${tab.id}.1`,
				groupId: tab.groups[0]?.id ?? "",
				size: "Large",
				sequence: 10,
			},
		]);
		setScales([
			{
				id: `Scale.${tab.id}.1`,
				groupId: tab.groups[0]?.id ?? "",
				size: "SmallSmall",
				sequence: 200,
			},
		]);
	}, [open, tab, persistedScaling]);

	const groups = tab?.groups ?? [];

	const addMaxSize = () => {
		setMaxSizes((prev) => [
			...prev,
			{
				id: `MaxSize.${prev.length + 1}`,
				groupId: groups[0]?.id ?? "",
				size: "Large",
				sequence: (prev.length + 1) * 10,
			},
		]);
	};

	const addScale = () => {
		setScales((prev) => [
			...prev,
			{
				id: `Scale.${prev.length + 1}`,
				groupId: groups[0]?.id ?? "",
				size: "SmallSmall",
				sequence: 200 + (prev.length + 1) * 10,
			},
		]);
	};

	const updateMaxSize = (index: number, patch: Partial<ScaleStep>) => {
		setMaxSizes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
	};

	const updateScale = (index: number, patch: Partial<ScaleStep>) => {
		setScales((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
	};

	const handleSave = () => {
		const scaling: ScalingDefinition = {
			tabId,
			maxSizes,
			scales,
		};
		setScaling(location, tabId, scaling);
		closeScalingEditor();
	};

	return (
		<OverlayDrawer
			className={styles.drawer}
			open={open}
			position="end"
			onOpenChange={(_, d) => !d.open && closeScalingEditor()}
		>
			<DrawerHeader>
				<DrawerHeaderTitle
					action={
						<Button
							appearance="subtle"
							icon={<DismissRegular />}
							onClick={closeScalingEditor}
							aria-label="Close"
						/>
					}
				>
					<Subtitle2>Scaling Editor</Subtitle2>
				</DrawerHeaderTitle>
			</DrawerHeader>

			<DrawerBody>
				<div className={styles.body}>
					<div className={styles.warningNote}>
						⚠ <strong>Scaling applies ONLY to the Classic ribbon</strong> — forms NOT updated to
						Unified Interface, and Dynamics 365 for Outlook list views. The modern command bar
						(Unified Interface) ignores all MaxSize and Scale definitions entirely.
					</div>

					{tab && (
						<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
							Tab: <strong>{tab.label}</strong> ({tab.id})
						</Text>
					)}

					<Divider />

					{/* MaxSize section */}
					<div>
						<Text className={styles.sectionLabel}>MaxSize (largest size, shown first)</Text>
						<Text
							size={100}
							style={{
								color: tokens.colorNeutralForeground3,
								display: "block",
								marginBottom: tokens.spacingHorizontalS,
							}}
						>
							Sequence numbers must be lower than all Scale step sequence numbers.
						</Text>

						{maxSizes.map((step, i) => (
							<div
								key={i}
								className={styles.stepRow}
								style={{ marginBottom: tokens.spacingHorizontalXS }}
							>
								<div className={styles.stepHeader}>
									<Badge appearance="tint" color="brand" size="small">
										MaxSize {i + 1}
									</Badge>
									<div style={{ flex: 1 }} />
									<Button
										appearance="subtle"
										size="small"
										icon={<DeleteRegular />}
										onClick={() => setMaxSizes((p) => p.filter((_, idx) => idx !== i))}
									/>
								</div>
								<div className={styles.stepFields}>
									<Field label="Group" style={{ minWidth: "160px" }}>
										<Select
											size="small"
											value={step.groupId}
											onChange={(_, d) => updateMaxSize(i, { groupId: d.value })}
										>
											{groups.length === 0 && <option value="">— no groups —</option>}
											{groups.map((g) => (
												<option key={g.id} value={g.id}>
													{g.label || g.id}
												</option>
											))}
										</Select>
									</Field>
									<Field label="Size" style={{ minWidth: "140px" }}>
										<Select
											size="small"
											value={step.size}
											onChange={(_, d) => updateMaxSize(i, { size: d.value })}
										>
											{SIZE_OPTIONS.map((s) => (
												<option key={s} value={s}>
													{s}
												</option>
											))}
										</Select>
									</Field>
									<Field label="Sequence" style={{ width: "80px" }}>
										<Input
											size="small"
											type="number"
											value={String(step.sequence)}
											onChange={(_, d) =>
												updateMaxSize(i, { sequence: parseInt(d.value, 10) || 0 })
											}
										/>
									</Field>
								</div>
							</div>
						))}

						<Button appearance="subtle" size="small" icon={<AddRegular />} onClick={addMaxSize}>
							Add MaxSize
						</Button>
					</div>

					<Divider />

					{/* Scale section */}
					<div>
						<Text className={styles.sectionLabel}>Scale steps (collapse order — top-down)</Text>
						<Text
							size={100}
							style={{
								color: tokens.colorNeutralForeground3,
								display: "block",
								marginBottom: tokens.spacingHorizontalS,
							}}
						>
							Scale elements are applied in document order (top-down when shrinking, bottom-up when
							growing). Sequence numbers must be higher than all MaxSize sequence numbers.
						</Text>

						{scales.map((step, i) => (
							<div
								key={i}
								className={styles.stepRow}
								style={{ marginBottom: tokens.spacingHorizontalXS }}
							>
								<div className={styles.stepHeader}>
									<Badge appearance="tint" color="informative" size="small">
										Scale {i + 1}
									</Badge>
									<div style={{ flex: 1 }} />
									<Button
										appearance="subtle"
										size="small"
										icon={<DeleteRegular />}
										onClick={() => setScales((p) => p.filter((_, idx) => idx !== i))}
									/>
								</div>
								<div className={styles.stepFields}>
									<Field label="Group" style={{ minWidth: "160px" }}>
										<Select
											size="small"
											value={step.groupId}
											onChange={(_, d) => updateScale(i, { groupId: d.value })}
										>
											{groups.length === 0 && <option value="">— no groups —</option>}
											{groups.map((g) => (
												<option key={g.id} value={g.id}>
													{g.label || g.id}
												</option>
											))}
										</Select>
									</Field>
									<Field label="Size" style={{ minWidth: "140px" }}>
										<Select
											size="small"
											value={step.size}
											onChange={(_, d) => updateScale(i, { size: d.value })}
										>
											{SIZE_OPTIONS.map((s) => (
												<option key={s} value={s}>
													{s}
												</option>
											))}
										</Select>
									</Field>
									<Field label="Sequence" style={{ width: "80px" }}>
										<Input
											size="small"
											type="number"
											value={String(step.sequence)}
											onChange={(_, d) => updateScale(i, { sequence: parseInt(d.value, 10) || 0 })}
										/>
									</Field>
								</div>
							</div>
						))}

						<Button appearance="subtle" size="small" icon={<AddRegular />} onClick={addScale}>
							Add Scale step
						</Button>
					</div>

					<div
						style={{
							display: "flex",
							justifyContent: "flex-end",
							gap: tokens.spacingHorizontalS,
							paddingTop: tokens.spacingHorizontalS,
						}}
					>
						<Button appearance="secondary" onClick={closeScalingEditor}>
							Cancel
						</Button>
						<Button appearance="primary" onClick={handleSave}>
							Save scaling
						</Button>
					</div>
				</div>
			</DrawerBody>
		</OverlayDrawer>
	);
};

export default ScalingEditorPanel;
