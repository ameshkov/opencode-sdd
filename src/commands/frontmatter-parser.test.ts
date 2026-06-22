import { describe, expect, it } from 'vitest';
import { parseCommandFile } from './frontmatter-parser.js';

describe('parseCommandFile', () => {
  it('parses valid frontmatter and body', () => {
    const raw = [
      '---',
      'description: Write a PRD',
      'agent: researcher',
      'model: glm-5.2',
      'subtask: true',
      '---',
      '',
      'You are a PRD writer. Topic: $ARGUMENTS',
      '',
    ].join('\n');

    const result = parseCommandFile('prd-write', raw);

    expect(result).toEqual({
      ok: true,
      command: {
        name: 'prd-write',
        config: {
          description: 'Write a PRD',
          template: 'You are a PRD writer. Topic: $ARGUMENTS\n',
          agent: 'researcher',
          model: 'glm-5.2',
          subtask: true,
        },
      },
    });
  });

  it('parses with only description and omits optional fields', () => {
    const raw = ['---', 'description: Write a PRD', '---', '', 'Body $ARGUMENTS', ''].join('\n');
    const result = parseCommandFile('prd-write', raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config).toEqual({
        description: 'Write a PRD',
        template: 'Body $ARGUMENTS\n',
      });
    }
  });

  it('fails on missing description', () => {
    const raw = ['---', 'agent: researcher', '---', '', 'Body', ''].join('\n');
    const result = parseCommandFile('no-desc', raw);
    expect(result).toEqual({
      ok: false,
      name: 'no-desc',
      reason: 'missing or empty description',
    });
  });

  it('fails on unclosed frontmatter fence', () => {
    const raw = ['---', 'description: x', 'body without close'].join('\n');
    const result = parseCommandFile('unclosed', raw);
    expect(result.ok).toBe(false);
  });

  it('parses a multi-line description block scalar', () => {
    const raw = [
      '---',
      'description: |',
      '  Line one of the description.',
      '  Line two of the description.',
      '---',
      '',
      'Body',
      '',
    ].join('\n');
    const result = parseCommandFile('multi', raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.description).toBe(
        'Line one of the description.\nLine two of the description.\n',
      );
    }
  });

  it('trims leading and trailing whitespace from the body', () => {
    const raw = ['---', 'description: d', '---', '', '', '  Body  ', '', ''].join('\n');
    const result = parseCommandFile('trim', raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.template).toBe('  Body\n');
    }
  });

  it('parses subtask as a boolean', () => {
    const raw = ['---', 'description: d', 'subtask: false', '---', '', 'Body', ''].join('\n');
    const result = parseCommandFile('sub', raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config.subtask).toBe(false);
    }
  });

  it('ignores unknown frontmatter keys', () => {
    const raw = ['---', 'description: d', 'unknown: value', '---', '', 'Body', ''].join('\n');
    const result = parseCommandFile('unk', raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.config).not.toHaveProperty('unknown');
    }
  });
});
