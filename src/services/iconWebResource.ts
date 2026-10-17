import {
	publishWebResource,
	saveWebResource,
	type UpsertWebResourceResult,
} from "@/services/dataverse/webResourceService";
import {
	fluentIconWebResourceName,
	toBase64Utf8,
	toSnakeCase,
	type FluentIconVariant,
} from "@/utils/iconWebResourceName";

/** webresourcetype code for SVG. */
const SVG_TYPE_CODE = 11;

export interface FluentIconWebResource {
	/** Web resource unique name (without `$webresource:`). */
	name: string;
	id: string;
	/** True when CBS uploaded it now; false when an existing web resource was reused. */
	created: boolean;
	/** Set when the new web resource could not be published (non-fatal). */
	publishError?: string;
}

export type FluentIconToSvg = (
	name: string,
	size?: number,
	variant?: FluentIconVariant,
) => Promise<string | null>;

export interface FluentIconWebResourceDeps {
	save: (
		name: string,
		content: string,
		typeCode: number,
		options: { displayName?: string; keepExisting?: boolean },
	) => Promise<UpsertWebResourceResult>;
	publish: (id: string) => Promise<void>;
}

const defaultDeps: FluentIconWebResourceDeps = {
	save: saveWebResource,
	publish: publishWebResource,
};

/**
 * Makes a Fluent icon usable on a classic-ribbon button (#51). A classic
 * `ModernImage` only resolves platform icon names and web resources, so the
 * icon is serialized to SVG and uploaded as a web resource in the active
 * solution (an existing one with the same name is reused, not overwritten).
 * A newly created web resource is published so the ribbon can resolve it.
 */
export async function ensureFluentIconWebResource(
	pascalName: string,
	variant: FluentIconVariant,
	publisherPrefix: string,
	/** Serializes the icon (FluentIcon.fluentIconToSvg; injected to keep the icon registry out of this module). */
	toSvg: FluentIconToSvg,
	deps: FluentIconWebResourceDeps = defaultDeps,
): Promise<FluentIconWebResource> {
	const name = fluentIconWebResourceName(publisherPrefix, pascalName, variant);
	const svg = await toSvg(pascalName, 20, variant);
	if (!svg) throw new Error(`Could not convert the Fluent icon "${pascalName}" to SVG`);
	const saved = await deps.save(name, toBase64Utf8(svg), SVG_TYPE_CODE, {
		displayName: `${toSnakeCase(pascalName)}${variant === "filled" ? "_filled" : ""}.svg (CBS icon)`,
		keepExisting: true,
	});
	const result: FluentIconWebResource = { name, id: saved.id, created: saved.created };
	if (saved.created) {
		try {
			await deps.publish(saved.id);
		} catch (err) {
			result.publishError = err instanceof Error ? err.message : String(err);
		}
	}
	return result;
}
