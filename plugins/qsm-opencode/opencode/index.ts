import { Plugin } from "@opencode/plugin";
import { registerAgentModels } from "../lib/agent-model.ts";

export default Plugin.define({
  id: "qsm.opencode.agent-model",
  setup: registerAgentModels,
});
