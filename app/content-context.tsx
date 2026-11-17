import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { learningAreas, projectBriefs } from "./data";
import { defaultContentResources } from "./content-defaults";
import { mergeManagedCatalog, type ManagedCatalog, type ManagedContentEntry } from "./content-catalog";
import { watchManagedContent } from "./content-firebase";
import type { AuthSession } from "./firebase";

type ContentCatalogContextValue = ManagedCatalog & {
  entries: ManagedContentEntry[];
  loading: boolean;
  error: string;
};

const baselines = { learningAreas, projectBriefs, resources: defaultContentResources };
const bundledCatalog = mergeManagedCatalog(baselines, []);
const ContentCatalogContext = createContext<ContentCatalogContextValue>({ ...bundledCatalog, entries: [], loading: false, error: "" });

export function ContentProvider({ session, children }: { session: AuthSession | null; children: ReactNode }) {
  const [entries, setEntries] = useState<ManagedContentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canRead = !!session?.user.emailVerified && session.profile.active;

  useEffect(() => {
    let stopped = false;
    setEntries([]);
    setError("");
    if (!session || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = watchManagedContent(session.profile, (next) => {
      if (stopped) return;
      setEntries(next);
      setLoading(false);
    }, (message) => {
      if (stopped) return;
      setEntries([]);
      setError(message);
      setLoading(false);
    });
    return () => { stopped = true; unsubscribe(); };
  }, [session?.profile.uid, session?.profile.active, session?.profile.role, canRead]);

  const value = useMemo<ContentCatalogContextValue>(() => ({
    ...mergeManagedCatalog(baselines, canRead ? entries : []),
    entries: canRead ? entries : [], loading: canRead && loading, error: canRead ? error : "",
  }), [canRead, entries, loading, error]);

  return <ContentCatalogContext.Provider value={value}>{children}</ContentCatalogContext.Provider>;
}

export function useContentCatalog() {
  return useContext(ContentCatalogContext);
}
