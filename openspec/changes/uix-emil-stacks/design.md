## Context

Sources, each saved with its URL and fetch date under the session's research files
(research.ui-repos.md holds licence and last commit for each):

| Source | Licence | Last commit | Into |
| --- | --- | --- | --- |
| emilkowalski/skills mobile-native, pick-ui-library | MIT | 2d22863 | new skills |
| vercel-labs/web-interface-guidelines | MIT | 2026-10-05 | css-ui, react-ui |
| TheQtCompanyRnD/agent-skills qt-qml-review | BSD-3 option | 2026-10-08 | qml-ui |
| doc.qt.io QML coding conventions | Qt docs | Qt 6.12.0 | qml-ui |
| hyprwm/hyprland-wiki animations | BSD-3 | 2026-10-14 | desktop-ui's Hyprland config |
| KDE HIG | CC-BY-SA-4.0 | fetched 2026-10-19 | qml-ui, paraphrase |
| GNOME HIG via Paresh-Maheshwari/gnome-skills | CC-BY-SA-4.0; official HIG licence not verified | fetched 2026-10-19 | qml-ui, paraphrase |
| pageton/tui-design-skill | MIT | 2026-09-24 | tui-ui |
| cli-guidelines/cli-guidelines | CC-BY-SA-4.0 | 2026-05-16 | tui-ui, paraphrase |

Skipped: caelestia and end-4 (GPL-3.0, code only), DankMaterialShell (plugin mechanics), noctalia
(not Quickshell), hicham-bouchikhi/quickshell-skills (API reference, no design rules), ibelick
(conflicts with Emil on motion).

## Decisions

1. **Rules, not references.** Each stack skill gains rules in our words with the source named at
   the end; no source file is copied in.
2. **Libraries per stack.** A short list of trusted libraries per stack in the stack skill
   (pick-ui-library's picks for React; Quickshell's own modules for QML; bubbletea, ink, ratatui,
   textual for a TUI), so the agent does not hand-roll what exists.
3. **Web-only skills stay web-only.** mobile-native and pick-ui-library descriptions name web and
   React in their first words; a negative eval proves pick-ui-library does not fire on QML.
4. **Emil's web rules carry over.** Where a mobile-native or pick-ui-library rule has a desktop or
   terminal form (tap feedback is a pressed state in QML; a library over a hand-rolled one), the
   stack skill states it.
5. **12 KB cap holds.** A stack skill near the cap drops its own weaker rule before a source's.
