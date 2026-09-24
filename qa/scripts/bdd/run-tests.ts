/**
 * Manual test runner for the Gherkin feature files in `qa/features/`.
 *
 * Walks every Scenario (Scenario Outline rows are expanded), prints the
 * steps, and records the tester's verdict per scenario ID:
 *   p — pass, f — fail, s — skip, q — quit.
 * After the verdict the runner asks for a description of what was done;
 * the description is stored in the report alongside the verdict.
 *
 * Each run gets a unique run ID (`<timestamp>-<env>` by default, or
 * `--run-id`). Verdicts are written progressively to
 * `qa/output/<run-id>/report.json` and `report.md` so an interrupted
 * run keeps the results collected so far. The runner is interactive on
 * a TTY and reads input line-by-line from stdin otherwise.
 *
 * Usage:
 *   pnpm qa:run [--env v1|v2]
 *   pnpm qa:run --list
 *   pnpm qa:run --feature cli
 *   pnpm qa:run --id @TC-CLI-1
 *   pnpm qa:run --auto-pass
 *   pnpm qa:run --case-reset
 *   pnpm qa:run --evidence
 *   pnpm qa:run --run-id <id>
 *
 * `--env` selects the stack the run targets (default v1): it filters
 * scenarios by their `@V1`/`@V2` applicability tags, drives the matching
 * compose project, and stamps the report with the environment, the
 * workspace image tag, and the opencode version baked into that image.
 *
 * `--case-reset` runs qa/docker/reset-scratch.sh in the workspace before
 * every case (use it for independent groups — never for the chained
 * groups F/G, which build on the previous case's artifacts).
 * `--evidence` copies each case's `.sdd` tree and raw opencode.log into
 * `qa/output/<run-id>/evidence/<case-id>/` right after the verdict.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Node runs these TypeScript sources directly (type stripping) and requires
// the real `.ts` extension; the project's Node16 convention (`.js`) applies
// only to compiled output, so the compiler error is expected here.
// @ts-expect-error -- runtime specifier for Node's native TypeScript support.
import { loadTestCases, type QaEnvironment } from './cases.ts';
// @ts-expect-error -- runtime specifier for Node's native TypeScript support.
import { writeReport, type Report, type TestResult } from './report.ts';

const FEATURES_DIR = join(fileURLToPath(new URL('../../features/', import.meta.url)));
const OUTPUT_DIR = join(fileURLToPath(new URL('../../output/', import.meta.url)));
const COMPOSE_BASE = join(fileURLToPath(new URL('../../docker-compose.yml', import.meta.url)));
const COMPOSE_V2 = join(fileURLToPath(new URL('../../docker-compose.v2.yml', import.meta.url)));

const { values } = parseArgs({
  options: {
    list: { type: 'boolean', default: false },
    feature: { type: 'string' },
    id: { type: 'string' },
    env: { type: 'string', default: 'v1' },
    'auto-pass': { type: 'boolean', default: false },
    'case-reset': { type: 'boolean', default: false },
    evidence: { type: 'boolean', default: false },
    'run-id': { type: 'string' },
  },
});

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const environment = values.env as QaEnvironment;
if (environment !== 'v1' && environment !== 'v2') {
  console.error(`qa: --env must be v1 or v2 (got "${values.env}")`);
  process.exit(1);
}

/** Compose `-f` arguments for the selected environment. */
const COMPOSE_ARGS =
  environment === 'v2' ? ['-f', COMPOSE_BASE, '-f', COMPOSE_V2] : ['-f', COMPOSE_BASE];

/** Workspace image tag for the selected environment. */
const WORKSPACE_IMAGE =
  environment === 'v2' ? 'opencode-sdd-qa:workspace-v2' : 'opencode-sdd-qa:workspace';

/**
 * Runs a command inside the QA workspace container.
 *
 * @param command - Command to run (bash -lc body).
 * @returns True when it exits 0, false on any failure.
 */
