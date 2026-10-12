// Dependency order over plugin.json's `dependencies`: a required plugin comes
// before the one that needs it. Naming a plugin pulls its requirements in.
import type { PluginNode } from "./discover.ts";

/** For every plugin in `order` that was not selected, the plugins in `order`
 * that name it as a requirement: the reason it is being installed. */
export function requiredBy(
  nodes: readonly PluginNode[],
  order: readonly string[],
  selected: readonly string[] | undefined,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (selected === undefined) {
    return out;
  }
  const inOrder = new Set(order);
  for (const node of nodes.filter((n) => inOrder.has(n.name))) {
    for (const dep of node.dependencies.filter((d) => !selected.includes(d))) {
      out.set(dep, [...(out.get(dep) ?? []), node.name]);
    }
  }
  return out;
}

export function installOrder(nodes: readonly PluginNode[], selected?: readonly string[]): string[] {
  const byName = new Map(nodes.map((n) => [n.name, n]));
  for (const name of selected ?? []) {
    if (!byName.has(name)) {
      throw new Error(`unknown plugin: ${name}`);
    }
  }
  const order: string[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (name: string, trail: readonly string[]): void => {
    if (done.has(name)) {
      return;
    }
    if (visiting.has(name)) {
      throw new Error(`dependency cycle: ${[...trail, name].join(" -> ")}`);
    }
    const node = byName.get(name);
    if (node === undefined) {
      throw new Error(`${trail.at(-1) ?? "?"} requires unknown plugin: ${name}`);
    }
    visiting.add(name);
    for (const dep of node.dependencies) {
      visit(dep, [...trail, name]);
    }
    visiting.delete(name);
    done.add(name);
    order.push(name);
  };
  for (const name of selected ?? nodes.map((n) => n.name)) {
    visit(name, []);
  }
  return order;
}
