## Context

Source: github.com/emilkowalski/skills at 2d228630ba1446365f614a108cb8252f1feda202, MIT.
break-ui is 14.4 KB with CATALOG.md; prototype is 7.8 KB with PICKER.md.

## Decisions

1. **His names, one file each, 12 KB cap.** His catalogue is kept whole within the 12 KB cap;
   PICKER.md folds into prototype.
2. **The toggle per stack.** CSS/React: his component. QML: a property on a debug singleton, set
   over `qs ipc`, so the shell flips data without a restart. TUI: an environment variable that
   swaps the data source.
3. **break-ui reports, the stack skill fixes.** Each break names the fix; the stack skill holds the
   how (elide in QML, `min-width: 0` in CSS, truncation by display width in a TUI).
