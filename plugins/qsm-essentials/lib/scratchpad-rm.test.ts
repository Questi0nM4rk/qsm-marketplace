import { expect, test } from "bun:test";
import { removesOnlyScratchpad } from "./scratchpad-rm.ts";

const ID = "f6269e63-e8d4-4e95-9962-553456f2dc13";
const PAD = `/tmp/claude-1000/-home-me-project/${ID}/scratchpad`;
const removes = (command: string) => removesOnlyScratchpad({ command, sessionId: ID });

// A false allow deletes outside the scratchpad without a prompt, so the escapes are the cases.
test("an rm or rmdir inside this session's scratchpad is allowed, nothing else", () => {
  const allowed = [
    `rm -rf ${PAD}/hooks-test`,
    `rm ${PAD}/a.txt ${PAD}/b.txt`,
    `rmdir ${PAD}/empty`,
    `rm -rf ${PAD}/run-*`,
    `rm -rf -- ${PAD}/x`,
  ];
  const refused = [
    `rm -rf ${PAD}`,
    `rm -rf ${PAD}/../other`,
    `rm -rf ${PAD}/x /home/me`,
    `rm -rf ${PAD}/*/../../x`,
    `rm -rf /tmp/claude-1000/-home-me-project/another-session/scratchpad/x`,
    `rm -rf ${PAD}/x && rm -rf /home/me`,
    `rm -rf ${PAD}/$HOME`,
    `rm -rf "${PAD}/x"`,
    `rm -rf hooks-test`,
    `cat ${PAD}/x`,
    `rm -rf`,
    `rm -- ${PAD}/x -file-in-cwd`,
  ];
  expect(allowed.filter((c) => !removes(c))).toEqual([]);
  expect(refused.filter((c) => removes(c))).toEqual([]);
});
