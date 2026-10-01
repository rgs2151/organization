import path from "node:path";

const repositoryRoot = path.resolve(process.env.ORGANIZATION_ROOT ?? process.cwd());
const nodeEnvironment = process.env.NODE_ENV ?? "development";

function resolveFromRoot(value: string | undefined, fallback: string) {
  if (!value) return path.join(repositoryRoot, fallback);
  return path.isAbsolute(value) ? value : path.resolve(repositoryRoot, value);
}

function resolveDatabasePath() {
  return resolveFromRoot(process.env.ORGANIZATION_DATABASE_PATH, "var/organization.sqlite");
}

function resolveUploadPath() {
  return resolveFromRoot(process.env.ORGANIZATION_UPLOAD_PATH, "var/uploads");
}

function resolveAuthMode(): "development" | "authentik-proxy" {
  const value = process.env.ORGANIZATION_AUTH_MODE
    ?? (nodeEnvironment === "production" ? "authentik-proxy" : "development");
  if (value !== "development" && value !== "authentik-proxy") {
    throw new Error("ORGANIZATION_AUTH_MODE must be development or authentik-proxy.");
  }
  return value;
}

const authMode = resolveAuthMode();
const publicOrigin = process.env.ORGANIZATION_PUBLIC_ORIGIN
  ?? (nodeEnvironment === "production" ? "https://organization.singha.io" : "http://127.0.0.1:3001");

function resolveOAuthConfig() {
  const issuer = process.env.ORGANIZATION_OAUTH_ISSUER?.trim();
  const clientId = process.env.ORGANIZATION_OAUTH_CLIENT_ID?.trim();
  const configuredAudiences = process.env.ORGANIZATION_OAUTH_AUDIENCES
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!issuer && !clientId && !configuredAudiences?.length) return null;
  if (!issuer || !clientId) {
    throw new Error("ORGANIZATION_OAUTH_ISSUER and ORGANIZATION_OAUTH_CLIENT_ID must be configured together.");
  }

  const issuerUrl = new URL(issuer);
  if (issuerUrl.protocol !== "https:" || issuerUrl.search || issuerUrl.hash) {
    throw new Error("ORGANIZATION_OAUTH_ISSUER must be an HTTPS URL without a query or fragment.");
  }

  const resource = new URL("/mcp", publicOrigin).href;
  return {
    issuer: issuerUrl.href,
    clientId,
    resource,
    audiences: configuredAudiences?.length ? configuredAudiences : [resource, clientId],
  };
}

if (
  nodeEnvironment === "production"
  && authMode === "development"
  && process.env.ORGANIZATION_ALLOW_DEVELOPMENT_AUTH !== "true"
) {
  throw new Error(
    "Development identity is disabled in production. Use Authentik proxy auth or explicitly allow development auth for an isolated local container.",
  );
}

export const config = {
  nodeEnvironment,
  host: process.env.ORGANIZATION_HOST
    ?? (nodeEnvironment === "production" ? "0.0.0.0" : "127.0.0.1"),
  port: Number(process.env.ORGANIZATION_API_PORT ?? 3001),
  databasePath: resolveDatabasePath(),
  uploadDirectory: resolveUploadPath(),
  clientDirectory: resolveFromRoot(process.env.ORGANIZATION_CLIENT_PATH, "dist"),
  migrationsDirectory: resolveFromRoot(process.env.ORGANIZATION_MIGRATIONS_PATH, "migrations"),
  authMode,
  authentikAppSlug: process.env.ORGANIZATION_AUTHENTIK_APP_SLUG ?? "organization",
  publicOrigin,
  oauth: resolveOAuthConfig(),
  developmentUser: {
    id: process.env.ORGANIZATION_DEV_USER_ID ?? "dev-rudra",
    displayName: process.env.ORGANIZATION_DEV_USER_NAME ?? "Rudra",
    email: process.env.ORGANIZATION_DEV_USER_EMAIL ?? "rgs2151@columbia.edu",
  },
};

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error("ORGANIZATION_API_PORT must be a valid TCP port.");
}

try {
  const parsedPublicOrigin = new URL(config.publicOrigin);
  if (parsedPublicOrigin.origin !== config.publicOrigin || !["http:", "https:"].includes(parsedPublicOrigin.protocol)) {
    throw new Error();
  }
} catch {
  throw new Error("ORGANIZATION_PUBLIC_ORIGIN must be an HTTP(S) origin without a path.");
}
