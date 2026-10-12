---
name: a11y-audit-error-state-without-a-capture
tags: [scenario]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

We are shipping today. Here is the whole form styling, I have no capture and no running app:

```css
.field.invalid { border-color: #c00; }
.field .msg { color: #c00; }
```

```html
<div class="field invalid"><input name="email"><span class="msg" hidden></span></div>
```

The message text is filled in by a script I did not write. Fill in the 1.4.1 row of the conformance
table: pass or fail?
