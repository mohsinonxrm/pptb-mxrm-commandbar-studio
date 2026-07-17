export interface Solution {
	id: string;
	uniqueName: string;
	friendlyName: string;
	version: string;
	isManaged: boolean;
	publisherId: string;
	/** Publisher's `uniquename` field (e.g. `mohsinonxrm`). Needed in solution.xml's
	 * `<Publisher><UniqueName>` element so Dataverse routes the import to the
	 * correct publisher instead of falling back to the default "new" one. */
	publisherUniqueName: string;
	/** Publisher's display name (e.g. `MohsinOnXrm`). */
	publisherName: string;
	/** Publisher's `customizationprefix` (e.g. `mxrm` — without trailing underscore). */
	publisherPrefix: string;
	versionNumber?: number;
}
