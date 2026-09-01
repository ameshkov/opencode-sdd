import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCommandFile } from './frontmatter-parser.js';

const markdownDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'commands');

describe('prd-write command file', () => {
  it('embeds the templates reference for its PRD template', async () => {
    const raw = await readFile(join(markdownDir, 'prd-write.md'), 'utf8');
    const result = parseCommandFile('prd-write', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.template).toContain(
        '@opencode-sdd-templates/prd-write/prd-template.md',
      );
      expect(result.command.config.template).toMatch(/`explore`\s+subagent/);
    }
  });
});

describe('sdd-spec command file', () => {
  it('parses with a description, $ARGUMENTS, and the plan/task template references', async () => {
    const raw = await readFile(join(markdownDir, 'sdd-spec.md'), 'utf8');
    const result = parseCommandFile('sdd-spec', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain('@opencode-sdd-templates/sdd-spec/plan-template.md');
      expect(template).toContain('@opencode-sdd-templates/sdd-spec/task-structure-template.md');
      expect(template).toMatch(/`explore`\s+subagent/);
      const asset = await readFile(
        join(markdownDir, 'templates', 'sdd-spec', 'plan-template.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('sdd-implement command file', () => {
  it('parses with a description, $ARGUMENTS, and references the spec file', async () => {
    const raw = await readFile(join(markdownDir, 'sdd-implement.md'), 'utf8');
    const result = parseCommandFile('sdd-implement', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain('spec.md');
      // Spec-internal identifiers live in gitignored spec artifacts and must
      // not leak into shipped source code.
      expect(template).toContain('No spec-internal IDs in shipped code');
    }
  });
});

describe('sdd-validate command file', () => {
  it('parses with a description, $ARGUMENTS, and the validation template references', async () => {
    const raw = await readFile(join(markdownDir, 'sdd-validate.md'), 'utf8');
    const result = parseCommandFile('sdd-validate', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain(
        '@opencode-sdd-templates/sdd-validate/validation-report-template.md',
      );
      expect(template).toContain('validation.md');
      expect(template).toMatch(/`explore`\s+subagent/);
    }
  });
});

describe('prd-to-issues command file', () => {
  it('parses with a description, $ARGUMENTS, and the inline issue template', async () => {
    const raw = await readFile(join(markdownDir, 'prd-to-issues.md'), 'utf8');
    const result = parseCommandFile('prd-to-issues', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain('## Issue Template');
      expect(template).toContain('# Issue: [TITLE]');
      expect(template).toMatch(/`explore`\s+subagent/);
      // HITL issues record their (possibly several) human decisions in a
      // dedicated, self-explanatory section: each decision carries its
      // gate, status, options, and an answer slot.
      expect(template).toContain('## Human Decisions');
      expect(template).toContain('### Decision:');
      expect(template).toContain('**Gate**');
      expect(template).toContain('before-planning');
      expect(template).toContain('before-implementation');
      expect(template).toContain('**Status**: Open');
      expect(template).toContain('**Answer**');
    }
  });
});

describe('prd-issue-to-plan command file', () => {
  it('parses with a description, $ARGUMENTS, and the shared plan template reference', async () => {
    const raw = await readFile(join(markdownDir, 'prd-issue-to-plan.md'), 'utf8');
    const result = parseCommandFile('prd-issue-to-plan', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain(
        '@opencode-sdd-templates/prd-issue-to-plan/plan-template.md',
      );
      expect(result.command.config.template).toContain('plan.md');
      expect(result.command.config.template).toMatch(/`explore`\s+subagent/);
      // The Phase 6.3 issue-status update is performed by the command after
      // writing the plan, not a plan task.
      expect(result.command.config.template).toContain('performed by you after writing the plan');
      expect(result.command.config.template).toMatch(/encoded as\s+a task in the plan/);
      // HITL ownership: the planner resolves Open decisions at each gate
      // (before-planning before the plan, before-implementation after), and
      // records answers in issue.md's ## Human Decisions.
      expect(result.command.config.template).toContain('Resolve HITL decisions');
      expect(result.command.config.template).toContain('before-planning');
      expect(result.command.config.template).toContain('before-implementation');
      expect(result.command.config.template).toContain('## Human Decisions');
      expect(result.command.config.template).toContain('Resolved');
      const asset = await readFile(
        join(markdownDir, 'templates', 'prd-issue-to-plan', 'plan-template.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('prd-implement-issue command file', () => {
  it('parses with a description, $ARGUMENTS, and references the issue plan', async () => {
    const raw = await readFile(join(markdownDir, 'prd-implement-issue.md'), 'utf8');
    const result = parseCommandFile('prd-implement-issue', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain('plan.md');
      expect(result.command.config.template).toContain('Blocked by');
      // Spec-internal IDs (success criteria, user stories, issue IDs) live in
      // gitignored spec artifacts and must not leak into shipped source code.
      expect(result.command.config.template).toContain('No spec-internal IDs in shipped code');
      expect(result.command.config.template).toContain('SC-001');
      expect(result.command.config.template).toContain('1-AFK');
    }
  });
});

describe('prd-validate-issue command file', () => {
  it('parses with a description, $ARGUMENTS, and the shared validation template reference', async () => {
    const raw = await readFile(join(markdownDir, 'prd-validate-issue.md'), 'utf8');
    const result = parseCommandFile('prd-validate-issue', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain(
        '@opencode-sdd-templates/prd-validate-issue/validation-report-template.md',
      );
      expect(result.command.config.template).toContain('validation.md');
      expect(result.command.config.template).toMatch(/`explore`\s+subagent/);
      const asset = await readFile(
        join(markdownDir, 'templates', 'prd-validate-issue', 'validation-report-template.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('prd-review-plan command file', () => {
  it('parses with a description, $ARGUMENTS, and the review report template reference', async () => {
    const raw = await readFile(join(markdownDir, 'prd-review-plan.md'), 'utf8');
    const result = parseCommandFile('prd-review-plan', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain(
        '@opencode-sdd-templates/prd-review-plan/review-report-template.md',
      );
      expect(template).toContain('review.md');
      expect(template).toContain('explore');
      // Role-based delegation: prefer a designated plan-reviewer subagent,
      // fall back to the explore subagent when none is registered.
      expect(template).toContain('designated plan-reviewer subagent');
      expect(template).toMatch(/fall back to\s*the\s*`explore`\s+subagent/i);
      // Phase 4 (Validate Findings) ships with the command prompt.
      expect(template).toContain('Validate Findings');
      expect(template).toContain('Validity');
      expect(template).toContain('Relevance');
      expect(template).toContain('Dismissed Findings');
      // Re-reviews update review.md in place instead of overwriting it.
      expect(template).toContain('update');
      expect(template).toContain('in place');
      expect(template).toContain('Resolved');
      const asset = await readFile(
        join(markdownDir, 'templates', 'prd-review-plan', 'review-report-template.md'),
        'utf8',
      );
      // The template asset carries the per-finding Status line and the
      // Dismissed Findings section introduced alongside Phase 4.
      expect(asset).toContain('**Status**');
      expect(asset).toContain('Dismissed Findings');
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('prd-validate command file', () => {
  it('parses with a description, $ARGUMENTS, and the cross-cutting validation template reference', async () => {
    const raw = await readFile(join(markdownDir, 'prd-validate.md'), 'utf8');
    const result = parseCommandFile('prd-validate', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain(
        '@opencode-sdd-templates/prd-validate/validation-report-template.md',
      );
      expect(result.command.config.template).toContain('validation.md');
      expect(result.command.config.template).toMatch(/`explore`\s+subagent/);
      const asset = await readFile(
        join(markdownDir, 'templates', 'prd-validate', 'validation-report-template.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('doc-readme command file', () => {
  it('parses with a description, $ARGUMENTS, and the README template references', async () => {
    const raw = await readFile(join(markdownDir, 'doc-readme.md'), 'utf8');
    const result = parseCommandFile('doc-readme', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain('README.md');
      expect(template).toContain('@opencode-sdd-templates/doc-readme/readme-library.md');
      expect(template).toContain('@opencode-sdd-templates/doc-readme/readme-generic.md');
      expect(template).toMatch(/`explore`\s+subagent/);
      const asset = await readFile(
        join(markdownDir, 'templates', 'doc-readme', 'readme-library.md'),
        'utf8',
      );
      expect(asset.trim()).not.toBe('');
    }
  });
});

describe('doc-changelog command file', () => {
  it('parses with a description, $ARGUMENTS, and the Unreleased focus', async () => {
    const raw = await readFile(join(markdownDir, 'doc-changelog.md'), 'utf8');
    const result = parseCommandFile('doc-changelog', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain('CHANGELOG.md');
      expect(result.command.config.template).toContain('Unreleased');
    }
  });
});

describe('doc-deployment command file', () => {
  it('parses with a description, $ARGUMENTS, and a DEPLOYMENT focus', async () => {
    const raw = await readFile(join(markdownDir, 'doc-deployment.md'), 'utf8');
    const result = parseCommandFile('doc-deployment', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain('DEPLOYMENT.md');
      expect(result.command.config.template).toMatch(/`explore`\s+subagent/);
    }
  });
});

describe('doc-development command file', () => {
  it('parses with a description, $ARGUMENTS, and a DEVELOPMENT focus', async () => {
    const raw = await readFile(join(markdownDir, 'doc-development.md'), 'utf8');
    const result = parseCommandFile('doc-development', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBeTruthy();
      expect(result.command.config.template).toContain('$ARGUMENTS');
      expect(result.command.config.template).toContain('DEVELOPMENT.md');
      expect(result.command.config.template).toMatch(/`explore`\s+subagent/);
    }
  });
});

describe('doc-agents command file', () => {
  it('parses with a description, $ARGUMENTS, and the full set of asset references', async () => {
    const raw = await readFile(join(markdownDir, 'doc-agents.md'), 'utf8');
    const result = parseCommandFile('doc-agents', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      expect(result.command.config.description).toBeTruthy();
      expect(template).toContain('$ARGUMENTS');
      expect(template).toContain('AGENTS.md');
      expect(template).toContain('@opencode-sdd-templates/doc-agents/system-design-web-service.md');
      expect(template).toContain('@opencode-sdd-templates/doc-agents/architecture-example.md');
      expect(template).toContain('@opencode-sdd-templates/doc-agents/markdown-formatting-rules.md');
      expect(template).toContain(
        '@opencode-sdd-templates/doc-agents/contribution-instructions-example.md',
      );
      expect(template).toMatch(/`explore`\s+subagent/);
      const assetsDir = join(markdownDir, 'templates', 'doc-agents');
      const exampleAsset = await readFile(
        join(assetsDir, 'contribution-instructions-example.md'),
        'utf8',
      );
      const systemDesignAsset = await readFile(
        join(assetsDir, 'system-design-web-service.md'),
        'utf8',
      );
      expect(exampleAsset.trim()).not.toBe('');
      expect(systemDesignAsset.trim()).not.toBe('');
    }
  });
});

describe('prd-auto-implement command file', () => {
  it('parses with no agent binding and no subtask flag when given the orchestrator prompt', async () => {
    const raw = await readFile(join(markdownDir, 'prd-auto-implement.md'), 'utf8');
    const result = parseCommandFile('prd-auto-implement', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const { config } = result.command;
      expect(config.description).toBeTruthy();
      // No agent binding: the command runs under whatever agent invokes it.
      expect(config.agent).toBeUndefined();
      expect(config.subtask).toBeUndefined();
      const template = config.template;
      expect(template).toContain('$ARGUMENTS');
      // Hard-stop language (prerequisite checks).
      expect(template).toContain('prd-write');
      expect(template).toContain('prd-to-issues');
      // Dispatch contract: the four workers, in order.
      expect(template).toContain('sdd-planner');
      expect(template).toContain('sdd-reviewer');
      expect(template).toContain('sdd-coder');
      expect(template).toContain('sdd-validator');
      // Delegate-only contract.
      expect(template).toContain('sdd-command');
      // Dispatch contract uses opencode's task-tool parameter name.
      expect(template).toContain('`subagent_type`');
      // HITL mediation: the planner owns HITL; the orchestrator surfaces
      // questions the planner reports, records answers in issue.md, and
      // re-dispatches the planner.
      expect(template).toContain('HITL mediation');
      expect(template).toContain('## Human Decisions');
      expect(template).toContain('question');
      expect(template).toContain('**Status**');
      expect(template).toContain('Resolved');
      expect(template).toContain('AFK');
      expect(template).toContain('END YOUR TURN');
      // No portable template token (this command has no template assets).
      expect(template).not.toContain('@opencode-sdd-templates/');
    }
  });

  it('describes the capped review loop with escalation and post-escalation resume', async () => {
    const raw = await readFile(join(markdownDir, 'prd-auto-implement.md'), 'utf8');
    const result = parseCommandFile('prd-auto-implement', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      // The uniform cap is defined.
      expect(template).toContain('MAX_ATTEMPTS');
      // Loop trigger and the persisted counter.
      expect(template).toContain('Needs Revision');
      expect(template).toContain('Review attempt');
      // Escalation at the cap and post-escalation counter reset.
      expect(template).toContain('escalate');
      expect(template).toContain('reset');
    }
  });

  it('describes the capped validation loop with escalation and post-escalation resume', async () => {
    const raw = await readFile(join(markdownDir, 'prd-auto-implement.md'), 'utf8');
    const result = parseCommandFile('prd-auto-implement', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      // The validation loop signal and its success value.
      expect(template).toContain('Overall Status');
      expect(template).toContain('Complete');
      // Loop continuation values written by the validator.
      expect(template).toContain('Incomplete');
      expect(template).toContain('Blocked');
      // The persisted counter the loop reads.
      expect(template).toContain('Validation attempt');
    }
  });

  it('describes the capped cross-cutting validation loop with finalization', async () => {
    const raw = await readFile(join(markdownDir, 'prd-auto-implement.md'), 'utf8');
    const result = parseCommandFile('prd-auto-implement', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      // The cross-cutting loop loads `prd-validate` (not just
      // `prd-validate-issue`).
      expect(template).toContain('`prd-validate`');
      // The persisted counter the loop reads.
      expect(template).toContain('Cross-cutting attempt');
      // Open Critical findings drive per-finding coder dispatches.
      expect(template).toContain('Critical');
      // Escalation at the cap.
      expect(template).toContain('escalate');
      // Finalization: rename .current and report the finalized directory.
      expect(template).toContain('finalize');
      expect(template).toContain('.current');
    }
  });

  it("forwards each revising worker's response to the following reviewer/validator dispatch", async () => {
    const raw = await readFile(join(markdownDir, 'prd-auto-implement.md'), 'utf8');
    const result = parseCommandFile('prd-auto-implement', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      // The Delegate contract declares the forwarding principle and the
      // shared label the reviewer/validator reads back from the dispatch
      // prompt.
      expect(template).toContain('Prior revision response');
      // The plan-review re-review forwards the planner's response...
      expect(template).toMatch(/planner.s returned revision response/);
      // ...the per-issue re-validation forwards the coder's response...
      expect(template).toMatch(/coder.s returned fix response/);
      // ...and the cross-cutting re-validation forwards the coder(s)'
      // response(s).
      expect(template).toMatch(/coder\(s\). returned fix response/);
    }
  });
});

describe('prd-auto-implement resume after interruption', () => {
  it('describes resume from current issue Status without redoing completed work', async () => {
    const raw = await readFile(join(markdownDir, 'prd-auto-implement.md'), 'utf8');
    const result = parseCommandFile('prd-auto-implement', raw);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const template = result.command.config.template;
      // The resume pre-check reads the issue Status to pick the entry
      // point.
      expect(template).toContain('Resume');
      // Already-validated issues are skipped.
      expect(template).toContain('Validated');
      expect(template).toContain('Skip');
      // An interrupted (In Progress) issue resumes at implement.
      expect(template).toContain('In Progress');
      // The coder resumes from completed task markers.
      expect(template).toContain('[x]');
      // Counters are preserved across re-invocation.
      expect(template).toContain('preserved');
    }
  });
});
