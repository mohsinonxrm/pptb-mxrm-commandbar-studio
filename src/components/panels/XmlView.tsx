import React, { useState, useCallback, useEffect, useRef } from "react";
import {
	makeStyles,
	tokens,
	Caption1,
	Tab,
	TabList,
	Toolbar,
	ToolbarButton,
	MessageBar,
	MessageBarBody,
} from "@fluentui/react-components";
import {
	CopyRegular,
	ArrowDownloadRegular,
	TextEditStyleRegular,
	ArrowUploadRegular,
} from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { loadWebResources } from "@/services/dataverse/webResourceService";
import { LOCATION_INFO } from "@/constants/locationInfo";
import type { RibbonLocation } from "@/types/ribbon";
import MonacoEditor from "@/components/shared/MonacoEditor";
import { registerMonacoCompletions, disposeMonacoCompletions } from "@/utils/monacoCompletions";
import { copyText, saveTextFile } from "@/utils/hostIO";

const useStyles = makeStyles({
	// A view of the editor drawer (#186): the drawer's body is a column the
	// editor fills.
	root: {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		minHeight: "320px",
	},
	muted: { color: tokens.colorNeutralForeground3 },
	editor: {
		flex: 1,
		minHeight: "240px",
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		overflow: "hidden",
	},
});

const LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form", "Application"];

/**
 * The RibbonDiffXml of your changes, one location at a time, as a view of the
 * editor drawer (#186). It opens on the location you're looking at.
 */
export const XmlView: React.FC<{ location: RibbonLocation }> = ({ location }) => {
	const styles = useStyles();
	const closeEditor = useUIStore((s) => s.closeEditor);
	const openImportXml = useUIStore((s) => s.openImportXml);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const locLabels = useRibbonStore((s) => s.locLabels);

	const [activeLocation, setActiveLocation] = useState<RibbonLocation>(location);
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
	}, [activeLocation]);
	const [webResourceNames, setWebResourceNames] = useState<string[]>([]);

	// Editor instance ref for Format action
	const editorInstanceRef = useRef<
		import("monaco-editor/editor/editor.api").editor.IStandaloneCodeEditor | null
	>(null);
	const monacoRef = useRef<typeof import("monaco-editor/editor/editor.api") | null>(null);

	// Monaco completion providers — registered once when editor mounts, cleaned up on unmount
	const completionDisposablesRef = useRef<
		import("monaco-editor/editor/editor.api").IDisposable[]
	>([]);
	useEffect(() => {
		void loadWebResources()
			.then((rows) => setWebResourceNames(rows.map((r) => r.name)))
			.catch(() => setWebResourceNames([]));
	}, []);

	useEffect(() => {
		return () => {
			disposeMonacoCompletions(completionDisposablesRef.current);
			completionDisposablesRef.current = [];
		};
	}, []);

	const handleEditorMount = useCallback(
		(
			editor: import("monaco-editor/editor/editor.api").editor.IStandaloneCodeEditor,
			monacoApi: typeof import("monaco-editor/editor/editor.api"),
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
		(loc: RibbonLocation): string => {
			try {
				// `generateRibbonDiffXml` deliberately omits the XML declaration
				// (it produces a fragment that gets embedded inside the outer
				// customizations.xml at publish time). For preview / copy /
				// download we want a standalone, well-formed XML document, so
				// prepend the declaration here.
				const fragment = generateRibbonDiffXml({
					location: loc,
					current: ribbons[loc],
					baseline: baseline[loc],
					commands,
					displayRules,
					enableRules,
					locLabels,
					entityLogicalName: ribbons[loc].entityLogicalName,
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
		<div className={styles.root}>
			<Caption1 className={styles.muted}>
				Your changes to this location, as RibbonDiffXml. Publish merges them into your
				solution&apos;s layer; its View XML shows the merged result.
			</Caption1>
			<TabList
				size="small"
				selectedValue={activeLocation}
				onTabSelect={(_, d) => setActiveLocation(d.value as RibbonLocation)}
			>
				{LOCATIONS.map((loc) => (
					<Tab key={loc} value={loc}>
						{LOCATION_INFO[loc].label}
					</Tab>
				))}
			</TabList>
			<Toolbar size="small" aria-label="XML actions">
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
					Format
				</ToolbarButton>
				<ToolbarButton
					icon={<ArrowUploadRegular />}
					onClick={() => {
						// The import dialog takes the place of the drawer, not a dialog over it.
						closeEditor();
						openImportXml(xml);
					}}
				>
					Import this XML
				</ToolbarButton>
			</Toolbar>
			{status && (
				<MessageBar intent={status.intent} role="status">
					<MessageBarBody>{status.text}</MessageBarBody>
				</MessageBar>
			)}
			<div className={styles.editor}>
				<MonacoEditor
					language="xml"
					value={xml}
					readOnly
					height="100%"
					onMount={handleEditorMount}
				/>
			</div>
		</div>
	);
};

export default XmlView;
