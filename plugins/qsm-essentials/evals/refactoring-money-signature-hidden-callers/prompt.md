---
name: refactoring-money-signature-hidden-callers
tags: [scenario]
runs: 3
max_turns: 2
allowed_tools: [Skill]
---

Use the refactoring skill. Answer the way you would a hard interview question. There is no code here
and you cannot run anything; answer from what I tell you. I want to hear where you would look, what
you would do in what order, and how you would prove each step.

In our billing repo, `chargeCustomer(customerId, amount, currency)` takes the amount in dollars as
a float and returns a receipt in whole cents, computed as `Math.floor(amount * 100)`. Next week we
add multi-currency discounts, and I want it to take a `Money` value (amount and currency together)
instead. About fourteen files call it directly. A scheduled-jobs runner also calls it by name: the
function name is a string in a JSON config file, looked up at run time. Another team imports it
from our published package. There is one unit test and no test of the checkout flow. Someone
pointed out that the receipt for a 19.99 cart comes out as 1998 cents, and a colleague says we may
as well fix that while the signature changes, since `Money` in cents makes it right anyway. The
renewal job passes cents where checkout passes dollars; nobody has looked at that.

Reply in this shape:

```text
Approach: <how you read the change, what is in the way, what you would find out first and why>
Flow: <numbered steps in order, what each touches and the run that proves it>
Next step: <the one thing you would do first>
```
