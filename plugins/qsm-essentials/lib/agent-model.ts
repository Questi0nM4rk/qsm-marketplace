// Every agent names its model: the tier of a model alias or id, the refusal for a spawn that names
// none, and the colour the transcript draws each tier in.

const TIERS = ["haiku", "sonnet", "opus", "fable"] as const;

export const TIER_COLOR: Readonly<Record<string, string>> = {
  haiku: "green",
  sonnet: "cyan",
  opus: "magenta",
  fable: "yellow",
};

export const NO_MODEL =
  "Name the model on every agent (haiku, sonnet, opus or fable): an agent left without one inherits the session's model.";

/** The tier word of a model alias or id (`claude-sonnet-5-5` is sonnet), else the model itself. */
export function tierOf(model: string): string {
  return TIERS.find((tier) => model.includes(tier)) ?? model;
}

/** The description with the tier in front, unless it already opens with a bracket. */
export function tagged(description: string, model: string): string {
  return description.startsWith("[") ? description : `[${tierOf(model)}] ${description}`;
}
