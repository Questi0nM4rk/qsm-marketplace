Approach: I read DECISIONS.md and src/store.ts first. Settled already: the cache is in-process only
and 60 seconds of staleness is fine; the store is a JSON file loaded whole. I do not ask those.
Flow:

1. What is cached: the whole loaded list or single task lookups? I recommend the whole list, since
   load() reads the entire file anyway.
2. When is an entry dropped on write: on every write or only by the 60 seconds timeout? I
   recommend dropping on write, it costs one line and avoids reading your own stale write.
3. Who owns the cache: the store module or the callers? I recommend the store module.
Held for the next round: eviction and size limits, they depend on answer 1.
Next step: wait for your answers to 1 to 3.
