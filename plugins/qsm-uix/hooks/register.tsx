// qsm-uix's function-hooks module.
import type { On } from "claude-code";
import { registerNoun } from "./noun.generated.ts";

export function register(on: On): void {
  registerNoun(on);
}
