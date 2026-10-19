---
name: react-ui
description: "Use when building or fixing the interactive behaviour of a React UI: a modal or dialog that loses focus or lets the screen reader read the page behind, focus after a route change, signup or checkout form errors, loading and skeleton states, live announcements, JS-driven animation. Triggers: React modal focus, screen reader reads background, focus lost after close, route change focus, form validation errors in React, spinner flashes, skeleton while loading, aria-live in React, reduced motion in React, modal v Reactu, formular chyby. React-specific only: CSS and tokens are css-ui, why a rule exists is a11y-audit and ux-audit."
---

# React UI

React renders markup, but it does not move focus, announce changes or time a loading state, and
that is where a React UI loses people: a keyboard user is dropped at the top of the page after a
route change, a screen reader reads the page behind a modal, an error appears and nobody is told.
This skill serves the person who publishes a React UI and answers for its accessibility. It
holds only what React leaves to you. Hooks, state management, data fetching, performance tuning
and current API signatures are not here (read them through the Context7 skill). Colours, spacing and
motion values are css-ui and the design source. Why a rule exists: a11y-audit (criteria) and
ux-audit (feedback, forms). Motion is animate and review-animations.

## Rules

1. **Use the platform element before a custom one.** A modal is `<dialog>` opened with
   `ref.current.showModal()` in an effect; a button is `<button>`. `showModal` makes the rest of
   the page inert, traps Tab, closes on Escape and returns focus to the opener, which a hand-built
   `div` modal reimplements badly. Wire the `close` event (not only your own button) to state, or
   Escape leaves React believing the dialog is open.
2. **Where the platform does not do it, move focus yourself, once, on purpose.** After a client
   route change, focus the new page's `h1` (`tabIndex={-1}`, `ref.focus()` in an effect keyed on
   the location); a route change is silent to assistive tech and drops focus on a removed node.
   When a popover or custom modal closes, restore focus to the element that opened it. Do not
   focus in an effect that runs on every render: it steals focus from what the person is doing.
3. **A background behind a custom overlay gets `inert`**, not `aria-hidden` plus a focus trap
   library. `inert` removes the subtree from focus, pointer and the accessibility tree in one
   attribute (a boolean prop in React 19), so the two cannot drift apart.
4. **A live region exists before its content does.** Render `<div role="status">` (or
   `role="alert"` for errors that block) empty at mount and change its text later; a region that
   mounts together with its message is often not announced. Keep one region per surface, not one
   per toast.
5. **A form wires its errors in React.** Ids come from `useId`, never hand-typed (they collide
   when a component renders twice); `<label htmlFor>` and the error element share it, and the
   input gets `aria-invalid` and `aria-describedby` pointing at the error. After a failed submit,
   focus the first invalid field in an effect. With `useActionState`, return the submitted values
   in the state and render them as `defaultValue`, so a failed submit does not erase what was
   typed. What the label, the error text and the validation timing must say is ux-audit.
6. **Loading keeps old content on screen.** Wrap navigation and refetch in `startTransition` so a
   `Suspense` fallback does not replace content already on screen; the old content staying visible
   is the loading state. A wait shows feedback (a busy state or spinner) by 1 s at the latest and
   none for an instant action; a known length that passes about 10 s gets
   `<progress value max>` with a count. Skeleton thresholds are ux-audit.
7. **A custom control carries name, role and state.** `div onClick` is a defect: use the native
   element. When a custom widget is unavoidable (combobox, tabs), give it the role, `aria-*`
   state, arrow-key handling and visible focus, in that order. An icon stands alone only where
   everyone reads it the same (close, play, volume), with a tooltip and `aria-label`; any other
   button gets a text label, never icon and label together, and an icon beside text gets
   `aria-hidden`. Prefer a maintained headless library
   (pick-ui-library) over writing the pattern: the keyboard contract is the hard part.
8. **JS-driven motion honours reduced motion.** CSS handles its own (css-ui). For animation run
   from JS, read `matchMedia("(prefers-reduced-motion: reduce)")` and subscribe to `change`; with
   an animation library use its switch (`MotionConfig reducedMotion="user"`). Replace movement
   with an instant state change or a fade, never remove the state change itself. How the motion
   is written and kept fast is web-motion.
