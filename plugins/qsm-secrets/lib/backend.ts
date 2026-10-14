// What every verb needs from a vault, and which vault is in use.

import { existsSync, readFileSync } from "node:fs";
import { setupConfigPath } from "../../../lib/paths.ts";
import type { Check } from "./doctor.ts";
import type { Entry } from "./entries.ts";
import { fail } from "./errors.ts";
import { libsecret } from "./libsecret.ts";
import { rbw } from "./rbw.ts";

export interface Backend {
  readonly name: string;
  /** Name, folder and marker of every entry. Never a value. A backend that cannot list fails loud. */
  entries: () => Entry[];
  /** The value as bytes, or null when the key is not stored. */
  read: (namespace: string, key: string) => Uint8Array | null;
  /**
   * Stores a key. Without a value it is typed into the backend's own prompt; a caller that already
   * holds the value (a captured paste) passes it, and it travels on stdin, never in argv.
   */
  store: (namespace: string, key: string, value?: Uint8Array) => void;
  /** False when the backend refused. */
  remove: (namespace: string, key: string) => boolean;
  /** Every prerequisite the other operations depend on. */
  health: (namespace: string, env: Record<string, string | undefined>) => Check[];
}

const BACKENDS: readonly Backend[] = [rbw, libsecret];

/** What the person calls each backend, and the backend's own name. The only place they meet. */
export const CHOICES = { bitwarden: rbw.name, libsecret: libsecret.name } as const;

type Choice = keyof typeof CHOICES;

const ACTIVATE = "qsm-setup activate qsm-secrets -- --backend bitwarden|libsecret";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function isJson(value: unknown): value is Json {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJson(item));
  }
  return typeof value === "object" && Object.values(value).every((item) => isJson(item));
}

/** The object in setup.json, or `{}` when the file is absent. Anything else is `usage`. */
export function readSetup(env: Record<string, string | undefined>): { [key: string]: Json } {
  const path = setupConfigPath(env);
  if (!existsSync(path)) {
    return {};
  }
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isJson(parsed) || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail(`${path} is not a JSON object`, `fix or delete it, then run ${ACTIVATE}`, "usage");
  }
  return parsed;
}

/** The `secrets.backend` of a setup object as written, undefined when absent. */
export function setupBackend(file: { [key: string]: Json }): Json | undefined {
  const secrets = file.secrets;
  if (typeof secrets !== "object" || secrets === null || Array.isArray(secrets)) {
    return undefined;
  }
  return secrets.backend;
}

const isChoice = (name: string): name is Choice => Object.hasOwn(CHOICES, name);

/** The backend setup.json names under `secrets.backend`, or undefined when none was chosen. */
function stored(env: Record<string, string | undefined>): string | undefined {
  const choice = setupBackend(readSetup(env));
  if (choice === undefined) {
    return undefined;
  }
  if (typeof choice !== "string" || !isChoice(choice)) {
    const named = typeof choice === "string" ? choice : JSON.stringify(choice);
    fail(`${setupConfigPath(env)} names an unknown backend: ${named}`, `run ${ACTIVATE}`, "usage");
  }
  return CHOICES[choice];
}

/** Whether a backend is chosen at all. Without one nothing can be stored, so nothing needs masking. */
export function backendChosen(env: Record<string, string | undefined> = process.env): boolean {
  return (env.QSM_SECRETS_BACKEND ?? stored(env)) !== undefined;
}

/**
 * The one backend in use: `QSM_SECRETS_BACKEND`, else the choice activation stored. No choice is
 * `missing`, never a default, so a person who chose libsecret never reaches rbw.
 */
export function activeBackend(env: Record<string, string | undefined> = process.env): Backend {
  const wanted = env.QSM_SECRETS_BACKEND ?? stored(env);
  if (wanted === undefined) {
    return fail("no backend chosen", `run ${ACTIVATE}`, "missing");
  }
  const found = BACKENDS.find((backend) => backend.name === wanted);
  if (found === undefined) {
    const known = BACKENDS.map((backend) => backend.name).join(", ");
    fail(`unknown backend: ${wanted}`, `set QSM_SECRETS_BACKEND to one of: ${known}`, "usage");
  }
  return found;
}
