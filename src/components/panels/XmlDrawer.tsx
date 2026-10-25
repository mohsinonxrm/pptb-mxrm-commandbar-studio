import React, { useState, useCallback, useEffect, useRef } from "react";
import {
	makeStyles,
	tokens,
	DrawerBody,
	DrawerHeader,
	DrawerHeaderTitle,
	OverlayDrawer,
	Button,
	Tab,
	TabList,
	ToolbarButton,
	MessageBar,
	MessageBarBody,
} from "@fluentui/react-components";
import {
	DismissRegular,
	CopyRegular,
	ArrowDownloadRegular,
	CodeBlockRegular,
	TextEditStyleRegular,
	ArrowUploadRegular,
} from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { loadWebResources } from "@/services/dataverse/webResourceService";
import type { RibbonLocation } from "@/types/ribbon";
import MonacoEditor from "@/components/shared/MonacoEditor";
import { registerMonacoCompletions, disposeMonacoCompletions } from "@/utils/monacoCompletions";
import { copyText, saveTextFile } from "@/utils/hostIO";

const useStyles = makeStyles({
	drawer: {
		width: "960px",
		maxWidth: "90vw",
	},
	body: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		overflow: "hidden",
		// Strip the DrawerBody's default padding so the editor can flush to
		// the edges and the layout stays tight.
		padding: 0,
	},
	infoBar: {
		flexShrink: 0,
		margin: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
	},
	tabRow: {
		flexShrink: 0,
		padding: `0 ${tokens.spacingHorizontalM}`,
	},
	toolbar: {
		flexShrink: 0,
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	editorContainer: {
		flex: 1,
		minHeight: 0, // critical — without this, flex children can overflow their parent
		overflow: "hidden",
	},
});

const LOCATIONS: { label: string; value: RibbonLocation }[] = [
	{ label: "Home Grid", value: "HomepageGrid" },
	{ label: "Sub Grid", value: "SubGrid" },
	{ label: "Form", value: "Form" },
	{ label: "Application", value: "Application" },
];

