import { useEffect, useState, type ReactNode } from "react";

export type UserRole = "applicant" | "officer";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
}

interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

interface AuthPayload {
  access_token: string;
  user: AuthUser;
}

const SESSION_KEY = "crediadapt-session";
const API_BASE_URL = (import.meta.env["VITE_API_BASE_URL"] || "http://localhost:8000").replace(/\/$/, "");

function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(payload: AuthPayload) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ accessToken: payload.access_token, user: payload.user }),
  );
}

function clearSession() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
}

async function errorFrom(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: string };
    return new Error(body.detail || `Request failed (${response.status}).`);
  } catch {
    return new Error(`Request failed (${response.status}).`);
  }
}

async function refreshSession(): Promise<AuthSession | null> {
  const response = await fetch(apiUrl("/api/auth/refresh"), {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    clearSession();
    return null;
  }
  const payload = (await response.json()) as AuthPayload;
  saveSession(payload);
  return { accessToken: payload.access_token, user: payload.user };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const makeRequest = async (token?: string) => {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(apiUrl(path), { ...init, headers, credentials: "include" });
  };

  const session = getSession();
  let response = await makeRequest(session?.accessToken);
  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) response = await makeRequest(refreshed.accessToken);
  }
  if (!response.ok) throw await errorFrom(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function signIn(email: string, password: string, role: UserRole) {
  const payload = await apiRequest<AuthPayload>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
  saveSession(payload);
  return payload.user;
}

export async function registerApplicant(email: string, password: string, fullName: string) {
  const payload = await apiRequest<AuthPayload>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  saveSession(payload);
  return payload.user;
}

export async function signOut() {
  try {
    await apiRequest<void>("/api/auth/logout", { method: "POST" });
  } finally {
    clearSession();
  }
}

export function RequireAuth({ role, children }: { role?: UserRole; children: (user: AuthUser) => ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const currentUser = await apiRequest<AuthUser>("/api/auth/me");
        if (!active) return;
        if (role && currentUser.role !== role) {
          window.location.replace(currentUser.role === "officer" ? "/officer/queue" : "/applications");
          return;
        }
        setUser(currentUser);
      } catch {
        if (active) window.location.replace(role === "officer" ? "/officer/login" : "/login");
      } finally {
        if (active) setChecked(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [role]);

  if (!checked || !user) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Checking your session…</div>;
  }
  return <>{children(user)}</>;
}
