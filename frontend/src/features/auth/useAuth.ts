import { useCallback, useEffect, useSyncExternalStore } from "react";
import api from "@/lib/api";
import { getToken, setToken } from "@/lib/authToken";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  peopleId: string | null;
  roles: string[];
}

interface AuthState {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
}

let state: AuthState = {
  user: null,
  status: getToken() ? "loading" : "unauthenticated",
};

const listeners = new Set<() => void>();

function setState(next: Partial<AuthState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

let hydrationStarted = false;

async function hydrate() {
  if (hydrationStarted) return;
  hydrationStarted = true;

  const token = getToken();
  if (!token) {
    setState({ status: "unauthenticated", user: null });
    return;
  }

  try {
    const { data } = await api.get<AuthUser>("/auth/me");
    setState({ user: data, status: "authenticated" });
  } catch {
    setToken(null);
    setState({ user: null, status: "unauthenticated" });
  }
}

export function useAuth() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    hydrate();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await api.post<{ token: string; user: AuthUser }>(
      "/auth/login",
      { username, password }
    );
    setToken(data.token);
    setState({ user: data.user, status: "authenticated" });
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // token is cleared client-side regardless of network failure
    }
    setToken(null);
    setState({ user: null, status: "unauthenticated" });
  }, []);

  return {
    user: snapshot.user,
    roles: snapshot.user?.roles ?? [],
    isAuthenticated: snapshot.status === "authenticated",
    isLoading: snapshot.status === "loading",
    login,
    logout,
  };
}
