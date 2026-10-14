// The Workflow runtime injects these globals into strict-review.mjs. A dead
// agent or a failed thunk arrives as null, so every result is `T | null`. What
// an agent returns is unchecked until the script narrows it.

interface AgentOptions {
  readonly schema: object;
  readonly model: string;
  readonly phase: string;
  readonly label?: string;
}

declare const args: unknown;
declare function agent(prompt: string, options: AgentOptions): Promise<unknown>;
declare function parallel<T>(thunks: ReadonlyArray<() => Promise<T>>): Promise<Array<T | null>>;
declare function phase(title: string): void;
declare function log(message: string): void;
