// The session state qsm-secrets keeps. Self-contained, as a plugin's type contract must be: the row
// is spelt here as lib/capture-row.ts's CaptureListing is.

/** A row of `qsm-secrets captures`, never a value. */
export type ReviewListing = {
  namespace: string;
  key: string;
  kind: string;
  capturedAt: string;
  session: string | null;
  cwd: string | null;
};

declare module "claude-code" {
  interface PluginState {
    "qsm-secrets": {
      /** The review pane's rows as `qsm-secrets captures` last listed them (null before the first
       * load), and the outcome code of each delete that failed, by id. */
      review: Shaped<{ listed: ReviewListing[] | null; failed: Record<string, string> }>;
    };
  }
}
