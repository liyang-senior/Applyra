const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readName(
  body: unknown,
): { name: string } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Enter a name." };
  }

  const record = body as Record<string, unknown>;
  if (typeof record.name !== "string" || record.name.trim() === "") {
    return { error: "Enter a name." };
  }

  const name = record.name.trim().replace(/\s+/g, " ");
  if (name.length > 80) {
    return { error: "Use a name of at most 80 characters." };
  }

  return { name };
}

export function readEmail(
  body: unknown,
): { email: string } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Enter an email address." };
  }

  const record = body as Record<string, unknown>;
  if (typeof record.email !== "string" || record.email.trim() === "") {
    return { error: "Enter an email address." };
  }

  const email = record.email.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) {
    return { error: "Enter a valid email address." };
  }

  return { email };
}

export function readOptionalPassword(
  body: unknown,
): { password?: string } | { error: string } {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  if (record.password === undefined || record.password === "") return {};
  if (typeof record.password !== "string") {
    return { error: "Enter a password." };
  }
  if (record.password.length < 8 || record.password.length > 128) {
    return { error: "Use a password of at least 8 characters." };
  }
  return { password: record.password };
}

export function readCredentials(
  body: unknown,
): { email: string; password: string } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Enter an email address and password." };
  }

  const email = readEmail(body);
  if ("error" in email) return email;

  const record = body as Record<string, unknown>;
  if (typeof record.password !== "string" || record.password.length === 0) {
    return { error: "Enter a password." };
  }

  if (record.password.length < 8 || record.password.length > 128) {
    return { error: "Use a password of at least 8 characters." };
  }

  return { email: email.email, password: record.password };
}
