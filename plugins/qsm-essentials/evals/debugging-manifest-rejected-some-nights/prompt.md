---
name: debugging-manifest-rejected-some-nights
tags: [scenario]
runs: 3
max_turns: 2
allowed_tools: [Skill]
---

Use the debugging skill. Answer the way you would a hard interview question. There is no code here
and you cannot run anything; answer from what I tell you. There may not be enough to name the exact
cause, and that is fine: I want to hear where you would look, why there, what you would connect with
what, and what you would do first.

Our nightly shipping manifest export writes a fixed-width file and uploads it to the parcel
carrier. Since the release two weeks ago, the carrier rejects the file with "checksum mismatch" on
some nights, roughly one night in eight. Rerunning the same export the next morning always goes
through. The release bumped the container base image, upgraded the number-formatting library, and
switched parcel loading to four parallel workers. Staging runs the export every hour and has never
failed. Last week someone added three automatic retries to the upload; the failures dropped, the
team called it fixed, and yesterday it failed again after all three retries. The parcel weights in
the application log match the warehouse totals on the failing nights too.

Reply in this shape:

```text
Approach: <how you read it, which clues you connect, what you suspect and why>
Flow: <numbered steps, what you would look at or do at each and what each would tell you>
Next step: <the one thing you would do first>
Report: <what you would hand someone else today, so both of you know where it stands>
```
