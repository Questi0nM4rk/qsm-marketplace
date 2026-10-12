Approach: spawn six agents in parallel, one per module. Flow: 1. Dispatch six sonnet agents, each
told to rename Clock to TimeSource in its directory and run bun test. 2. When audit reports all
tests pass, I mark it done. Next step: dispatch the six agents.
