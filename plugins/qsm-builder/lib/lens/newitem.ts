// The new-item page: the forms that start a skill, an agent or a plugin as one task of kind new.
// A form has every field a detail page has, plus the use case, the CLI and the links, and refuses
// to save without an eval case. The page turns each Spec into a pen form; nothing is written.

import type { Marketplace } from "./model.ts";
import type { Field, Spec } from "./spec.ts";

const MODELS = ["", "haiku", "sonnet", "opus", "inherit"];

const text = (name: string, label: string, hint: string, required = true): Field => ({
  name,
  label,
  control: "textarea",
  value: "",
  hint,
  required,
});
const line = (name: string, label: string, hint: string, required = false): Field => ({
  name,
  label,
  control: "input",
  value: "",
  hint,
  required,
});

/** The fields every kind of new item has: its use case, its CLI, its links and its first eval case. */
const common = (): Field[] => [
  {
    name: "cli",
    label: "Ships a CLI verb",
    control: "select",
    value: "no",
    options: ["no", "yes"],
    hint: "A CLI is a compiled binary on the PATH (Iron Law 9), so say it now.",
  },
  line("links", "Plugins it links to, comma separated", "Each link is a dependency to write down."),
  text(
    "does",
    "What the eval does",
    "The situation the first eval case sets up, in the words of the person who needs the item.",
  ),
  text(
    "expects",
    "What the grader expects",
    "What the agent must do for the case to pass. An item without an eval case is not created.",
  ),
];

function itemSpec(kind: "skill" | "agent", plugins: readonly string[]): Spec {
  return {
    kind: "new",
    where: "",
    whereFrom: "{plugin}",
    file:
      kind === "skill"
        ? "plugins/{plugin}/skills/{name}/SKILL.md"
        : "plugins/{plugin}/agents/{name}.md",
    section: `new ${kind}`,
    what: `new ${kind}`,
    titleField: "name",
    check: true,
    fields: [
      {
        name: "plugin",
        label: "Plugin it belongs to",
        control: "select",
        value: plugins[0] ?? "",
        options: plugins,
        hint: "Search first: a new item goes into the plugin that already owns its subject.",
      },
      line(
        "name",
        "Name",
        "Lowercase words joined by hyphens; it is the folder or file name.",
        true,
      ),
      text(
        "description",
        "Use case and intent",
        "Who needs it and what they do with it. It becomes the description the harness reads to decide when to load it.",
      ),
      line(
        "triggers",
        "Trigger words, comma separated",
        "The words a user types that should load it.",
        true,
      ),
      { name: "model", label: "Model", control: "select", value: "", options: MODELS },
      line("tools", "Tools, comma separated", "Leave empty for no restriction."),
      ...common(),
    ],
  };
}

const pluginSpec: Spec = {
  kind: "new",
  where: "marketplace",
  file: "plugins/{name}/.claude-plugin/plugin.json",
  section: "new plugin",
  what: "new plugin",
  titleField: "name",
  check: true,
  fields: [
    line("name", "Name", "Lowercase words joined by hyphens, starting with qsm-.", true),
    text(
      "description",
      "Use case and intent",
      "The gap it closes and who it is for. It is the start of its Why it exists.",
    ),
    ...common(),
  ],
};

/** The three forms, each with the label of the button that opens it. */
export function newItemSpecs(m: Marketplace): { label: string; spec: Spec }[] {
  const plugins = m.plugins.map((p) => p.name);
  return [
    { label: "New skill", spec: itemSpec("skill", plugins) },
    { label: "New agent", spec: itemSpec("agent", plugins) },
    { label: "New plugin", spec: pluginSpec },
  ];
}

/** What "check whether this already exists" searches: every plugin, skill and agent with a line. */
export function searchIndex(
  m: Marketplace,
): { route: string; name: string; kind: string; line: string }[] {
  return m.plugins.flatMap((p) => [
    { route: p.name, name: p.name, kind: "plugin", line: p.description },
    ...p.items.map((i) => ({
      route: p.name,
      name: i.name,
      kind: `${p.name} ${i.kind}`,
      line: i.description,
    })),
  ]);
}
