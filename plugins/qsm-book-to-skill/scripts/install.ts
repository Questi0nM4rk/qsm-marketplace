#!/usr/bin/env bun
// One step.
import { installScript } from "../../../lib/install-base.ts";

export const install = installScript(import.meta);
