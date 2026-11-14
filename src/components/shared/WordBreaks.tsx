import { Fragment } from "react";

/**
 * A camel-case name with a break allowed between its words, so a long one
 * wraps as "ClipboardPaste" → "Clipboard / Paste", not mid-word (#229).
 */
export function WordBreaks({ text }: { text: string }) {
	return (
		<>
			{text.split(/(?=[A-Z])/).map((word, i) => (
				<Fragment key={i}>
					{i > 0 && <wbr />}
					{word}
				</Fragment>
			))}
		</>
	);
}
