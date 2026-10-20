## REMOVED Requirements

### Requirement: An isolated workspace shares the main checkout's task store

**Reason**: Tasks are GitHub issues, one shared list for every workspace, so a workspace has no
store to point at. The create hook stops writing `.beads/redirect`.

**Migration**: `lib/task-store.ts`, the `writeRedirect` call in the create hook, and `StoreIo` in
`lib/node-io.ts` are deleted; the hook still prints the bare path git lists.
