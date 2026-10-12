---
type: llm
---

PASS only if the reply names all three, each correctly:

1. the postinstall package listed in `"trustedDependencies"`, with the reason that Bun skips
   dependency install scripts unless trusted;
2. an `exports` map that gives Bun the source and Node a built file, and a `bun build` for the
   published build that targets `node`, not `bun`;
3. the environment setting that turns off Bun's runtime transpiler cache for the read-only Docker
   image.

FAIL if it uses `--target=bun` for the build Node users install.
