// AuthProvider — wraps the app, tracks the Supabase session, and mirrors the
// user id into authState so the storage facade can pick cloud vs local.
import { createContext, useContext, useEffect, useState } from "react";
import { supabase, cloudEnabled } from "../lib/supabase.js";
import { setUserId } from "../lib/authState.js";
import { isGuest, startGuest, endGuest } from "../lib/guest.js";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!cloudEnabled);
  const [guest, setGuest] = useState(() => isGuest());

  useEffect(() => {
    if (!cloudEnabled) return;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user || null;
      setUser(u);
      setUserId(u?.id || null);
      setReady(true);
      // after an OAuth redirect, strip ?code= / #access_token from the URL so a
      // reload doesn't try to re-exchange a spent code.
      if (u && /[?#].*(code=|access_token=)/.test(window.location.href)) {
        window.history.replaceState({}, "", window.location.origin + window.location.pathname);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user || null;
      setUser(u);
      setUserId(u?.id || null);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    user,
    ready,
    cloudEnabled,
    guest,
    continueAsGuest: () => { startGuest(); setGuest(true); },
    exitGuest: () => { endGuest(); setGuest(false); },
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
