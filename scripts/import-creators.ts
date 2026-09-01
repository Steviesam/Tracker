/**
 * Imports creator sheets straight into the database, without going through the browser.
 *
 * The web upload is capped by the host: a serverless platform will not carry a request
 * body over a few megabytes, and that ceiling cannot be raised on any plan. A directory
 * sheet of tens of thousands of creators is simply larger than that, so the first load of
 * a big list has nowhere to go through the UI.
 *
 * This runs the same parser and the same upsert as the route — deliberately, so the two
 * can never disagree about what a sheet means — but from your machine, where no such
 * limit exists. Point DATABASE_URL at whichever database you mean to fill.
 *
 *   npm run import:creators -- ~/Desktop/creators.xlsx
 *
 * Several files at once is fine; they are read in order, and a handle appearing twice is
 * updated rather than duplicated.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { prisma } from "@/lib/db";
import { readCreators, upsertCreators } from "@/lib/directory/import";
import { formatMetric } from "@/lib/format";

/** The database's host, so it is obvious which one is about to change. Never the password. */
function target(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return "unreadable — check DATABASE_URL";
  }
}

async function importOne(path: string): Promise<number> {
  const name = basename(path);
  console.log(`\n${name}`);

  const buffer = await readFile(path);
  const { records, summary } = await readCreators(buffer, name);

  for (const sheet of summary.sheets) {
    console.log(
      `  ${sheet.sheet}: ${formatMetric(sheet.rows)} rows in ${sheet.blocks} table(s), ` +
        `${formatMetric(sheet.accepted)} creators`,
    );
  }

  if (records.length === 0) {
    console.log("  nothing to import — no header row naming a username column");
    return 0;
  }

  await upsertCreators(records, name);
  console.log(`  imported ${formatMetric(records.length)} creators`);

  // The same caveats the web importer reports, since they change what the filters return.
  if (summary.skippedNoUsername > 0) {
    console.log(`  skipped ${formatMetric(summary.skippedNoUsername)} rows with no handle`);
  }
  if (summary.duplicatesInFile > 0) {
    console.log(`  merged ${formatMetric(summary.duplicatesInFile)} repeated handles`);
  }
  if (summary.statesDerived > 0) {
    console.log(`  filled in ${formatMetric(summary.statesDerived)} states from the city`);
  }
  if (summary.unreadableFollowers > 0) {
    console.log(
      `  ${formatMetric(summary.unreadableFollowers)} follower values were unreadable ` +
        "and stored as N/A",
    );
  }
  if (summary.unmapped.length > 0) {
    console.log(`  kept as notes: ${summary.unmapped.join(", ")}`);
  }

  return records.length;
}

async function main() {
  const paths = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));

  if (paths.length === 0) {
    console.error("Usage: npm run import:creators -- <sheet.xlsx> [more.xlsx ...]");
    process.exitCode = 1;
    return;
  }

  const host = target();
  if (!host) {
    console.error("DATABASE_URL is not set, so there is nothing to import into.");
    process.exitCode = 1;
    return;
  }

  console.log(`Importing into ${host}`);

  let total = 0;
  for (const path of paths) total += await importOne(path);

  console.log(`\nDone. ${formatMetric(total)} creators written to ${host}.`);
}

main()
  .catch((error) => {
    console.error(`\nImport failed: ${error instanceof Error ? error.message : error}`);
    console.error("The upsert runs in one transaction per file, so a failed file wrote nothing.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
