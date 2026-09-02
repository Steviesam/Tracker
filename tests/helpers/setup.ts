/**
 * Sends the suite at a database of its own.
 *
 * A few tests empty the `User` and `Invite` tables to check what happens on a fresh
 * deployment. Run against the development database, that would delete the account you sign
 * in with and the invites alongside it. Rewriting the connection string here — before any
 * test file imports Prisma, which reads it once at module load — makes that impossible
 * rather than merely unlikely.
 *
 * `TEST_DATABASE_URL` wins if set. Otherwise the development URL is reused with `_test`
 * appended to the database name; if that database does not exist, the tests that need one
 * skip themselves.
 */

const explicit = process.env.TEST_DATABASE_URL?.trim();

if (explicit) {
  process.env.DATABASE_URL = explicit;
} else if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
    process.env.DATABASE_URL = url.toString();
  } catch {
    // An unparseable URL is the deployment's problem, not the suite's: leave it alone and
    // let the reachability check skip the tests that care.
  }
}

process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
