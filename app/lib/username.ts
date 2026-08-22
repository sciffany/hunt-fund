const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

const RESERVED = new Set([
  "admin",
  "api",
  "auth",
  "group",
  "groups",
  "home",
  "invite",
  "invites",
  "login",
  "me",
  "new",
  "onboarding",
  "settings",
  "signin",
  "signout",
  "signup",
  "user",
  "users",
]);

export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return "Use 3–20 characters. Start with a letter; then letters, numbers, or underscores.";
  }
  if (RESERVED.has(username)) {
    return "That username is reserved.";
  }
  return null;
}

export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 50) {
    return "Display name must be 1–50 characters.";
  }
  return null;
}

export function validateGroupName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return "Group name must be 1–80 characters.";
  }
  return null;
}
