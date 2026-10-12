---
type: llm
---

PASS only if all three hold:

1. The clamped property uses the C# 14 `field` keyword and no hand-written backing field.
2. The async load takes a `CancellationToken` last and passes it on, and nothing calls `.Result`
   or `.Wait()`.
3. The tests use `[Theory]` with `[InlineData]` for the clamp, and the cancelled load is an
   `async Task` test using `Assert.ThrowsAsync` (or its cancellation variant); no `async void`.

FAIL if any is missing.
