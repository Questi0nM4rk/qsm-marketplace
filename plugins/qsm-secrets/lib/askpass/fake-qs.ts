// Test fixture: a stand-in for `qs` that logs its argv and, on `ipc call askpass request`, answers on
// the request's reply socket as the person would. FAKE_ACTION is allow, deny, cancel, or none (no
// answer at all); FAKE_VALUE is the typed text; FAKE_QS_LOG names the file the argv lines go to.

export const FAKE_QS = `#!/usr/bin/env bun
import { appendFileSync } from "node:fs";
import { connect } from "node:net";
const args = process.argv.slice(2);
const log = process.env.FAKE_QS_LOG;
if (log) appendFileSync(log, JSON.stringify(args) + "\\n");
const at = args.indexOf("request");
if (args[0] === "ipc" && at !== -1) {
  if (process.env.FAKE_ACTION === "none") {
    console.log("queued");
    process.exit(0);
  }
  const request = JSON.parse(args[at + 1]);
  const line = JSON.stringify({
    nonce: request.nonce,
    action: process.env.FAKE_ACTION ?? "allow",
    value: process.env.FAKE_VALUE ?? "",
  });
  // The asker waits in spawnSync for this process, so it cannot close its side yet: exit once the
  // line is flushed, as the real pane answers after \`qs ipc call\` has returned.
  const socket = connect(request.socketPath, () =>
    socket.end(line + "\\n", () => {
      console.log("queued");
      process.exit(0);
    }),
  );
  socket.on("error", () => process.exit(1));
}
`;
