## Context

Source: github.com/emilkowalski/skills at 2d228630ba1446365f614a108cb8252f1feda202, MIT.
break-ui is 14.4 KB with CATALOG.md; prototype is 7.8 KB with PICKER.md.

## Decisions

1. **His names, one file each, 12 KB cap.** His catalogue is kept whole within the 12 KB cap;
   PICKER.md folds into prototype.
2. **The toggle in the families.** web-harness: his component. desktop-ui: a property on a debug
   singleton, set over `qs ipc`, so the shell flips data without a restart. tui-ui: an environment
   variable that swaps the data source. break-ui and prototype say what the toggle is and point
   there.
3. **break-ui reports, the family skill fixes.** Each break names its cause; the family holds the
   how (elide in desktop-ui, `min-width: 0` in web-harness, truncation by display width in
   tui-ui).
