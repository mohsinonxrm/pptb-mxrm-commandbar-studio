import React, { Suspense } from "react";
import { Spinner } from "@fluentui/react-components";
import { useUIStore } from "@/store/uiStore";

const MonacoEditorLazy = React.lazy(() => import("@monaco-editor/react"));

export interface MonacoEditorProps {
	language: "xml" | "javascript" | "typescript" | "css" | "html" | "json";
	value: string;
	onChange?: (value: string) => void;
	readOnly?: boolean;
	height?: string | number;
	options?: Record<string, unknown>;
	onMount?: (
		editor: import("monaco-editor").editor.IStandaloneCodeEditor,
		monaco: typeof import("monaco-editor"),
	) => void;
}

export const MonacoEditor: React.FC<MonacoEditorProps> = ({
	language,
	value,
	onChange,
	readOnly = false,
	height = "100%",
	options = {},
	onMount,
}) => {
	const themeMode = useUIStore((s) => s.themeMode);
	const monacoTheme = themeMode === "dark" ? "vs-dark" : "vs";

	const mergedOptions: Record<string, unknown> = {
		readOnly,
		minimap: { enabled: false },
		wordWrap: language === "xml" ? "on" : "off",
		scrollBeyondLastLine: false,
		automaticLayout: true,
		...options,
	};

	const handleChange = (val: string | undefined) => {
		if (onChange && val !== undefined) onChange(val);
	};

	return (
		<Suspense fallback={<Spinner size="medium" label="Loading editor…" />}>
			<MonacoEditorLazy
				height={height}
				language={language}
				value={value}
				theme={monacoTheme}
				options={mergedOptions}
				onChange={handleChange}
				onMount={onMount}
			/>
		</Suspense>
	);
};

export default MonacoEditor;
