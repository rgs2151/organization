import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CreateActionInput, MoveActionInput, UpdateActionInput } from "../shared/contracts.js";
import { ActionRepository, InputError, NotFoundError } from "./action-repository.js";
import { config } from "./config.js";
import { openDatabase } from "./database.js";

const database = openDatabase(config.databasePath);
const repository = new ActionRepository(database);
const developmentSession = {
  user: config.developmentUser,
  mode: "development" as const,
};

repository.ensureDevelopmentUser(developmentSession.user);

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    if (error instanceof InputError || error instanceof SyntaxError) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    if (error instanceof NotFoundError) {
      sendJson(response, 404, { error: error.message });
      return;
    }
    console.error(error);
    sendJson(response, 500, { error: "The organization server could not complete the request." });
  }
});

async function route(request: IncomingMessage, response: ServerResponse) {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const ownerId = developmentSession.user.id;

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (method === "GET" && url.pathname === "/api/session") {
    sendJson(response, 200, developmentSession);
    return;
  }
  if (method === "GET" && url.pathname === "/api/actions") {
    sendJson(response, 200, { actions: repository.list(ownerId) });
    return;
  }
  if (method === "POST" && url.pathname === "/api/actions") {
    const input = await readJson<CreateActionInput>(request);
    sendJson(response, 201, { action: repository.create(ownerId, input) });
    return;
  }

  const actionMatch = url.pathname.match(/^\/api\/actions\/([^/]+)$/);
  if (actionMatch && method === "PATCH") {
    const input = await readJson<UpdateActionInput>(request);
    sendJson(response, 200, { action: repository.update(ownerId, actionMatch[1], input) });
    return;
  }
  if (actionMatch && method === "DELETE") {
    repository.delete(ownerId, actionMatch[1]);
    response.writeHead(204).end();
    return;
  }

  const moveMatch = url.pathname.match(/^\/api\/actions\/([^/]+)\/move$/);
  if (moveMatch && method === "POST") {
    const input = await readJson<MoveActionInput>(request);
    sendJson(response, 200, { actions: repository.move(ownerId, moveMatch[1], input) });
    return;
  }

  sendJson(response, 404, { error: "Not found." });
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 1_000_000) throw new InputError("Request body is too large.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) throw new InputError("A JSON request body is required.");
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InputError("The JSON request body must be an object.");
  }
  return parsed as T;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

server.listen(config.port, "127.0.0.1", () => {
  console.log(`organization api: http://127.0.0.1:${config.port}`);
  console.log(`organization database: ${config.databasePath}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
