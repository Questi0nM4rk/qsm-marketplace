---
name: domain-modeling-helpdesk-volume-discount
tags: [scenario]
runs: 3
max_turns: 2
allowed_tools: [Skill]
---

Use the domain-modeling skill. Answer the way you would a hard interview question. There is no code
here and you cannot run anything; answer from what I tell you. Some facts are missing on purpose: I
want to hear what you would ask the business, where you would draw the lines and why, and what you
would keep plain.

A help desk product charges each tenant company per support ticket opened in a month, with a
discount that grows with the monthly count (10% above 500 tickets, 20% above 750, 30% above 1,000).
Rules the business gave us:

- A ticket has messages between a customer and agents. An escalated ticket that its agent has not
  read within half of the response time limit is handed to another agent automatically.
- A ticket with no activity for a while closes by itself; the customer opens a new one for the next
  question.
- Two agents often answer the same ticket at the same moment.
- Finance must be able to explain every invoice line to a tenant that disputes it.
- Tenants also keep lists of ticket categories and their agents' shift schedules.

The senior developer proposes one `Tenant` object that holds its tickets, so billing can read the
count from it and the discount is a method on `Tenant`.

Reply in this shape:

```text
Approach: <how you read the domain, which clues you connect, what you would ask the business first>
Flow: <numbered steps of the model you would show the business, what each part is and how it is built>
Next step: <the one thing you would do first>
```
