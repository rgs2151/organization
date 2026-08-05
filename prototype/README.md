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

## Deliberate technical decisions

- React and TypeScript, built with Vite.
- Plain CSS rather than a component framework or styling system.
- Browser-native drag-and-drop rather than a drag-and-drop package.
- No calendar package. Calendar math and layouts are small enough to own.
- No database, authentication, synchronization, or browser persistence yet. Prototype data resets on refresh.
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
