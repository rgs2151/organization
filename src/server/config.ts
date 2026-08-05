import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

function resolveDatabasePath() {
  const configured = process.env.ORGANIZATION_DATABASE_PATH;
  if (!configured) return path.join(repositoryRoot, "var", "organization.sqlite");
  return path.resolve(repositoryRoot, configured);
}

export const config = {
  port: Number(process.env.ORGANIZATION_API_PORT ?? 3001),
  databasePath: resolveDatabasePath(),
  developmentUser: {
    id: process.env.ORGANIZATION_DEV_USER_ID ?? "dev-rudra",
    displayName: process.env.ORGANIZATION_DEV_USER_NAME ?? "Rudra",
    email: process.env.ORGANIZATION_DEV_USER_EMAIL ?? "rgs2151@columbia.edu",
  },
};

if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error("ORGANIZATION_API_PORT must be a valid TCP port.");
}

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "Production startup is disabled until the Authentik session adapter is configured.",
  );
}
