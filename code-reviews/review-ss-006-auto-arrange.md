## Checks Run

`python3 -m compileall scripts/check_web_smoke.py` exited 0 and compiled `scripts/check_web_smoke.py` successfully. Per the review constraint, no Node, npm, shell-script, console-script, or other arbitrary command is recorded in checks_run.

## Lens Notes

Verdict: pass. Native-command wiring uses an Electron application menu item labeled Auto Arrange with `CmdOrCtrl+Shift+L`, sends a fixed `diagram:auto-arrange-request` channel from main, translates that in preload into a renderer DOM event, and invokes the same renderer-owned ELK layout path used by the toolbar button. No High or Critical issue was identified.

Finding SS006-001 is Medium: `tests/auto-arrange-desktop.test.mjs` is present but omitted from `package.json`'s `test` script, so the focused SS-006 regression coverage can silently be skipped by the repository's normal deterministic test command. Add this test file to the package test script or a sprint-specific verification script that is run by the governed acceptance path.

Existing drawDB behavior is largely preserved: auto-arrange remains in the renderer toolbar, the menu command does not expose generic IPC, and layout work stays in shared renderer code without Electron imports. Inactive or unsuitable diagrams are handled by no-op guards for destroyed/no windows, read-only state, and empty table lists. Offline operation is preserved because this path uses bundled Electron/preload/renderer code and the local `elkjs` dependency; it does not add network, Python, Vite, preview-server, or child-process requirements.

Test quality is directionally useful but incomplete. The shared `layoutDiagram` unit test protects non-mutation and identity preservation, while the SS-006 desktop test checks menu/channel/toolbar contracts mostly through source-pattern assertions plus a small DOM-event bridge exercise. The missing package wiring is the actionable gap; broader end-to-end Electron UI coverage would be useful but is below the High/Critical threshold for this slice.
