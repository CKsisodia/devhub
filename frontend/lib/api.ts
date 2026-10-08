"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; form?: FormData };

/** Same-origin JSON fetch; the httpOnly session cookie is sent automatically. */
export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    credentials: "include",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Session gone (expired, revoked or user deactivated): AuthGate listens and sends the user to /login.
    if (res.status === 401 && !path.startsWith("/api/auth/") && typeof window !== "undefined") window.dispatchEvent(new Event("devhub:unauthorised"));
    throw new ApiError(res.status, (data as { error?: string; message?: string }).error ?? (data as { message?: string }).message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);
