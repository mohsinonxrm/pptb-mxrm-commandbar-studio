/** Language names for the LCIDs Dataverse ships, shown instead of flags (#187). */
export const LANGUAGES: Record<number, string> = {
	1033: "English (United States)",
	1031: "German",
	1034: "Spanish (traditional)",
	1036: "French",
	1040: "Italian",
	1041: "Japanese",
	1042: "Korean",
	1043: "Dutch",
	1044: "Norwegian",
	1045: "Polish",
	1046: "Portuguese (Brazil)",
	1049: "Russian",
	1053: "Swedish",
	1054: "Thai",
	1055: "Turkish",
	1057: "Indonesian",
	1058: "Ukrainian",
	1066: "Vietnamese",
	2052: "Chinese (Simplified)",
	3082: "Spanish (Spain)",
};
export const languageName = (lcid: number) => LANGUAGES[lcid] ?? `Language ${lcid}`;
