import { env } from "~/env";
import { Prisma, PrismaClient } from "../../generated/prisma";

/**
 * Retry budget for queries that never reached the database.
 *
 * The delays double, spanning roughly seven seconds in total. That is sized for
 * the two failures actually observed rather than picked round: opening a
 * connection to the pooler measures about 1.5s, so a couple of quick attempts
 * would all land inside one connect window and prove nothing; and a failing DNS
 * lookup errors instantly and can stay broken for several seconds, which a
 * sub-second budget would sail straight past.
 */
const CONNECT_RETRIES = 4;
const RETRY_DELAY_MS = 500;

/**
 * True only for failures that happened while opening the connection.
 *
 * `PrismaClientInitializationError` is raised before the query is sent, so the
 * statement provably did not execute and replaying it cannot duplicate a write.
 * That is the whole reason the retry is scoped to this one error type rather
 * than to connection errors generally: `P1017`, for instance, means the server
 * closed an established connection, and an `INSERT` that died that way may or
 * may not have committed. Retrying that could approve a device twice.
 */
function isPreExecutionConnectionFailure(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientInitializationError;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createPrismaClient = () => {
  const base = new PrismaClient({
    log:
      env.NODE_ENV === "development" && process.env.PRISMA_QUERY_LOG !== "off"
        ? ["query", "error", "warn"]
        : ["error"],
  });

  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        let lastError: unknown;

        for (let attempt = 0; attempt <= CONNECT_RETRIES; attempt++) {
          try {
            // Prisma types the inner call as `any`; narrowing to `unknown`
            // keeps the result opaque here without weakening any caller, whose
            // types come from the delegate rather than from this wrapper.
            const result: unknown = await query(args);
            return result;
          } catch (error) {
            if (!isPreExecutionConnectionFailure(error)) throw error;
            lastError = error;
            if (attempt === CONNECT_RETRIES) break;

            // Drop the pool before trying again. Without this the retry is
            // pointless: Prisma hands back the same dead connection it just
            // failed on, and every attempt fails identically. Disconnecting
            // forces the next attempt to dial a fresh one, which is what
            // actually recovers, since new connections to the pooler succeed
            // reliably even while a pooled one is stale.
            try {
              await base.$disconnect();
            } catch {
              // Tearing down a pool that is already broken is not a new
              // problem; the reconnect below is what matters.
            }

            await sleep(RETRY_DELAY_MS * 2 ** attempt);
          }
        }

        throw lastError;
      },
    },
  });
};

/**
 * Two unrelated things produce the same "Can't reach database server" against a
 * perfectly healthy database, and the retry above covers both.
 *
 * Supabase's transaction pooler closes connections it considers idle while
 * Prisma keeps them in its own pool and hands one back on the next query,
 * which typically bites on the first request after a quiet period. Separately,
 * a flaky DNS resolver makes the pooler's hostname briefly unresolvable, which
 * fails instantly and takes every connection string with it at once because
 * they share a host.
 *
 * Neither needs anything from the operator, so reconnecting beats showing them
 * a crash page. Note that a persistently wrong DATABASE_URL still fails, just
 * seven seconds later: this defers a real outage, it does not hide one.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
