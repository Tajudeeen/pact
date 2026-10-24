import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
interface Config {
  name: string;
  chainId: number;
  testnetEnabled: boolean;
  operator: string | null;
  allowedOwner?: string | null;
  protection: string;
  heartbeatAt: number | null;
  liveMaxNotional: string;
}
interface Session {
  owner: string;
  mode: "replay" | "testnet";
}
interface AppState {
  session: Session | null;
  config: Config | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  practice: () => Promise<void>;
  logout: () => Promise<void>;
}
const State = createContext<AppState>(null!);
export const useApp = () => useContext(State);
export function Provider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    try {
      const [s, c] = await Promise.all([
        api<{ session: Session | null }>("/session"),
        api<Config>("/config"),
      ]);
      setSession(s.session);
      setConfig(c);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const practice = async () => {
    await api("/auth/practice", { method: "POST", body: {} });
    await refresh();
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST", body: {} });
    setSession(null);
  };
  useEffect(() => {
    const p = window.ethereum;
    if (!p?.on) return;
    const changed = () => {
      setSession(null);
      void api("/auth/logout", { method: "POST", body: {} }).catch(() => {});
    };
    p.on("accountsChanged", changed);
    p.on("chainChanged", changed);
    return () => {
      p.removeListener?.("accountsChanged", changed);
      p.removeListener?.("chainChanged", changed);
    };
  }, []);
  return (
    <State.Provider
      value={{ session, config, loading, error, refresh, practice, logout }}
    >
      {children}
    </State.Provider>
  );
}
export function useLoad<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  poll = 0,
) {
  const [value, setValue] = useState<T | null>(null),
    [error, setError] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setValue(null);
    setError(null);
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const v = await load(controller.signal);
        if (!stopped) {
          setValue(v);
          setError(null);
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
      if (poll && !stopped) timer = setTimeout(() => void run(), poll);
    };
    void run();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, revision, poll]);
  return { value, error, reload: () => setRevision((v) => v + 1) };
}
declare global {
  interface Window {
    ethereum?: {
      request: (args: {
        method: string;
        params?: unknown[];
      }) => Promise<unknown>;
      on?: (name: string, fn: () => void) => void;
      removeListener?: (name: string, fn: () => void) => void;
    };
  }
}
