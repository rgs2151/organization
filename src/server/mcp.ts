import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createMcpHandler, McpServer, type AuthInfo, type CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { ACTION_COLORS, type RichTextDocument, type RichTextNode } from "../shared/contracts.js";
import { ActionRepository } from "./action-repository.js";
import { type McpPrincipal, McpTokenRepository } from "./mcp-token-repository.js";
import { applySecurityHeaders } from "./static-files.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACTION_ID = z.string().uuid().describe("Organization action ID");
const REVISION = z.number().int().positive().optional().describe("Revision returned by the last read; use it to prevent overwriting a newer change");

export function createOrganizationMcp(
  repository: ActionRepository,
  credentials: McpTokenRepository,
  publicOrigin: string,
) {
  const handler = createMcpHandler((context) => {
    const principal = principalFromAuth(context.authInfo);
    return organizationMcpServer(repository, credentials, principal);
  }, {
    legacy: "stateless",
    responseMode: "auto",
    onerror: (error) => console.error("organization MCP:", error),
  });

  return {
    async handle(request: IncomingMessage, response: ServerResponse) {
      const method = request.method ?? "GET";
      if (!new Set(["POST", "GET", "DELETE"]).has(method)) {
        response.writeHead(405, { allow: "POST, GET, DELETE" }).end();
        return;
      }

      const origin = singleHeader(request.headers.origin);
      if (origin && origin !== publicOrigin) {
        sendMcpError(response, 403, "This MCP endpoint does not accept requests from that origin.");
        return;
      }

      const authorization = singleHeader(request.headers.authorization);
      const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
      const principal = token ? credentials.authenticate(token) : null;
      if (!token || !principal) {
        sendMcpError(response, 401, "A valid Organization MCP credential is required.", {
          "www-authenticate": 'Bearer realm="Organization MCP"',
        });
        return;
      }

      const body = method === "POST" ? await readMcpBody(request) : undefined;
      const webRequest = new Request(new URL(request.url ?? "/mcp", publicOrigin), {
        method,
        headers: mcpHeaders(request.headers),
        body,
      });
      const authInfo: AuthInfo = {
        token,
        clientId: `organization:${principal.tokenId}`,
        scopes: principal.scopes,
        resource: new URL("/mcp", publicOrigin),
        extra: { principal },
      };
      const webResponse = await handler.fetch(webRequest, { authInfo });
      const bytes = Buffer.from(await webResponse.arrayBuffer());
      const headers = Object.fromEntries(webResponse.headers.entries());
      applySecurityHeaders(response);
      response.writeHead(webResponse.status, {
        ...headers,
        "cache-control": "no-store",
        "content-length": String(bytes.byteLength),
      });
      response.end(bytes);
    },
    close: () => handler.close(),
  };
}

