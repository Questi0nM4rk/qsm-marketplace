// One backend command per entry, all started at once: a mask reads every stored value, and one read
// after another made every tool call wait on the sum of them.
import { execFile } from "node:child_process";

/** Each command's stdout, or null when it failed, in the order of `argsList`. */
export function runAll(
  bin: string,
  argsList: readonly (readonly string[])[],
): Promise<(Buffer | null)[]> {
  return Promise.all(
    argsList.map(
      (args) =>
        new Promise<Buffer | null>((resolve) => {
          execFile(bin, [...args], { encoding: "buffer" }, (error, stdout) => {
            resolve(error === null ? stdout : null);
          });
        }),
    ),
  );
}
