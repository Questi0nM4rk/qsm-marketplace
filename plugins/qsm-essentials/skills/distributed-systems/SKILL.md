---
name: distributed-systems
description: "Use when splitting or merging services, choosing how two systems talk, deciding who owns which data, designing an API between systems, handling failure across a network, or isolating tenants. Triggers: split this service, should this be its own service, service boundary, sync or async, saga, outbox, idempotent, REST or gRPC or events, API versioning, data ownership, multi-tenant, retry, timeout, strangler fig. Cutting a module inside one process is software-design."
---

# Distributed systems

A network between two pieces of a system makes three things true: a call can fail halfway, the
two sides can disagree about what happened, and nobody can change both sides at once. This skill
serves the person deciding whether to pay that price and, when it is worth paying, how to pay it
on purpose. It works as an interview: the questions below are asked of every design, and the edge
cases are the places where the usual answer breaks. It does not design modules inside one process
(software-design) and does not pick an architecture style (software-architecture).

The default is not to distribute. One process with clear modules has none of the three problems,
and merging two services back is far dearer than extracting one later.

## Questions every design must answer

- What does the caller see when the other side is down, slow, or answers twice? Answer for each.
- Who may write this data, and how stale may a copy be before a rule or a screen gives a wrong
  answer?
- Who retries, at which layer, how many times, and what stops the retries when the callee is down?
- What happens when the same message arrives twice, late, or after a newer one?
- What happens when a process pauses for a minute and then continues as if nothing happened?
- Which number do we watch, and at which percentile? An average hides the users who suffer.

## Whether to split

- A boundary earns a network only when it passes all five checks: it owns its data and nobody else
  writes it, it deploys alone, it fails alone, it changes for different reasons than its
  neighbours, and no business operation needs one transaction across it. Fail one, keep it in the
  process, because a service that fails a check keeps the cost and loses the benefit.
- Split along the business, not the layer. Bounded contexts (domain-modeling) are candidates, a
  "database service" and a "logic service" are not, and a context's size follows its model, not a
  wish for small services.
- Weigh scaling, security, rate of change and teams (pull to split) against shared data, chatty
  calls and a spanning transaction (pull to merge), and write the result down. A transaction beats
  independent deploy: redesign the operation so it needs none, or keep the pieces together.
- Extract only when a module has proven in production that it must scale, fail or deploy
  differently, and use the strangler fig from the refactoring skill, never a cutover. A second
  system built beside the first never catches up, because every fix lands in the old one: improve
  one piece at a time and run the old and new storage side by side behind one interface.
- A single instance with a restart policy is a valid design for background work. Count it: a crash
  a day is seconds of downtime, but a deploy that takes two minutes and runs daily caps you at two
  nines. Choose the singleton when that is enough, because owner election is the hardest part
  below.

## Data

- One owner per piece of data, and only the owner writes it. Two writers to one table is one
  service with a network in the middle, so a shared database means one service.
- A copy of another service's data, updated by events, is fine and is stale. Say how stale a
  screen or a rule may be, and design for it. A user who writes and then reads from another replica
  may not see their own write: route their reads to the owner for a moment or show the write
  locally.
- A transaction across services does not exist. Use a saga of local transactions with a
  compensating action per step, and design the compensation before the happy path. A step that
  cannot be compensated means the steps are one service.
- Publish events through an outbox: write the event in the same commit as the data and deliver it
  from a separate process. Publishing after the commit loses the event when the process dies
  between the two.

## Talking

- Synchronous when the caller cannot continue without a quick answer (a price, an authorization),
  asynchronous when it can continue, the work is slow or the receiver may be down. Synchronous
  couples uptime, asynchronous couples through the message contract.
- When the user wants an answer now and the work is async, answer "accepted, here is how to
  follow it": they wanted certainty, not synchronicity.
