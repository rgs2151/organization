import type { IncomingMessage } from "node:http";
import type { OrganizationSession, OrganizationUser } from "../shared/contracts.js";
import type { ActionRepository } from "./action-repository.js";

type SessionConfig = {
  authMode: "development" | "authentik-proxy";
  authentikAppSlug: string;
  developmentUser: OrganizationUser;
};

export class SessionResolver {
  constructor(
    private readonly repository: ActionRepository,
    private readonly config: SessionConfig,
  ) {
    if (config.authMode === "development") {
      repository.ensureDevelopmentUser(config.developmentUser);
    }
  }

  resolve(request: IncomingMessage): OrganizationSession {
    if (this.config.authMode === "development") {
      return { user: this.config.developmentUser, mode: "development" };
    }

    const app = requiredHeader(request, "x-authentik-meta-app", 120);
    if (app !== this.config.authentikAppSlug) {
      throw new UnauthorizedError("The request was not authenticated for this application.");
    }

    const subject = requiredHeader(request, "x-authentik-uid", 256);
    const email = requiredHeader(request, "x-authentik-email", 320).toLowerCase();
    if (!email.includes("@")) throw new UnauthorizedError("The authenticated email is invalid.");

    const displayName = cleanHeader(request, "x-authentik-name", 200)
      ?? cleanHeader(request, "x-authentik-username", 200)
      ?? email;
    const user = this.repository.ensureAuthenticatedUser({ subject, email, displayName });
    return { user, mode: "authenticated" };
  }
}

export class UnauthorizedError extends Error {}

function requiredHeader(request: IncomingMessage, name: string, maximumLength: number) {
  const value = cleanHeader(request, name, maximumLength);
  if (!value) throw new UnauthorizedError("Authentication is required.");
  return value;
}

function cleanHeader(request: IncomingMessage, name: string, maximumLength: number) {
  const raw = request.headers[name];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!value) return null;
  if (value.length > maximumLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new UnauthorizedError("An authentication header is invalid.");
  }
  return value;
}