function runInWorkspace(command: string): boolean {
  try {
    execFileSync(
      'docker',
      ['compose', ...COMPOSE_ARGS, 'exec', '-T', 'qa', 'bash', '-lc', command],
      {
        stdio: 'inherit',
      },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Resets the scratch project to its documented baseline: wipes `.sdd`,
 * re-initialises the git repo and re-wires opencode.json. Called by
 * `pnpm qa:run --case-reset` before each case.
 *
 * @param projectDir - Scratch project dir inside the container.
 * @returns True when the reset succeeded.
 */
function resetScratch(projectDir = '/work/sdd-manual'): boolean {
  return runInWorkspace(`/app/qa/docker/reset-scratch.sh ${projectDir}`);
}

/**
 * Copies the case's artifacts (`.sdd` tree + the raw opencode log) into
 * the run's evidence folder, so the first case of a chain keeps its
 * evidence even though the next case resets the scratch state.
 *
 * @param caseId - Test case id (used as the evidence subdirectory).
 * @param destDir - Destination directory (created when missing).
 * @returns True when at least the `.sdd` tree or the log was copied.
 */
function collectCaseEvidence(caseId: string, destDir: string): boolean {
  const mkAndCopy = (source: string): boolean => {
    try {
      execFileSync('mkdir', ['-p', destDir]);
      execFileSync('docker', ['compose', ...COMPOSE_ARGS, 'cp', `qa:${source}`, destDir]);
      return true;
    } catch {
      return false;
    }
  };
  const copiedSdd = mkAndCopy('/work/sdd-manual/.sdd');
  const copiedLog = mkAndCopy('/home/qa/.local/share/opencode/log/opencode.log');
  return copiedSdd || copiedLog;
}

/**
 * Read a label from the workspace image.
 *
 * @param label - Label name to read.
 * @returns The label value, or `unknown` when the image/label is absent.
 */
function imageLabel(label: string): string {
  try {
    const value = execFileSync(
      'docker',
      ['image', 'inspect', WORKSPACE_IMAGE, '--format', `{{ index .Config.Labels "${label}" }}`],
      { encoding: 'utf8' },
    ).trim();
    return value === '' || value === '<no value>' ? 'unknown' : value;
  } catch {
    return 'unknown';
  }
}

/**
 * Builds a unique run ID: a local timestamp (`yyyy-MM-ddTHH-mm-ss`) plus the
 * environment, with a numeric suffix when the directory already exists.
 *
 * @param env - Selected environment (suffix).
 * @returns The run id.
 */
function generateRunId(env: QaEnvironment): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const date = new Date();
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${env}`;
  if (!existsSync(join(OUTPUT_DIR, stamp))) {
    return stamp;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stamp}-${suffix}`;
    if (!existsSync(join(OUTPUT_DIR, candidate))) {
      return candidate;
    }
  }
}

const runId = values['run-id'] ?? generateRunId(environment);
if (!RUN_ID_PATTERN.test(runId)) {
  console.error(
    'qa: invalid --run-id, use letters, digits, dots, underscores or ' + `hyphens (got "${runId}")`,
  );
  process.exit(1);
}
const REPORT_DIR = join(OUTPUT_DIR, runId);

const cases = await loadTestCases(FEATURES_DIR, {
  feature: values.feature,
  id: values.id,
  environment,
});
if (cases.length === 0) {
  console.error('qa: no test cases matched the filters');
  process.exit(1);
}

if (values.list) {
  console.log(`${cases.length} test case(s) for environment ${environment}:\n`);
  for (const testCase of cases) {
    console.log(`${testCase.id.padEnd(14)} ${testCase.scenario}`);
    console.log(`               ${testCase.file} (${testCase.steps.length} steps)`);
  }
  process.exit(0);
}

const report: Report = {
  runId,
  environment,
  opencodeVersion: imageLabel('org.opencode-sdd.qa.opencode-version'),
  image: WORKSPACE_IMAGE,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  results: [],
};

// Read input line-by-line from stdin. The async iterator buffers
// input, so lines are never lost while the report is being written
// between prompts (a readline 'line' listener would race here).
const input = createInterface({ input: stdin });
const lines = (async function* (): AsyncGenerator<string> {
  for await (const line of input) {
    yield line.trim();
  }
})();
const promptLine = (question: string): Promise<string> =>
  (async () => {
    stdout.write(question);
    const { value, done } = await lines.next();
    return done ? '' : value;
  })();

const statusFromVerdict = (verdict: string): 'pass' | 'fail' | 'skip' =>
  verdict === 'f' ? 'fail' : verdict === 's' ? 'skip' : 'pass';

for (const testCase of cases) {
  if (values['case-reset']) {
    console.log('  [case-reset] baseline reset...');
    if (!resetScratch()) {
      console.warn('  WARN: case reset failed - continuing (fix the preconditions yourself).');
    }
  }
  console.log(`\n${'='.repeat(72)}`);
  console.log(`${testCase.id} — ${testCase.scenario}`);
  console.log(`File: ${testCase.file}`);
  for (const step of testCase.steps) {
    console.log(`  - ${step}`);
  }

  let verdict: string;
  let notes = '';
  if (values['auto-pass']) {
    verdict = 'p';
    console.log('  [auto-pass]');
  } else {
    const answer = await promptLine('\n  [p]ass [f]ail [s]kip [q]uit > ');
    const verdictLine = answer.toLowerCase();
    if (verdictLine === '' || verdictLine === 'q' || verdictLine === 'quit') {
      console.log('  (quit)');
      break;
    }
    verdict = verdictLine === 'f' ? 'f' : verdictLine === 's' ? 's' : 'p';
    notes = (
      await promptLine('  [description] what did you do or observe? (Enter to skip) > ')
    ).trim();
  }

  const result: TestResult = {
    id: testCase.id,
    scenario: testCase.scenario,
    file: testCase.file,
    status: statusFromVerdict(verdict),
    notes,
    timestamp: new Date().toISOString(),
  };
  report.results.push(result);
  await writeReport(REPORT_DIR, report);

  if (values.evidence) {
    const dest = join(REPORT_DIR, 'evidence', testCase.id.replace(/^@TC-/, ''));
    console.log('  [evidence] copying artifacts...');
    if (!collectCaseEvidence(testCase.id, dest)) {
      console.warn(`  WARN: no evidence copied for ${testCase.id}`);
    }
  }
}

report.finishedAt = new Date().toISOString();
await writeReport(REPORT_DIR, report);
input.close();

const passed = report.results.filter((r) => r.status === 'pass').length;
const failed = report.results.filter((r) => r.status === 'fail').length;
const skipped = report.results.filter((r) => r.status === 'skip').length;
console.log(`\n${'='.repeat(72)}`);
console.log(`Run ID: ${report.runId}`);
console.log(`Environment: ${report.environment} (opencode ${report.opencodeVersion})`);
console.log(`Done: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log(`Report: ${join(REPORT_DIR, 'report.md')}`);
