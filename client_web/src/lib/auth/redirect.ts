// Redirect after login.

const DEFAULT_PATH_AFTER_LOGIN = "/dashboard";

export function safeRedirectPath(next: string | null | undefined): string {
  if (!next) {
    return DEFAULT_PATH_AFTER_LOGIN;
  }
  // Must be a path of this site, so it must start with a single "/"
  const isRelativePath = next.startsWith("/");
  // A protocol-relative URL starts with "//"
  const isProtocolRelative = next.startsWith("//");
  // Some browsers normalise "\" into "/",
  const containsBackslash = next.includes("\\");

  if (!isRelativePath || isProtocolRelative || containsBackslash) {
    return DEFAULT_PATH_AFTER_LOGIN;
  }
  // Sending the user back to the login page after logging in would loop.
  if (next === "/login" || next.startsWith("/login?")) {
    return DEFAULT_PATH_AFTER_LOGIN;
  }
  return next;
}

/* Builds the login URL that remembers the page the user wanted. */
export function loginPathFor(currentPath: string): string {
  return `/login?next=${encodeURIComponent(currentPath)}`;
}
