// Every declared bin compiles to a standalone binary through its plugin's own installer on the
// shared install base; qsm-setup runs that installer with machine output, reads the `bin <name>`
// step, and records what came out.
import { join } from "node:path";
import { type BuildRecord, sha256, writeRecord } from "../../../lib/install-base.ts";
import type { PluginNode } from "./discover.ts";
import { declaredBins } from "./farm.ts";
import type { Runner, RunResult } from "./run-installers.ts";

export interface BuildOutcome {
  readonly plugin: string;
  readonly bin: string;
  readonly status: "built" | "failed";
  readonly detail: string;
}

function binStep(r: RunResult, bin: string): { readonly ok: boolean; readonly detail: string } {
  if (r.result === null) {
    return { ok: false, detail: `installer exited ${r.code} and printed no envelope` };
  }
  const step = r.result.steps.find((s) => s.name === `bin ${bin}`);
  if (step === undefined) {
    return { ok: false, detail: `installer reported no step for bin ${bin}` };
  }
  return { ok: step.status === "installed" || step.status === "already", detail: step.detail };
}

export function buildBins(
  nodes: readonly PluginNode[],
  opts: { readonly binDir: string; readonly recordPath: string; readonly run: Runner },
): BuildOutcome[] {
  const out: BuildOutcome[] = [];
  const bins: Record<string, { plugin: string; sha256: string }> = {};
  const byPlugin = new Map<string, PluginNode>(nodes.map((n) => [n.name, n]));
  const ran = new Map<string, RunResult>();
  for (const d of declaredBins(nodes)) {
    const node = byPlugin.get(d.plugin);
    if (node?.installer === null || node === undefined) {
      out.push({
        ...d,
        status: "failed",
        detail: "declares a compilable command but ships no scripts/install.ts",
      });
      continue;
    }
    let r = ran.get(d.plugin);
    if (r === undefined) {
      r = opts.run(node.installer, false);
      ran.set(d.plugin, r);
    }
    const step = binStep(r, d.bin);
    if (!step.ok) {
      out.push({ ...d, status: "failed", detail: step.detail });
      continue;
    }
    const path = join(opts.binDir, d.bin);
    bins[d.bin] = { plugin: d.plugin, sha256: sha256(path) };
    out.push({ ...d, status: "built", detail: path });
  }
  const record: BuildRecord = { bins };
  writeRecord(opts.recordPath, record);
  return out;
}
