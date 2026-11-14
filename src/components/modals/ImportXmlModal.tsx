import React, { useEffect, useRef, useState } from "react";
import {
	Badge,
	Button,
	Caption1,
	MessageBar,
	MessageBarBody,
	Text,
	makeStyles,
	tokens,
	type BadgeProps,
} from "@fluentui/react-components";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { validateRibbonDiffXml, type ValidationError } from "@/services/xmlValidator";
import { importRibbonDiffXml, type RibbonDiffImportResult } from "@/services/ribbonDiffImport";
import { AppDialog } from "@/components/shared/AppDialog";
import MonacoEditor from "@/components/shared/MonacoEditor";

/**
 * Runs the import against the current session (#30). Pure: the store only
 * changes when `commit` is set, as one undoable change that leaves the
 * baseline alone — so everything imported shows up as a change to publish.
 */
function runRibbonDiffImport(xmlText: string, commit: boolean): RibbonDiffImportResult {
	const store = useRibbonStore.getState();
	const result = importRibbonDiffXml({
		xml: xmlText,
		ribbons: store.ribbons,
		commands: store.commands,
		enableRules: store.enableRules,
		displayRules: store.displayRules,
		locLabels: store.locLabels,
		entityLogicalName:
			useSessionStore.getState().activeEntity?.logicalName ??
			store.ribbons.HomepageGrid.entityLogicalName,
		activeLocation: useSelectionStore.getState().location,
		languageCode: store.baseLanguageCode,
	});
	if (commit && result.changed) {
		store.applyImport(result, `${result.applied.length} change(s)`);
	}
	return result;
}

const useStyles = makeStyles({
	// Two columns (#187): the editor keeps its height, the results scroll beside it.
	content: {
		display: "grid",
		gridTemplateColumns: "1.4fr 1fr",
		gap: tokens.spacingHorizontalL,
		height: "min(560px, calc(100vh - 240px))",
		minHeight: "320px",
		overflowY: "hidden",
		"@media (max-width: 760px)": {
			gridTemplateColumns: "1fr",
			gridTemplateRows: "minmax(240px, 1.4fr) 1fr",
			overflowY: "auto",
		},
	},
	editorColumn: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
		minHeight: 0,
		minWidth: 0,
	},
	editor: {
		flex: 1,
		minHeight: "200px",
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		overflow: "hidden",
	},
	muted: { color: tokens.colorNeutralForeground3 },
	results: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
		minHeight: 0,
		minWidth: 0,
		overflowY: "auto",
		paddingRight: tokens.spacingHorizontalXS,
	},
	section: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	list: {
		listStyleType: "none",
		margin: 0,
		padding: 0,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	row: {
		display: "flex",
		alignItems: "flex-start",
		gap: tokens.spacingHorizontalS,
		minWidth: 0,
	},
	rowBadge: { flexShrink: 0, marginTop: "2px" },
	rowText: { minWidth: 0, overflowWrap: "anywhere" },
	problemButton: {
		textAlign: "start",
		justifyContent: "flex-start",
		minWidth: 0,
		height: "auto",
		padding: 0,
		fontWeight: tokens.fontWeightRegular,
	},
});

type ChangeKind = "Add" | "Update" | "Hide";

/** The kind of an applied line, from how the import words it. */
function changeKind(line: string): ChangeKind | null {
	if (/^Added\b|\badded$/.test(line)) return "Add";
	if (/^Updated\b|\bupdated$/.test(line)) return "Update";
	if (/^Hid\b/.test(line)) return "Hide";
	return null;
}

const CHANGE_COLOR: Record<ChangeKind, BadgeProps["color"]> = {
	Add: "success",
	Update: "brand",
	Hide: "informative",
};

interface Problem {
	severity: "error" | "warning";
	text: string;
	line?: number;
}

