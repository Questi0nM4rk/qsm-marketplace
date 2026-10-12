// The lens's model as small read-only views: the marketplace (every plugin with its reason in one
// line, its dependencies, its count of open tasks) and one plugin (why it exists, its skills and
// agents, its dependencies with their reasons, its open tasks). The mod pane draws them.

import { firstSentence, type Marketplace, type Plugin } from "./model.ts";

export interface PluginView {
  readonly plugin: string;
  readonly why: string | null;
  readonly items: readonly {
    readonly kind: string;
    readonly name: string;
    readonly line: string;
    readonly description: string;
    readonly triggers: readonly string[];
  }[];
  /** `reason` is null for a dependency the spec gives no reason for */
  readonly dependencies: readonly { readonly name: string; readonly reason: string | null }[];
  /** null when the tasks were not read, and then `tasksNote` says why */
  readonly tasks:
    | readonly {
        readonly id: string;
        readonly kind: string;
        readonly title: string;
        readonly stale: boolean | null;
      }[]
    | null;
  readonly tasksNote: string;
}

export interface MarketplaceView {
  readonly name: string;
  readonly why: string | null;
  readonly plugins: readonly {
    readonly name: string;
    /** the first sentence of its `## Why it exists`; null without one */
    readonly line: string | null;
    readonly dependencies: readonly string[];
    /** null when tasks were not read, and then `tasksNote` says why */
    readonly openTasks: number | null;
  }[];
  readonly tasksNote: string;
}

export function marketplaceView(market: Marketplace): MarketplaceView {
  return {
    name: market.name,
    why: market.why,
    plugins: market.plugins.map((p) => ({
      name: p.name,
      line: p.why === null ? null : firstSentence(p.why),
      dependencies: p.dependencies,
      openTasks: p.tasks?.filter((t) => !t.epic).length ?? null,
    })),
    tasksNote: market.tasksNote,
  };
}

export function viewOf(market: Marketplace, name: string): PluginView | null {
  const p: Plugin | undefined = market.plugins.find((x) => x.name === name);
  if (p === undefined) {
    return null;
  }
  return {
    plugin: p.name,
    why: p.why,
    items: p.items.map((i) => ({
      kind: i.kind,
      name: i.name,
      line: firstSentence(i.description),
      description: i.description,
      triggers: i.triggers,
    })),
    dependencies: p.dependencies.map((d) => ({ name: d, reason: p.dependencyReasons[d] ?? null })),
    tasks:
      p.tasks
        ?.filter((t) => !t.epic)
        .map((t) => ({ id: t.id, kind: t.kind, title: t.title, stale: t.stale })) ?? null,
    tasksNote: market.tasksNote,
  };
}
