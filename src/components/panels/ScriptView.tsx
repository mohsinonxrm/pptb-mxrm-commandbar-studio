import { useEffect, useState } from "react";
import {
	Button,
	MessageBar,
	MessageBarBody,
	Spinner,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { EnvironmentBadge } from "@/components/shell/EnvironmentBadge";
import MonacoEditor from "@/components/shared/MonacoEditor";
import { writeGuard } from "@/services/hostConnection";
import {
	loadWebResourceByName,
	loadWebResourceContent,
	saveWebResource,
} from "@/services/dataverse/webResourceService";

/**
 * A JavaScript action's web resource as a view of the editor drawer (#186):
 * read-only, or editable with Save, which writes it to Dataverse straight
 * away (it isn't a ribbon change, so Publish and Undo don't cover it).
 */

const useStyles = makeStyles({
	root: {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		minHeight: "300px",
	},
	editor: {
		flex: 1,
		minHeight: "240px",
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		overflow: "hidden",
	},
	save: {
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-end",
		gap: tokens.spacingHorizontalS,
	},
});

const decodeBase64Utf8 = (base64: string): string =>
	base64 ? new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))) : "";

const encodeUtf8Base64 = (text: string): string => {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
};

const TYPE_CODES: Record<string, number> = {
	html: 1,
	css: 2,
	js: 3,
	xml: 4,
	png: 5,
	jpg: 6,
	gif: 7,
	xsl: 9,
	ico: 10,
	svg: 11,
	resx: 12,
};
const typeCodeOf = (name: string) => TYPE_CODES[name.split(".").pop()?.toLowerCase() ?? ""] ?? 3;

export function ScriptView({ name, editable }: { name: string; editable: boolean }) {
	const styles = useStyles();
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [missing, setMissing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [warning, setWarning] = useState<string | null>(null);
	const [value, setValue] = useState("");
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		let live = true;
		(async () => {
			try {
				const target = await loadWebResourceByName(name);
				if (!live) return;
				if (!target) {
					setMissing(true);
					return;
				}
				const content = await loadWebResourceContent(target.id);
				if (live) setValue(decodeBase64Utf8(content));
			} catch (e: unknown) {
				if (live) setError(e instanceof Error ? e.message : "Couldn't load the script.");
			} finally {
				if (live) setLoading(false);
			}
		})();
		return () => {
			live = false;
		};
	}, [name]);

	const save = async () => {
		const guard = writeGuard(); // the script goes to the connection it was edited on (#120)
		setSaving(true);
		setError(null);
		setWarning(null);
		try {
			const saved = await saveWebResource(name, encodeUtf8Base64(value), typeCodeOf(name), {
				displayName: name.split("/").pop(),
				guard,
			});
			setWarning(
				[saved.solutionWarning, saved.publishWarning].filter(Boolean).join(" ") || null,
			);
			setDirty(false);
		} catch (e: unknown) {
			setError(e instanceof Error ? e.message : "Couldn't save the script.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className={styles.root}>
			{missing && (
				<MessageBar intent="warning">
					<MessageBarBody>
						There's no web resource named {name} in this environment. Check the action's
						library.
					</MessageBarBody>
				</MessageBar>
			)}
			{error && (
				<MessageBar intent="error">
					<MessageBarBody>{error}</MessageBarBody>
				</MessageBar>
			)}
			{warning && (
				<MessageBar intent="warning">
					<MessageBarBody>{warning}</MessageBarBody>
				</MessageBar>
			)}
			{loading ? (
				<Spinner size="small" label="Loading the script…" />
			) : (
				!missing && (
					<>
						{editable && (
							<div className={styles.save}>
								<EnvironmentBadge prefix="Saves to" />
								<Button
									appearance="primary"
									disabled={!dirty || saving}
									onClick={() => void save()}
								>
									{saving ? "Saving…" : "Save script"}
								</Button>
							</div>
						)}
						<div className={styles.editor}>
							<MonacoEditor
								language="javascript"
								value={value}
								readOnly={!editable}
								onChange={(next) => {
									setValue(next);
									setDirty(true);
								}}
								options={{ wordWrap: "on" }}
							/>
						</div>
					</>
				)
			)}
		</div>
	);
}

export default ScriptView;
