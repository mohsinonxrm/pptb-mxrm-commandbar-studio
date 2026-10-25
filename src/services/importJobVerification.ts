/**
 * Verifies that a solution import actually applied the ribbon customization.
 *
 * Dataverse reports an import as complete (progress 100, no error) even when
 * it skipped the ribbon entirely — e.g. the old `<Entity Name="…">` wrapper was
 * silently ignored (#8). The import job's `data` XML is the authoritative
 * signal:
 *   - entity ribbon  → `<entityRibbon id="<SchemaName>" processed="true"><result result="success" …/>`
 *   - application    → `<ribbons><ribbon … processed="true"><result result="success" …/>`
 */

export type RibbonImportTarget = { kind: "entity"; names: string[] } | { kind: "application" };

export interface RibbonImportVerification {
	ok: boolean;
	message: string;
}

function attr(tag: string, name: string): string | null {
	const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
	return m ? m[1] : null;
}

/** Returns the `<result …>` start tags directly inside the element that starts at `openTag`. */
function resultsAfter(data: string, openTagIndex: number, closingTag: string): string[] {
	const end = data.indexOf(closingTag, openTagIndex);
	const body = data.slice(openTagIndex, end === -1 ? undefined : end);
	return body.match(/<result\s[^>]*>/g) ?? [];
}

function summarize(results: string[]): RibbonImportVerification | null {
	const failure = results.find((r) => attr(r, "result") !== "success");
	if (failure) {
		const code = attr(failure, "errorcode") ?? "";
		const text = attr(failure, "errortext") ?? "unknown error";
		return { ok: false, message: `Dataverse rejected the ribbon (${code}): ${text}` };
	}
	return null;
}

export function verifyRibbonImport(
	data: string | null | undefined,
	target: RibbonImportTarget,
): RibbonImportVerification {
	if (!data) {
		return {
			ok: false,
			message:
				"The import job returned no result data, so the ribbon import could not be verified.",
		};
	}

	if (target.kind === "application") {
		const i = data.search(/<ribbon\s[^>]*processed="true"/);
		if (i === -1) {
			return {
				ok: false,
				message: "Import completed, but Dataverse did not process the application ribbon.",
			};
		}
		return (
			summarize(resultsAfter(data, i, "</ribbon>")) ?? {
				ok: true,
				message: "Application ribbon imported.",
			}
		);
	}

	const wanted = new Set(target.names.filter(Boolean).map((n) => n.toLowerCase()));
	const re = /<entityRibbon\s[^>]*>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(data))) {
		const id = (attr(m[0], "id") ?? "").toLowerCase();
		if (!wanted.has(id)) continue;
		if (attr(m[0], "processed") !== "true") {
			return { ok: false, message: `Dataverse did not process the ribbon for ${id}.` };
		}
		return (
			summarize(resultsAfter(data, m.index, "</entityRibbon>")) ?? {
				ok: true,
				message: `Ribbon for ${id} imported.`,
			}
		);
	}
	return {
		ok: false,
		message:
			`Import completed, but Dataverse did not apply a ribbon for ${target.names.join(" / ")} ` +
			`(no entityRibbon result in the import job). Nothing was changed.`,
	};
}
