## ADDED Requirements

### Requirement: Web-only skills fire only on web and React work

The plugin SHALL provide mobile-native and pick-ui-library, adapted from emilkowalski/skills (MIT)
under his names. mobile-native SHALL make a web app feel native on a phone (hover on touch, tap
highlight, viewport height, input zoom, safe areas, scroll behaviour). pick-ui-library SHALL pick a
maintained library for a React or web task instead of a hand-rolled one, and SHALL fire only when
invoked. Their descriptions SHALL name web or React first, so neither fires on QML, Hyprland, or TUI
work. Each SHALL fit 12 KB with no extra file and SHALL name its source and licence.

#### Scenario: A QML task does not load a web skill

- **WHEN** the user asks for a Quickshell popout
- **THEN** neither mobile-native nor pick-ui-library SHALL fire
