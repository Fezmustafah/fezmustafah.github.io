// AuthProvider — wraps the app, tracks the Supabase session, and mirrors the
// user id into authState so the storage facade can pick cloud vs local.
import { createContext, useContext, useEffect, useState } from "react";
import { supabase, cloudEnabled } from "../lib/supabase.js";
import { setUserId } from "../lib/authState.js";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!cloudEnabled);

  useEffect(() => {
    if (!cloudEnabled) return;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user || null;
      setUser(u);
      setUserId(u?.id || null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user || null;
      setUser(u);
      setUserId(u?.id || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    user,
    ready,
    cloudEnabled,
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: "google",
        // return to THIS page (the app lives at /app/, not the site root).
        // strip any hash/query so Supabase appends its token fragment cleanly.
        options: { redirectTo: window.location.origin + window.location.pathname },
      }),
    signOut: () => supabase.auth.signOut(),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
