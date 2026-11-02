// Writes the coverage totals (coverage/coverage-summary.json, from `npm run test:coverage`)
// as a Markdown table to the GitHub run summary, or to stdout outside Actions (#118).
import { appendFileSync, readFileSync } from "node:fs";

const { total } = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"));
const rows = ["lines", "statements", "functions", "branches"].map(
	(k) => `| ${k} | ${total[k].pct}% | ${total[k].covered} / ${total[k].total} |`,
);
const table = ["### Test coverage", "", "| | Covered | |", "|---|---|---|", ...rows, ""].join("\n");

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table);
else process.stdout.write(table);
