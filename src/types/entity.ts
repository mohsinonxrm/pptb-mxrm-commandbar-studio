export interface EntityMetadata {
	/** Stable GUID for cross-referencing with solutioncomponents.objectid. */
	metadataId: string;
	logicalName: string;
	/** SchemaName (e.g. `Account`, `cbstest_RibbonTest`). Used for the `<Entity><Name>` element of
	 * customizations.xml; Dataverse matches it case-insensitively, so logicalName is a safe fallback. */
	schemaName?: string;
	displayName: string;
	isCustomEntity: boolean;
	isIntersect: boolean;
	isManaged?: boolean;
	iconSmallName?: string;
	objectTypeCode?: number;
}
