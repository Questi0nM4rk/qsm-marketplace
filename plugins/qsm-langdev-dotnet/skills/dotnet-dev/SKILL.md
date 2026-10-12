---
name: dotnet-dev
description: "Use when writing or explaining C# on .NET 10: the C# 14 features (field keyword, extension members, collection expressions), records against classes, nullable reference types, async and cancellation, DI lifetimes and the captive dependency, and renaming or finding callers through the language server instead of grep. Triggers: writing C#, record vs class, pattern matching, nullable reference types, async/await, CancellationToken, IAsyncEnumerable, DI lifetime, scoped vs singleton, IOptions, rename a C# method, write a test in xUnit, Fact or Theory. The xUnit test idiom lives here too: Fact, Theory, fixtures, run one test."
---

# Writing C# code

C# written for this machine's .NET 10 SDK, where `AnalysisMode` is `All` under the strict profile
and every analyzer finding gates the build. This skill holds the choices the analyzers cannot make
and the features newer than what you were trained on most. It is not a language tutorial: what you
already write correctly is not repeated here.

## Navigate by symbol, because grep finds spellings

Before renaming a method or changing a signature, list its callers through the language server, and
after editing a `.cs` file read the diagnostics. The compiler finds callers reached through an
interface or a generic constraint; a text search does not.

## C# 14

The `field` keyword names a property's backing field, so a property with one rule needs no
hand-written field:

```csharp
public int Value { get => field; set => field = value < 0 ? 0 : value; }
```

An `extension` block declares extension members, properties included, on one receiver:

```csharp
static class Ext { extension(int[] source) { public int Total() => source.Sum(); } }
```

Collection expressions (`List<string> names = [..first, ..second];`) and list patterns
(`args is ["--verbose", .. var rest]`) replace the spelled-out forms.

## Types

Use a `record` for a value, a `class` for an entity with identity, a `readonly record struct` for a
small hot-path value. Make a type immutable unless you can name what mutates it, and seal a class
unless it is built for inheritance, because the analyzers ask and an unsealed class is an extension
point you must keep working. `required init` properties stop an object being half-built without a
constructor per combination.

Match over a closed hierarchy with a `switch` expression, because a missing arm fails to compile
where an `if` chain stays silent.

## Nullability is a contract

Nullable is on in both profiles and a warning is an error. Do not reach for `!`: make what you know
visible with a `TryGet`, or `ArgumentNullException.ThrowIfNull(arg)` at the boundary, because a
`!` moves the crash to run time.

## Async

Take a `CancellationToken` last on every async method that can be waited on and pass it onward,
because a token that stops at one layer makes shutdown hang at the next. Never call `.Result` or
`.Wait()`: under thread-pool load that is the deadlock you cannot reproduce locally. Return
`IAsyncEnumerable<T>` for a stream the caller consumes as it arrives. Use
`await foreach (var r in Task.WhenEach(tasks))` to take each result as it lands. A `ValueTask` is
awaited once.

## Dependency injection

A singleton that takes a scoped dependency captures it forever, so the scoped object outlives its
scope. Keep scope validation on everywhere, not only in Development, because that is what catches
it at startup. Bind configuration to a typed options class with `ValidateOnStart`, so a missing
setting fails the deploy and not the first request. Inject an abstraction you own, never
`IServiceProvider`, because a service locator hides the dependency from the compiler and the reader.

## Errors

Throw a specific exception naming the wrong value, and wrap with the inner exception when crossing
a layer. Return a result type where failure is expected and the caller must handle it.

## Tests in xUnit

One file per unit, named after it (`OrderServiceTests.cs`), test data built by a small factory that
shows only what matters. Whether a test is needed is software-testing.

- `[Fact]` for one case; `[Theory]` with `[InlineData]` for one promise over many inputs, objects
  through `[MemberData]` on a static property.
- The constructor is the setup and `IDisposable.Dispose` the teardown, because xUnit builds a new
  instance per test, so state never leaks between tests. Expensive shared setup (a database
  container, a web host) goes in `IClassFixture<T>`, read-only.
- An async test returns `Task`, never `async void`, because an `async void` test cannot fail.
  `await Assert.ThrowsAsync<T>(...)`, and check the message or code too.
- A hand-written fake over a mocking library; do not verify a call the result already proves.
- Mark slow or external tests `[Trait("Category", "Integration")]` and exclude them by default:
  `--filter "Category!=Integration"`.
- Run one test: `dotnet test --filter "FullyQualifiedName~OrderServiceTests.Rejects"`.

## Say it in the reply

Name the C# 14 or .NET 10 feature you chose when it replaces an older spelling, and for a rename
or signature change say that you listed the callers through the language server. For a test file:
file, count, and the command that runs it.
