import { describe, expect, it } from 'vitest';
import { parseScalar, parseYamlMap, splitFrontmatter } from './frontmatter.js';

describe('splitFrontmatter', () => {
  it('returns [null, raw] when there is no leading fence', () => {
    expect(splitFrontmatter('just body\n')).toEqual([null, 'just body\n']);
  });

  it('splits frontmatter and body', () => {
    const raw = ['---', 'key: value', '---', '', 'body', ''].join('\n');
    expect(splitFrontmatter(raw)).toEqual(['key: value', '\nbody\n']);
  });

  it('returns null for an unclosed fence', () => {
    expect(splitFrontmatter('---\nkey: value\n')).toBeNull();
  });
});

describe('parseScalar', () => {
  it('converts true/false to booleans', () => {
    expect(parseScalar('true')).toBe(true);
    expect(parseScalar('false')).toBe(false);
  });

  it('strips matching single or double quotes', () => {
    expect(parseScalar('"quoted"')).toBe('quoted');
    expect(parseScalar("'quoted'")).toBe('quoted');
  });

  it('returns bare scalars trimmed', () => {
    expect(parseScalar('  hello  ')).toBe('hello');
  });
});

describe('parseYamlMap', () => {
  it('parses top-level scalars', () => {
    expect(parseYamlMap('a: 1\nb: hello')).toEqual({ a: '1', b: 'hello' });
  });

  it('parses a block scalar with the clip chomp', () => {
    const fm = ['description: |', '  line one', '  line two'].join('\n');
    expect(parseYamlMap(fm)).toEqual({ description: 'line one\nline two\n' });
  });

  it('parses a block scalar with the strip chomp', () => {
    const fm = ['description: |-', '  line one', '  line two'].join('\n');
    expect(parseYamlMap(fm)).toEqual({ description: 'line one\nline two' });
  });

  it('parses a one-level nested map (tools)', () => {
    const fm = ['tools:', '  read: true', '  edit: false'].join('\n');
    expect(parseYamlMap(fm)).toEqual({ tools: { read: true, edit: false } });
  });

  it('ignores blank lines and unparseable lines', () => {
    const fm = ['a: 1', '', '  - not a kv', 'b: 2'].join('\n');
    expect(parseYamlMap(fm)).toEqual({ a: '1', b: '2' });
  });
});

describe('parseYamlMap nested maps', () => {
  it('parses a two-level nested object under permission with a quoted wildcard key', () => {
    const fm = [
      'permission:',
      '  edit: allow',
      '  task:',
      '    "*": deny',
      '    sdd-explore: allow',
    ].join('\n');
    expect(parseYamlMap(fm)).toEqual({
      permission: {
        edit: 'allow',
        task: { '*': 'deny', 'sdd-explore': 'allow' },
      },
    });
  });

  it('still parses a one-level nested map with plain keys', () => {
    const fm = ['tools:', '  read: true', '  edit: false'].join('\n');
    expect(parseYamlMap(fm)).toEqual({ tools: { read: true, edit: false } });
  });

  it('accepts single-quoted keys', () => {
    const fm = ['m:', "  '*': deny"].join('\n');
    expect(parseYamlMap(fm)).toEqual({ m: { '*': 'deny' } });
  });
});
