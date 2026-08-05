import {
  Fragment,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";

type ViewMode = "week" | "month" | "year";
type AppTab = "actions" | "journal" | "activity";
type ActionColor = "plain" | "sun" | "mint" | "lilac" | "rose";
type ActionLayout = "vertical" | "wrapped";

type DropTarget = {
  target: string;
  beforeId?: string;
};

type CalendarAction = {
  id: string;
  title: string;
  date: string | null;
  notes: string;
  completed: boolean;
  color: ActionColor;
};

const ACTION_COLORS: Record<ActionColor, string> = {
  plain: "transparent",
  sun: "#ffea63",
  mint: "#65edac",
  lilac: "#cbc6ff",
  rose: "#ffb7be",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const INITIAL_ACTIONS: CalendarAction[] = [
  {
    id: "a-01",
    title: "Get eyes checked",
    date: "2026-08-05",
    notes: "Call the clinic and ask for the first appointment after lunch.",
    completed: false,
    color: "mint",
  },
  {
    id: "a-02",
    title: "Finish Ian's updates",
    date: "2026-08-05",
    notes: "Review the final comments before sending the update.",
    completed: false,
    color: "plain",
  },
  {
    id: "a-03",
    title: "Organize legal documents",
    date: "2026-08-05",
    notes: "Move the signed copies into one folder and name them consistently.",
    completed: false,
    color: "lilac",
  },
  {
    id: "a-04",
    title: "Get my W-2s",
    date: "2026-08-06",
    notes: "Download both employers' copies and save them with tax documents.",
    completed: false,
    color: "sun",
  },
  {
    id: "a-05",
    title: "Book appointment for myself",
    date: "2026-08-06",
    notes: "Check the provider portal first, then call if no times appear.",
    completed: false,
    color: "plain",
  },
  {
    id: "a-06",
    title: "Renew the electricity contract",
    date: "2026-08-07",
    notes: "Compare the renewal rate with the current statement.",
    completed: false,
    color: "rose",
  },
  {
    id: "a-07",
    title: "Pay rent",
    date: "2026-08-07",
    notes: "Confirm the payment posts before the weekend.",
    completed: true,
    color: "plain",
  },
  {
    id: "a-08",
    title: "Write my one-year, five-year, and ten-year plan",
    date: "2026-08-09",
    notes: "Start with the direction, not a perfect list of milestones.",
    completed: false,
    color: "lilac",
  },
  {
    id: "a-09",
    title: "Return Amazon phone arm",
    date: "2026-08-03",
    notes: "Print the return label and take it downstairs.",
    completed: true,
    color: "plain",
  },
  {
    id: "a-10",
    title: "Call Erfan",
    date: "2026-08-03",
    notes: "Check timing for the next meeting.",
    completed: true,
    color: "mint",
  },
  {
    id: "a-11",
    title: "Understand cross-dataset results",
    date: "2026-07-29",
    notes: "Write down the two patterns that still need an explanation.",
    completed: true,
    color: "sun",
  },
  {
    id: "a-12",
    title: "Find a better system for recurring bills",
    date: null,
    notes: "No urgency. Capture options when they come up.",
    completed: false,
    color: "plain",
  },
  {
    id: "a-13",
    title: "Plan the Notion calendar migration",
    date: null,
    notes: "Wait until the new action model is stable.",
    completed: false,
    color: "lilac",
  },
  {
    id: "a-14",
    title: "Research a quiet weekend trip",
    date: null,
    notes: "Keep this fun and unhurried.",
    completed: false,
    color: "mint",
  },
];

const pad = (value: number) => String(value).padStart(2, "0");

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const mondayIndex = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - mondayIndex);
  next.setHours(0, 0, 0, 0);
  return next;
}

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function periodTitle(view: ViewMode, focusDate: Date) {
  if (view === "year") return String(focusDate.getFullYear());
  if (view === "month") return `${MONTHS[focusDate.getMonth()]} ${focusDate.getFullYear()}`;

  const start = startOfWeek(focusDate);
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${MONTHS[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${MONTHS[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;
}

function periodLabel(view: ViewMode, focusDate: Date) {
  if (view !== "week") return view === "month" ? "Month" : "Year";

  const start = startOfWeek(focusDate);
  const end = addDays(start, 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= start && today <= end ? "Today" : "Week";
}

function prettyDate(key: string | null) {
  if (!key) return "Someday";
  return fromDateKey(key).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ActionItem({
  action,
  compact = false,
  bucket = false,
  isDragging = false,
  dropBefore = false,
  dropAfter = false,
  onOpen,
  onComplete,
  onDragStart,
  onDragEnd,
  onDragPosition,
  onDropAt,
}: {
  action: CalendarAction;
  compact?: boolean;
  bucket?: boolean;
  isDragging?: boolean;
  dropBefore?: boolean;
  dropAfter?: boolean;
  onOpen: () => void;
  onComplete: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragPosition: (event: DragEvent<HTMLDivElement>) => void;
  onDropAt: (event: DragEvent<HTMLDivElement>, draggedId: string) => void;
}) {
  const style = {
    "--action-color": ACTION_COLORS[action.color],
  } as CSSProperties;

  return (
    <div
      className={`action-item ${compact ? "is-compact" : ""} ${bucket ? "is-bucket" : ""} ${isDragging ? "is-dragging" : ""} ${dropBefore ? "is-drop-before" : ""} ${dropAfter ? "is-drop-after" : ""} ${action.completed ? "is-complete" : ""}`}
      data-action-id={action.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/action-id", action.id);
        onDragStart(event);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        onDragPosition(event);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const draggedId = event.dataTransfer.getData("text/action-id");
        if (draggedId && draggedId !== action.id) onDropAt(event, draggedId);
      }}
      onDragEnd={onDragEnd}
      style={style}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <button className="action-open" type="button" onClick={onOpen}>
        <span className="action-title"><span>{action.title}</span></span>
      </button>
      <button
        className="completion-button"
        type="button"
        aria-label={action.completed ? `Mark ${action.title} incomplete` : `Complete ${action.title}`}
        aria-pressed={action.completed}
        onClick={onComplete}
      >
        <span aria-hidden="true">{action.completed ? "✓" : ""}</span>
      </button>
    </div>
  );
}

function ActionComposer({
  onAdd,
  onCancel,
}: {
  onAdd: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    onAdd(cleanTitle);
    setTitle("");
  }

  return (
    <form className="action-composer" onSubmit={submit}>
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        placeholder="Type an action…"
        aria-label="New action title"
      />
      <button type="submit" aria-label="Create action" title="Create action">
        <span aria-hidden="true">↵</span>
      </button>
    </form>
  );
}

function AccountControl({
  signedIn,
  onSignIn,
  onSignOut,
}: {
  signedIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  if (!signedIn) {
    return <button className="sign-in-button" type="button" onClick={onSignIn}>Sign in</button>;
  }

  return (
    <details className="account-menu">
      <summary aria-label="Open Rudra account menu">
        <span className="account-name">Rudra</span>
        <span className="account-avatar" aria-hidden="true">R</span>
      </summary>
      <div className="account-popover">
        <strong>Rudra</strong>
        <span>rgs2151@columbia.edu</span>
        <button type="button" onClick={onSignOut}>Sign out</button>
      </div>
    </details>
  );
}

function ActionPage({
  action,
  onClose,
  onChange,
  onDelete,
}: {
  action: CalendarAction;
  onClose: () => void;
  onChange: (patch: Partial<CalendarAction>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="action-page"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-page-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="action-page-header">
          <div>
            <span className="action-page-kicker">Action page</span>
            <span className="action-page-date">{prettyDate(action.date)}</span>
          </div>
          <button className="quiet-icon" type="button" onClick={onClose} aria-label="Close action page">×</button>
        </header>

        <input
          id="action-page-title"
          className="action-page-title"
          value={action.title}
          onChange={(event) => onChange({ title: event.target.value })}
          aria-label="Action title"
        />

        <div className="action-page-fields">
          <label>
            <span>Date</span>
            <input
              type="date"
              value={action.date ?? ""}
              onChange={(event) => onChange({ date: event.target.value || null })}
            />
          </label>
          <div className="color-field">
            <span>Color</span>
            <div className="color-options" aria-label="Action color">
              {(Object.keys(ACTION_COLORS) as ActionColor[]).map((color) => (
                <button
                  key={color}
                  type="button"
                  className={action.color === color ? "is-selected" : ""}
                  style={{ background: color === "plain" ? "#f7f7f3" : ACTION_COLORS[color] }}
                  aria-label={`Use ${color} color`}
                  aria-pressed={action.color === color}
                  onClick={() => onChange({ color })}
                />
              ))}
            </div>
          </div>
        </div>

        <label className="notes-field">
          <span>Notes</span>
          <textarea
            value={action.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            placeholder="Add context without turning this into a document…"
          />
        </label>

        <footer className="action-page-footer">
          <button className="delete-action" type="button" onClick={onDelete}>Delete</button>
          <button
            className={`complete-action ${action.completed ? "is-complete" : ""}`}
            type="button"
            onClick={() => onChange({ completed: !action.completed })}
          >
            <span>{action.completed ? "✓" : ""}</span>
            {action.completed ? "Completed" : "Mark complete"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ActivityHeatmap({
  actions,
  year,
  onYearChange,
}: {
  actions: CalendarAction[];
  year: number;
  onYearChange: (year: number) => void;
}) {
  const completedByDate = useMemo(() => {
    const result = new Map<string, number>();
    actions.forEach((action) => {
      if (action.completed && action.date?.startsWith(String(year))) {
        result.set(action.date, (result.get(action.date) ?? 0) + 1);
      }
    });
    return result;
  }, [actions, year]);

  const cells = useMemo(() => {
    const yearStart = new Date(year, 0, 1);
    const gridStart = startOfWeek(yearStart);
    return Array.from({ length: 371 }, (_, index) => {
      const date = addDays(gridStart, index);
      if (date.getFullYear() !== year) return { key: `empty-${index}`, date: null, count: 0, level: 0 };
      const key = toDateKey(date);
      const pulse = (index * 19 + year * 7 + date.getMonth() * 13) % 41;
      const backgroundCount = pulse > 34 ? 3 : pulse > 27 ? 2 : pulse > 20 ? 1 : 0;
      const count = Math.max(backgroundCount, completedByDate.get(key) ?? 0);
      return { key, date, count, level: Math.min(4, count) };
    });
  }, [completedByDate, year]);

  const total = cells.reduce((sum, cell) => sum + cell.count, 0);

  return (
    <section className="activity-section" aria-labelledby="activity-title">
      <div className="activity-heading">
        <h1 id="activity-title">{total} actions completed in {year}</h1>
      </div>

      <div className="activity-card">
        <div className="heatmap-wrap">
          <div className="heatmap-months" aria-hidden="true">
            {MONTHS.map((month) => <span key={month}>{month.slice(0, 3)}</span>)}
          </div>
          <div className="heatmap-body">
            <div className="heatmap-weekdays" aria-hidden="true"><span>Mon</span><span>Wed</span><span>Fri</span></div>
            <div className="heatmap-grid">
              {cells.map((cell) => (
                <span
                  key={cell.key}
                  className={`heat-cell level-${cell.level} ${cell.date ? "" : "is-empty"}`}
                  title={cell.date ? `${cell.count} completed on ${cell.date.toLocaleDateString()}` : undefined}
                />
              ))}
            </div>
          </div>
          <div className="heatmap-legend"><span>Quiet</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /><span>Flow</span></div>
        </div>
        <div className="activity-years" aria-label="Activity year">
          {[2026, 2025, 2024].map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={candidate === year ? "is-active" : ""}
              onClick={() => onYearChange(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [tab, setTab] = useState<AppTab>("actions");
  const [view, setView] = useState<ViewMode>("week");
  const [focusDate, setFocusDate] = useState(new Date(2026, 7, 5));
  const [actions, setActions] = useState(INITIAL_ACTIONS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerTarget, setComposerTarget] = useState<{ target: string; index?: number } | null>(null);
  const [activityYear, setActivityYear] = useState(2026);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [signedIn, setSignedIn] = useState(true);

  const selectedAction = actions.find((action) => action.id === selectedId) ?? null;

  function actionsFor(date: string | null) {
    return actions.filter((action) => action.date === date);
  }

  function addAction(target: string, title: string, insertIndex?: number) {
    const newAction: CalendarAction = {
      id: `action-${Date.now()}`,
      title,
      date: target === "someday" ? null : target,
      notes: "",
      completed: false,
      color: "plain",
    };
    setActions((current) => {
      const targetDate = newAction.date;
      const targetActions = current.filter((action) => action.date === targetDate);

      if (insertIndex !== undefined && insertIndex < targetActions.length) {
        const beforeId = targetActions[Math.max(0, insertIndex)].id;
        const beforeIndex = current.findIndex((action) => action.id === beforeId);
        return [...current.slice(0, beforeIndex), newAction, ...current.slice(beforeIndex)];
      }

      const lastTargetIndex = current.reduce(
        (last, action, index) => action.date === targetDate ? index : last,
        -1,
      );
      if (lastTargetIndex < 0) return [...current, newAction];
      return [
        ...current.slice(0, lastTargetIndex + 1),
        newAction,
        ...current.slice(lastTargetIndex + 1),
      ];
    });
    setComposerTarget(null);
  }

  function updateAction(id: string, patch: Partial<CalendarAction>) {
    setActions((current) => current.map((action) => action.id === id ? { ...action, ...patch } : action));
  }

  function moveAction(draggedId: string, targetDate: string | null, beforeId?: string) {
    setActions((current) => {
      const moving = current.find((action) => action.id === draggedId);
      if (!moving) return current;
      const remaining = current.filter((action) => action.id !== draggedId);
      const moved = { ...moving, date: targetDate };
      if (beforeId) {
        const beforeIndex = remaining.findIndex((action) => action.id === beforeId);
        if (beforeIndex >= 0) {
          return [...remaining.slice(0, beforeIndex), moved, ...remaining.slice(beforeIndex)];
        }
      }
      const lastTargetIndex = remaining.reduce(
        (last, action, index) => action.date === targetDate ? index : last,
        -1,
      );
      if (lastTargetIndex < 0) return [...remaining, moved];
      return [
        ...remaining.slice(0, lastTargetIndex + 1),
        moved,
        ...remaining.slice(lastTargetIndex + 1),
      ];
    });
  }

  function navigate(direction: -1 | 1) {
    setFocusDate((current) => {
      if (view === "week") return addDays(current, direction * 7);
      const next = new Date(current);
      if (view === "month") next.setMonth(next.getMonth() + direction);
      if (view === "year") next.setFullYear(next.getFullYear() + direction);
      return next;
    });
  }

  function beforeIdAtPointer(
    event: DragEvent<HTMLDivElement>,
    action: CalendarAction,
    targetActions: CalendarAction[],
    layout: ActionLayout,
  ) {
    const orderedActions = targetActions.filter((candidate) => candidate.id !== draggedId);
    const hoveredIndex = orderedActions.findIndex((candidate) => candidate.id === action.id);
    if (hoveredIndex < 0) return undefined;

    const bounds = event.currentTarget.getBoundingClientRect();
    const isAfter = layout === "wrapped"
      ? event.clientX >= bounds.left + bounds.width / 2
      : event.clientY >= bounds.top + bounds.height / 2;

    return isAfter ? orderedActions[hoveredIndex + 1]?.id : action.id;
  }

  function beforeIdInContainer(
    event: DragEvent<HTMLElement>,
    targetActions: CalendarAction[],
    layout: ActionLayout,
  ) {
    const container = event.currentTarget;
    const orderedActions = targetActions.filter((candidate) => candidate.id !== draggedId);

    for (const action of orderedActions) {
      const element = container.querySelector<HTMLElement>(`[data-action-id="${action.id}"]`);
      if (!element) continue;
      const bounds = element.getBoundingClientRect();

      if (layout === "vertical") {
        if (event.clientY < bounds.top + bounds.height / 2) return action.id;
        continue;
      }

      if (event.clientY < bounds.top) return action.id;
      if (event.clientY <= bounds.bottom && event.clientX < bounds.left + bounds.width / 2) {
        return action.id;
      }
    }

    return undefined;
  }

  function previewContainerDrop(
    event: DragEvent<HTMLElement>,
    target: string,
    targetActions: CalendarAction[],
    layout: ActionLayout,
  ) {
    event.preventDefault();
    if (!draggedId) return;
    setDropTarget({ target, beforeId: beforeIdInContainer(event, targetActions, layout) });
  }

  function completeContainerDrop(
    event: DragEvent<HTMLElement>,
    target: string,
    targetActions: CalendarAction[],
    layout: ActionLayout,
  ) {
    event.preventDefault();
    const droppedId = event.dataTransfer.getData("text/action-id");
    if (droppedId) completeDrop(droppedId, target, beforeIdInContainer(event, targetActions, layout));
  }

  function completeDrop(droppedId: string, target: string, beforeId?: string) {
    moveAction(droppedId, target === "someday" ? null : target, beforeId);
    setDraggedId(null);
    setDropTarget(null);
  }

  function actionProps(
    action: CalendarAction,
    target: string,
    targetActions: CalendarAction[],
    layout: ActionLayout = "vertical",
    compact = false,
    bucket = false,
  ) {
    const remainingTargetActions = targetActions.filter((candidate) => candidate.id !== draggedId);
    const isActiveTarget = Boolean(draggedId && dropTarget?.target === target);
    const lastTargetId = remainingTargetActions[remainingTargetActions.length - 1]?.id;

    return {
      action,
      compact,
      bucket,
      isDragging: draggedId === action.id,
      dropBefore: isActiveTarget && dropTarget?.beforeId === action.id,
      dropAfter: isActiveTarget && dropTarget?.beforeId === undefined && lastTargetId === action.id,
      onOpen: () => setSelectedId(action.id),
      onComplete: () => updateAction(action.id, { completed: !action.completed }),
      onDragStart: () => {
        setDraggedId(action.id);
        setDropTarget(null);
      },
      onDragEnd: () => {
        setDraggedId(null);
        setDropTarget(null);
      },
      onDragPosition: (event: DragEvent<HTMLDivElement>) => {
        if (!draggedId || draggedId === action.id) return;
        setDropTarget({
          target,
          beforeId: beforeIdAtPointer(event, action, targetActions, layout),
        });
      },
      onDropAt: (event: DragEvent<HTMLDivElement>, droppedId: string) => {
        completeDrop(droppedId, target, beforeIdAtPointer(event, action, targetActions, layout));
      },
    };
  }

  function dropListClass(target: string, targetActions: CalendarAction[]) {
    const hasDropTarget = draggedId && dropTarget?.target === target;
    const hasRemainingActions = targetActions.some((action) => action.id !== draggedId);
    return hasDropTarget && !hasRemainingActions ? "is-drop-empty" : "";
  }

  function renderComposer(target: string, index?: number) {
    return composerTarget?.target === target && composerTarget.index === index ? (
      <ActionComposer onAdd={(title) => addAction(target, title, index)} onCancel={() => setComposerTarget(null)} />
    ) : null;
  }

  function renderSomeday() {
    const somedayActions = actionsFor(null);
    return (
      <section className="someday-section">
        <div className="someday-heading">
          <h2>Someday</h2>
          <span className="someday-separator" aria-hidden="true">·</span>
          <button
            className="someday-add"
            type="button"
            aria-label="Add a Someday action"
            aria-expanded={composerTarget?.target === "someday"}
            onClick={() => setComposerTarget({ target: "someday", index: somedayActions.length })}
          >
            +
          </button>
        </div>
        <div
          className={`someday-grid ${dropListClass("someday", somedayActions)}`}
          onDragOver={(event) => previewContainerDrop(event, "someday", somedayActions, "wrapped")}
          onDrop={(event) => completeContainerDrop(event, "someday", somedayActions, "wrapped")}
          onDoubleClick={(event) => {
            if ((event.target as HTMLElement).closest(".action-item, .action-composer")) return;
            setComposerTarget({ target: "someday", index: somedayActions.length });
          }}
        >
          {somedayActions.map((action) => (
            <ActionItem key={action.id} {...actionProps(action, "someday", somedayActions, "wrapped", false, true)} />
          ))}
          {renderComposer("someday", somedayActions.length)}
        </div>
      </section>
    );
  }

  function renderWeek() {
    const start = startOfWeek(focusDate);
    const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    const todayKey = toDateKey(new Date());
    const maxActionCount = Math.max(1, ...days.map((day) => actionsFor(toDateKey(day)).length));

    return (
      <>
        <div className="week-scroll">
          <section
            className="week-grid"
            aria-label="Week view"
            style={{ "--week-action-rows": maxActionCount } as CSSProperties}
          >
            {days.map((day) => {
              const key = toDateKey(day);
              const dayActions = actionsFor(key);
              return (
                <article
                  className={`day-column ${key === todayKey ? "is-today" : ""}`}
                  key={key}
                >
                  <header>
                    <strong>{day.getDate()} {MONTHS[day.getMonth()].slice(0, 3)}</strong>
                    <span>{WEEKDAYS[(day.getDay() + 6) % 7]}</span>
                  </header>
                  <div
                    className={`day-actions ${dropListClass(key, dayActions)}`}
                    onDragOver={(event) => previewContainerDrop(event, key, dayActions, "vertical")}
                    onDrop={(event) => completeContainerDrop(event, key, dayActions, "vertical")}
                    onDoubleClick={(event) => {
                      if ((event.target as HTMLElement).closest(".action-item, .action-composer")) return;
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const clickedRow = Math.floor((event.clientY - bounds.top) / 54);
                      const index = Math.max(0, Math.min(dayActions.length, clickedRow));
                      setComposerTarget({ target: key, index });
                    }}
                  >
                    {dayActions.map((action, index) => (
                      <Fragment key={action.id}>
                        {renderComposer(key, index)}
                        <ActionItem {...actionProps(action, key, dayActions)} />
                      </Fragment>
                    ))}
                    {renderComposer(key, dayActions.length)}
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </>
    );
  }

  function renderMonth() {
    const year = focusDate.getFullYear();
    const month = focusDate.getMonth();
    const days = monthGrid(year, month);
    const todayKey = toDateKey(new Date());

    return (
      <>
        <section className="month-view" aria-label="Month view">
          <div className="month-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="month-grid">
            {days.map((day) => {
              const key = toDateKey(day);
              const dayActions = actionsFor(key);
              return (
                <article
                  key={key}
                  className={`month-day ${day.getMonth() !== month ? "is-outside" : ""} ${key === todayKey ? "is-today" : ""}`}
                  onDoubleClick={(event) => {
                    if ((event.target as HTMLElement).closest(".action-item, .action-composer")) return;
                    setComposerTarget({ target: key, index: dayActions.length });
                  }}
                >
                  <header>
                    <span>{day.getDate()}</span>
                  </header>
                  <div
                    className={`month-actions ${dropListClass(key, dayActions)}`}
                    onDragOver={(event) => previewContainerDrop(event, key, dayActions, "vertical")}
                    onDrop={(event) => completeContainerDrop(event, key, dayActions, "vertical")}
                  >
                    {dayActions.map((action) => (
                      <ActionItem key={action.id} {...actionProps(action, key, dayActions, "vertical", true)} />
                    ))}
                    {renderComposer(key, dayActions.length)}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </>
    );
  }

  function renderYear() {
    const year = focusDate.getFullYear();
    return (
      <section className="year-view" aria-label="Year view">
        {MONTHS.map((monthName, month) => {
          const days = monthGrid(year, month);
          return (
            <article className="mini-month" key={monthName}>
              <button
                className="mini-month-title"
                type="button"
                onClick={() => {
                  setFocusDate(new Date(year, month, 1));
                  setView("month");
                }}
              >
                {monthName}
              </button>
              <div className="mini-weekdays" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day[0]}</span>)}</div>
              <div className="mini-days">
                {days.map((day) => {
                  const key = toDateKey(day);
                  const dayActions = actionsFor(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`${day.getMonth() !== month ? "is-outside" : ""} ${dayActions.length ? "has-actions" : ""}`}
                      title={dayActions.length ? `${dayActions.length} actions on ${prettyDate(key)}` : prettyDate(key)}
                      onClick={() => {
                        setFocusDate(day);
                        setView("week");
                      }}
                    >
                      {day.getDate()}
                      {dayActions.length > 0 && <i aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar" id="top">
        <nav className="primary-tabs" aria-label="Product sections">
          <button type="button" className={tab === "actions" ? "is-active" : ""} onClick={() => setTab("actions")}>Actions</button>
          <button type="button" className={tab === "journal" ? "is-active" : ""} onClick={() => setTab("journal")}>Journal</button>
          <button type="button" className={tab === "activity" ? "is-active" : ""} onClick={() => setTab("activity")}>Activity</button>
        </nav>
        <a className="brand" href="#top" aria-label="Organization home">organization</a>
        <AccountControl
          signedIn={signedIn}
          onSignIn={() => setSignedIn(true)}
          onSignOut={() => setSignedIn(false)}
        />
      </header>

      {tab === "actions" ? (
        <>
          {renderSomeday()}
          <section className="period-heading">
            <h1>
              <span>{periodLabel(view, focusDate)}</span>
              <time>{periodTitle(view, focusDate)}</time>
            </h1>
            <div className="calendar-controls">
              <div className="view-switch" aria-label="Calendar view">
                {(["week", "month", "year"] as ViewMode[]).map((mode) => (
                  <button key={mode} type="button" className={view === mode ? "is-active" : ""} onClick={() => setView(mode)}>{mode}</button>
                ))}
              </div>
              <button className="today-button" type="button" onClick={() => setFocusDate(new Date())}>Today</button>
              <div className="period-nav">
                <button type="button" onClick={() => navigate(-1)} aria-label={`Previous ${view}`}>←</button>
                <button type="button" onClick={() => navigate(1)} aria-label={`Next ${view}`}>→</button>
              </div>
            </div>
          </section>

          {view === "week" && renderWeek()}
          {view === "month" && renderMonth()}
          {view === "year" && renderYear()}
        </>
      ) : tab === "journal" ? (
        <section className="journal-placeholder">
          <h1>Journal</h1>
          <p>The Journal is outside the current prototype scope.</p>
          <button type="button" onClick={() => setTab("actions")}>Return to actions</button>
        </section>
      ) : (
        <ActivityHeatmap actions={actions} year={activityYear} onYearChange={setActivityYear} />
      )}

      {selectedAction && (
        <ActionPage
          action={selectedAction}
          onClose={() => setSelectedId(null)}
          onChange={(patch) => updateAction(selectedAction.id, patch)}
          onDelete={() => {
            setActions((current) => current.filter((action) => action.id !== selectedAction.id));
            setSelectedId(null);
          }}
        />
      )}
    </main>
  );
}
