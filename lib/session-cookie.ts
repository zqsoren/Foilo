// A TLS-terminating proxy can forward production traffic to a loopback listener.
// Require the local preview to opt in, as well as a loopback listener and request.
export function sessionCookiePolicy(
  production: boolean,
  previewEnabled: boolean,
  bindAddress: string | undefined,
  host: string | null,
  forwardedProtocol: string | null,
) {
  const localPreview = previewEnabled
    && ["127.0.0.1", "::1", "localhost"].includes(bindAddress ?? "")
    && /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i.test(host ?? "")
    && (!forwardedProtocol || forwardedProtocol.trim().toLowerCase() === "http");

  return localPreview
    ? { name: "life_session_local_preview", secure: false }
    : { name: "life_session", secure: production };
}
