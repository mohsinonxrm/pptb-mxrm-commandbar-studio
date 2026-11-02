// What every release must update, checked against package.json's version (RELEASING.md): the
// version's shape, package-lock.json, the CHANGELOG section, the version badge and the bundled
// icon. Also builds the version badge and the GitHub Release notes from the CHANGELOG section.
// Used by check-release.mjs and version-badge.mjs; pure functions, so they're unit tested
// (release-checks.test.mjs). Ported from FetchXML Studio (#246).

/** X.Y.Z, X.Y.Z-beta.N or X.Y.Z-rc.N: the shapes release.yml publishes */
export const VERSION_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(beta|rc)\.(0|[1-9]\d*))?$/;

export const isPrerelease = (version) => version.includes("-");

/** Where the README's version badge lives: repo-hosted, since PPTB's README viewer doesn't allow img.shields.io */
export const BADGE_PATH = "assets/badges/version.svg";

/**
 * The version badge for a version, as `npm run version-badge` writes it: shields.io's look,
 * yellow for a pre-release.
 */
export function versionBadgeSvg(version) {
	const label = "version";
	const color = isPrerelease(version) ? "#dfb317" : "#007ec6";
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
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${version}">` +
		`<title>${label}: ${version}</title>` +
		`<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>` +
		`<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>` +
		`<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>` +
		`<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">` +
		text(lw * 5, label) +
		text(lw * 10 + vw * 5, version) +
		`</g></svg>\n`
	);
}

/** The CHANGELOG's `## [name] - date` headings, in order, with their bodies */
export function changelogSections(changelog) {
	const lines = changelog.split(/\r?\n/);
	const sections = [];
	for (const line of lines) {
		// `## [name]`, `## [name] - YYYY-MM-DD`, and anything after the date (`(stable)`, `[YANKED]`)
		const heading = /^## \[([^\]]+)\](.*)$/.exec(line);
		if (heading)
			sections.push({
				name: heading[1],
				date: /^\s+-\s+(\S+)/.exec(heading[2])?.[1],
				body: [],
			});
		else if (sections.length > 0) sections[sections.length - 1].body.push(line);
	}
	return sections.map((s) => ({ ...s, body: s.body.join("\n").trim() }));
}

const isIsoDate = (date) =>
	/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") &&
	!Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
	new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);

/**
 * Problems with the release metadata, or [] when it's consistent.
 * @param {{ pkg: any, lock: any, changelog: string, badge: string | undefined }} files
 */
export function checkReleaseFiles({ pkg, lock, changelog, badge }) {
	const problems = [];
	const version = pkg.version;
	if (!VERSION_PATTERN.test(version ?? "")) {
		problems.push(`package.json version "${version}" isn't X.Y.Z, X.Y.Z-beta.N or X.Y.Z-rc.N.`);
	}
	if (lock?.version !== version || lock?.packages?.[""]?.version !== version) {
		problems.push(
			`package-lock.json has ${lock?.version} / ${lock?.packages?.[""]?.version}, not ${version}. Set the version with \`npm version ${version} --no-git-tag-version\`.`,
		);
	}
	const sections = changelogSections(changelog);
	if (sections[0]?.name !== "Unreleased") {
		problems.push("CHANGELOG.md must start with a `## [Unreleased]` section.");
	}
	const released = sections.find((s) => s.name !== "Unreleased");
	if (released?.name !== version) {
		problems.push(
			`CHANGELOG.md's newest release section is [${released?.name}], not [${version}]. Rename [Unreleased] to \`## [${version}] - YYYY-MM-DD\` and add an empty [Unreleased] above it.`,
		);
	} else {
		if (!isIsoDate(released.date))
			problems.push(
				`CHANGELOG.md's [${version}] section needs a date: \`## [${version}] - YYYY-MM-DD\`.`,
			);
		if (!/^\s*- /m.test(released.body))
			problems.push(`CHANGELOG.md's [${version}] section has no entries.`);
	}
	const duplicates = sections.filter((s) => s.name === version).length;
	if (duplicates > 1) problems.push(`CHANGELOG.md has ${duplicates} [${version}] sections.`);
	// git can check the badge out with CRLF endings; compare the content
	if (badge?.replace(/\r\n/g, "\n") !== versionBadgeSvg(version)) {
		problems.push(`${BADGE_PATH} isn't the ${version} badge. Run \`npm run version-badge\`.`);
	}
	return problems;
}

/** The icon the build must bundle at dist/icons/icon.svg (vite.config.ts toolIcon) */
export const expectedIconSource = (version) =>
	isPrerelease(version) ? "icons/icon-insider.svg" : "icons/icon.svg";

/**
 * The GitHub Release notes: a line on the channel and the PPTB requirement, then the version's
 * CHANGELOG section. release.yml appends GitHub's generated list of PRs and the compare link.
 * @param {{ pkg: any, changelog: string, distTag: string, repository: string }} input
 */
export function releaseNotes({ pkg, changelog, distTag, repository }) {
	const version = pkg.version;
	const name = pkg.displayName ?? pkg.name;
	const section = changelogSections(changelog).find((s) => s.name === version);
	if (!section) throw new Error(`CHANGELOG.md has no [${version}] section.`);
	const minApi = pkg.features?.minAPI;
	let lead;
	if (distTag === "beta") {
		const kind = version.includes("-rc.") ? "Release candidate" : "Beta";
		lead = `**${kind}: preview of ${name} ${version.replace(/-.*/, "")}.** Install it from npm \`beta\`; the stable release stays on npm \`latest\`. The gold Insider icon marks this build in the ToolBox.`;
	} else if (distTag === "latest") {
		lead = `**${name} ${version}.** Install or update it from npm \`latest\`.`;
	} else {
		lead = `**${name} ${version}**, a support release published to npm \`${distTag}\`. The current release is on npm \`latest\`.`;
	}
	const parts = [lead];
	if (minApi)
		parts.push(
			`> ⚠️ **Requires Power Platform ToolBox ${minApi} or later** (\`minAPI\` ${minApi}).`,
		);
	parts.push(section.body);
	parts.push(
		`See [CHANGELOG.md](https://github.com/${repository}/blob/v${version}/CHANGELOG.md) for earlier versions.`,
	);
	return `${parts.join("\n\n")}\n`;
}
