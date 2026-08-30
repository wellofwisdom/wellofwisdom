// SPDX-License-Identifier: AGPL-3.0-or-later
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error || `http_${res.status}`;
    throw new ApiError(code, res.status);
  }
  return data as T;
}

const NICE: Record<string, string> = {
  email_taken: "That email already has an account. Try signing in instead.",
  email_invalid: "That email address doesn't look right.",
  password_too_short: "Password needs at least 8 characters.",
  invalid_credentials: "That didn't match. Check it and try again.",
  too_many_attempts: "Too many tries. Wait a few minutes and try again.",
  invite_invalid: "That invite code isn't right. Ask the person who runs this server.",
  username_taken: "That username is taken in your family. Pick another.",
  username_invalid: "Usernames: 2-24 letters/numbers, no spaces.",
  pin_invalid: "PIN is 4 to 6 digits.",
  family_name_required: "Give your family or school a name.",
  name_required: "A name is required.",
  grade_invalid: "Grade must be between 1 and 14.",
};

export function niceError(err: unknown): string {
  if (err instanceof ApiError) return NICE[err.code] || `Something went wrong (${err.code}).`;
  return "Could not reach the server. Check your connection.";
}
