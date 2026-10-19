## Context

Source: github.com/emilkowalski/skills at 2d228630ba1446365f614a108cb8252f1feda202, MIT.
break-ui supplies the worst-case catalogue; prototype supplies the picker contract.

## Decisions

1. **His names, one file each, 12 KB cap.** His catalogue is kept whole within the 12 KB cap;
   PICKER.md folds into web-harness.
2. **The toggle in the families.** web-harness: his component. qml-ui: a property on a debug
   singleton, set over `qs ipc`, so the shell flips data without a restart; desktop-ui defines the
   surface expectation. tui-ui: an environment variable that swaps the data source. break-ui and
   prototype say what the toggle is and point there.
3. **break-ui reports, the family skill fixes.** Each break names its cause; the family holds the
   how (elide in qml-ui, `min-width: 0` in web-harness, truncation in tui-ui by the display
   width that cli-ui owns).
