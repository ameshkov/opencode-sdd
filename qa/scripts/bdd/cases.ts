/**
 * Loads Gherkin pickles from `qa/features/` into runner test cases and
 * filters them by the selected opencode environment.
 *
 * Applicability tags: every scenario carries `@V1`, `@V2`, or both (feature
 * files may declare them at the Feature level, where pickles inherit them).
 * `--env v2` runs scenarios tagged `@V2` (plus untagged ones, for safety);
 * `--env v1` runs `@V1`. The tag presence itself is enforced by
 * `check-gherkin-ids.ts` in `pnpm lint:gherkin`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { generateMessages } from '@cucumber/gherkin';
import { IdGenerator, SourceMediaType } from '@cucumber/messages';

/** The opencode environment a QA run targets. */
export type QaEnvironment = 'v1' | 'v2';

/** Applicability tag for the V1 line. */
export const V1_TAG = '@V1';

/** Applicability tag for the V2 line. */
export const V2_TAG = '@V2';

/**
 * Test-ID convention: `@TC-<GROUP>-<case>` with a semantic, uppercase
 * GROUP that names the test area (e.g. `@TC-REG-1`, `@TC-PF-6`). The
 * optional trailing lowercase letter (e.g. `@TC-TOOL-2b`) extends a
 * case with a sub-variant. Shared with `check-gherkin-ids.ts`.
 */
export const ID_TAG_PATTERN = /^@TC-[A-Z]+-\d+[a-z]?$/;

/** One runnable manual test case. */
export interface TestCase {
  id: string;
  scenario: string;
  file: string;
  steps: string[];
}

/** Filters applied while loading cases. */
export interface CaseFilters {
  /** Substring matched against the feature file name. */
  feature?: string | undefined;
  /** Exact `@TC-*` id. */
  id?: string | undefined;
  /** Selected environment; controls `@V1`/`@V2` applicability. */
  environment: QaEnvironment;
}

/**
 * Whether a pickle's tags make it applicable to `environment`.
 *
 * Untagged pickles are included (the tag requirement is enforced statically,
 * not at runtime) so a missing tag cannot silently hide a scenario.
 *
 * @param tags - Pickle tag names (including inherited feature tags).
 * @param environment - Selected environment.
 * @returns `true` when the case should run.
 */
export function environmentApplies(tags: readonly string[], environment: QaEnvironment): boolean {
  const v1 = tags.includes(V1_TAG);
  const v2 = tags.includes(V2_TAG);
  if (!v1 && !v2) {
    return true;
  }
  return environment === 'v2' ? v2 : v1;
}

/**
 * Parse every feature file into test cases, filtered by the CLI filters and
 * the selected environment.
 *
 * @param featuresDir - Absolute `qa/features/` directory.
 * @param filters - Feature/id filters plus the selected environment.
 * @returns Runnable test cases in file order.
 */
export async function loadTestCases(
  featuresDir: string,
  filters: CaseFilters,
): Promise<TestCase[]> {
  const files = (await readdir(featuresDir)).filter((file) => file.endsWith('.feature'));
  const cases: TestCase[] = [];
  for (const file of files) {
    if (filters.feature && !file.includes(filters.feature)) {
      continue;
    }
    const source = await readFile(join(featuresDir, file), 'utf8');
    const messages = generateMessages(source, file, SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
      includeGherkinDocument: false,
      includePickles: true,
      newId: IdGenerator.uuid(),
    });
    for (const message of messages) {
      const pickle = message.pickle;
      if (!pickle) {
        continue;
      }
      const tags = (pickle.tags ?? []).map((tag) => tag.name);
      const idTag = tags.find((tag) => ID_TAG_PATTERN.test(tag));
      if (!idTag) {
        console.warn(`qa: ${file}: ${pickle.name} has no @TC tag, skipping`);
        continue;
      }
      if (filters.id && idTag !== filters.id) {
        continue;
      }
      if (!environmentApplies(tags, filters.environment)) {
        continue;
      }
      cases.push({
        id: idTag,
        scenario: pickle.name,
        file,
        steps: pickle.steps.map((step) => step.text),
      });
    }
  }
  return cases;
}
