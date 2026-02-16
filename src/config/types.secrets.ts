export type KmsMachineIdentityConfig = {
  /** Machine identity client id for universal auth login. */
  clientId?: string;
  /** Machine identity client secret for universal auth login. */
  clientSecret?: string;
};

export type KmsSecretsConfig = {
  /** KMS base URL (defaults to https://kms.hanzo.ai). */
  siteUrl?: string;
  /** Tenant org slug metadata (optional, for policy/audit context). */
  orgSlug?: string;
  /** Project/workspace id. */
  projectId?: string;
  /** Project/workspace slug. */
  projectSlug?: string;
  /** Environment slug (for example: dev, staging, prod). */
  environment?: string;
  /** Secret folder path (defaults to /). */
  secretPath?: string;
  /** Optional pre-issued KMS access token. */
  accessToken?: string;
  /** Machine identity credentials for universal auth. */
  machineIdentity?: KmsMachineIdentityConfig;
  /** Cache TTL for resolved secret values. Default: 15000 ms. */
  cacheTtlMs?: number;
  /** Network timeout for KMS API calls. Default: 10000 ms. */
  requestTimeoutMs?: number;
};

export type SecretsConfig = {
  /** Secret backend mode. \"kms\" enables KMS reference resolution. */
  backend?: "local" | "kms";
  kms?: KmsSecretsConfig;
};