9. **A hover card or popover opens by click and by keyboard too.** It still opens on hover and
   stays 180 ms after the pointer leaves, but the trigger is a `button` with `aria-expanded`,
   Enter and Space open it, Escape closes it and returns focus, and every action and fact inside
   is reachable that way. Reason: touch and keyboard users never hover.

## Libraries

A maintained library beats a hand-rolled one, and the project's own `package.json` decides first.
The picks are pick-ui-library's, which loads only when the user invokes it.

## Conventions

From the Vercel web interface guidelines, in our words:

- **Forms.** Enter submits a focused input, and in a `textarea` Cmd or Ctrl plus Enter. Accept free
  text and validate after, never block typing, and let an incomplete form submit so validation can
  show. Never block paste (password managers and 2FA codes depend on it); trim values; use
  `autocomplete`, a meaningful `name`, the right `type` and `inputmode`. Disable spellcheck on
  emails, codes and usernames, give a placeholder an example ending in `…`, and set
  `autocomplete="off"` on non-auth fields so a password manager stays out. Show the error inline
  next to its field. Keep submit enabled until the request starts, then disable it with a spinner
  and keep the original label; a loading label ends in `…`. Warn before navigating away from unsaved
  changes.
- **State lives in the URL.** Filters, tabs, pagination and an expanded panel are deep-linkable;
  Back and Forward restore scroll. Navigation is `<a>` or the router's `Link`, so Cmd, Ctrl and
  middle click work; never a `div` with `onClick`.
- **Feedback.** Update optimistically and reconcile on the response, rolling back or offering Undo
  on failure. A destructive action is undoable first: a toast or inline message with Undo, and a
  confirm dialog naming the verb ("Delete 3 files") only when it cannot be undone.
  A toast and inline validation use a polite live region (rule 4).
- **Hydration.** An input with `value` needs `onChange`, or use `defaultValue`; guard date and time
  rendering against a server and client mismatch; `suppressHydrationWarning` only where truly
  needed.
- **Performance.** Virtualize a list over 50 items (`virtua`, or `content-visibility: auto`). No
  layout read in render (`getBoundingClientRect`, `offsetHeight`, `scrollTop`); batch DOM reads
  then writes. Prefer uncontrolled inputs; a controlled one must be cheap per keystroke. Prefer
  flex or grid to measuring in JS, and `<link rel="preconnect">` for asset hosts.
- **Locale.** Dates and numbers go through `Intl.DateTimeFormat` and `Intl.NumberFormat`, never a
  hard-coded format; language comes from `Accept-Language` or `navigator.languages`, not the IP.
- **Interaction.** `autoFocus` only on desktop and on the single primary input. Meaningful media
  has captions or a transcript, and its controls work from the keyboard.
- **Gestures.** A drag or swipe has a click and keyboard alternative; during a drag, disable text
  selection and set `inert` on dragged elements, as the Vercel rule says.

## Red flags

- When you write `div` or `span` with `onClick`, switch to `button` or `a`, because the native
  element brings focus, Enter and Space, role and name for free.
- When a modal is hand-built with a focus-trap effect, stop and use `<dialog>` and `showModal`,
  because the platform already traps, restores and handles Escape.
- When an effect calls `.focus()` with no clear trigger (open, route change, failed submit),
  remove it, because it steals focus on every re-render.
- When an error message is added to the DOM together with its live region, mount the region
  empty first, because it will otherwise not be announced.
- When `Suspense` swaps a whole page for a fallback on navigation, wrap the update in
  `startTransition`, because hiding revealed content is worse than waiting.
- When a form clears after a failed submit, return the values in action state, because the person
  retypes everything to fix one field.

## Say it in the reply

- For each interactive piece: where focus goes on open, close, route change and failed submit.
- Which native element was used, and for any custom widget why none fit.
- What was run and what was not, so unrun checks read as unrun.

Sources: vercel-labs/web-interface-guidelines (MIT); emilkowalski/skills pick-ui-library (MIT).
