/**
 * Silences Prisma's per-statement query log for CLI scripts.
 *
 * Imported for its side effect, and it must be the first import in any script
 * that reaches the database: modules evaluate in import order, and this has to
 * run before `~/server/db` constructs its client.
 *
 * The log is on by default in development because it is useful behind the dev
 * server. In a test run it buries the results.
 */
process.env.PRISMA_QUERY_LOG ??= "off";
