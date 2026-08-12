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
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as api from "./api";
import SettingsPage from "./SettingsPage";
import {
  type ActionPlacement,
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

type MarqueeBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type CalendarAction = OrganizationAction;

type UndoEntry =
  | { kind: "create"; id: string }
  | { kind: "delete"; id: string; beforeId?: string }
  | { kind: "move"; placements: ActionPlacement[] }
  | {
      kind: "change";
      id: string;
      placement?: ActionPlacement;
      state?: Pick<CalendarAction, "completed" | "completedAt" | "color">;
    };

const UNDO_HISTORY_LIMIT = 50;

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

function actionIdsFromTransfer(event: DragEvent<HTMLElement>) {
  const serialized = event.dataTransfer.getData("application/x-organization-action-ids");
  if (serialized) {
    try {
      const ids = JSON.parse(serialized) as unknown;
      if (Array.isArray(ids) && ids.every((id) => typeof id === "string" && id)) {
        return [...new Set(ids)];
      }
    } catch {
      // Fall through to the single-action payload used by older clients.
    }
  }
  const id = event.dataTransfer.getData("text/action-id");
  return id ? [id] : [];
}

function isTextEditingTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(
    "input, textarea, [contenteditable='true'], [contenteditable='plaintext-only']",
  ));
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
  isSelected = false,
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
  isSelected?: boolean;
  dropBefore?: boolean;
  dropAfter?: boolean;
  onOpen: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onComplete: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => string[];
  onDragEnd: () => void;
  onDragPosition: (event: DragEvent<HTMLDivElement>) => void;
  onDropAt: (event: DragEvent<HTMLDivElement>, draggedIds: string[]) => void;
}) {
  const style = {
    "--action-color": ACTION_COLOR_VALUES[action.color],
  } as CSSProperties;

  return (
    <div
      className={`action-item ${compact ? "is-compact" : ""} ${bucket ? "is-bucket" : ""} ${isDragging ? "is-dragging" : ""} ${isSelected ? "is-selected" : ""} ${dropBefore ? "is-drop-before" : ""} ${dropAfter ? "is-drop-after" : ""} ${action.completed ? "is-complete" : ""}`}
      data-action-id={action.id}
      aria-selected={isSelected}
      draggable
      onDragStart={(event) => {
        const actionIds = onDragStart(event);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/action-id", action.id);
        event.dataTransfer.setData("application/x-organization-action-ids", JSON.stringify(actionIds));
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
        const actionIds = actionIdsFromTransfer(event);
        if (actionIds.length > 0 && !actionIds.includes(action.id)) onDropAt(event, actionIds);
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
  onOpenSettings,
}: {
  session: OrganizationSession;
  onOpenSettings: () => void;
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
        <button
          type="button"
          onClick={(event) => {
            const menu = event.currentTarget.closest("details");
            if (menu) menu.open = false;
            onOpenSettings();
          }}
        >
          Settings
        </button>
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerTarget, setComposerTarget] = useState<{ target: string; index?: number } | null>(null);
  const [activityYear, setActivityYear] = useState(() => new Date().getFullYear());
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(() => new Set());
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);
  const pendingPatches = useRef(new Map<string, UpdateActionInput>());
  const patchTimers = useRef(new Map<string, number>());
  const lastSuccessfulSync = useRef(0);
  const synchronization = useRef<Promise<boolean> | null>(null);
  const reconnecting = useRef(false);
  const marqueeCleanup = useRef<(() => void) | null>(null);
  const actionsRef = useRef<CalendarAction[]>(actions);
  const undoStack = useRef<UndoEntry[]>([]);
  const undoing = useRef(false);
  const patchRequests = useRef(new Map<string, Promise<void>>());
  actionsRef.current = actions;

  useEffect(() => {
    let active = true;
    const reconnect = () => {
      if (reconnecting.current) return;
      reconnecting.current = true;
      window.location.reload();
    };
    const synchronizeAfterResume = () => {
      if (!active || document.visibilityState === "hidden") return;
      if (Date.now() - lastSuccessfulSync.current < 30_000) return;
      void reloadApplication();
    };

    void reloadApplication().finally(() => {
      if (active) setLoading(false);
    });
    window.addEventListener(api.AUTHENTICATION_REQUIRED_EVENT, reconnect);
    window.addEventListener("focus", synchronizeAfterResume);
    window.addEventListener("online", synchronizeAfterResume);
    window.addEventListener("pageshow", synchronizeAfterResume);
    document.addEventListener("visibilitychange", synchronizeAfterResume);

    return () => {
      active = false;
      marqueeCleanup.current?.();
      patchTimers.current.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener(api.AUTHENTICATION_REQUIRED_EVENT, reconnect);
      window.removeEventListener("focus", synchronizeAfterResume);
      window.removeEventListener("online", synchronizeAfterResume);
      window.removeEventListener("pageshow", synchronizeAfterResume);
      document.removeEventListener("visibilitychange", synchronizeAfterResume);
    };
  }, []);

  useEffect(() => {
    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "z"
        || (!event.metaKey && !event.ctrlKey)
        || event.shiftKey
        || event.altKey
        || isTextEditingTarget(event.target)
      ) return;
      if (undoStack.current.length === 0 || undoing.current) return;
      event.preventDefault();
      void undoLastAction();
    };
    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, []);

  const selectedAction = actions.find((action) => action.id === selectedId) ?? null;

  function actionsFor(date: string | null) {
    return actions.filter((action) => action.date === date);
  }

  function pushUndo(entry: UndoEntry) {
    undoStack.current = [...undoStack.current, entry].slice(-UNDO_HISTORY_LIMIT);
  }

  function placementFor(id: string, snapshot: CalendarAction[]): ActionPlacement | null {
    const index = snapshot.findIndex((action) => action.id === id);
    if (index < 0) return null;
    const action = snapshot[index];
    const next = snapshot.slice(index + 1).find((candidate) => candidate.date === action.date);
    return { id, date: action.date, ...(next ? { beforeId: next.id } : {}) };
  }

  async function undoLastAction() {
    const entry = undoStack.current.pop();
    if (!entry || undoing.current) return;
    undoing.current = true;
    try {
      if (entry.kind === "create") {
        discardPendingPatch(entry.id);
        await api.deleteAction(entry.id);
        setActions((current) => current.filter((action) => action.id !== entry.id));
      } else if (entry.kind === "delete") {
        setActions(await api.restoreAction(entry.id, { beforeId: entry.beforeId }));
      } else if (entry.kind === "move") {
        setActions(await api.restoreActionPlacements({ placements: entry.placements }));
      } else {
        await flushPendingPatch(entry.id);
        if (entry.placement) {
          setActions(await api.restoreActionPlacements({ placements: [entry.placement] }));
        }
        if (entry.state) {
          const restored = await api.restoreActionState(entry.id, entry.state);
          setActions((current) => current.map((action) => action.id === entry.id ? restored : action));
        }
      }
      setSelectedActionIds(new Set());
      setServerError(null);
    } catch (error) {
      undoStack.current.push(entry);
      if (!handleApplicationError(error)) void reloadApplication();
    } finally {
      undoing.current = false;
    }
  }

  function beginMarqueeSelection(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || event.pointerType !== "mouse") return;
    const target = event.target as HTMLElement;
    if (!target.closest(".selection-surface")) return;
    if (target.closest(".action-item, .action-composer, button, input, textarea, a")) return;

    marqueeCleanup.current?.();
    const startX = event.clientX;
    const startY = event.clientY;
    const additive = event.metaKey || event.ctrlKey;
    const baseSelection = additive ? new Set(selectedActionIds) : new Set<string>();
    let active = false;

    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.documentElement.classList.remove("is-marquee-selecting");
      setMarqueeBox(null);
      marqueeCleanup.current = null;
    };

    const move = (pointerEvent: PointerEvent) => {
      const distance = Math.hypot(pointerEvent.clientX - startX, pointerEvent.clientY - startY);
      if (!active && distance < 5) return;
      active = true;
      pointerEvent.preventDefault();
      document.documentElement.classList.add("is-marquee-selecting");

      const left = Math.min(startX, pointerEvent.clientX);
      const top = Math.min(startY, pointerEvent.clientY);
      const right = Math.max(startX, pointerEvent.clientX);
      const bottom = Math.max(startY, pointerEvent.clientY);
      setMarqueeBox({ left, top, width: right - left, height: bottom - top });

      const nextSelection = new Set(baseSelection);
      document.querySelectorAll<HTMLElement>(".action-item[data-action-id]").forEach((element) => {
        const bounds = element.getBoundingClientRect();
        if (bounds.right >= left && bounds.left <= right && bounds.bottom >= top && bounds.top <= bottom) {
          const id = element.dataset.actionId;
          if (id) nextSelection.add(id);
        }
      });
      setSelectedActionIds(nextSelection);
    };

    const finish = () => {
      if (!active && !additive) setSelectedActionIds(new Set());
      cleanup();
    };

    marqueeCleanup.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
  }

  function toggleActionSelection(id: string) {
    setSelectedActionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addAction(target: string, title: string, insertIndex?: number) {
    const date = target === "someday" ? null : target;
    const targetActions = actionsFor(date);
    const beforeId = insertIndex === undefined ? undefined : targetActions[insertIndex]?.id;
    setComposerTarget(null);
    try {
      const newAction = await api.createAction({ title, date, beforeId });
      setActions((current) => insertAction(current, newAction, beforeId));
      pushUndo({ kind: "create", id: newAction.id });
      setServerError(null);
    } catch (error) {
      handleApplicationError(error);
    }
  }

  function updateAction(id: string, patch: UpdateActionInput) {
    const currentAction = actionsRef.current.find((action) => action.id === id);
    const placement = Object.hasOwn(patch, "date")
      ? placementFor(id, actionsRef.current) ?? undefined
      : undefined;
    const restoresState = Object.hasOwn(patch, "completed") || Object.hasOwn(patch, "color");
    if (currentAction && (placement || restoresState)) {
      pushUndo({
        kind: "change",
        id,
        ...(placement ? { placement } : {}),
        ...(restoresState
          ? {
              state: {
                completed: currentAction.completed,
                completedAt: currentAction.completedAt,
                color: currentAction.color,
              },
            }
          : {}),
      });
    }
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
    const timer = window.setTimeout(() => {
      void flushPendingPatch(id).catch(() => undefined);
    }, 250);
    patchTimers.current.set(id, timer);
  }

  async function flushPendingPatch(id: string) {
    const timer = patchTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    patchTimers.current.delete(id);

    const previousRequest = patchRequests.current.get(id) ?? Promise.resolve();
    const request = previousRequest.catch(() => undefined).then(async () => {
      const pending = pendingPatches.current.get(id);
      pendingPatches.current.delete(id);
      if (!pending) return;
      const saved = await api.updateAction(id, pending);
      setActions((current) => current.map((action) => action.id === id ? saved : action));
      setServerError(null);
    });
    patchRequests.current.set(id, request);
    try {
      await request;
    } catch (error) {
      undoStack.current = [];
      if (!handleApplicationError(error)) void reloadApplication();
      throw error;
    } finally {
      if (patchRequests.current.get(id) === request) patchRequests.current.delete(id);
    }
  }

  function discardPendingPatch(id: string) {
    const timer = patchTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    patchTimers.current.delete(id);
    pendingPatches.current.delete(id);
  }

  function moveActionsLocally(actionIds: string[], targetDate: string | null, beforeId?: string) {
    setActions((current) => {
      const idSet = new Set(actionIds);
      const moving = actionIds
        .map((id) => current.find((action) => action.id === id))
        .filter((action): action is CalendarAction => Boolean(action))
        .map((action) => ({ ...action, date: targetDate }));
      if (moving.length === 0) return current;
      const remaining = current.filter((action) => !idSet.has(action.id));
      if (beforeId) {
        const beforeIndex = remaining.findIndex((action) => action.id === beforeId);
        if (beforeIndex >= 0) {
          return [...remaining.slice(0, beforeIndex), ...moving, ...remaining.slice(beforeIndex)];
        }
      }
      const lastTargetIndex = remaining.reduce(
        (last, action, index) => action.date === targetDate ? index : last,
        -1,
      );
      if (lastTargetIndex < 0) return [...remaining, ...moving];
      return [
        ...remaining.slice(0, lastTargetIndex + 1),
        ...moving,
        ...remaining.slice(lastTargetIndex + 1),
      ];
    });
  }

  function reloadApplication() {
    if (synchronization.current) return synchronization.current;
    const pending = api.loadApplication()
      .then((application) => {
        setSession(application.session);
        setActions(application.actions);
        setServerError(null);
        lastSuccessfulSync.current = Date.now();
        return true;
      })
      .catch((error: unknown) => {
        handleApplicationError(error);
        return false;
      })
      .finally(() => {
        synchronization.current = null;
      });
    synchronization.current = pending;
    return pending;
  }

  function handleApplicationError(error: unknown) {
    if (api.isAuthenticationRequired(error)) return true;
    setServerError(errorMessage(error));
    return false;
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
    const movingIds = new Set(draggedIds);
    const orderedActions = targetActions.filter((candidate) => !movingIds.has(candidate.id));
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
    const movingIds = new Set(draggedIds);
    const orderedActions = targetActions.filter((candidate) => !movingIds.has(candidate.id));

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
    if (draggedIds.length === 0) return;
    setDropTarget({ target, beforeId: beforeIdInContainer(event, targetActions, layout) });
  }

  function completeContainerDrop(
    event: DragEvent<HTMLElement>,
    target: string,
    targetActions: CalendarAction[],
    layout: ActionLayout,
  ) {
    event.preventDefault();
    const droppedIds = actionIdsFromTransfer(event);
    if (droppedIds.length > 0) {
      completeDrop(droppedIds, target, beforeIdInContainer(event, targetActions, layout));
    }
  }

  function completeDrop(droppedIds: string[], target: string, beforeId?: string) {
    const date = target === "someday" ? null : target;
    const orderedIds = actions.filter((action) => droppedIds.includes(action.id)).map((action) => action.id);
    if (orderedIds.length === 0) return;
    const undoEntry: UndoEntry = {
      kind: "move",
      placements: orderedIds
        .map((id) => placementFor(id, actionsRef.current))
        .filter((placement): placement is ActionPlacement => placement !== null),
    };
    pushUndo(undoEntry);
    moveActionsLocally(orderedIds, date, beforeId);
    setDraggedIds([]);
    setDropTarget(null);
    void api.moveActions({ ids: orderedIds, date, beforeId })
      .then((savedActions) => {
        setActions(savedActions);
        setServerError(null);
      })
      .catch((error: unknown) => {
        undoStack.current = undoStack.current.filter((candidate) => candidate !== undoEntry);
        if (!handleApplicationError(error)) void reloadApplication();
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
    const movingIds = new Set(draggedIds);
    const remainingTargetActions = targetActions.filter((candidate) => !movingIds.has(candidate.id));
    const isActiveTarget = Boolean(draggedIds.length > 0 && dropTarget?.target === target);
    const lastTargetId = remainingTargetActions[remainingTargetActions.length - 1]?.id;

    return {
      action,
      compact,
      bucket,
      isDragging: movingIds.has(action.id),
      isSelected: selectedActionIds.has(action.id),
      dropBefore: isActiveTarget && dropTarget?.beforeId === action.id,
      dropAfter: isActiveTarget && dropTarget?.beforeId === undefined && lastTargetId === action.id,
      onOpen: (event: ReactMouseEvent<HTMLButtonElement>) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
          toggleActionSelection(action.id);
          return;
        }
        setSelectedActionIds(new Set());
        setSelectedId(action.id);
      },
      onComplete: () => updateAction(action.id, { completed: !action.completed }),
      onDragStart: () => {
        const ids = selectedActionIds.has(action.id)
          ? actions.filter((candidate) => selectedActionIds.has(candidate.id)).map((candidate) => candidate.id)
          : [action.id];
        setSelectedActionIds(new Set(ids));
        setDraggedIds(ids);
        setDropTarget(null);
        return ids;
      },
      onDragEnd: () => {
        setDraggedIds([]);
        setDropTarget(null);
      },
      onDragPosition: (event: DragEvent<HTMLDivElement>) => {
        if (draggedIds.length === 0 || movingIds.has(action.id)) return;
        setDropTarget({
          target,
          beforeId: beforeIdAtPointer(event, action, targetActions, layout),
        });
      },
      onDropAt: (event: DragEvent<HTMLDivElement>, droppedActionIds: string[]) => {
        completeDrop(droppedActionIds, target, beforeIdAtPointer(event, action, targetActions, layout));
      },
    };
  }

  function dropListClass(target: string, targetActions: CalendarAction[]) {
    const movingIds = new Set(draggedIds);
    const hasDropTarget = draggedIds.length > 0 && dropTarget?.target === target;
    const hasRemainingActions = targetActions.some((action) => !movingIds.has(action.id));
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
          className={`someday-grid selection-surface ${dropListClass("someday", somedayActions)}`}
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
                    className={`day-actions selection-surface ${dropListClass(key, dayActions)}`}
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
                    className={`month-actions selection-surface ${dropListClass(key, dayActions)}`}
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
    const completedByDate = new Map<string, number>();
    actions.forEach((action) => {
      const completedDate = action.completedAt?.slice(0, 10);
      if (action.completed && completedDate?.startsWith(`${year}-`)) {
        completedByDate.set(completedDate, (completedByDate.get(completedDate) ?? 0) + 1);
      }
    });
    const maximumCompleted = Math.max(1, ...completedByDate.values());

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
                  const isOutside = day.getMonth() !== month;
                  const completedCount = isOutside ? 0 : completedByDate.get(key) ?? 0;
                  const completionSize = completedCount === 0
                    ? 0
                    : 4 + Math.sqrt(completedCount / maximumCompleted) * 10;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`${isOutside ? "is-outside" : ""} ${completedCount ? "has-completions" : ""}`}
                      style={{ "--completion-size": `${completionSize}px` } as CSSProperties}
                      title={`${completedCount} completed ${completedCount === 1 ? "action" : "actions"} on ${prettyDate(key)}`}
                      aria-label={`${prettyDate(key)}: ${completedCount} completed ${completedCount === 1 ? "action" : "actions"}`}
                      disabled={isOutside}
                      onClick={() => {
                        setFocusDate(day);
                        setView("week");
                      }}
                    >
                      {completedCount > 0 && <i aria-hidden="true" />}
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
    <main className="app-shell" onPointerDown={beginMarqueeSelection}>
      <header className="topbar" id="top">
        <nav className="primary-tabs" aria-label="Product sections">
          <button type="button" className={tab === "actions" ? "is-active" : ""} onClick={() => setTab("actions")}>Actions</button>
          <button type="button" className={tab === "journal" ? "is-active" : ""} onClick={() => setTab("journal")}>Journal</button>
          <button type="button" className={tab === "activity" ? "is-active" : ""} onClick={() => setTab("activity")}>Activity</button>
        </nav>
        <a className="brand" href="#top" aria-label="Organization home">organization</a>
        <AccountControl session={session} onOpenSettings={() => setSettingsOpen(true)} />
      </header>

      {settingsOpen && (
        <SettingsPage
          session={session}
          onClose={() => setSettingsOpen(false)}
          onError={handleApplicationError}
        />
      )}

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
            const placement = placementFor(selectedAction.id, actionsRef.current);
            setActions((current) => current.filter((action) => action.id !== selectedAction.id));
            setSelectedId(null);
            void flushPendingPatch(selectedAction.id)
              .then(() => api.deleteAction(selectedAction.id))
              .then(() => pushUndo({
                kind: "delete",
                id: selectedAction.id,
                ...(placement?.beforeId ? { beforeId: placement.beforeId } : {}),
              }))
              .catch((error: unknown) => {
                if (!handleApplicationError(error)) void reloadApplication();
              });
          }}
        />
      )}

      {marqueeBox && (
        <div
          className="selection-marquee"
          aria-hidden="true"
          style={{
            left: marqueeBox.left,
            top: marqueeBox.top,
            width: marqueeBox.width,
            height: marqueeBox.height,
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
