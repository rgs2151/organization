import {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import * as api from "./api";
import {
  type ActionColor,
  type OrganizationAction,
  type OrganizationSession,
  type UpdateActionInput,
} from "../shared/contracts";

const RichNoteEditor = lazy(() => import("./RichNoteEditor"));

type ViewMode = "week" | "month" | "year";
type AppTab = "actions" | "journal" | "activity";
type ActionLayout = "vertical" | "wrapped";

type DropTarget = {
  target: string;
  beforeId?: string;
};

type CalendarAction = OrganizationAction;

const ACTION_COLOR_VALUES: Record<ActionColor, string> = {
  plain: "rgba(255, 255, 255, 0.76)",
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

function activityLevel(count: number, completedDayCounts: number[]) {
  if (count === 0 || completedDayCounts.length === 0) return 0;
  let daysAtOrBelow = 0;
  for (const value of completedDayCounts) {
    if (value > count) break;
    daysAtOrBelow += 1;
  }
  return Math.min(4, Math.max(1, Math.ceil((daysAtOrBelow / completedDayCounts.length) * 4)));
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
    "--action-color": ACTION_COLOR_VALUES[action.color],
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
  session,
}: {
  session: OrganizationSession;
}) {
  const { user } = session;
  return (
    <details className="account-menu">
      <summary aria-label={`Open ${user.displayName} account menu`}>
        <span className="account-name">{user.displayName}</span>
        <span className="account-avatar" aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span>
      </summary>
      <div className="account-popover">
        <strong>{user.displayName}</strong>
        <span>{user.email}</span>
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
  onChange: (patch: UpdateActionInput) => void;
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
          <div className="action-page-meta">
            <label className="action-date-control">
              <span>Date</span>
              <input
                type="date"
                value={action.date ?? ""}
                onChange={(event) => onChange({ date: event.target.value || null })}
              />
            </label>
            <div className="color-options" aria-label="Action color">
              {(Object.keys(ACTION_COLOR_VALUES) as ActionColor[]).map((color) => (
                <button
                  key={color}
                  type="button"
                  className={action.color === color ? "is-selected" : ""}
                  style={{ background: color === "plain" ? "#f7f7f3" : ACTION_COLOR_VALUES[color] }}
                  aria-label={`Use ${color} color`}
                  aria-pressed={action.color === color}
                  onClick={() => onChange({ color })}
                />
              ))}
            </div>
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

        <Suspense fallback={<div className="rich-note rich-note-loading" aria-label="Loading notes" />}>
          <RichNoteEditor
            actionId={action.id}
            note={action.note}
            onChange={(note) => onChange({ note })}
          />
        </Suspense>

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
      const completedDate = action.completedAt?.slice(0, 10);
      if (action.completed && completedDate?.startsWith(String(year))) {
        result.set(completedDate, (result.get(completedDate) ?? 0) + 1);
      }
    });
    return result;
  }, [actions, year]);

  const cells = useMemo(() => {
    const yearStart = new Date(year, 0, 1);
    const gridStart = startOfWeek(yearStart);
    const gridEnd = addDays(startOfWeek(new Date(year, 11, 31)), 6);
    const dayCount = Math.round(
      (Date.UTC(gridEnd.getFullYear(), gridEnd.getMonth(), gridEnd.getDate())
        - Date.UTC(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate()))
      / 86_400_000,
    ) + 1;
    const completedDayCounts = [...completedByDate.values()].sort((left, right) => left - right);
    return Array.from({ length: dayCount }, (_, index) => {
      const date = addDays(gridStart, index);
      if (date.getFullYear() !== year) return { key: `empty-${index}`, date: null, count: 0, level: 0 };
      const key = toDateKey(date);
      const count = completedByDate.get(key) ?? 0;
      const level = activityLevel(count, completedDayCounts);
      return { key, date, count, level };
    });
  }, [completedByDate, year]);

  const availableYears = useMemo(() => {
    const years = new Set([new Date().getFullYear(), year]);
    actions.forEach((action) => {
      if (action.completed && action.completedAt) {
        years.add(Number(action.completedAt.slice(0, 4)));
      }
    });
    return [...years].filter(Number.isInteger).sort((left, right) => right - left);
  }, [actions, year]);

  const total = cells.reduce((sum, cell) => sum + cell.count, 0);
  const gridStart = startOfWeek(new Date(year, 0, 1));
  const weekCount = Math.ceil(cells.length / 7);
  const monthColumns = MONTHS.map((month, monthIndex) => {
    const monthStart = new Date(year, monthIndex, 1);
    const dayOffset = Math.round(
      (Date.UTC(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate())
        - Date.UTC(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate()))
      / 86_400_000,
    );
    return { month, column: Math.floor(dayOffset / 7) + 1 };
  });

  return (
    <section className="activity-section" aria-labelledby="activity-title">
      <div className="activity-heading">
        <h1 id="activity-title">{total} actions completed in {year}</h1>
      </div>

      <div className="activity-card">
        <div className="heatmap-wrap">
          <div
            className="heatmap-months"
            style={{ gridTemplateColumns: `repeat(${weekCount}, minmax(11px, 1fr))` }}
            aria-hidden="true"
          >
            {monthColumns.map(({ month, column }) => (
              <span key={month} style={{ gridColumnStart: column }}>{month.slice(0, 3)}</span>
            ))}
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
          {availableYears.map((candidate) => (
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
  const [focusDate, setFocusDate] = useState(new Date());
  const [actions, setActions] = useState<CalendarAction[]>([]);
  const [session, setSession] = useState<OrganizationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerTarget, setComposerTarget] = useState<{ target: string; index?: number } | null>(null);
  const [activityYear, setActivityYear] = useState(() => new Date().getFullYear());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const pendingPatches = useRef(new Map<string, UpdateActionInput>());
  const patchTimers = useRef(new Map<string, number>());

  useEffect(() => {
    let active = true;
    api.loadApplication()
      .then((application) => {
        if (!active) return;
        setSession(application.session);
        setActions(application.actions);
        setServerError(null);
      })
      .catch((error: unknown) => {
        if (active) setServerError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      patchTimers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const selectedAction = actions.find((action) => action.id === selectedId) ?? null;

  function actionsFor(date: string | null) {
    return actions.filter((action) => action.date === date);
  }

  async function addAction(target: string, title: string, insertIndex?: number) {
    const date = target === "someday" ? null : target;
    const targetActions = actionsFor(date);
    const beforeId = insertIndex === undefined ? undefined : targetActions[insertIndex]?.id;
    setComposerTarget(null);
    try {
      const newAction = await api.createAction({ title, date, beforeId });
      setActions((current) => insertAction(current, newAction, beforeId));
      setServerError(null);
    } catch (error) {
      setServerError(errorMessage(error));
    }
  }

  function updateAction(id: string, patch: UpdateActionInput) {
    setActions((current) => current.map((action) => action.id === id
      ? {
          ...action,
          ...patch,
          ...(Object.hasOwn(patch, "completed")
            ? { completedAt: patch.completed ? new Date().toISOString() : null }
            : {}),
        }
      : action));

    pendingPatches.current.set(id, { ...pendingPatches.current.get(id), ...patch });
    const existingTimer = patchTimers.current.get(id);
    if (existingTimer) window.clearTimeout(existingTimer);
    const timer = window.setTimeout(async () => {
      const pending = pendingPatches.current.get(id);
      pendingPatches.current.delete(id);
      patchTimers.current.delete(id);
      if (!pending) return;
      try {
        const saved = await api.updateAction(id, pending);
        setActions((current) => current.map((action) => action.id === id
          ? { ...action, completedAt: saved.completedAt }
          : action));
        setServerError(null);
      } catch (error) {
        setServerError(errorMessage(error));
        void reloadApplication();
      }
    }, 250);
    patchTimers.current.set(id, timer);
  }

  function discardPendingPatch(id: string) {
    const timer = patchTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    patchTimers.current.delete(id);
    pendingPatches.current.delete(id);
  }

  function moveActionLocally(draggedId: string, targetDate: string | null, beforeId?: string) {
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

  async function reloadApplication() {
    try {
      const application = await api.loadApplication();
      setSession(application.session);
      setActions(application.actions);
      setServerError(null);
    } catch (error) {
      setServerError(errorMessage(error));
    }
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
    const date = target === "someday" ? null : target;
    moveActionLocally(droppedId, date, beforeId);
    setDraggedId(null);
    setDropTarget(null);
    void api.moveAction(droppedId, { date, beforeId })
      .then((savedActions) => {
        setActions(savedActions);
        setServerError(null);
      })
      .catch((error: unknown) => {
        setServerError(errorMessage(error));
        void reloadApplication();
      });
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

  if (loading) {
    return <main className="app-shell"><div className="application-state">Loading…</div></main>;
  }

  if (!session) {
    return (
      <main className="app-shell">
        <div className="application-state">
          <strong>Organization could not start.</strong>
          <button type="button" onClick={() => void reloadApplication()}>Try again</button>
        </div>
      </main>
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
        <AccountControl session={session} />
      </header>

      {serverError && (
        <div className="server-error" role="status">
          <span>{serverError}</span>
          <button type="button" onClick={() => setServerError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

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
          <p>Not available yet.</p>
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
            discardPendingPatch(selectedAction.id);
            setActions((current) => current.filter((action) => action.id !== selectedAction.id));
            setSelectedId(null);
            void api.deleteAction(selectedAction.id).catch((error: unknown) => {
              setServerError(errorMessage(error));
              void reloadApplication();
            });
          }}
        />
      )}
    </main>
  );
}

function insertAction(
  actions: CalendarAction[],
  action: CalendarAction,
  beforeId?: string,
) {
  if (beforeId) {
    const beforeIndex = actions.findIndex((candidate) => candidate.id === beforeId);
    if (beforeIndex >= 0) {
      return [...actions.slice(0, beforeIndex), action, ...actions.slice(beforeIndex)];
    }
  }
  const lastTargetIndex = actions.reduce(
    (last, candidate, index) => candidate.date === action.date ? index : last,
    -1,
  );
  if (lastTargetIndex < 0) return [...actions, action];
  return [
    ...actions.slice(0, lastTargetIndex + 1),
    action,
    ...actions.slice(lastTargetIndex + 1),
  ];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Organization could not save that change.";
}
