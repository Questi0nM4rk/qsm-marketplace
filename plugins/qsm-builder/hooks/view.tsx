// A read-only view of the lens's model in a pane. `/lens` opens the whole marketplace, `/lens
// <plugin>` one plugin, and a plugin line or a skill or agent line can be pressed to open the
// next level. It draws what `qsm-builder lens marketplace` and `lens plugin` read; it edits
// nothing. What the pane shows travels in its id (a pane id holds letters, digits, `_` and `-`),
// so the pane keeps no state.
import type { EngineInterface, On } from "claude-code";
import { isRecord, listOf } from "../lib/guards.ts";

const MARKETPLACE = "lens";
const PREFIX = "lens_";
const ITEM_SEP = "__";
const WIDE = 100;

interface Task {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly stale: boolean | null;
}

interface MarketView {
  readonly name: string;
  readonly why: string | null;
  readonly plugins: readonly {
    name: string;
    line: string | null;
    dependencies: readonly string[];
    openTasks: number | null;
  }[];
  readonly tasksNote: string;
}

interface PluginView {
  readonly plugin: string;
  readonly why: string | null;
  readonly items: readonly {
    kind: string;
    name: string;
    line: string;
    description: string;
    triggers: readonly string[];
  }[];
  readonly dependencies: readonly { name: string; reason: string | null }[];
  readonly tasks: readonly Task[] | null;
  readonly tasksNote: string;
}

const isStrings = (v: unknown): boolean => listOf(v).every((x) => typeof x === "string");
const isTextOrNull = (v: unknown): boolean => v === null || typeof v === "string";

function isMarketPlugin(p: unknown): p is MarketView["plugins"][number] {
  return (
    isRecord(p) &&
    typeof p.name === "string" &&
    isTextOrNull(p.line) &&
    Array.isArray(p.dependencies) &&
    isStrings(p.dependencies) &&
    (p.openTasks === null || typeof p.openTasks === "number")
  );
}

function isMarketView(v: unknown): v is MarketView {
  return (
    isRecord(v) &&
    typeof v.name === "string" &&
    isTextOrNull(v.why) &&
    typeof v.tasksNote === "string" &&
    Array.isArray(v.plugins) &&
    v.plugins.every(isMarketPlugin)
  );
}

const isTask = (v: unknown): v is Task =>
  isRecord(v) &&
  typeof v.id === "string" &&
  typeof v.kind === "string" &&
  typeof v.title === "string" &&
  (v.stale === null || typeof v.stale === "boolean");

function isPluginView(v: unknown): v is PluginView {
  return (
    isRecord(v) &&
    typeof v.plugin === "string" &&
    isTextOrNull(v.why) &&
    typeof v.tasksNote === "string" &&
    Array.isArray(v.items) &&
    v.items.every(
      (i: unknown) =>
        isRecord(i) &&
        typeof i.kind === "string" &&
        typeof i.name === "string" &&
        typeof i.line === "string" &&
        typeof i.description === "string" &&
        Array.isArray(i.triggers) &&
        isStrings(i.triggers),
    ) &&
    Array.isArray(v.dependencies) &&
    v.dependencies.every(
      (d: unknown) => isRecord(d) && typeof d.name === "string" && isTextOrNull(d.reason),
    ) &&
    (v.tasks === null || (Array.isArray(v.tasks) && v.tasks.every(isTask)))
  );
}

/** What a verb read: the marketplace, or one plugin. */
type Loaded = { readonly market: MarketView } | { readonly plugin: PluginView };

type Elements = ReturnType<EngineInterface["ui"]["resolve"]>;

/** What a draw needs: the elements, the width, and how a press opens the next level. */
interface Ctx {
  readonly els: Pick<Elements, "Box" | "Text" | "Button">;
  readonly room: number;
  readonly open: (id: string) => Promise<unknown>;
}

const cut = (text: string, room: number): string =>
  text.length <= room ? text : `${text.slice(0, Math.max(1, room - 1))}…`;

// One verb call per opening, not per redraw: the view is kept by pane id until the command runs
// again. A pane that outlives a reload of this module reads it again on its next draw.
const views = new Map<string, Promise<Loaded>>();

const idOf = (plugin: string, item?: string): string =>
  item === undefined ? `${PREFIX}${plugin}` : `${PREFIX}${plugin}${ITEM_SEP}${item}`;

function load($: EngineInterface, id: string): Promise<Loaded> {
  const read = async (): Promise<Loaded> => {
    const dir = await $.session.cwd();
    if (id === MARKETPLACE) {
      const market: unknown = await $.builder.lensMarketplace({ dir });
      if (!isMarketView(market)) {
        throw new Error("the marketplace view has an unexpected shape");
      }
      return { market };
    }
    const [name = ""] = id.slice(PREFIX.length).split(ITEM_SEP);
    const plugin: unknown = await $.builder.lensPlugin({ plugin: name, dir });
    if (!isPluginView(plugin)) {
      throw new Error(`the view of ${name} has an unexpected shape`);
    }
    return { plugin };
  };
  const loaded = read();
  views.set(id, loaded);
  return loaded;
}

