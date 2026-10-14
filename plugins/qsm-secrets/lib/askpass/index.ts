// The only place the kinds are listed: a kind is a name and the provider that serves it. The pane
// has the matching table in qml/askpass/Kinds.js.

import { fail } from "../errors.ts";
import { decide } from "./providers/decide.ts";
import { git } from "./providers/git.ts";
import { secret } from "./providers/secret.ts";
import { ssh } from "./providers/ssh.ts";
import { sudo } from "./providers/sudo.ts";
import type { Provider } from "./types.ts";

export const PROVIDERS: Readonly<Record<string, Provider>> = { secret, sudo, ssh, git, decide };

export function providerOf(kind: string): Provider {
  return Object.hasOwn(PROVIDERS, kind)
    ? (PROVIDERS[kind] as Provider)
    : fail(
        `unknown askpass kind: ${kind}`,
        `use one of: ${Object.keys(PROVIDERS).join(", ")}`,
        "usage",
      );
}
