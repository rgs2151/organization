# Organization 0.9.3

- Remove hover/focus color controls, their styling and component state entirely.
  Keep the original color choices in the Action Page.
- Share title typography between saved actions and new-action capture: week uses
  13px/570, month 12px/680 and Someday 13px/650, with matching line heights.
  Saved-card typography is unchanged.
- Replace single-line capture with a wrapping field that fits one or two lines.
  Preserve the full title when it exceeds the visible area, Enter to create,
  the submit button, Escape to cancel, and composition/IME input. Use the same
  padding and compact white surface as the finished cards.
- Preserve the existing calendar, selection, drag/drop, completion treatment,
  notes, authentication and MCP tool schemas. No new dependencies or migrations.

The design-taste skill was used only to match the capture component to the
approved card design, not to redesign the app.

## Verification

`npm test` and `npm run build`; isolated-browser checks compare computed font
family, size, weight, line height and letter spacing before and after creating
an action in week/month/Someday. Also check wrapping, long-title caret stability,
empty-submit prevention, IME Enter, Escape, absence of hover controls and color
changes through the Action Page. Recheck selection, ordered moves, delete/undo,
delayed title saves and month drops. Inspect 1440/768/390-pixel screenshots.

## Rollback

Previous source: `0b59f8e4d2794db89e9a58dd02fb201e97863be7` (0.9.2).
Previous image:

```text
ghcr.io/rgs2151/organization@sha256:3011ea0a624a828178b2fdf52f4832452f10654c8da91d9fc1a2830cfc8330d7
```

Redeploy only Organization and preserve its current data and uploads. Earlier
approved rollback states remain documented in the preceding release notes.
