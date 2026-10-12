// The shape of one language's import reader, apart from the graph so the readers
// import it without importing the graph back.

/** One language's reader. `id` is part of the cache key, so a change to
 * what `scan` returns must change the id. */
export interface Extractor {
  readonly id: string;
  /** The file's import specifiers, as written. Throws when the source
   * cannot be read as the language. */
  readonly scan: (source: string, file: string) => string[] | Promise<string[]>;
  /** The repository file `spec` names from `file`, or null. Paths are
   * repository-relative with `/` separators. */
  readonly resolve: (
    spec: string,
    file: string,
    isFile: (path: string) => boolean,
  ) => string | null;
}
