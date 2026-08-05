# organization prototype

An interactive product prototype for a calm, self-hosted system that gets responsibilities out of the user's head and into a trustworthy visual plan.

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
- **Activity:** a year-level record of completed actions.
- **Journal:** the future reflection surface; intentionally outside this prototype's functional scope.

## Prototype scope

The prototype validates the Actions workflow:

- week, month, and year views;
- previous, next, and today navigation;
- compact actions with a completion control on the right;
- completion strike-through and visual feedback;
- drag-and-drop reordering within a day;
- drag-and-drop scheduling across days and between `someday` and the calendar;
- quick action creation;
- a deliberately small Action Page;
- a GitHub-inspired yearly activity heatmap;
- responsive layouts for narrower screens;
- a visible but intentionally quiet Journal placeholder.

## Interaction rules from prototype review

- The global toolbar contains product tabs at the left, the `organization` name in the center, and the current user's account control at the right.
- Calendar scale, Today, and period navigation live beside the current period because they affect the dated calendar, not the persistent `Someday` inbox.
- Product navigation is `Actions`, `Journal`, and `Activity`. Activity is its own expandable surface, never a footer repeated below calendar views.
- The interface does not use motivational slogans or explanatory filler copy.
- In the week view, double-clicking a day's open space creates an action directly in that day. There is no persistent `+ Add action` link.
- `Someday` is a persistent heading above a subtle, content-sized inbox. Only the wrapped undated actions sit inside its boundary.
- Week columns grow with their actions rather than using a fixed viewport height. Scheduled actions have one consistent two-line height and truncate longer titles until their Action Page is opened.
- Dragging an action draws a stable animated insertion marker at its exact destination without reflowing the list under the pointer.
- The month view always shows every action. A calendar week grows to fit the busiest day in that row; actions are never collapsed behind a `+ more` counter.
- The completion control remains on the right edge of an action and completion strikes through the title.
- `Someday` remains the undated staging area and accepts actions dragged out of the calendar.

## Deliberate technical decisions

- React and TypeScript, built with Vite.
- Plain CSS rather than a component framework or styling system.
- Browser-native drag-and-drop rather than a drag-and-drop package.
- No calendar package. Calendar math and layouts are small enough to own.
- No database, authentication, synchronization, or browser persistence yet. Prototype data resets on refresh.
- The Rudra account menu and sign-in/sign-out states validate placement and interaction only. They are not an authentication boundary; real identity will come from Authentik/OIDC with server-side session enforcement.
- The production data model and Notion migration will be designed only after the interaction model is approved.
- A minimal multi-stage Docker image serves the compiled static prototype.

## Explicitly deferred

- Authentik/OIDC integration;
- server persistence and multi-user ownership;
- Notion import and migration tooling;
- recurring actions, reminders, notifications, and time-of-day scheduling;
- collaboration and action assignment;
- calendar-provider synchronization;
- the Journal data model and editor.

## Run locally

```bash
npm install
npm run dev
```

Or run the production-style container:

```bash
docker compose up --build
```
