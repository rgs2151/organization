# organization product direction

A calm, self-hosted system that gets responsibilities out of the user's head and into a trustworthy visual plan.

## Product thesis

The product is an external brain for responsibilities. Capture everything without deciding where it belongs, then gradually pull work from `someday` into a year, month, week, and finally a specific day. The interface should reduce stress rather than introduce project-management ceremony.

## Design direction

Three references define the product:

- **Tweek:** visual tone and interaction. Spacious paper-like layout, strong typography, thin rules, low chrome, direct manipulation, and a satisfying completion control on the right of each item.
- **The existing Notion calendar:** information architecture. Actions are dated objects and the month view shows compact cards inside a conventional calendar grid.
- **GitHub activity:** motivation. A yearly heatmap makes consistent completion visible and rewarding without turning the product into a game.

This is an original product built from those interaction principles. It is not intended to copy any brand, source code, or complete interface.

## Product language

- **View:** the calendar's current scale: `week`, `month`, or `year`.
- **Column:** one day in the week view.
- **Action:** one responsibility or thing to do.
- **Action Page:** the focused detail surface for an action's title, date, notes, color, and completion state.
- **Someday:** an undated staging area for captured responsibilities that are not ready to schedule.
- **Activity:** a year-level record of when actions were completed. Creating or scheduling an action does not count.
- **Journal:** the future reflection surface; intentionally outside the current functional scope and displayed only as “Not available yet.”

## Current Actions foundation

The development app implements the Actions workflow:

- week, month, and year views;
- previous, next, and today navigation;
- compact actions with a completion control on the right;
- completion strike-through and visual feedback;
- drag-and-drop reordering within a day;
- drag-and-drop scheduling across days and between `someday` and the calendar;
- quick action creation;
- a deliberately small Action Page;
- a compact structured-note editor shared with the future Journal surface;
- a GitHub-inspired yearly activity heatmap;
- responsive layouts for narrower screens;
- durable, owner-scoped server persistence;
- a visible but intentionally quiet Journal placeholder.

## Established interaction rules

- The approved Actions interface is a frozen product surface. No substantial layout, navigation, wording, or interaction change is made without explicit user approval; reliability and accessibility fixes preserve its geometry and visual language.
- The global toolbar contains product tabs at the left, the `organization` name in the center, and the current user's account control at the right.
- Calendar scale, Today, and period navigation live beside the current period because they affect the dated calendar, not the persistent `Someday` inbox.
- Product navigation is `Actions`, `Journal`, and `Activity`. Activity is its own expandable surface, never a footer repeated below calendar views.
- The interface does not use motivational slogans or explanatory filler copy.
- In the week view, double-clicking a day's open space creates an action directly in that day. There is no persistent `+ Add action` link.
- `Someday` is a persistent heading above a subtle, full-width inbox, leaving open space for direct creation and drop targets. Its heading control creates an undated action without removing the double-click shortcut.
- Week columns grow with their actions rather than using a fixed viewport height. Scheduled actions have one consistent two-line height and truncate longer titles until their Action Page is opened.
- Dragging an action draws a stable animated insertion marker at its exact destination without reflowing the list under the pointer.
- Actions do not reveal a hover handle or shift their text. The entire action remains directly draggable without hover chrome.
- New-action composers use the same inline input and icon-submit treatment across Someday, week, and month contexts, with size adjustments only for compact calendar cells.
- The Action Page reserves most of its area for writing. Metadata and formatting controls remain compact and directly accessible.
- The month view always shows every action. A calendar week grows to fit the busiest day in that row; actions are never collapsed behind a `+ more` counter.
- The completion control remains on the right edge of an action and completion strikes through the title.
- `Someday` remains the undated staging area and accepts actions dragged out of the calendar.
- Activity counts each checked action on the UTC date when it was completed. Its four green intensity bands divide nonempty days into GitHub-style completion-count quartiles; tied counts share a band and the busiest days use the darkest color.
- Operational errors appear as small floating notifications and never reflow or displace the application navigation.

## Deliberate technical decisions

- React and TypeScript, built with Vite.
- Plain CSS rather than a component framework or styling system.
- Browser-native drag-and-drop rather than a drag-and-drop package.
- No calendar package. Calendar math and layouts are small enough to own.
- A small Node HTTP API rather than a server framework.
- SQLite in WAL mode with strict tables, foreign keys, ordered SQL migrations, and owner-scoped queries.
- Server-resolved identity. Local development uses an explicit development adapter; production will use verified Authentik session data.
- The application ships as one non-root container, while routing, secrets, volumes, and deployment ownership remain in the separate private-server repository.
- Tiptap is used as a headless, on-demand editor engine. Organization owns its appearance, persistence, uploads, and interaction surface.
- Browser state is server-authoritative. Returning from sleep, focus loss, or connectivity loss revalidates the session and actions before continued use.
- One application-owned Streamable HTTP MCP endpoint exposes narrow owner-scoped tools through revocable credentials and the same repository operations as the web API.

## Explicitly deferred

- Notion import and migration tooling;
- recurring actions, reminders, notifications, and time-of-day scheduling;
- collaboration and action assignment;
- calendar-provider synchronization;
- Journal persistence and its guided-reflection tool set.

Local development instructions live in the repository [README](../README.md).