function organizationMcpServer(
  repository: ActionRepository,
  credentials: McpTokenRepository,
  principal: McpPrincipal,
) {
  const server = new McpServer(
    { name: "organization", version: "0.7.0" },
    {
      instructions: "Organization is the user's unified personal system. Read current context before making broad scheduling changes. Explicit requests such as scheduling one stated action may be applied directly; preview broad reorganizations first. Preserve the user's words in notes, label interpretations as hypotheses, and never claim an MCP write succeeded unless the tool returned success. Revisions prevent stale overwrites. Destructive deletion requires explicit user intent.",
    },
  );

  const readTool = <T>(name: string, target: ((input: T) => string | undefined) | undefined, operation: (input: T) => unknown) =>
    async (input: T): Promise<CallToolResult> => audited(credentials, principal, name, target?.(input), () => {
      requireScope(principal, "organization:read");
      return operation(input);
    });
  const writeTool = <T>(name: string, target: ((input: T) => string | undefined) | undefined, operation: (input: T) => unknown) =>
    async (input: T): Promise<CallToolResult> => audited(credentials, principal, name, target?.(input), () => {
      requireScope(principal, "organization:write");
      return operation(input);
    });

  server.registerTool("organization_get_context", {
    title: "Get Organization context",
    description: "Read scheduled, Someday, and recently completed actions around a date before planning or reflection.",
    inputSchema: z.object({
      date: z.string().regex(DATE_PATTERN).describe("Anchor date in YYYY-MM-DD"),
      daysAhead: z.number().int().min(0).max(31).default(7),
      completedLookbackDays: z.number().int().min(0).max(31).default(7),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, readTool("organization_get_context", undefined, ({ date, daysAhead, completedLookbackDays }) => {
    const actions = repository.list(principal.ownerId);
    const end = shiftDate(date, daysAhead);
    const completedStart = shiftDate(date, -completedLookbackDays);
    return {
      anchorDate: date,
      scheduled: actions.filter((action) => action.date && action.date >= date && action.date <= end),
      someday: actions.filter((action) => action.date === null && !action.completed),
      recentlyCompleted: actions.filter((action) => {
        const completedDate = action.completedAt?.slice(0, 10);
        return action.completed && completedDate && completedDate >= completedStart && completedDate <= date;
      }),
    };
  }));

  server.registerTool("actions_list", {
    title: "List actions",
    description: "List owner-scoped actions with optional schedule, completion, and text filters.",
    inputSchema: z.object({
      startDate: z.string().regex(DATE_PATTERN).optional(),
      endDate: z.string().regex(DATE_PATTERN).optional(),
      someday: z.boolean().optional(),
      completed: z.boolean().optional(),
      query: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, readTool("actions_list", undefined, ({ startDate, endDate, someday, completed, query, limit }) => {
    const needle = query?.trim().toLocaleLowerCase();
    return {
      actions: repository.list(principal.ownerId).filter((action) => {
        if (someday === true && action.date !== null) return false;
        if (someday === false && action.date === null) return false;
        if (startDate && (!action.date || action.date < startDate)) return false;
        if (endDate && (!action.date || action.date > endDate)) return false;
        if (completed !== undefined && action.completed !== completed) return false;
        return !needle || action.title.toLocaleLowerCase().includes(needle) || noteText(action.note).toLocaleLowerCase().includes(needle);
      }).slice(0, limit),
    };
  }));

  server.registerTool("actions_get", {
    title: "Get action",
    description: "Read one action, including its structured note and revision.",
    inputSchema: z.object({ id: ACTION_ID }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, readTool("actions_get", ({ id }) => id, ({ id }) => ({ action: repository.get(principal.ownerId, id) })));

  server.registerTool("actions_create", {
    title: "Create action",
    description: "Create a scheduled or Someday action. A null date means Someday.",
    inputSchema: z.object({
      title: z.string().min(1).max(500),
      date: z.string().regex(DATE_PATTERN).nullable(),
      beforeId: ACTION_ID.optional(),
      color: z.enum(ACTION_COLORS).optional(),
      note: z.string().max(100_000).optional().describe("Optional plain-text note"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, writeTool("actions_create", undefined, ({ title, date, beforeId, color, note }) => {
    let action = repository.create(principal.ownerId, { title, date, beforeId });
    if (color || note) {
      action = repository.update(principal.ownerId, action.id, {
        ...(color ? { color } : {}),
        ...(note ? { note: plainTextDocument(note) } : {}),
      });
    }
    return { action };
  }));

  server.registerTool("actions_update", {
    title: "Update action",
    description: "Update the title, date, color, or completion state of one action.",
    inputSchema: z.object({
      id: ACTION_ID,
      expectedRevision: REVISION,
      title: z.string().min(1).max(500).optional(),
      date: z.string().regex(DATE_PATTERN).nullable().optional(),
      color: z.enum(ACTION_COLORS).optional(),
      completed: z.boolean().optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, writeTool("actions_update", ({ id }) => id, ({ id, expectedRevision, ...patch }) => ({
    action: repository.update(principal.ownerId, id, patch, expectedRevision),
  })));

  server.registerTool("actions_move", {
    title: "Move action",
    description: "Move or reorder one action. A null date moves it to Someday; beforeId sets its exact position.",
    inputSchema: z.object({
      id: ACTION_ID,
      expectedRevision: REVISION,
      date: z.string().regex(DATE_PATTERN).nullable(),
      beforeId: ACTION_ID.optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, writeTool("actions_move", ({ id }) => id, ({ id, expectedRevision, date, beforeId }) => {
    const actions = repository.move(principal.ownerId, id, { date, beforeId }, expectedRevision);
    return { action: actions.find((action) => action.id === id), actions };
  }));

  server.registerTool("action_note_append", {
    title: "Append action note",
    description: "Append plain text to an action note while preserving its existing rich content and images.",
    inputSchema: z.object({
      id: ACTION_ID,
      expectedRevision: REVISION,
      text: z.string().min(1).max(100_000),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, writeTool("action_note_append", ({ id }) => id, ({ id, expectedRevision, text }) => {
    const action = repository.get(principal.ownerId, id);
    return { action: repository.update(principal.ownerId, id, { note: appendText(action.note, text) }, expectedRevision) };
  }));

  server.registerTool("actions_delete", {
    title: "Delete action",
    description: "Permanently delete one action. Call only when the user explicitly requested deletion.",
    inputSchema: z.object({ id: ACTION_ID, expectedRevision: REVISION }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  }, writeTool("actions_delete", ({ id }) => id, ({ id, expectedRevision }) => {
    repository.delete(principal.ownerId, id, expectedRevision);
    return { deleted: true, id };
  }));

  server.registerTool("activity_get", {
    title: "Get completion activity",
    description: "Return daily completed-action counts for one year.",
    inputSchema: z.object({ year: z.number().int().min(2000).max(2200) }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, readTool("activity_get", undefined, ({ year }) => {
    const daily: Record<string, number> = {};
    for (const action of repository.list(principal.ownerId)) {
      const date = action.completedAt?.slice(0, 10);
      if (action.completed && date?.startsWith(`${year}-`)) daily[date] = (daily[date] ?? 0) + 1;
    }
    return { year, total: Object.values(daily).reduce((sum, count) => sum + count, 0), daily };
  }));

  return server;
}

async function audited(
  credentials: McpTokenRepository,
  principal: McpPrincipal,
  toolName: string,
  targetId: string | undefined,
  operation: () => unknown,
): Promise<CallToolResult> {
  try {
    const result = operation();
    credentials.recordAudit(principal, toolName, "success", targetId);
    return resultContent(result);
  } catch (error) {
    credentials.recordAudit(principal, toolName, "error", targetId);
    return {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : "Organization could not complete the operation." }],
    };
  }
}

function resultContent(value: unknown): CallToolResult {
  const structuredContent = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { result: value };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function principalFromAuth(authInfo: AuthInfo | undefined) {
  const principal = authInfo?.extra?.principal as McpPrincipal | undefined;
  if (!principal) throw new Error("Organization MCP authentication context is missing.");
  return principal;
}

function requireScope(principal: McpPrincipal, scope: string) {
  if (!principal.scopes.includes(scope)) throw new Error(`The MCP credential lacks ${scope}.`);
}

function noteText(document: RichTextDocument) {
  const pieces: string[] = [];
  const visit = (node: RichTextNode) => {
    if (node.text) pieces.push(node.text);
    node.content?.forEach(visit);
    if (["paragraph", "heading", "listItem"].includes(node.type)) pieces.push("\n");
  };
  visit(document);
  return pieces.join("").trim();
}

function plainTextDocument(text: string): RichTextDocument {
  return { type: "doc", content: textParagraphs(text) };
}

function appendText(document: RichTextDocument, text: string): RichTextDocument {
  return { ...document, content: [...(document.content ?? []), ...textParagraphs(text)] };
}

function textParagraphs(text: string): RichTextNode[] {
  return text.split(/\r?\n/).map((line) => ({
    type: "paragraph",
    ...(line ? { content: [{ type: "text", text: line }] } : {}),
  }));
}

function shiftDate(date: string, amount: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

async function readMcpBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 1_000_000) throw new Error("MCP request body is too large.");
    chunks.push(buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function mcpHeaders(source: IncomingHttpHeaders) {
  const headers = new Headers();
  for (const name of ["accept", "content-type", "mcp-protocol-version", "mcp-session-id", "last-event-id", "user-agent"]) {
    const value = singleHeader(source[name]);
    if (value) headers.set(name, value);
  }
  return headers;
}

function singleHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sendMcpError(
  response: ServerResponse,
  status: number,
  message: string,
  extraHeaders: Record<string, string> = {},
) {
  const body = Buffer.from(JSON.stringify({ error: message }));
  applySecurityHeaders(response);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(body.byteLength),
    ...extraHeaders,
  });
  response.end(body);
}
