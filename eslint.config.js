import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["dist", "coverage", "node_modules"] },
	{
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: 2022,
			globals: globals.browser,
		},
		plugins: {
			"react-hooks": reactHooks,
			"react-refresh": reactRefresh,
			"jsx-a11y": jsxA11y,
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			"react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/no-explicit-any": "error",
		},
	},
	{
		// Fluent UI v9 only in components (#190): no raw form/table elements, and no text in a
		// 10 px "extra-small" Badge (its text spills over neighbours, #182).
		files: ["src/components/**/*.tsx"],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					selector:
						"JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^(button|input|select|textarea|table)$/]",
					message:
						"Use the Fluent UI v9 component (Button, Input, Dropdown/Combobox, Textarea, Table/DataGrid) instead of a raw element.",
				},
				{
					selector:
						"JSXElement[openingElement.name.name='Badge'][children.length>0]:has(JSXOpeningElement > JSXAttribute[name.name='size'][value.value='extra-small'])",
					message:
						'An extra-small Badge is a 10 px dot: its text overlaps. Use size="small" or larger, or a dot with a Tooltip.',
				},
			],
		},
	},
	{
		// Files that still break the rule above. Remove each one as its UI/UX issue fixes it (#193);
		// don't add new ones.
		files: [
			"src/components/bottom-panel/BottomPanel.tsx",
			"src/components/command-palette/CommandPalette.tsx",
			"src/components/modals/IconPickerModal.tsx",
			"src/components/modals/LocalizationEditor.tsx",
			"src/components/panels/WebResourceBrowser.tsx",
			"src/components/properties-pane/IdentitySection.tsx",
			"src/components/ribbon-canvas/ClassicRibbon.tsx",
			"src/components/ribbon-canvas/FlyoutMenuPanel.tsx",
			"src/components/ribbon-canvas/ModernCommandBar.tsx",
			"src/components/ribbon-canvas/modern/ModernCommandChip.tsx",
		],
		rules: {
			"no-restricted-syntax": "off",
		},
	},
	{
		// Node-side config files (Vite, Vitest, ESLint itself).
		files: ["*.config.{js,ts}"],
		languageOptions: {
			globals: globals.node,
		},
	},
	{
		files: ["**/*.test.{ts,tsx}", "**/test-setup.ts"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
);
