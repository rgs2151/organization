import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export async function serveClient(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  clientDirectory: string,
) {
  const decodedPath = safeDecode(pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const requestedPath = safeResolve(clientDirectory, relativePath);
  let file = await tryRead(requestedPath);
  let servedPath = requestedPath;

  if (!file && !path.extname(relativePath)) {
    servedPath = path.join(clientDirectory, "index.html");
    file = await tryRead(servedPath);
  }
  if (!file) return false;

  applySecurityHeaders(response);
  response.writeHead(200, {
    "content-type": CONTENT_TYPES[path.extname(servedPath).toLowerCase()]
      ?? "application/octet-stream",
    "content-length": String(file.byteLength),
    "cache-control": relativePath.startsWith("assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
  response.end(request.method === "HEAD" ? undefined : file);
  return true;
}

export function applySecurityHeaders(response: ServerResponse) {
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  response.setHeader("referrer-policy", "same-origin");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
}

function safeDecode(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw new InvalidPathError();
  }
}

function safeResolve(root: string, relativePath: string) {
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, relativePath);
  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new InvalidPathError();
  }
  return resolved;
}

async function tryRead(filePath: string) {
  try {
    return await readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if ((error as NodeJS.ErrnoException).code === "EISDIR") return null;
    throw error;
  }
}

export class InvalidPathError extends Error {}
