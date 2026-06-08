// src/hooks/useRegionAccess.js
// tier values in user_profiles: "trial" | "standard" | "pro"
// isPro = trial or pro (trial gets full Pro access for 14 days)
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_REGION } from "@/config/regionConfig";

export function useRegionAccess() {
  const [permittedRegions, setPermittedRegions] = useState([]);
  const [region,           setRegion]           = useState(DEFAULT_REGION);
  const [daysLeft,         setDaysLeft]         = useState(null);
  const [isExpired,        setIsExpired]        = useState(false);
  const [tier,             setTier]             = useState("standard");
  const [isPro,            setIsPro]            = useState(false);
  const [loading,          setLoading]          = useState(true);
  const [isAuthenticated,  setIsAuthenticated]  = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data: authData, error: userError } = await supabase.auth.getUser();
        const user = authData?.user;

        if (userError || !user || !user.email) {
          console.warn("[useRegionAccess] No authenticated user.");
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }

        setIsAuthenticated(true);

        const { data: profile, error: profileError } = await supabase
          .from("user_profiles")
          .select("tier, region, subscription_status, trial_end")
          .eq("id", user.id)
          .single();

        if (profileError || !profile) {
          // No profile yet — give Pro access so new users get full trial
          console.warn("[useRegionAccess] No user_profiles row — defaulting to trial.");
          setPermittedRegions([DEFAULT_REGION]);
          setRegion(DEFAULT_REGION);
          setDaysLeft(14);
          setIsExpired(false);
          setTier("trial");
          setIsPro(true);
          setLoading(false);
          return;
        }

        const permitted = profile.region ? [profile.region] : [DEFAULT_REGION];
        setPermittedRegions(permitted);
        setRegion(permitted[0]);

        // Use the actual tier column: "trial" | "standard" | "pro"
        const profileTier = profile.tier ?? "standard";
        setTier(profileTier);
        setIsPro(profileTier === "pro" || profileTier === "trial");

        // Trial countdown
        if (profileTier === "trial") {
          if (profile.trial_end) {
            const msLeft = new Date(profile.trial_end) - new Date();
            const days   = Math.max(0, Math.ceil(msLeft / 86400000));
            setDaysLeft(days);
            setIsExpired(days === 0);
            if (days === 0) setIsPro(false); // trial expired → downgrade to standard
          } else {
            setDaysLeft(14);
            setIsExpired(false);
          }
        } else if (profile.subscription_status === "cancelled") {
          setIsExpired(true);
          setIsPro(false);
        } else {
          setDaysLeft(null);
          setIsExpired(false);
        }

      } catch (err) {
        console.error("[useRegionAccess] error:", err);
        const isAuthError = err?.name === "AuthSessionMissingError"
          || err?.message?.toLowerCase().includes("session")
          || err?.message?.toLowerCase().includes("auth");
        if (isAuthError) {
          setIsAuthenticated(false);
        } else {
          // Unexpected error — give standard access
          setIsAuthenticated(true);
          setPermittedRegions([DEFAULT_REGION]);
          setRegion(DEFAULT_REGION);
          setTier("standard");
          setIsPro(false);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { permittedRegions, isExpired, tier, isPro, loading, region, daysLeft, isAuthenticated };
}
