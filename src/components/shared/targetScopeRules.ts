/**
 * What a write's confirmation says about its target (#121): the environment and the scope.
 * Pure, so the wording and the type-to-confirm rule are unit-tested. Same rules as FetchXML
 * Studio's (its #69), so the studios ask the same way.
 *
 * PPTB Marketplace policy for tools that change data: confirmations name the target environment
 * and the scope. https://docs.powerplatformtoolbox.com/policies/marketplace
 */

/** PPTB connection environment types: "Dev" | "Test" | "UAT" | "Production" (@pptb/types 1.2.7). */
export const isProductionEnvironment = (environment: string | undefined | null): boolean =>
	environment?.trim().toLowerCase() === "production";

/** Whether the user types a confirmation word before the write: on a Production connection. */
export const requiresTypedConfirmation = (environment: string | undefined | null): boolean =>
	isProductionEnvironment(environment);

/** Whether the typed text confirms: the expected word, ignoring case and surrounding spaces. */
export const isTypedConfirmation = (typed: string, expected: string): boolean =>
	expected.trim() !== "" && typed.trim().toLowerCase() === expected.trim().toLowerCase();
