import React, { useState } from "react";
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
	Tab,
	TabList,
	Divider,
} from "@fluentui/react-components";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { validateRibbonDiffXml, type ValidationError } from "@/services/xmlValidator";
import MonacoEditor from "@/components/shared/MonacoEditor";

/** Apply a RibbonDiffXml document to the store (append or replace commands/rules/labels). */
function applyRibbonDiffXml(xmlText: string, mode: "replace" | "append"): void {
	const store = useRibbonStore.getState();
	const location = useSelectionStore.getState().location;

	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlText, "application/xml");

	if (doc.querySelector("parsererror")) return;

	// Extract CommandDefinitions
	doc.querySelectorAll("CommandDefinition").forEach((el) => {
		const id = el.getAttribute("Id");
		if (!id) return;
		const enableRules: string[] = [];
		const displayRules: string[] = [];
		el.querySelectorAll("EnableRules > EnableRule").forEach((r) => {
			const rid = r.getAttribute("Id");
			if (rid) enableRules.push(rid);
		});
		el.querySelectorAll("DisplayRules > DisplayRule").forEach((r) => {
			const rid = r.getAttribute("Id");
			if (rid) displayRules.push(rid);
		});
		store.upsertCommand({ id, enableRules, displayRules, actions: [] });
	});

	// Extract LocLabels
	doc.querySelectorAll("LocLabel").forEach((el) => {
		const id = el.getAttribute("Id");
		if (!id) return;
		const titles: { languageCode: number; description: string }[] = [];
		el.querySelectorAll("Title").forEach((t) => {
			const lc = Number(t.getAttribute("languagecode") ?? 0);
			const desc = t.getAttribute("description") ?? "";
			if (lc) titles.push({ languageCode: lc, description: desc });
		});
		store.upsertLocLabel({ id, titles });
	});

	// Extract EnableRules
	doc.querySelectorAll("EnableRules > EnableRule").forEach((el) => {
		const id = el.getAttribute("Id");
		if (!id) return;
		store.upsertEnableRule({ id, steps: [] });
	});

	// Extract DisplayRules
	doc.querySelectorAll("DisplayRules > DisplayRule").forEach((el) => {
		const id = el.getAttribute("Id");
		if (!id) return;
		store.upsertDisplayRule({ id, steps: [] });
	});

	// For "replace" mode, also load any CustomAction buttons into the active ribbon
	if (mode === "replace") {
		const nextRibbons = structuredClone(store.ribbons);
		const ribbon = nextRibbons[location];

		doc.querySelectorAll("CustomAction").forEach((ca) => {
			const locAttr = ca.getAttribute("Location") ?? "";
			const seq = Number(ca.getAttribute("Sequence") ?? 0);
			const def = ca.querySelector("CommandUIDefinition > Button");
			if (!def) return;
			const id = def.getAttribute("Id") ?? "";
			const label = def.getAttribute("LabelText") ?? id;
			const command = def.getAttribute("Command") ?? "";
			const alias = def.getAttribute("TemplateAlias") ?? "o1";
			if (!id) return;

			// Find or create a group to host this button
			let placed = false;
			for (const tab of ribbon.tabs) {
				for (const group of tab.groups) {
					if (locAttr.startsWith(group.id)) {
						const exists = group.buttons.find((b) => b.id === id);
						if (!exists) {
							group.buttons.push({
								id,
								label,
								commandId: command,
								templateAlias: alias,
								sequence: seq,
								kind: "button",
								hidden: false,
								oob: false,
								custom: true,
								managed: false,
							});
						}
						placed = true;
						break;
					}
				}
				if (placed) break;
			}
		});

		store.loadRibbons(nextRibbons);
	}
}

export const ImportXmlModal: React.FC = () => {
	const importXmlOpen = useUIStore((s) => s.importXmlOpen);
	const closeImportXml = useUIStore((s) => s.closeImportXml);

	const [xmlText, setXmlText] = useState("");
	const [errors, setErrors] = useState<ValidationError[]>([]);
	const [mode, setMode] = useState<"replace" | "append">("replace");

	const handleValidate = () => {
		const errs = validateRibbonDiffXml(xmlText);
		setErrors(errs);
		return errs.length === 0;
	};

	const handleImport = () => {
		if (!handleValidate()) return;
		applyRibbonDiffXml(xmlText, mode);
		closeImportXml();
	};

	return (
		<Dialog open={importXmlOpen} onOpenChange={() => closeImportXml()}>
			<DialogSurface
				style={{ maxWidth: "960px", width: "92vw", height: "80vh", maxHeight: "860px" }}
			>
				<DialogTitle>Import RibbonDiffXml</DialogTitle>
				<DialogBody style={{ height: "100%", display: "flex", flexDirection: "column" }}>
					<DialogContent
						style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
					>
						<TabList
							selectedValue={mode}
							onTabSelect={(_, d) => setMode(d.value as "replace" | "append")}
						>
							<Tab value="replace">Replace current</Tab>
							<Tab value="append">Merge / append</Tab>
						</TabList>
						<Divider style={{ margin: "8px 0" }} />

						<div style={{ flex: 1, minHeight: 0 }}>
							<MonacoEditor
								language="xml"
								value={xmlText}
								onChange={setXmlText}
								readOnly={false}
								height="100%"
								options={{
									wordWrap: "on",
									lineNumbers: "on",
									padding: { top: 8 },
								}}
							/>
						</div>

						{errors.length > 0 && (
							<div
								style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}
							>
								{errors.map((err, i) => (
									<MessageBar key={i} intent="error">
										<MessageBarBody>
											{err.message}
											{err.lineHint ? ` (${err.lineHint})` : ""}
										</MessageBarBody>
									</MessageBar>
								))}
							</div>
						)}

						{errors.length === 0 && xmlText && (
							<MessageBar intent="success">
								<MessageBarBody>XML is valid.</MessageBarBody>
							</MessageBar>
						)}
					</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={closeImportXml}>
							Cancel
						</Button>
						<Button appearance="secondary" onClick={handleValidate} disabled={!xmlText.trim()}>
							Validate
						</Button>
						<Button appearance="primary" onClick={handleImport} disabled={!xmlText.trim()}>
							Import
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default ImportXmlModal;
