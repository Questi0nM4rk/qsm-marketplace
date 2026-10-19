## Context

Sources, each saved with its URL under the session's research files (research.ui-repos.md holds
licence and commit for each):

| Source | Licence | Into |
| --- | --- | --- |
| emilkowalski/skills mobile-native, pick-ui-library (commit 2d22863) | MIT | new skills |
| emilkowalski/skills README.md (a solid border over a shadow is an agent mistake) | MIT | ui-design |
| vercel-labs/web-interface-guidelines | MIT | css-ui, react-ui |
| TheQtCompanyRnD/agent-skills qt-qml-review | BSD-3 option | qml-ui |
| doc.qt.io QML coding conventions | Qt docs | qml-ui |
| hyprwm/hyprland-wiki animations | BSD-3 | desktop-ui |
| KDE HIG | CC-BY-SA-4.0 | desktop-ui, paraphrase |
| GNOME HIG via Paresh-Maheshwari/gnome-skills | CC-BY-SA-4.0; official HIG licence not verified | desktop-ui, paraphrase |
| pageton/tui-design-skill | MIT | tui-ui |
| cli-guidelines/cli-guidelines | CC-BY-SA-4.0 | cli-ui, paraphrase |

Skipped: caelestia and end-4 (GPL-3.0, code only), DankMaterialShell (plugin mechanics), noctalia
(not Quickshell), hicham-bouchikhi/quickshell-skills (API reference, no design rules), ibelick
(conflicts with Emil on motion).

## Decisions

1. **Rules, not references.** Each family skill gains rules in our words with the source named at
   the end; no source file is copied in.
2. **Libraries per stack.** A short list of trusted libraries per stack in the family skill
   (pick-ui-library's picks for React; Quickshell's own modules in qml-ui; bubbletea, ink, ratatui,
   textual in tui-ui; the Bun and Node libraries in cli-ui), so the agent does not hand-roll what
   exists.
3. **Web-only skills stay web-only.** mobile-native and pick-ui-library descriptions name web and
   React in their first words, pick-ui-library fires only when invoked; a negative eval proves it
   does not fire on QML.
4. **Emil's web rules carry over.** Where a mobile-native or pick-ui-library rule has a desktop or
   terminal form (tap feedback is a pressed state in QML; a library over a hand-rolled one), the
   family skill states it.
5. **12 KB cap holds.** A family skill near the cap drops its own weaker rule before a source's.
6. **One modified requirement.** The stack skills requirement is modified once, in uix-families,
   where the family owners are named; this change adds only the web-only requirement.
