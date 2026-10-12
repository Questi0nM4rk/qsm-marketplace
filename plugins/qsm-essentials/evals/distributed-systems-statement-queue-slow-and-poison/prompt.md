---
name: distributed-systems-statement-queue-slow-and-poison
tags: [scenario]
runs: 3
max_turns: 2
allowed_tools: [Skill]
---

Use the distributed-systems skill. Answer the way you would a hard interview question. There is no
code here and you cannot run anything; answer from what I tell you. I do not expect the exact cause:
I want to hear where you would look, why there, what you would connect with what, and how you would
prove it.

Our billing system renders a PDF statement for each customer and emails it. Jobs sit in a queue
read by eight workers. A job a worker takes is hidden for 60 seconds and comes back to the queue
if it has not been marked done by then. Last Tuesday morning every worker crashed within minutes,
the queue stopped moving for six hours, and when it recovered some customers had two copies of
the same statement and the newest customers' statements were hours late. A job usually takes 20
seconds; a customer with a very large account takes closer to 90. The team says duplicates cannot
happen because the handler starts with "if statement.sent then return". Nobody has looked at which
job was in the worker when it crashed.

Reply in this shape:

```text
Approach: <how you read it, which clues you connect, what you suspect and why>
Flow: <numbered steps, what you would look at or change at each and what each would tell you>
Next step: <the one thing you would do first>
```
