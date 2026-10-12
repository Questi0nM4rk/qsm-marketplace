// Which plugin of a marketplace a file belongs to, as text: the hook asks it before it spends a
// verb, and the verb asks it again to find the marketplace root.

export interface PluginFile {
  /** the marketplace root: the path before `/plugins/<name>/` */
  readonly root: string;
  readonly plugin: string;
}

/** The plugin an absolute path lies inside (`<root>/plugins/<name>/...`), or null for any other path. */
export function pluginOfPath(path: string): PluginFile | null {
  const found = /^(\/.*?)\/plugins\/([^/]+)\/.+/.exec(path);
  return found === null ? null : { root: found[1] ?? "", plugin: found[2] ?? "" };
}
