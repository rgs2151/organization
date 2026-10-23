# Organization 0.9.2

Refine the 0.9.1 interactions without changing the calendar layout or theme.

- Completed cards no longer have a uniform gray background. Each selected action
  color softens toward the existing white surface; plain actions remain white.
  The existing green check and a lighter strike-through communicate completion.
  Unchecking restores the full chosen color, and completion feedback is unchanged.
- Quick colors form a tab attached to the hovered card's upper-right edge, with
  the same surface and border. Remove the floating pill, shadow and double ring;
  a small check now identifies the current swatch. Card text and dimensions do
  not move. Keyboard access, undo and direct color selection are retained.
- Keep proportional year bubbles, drag/drop, selection, rich notes, login and
  existing MCP schemas unchanged. No dependencies or database migrations added.

## Verification

Run `npm test` and `npm run build`. Browser checks cover swatch saving, keyboard
selection, undo, attached-tab geometry, completion tint and color restoration,
month/Someday controls, multi-action movement, title caret preservation,
delete/undo and reduced motion. Compare a crowded week before and after, plus
1440/768/390-pixel views, using an isolated review database.

The design-taste skill is applied only as component polish within the established
palette and typography, not as a redesign.

## Rollback

Previous source: `6b31b040784593819752b35f38b99a76e97d8377` (0.9.1).
Previous image:

```text
ghcr.io/rgs2151/organization@sha256:d8f547132630052b6e473324c628fe52e06147b7c1d6d8d9e90cd621570c0727
```

Redeploy only Organization; preserve current data and uploads. Earlier approved
rollback states remain documented in the preceding release notes.
