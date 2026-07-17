export interface EntityMetadata {
	/** Stable GUID for cross-referencing with solutioncomponents.objectid. */
	metadataId: string;
	logicalName: string;
	displayName: string;
	isCustomEntity: boolean;
	isIntersect: boolean;
	isManaged?: boolean;
	iconSmallName?: string;
	objectTypeCode?: number;
}

export interface EntityFormMetadata {
	formId: string;
	name: string;
}
