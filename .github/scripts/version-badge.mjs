// Writes assets/badges/version.svg from package.json's version (`npm run version-badge`).
// The README shows repo-hosted badges because PPTB's README viewer doesn't allow
// img.shields.io (RELEASING.md → Tool icon and README images). Same look as the others.
// check-release.mjs fails when the badge isn't this version's (#246).
import { readFileSync, writeFileSync } from "node:fs";
import { BADGE_PATH, versionBadgeSvg } from "./release-checks.mjs";

const root = new URL("../../", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

writeFileSync(new URL(BADGE_PATH, root), versionBadgeSvg(version));
console.log(`${BADGE_PATH} → ${version}`);
