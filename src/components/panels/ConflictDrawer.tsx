import React, { useEffect, useMemo, useState } from "react";
import {
	makeStyles,
	tokens,
	DrawerBody,
	DrawerHeader,
	DrawerHeaderTitle,
	OverlayDrawer,
	Button,
	Text,
	Badge,
	Subtitle2,
	MessageBar,
	MessageBarBody,
	Tooltip,
	Spinner,
} from "@fluentui/react-components";
import { DismissRegular, LockClosedRegular, OpenRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import type { ConflictEntry } from "@/types/ribbon";
import { fetchConflictLayersForElement } from "@/services/dataverse/conflictService";

const useStyles = makeStyles({
	drawer: {
		width: "560px",
		maxWidth: "95vw",
	},
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalM,
		padding: tokens.spacingHorizontalM,
		overflowY: "auto",
	},
	solutionRow: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalXS,
		padding: tokens.spacingHorizontalS,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	solutionRowWinner: {
		border: `2px solid ${tokens.colorBrandStroke1}`,
		backgroundColor: tokens.colorBrandBackground2,
	},
	solutionHeader: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
	elementId: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		backgroundColor: tokens.colorNeutralBackground4,
		padding: `2px ${tokens.spacingHorizontalXS}`,
		borderRadius: tokens.borderRadiusSmall,
		wordBreak: "break-all",
	},
});

export const ConflictDrawer: React.FC = () => {
	const styles = useStyles();
	const open = useUIStore((s) => s.conflictDrawerOpen);
	const conflictElementId = useUIStore((s) => s.conflictElementId);
	const closeConflictDrawer = useUIStore((s) => s.closeConflictDrawer);
	const openXmlDrawer = useUIStore((s) => s.openXmlDrawer);

	const conflicts = useRibbonStore((s) => s.conflicts);
	const [liveConflict, setLiveConflict] = useState<ConflictEntry | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		if (!open || !conflictElementId) {
			setLiveConflict(null);
			setLoadError(null);
			setIsLoading(false);
			return;
		}

		let cancelled = false;
		setIsLoading(true);
		setLoadError(null);

		void fetchConflictLayersForElement(conflictElementId)
			.then((entry) => {
				if (cancelled) return;
				setLiveConflict(entry);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setLoadError(error instanceof Error ? error.message : "Failed to load conflict layers");
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [open, conflictElementId]);

	const elementConflicts = conflicts.filter(
		(c: ConflictEntry) => c.elementId === conflictElementId,
	);

	const conflict = useMemo(() => {
		if (liveConflict) return liveConflict;
		return elementConflicts[0];
	}, [liveConflict, elementConflicts]);
	// Sort solution layers by wins flag (winner last)
	const sortedLayers = conflict
		? [...conflict.solutions].sort((a, b) => (a.wins === b.wins ? 0 : a.wins ? 1 : -1))
		: [];

	return (
		<OverlayDrawer
			className={styles.drawer}
			open={open}
			position="end"
			onOpenChange={(_, d) => !d.open && closeConflictDrawer()}
		>
			<DrawerHeader>
				<DrawerHeaderTitle
					action={
						<Button
							appearance="subtle"
							icon={<DismissRegular />}
							onClick={closeConflictDrawer}
							aria-label="Close"
						/>
					}
				>
					<Subtitle2>Solution Conflicts</Subtitle2>
				</DrawerHeaderTitle>
			</DrawerHeader>

			<DrawerBody>
				<div className={styles.body}>
					{conflictElementId && (
						<div>
							<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
								Conflicting element:
							</Text>
							<div className={styles.elementId}>{conflictElementId}</div>
						</div>
					)}

					<MessageBar intent="warning">
						<MessageBarBody>
							<Text size={200}>
								Multiple solutions customize this element. Dataverse applies them in solution import
								order — the most recently imported solution wins.
							</Text>
						</MessageBarBody>
					</MessageBar>

					<MessageBar intent="info">
						<MessageBarBody>
							<Text size={200}>
								<strong>To resolve:</strong> Merge changes into one solution, or use solution
								layering to control evaluation order. Managed solutions appear as read-only layers —
								to resolve, merge the customization into your unmanaged solution.
							</Text>
						</MessageBarBody>
					</MessageBar>

					{isLoading && (
						<div
							style={{
								display: "flex",
								justifyContent: "center",
								padding: tokens.spacingHorizontalM,
							}}
						>
							<Spinner label="Loading solution layers..." />
						</div>
					)}

					{loadError && (
						<MessageBar intent="error">
							<MessageBarBody>{loadError}</MessageBarBody>
						</MessageBar>
					)}

					{!isLoading && sortedLayers.length === 0 && (
						<Text style={{ color: tokens.colorNeutralForeground3, textAlign: "center" }}>
							No conflict details available from environment layers.
						</Text>
					)}

					{sortedLayers.map((layer, i) => (
						<div
							key={`${layer.solutionId}-${i}`}
							className={`${styles.solutionRow} ${layer.wins ? styles.solutionRowWinner : ""}`}
						>
							<div className={styles.solutionHeader}>
								<Text weight="semibold">{layer.solutionName}</Text>
								{layer.wins && (
									<Badge appearance="filled" color="brand">
										WINS
									</Badge>
								)}
								{layer.managed && (
									<Tooltip content="Managed solution — read-only" relationship="label">
										<LockClosedRegular style={{ color: tokens.colorNeutralForeground3 }} />
									</Tooltip>
								)}
								<Badge appearance="outline" size="small">
									{layer.managed ? "Managed" : "Unmanaged"}
								</Badge>
							</div>
							<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
								Publisher: {layer.publisher}
							</Text>
							{layer.importedOn && (
								<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
									Imported: {new Date(layer.importedOn).toLocaleString()}
								</Text>
							)}
							<div style={{ display: "flex", gap: tokens.spacingHorizontalS, flexWrap: "wrap" }}>
								<Button
									appearance="subtle"
									size="small"
									icon={<OpenRegular />}
									onClick={openXmlDrawer}
								>
									View XML diff
								</Button>
							</div>
						</div>
					))}
				</div>
			</DrawerBody>
		</OverlayDrawer>
	);
};

export default ConflictDrawer;
