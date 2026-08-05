import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import type {
  CreateActionInput,
  MoveActionInput,
  RichTextNode,
  UpdateActionInput,
} from "../shared/contracts.js";
import { ActionRepository, InputError, NotFoundError } from "./action-repository.js";
import { AttachmentRepository } from "./attachment-repository.js";
import { config } from "./config.js";
import { openDatabase } from "./database.js";

const database = openDatabase(config.databasePath);
const repository = new ActionRepository(database);
const attachments = new AttachmentRepository(database);
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

  const uploadMatch = url.pathname.match(/^\/api\/actions\/([^/]+)\/attachments$/);
  if (uploadMatch && method === "POST") {
    const actionId = uploadMatch[1];
    attachments.requireOwnedAction(ownerId, actionId);
    const contentType = singleHeader(request.headers["content-type"])?.split(";", 1)[0] ?? "";
    const extension = imageExtension(contentType);
    const bytes = await readBuffer(request, 10 * 1024 * 1024);
    if (bytes.byteLength === 0) throw new InputError("The uploaded image is empty.");

    const id = randomUUID();
    const storageKey = `${randomUUID()}.${extension}`;
    const encodedFilename = singleHeader(request.headers["x-file-name"]) ?? "image";
    const filename = safeFilename(encodedFilename);
    await mkdir(config.uploadDirectory, { recursive: true });
    const storagePath = path.join(config.uploadDirectory, storageKey);
    await writeFile(storagePath, bytes, { flag: "wx" });
    try {
      attachments.create(ownerId, actionId, {
        id,
        storageKey,
        filename,
        contentType,
        byteSize: bytes.byteLength,
      });
    } catch (error) {
      await unlink(storagePath).catch(() => undefined);
      throw error;
    }
    sendJson(response, 201, {
      attachment: { id, src: `/api/attachments/${id}`, alt: filename },
    });
    return;
  }

  const attachmentMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
  if (attachmentMatch && method === "GET") {
    const attachment = attachments.get(ownerId, attachmentMatch[1]);
    const bytes = await readFile(path.join(config.uploadDirectory, attachment.storageKey));
    response.writeHead(200, {
      "content-type": attachment.contentType,
      "content-length": String(bytes.byteLength),
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    });
    response.end(bytes);
    return;
  }

  const actionMatch = url.pathname.match(/^\/api\/actions\/([^/]+)$/);
  if (actionMatch && method === "PATCH") {
    const input = await readJson<UpdateActionInput>(request);
    const action = repository.update(ownerId, actionMatch[1], input);
    if (input.note) {
      const storageKeys = attachments.deleteUnreferenced(
        ownerId,
        actionMatch[1],
        attachmentIds(input.note),
      );
      await Promise.all(storageKeys.map((storageKey) =>
        unlink(path.join(config.uploadDirectory, storageKey)).catch(() => undefined),
      ));
    }
    sendJson(response, 200, { action });
    return;
  }
  if (actionMatch && method === "DELETE") {
    const storageKeys = attachments.storageKeysForAction(ownerId, actionMatch[1]);
    repository.delete(ownerId, actionMatch[1]);
    await Promise.all(storageKeys.map((storageKey) =>
      unlink(path.join(config.uploadDirectory, storageKey)).catch(() => undefined),
    ));
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
  const bytes = await readBuffer(request, 1_000_000);
  if (bytes.length === 0) throw new InputError("A JSON request body is required.");
  const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new InputError("The JSON request body must be an object.");
  }
  return parsed as T;
}

async function readBuffer(request: IncomingMessage, maximumBytes: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > maximumBytes) throw new InputError("Request body is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function imageExtension(contentType: string) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const extension = extensions[contentType];
  if (!extension) throw new InputError("Images must be JPEG, PNG, WebP, or GIF.");
  return extension;
}

function singleHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeFilename(encoded: string) {
  let decoded = encoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    throw new InputError("The image filename is invalid.");
  }
  return decoded.replace(/[\u0000-\u001f/\\]/g, "_").slice(0, 180) || "image";
}

function attachmentIds(document: RichTextNode) {
  const ids = new Set<string>();
  const visit = (node: RichTextNode) => {
    const source = typeof node.attrs?.src === "string" ? node.attrs.src : "";
    const match = source.match(/^\/api\/attachments\/([^/?#]+)$/);
    if (match) ids.add(match[1]);
    node.content?.forEach(visit);
  };
  visit(document);
  return ids;
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
