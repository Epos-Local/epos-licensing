/** A test harness small enough not to need a test framework. */

let passed = 0;
const failures: string[] = [];
let currentGroup = "";

export function group(name: string): void {
  currentGroup = name;
  console.log(`\n${name}`);
}

export function check(
  description: string,
  condition: boolean,
  detail?: string,
): void {
  if (condition) {
    passed++;
    console.log(`  pass  ${description}`);
    return;
  }

  failures.push(
    `${currentGroup} > ${description}${detail ? `\n        ${detail}` : ""}`,
  );
  console.log(`  FAIL  ${description}`);
  if (detail) console.log(`        ${detail}`);
}

export function checkEqual(
  description: string,
  actual: unknown,
  expected: unknown,
): void {
  const same = Object.is(actual, expected);
  check(
    description,
    same,
    same
      ? undefined
      : `expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`,
  );
}

export function summarize(title: string): void {
  console.log(`\n${"-".repeat(60)}`);

  if (failures.length === 0) {
    console.log(`${title}: ${passed} checks passed.`);
    return;
  }

  console.log(`${title}: ${passed} passed, ${failures.length} FAILED\n`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exitCode = 1;
}

export function failed(): boolean {
  return failures.length > 0;
}

/**
 * Retries fixture teardown once.
 *
 * Supabase's transaction pooler drops idle connections, and a teardown that
 * gives up leaves test rows in whatever database the run was pointed at. One
 * retry is the difference between a flaky connection and litter in production.
 */
export async function cleanUp(teardown: () => Promise<void>): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await teardown();
      return;
    } catch (error) {
      if (attempt === 2) {
        console.error(
          "\nTeardown failed twice. Fixture rows may be left behind; they are " +
            "the ones whose shop name starts with the run id printed above.",
          error,
        );
        process.exitCode = 1;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
