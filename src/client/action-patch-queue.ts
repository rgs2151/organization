import type { OrganizationAction, UpdateActionInput } from "../shared/contracts";

/** Serialize saves per action and keep newer local edits above older responses. */
export class ActionPatchQueue {
  private pending = new Map<string, UpdateActionInput>();
  private inFlight = new Map<string, UpdateActionInput>();
  private requests = new Map<string, Promise<void>>();

  constructor(
    private send: (id: string, patch: UpdateActionInput) => Promise<OrganizationAction>,
    private saved: (action: OrganizationAction) => void,
  ) {}

  enqueue(id: string, patch: UpdateActionInput) {
    this.pending.set(id, { ...this.pending.get(id), ...patch });
  }

  overlay(action: OrganizationAction): OrganizationAction {
    const patch = { ...this.inFlight.get(action.id), ...this.pending.get(action.id) };
    return { ...action, ...patch };
  }

  discard(id: string) {
    this.pending.delete(id);
  }

  async flush(id: string) {
    const previous = this.requests.get(id) ?? Promise.resolve();
    const request = previous.catch(() => undefined).then(async () => {
      const patch = this.pending.get(id);
      if (!patch) return;
      this.pending.delete(id);
      this.inFlight.set(id, patch);
      try {
        const action = await this.send(id, patch);
        this.inFlight.delete(id);
        this.saved(this.overlay(action));
      } catch (error) {
        this.inFlight.delete(id);
        // Retry failures with the newest text, never roll the editor back.
        this.pending.set(id, { ...patch, ...this.pending.get(id) });
        throw error;
      }
    });
    this.requests.set(id, request);
    try {
      await request;
    } finally {
      if (this.requests.get(id) === request) this.requests.delete(id);
    }
  }
}
