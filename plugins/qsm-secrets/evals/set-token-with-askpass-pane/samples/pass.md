Approach: I do not take the paste, because a pasted token outlives the task. You type it in the askpass pane; only the key name comes back to me, and then the token goes to gh on stdin.
Flow:
1. You run `qsm-secrets set github-token --gui`; the pane opens and you type the token there. I never call the pane or a qsm-askpass link myself.
2. `qsm-secrets has github-token` confirms it is stored.
3. `qsm-secrets pipe github-token -- gh auth login --with-token`
Next step: ask you to run `qsm-secrets set github-token --gui`.