function tasksLines(Text: Elements["Text"], view: PluginView, room: number) {
  if (view.tasks === null) {
    return <Text color="yellow">{cut(view.tasksNote, room * 2)}</Text>;
  }
  if (view.tasks.length === 0) {
    return <Text dimColor>none</Text>;
  }
  return view.tasks.map((t) => (
    <Text>{cut(`${t.id} ${t.kind}${t.stale === true ? " (stale)" : ""}: ${t.title}`, room)}</Text>
  ));
}

function drawMarketplace({ els, open, room }: Ctx, view: MarketView) {
  const { Box, Text, Button } = els;
  return (
    <Box flexDirection="column">
      <Text bold>{view.name}</Text>
      <Text bold>Why it exists</Text>
      <Text>{view.why ?? "the README has no Why it exists section"}</Text>
      <Text bold>Plugins ({view.plugins.length})</Text>
      {view.plugins.map((p) => (
        <Box flexDirection="column">
          <Button key={`open-${p.name}`} plain onPress={() => open(idOf(p.name))}>
            {cut(`${p.name} (${p.openTasks ?? "tasks not read"} open tasks)`, room)}
          </Button>
          <Text>{cut(`  ${p.line ?? "no Why it exists section"}`, room)}</Text>
          <Text dimColor>
            {cut(
              `  depends on: ${p.dependencies.length === 0 ? "none" : p.dependencies.join(", ")}`,
              room,
            )}
          </Text>
        </Box>
      ))}
      {view.plugins.every((p) => p.openTasks === null) && (
        <Text color="yellow">{cut(view.tasksNote, room * 2)}</Text>
      )}
    </Box>
  );
}

function drawPlugin({ els, open, room }: Ctx, view: PluginView) {
  const { Box, Text, Button } = els;
  return (
    <Box flexDirection="column">
      <Text bold>{view.plugin}</Text>
      <Text bold>Why it exists</Text>
      <Text>{view.why ?? "this plugin's README has no Why it exists section"}</Text>
      <Text bold>Skills and agents ({view.items.length})</Text>
      {view.items.map((i) => (
        <Button key={`open-${i.name}`} plain onPress={() => open(idOf(view.plugin, i.name))}>
          {cut(`${i.kind} ${i.name}: ${i.line}`, room)}
        </Button>
      ))}
      <Text bold>Dependencies ({view.dependencies.length})</Text>
      {view.dependencies.length === 0 && <Text dimColor>none</Text>}
      {view.dependencies.map((d) => (
        <Text>{cut(`${d.name}: ${d.reason ?? "the spec gives no reason"}`, room)}</Text>
      ))}
      <Text bold>Open tasks ({view.tasks?.length ?? "not read"})</Text>
      {tasksLines(Text, view, room)}
    </Box>
  );
}

function drawItem({ els }: Ctx, view: PluginView, name: string) {
  const { Box, Text } = els;
  const item = view.items.find((i) => i.name === name);
  if (item === undefined) {
    return <Text color="red">{`${view.plugin} has no skill or agent ${name}`}</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text bold>{`${view.plugin}: ${item.kind} ${item.name}`}</Text>
      <Text bold>Description</Text>
      <Text>{item.description}</Text>
      <Text bold>Trigger words</Text>
      <Text>{item.triggers.length === 0 ? "none written" : item.triggers.join(", ")}</Text>
    </Box>
  );
}

function draw(ctx: Ctx, id: string, loaded: Loaded) {
  if ("market" in loaded) {
    return drawMarketplace(ctx, loaded.market);
  }
  const [, item] = id.slice(PREFIX.length).split(ITEM_SEP);
  return item === undefined ? drawPlugin(ctx, loaded.plugin) : drawItem(ctx, loaded.plugin, item);
}

export function registerView(on: On): void {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "lens",
      description:
        "Open a read-only view of the marketplace, or of one plugin: why it exists, skills, dependencies, open tasks",
    });
    return next(e);
  });

  on("command.run", { command: "lens" }, async ($, e) => {
    const name = e.args.trim();
    const id = name === "" ? MARKETPLACE : idOf(name);
    views.set(id, load($, id));
    await $.ui.open({ id, title: name === "" ? "lens" : name });
    return { text: name === "" ? "Marketplace view opened." : `Plugin view of ${name} opened.` };
  });

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    const id = e.requestId;
    if (id !== MARKETPLACE && !id.startsWith(PREFIX)) {
      return next(e);
    }
    const els = $.ui.resolve(e);
    const room = Math.max(20, (e.props.bodyColumns ?? WIDE) - 4);
    // A press opens the next level in its own pane, loaded when that pane first draws.
    const open = (target: string) =>
      $.ui.open({ id: target, title: target.slice(PREFIX.length).replace(ITEM_SEP, " / ") });
    let loaded: Loaded;
    try {
      loaded = await (views.get(id) ?? load($, id));
    } catch (error) {
      // differs: hooks sandbox, root lib's messageOf
      const why = error instanceof Error ? error.message : String(error);
      return <els.Text color="red">{cut(`lens view failed: ${why}`, room * 3)}</els.Text>;
    }
    return draw({ els, open, room }, id, loaded);
  });
}
