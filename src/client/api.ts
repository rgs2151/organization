import type {
  CreateActionInput,
  MoveActionInput,
  OrganizationAction,
  OrganizationSession,
  UpdateActionInput,
} from "../shared/contracts";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function loadApplication() {
  const [session, actionsResponse] = await Promise.all([
    request<OrganizationSession>("/api/session"),
    request<{ actions: OrganizationAction[] }>("/api/actions"),
  ]);
  return { session, actions: actionsResponse.actions };
}

export async function createAction(input: CreateActionInput) {
  return (await request<{ action: OrganizationAction }>("/api/actions", {
    method: "POST",
    body: JSON.stringify(input),
  })).action;
}

export async function updateAction(id: string, input: UpdateActionInput) {
  return (await request<{ action: OrganizationAction }>(`/api/actions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  })).action;
}

export async function moveAction(id: string, input: MoveActionInput) {
  return (await request<{ actions: OrganizationAction[] }>(`/api/actions/${encodeURIComponent(id)}/move`, {
    method: "POST",
    body: JSON.stringify(input),
  })).actions;
}

export async function deleteAction(id: string) {
  await request<void>(`/api/actions/${encodeURIComponent(id)}`, { method: "DELETE" });
}
