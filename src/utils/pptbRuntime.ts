// Detects whether CBS is running inside the PPTB host frame
export function isInsidePPTB(): boolean {
	return typeof window.toolboxAPI !== "undefined" && typeof window.dataverseAPI !== "undefined";
}
