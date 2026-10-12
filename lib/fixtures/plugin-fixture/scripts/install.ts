#!/usr/bin/env bun
// The fixture plugin's installer, the same three lines every plugin ships.
import { installScript } from "../../../install-base.ts";

export const install = installScript(import.meta);
