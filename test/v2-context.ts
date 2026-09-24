import type { Plugin } from '@opencode/plugin';
import type { V2PermissionRule } from '../src/host/v2/permissions.js';

/**
 * Mutable agent record captured by the V2 context stub's agent editor.
 *
 * Mirrors the subset of `Agent.Info` the SDD adapter reads and writes.
 */
export interface StubAgent {
  id: string;
  name: string;
  description?: string;
  mode: string;
  hidden: boolean;
  system?: string;
  permissions: V2PermissionRule[];
}

/** A command definition captured by the V2 context stub's command editor. */
export interface StubCommand {
  name: string;
  description?: string;
  execute(invocation: { sessionID: string; prompt?: { text?: string } }): Promise<void>;
}

/** A tool definition captured by the V2 context stub's tool editor. */
export interface StubTool {
  name: string;
  description: string;
  input: unknown;
  options?: { codemode?: boolean; permission?: string };
  execute(input: unknown, context: unknown): Promise<unknown>;
}

/** A session prompt captured by the V2 context stub. */
export interface StubPrompt {
  sessionID: string;
  text: string;
}

/** Failure injection points for the V2 context stub. */
export interface V2ContextStubOptions {
  /** When set, `agent.transform` rejects with this error. */
  failAgentTransform?: Error;
  /** When set, `command.transform` rejects with this error. */
  failCommandTransform?: Error;
  /** When set, `tool.transform` rejects with this error. */
  failToolTransform?: Error;
  /** When set, `session.prompt` rejects with this error. */
  failPrompt?: Error;
}

/** Test double for the opencode V2 `Plugin.Context`. */
export interface V2ContextStub {
  /** The context handed to the plugin's `setup`. */
  readonly ctx: Plugin.Context;
  /** Agents registered through the agent editor, keyed by id. */
  readonly agents: Map<string, StubAgent>;
  /** Commands registered through the command editor, keyed by name. */
  readonly commands: Map<string, StubCommand>;
  /** Tools registered through the tool editor, keyed by name. */
  readonly tools: Map<string, StubTool>;
  /** Session prompts sent by command execute closures. */
  readonly prompts: StubPrompt[];
  /** Number of times each transform ran. */
  readonly transformCalls: { agent: number; command: number; tool: number };
}

/** Default built-in agent seeded into every stub, mirroring a real V2 host. */
function builtInAgent(): StubAgent {
  return {
    id: 'build',
    name: 'Build',
    description: 'built-in agent',
    mode: 'primary',
    hidden: false,
    permissions: [{ action: '*', resource: '*', effect: 'allow' }],
  };
}

/**
 * Create a test double for the V2 plugin context.
 *
 * The stub implements exactly the surface the SDD V2 adapter touches:
 * `agent.transform`, `command.transform`, `tool.transform`, and
 * `session.prompt`. Editors operate on in-memory maps so tests can assert what
 * the adapter registered, and transform failures can be injected to verify
 * graceful degradation.
 *
 * @param options - Optional failure injection.
 * @returns The stub with its captured registrations.
 */
export function createV2ContextStub(options: V2ContextStubOptions = {}): V2ContextStub {
  const agents = new Map<string, StubAgent>([['build', builtInAgent()]]);
  const commands = new Map<string, StubCommand>();
  const tools = new Map<string, StubTool>();
  const prompts: StubPrompt[] = [];
  const transformCalls = { agent: 0, command: 0, tool: 0 };

  const agent = {
    async transform(callback: (editor: unknown) => void): Promise<{ dispose(): Promise<void> }> {
      transformCalls.agent += 1;
      if (options.failAgentTransform !== undefined) {
        throw options.failAgentTransform;
      }
      callback({
        list: () => Array.from(agents.values()),
        get: (id: string) => agents.get(id),
        update: (id: string, update: (target: StubAgent) => void) => {
          const existing = agents.get(id) ?? {
            id,
            name: id,
            mode: 'primary',
            hidden: false,
            permissions: [],
          };
          update(existing);
          agents.set(id, existing);
        },
      });
      return { dispose: async () => undefined };
    },
  };

  const command = {
    async transform(callback: (editor: unknown) => void): Promise<{ dispose(): Promise<void> }> {
      transformCalls.command += 1;
      if (options.failCommandTransform !== undefined) {
        throw options.failCommandTransform;
      }
      callback({
        add: (definition: StubCommand) => {
          commands.set(definition.name, definition);
        },
      });
      return { dispose: async () => undefined };
    },
  };

  const tool = {
    async transform(callback: (editor: unknown) => void): Promise<{ dispose(): Promise<void> }> {
      transformCalls.tool += 1;
      if (options.failToolTransform !== undefined) {
        throw options.failToolTransform;
      }
      callback({
        add: (definition: StubTool) => {
          tools.set(definition.name, definition);
        },
      });
      return { dispose: async () => undefined };
    },
  };

  const session = {
    async prompt(input: { sessionID: string; text: string }): Promise<void> {
      if (options.failPrompt !== undefined) {
        throw options.failPrompt;
      }
      prompts.push({ sessionID: input.sessionID, text: input.text });
    },
  };

  const ctx = { agent, command, tool, session } as unknown as Plugin.Context;
  return { ctx, agents, commands, tools, prompts, transformCalls };
}
