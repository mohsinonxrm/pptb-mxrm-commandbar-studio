import {
	publishWebResource,
	saveWebResource,
	type UpsertWebResourceOptions,
	type UpsertWebResourceResult,
} from "@/services/dataverse/webResourceService";
import { withBusyRetry, type BusyWaitOptions } from "@/services/dataverse/environmentService";
import {
	fluentIconFileName,
	fluentIconWebResourceName,
	toBase64Utf8,
	type FluentIconVariant,
} from "@/utils/iconWebResourceName";

/** webresourcetype code for SVG. */
const SVG_TYPE_CODE = 11;

/**
 * How long a pick keeps retrying the publish while another solution operation
 * runs (15 s, 30 s, 60 s backoff). Bounded: the icon picker waits on it.
 */
const PUBLISH_BUSY_TIMEOUT_MS = 2 * 60_000;

export interface FluentIconWebResource {
	/** Web resource unique name (without `$webresource:`). */
	name: string;
	id: string;
	/** True when CBS uploaded it now; false when an existing web resource was reused. */
	created: boolean;
	/** Set when the web resource could not be published (non-fatal; retried on the next pick). */
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
		options: UpsertWebResourceOptions,
	) => Promise<UpsertWebResourceResult>;
	publish: (id: string) => Promise<void>;
	/** Busy-environment retry for the publish (progress callback; tests inject a fake clock). */
	busy?: BusyWaitOptions;
	/** Ids of icon web resources published in this session (module-wide by default). */
	published?: Set<string>;
}

const defaultDeps: FluentIconWebResourceDeps = {
	save: saveWebResource,
	publish: publishWebResource,
};

/** Icon web resources CBS has published since it was opened. */
const publishedThisSession = new Set<string>();

/** Forgets which icons were published: the ids belong to the previous connection (#120). */
export function resetPublishedIcons(): void {
	publishedThisSession.clear();
}

/**
 * Makes a Fluent icon usable on a classic-ribbon button (#51). A classic
 * `ModernImage` only resolves platform icon names and web resources, so the
 * icon is serialized to SVG and uploaded as a web resource in the active
 * solution (an existing one with the same name is reused, not overwritten,
 * and still added to the solution).
 *
 * The web resource is published unless it was already published in this
 * session — including when it is reused: an earlier pick may have created it
 * and then failed (AddSolutionComponent, or a publish blocked by another
 * solution operation), and an unpublished icon never resolves on the ribbon.
 * A publish blocked by another solution operation (0x80071151) is retried
 * with a bounded backoff.
 */
export async function ensureFluentIconWebResource(
	pascalName: string,
	variant: FluentIconVariant,
	publisherPrefix: string,
	/** Serializes the icon (FluentIcon.fluentIconToSvg; injected to keep the icon registry out of this module). */
	toSvg: FluentIconToSvg,
	deps: Partial<FluentIconWebResourceDeps> = {},
): Promise<FluentIconWebResource> {
	const save = deps.save ?? defaultDeps.save;
	const publish = deps.publish ?? defaultDeps.publish;
	const published = deps.published ?? publishedThisSession;

	const name = fluentIconWebResourceName(publisherPrefix, pascalName, variant);
	const svg = await toSvg(pascalName, 20, variant);
	if (!svg) throw new Error(`Could not convert the Fluent icon "${pascalName}" to SVG`);
	const saved = await save(name, toBase64Utf8(svg), SVG_TYPE_CODE, {
		displayName: `${fluentIconFileName(pascalName, variant)} (CBS icon)`,
		keepExisting: true,
	});
	const result: FluentIconWebResource = { name, id: saved.id, created: saved.created };
	if (!published.has(saved.id)) {
		try {
			await withBusyRetry(`Publishing icon web resource ${name}`, () => publish(saved.id), {
				timeoutMs: PUBLISH_BUSY_TIMEOUT_MS,
				...deps.busy,
			});
			published.add(saved.id);
		} catch (err) {
			result.publishError = err instanceof Error ? err.message : String(err);
		}
	}
	return result;
}