export const XmlDrawer: React.FC = () => {
	const styles = useStyles();
	const xmlDrawerOpen = useUIStore((s) => s.xmlDrawerOpen);
	const closeXmlDrawer = useUIStore((s) => s.closeXmlDrawer);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const locLabels = useRibbonStore((s) => s.locLabels);

	const openImportXml = useUIStore((s) => s.openImportXml);

	const [activeLocation, setActiveLocation] = useState<RibbonLocation>("HomepageGrid");
	// What Copy / Download did (#122): they no longer fail silently.
	const [status, setStatus] = useState<{ intent: "success" | "error"; text: string } | null>(
		null,
	);
	const [saving, setSaving] = useState(false);
	// A result shows for the XML it was about: one that arrives after a switch is dropped.
	const statusFor = useRef(0);
	useEffect(() => {
		statusFor.current++;
		setStatus(null);
	}, [activeLocation, xmlDrawerOpen]);
	const [webResourceNames, setWebResourceNames] = useState<string[]>([]);

	// Editor instance ref for Format action
	const editorInstanceRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(
		null,
	);
	const monacoRef = useRef<typeof import("monaco-editor") | null>(null);

	// Monaco completion providers — registered once when editor mounts, cleaned up on unmount
	const completionDisposablesRef = useRef<import("monaco-editor").IDisposable[]>([]);
	useEffect(() => {
		if (!xmlDrawerOpen) return;
		void loadWebResources()
			.then((rows) => setWebResourceNames(rows.map((r) => r.name)))
			.catch(() => setWebResourceNames([]));
	}, [xmlDrawerOpen]);

	useEffect(() => {
		return () => {
			disposeMonacoCompletions(completionDisposablesRef.current);
			completionDisposablesRef.current = [];
		};
	}, []);

	const handleEditorMount = useCallback(
		(
			editor: import("monaco-editor").editor.IStandaloneCodeEditor,
			monacoApi: typeof import("monaco-editor"),
		) => {
			editorInstanceRef.current = editor;
			monacoRef.current = monacoApi;
			// Only register once — dispose previous registrations first
			disposeMonacoCompletions(completionDisposablesRef.current);
			completionDisposablesRef.current = registerMonacoCompletions(
				monacoApi,
				() => webResourceNames,
			);
		},
		[webResourceNames],
	);

	useEffect(() => {
		if (!monacoRef.current) return;
		disposeMonacoCompletions(completionDisposablesRef.current);
		completionDisposablesRef.current = registerMonacoCompletions(
			monacoRef.current,
			() => webResourceNames,
		);
	}, [webResourceNames]);

	const handleFormatXml = () => {
		void editorInstanceRef.current?.getAction("editor.action.formatDocument")?.run();
	};

	const getXml = useCallback(
		(location: RibbonLocation): string => {
			try {
				// `generateRibbonDiffXml` deliberately omits the XML declaration
				// (it produces a fragment that gets embedded inside the outer
				// customizations.xml at publish time). For preview / copy /
				// download we want a standalone, well-formed XML document, so
				// prepend the declaration here.
				const fragment = generateRibbonDiffXml({
					location,
					current: ribbons[location],
					baseline: baseline[location],
					commands,
					displayRules,
					enableRules,
					locLabels,
					entityLogicalName: ribbons[location].entityLogicalName,
				});
				return `<?xml version="1.0" encoding="utf-8"?>\n${fragment}`;
			} catch (e) {
				return `<!-- Error generating XML: ${String(e)} -->`;
			}
		},
		[ribbons, baseline, commands, displayRules, enableRules, locLabels],
	);

	const xml = getXml(activeLocation);
	// …nor after the XML changes.
	useEffect(() => {
		statusFor.current++;
		setStatus(null);
	}, [xml]);

	const handleCopy = async () => {
		const asked = statusFor.current;
		const r = await copyText(xml);
		if (asked !== statusFor.current) return;
		setStatus(
			r.ok
				? { intent: "success", text: "Copied the XML to the clipboard." }
				: {
						intent: "error",
						text: `Couldn't copy (${r.error}). Click in the XML, press Ctrl+A, then Ctrl+C.`,
					},
		);
	};

	const handleDownload = async () => {
		const asked = statusFor.current;
		const name = `RibbonDiffXml_${activeLocation}.xml`;
		setSaving(true);
		// While the Save dialog is open, no earlier result (a Copy's) shows (#150).
		setStatus(null);
		try {
			const r = await saveTextFile(name, xml, [{ name: "XML", extensions: ["xml"] }]);
			if (asked !== statusFor.current) return;
			if (r.ok && r.path) setStatus({ intent: "success", text: `Saved to ${r.path}.` });
			// A browser download can't be confirmed, and some hosts block it.
			else if (r.ok)
				setStatus({
					intent: "success",
					text: `Started downloading ${name}. If no file appears, use Copy.`,
				});
			else if (r.canceled) setStatus(null);
			else
				setStatus({
					intent: "error",
					text: `Couldn't save the file (${r.error}). Use Copy instead.`,
				});
		} finally {
			setSaving(false);
		}
	};

	return (
		<OverlayDrawer
			position="end"
			open={xmlDrawerOpen}
			onOpenChange={() => closeXmlDrawer()}
			className={styles.drawer}
		>
			<DrawerHeader>
				<DrawerHeaderTitle
					action={
						<Button
							appearance="subtle"
							icon={<DismissRegular />}
							onClick={closeXmlDrawer}
							aria-label="Close XML drawer"
						/>
					}
				>
					<CodeBlockRegular style={{ marginRight: tokens.spacingHorizontalS }} />
					RibbonDiffXml
				</DrawerHeaderTitle>
			</DrawerHeader>
			<DrawerBody className={styles.body}>
				<MessageBar className={styles.infoBar} intent="info">
					<MessageBarBody>
						This is the <strong>RibbonDiffXml</strong> that will be packaged into your
						solution ZIP and imported into Dataverse. It contains only the delta (your
						changes), not the full ribbon.
					</MessageBarBody>
				</MessageBar>

				<div className={styles.tabRow}>
					<TabList
						selectedValue={activeLocation}
						onTabSelect={(_, d) => setActiveLocation(d.value as RibbonLocation)}
					>
						{LOCATIONS.map((loc) => (
							<Tab key={loc.value} value={loc.value}>
								{loc.label}
							</Tab>
						))}
					</TabList>
				</div>

				<div className={styles.toolbar}>
					<ToolbarButton icon={<CopyRegular />} onClick={() => void handleCopy()}>
						Copy
					</ToolbarButton>
					<ToolbarButton
						icon={<ArrowDownloadRegular />}
						disabled={saving}
						onClick={() => void handleDownload()}
					>
						Download
					</ToolbarButton>
					<ToolbarButton icon={<TextEditStyleRegular />} onClick={handleFormatXml}>
						Format XML
					</ToolbarButton>
					<ToolbarButton icon={<ArrowUploadRegular />} onClick={() => openImportXml(xml)}>
						Import this XML
					</ToolbarButton>
				</div>

				{status && (
					<MessageBar intent={status.intent} className={styles.infoBar} role="status">
						<MessageBarBody>{status.text}</MessageBarBody>
					</MessageBar>
				)}

				<div className={styles.editorContainer}>
					<MonacoEditor
						language="xml"
						value={xml}
						readOnly
						height="100%"
						onMount={handleEditorMount}
					/>
				</div>
			</DrawerBody>
		</OverlayDrawer>
	);
};

export default XmlDrawer;
