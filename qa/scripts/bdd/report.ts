/**
 * Manual QA report model and writer.
 *
 * The report records which environment produced it (`environment`,
 * `opencodeVersion`, `image`) alongside the per-case verdicts, so evidence
 * from the V1 and V2 stacks is never mixed up. Both `report.json` and
 * `report.md` are rewritten after every case so an interrupted run keeps its
 * collected results.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { QaEnvironment } from './cases.js';

/** One recorded verdict. */
export interface TestResult {
  id: string;
  scenario: string;
  file: string;
  status: 'pass' | 'fail' | 'skip';
  /** Tester's free-text description of what was done/observed. */
  notes: string;
  timestamp: string;
}

/** The run report. */
export interface Report {
  runId: string;
  /** Environment the run targeted (`v1` or `v2`). */
  environment: QaEnvironment;
  /** opencode release baked into the workspace image (label). */
  opencodeVersion: string;
  /** Workspace image tag the run targeted. */
  image: string;
  startedAt: string;
  finishedAt: string | null;
  results: TestResult[];
}

/**
 * Write the report as JSON and Markdown into the run directory.
 *
 * @param reportDir - Absolute run directory (`qa/output/<run-id>`).
 * @param report - Current report state.
 */
export async function writeReport(reportDir: string, report: Report): Promise<void> {
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

  const lines = [
    '# Manual Gherkin test report',
    '',
    `Run ID: ${report.runId}`,
    `Environment: ${report.environment}`,
    `opencode version: ${report.opencodeVersion}`,
    `Image: ${report.image}`,
    `Started: ${report.startedAt}`,
    `Finished: ${report.finishedAt ?? 'in progress'}`,
    '',
    '## Summary',
    '',
    '| ID | Status | Scenario | File |',
    '| --- | --- | --- | --- |',
  ];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const result of report.results) {
    if (result.status === 'pass') passed += 1;
    if (result.status === 'fail') failed += 1;
    if (result.status === 'skip') skipped += 1;
    lines.push(`| ${result.id} | ${result.status} | ${result.scenario} | ${result.file} |`);
  }
  lines.push('');
  lines.push(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  lines.push('', '## Details', '');
  for (const result of report.results) {
    lines.push(`### ${result.id} — ${result.scenario}`, '');
    lines.push(`Status: ${result.status}`);
    lines.push(`Notes: ${result.notes === '' ? '—' : result.notes}`, '');
  }
  await writeFile(join(reportDir, 'report.md'), lines.join('\n') + '\n', 'utf8');
}
