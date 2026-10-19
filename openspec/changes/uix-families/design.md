## Context

Sources, each cited by URL:

| Source | Licence | URL |
| --- | --- | --- |
| clig.dev (cli-guidelines) | CC-BY-SA-4.0, paraphrase only | <https://clig.dev> |
| gfargo/tui-design-skill, jrschumacher/skill-bubbletea-tui, pageton/tui-design-skill | MIT | <https://github.com/gfargo/tui-design-skill>, <https://github.com/jrschumacher/skill-bubbletea-tui>, <https://github.com/pageton/tui-design-skill> |
| TheQtCompanyRnD/agent-skills qt-qml-review | BSD-3-Clause | <https://github.com/TheQtCompanyRnD/agent-skills> |
| KDE HIG | CC-BY-SA-4.0, paraphrase only | <https://develop.kde.org/hig/> |
| GNOME HIG | no licence stated; paraphrase only, credit | <https://developer.gnome.org/hig/> |
| vercel-labs/web-interface-guidelines | MIT | <https://github.com/vercel-labs/web-interface-guidelines> |
| emilkowalski/skills | MIT | <https://github.com/emilkowalski/skills> |

## Decisions

1. **The quality bar.** Each family takes the strictest rule its sources give, the most polished
   and modern form, with a value where one exists. A rule with no source does not enter.
2. **Families own syntax.** A general skill names a rule and its value; how it is written on a
   stack lives only in that family's skill. A general skill's last part points to the families
   by name: desktop (desktop-ui, qml-ui), terminal (cli-ui, tui-ui), web (css-ui, react-ui,
   web-motion); break-ui and prototype name web-harness as the web form.
3. **desktop-ui versus qml-ui.** desktop-ui owns what a shell surface is and does (bar, popout,
   OSD, notification, tray, launcher, the HIG rules, Hyprland config, desktop motion forms).
   qml-ui owns how QML is written (structure, bindings, delegates, layouts, Loader, the Qt
   checklist, the item-tree dump) and the layer-shell mechanics: tokens, exclusive zone,
   per-output windows, scale, Accessible and the gates.
4. **cli-ui versus tui-ui.** cli-ui owns a command that prints and exits (stdout and stderr, exit
   codes, colour decision, width, errors, signals and Ctrl-C, pipes, secrets, help). tui-ui owns
   a program that takes over the screen (framework choice, alternate screen, keybindings and
   their display, focus, layout by width, resize, plain mode).
5. **Web keeps css-ui, react-ui, mobile-native and pick-ui-library**, and two skills take the web
   lines the general skills held: web-motion (curves, properties, reduced motion, performance,
   review and survey terms) and web-harness (the break-ui toggle, the prototype picker, the CSS
   fixes for the breaks).
6. **Each family skill fits 12 KB**; a family that needs more splits by the same cut as 3 and 4.
7. **One owner per terminal rule.** cli-ui owns the line form (streams, colour roles, display
   width, default No, cursor restore); tui-ui owns the screen form and points to cli-ui for the
   shared ones. Libraries live in qml-ui for desktop and in cli-ui and tui-ui for terminal.
8. **The stack skills requirement is modified here, once.** The family owners (desktop-ui for the
   HIGs and Hyprland, qml-ui, cli-ui for clig.dev, tui-ui) are named in this change's MODIFIED
   block; uix-emil-stacks adds only the web-only skills.
