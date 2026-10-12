// A workspace is a place to work in, and work is tracked in the task tool's store.

/** The file operations the redirect needs, so the writer works both from a
 * hooks module (the engine's file system) and from a test (a sandbox). */
export interface StoreIo {
  readonly exists: (path: string) => Promise<boolean>;
  readonly write: (path: string, text: string) => Promise<void>;
}

const STORE_DIR = ".beads";
const REDIRECT_FILE = "redirect";

export function storePath(root: string): string {
  return `${trimEnd(root)}/${STORE_DIR}`;
}

export function redirectPath(workspace: string): string {
  return `${storePath(workspace)}/${REDIRECT_FILE}`;
}

/** Points the workspace at the main checkout's store. */
export async function writeRedirect(
  io: StoreIo,
  workspace: string,
  mainCheckout: string,
): Promise<boolean> {
  const target = storePath(mainCheckout);
  if (!(await io.exists(target))) {
    return false;
  }
  await io.write(redirectPath(workspace), `${target}\n`);
  return true;
}

function trimEnd(path: string): string {
  return path.replace(/\/+$/, "");
}
