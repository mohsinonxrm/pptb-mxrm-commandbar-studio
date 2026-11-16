/**
 * Dynamics 365's own colours and sizes for Simulate's page (#191), measured on CRM279420 (Sales
 * Hub, 2026-11-15). The page is drawn as Unified Interface draws it, light, whatever CBS's
 * theme: it's a picture of another app.
 */
export const D365 = {
	font: '"Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif',
	/** The app header: 48 px. */
	header: "#021838",
	headerText: "#FFFFFF",
	/** Behind the cards. */
	page: "#F0F0F0",
	surface: "#FFFFFF",
	text: "#242424",
	icon: "#333333",
	secondaryText: "#616161",
	disabledText: "#8A8886",
	hover: "#F5F5F5",
	divider: "#E0E0E0",
	rowDivider: "#F0F0F0",
	brand: "#0F6CBD",
	link: "#115EA3",
	selectedBg: "#EBF3FC",
	dashed: "#C8C6C4",
	/** The command bar's and the view's cards. */
	cardShadow: "0 0 2px rgba(0,0,0,.12), 0 2px 4px rgba(0,0,0,.14)",
	/** The page's frame on Simulate's stage. */
	frameShadow: "0 0 2px rgba(0,0,0,.12), 0 8px 16px rgba(0,0,0,.14)",
} as const;
