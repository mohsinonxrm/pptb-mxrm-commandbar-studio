// Writes assets/badges/version.svg from package.json's version (`npm run version-badge`).
// The README shows repo-hosted badges because PPTB's README viewer doesn't allow
// img.shields.io (RELEASING.md → Tool icon and README images). Same look as the others.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const label = "version";
const color = version.includes("-") ? "#dfb317" : "#007ec6"; // pre-release: yellow

// Approximate Verdana 11px advance widths, in px (close to what shields.io measures).
const widthOf = (text) =>
	[...text].reduce(
		(w, c) => w + (/[0-9]/.test(c) ? 7 : /[.\-]/.test(c) ? 4 : /[a-z]/.test(c) ? 6.5 : 7.5),
		0,
	);
const pad = 10;
const lw = Math.round(widthOf(label) + pad);
const vw = Math.round(widthOf(version) + pad);
const w = lw + vw;
const tl = (text) => Math.round(widthOf(text) * 10);
const text = (x, s) =>
	`<text aria-hidden="true" x="${x}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${tl(s)}">${s}</text>` +
	`<text x="${x}" y="140" transform="scale(.1)" fill="#fff" textLength="${tl(s)}">${s}</text>`;

const svg =
	`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${version}">` +
	`<title>${label}: ${version}</title>` +
	`<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
	`<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>` +
	`<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>` +
	`<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">` +
	text(lw * 5, label) +
	text(lw * 10 + vw * 5, version) +
	`</g></svg>\n`;

writeFileSync(new URL("assets/badges/version.svg", root), svg);
console.log(`assets/badges/version.svg → ${version}`);
