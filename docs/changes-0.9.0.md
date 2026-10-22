# Organization 0.9.0

## Approved baseline and rollback

The owner-approved pre-change state is release `v0.8.1`, source commit
`c79ef5f5032871a1629e3c53c4ca8f61e36eae77`, deployed as:

```text
ghcr.io/rgs2151/organization@sha256:d4506e4ebd3b7f00651c6aa24df4718e88b551beba42aae817f46a9d075a5a6c
```

Rollback means redeploying that image, preserving the current user database and
uploads. This update adds no database migrations. The corresponding infrastructure
baseline is `985589d43befff9fe99aa419e68460b4770f936e` in `private_server`.
Do not roll back unrelated services or replace current user data.

## Changes

- Keep newer local title and note edits when an older save response arrives.
  Title typing uses a local draft and does not redraw the calendar for every key.
- Allow marquee selection in the week gutters and below the lists, including
  starting halfway down a populated list. Preserve double-click capture.
- Accept month drops over the complete day cell, including headers and empty dates.
- Add keyboard-accessible action context menus with edit, completion, move to
  Someday and delete. Keep deletion recoverable through existing undo/trash.
- Show completed-action counts in the year circles.
- Add a short checkmark stroke, expanding ring and completion settling animation.
  Existing checked actions do not celebrate on page load; reduced motion is honored.
- Add revision-required `action_note_update` MCP edits and structured replacement.
- Renew the central browser login during active use. `private_server` owns the
  Authentik renewal middleware; Organization owns the credentialed heartbeat.
  Authentik's proxy cookie may still require an automatic redirect at its expiry,
  but a renewed central login does not require entering the password again.

## Design constraints

Preserve the approved calendar, Someday bucket, navigation and Action Page layout.
Do not make broad visual changes without explicit owner approval. Journal stays
unavailable. User-selected action colors retain their meaning. Small control and
contrast changes are acceptable; do not add slogans or ornamental UI.

The requested design-taste skill was applied as component polish rather than a
redesign: Achromatic ledger, seed 1199014715, keeping the existing palette and
type. New menus use neutral chrome; completion feedback carries the semantic
green. The screen's question remains “What do I want to do, and when?” Its
signature remains the persistent Someday bucket above the action calendar.

## Verification

Unit/integration checks cover delayed save responses, retry preservation, rich
text edits across marks, duplicate/missing passages, revision conflicts, both
UUID and imported Notion IDs, owner isolation and existing OAuth authentication.
Browser checks use an isolated development database and test selection, title
caret preservation, delete/undo, month-header drops, completion and year counts.
Visual inspection covers 1440, 768 and 390 pixels. The existing off-white paper,
calendar scrolling on narrow screens and modal blur are intentional retained
design choices, not a request for a layout redesign.
