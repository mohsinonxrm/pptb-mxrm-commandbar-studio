import { describe, expect, it } from "vitest";
import {
	changelogSections,
	checkReleaseFiles,
	expectedIconSource,
	releaseNotes,
	versionBadgeSvg,
} from "./release-checks.mjs";

const pkg = {
	name: "@scope/tool",
	displayName: "Tool Studio",
	version: "1.5.0-beta.18",
	features: { minAPI: "1.2.7" },
};
const lock = { version: "1.5.0-beta.18", packages: { "": { version: "1.5.0-beta.18" } } };
const changelog = `# Changelog

---

## [Unreleased]

## [1.5.0-beta.18] - 2026-11-01

### 🔧 Changed

- **A change (#69).** Details.

## [1.5.0-beta.17] - 2026-10-31

- Older.
`;
const badge = versionBadgeSvg("1.5.0-beta.18");
const files = { pkg, lock, changelog, badge };

describe("checkReleaseFiles", () => {
	it("passes when everything matches the version", () => {
		expect(checkReleaseFiles(files)).toEqual([]);
	});

	it("passes on a CHANGELOG checked out with CRLF line endings", () => {
		expect(
			checkReleaseFiles({ ...files, changelog: changelog.replace(/\n/g, "\r\n") }),
		).toEqual([]);
	});

	it("allows entries under [Unreleased] above the release", () => {
		const withPending = changelog.replace(
			"## [Unreleased]\n",
			"## [Unreleased]\n\n### 🔧 Fixed\n\n- **Pending.**\n",
		);
		expect(checkReleaseFiles({ ...files, changelog: withPending })).toEqual([]);
	});

	it("flags a version release.yml doesn't publish", () => {
		const v = "1.5.0-alpha.1";
		const problems = checkReleaseFiles({ ...files, pkg: { ...pkg, version: v } });
		expect(problems[0]).toMatch(/isn't X\.Y\.Z/);
	});

	it("flags package-lock.json left on the old version", () => {
		const problems = checkReleaseFiles({
			...files,
			lock: { ...lock, packages: { "": { version: "1.5.0-beta.17" } } },
		});
		expect(problems).toEqual([
			expect.stringMatching(/^package-lock\.json has 1\.5\.0-beta\.18 \/ 1\.5\.0-beta\.17/),
		]);
	});

	it("flags a CHANGELOG whose newest section isn't the version", () => {
		const stale = changelog.replace("## [1.5.0-beta.18] - 2026-11-01", "## [Unreleased-old]");
		expect(checkReleaseFiles({ ...files, changelog: stale }).join(" ")).toMatch(
			/newest release section is \[Unreleased-old\], not \[1\.5\.0-beta\.18\]/,
		);
	});

	it("flags a missing [Unreleased], a missing or invalid date and an empty section", () => {
		const check = (cl) => checkReleaseFiles({ ...files, changelog: cl }).join(" ");
		expect(check(changelog.replace("## [Unreleased]\n", ""))).toMatch(/must start with/);
		expect(check(changelog.replace(" - 2026-11-01", ""))).toMatch(/needs a date/);
		expect(check(changelog.replace("2026-11-01", "2026-02-30"))).toMatch(/needs a date/);
		expect(
			check(changelog.replace("### 🔧 Changed\n\n- **A change (#69).** Details.\n", "")),
		).toMatch(/has no entries/);
	});

	it("flags a duplicated section", () => {
		const twice = `${changelog}\n## [1.5.0-beta.18] - 2026-11-01\n\n- Again.\n`;
		expect(checkReleaseFiles({ ...files, changelog: twice }).join(" ")).toMatch(
			/2 \[1\.5\.0-beta\.18\] sections/,
		);
	});

	it("flags a stale or missing version badge, and accepts one checked out with CRLF", () => {
		const stale = [expect.stringMatching(/version\.svg isn't the 1\.5\.0-beta\.18 badge/)];
		expect(checkReleaseFiles({ ...files, badge: versionBadgeSvg("1.5.0-beta.17") })).toEqual(
			stale,
		);
		expect(checkReleaseFiles({ ...files, badge: undefined })).toEqual(stale);
		expect(checkReleaseFiles({ ...files, badge: badge.replace(/\n/g, "\r\n") })).toEqual([]);
	});
});

describe("versionBadgeSvg / expectedIconSource / changelogSections", () => {
	it("draws the version, yellow for a pre-release and blue for a release", () => {
		expect(versionBadgeSvg("1.5.0-beta.18")).toContain("<title>version: 1.5.0-beta.18</title>");
		expect(versionBadgeSvg("1.5.0-beta.18")).toContain('fill="#dfb317"');
		expect(versionBadgeSvg("1.4.6")).toContain('fill="#007ec6"');
	});

	it("bundles the Insider icon for pre-releases only", () => {
		expect(expectedIconSource("1.5.0-beta.18")).toBe("icons/icon-insider.svg");
		expect(expectedIconSource("1.5.0-rc.1")).toBe("icons/icon-insider.svg");
		expect(expectedIconSource("1.5.0")).toBe("icons/icon.svg");
	});

	it("reads the date of headings with text after it, and keeps their bodies apart", () => {
		const extra = changelog.replace(
			"## [1.5.0-beta.17] - 2026-10-31",
			"## [1.5.0-beta.17] - 2026-10-31 [YANKED]",
		);
		const sections = changelogSections(extra);
		expect(sections[2]).toMatchObject({
			name: "1.5.0-beta.17",
			date: "2026-10-31",
			body: "- Older.",
		});
		expect(sections[1].body).not.toContain("Older");
		const stable = changelog.replace(
			"## [1.5.0-beta.18] - 2026-11-01",
			"## [1.5.0-beta.18] - 2026-11-01 (stable)",
		);
		expect(checkReleaseFiles({ ...files, changelog: stable })).toEqual([]);
	});

	it("reads headings and bodies, normalizing CRLF line endings", () => {
		const sections = changelogSections(changelog.replace(/\n/g, "\r\n"));
		expect(sections.map((s) => [s.name, s.date])).toEqual([
			["Unreleased", undefined],
			["1.5.0-beta.18", "2026-11-01"],
			["1.5.0-beta.17", "2026-10-31"],
		]);
		expect(sections[1].body).toBe("### 🔧 Changed\n\n- **A change (#69).** Details.");
	});
});

describe("releaseNotes", () => {
	it("leads with the channel and the PPTB requirement, then the CHANGELOG section", () => {
		const notes = releaseNotes({ pkg, changelog, distTag: "beta", repository: "o/r" });
		expect(notes)
			.toBe(`**Beta: preview of Tool Studio 1.5.0.** Install it from npm \`beta\`; the stable release stays on npm \`latest\`. The gold Insider icon marks this build in the ToolBox.

> ⚠️ **Requires Power Platform ToolBox 1.2.7 or later** (\`minAPI\` 1.2.7).

### 🔧 Changed

- **A change (#69).** Details.

See [CHANGELOG.md](https://github.com/o/r/blob/v1.5.0-beta.18/CHANGELOG.md) for earlier versions.
`);
	});

	it("calls an rc a release candidate", () => {
		const rc = { ...pkg, version: "1.5.0-rc.1" };
		const cl = changelog.replace("[1.5.0-beta.18]", "[1.5.0-rc.1]");
		expect(
			releaseNotes({ pkg: rc, changelog: cl, distTag: "beta", repository: "o/r" }),
		).toMatch(/^\*\*Release candidate: preview of Tool Studio 1\.5\.0\.\*\*/);
	});

	it("words stable and support releases for their channel", () => {
		const stable = { ...pkg, version: "1.5.0" };
		const cl = changelog.replace("[1.5.0-beta.18]", "[1.5.0]");
		expect(
			releaseNotes({ pkg: stable, changelog: cl, distTag: "latest", repository: "o/r" }),
		).toMatch(/^\*\*Tool Studio 1\.5\.0\.\*\* Install or update it from npm `latest`\./);
		expect(
			releaseNotes({ pkg: stable, changelog: cl, distTag: "support-1.5", repository: "o/r" }),
		).toMatch(/support release published to npm `support-1\.5`/);
	});

	it("fails without the version's section", () => {
		expect(() =>
			releaseNotes({
				pkg: { ...pkg, version: "9.9.9" },
				changelog,
				distTag: "beta",
				repository: "o/r",
			}),
		).toThrow(/no \[9\.9\.9\] section/);
	});
});
