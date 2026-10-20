import { Model, type Plugin } from "@opencode/plugin";
import { z } from "zod";

const inputSchema = z.strictObject({
  action: z.enum(["models", "list", "set", "reset"]),
  provider: z.string().min(1).optional(),
  agent: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

/** A Markdown table cell: a pipe would end the cell, a newline would end the row. */
const cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");

/** Agent transforms change future dispatch definitions, not an existing session's selection. */
export async function registerAgentModels(ctx: Plugin.Context): Promise<void> {
  const overrides = new Map<string, Model.Ref>();
  await ctx.agent.transform((editor) => {
    for (const [id, model] of overrides) {
      editor.update(id, (agent) => {
        agent.model = model;
      });
    }
  });

  const list = async () =>
    (await ctx.agent.list()).data.map((agent) => ({
      id: agent.id,
      name: agent.name,
      model: agent.model ?? null,
      override: overrides.get(agent.id) ?? null,
    }));

  await ctx.tool.transform((editor) => {
    editor.namespace({ name: "qsm", description: "Temporary OpenCode worker controls" });
    editor.add({
      name: "agent_model",
      description:
        "Call models for a live Markdown table of enabled model IDs, variants, tool support and context limits (optional provider filter). Call list for exact agent IDs or set/reset any registered agent's runtime model. Set takes provider/model#variant and validates availability. Changes affect future agent dispatches, not existing sessions; reset restores the underlying definition. No config files are edited.",
      input: inputSchema,
      options: { namespace: "qsm", codemode: true },
      async execute(input) {
        const args = inputSchema.parse(input);
        if (args.action === "models") {
          const models = (await ctx.model.list()).data
            .filter(
              (model) =>
                model.enabled &&
                (args.provider === undefined || model.providerID === args.provider),
            )
            .toSorted((a, b) => `${a.providerID}/${a.id}`.localeCompare(`${b.providerID}/${b.id}`));
          if (models.length === 0) {
            return {
              content: `No enabled models${args.provider === undefined ? "" : ` for provider ${args.provider}`}.`,
            };
          }
          return {
            content: [
              "Live enabled models; provider credentials and quota are still required.",
              "",
              "| Model reference | Variants | Tools | Context tokens |",
              "| --- | --- | --- | --- |",
              ...models.map(
                (model) =>
                  `| ${cell(`${model.providerID}/${model.id}`)} | ${cell(model.variants.map((variant) => variant.id).join(", ")) || "— (omit suffix)"} | ${model.capabilities.tools ? "yes" : "no"} | ${model.limit.context > 0 ? model.limit.context : "not supplied"} |`,
              ),
            ].join("\n"),
          };
        }
        if (args.action === "list") {
          return { content: JSON.stringify(await list()) };
        }
        const agent = (await ctx.agent.list()).data.find((a) => a.id === args.agent);
        if (agent === undefined) {
          throw new Error(`Unknown agent ${args.agent ?? "(missing)"}; call list for exact IDs`);
        }
        const previous = overrides.get(agent.id);
        if (args.action === "set") {
          if (args.model === undefined) {
            throw new Error("set requires model in provider/model#variant form");
          }
          const ref = Model.Ref.parse(args.model);
          const model = (await ctx.model.list()).data.find(
            (m) => m.providerID === ref.providerID && m.id === ref.id && m.enabled,
          );
          if (model === undefined) {
            throw new Error(`Unavailable model ${args.model}`);
          }
          if (ref.variant !== undefined && !model.variants.some((v) => v.id === ref.variant)) {
            throw new Error(`Unknown variant ${ref.variant} for ${ref.providerID}/${ref.id}`);
          }
          overrides.set(agent.id, ref);
        } else {
          overrides.delete(agent.id);
        }
        try {
          await ctx.agent.reload();
          return {
            content: JSON.stringify({
              action: args.action,
              agent: (await list()).find((a) => a.id === agent.id),
              scope: "future agent dispatches in this plugin instance; existing sessions unchanged",
            }),
          };
        } catch (error) {
          if (previous === undefined) {
            overrides.delete(agent.id);
          } else {
            overrides.set(agent.id, previous);
          }
          await ctx.agent.reload();
          throw error;
        }
      },
    });
  });
}
