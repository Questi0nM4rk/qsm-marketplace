## 1. Web-only skills

- [x] 1.1 mobile-native under 12 KB, web-only description (owns
      `plugins/qsm-uix/skills/mobile-native/SKILL.md`; proof: size, `bun run validate`)
- [x] 1.2 pick-ui-library, React and web only, invoked explicitly as his is (owns
      `plugins/qsm-uix/skills/pick-ui-library/SKILL.md`; proof: as 1.1)

## 2. Stack skills

- [x] 2.1 css-ui and react-ui: Vercel guideline rules, libraries (owns their SKILL.md; proof: as
      1.1)
- [x] 2.2 qml-ui: Qt conventions, qt-qml-review rules, Hyprland animation syntax, KDE/GNOME desktop
      rules paraphrased, Quickshell libraries (owns `skills/qml-ui/SKILL.md`; proof: as 1.1)
- [x] 2.3 tui-ui: pageton rules per framework, clig.dev paraphrased, libraries (owns
      `skills/tui-ui/SKILL.md`; proof: as 1.1)

## 3. Proof and wiring

- [x] 3.1 fire cases for the two new skills, a negative case for pick-ui-library on a QML task,
      README list with credits (owns their eval directories and README lines; proof:
      `bun run validate`; blocked by 1.x)