function problemsOf(
	errors: ValidationError[],
	result: RibbonDiffImportResult | undefined,
	failure: string,
): Problem[] {
	const problems: Problem[] = errors.map((e) => {
		const line = e.lineHint ? Number(/\d+/.exec(e.lineHint)?.[0]) : undefined;
		return {
			severity: e.severity === "warning" ? "warning" : "error",
			text: e.message,
			line: Number.isFinite(line) ? line : undefined,
		};
	});
	if (failure) problems.push({ severity: "error", text: failure });
	for (const text of result?.notApplied ?? []) problems.push({ severity: "warning", text });
	return problems;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const ImportXmlModal: React.FC = () => {
	const styles = useStyles();
	const importXmlOpen = useUIStore((s) => s.importXmlOpen);
	const importXmlSeed = useUIStore((s) => s.importXmlSeed);
	const importXmlNote = useUIStore((s) => s.importXmlNote);
	const closeImportXml = useUIStore((s) => s.closeImportXml);
	const tableName = useSessionStore(
		(s) => s.activeEntity?.displayName ?? s.activeEntity?.logicalName,
	);

	const [xmlText, setXmlText] = useState("");
	const [errors, setErrors] = useState<ValidationError[]>([]);
	const [report, setReport] = useState<{
		result: RibbonDiffImportResult;
		imported: boolean;
	} | null>(null);
	const [failure, setFailure] = useState("");
	const editorRef = useRef<
		import("monaco-editor/editor/editor.api").editor.IStandaloneCodeEditor | null
	>(null);

	useEffect(() => {
		if (!importXmlOpen) return;
		setXmlText(importXmlSeed);
		setErrors([]);
		setReport(null);
		setFailure("");
	}, [importXmlOpen, importXmlSeed]);

	const handleChange = (value: string) => {
		setXmlText(value);
		// A preview no longer matches edited XML.
		if (!report?.imported) {
			setReport(null);
			setErrors([]);
			setFailure("");
		}
	};

	const run = (commit: boolean) => {
		const errs = validateRibbonDiffXml(xmlText);
		setErrors(errs);
		setFailure("");
		// Warnings (e.g. rule placement the platform itself tolerates) don't block.
		if (errs.some((e) => e.severity !== "warning")) {
			setReport(null);
			return;
		}
		try {
			setReport({ result: runRibbonDiffImport(xmlText, commit), imported: commit });
		} catch (e) {
			setReport(null);
			setFailure(e instanceof Error ? e.message : String(e));
		}
	};

	const goToLine = (line: number) => {
		const editor = editorRef.current;
		if (!editor) return;
		editor.revealLineInCenter(line);
		editor.setPosition({ lineNumber: line, column: 1 });
		editor.focus();
	};

	const imported = report?.imported === true;
	const result = report?.result;
	const changes = result?.applied ?? [];
	const problems = problemsOf(errors, result, failure);
	const blocked = problems.some((p) => p.severity === "error");
	const checked = !!result || errors.length > 0 || !!failure;
	// What Import would bring, once a preview says.
	const changeCount = result && !imported ? changes.filter((c) => changeKind(c)).length : 0;

	const heading = imported
		? result!.changed
			? `Imported ${plural(changes.filter((c) => changeKind(c)).length, "change")}`
			: "Nothing to import: the session already has all of it"
		: checked
			? `Preview · ${plural(changeCount, "change")}, ${plural(problems.length, "problem")}`
			: "Preview";

	return (
		<AppDialog
			open={importXmlOpen}
			onOpenChange={(open) => !open && closeImportXml()}
			title="Import RibbonDiffXml"
			size="large"
			contentClassName={styles.content}
			actions={
				imported ? (
					<Button appearance="primary" onClick={closeImportXml}>
						Close
					</Button>
				) : (
					<>
						<Button onClick={closeImportXml}>Cancel</Button>
						<Button onClick={() => run(false)} disabled={!xmlText.trim()}>
							{checked ? "Preview again" : "Preview"}
						</Button>
						<Button
							appearance="primary"
							onClick={() => run(true)}
							disabled={!xmlText.trim() || blocked}
						>
							{changeCount > 0 ? `Import ${plural(changeCount, "change")}` : "Import"}
						</Button>
					</>
				)
			}
		>
			<div className={styles.editorColumn}>
				<Text weight="semibold" id="import-xml-label">
					Paste RibbonDiffXml
				</Text>
				<Caption1 className={styles.muted}>
					From Ribbon Workbench or a solution&apos;s customizations.xml. Only{" "}
					{tableName ?? "this table"}&apos;s part is used.
				</Caption1>
				<div className={styles.editor} role="group" aria-labelledby="import-xml-label">
					<MonacoEditor
						language="xml"
						value={xmlText}
						onChange={handleChange}
						readOnly={imported}
						height="100%"
						onMount={(editor) => {
							editorRef.current = editor;
						}}
						options={{ wordWrap: "on", lineNumbers: "on", padding: { top: 8 } }}
					/>
				</div>
			</div>

			<section className={styles.results} aria-label="Preview">
				<Text weight="semibold" role="status">
					{heading}
				</Text>
				{!checked && (
					<>
						{importXmlNote && !xmlText && (
							<MessageBar intent="info">
								<MessageBarBody>{importXmlNote}</MessageBarBody>
							</MessageBar>
						)}
						<Text className={styles.muted}>
							Preview shows what the import changes, and any problems, before anything
							changes. Commands, rules and labels are added or replaced by ID;
							buttons, groups and tabs are added to the ribbon; overrides and hides
							change the existing controls. The import is one change: Undo takes it
							all back.
						</Text>
					</>
				)}

				{problems.length > 0 && (
					<div className={styles.section}>
						<Text weight="semibold">Problems</Text>
						<ul className={styles.list} aria-label="Problems">
							{problems.map((p, i) => (
								<li key={i} className={styles.row}>
									<Badge
										className={styles.rowBadge}
										size="medium"
										appearance="tint"
										color={p.severity === "error" ? "danger" : "warning"}
									>
										{p.severity === "error" ? "Error" : "Warning"}
									</Badge>
									{p.line ? (
										<Button
											appearance="transparent"
											className={styles.problemButton}
											onClick={() => goToLine(p.line!)}
										>
											<span className={styles.rowText}>
												Line {p.line}: {p.text}
											</span>
										</Button>
									) : (
										<Text className={styles.rowText}>{p.text}</Text>
									)}
								</li>
							))}
						</ul>
						{!blocked &&
							!imported &&
							changeCount > 0 &&
							result!.notApplied.length > 0 && (
								<Caption1 className={styles.muted}>
									Warnings don&apos;t stop the import: they say what won&apos;t be
									imported or published.
								</Caption1>
							)}
					</div>
				)}

				{changes.length > 0 && (
					<div className={styles.section}>
						<Text weight="semibold">{imported ? "Imported" : "Changes"}</Text>
						<ul className={styles.list} aria-label="Changes">
							{changes.map((line, i) => {
								const kind = changeKind(line);
								return (
									<li key={i} className={styles.row}>
										{kind && (
											<Badge
												className={styles.rowBadge}
												size="medium"
												appearance="tint"
												color={CHANGE_COLOR[kind]}
											>
												{kind}
											</Badge>
										)}
										<Text className={styles.rowText}>{line}</Text>
									</li>
								);
							})}
						</ul>
					</div>
				)}

				{result && result.notes.length > 0 && (
					<div className={styles.section}>
						<Text weight="semibold">Good to know</Text>
						<ul className={styles.list}>
							{result.notes.map((note, i) => (
								<li key={i}>
									<Text className={styles.rowText}>{note}</Text>
								</li>
							))}
						</ul>
					</div>
				)}

				{imported && result!.changed && (
					<Caption1 className={styles.muted}>
						Review the changes on the canvas, then publish. Undo takes the whole import
						back.
					</Caption1>
				)}
			</section>
		</AppDialog>
	);
};

export default ImportXmlModal;
