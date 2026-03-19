import { createRemoteJWKSet, jwtVerify } from "jose";

export interface IAMAuthConfig {
  issuer: string;
  audience: string;
  jwksUri: string;
}

const DEFAULT_IAM_CONFIG: IAMAuthConfig = {
  issuer: "https://hanzo.id",
  audience: "hanzo-bot",
  jwksUri: "https://hanzo.id/.well-known/jwks.json",
};

export interface IAMTokenPayload {
  sub: string | undefined;
  email: string | undefined;
  teams: string[];
  tier: string;
}

export async function verifyIAMToken(
  token: string,
  config?: Partial<IAMAuthConfig>,
): Promise<IAMTokenPayload> {
  const cfg = { ...DEFAULT_IAM_CONFIG, ...config };
  const JWKS = createRemoteJWKSet(new URL(cfg.jwksUri));
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: cfg.issuer,
    audience: cfg.audience,
  });
  return {
    sub: payload.sub,
    email: payload.email as string | undefined,
    teams: (payload.teams ?? []) as string[],
    tier: (payload.tier ?? "free") as string,
  };
}
