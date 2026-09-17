import { Prisma } from '@prisma/client';

/**
 * Prisma's code for "a unique constraint rejected this write".
 * https://www.prisma.io/docs/orm/reference/error-reference#p2002
 */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Whether a caught error is a unique-constraint rejection.
 *
 * This is how a race is meant to be resolved here: attempt the write and let
 * the database decide, rather than reading first and hoping the answer is still
 * true by the time the write lands. Checking before writing cannot be made
 * correct — the read yields the event loop — so every uniqueness rule in this
 * app is enforced by an index, and the loser of the race is recognised here.
 *
 * Narrowed to `PrismaClientKnownRequestError` rather than duck-typing a `code`
 * property, so an unrelated error carrying one is not mistaken for a conflict.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_VIOLATION
  );
}
