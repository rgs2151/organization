import type {
  CreateActionInput,
  ActionAttachment,
  MoveActionInput,
  MoveActionsInput,
  OrganizationAction,
  OrganizationSession,
  CreatedMcpToken,
  McpTokenSummary,
  UpdateActionInput,
} from "../shared/contracts";

export const AUTHENTICATION_REQUIRED_EVENT = "organization:authentication-required";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Your Organization session needs to be renewed.");
    this.name = "AuthenticationRequiredError";
  }
}

export class ConnectionError extends Error {
  constructor() {
    super("Organization could not reach the server. It will retry when the connection returns.");
    this.name = "ConnectionError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
      headers: init?.body
        ? { "content-type": "application/json", ...init.headers }
        : init?.headers,
    });
  } catch {
    throw new ConnectionError();
  }

  if (
    response.type === "opaqueredirect"
    || (response.status >= 300 && response.status < 400)
    || response.status === 401
    || response.status === 403
    || response.redirected
  ) {
    notifyAuthenticationRequired();
    throw new AuthenticationRequiredError();
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("Organization received an unexpected response from the server.");
  }
  return response.json() as Promise<T>;
}

export function isAuthenticationRequired(error: unknown): error is AuthenticationRequiredError {
  return error instanceof AuthenticationRequiredError;
}

function notifyAuthenticationRequired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTHENTICATION_REQUIRED_EVENT));
  }
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

export async function moveActions(input: MoveActionsInput) {
  return (await request<{ actions: OrganizationAction[] }>("/api/actions/move", {
    method: "POST",
    body: JSON.stringify(input),
  })).actions;
}

export async function deleteAction(id: string) {
  await request<void>(`/api/actions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function uploadActionImage(actionId: string, file: File) {
  return (await request<{ attachment: ActionAttachment }>(
    `/api/actions/${encodeURIComponent(actionId)}/attachments`,
    {
      method: "POST",
      headers: {
        "content-type": file.type,
        "x-file-name": encodeURIComponent(file.name),
      },
      body: file,
    },
  )).attachment;
}

export async function listMcpCredentials() {
  return (await request<{ credentials: McpTokenSummary[] }>("/api/settings/mcp-credentials"))
    .credentials;
}

export async function createMcpCredential(name: string) {
  return request<CreatedMcpToken>("/api/settings/mcp-credentials", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function revokeMcpCredential(id: string) {
  return (await request<{ credential: McpTokenSummary }>(
    `/api/settings/mcp-credentials/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  )).credential;
}
