/**
 * Validates the Gherkin feature files in `qa/features/`.
 *
 * Enforces the test-ID convention:
 * - every Scenario and Scenario Outline carries exactly one ID tag of
 *   the form `@TC-<GROUP>-<case>`, where GROUP is a semantic, uppercase
 *   name for the test area (e.g. `@TC-REG-1`, `@TC-PF-6`);
 * - all IDs in one feature file share the same GROUP;
 * - IDs are unique across the whole suite.
 *
 * Exits with a non-zero status on any violation. Run as
 * `pnpm lint:gherkin` (part of `pnpm lint`).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateMessages } from '@cucumber/gherkin';
import { IdGenerator, SourceMediaType } from '@cucumber/messages';

const FEATURES_DIR = join(fileURLToPath(new URL('../../features/', import.meta.url)));

const ID_TAG_PATTERN = /^@TC-([A-Z]+)-(\d+[a-z]?)$/;
const seenIds = new Map<string, string>();
let scenarioCount = 0;
const errors: string[] = [];

/**
 * Extracts the semantic GROUP part of an ID tag
 * (e.g. `@TC-REG-1` -> `REG`).
 */
function groupOf(idTag: string): string {
  return idTag.match(ID_TAG_PATTERN)?.[1] ?? '';
}

/**
 * Validates a scenario's ID tag: consistent with the file's group and
 * unique across the suite. The caller guarantees exactly one ID tag.
 */
function checkScenarioTag(
  filePath: string,
  id: string,
  scenarioName: string,
  line: number,
  fileGroup: string,
): void {
  const group = groupOf(id);
  if (fileGroup !== '' && group !== fileGroup) {
    errors.push(
      `${filePath}:${line}: ${scenarioName} — ID ${id} ` +
        `uses group "${group}" but the file group is "${fileGroup}"`,
    );
  }

  if (seenIds.has(id)) {
    errors.push(
      `${filePath}:${line}: ${scenarioName} — duplicate ID ` + `${id} (also on ${seenIds.get(id)})`,
    );
  } else {
    seenIds.set(id, `${filePath}:${line}`);
  }
}

async function checkFile(filePath: string): Promise<void> {
  const source = await readFile(filePath, 'utf8');
  const messages = generateMessages(
    source,
    filePath,
    SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
    {
      includeGherkinDocument: true,
      includePickles: false,
      newId: IdGenerator.uuid(),
    },
  );

  const document = messages.find((m) => m.gherkinDocument)?.gherkinDocument;
  const feature = document?.feature;
  if (!feature) {
    errors.push(`${filePath}: could not parse a feature document`);
    return;
  }

  let fileGroup = '';
  for (const child of feature.children ?? []) {
    const scenario = child.scenario;
    if (!scenario) {
      continue;
    }
    scenarioCount += 1;
    const tags = (scenario.tags ?? []).map((tag) => tag.name);
    const idTags = tags.filter((tag) => ID_TAG_PATTERN.test(tag));

    if (idTags.length !== 1) {
      errors.push(
        `${filePath}:${scenario.location.line}: ${scenario.name} — expected ` +
          `exactly one @TC-<GROUP>-<case> tag, found ${idTags.length}`,
      );
      continue;
    }

    const id = idTags[0] ?? '';
    if (fileGroup === '') {
      fileGroup = groupOf(id);
    }
    checkScenarioTag(filePath, id, scenario.name, scenario.location.line, fileGroup);
  }
}

const files = (await readdir(FEATURES_DIR)).filter((file) => file.endsWith('.feature'));
for (const file of files) {
  await checkFile(join(FEATURES_DIR, file));
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`gherkin-ids: ${error}`);
  }
  console.error(`gherkin-ids: ${errors.length} error(s) in ${files.length} file(s)`);
  process.exit(1);
}

console.log(
  `gherkin-ids: OK — ${scenarioCount} scenarios in ${files.length} file(s), ` +
    `${seenIds.size} unique IDs`,
);
