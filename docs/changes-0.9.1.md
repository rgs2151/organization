# Organization 0.9.1

Interaction polish only; preserve the approved layout, typography and theme.

- Hovering an action exposes five quick color choices above its top-right edge.
  Keyboard focus exposes the same controls. Changing a color does not open the
  Action Page, move the card's text, or interfere with drag and drop. These changes
  use the existing save queue and undo history.
- Completing an action draws the checkmark with a brief pop, ring and six small
  sparks, then settles to a neutral gray background. Unchecking restores its
  saved color. Existing completed actions do not animate on page load, and
  reduced-motion preferences disable the celebration.
- Year-view bubble **area** is proportional to completed actions that day,
  normalized to the busiest day of the displayed year. For example, counts
  1, 4 and 16 have diameters in a 1:2:4 ratio. The count is rendered separately
  so small bubbles do not shrink the text. Empty days remain empty.

No dependencies, database migrations, authentication settings or MCP tool
schemas change. Existing OAuth connections and user data are retained.

## Checks and rollback

Run `npm test` and `npm run build`. In the browser, check quick color changes
and completion in week, month and Someday, undo, drag selection and reordering,
keyboard access and reduced motion. Compare year bubbles with different counts.
Visual inspection covers desktop, tablet and mobile widths.

The preceding 0.9.0 state is source commit
`b9f3b4c39d29e452f1cff465b64924b6585b24b8`, image:

```text
ghcr.io/rgs2151/organization@sha256:06607120c7465fad264c0615b73a3a785522aca77ebfa8ec8e60cd4572100fdf
```

Redeploy just that Organization image to roll back; keep current data and uploads.
The original owner-approved v0.8.1 rollback remains documented in
[changes-0.9.0.md](changes-0.9.0.md).
