import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      // On first sign-in after email confirmation, sync TOS acceptance metadata
      // from auth user_metadata (stored at signup) into user_profiles.
      if (event === "SIGNED_IN" && session?.user) {
        const user = session.user;
        const meta = user.user_metadata || {};
        if (meta.tos_accepted_at) {
          try {
            const { data: profile } = await supabase
              .from("user_profiles")
              .select("tos_accepted_at")
              .eq("id", user.id)
              .single();
            if (profile && !profile.tos_accepted_at) {
              await supabase.from("user_profiles").update({
                tos_accepted_at: meta.tos_accepted_at,
                tos_accepted_ip: meta.tos_accepted_ip || null,
                tos_version: meta.tos_version || "1.0",
              }).eq("id", user.id);
            }
          } catch (_) {}
        }
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
  };
}