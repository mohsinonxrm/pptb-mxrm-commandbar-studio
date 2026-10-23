import React, { useEffect, useState } from "react";
import {
	Dialog,
	DialogSurface,
	DialogTitle,
	DialogBody,
	DialogContent,
	DialogActions,
	Button,
	MessageBar,
	MessageBarBody,
	MessageBarTitle,
	Text,
} from "@fluentui/react-components";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { validateRibbonDiffXml, type ValidationError } from "@/services/xmlValidator";
import { importRibbonDiffXml, type RibbonDiffImportResult } from "@/services/ribbonDiffImport";
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

const ReportList: React.FC<{ items: string[] }> = ({ items }) => (
	<ul style={{ margin: "4px 0 0", paddingLeft: "20px", maxHeight: "160px", overflowY: "auto" }}>
		{items.map((item, i) => (
			<li key={i}>
				<Text size={200}>{item}</Text>
			</li>
		))}
	</ul>
);

export const ImportXmlModal: React.FC = () => {
	const importXmlOpen = useUIStore((s) => s.importXmlOpen);
	const importXmlSeed = useUIStore((s) => s.importXmlSeed);
	const importXmlNote = useUIStore((s) => s.importXmlNote);
	const closeImportXml = useUIStore((s) => s.closeImportXml);

	const [xmlText, setXmlText] = useState("");
	const [errors, setErrors] = useState<ValidationError[]>([]);
	const [report, setReport] = useState<{
		result: RibbonDiffImportResult;
		imported: boolean;
	} | null>(null);
	const [failure, setFailure] = useState("");

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
		if (!report?.imported) setReport(null);
	};

	const handleValidate = () => {
		const errs = validateRibbonDiffXml(xmlText);
		setErrors(errs);
		// Warnings (e.g. rule placement the platform itself tolerates) don't block.
		return errs.every((e) => e.severity === "warning");
	};

	const run = (commit: boolean) => {
		if (!handleValidate()) return;
		setFailure("");
		try {
			setReport({ result: runRibbonDiffImport(xmlText, commit), imported: commit });
		} catch (e) {
			setReport(null);
			setFailure(e instanceof Error ? e.message : String(e));
		}
	};

	const imported = report?.imported === true;
	const result = report?.result;

	return (
		<Dialog open={importXmlOpen} onOpenChange={() => closeImportXml()}>
			<DialogSurface
				style={{ maxWidth: "960px", width: "92vw", height: "80vh", maxHeight: "860px" }}
			>
				<DialogTitle>Import RibbonDiffXml</DialogTitle>
				<DialogBody style={{ height: "100%", display: "flex", flexDirection: "column" }}>
					<DialogContent
						style={{
							flex: 1,
							minHeight: 0,
							display: "flex",
							flexDirection: "column",
							gap: "8px",
						}}
					>
						<Text size={200}>
							Paste a RibbonDiffXml (for example from Ribbon Workbench or a
							solution&apos;s customizations.xml — the loaded table&apos;s part is
							used, or the application ribbon&apos;s when that is on screen).
							Commands, rules and labels are added or replaced by id; new buttons,
							groups and tabs are added to the loaded ribbon; overrides and hides edit
							the existing controls. Everything imported becomes one unpublished
							change, which Undo takes back as a whole.
						</Text>

						{importXmlNote && !xmlText && (
							<MessageBar intent="info">
								<MessageBarBody>{importXmlNote}</MessageBarBody>
							</MessageBar>
						)}

						<div style={{ flex: 1, minHeight: 0 }}>
							<MonacoEditor
								language="xml"
								value={xmlText}
								onChange={handleChange}
								readOnly={imported}
								height="100%"
								options={{
									wordWrap: "on",
									lineNumbers: "on",
									padding: { top: 8 },
								}}
							/>
						</div>

						{errors.length > 0 && (
							<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
								{errors.map((err, i) => (
									<MessageBar
										key={i}
										intent={err.severity === "warning" ? "warning" : "error"}
									>
										<MessageBarBody>
											{err.message}
											{err.lineHint ? ` (${err.lineHint})` : ""}
										</MessageBarBody>
									</MessageBar>
								))}
							</div>
						)}

						{failure && (
							<MessageBar intent="error">
								<MessageBarBody>{failure}</MessageBarBody>
							</MessageBar>
						)}

						{result && (
							<MessageBar
								intent={result.changed ? "success" : "info"}
								layout="multiline"
							>
								<MessageBarBody>
									<MessageBarTitle>
										{imported
											? result.changed
												? "Imported — review the changes, then publish"
												: "Nothing to import — the session already has all of it"
											: "Preview — nothing has changed yet"}
									</MessageBarTitle>
									{result.applied.length > 0 && (
										<ReportList items={result.applied} />
									)}
								</MessageBarBody>
							</MessageBar>
						)}

						{result && result.notes.length > 0 && (
							<MessageBar intent="info" layout="multiline">
								<MessageBarBody>
									<MessageBarTitle>Good to know</MessageBarTitle>
									<ReportList items={result.notes} />
								</MessageBarBody>
							</MessageBar>
						)}

						{result && result.notApplied.length > 0 && (
							<MessageBar intent="warning" layout="multiline">
								<MessageBarBody>
									<MessageBarTitle>
										{imported
											? "Not imported / won't be published"
											: "Can't be imported / won't be published"}
									</MessageBarTitle>
									<ReportList items={result.notApplied} />
								</MessageBarBody>
							</MessageBar>
						)}
					</DialogContent>
					<DialogActions>
						{imported ? (
							<Button appearance="primary" onClick={closeImportXml}>
								Close
							</Button>
						) : (
							<>
								<Button appearance="secondary" onClick={closeImportXml}>
									Cancel
								</Button>
								<Button
									appearance="secondary"
									onClick={() => run(false)}
									disabled={!xmlText.trim()}
								>
									Preview
								</Button>
								<Button
									appearance="primary"
									onClick={() => run(true)}
									disabled={!xmlText.trim()}
								>
									Import
								</Button>
							</>
						)}
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default ImportXmlModal;
