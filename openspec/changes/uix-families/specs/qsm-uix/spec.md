## ADDED Requirements

### Requirement: Each UI family owns its stack and the general skills stay general

The plugin SHALL group its stack skills into three families: desktop (desktop-ui for shell surfaces,
Hyprland config and desktop rules; qml-ui for QML code and layer-shell mechanics: tokens, exclusive
zone, per-output windows, scale, Accessible and the gates), terminal (cli-ui for commands that print
and exit; tui-ui for full-screen interactive programs), and web (css-ui, react-ui, mobile-native,
pick-ui-library, web-motion for motion on a page, web-harness for the break-ui toggle and the
prototype picker). A family skill SHALL hold its stack's syntax, libraries and design rules, taken
as the strictest rule its named sources give. The general skills (ui-design, ui-audit, ux-audit,
a11y-audit, a11y-conformance, the motion skills, break-ui, prototype, apple-design) SHALL hold
principles and values only and SHALL point to the family skills for stack syntax.

#### Scenario: A TUI task loads no desktop or web syntax

- **WHEN** the user asks for a keybinding bar in a ratatui program
- **THEN** tui-ui SHALL answer with terminal rules, and no general skill loaded on the way SHALL
  carry QML, Hyprland or CSS syntax

#### Scenario: A secret reaches a command

- **WHEN** a command needs a token
- **THEN** cli-ui SHALL read it from a file, stdin or the credential store, and SHALL NOT accept
  it as a flag or an environment variable

#### Scenario: A destructive action in a shell surface

- **WHEN** a popout offers an action that deletes data
- **THEN** desktop-ui SHALL require undo when the action can be undone, and a confirm naming the
  verb only when it cannot

#### Scenario: A hover popout holds an action

- **WHEN** a bar module opens a popout on hover
- **THEN** desktop-ui SHALL require every action and fact in it to be reachable by click and by
  keyboard as well
