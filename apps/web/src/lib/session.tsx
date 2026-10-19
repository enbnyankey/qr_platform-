"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "./api";

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  brandColor: string;
  logoUrl: string | null;
  currency: string;
  status: string;
  role: string;
}
export interface Me {
  user: { id: string; email: string; fullName: string; isSuperAdmin: boolean };
  organizations: OrgSummary[];
}

const ORG_KEY = "qr.currentOrg";

export function useMe() {
  return useSWR<Me>("/auth/me", fetcher, { shouldRetryOnError: false, revalidateOnFocus: false });
}

interface SessionValue {
  me: Me;
  org: OrgSummary;
  setOrgId: (id: string) => void;
  refresh: () => Promise<unknown>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ me, refresh, children }: { me: Me; refresh: () => Promise<unknown>; children: React.ReactNode }) {
  const [orgId, setOrgIdState] = useState<string | null>(null);
  useEffect(() => {
    try {
      setOrgIdState(localStorage.getItem(ORG_KEY));
    } catch {
      /* storage unavailable */
    }
  }, []);
  const org = useMemo(() => me.organizations.find((o) => o.id === orgId) ?? me.organizations[0], [me, orgId]);
  const setOrgId = (id: string) => {
    setOrgIdState(id);
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {
      /* ignore */
    }
  };
  return <SessionContext.Provider value={{ me, org, setOrgId, refresh }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside the app shell");
  return v;
}

export const canEdit = (role: string) => ["business_owner", "manager", "super_admin"].includes(role);
