---
name: css-ui-tailwind-drifting-greens
tags: [scenario]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

We use Tailwind v4. This is how our existing components do colour:

```html
<button class="bg-green-600 text-white hover:bg-[#1f7a3d] dark:bg-green-500 dark:text-black">Save</button>
<span class="bg-[#e8f5e9] text-green-900 dark:bg-green-950 dark:text-green-100">Active</span>
```

Add a 'Paused' badge that looks right in light and dark, and tell me what to change so every
developer stops picking slightly different greens.
