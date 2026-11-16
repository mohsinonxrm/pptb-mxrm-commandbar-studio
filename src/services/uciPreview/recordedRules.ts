import type { RecordedRules } from "@/services/uciPreview/rules";
import recorded from "@/services/uciPreview/recordedRules.json";

/**
 * Display and enable rule outcomes Command Checker reported on CRM279420 (Sales Hub, a System
 * Administrator, 2026-11-15): the rules CBS can't evaluate (custom JavaScript, organization
 * features and settings) and privilege rules it would otherwise assume. Generated from
 * `src/__fixtures__/uci-preview/commandChecker/2026-11-15.json`; `uciPreviewModel191.test.ts` checks it
 * matches and that every rule CBS does evaluate agrees with it.
 */
export const RECORDED_RULES: RecordedRules = recorded;
