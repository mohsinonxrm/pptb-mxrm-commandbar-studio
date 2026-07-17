export type WebResourceType =
	| "html"
	| "css"
	| "js"
	| "xml"
	| "png"
	| "jpg"
	| "gif"
	| "xap"
	| "xsl"
	| "ico"
	| "svg"
	| "resx";

export interface WebResource {
	id: string;
	name: string;
	displayName?: string;
	description?: string;
	webResourceType: WebResourceType;
	sizeBytes?: number;
	modifiedOn?: string;
	isCustom: boolean;
}