- Orchestrate a flow with a clear owner and an end. Choreograph when many services react to one
  fact and none owns the whole. Events that wait for each other by a delay ("process five minutes
  later") are an ordering bug waiting for a slow day: make the second step trigger from the first.
- Every remote call has a timeout written down as a decision, because without one a slow
  dependency becomes your outage.
- Retry only idempotent calls, with exponential backoff, jitter and a cap. Retries multiply down a
  chain: five layers that each try twice send thirty-two calls into the service that is
  already failing. Retry at one layer, give it a budget, and put a circuit breaker on the client
  that stops traffic when the error rate passes a threshold and lets it back in gradually, because
  full load on a recovering service knocks it over again.
- Make receivers idempotent: carry an id, remember handled ids, ignore repeats. Exactly-once
  delivery is not on offer: pick at-least-once where a repeat is harmless, at-most-once where a
  repeat is a harm (a card charge), and decide who tries again after a loss.
- A fan-out that waits for all of N leaves is as slow as the slowest. With 1 slow answer in 100
  per leaf, 100 leaves make about two requests in three slow, and the same odds of a failing leaf
  fail most requests. More leaves also add per-leaf overhead until
  they stop helping. Hedge, set a deadline and return partial results where the business accepts
  them, and measure the end-to-end percentile.
- Pick the fallback for a failing dependency with the business: an empty recommendation list is
  fine, an empty balance is not.

## Owners, locks and queues

- Two holders of one lock exist for a short while: a paused holder wakes after its lease expired.
  Checking the lease before acting narrows the gap and does not close it. The receiver of the work
  must reject a stale owner, by comparing a fencing token or version that grows with every new
  owner, because a delayed request from an earlier owner can arrive after the newer one is done.
- Choose between availability and exactness for the owner: wait for the lease to expire and lose
  time (exact), or allow a double run (available). Moving money gets exact, a thumbnail gets
  available.
- A work item that crashes its worker comes back and crashes the next one until none is left. Count
  the deliveries, back off, and park the item after a limit for a person to look at. A queue that
  stalled holds hours of work whose answer nobody wants any more: give an item an age after which it
  is dropped.
- A worker that was only slow produces the second copy of an item: the work must be idempotent or
  guarded by the lock above.

## Failure that looks like success

- A destructive job (cleanup, garbage collection, expiry) decides from another service's answer.
  When that answer is "not found", check it was not "could not look": an unavailable database
  returned as a 404 makes every record look orphaned and the job deletes all of them. Return a
  distinct error for unavailable, rate-limit the deletes, and add a breaker that stops the job and
  waits for a person when the rate jumps.
- Alert on too few errors and too few requests, not only too many: zero errors can mean nothing
  arrives. Do not file a class of errors as the client's fault without alerting when all clients
  fail it, because that is how a broken authorization goes unnoticed. Probe with synthetic requests
  where no error is expected.
- A cache added "as an option" becomes required as load grows. Treat its failure, its size and its
  warm-up as a design item, and give a service a readiness check that differs from liveness, so it
  takes traffic only when its cache is loaded and is not killed while it loads.

## APIs between systems

- The API is a contract with people you cannot call. Design it from what the caller does next
  with the answer, not from your tables.
- Pick the style by the consumer: REST for resources many clients read and edit, gRPC for typed
  internal calls you control, GraphQL for one client composing many shapes (accepting the server
  cost), events when the consumer reacts to facts. Never choose one for fashion.
- Keep three shapes apart: what clients see, what the code holds, what the store holds, with
  translation between them, so each changes alone and a rollback is possible.
- Never break a caller. Adding a field is safe, removing, renaming or changing the meaning is a
  break: add the new form, let callers move, remove the old when you have measured that nobody
  calls it. Version in the URL only for a rare, real break, because every version kept is a
  service run. Publish only the events a consumer needs, not every internal one, because a
  subscriber to internals breaks with each change.
- Errors are part of the contract. Two errors a caller cannot tell apart are a bug.
- Authentication, rate limits, routing and TLS live in one gateway, business rules never do,
  because a gateway with rules is a service nobody owns.

## Tenants

- A tenant's data must never meet another's. Decide isolation per layer (storage, compute,
  network, identity): separate databases, a shared one with a tenant column, or between, and
  write the cost against isolation against operations trade-off.
- Every query carries the tenant by construction: taken from the authenticated identity at the
  edge, and applied in data-access code nobody can bypass, because one forgotten filter is a
  breach.
- Throttle and measure per tenant, because the noisy neighbour is the daily failure.

## Red flags

- When two services read and write one database, merge them or cut the data, because it is one
  service paying for a network.
- When one request waits on a chain of four synchronous calls, shorten it or make it async,
  because one slow link fails the request.
- When a retry has no backoff, no jitter or no idempotency, add them, because it doubles the
  damage, and when two layers both retry, remove one.
- When a call has no timeout, set one, because the caller's fate is the callee's.
- When events are published after commit with no outbox, add the outbox, because events are being
  lost now.
- When a saga step has no compensation, stop and design it, because it works until step three
  fails.
- When a job deletes on "not found" with no rate limit, add both, because one outage empties the
  store.
- When a lock holder acts without the receiver checking its token, add the check, because a pause
  makes two owners.

## Say it in the reply

Before a split: the five checks with yes or no each, and the data each side will own. Before a
call between services: the style, the timeout, the retry rule and its layer, what a duplicate does,
and what happens when the other side is down. Without those lines the design is not done.
