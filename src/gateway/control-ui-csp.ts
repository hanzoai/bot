export function buildControlUiCspHeader(iamServerUrl?: string): string {
  // Control UI: block framing, block inline scripts, keep styles permissive
  // (UI uses a lot of inline style attributes in templates).
  // When IAM mode is active, allow fetch to the IAM server for OIDC discovery
  // and token exchange (BrowserIamSdk talks to IAM directly via PKCE).
  let connectSrc = "'self' ws: wss:";
  if (iamServerUrl) {
    try {
      connectSrc += ` ${new URL(iamServerUrl).origin}`;
    } catch {
      // Invalid URL — skip.
    }
  }
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
  ].join("; ");
}
