## 1. Families (in parallel, one worktree each)

- [x] 1.1 desktop: new desktop-ui; qml-ui narrowed to QML code and layer-shell mechanics (tokens,
      exclusive zone, per-output windows, scale, Accessible, the gates) with the Qt checklist
      digest; desktop forms of the motion, apple-design, break-ui and prototype rules moved in (owns
      `skills/desktop-ui/`, `skills/qml-ui/`; proof: under 12 KB, `bun run validate`)
- [x] 1.2 terminal: new cli-ui from tui-ui's output half and the clig.dev digest; tui-ui narrowed
      to full-screen programs with the TUI digest; terminal forms moved in (owns
      `skills/cli-ui/`, `skills/tui-ui/`; proof: as 1.1)
- [x] 1.3 web: css-ui and react-ui take the web forms from the general skills; new web-motion
      (motion forms) and web-harness (break-ui toggle, prototype picker) (owns `skills/css-ui/`,
      `skills/react-ui/`, `skills/web-motion/`, `skills/web-harness/`; proof: as 1.1)

## 2. General skills (after 1.x)

- [x] 2.1 Remove every per-stack section from the general skills; each points to the families
      (owns the general skills; proof: `grep -l "hl\.\|Easing\.\|cubic-bezier\|ratatui"` over the
      general skills finds only pointers; blocked by 1.1-1.3)
- [x] 2.2 Revise the uix-emil-motion, uix-emil-polish, uix-emil-stress and uix-emil-stacks
      deltas so their "how it lands on each stack" clauses point to the families; README lists
      the families
      (owns those spec files and `plugins/qsm-uix/README.md`; proof: `openspec validate --strict`)
