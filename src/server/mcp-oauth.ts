import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { ActionRepository } from "./action-repository.js";
import type { McpPrincipal } from "./mcp-token-repository.js";

export const ORGANIZATION_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "organization:read",
  "organization:write",
] as const;

export type McpOAuthConfig = {
  issuer: string;
  clientId: string;
  resource: string;
  audiences: string[];
};

export interface McpOAuthAuthenticator {
  authenticate(token: string): Promise<McpPrincipal | null>;
  protectedResourceMetadata(): Record<string, unknown>;
  challenge(error?: "invalid_token" | "insufficient_scope"): string;
}

type OpenIdDiscovery = {
  issuer?: unknown;
  jwks_uri?: unknown;
  code_challenge_methods_supported?: unknown;
};

export class AuthentikMcpOAuth implements McpOAuthAuthenticator {
  private verifierPromise: ReturnType<typeof createVerifier> | null = null;

  constructor(
    private readonly repository: ActionRepository,
    private readonly config: McpOAuthConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async authenticate(token: string): Promise<McpPrincipal | null> {
    try {
      const verify = await (this.verifierPromise ??= createVerifier(this.config, this.fetchImplementation));
      const payload = await verify(token);
      const scopes = tokenScopes(payload);
      if (!scopes.includes("organization:read") && !scopes.includes("organization:write")) return null;

      const subject = requiredClaim(payload.sub, 256);
      const email = requiredClaim(payload.email, 320).toLowerCase();
      if (!email.includes("@") || payload.email_verified !== true) return null;

      const authorizedParty = optionalClaim(payload.azp) ?? optionalClaim(payload.client_id);
      if (authorizedParty && authorizedParty !== this.config.clientId) return null;

      const displayName = optionalClaim(payload.name)
        ?? optionalClaim(payload.preferred_username)
        ?? email;
      const owner = this.repository.ensureAuthenticatedUser({ subject, email, displayName });
      return {
        ownerId: owner.id,
        email: owner.email,
        displayName: owner.displayName,
        scopes,
        authMethod: "oauth",
        tokenId: null,
        tokenName: null,
        oauthClientId: this.config.clientId,
      };
    } catch {
      return null;
    }
  }

  protectedResourceMetadata() {
    return {
      resource: this.config.resource,
      authorization_servers: [this.config.issuer],
      scopes_supported: [...ORGANIZATION_OAUTH_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "Organization",
      resource_documentation: `${new URL(this.config.resource).origin}/settings`,
    };
  }

  challenge(error: "invalid_token" | "insufficient_scope" = "invalid_token") {
    const metadata = `${new URL(this.config.resource).origin}/.well-known/oauth-protected-resource`;
    const description = error === "insufficient_scope"
      ? "The Organization connection needs additional permissions"
      : "Connect your Organization account to continue";
    return `Bearer resource_metadata="${metadata}", scope="${ORGANIZATION_OAUTH_SCOPES.join(" ")}", error="${error}", error_description="${description}"`;
  }
}

async function createVerifier(config: McpOAuthConfig, fetchImplementation: typeof fetch) {
  const discoveryUrl = new URL(".well-known/openid-configuration", ensureTrailingSlash(config.issuer));
  const response = await fetchImplementation(discoveryUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`OAuth discovery returned HTTP ${response.status}.`);
  const discovery = await response.json() as OpenIdDiscovery;
  if (discovery.issuer !== config.issuer) throw new Error("OAuth issuer discovery mismatch.");
  if (typeof discovery.jwks_uri !== "string") throw new Error("OAuth discovery does not publish a JWKS endpoint.");
  if (
    !Array.isArray(discovery.code_challenge_methods_supported)
    || !discovery.code_challenge_methods_supported.includes("S256")
  ) {
    throw new Error("OAuth authorization server does not advertise PKCE S256.");
  }

  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  return async (token: string) => {
    const result = await jwtVerify(token, jwks, {
      issuer: config.issuer,
      audience: config.audiences,
      algorithms: ["RS256", "ES256"],
      clockTolerance: 5,
    });
    return result.payload;
  };
}

function tokenScopes(payload: JWTPayload) {
  const value = payload.scope ?? payload.scp;
  if (typeof value === "string") return [...new Set(value.split(/\s+/).filter(Boolean))];
  if (Array.isArray(value) && value.every((scope) => typeof scope === "string")) {
    return [...new Set(value)];
  }
  return [];
}

function requiredClaim(value: unknown, maximumLength: number) {
  const claim = optionalClaim(value);
  if (!claim || claim.length > maximumLength) throw new Error("Required OAuth identity claim is missing.");
  return claim;
}

function optionalClaim(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
