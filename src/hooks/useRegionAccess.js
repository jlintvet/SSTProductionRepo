// src/hooks/useRegionAccess.js
// tier values in user_profiles: "trial" | "standard" | "pro" | "ambassador" | "referral"
// isPro = trial, pro, ambassador, or referral (trial gets full Pro access for 30 days)
// ambassador = permanent pro-equivalent; no expiry, no countdown
// referral = redeemed an ambassador's referral code; full Pro access for 365 days
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_REGION } from "@/config/regionConfig";

// Allow the Vercel preview branch to force a specific region without
// changing the user's Supabase profile. Set VITE_FORCE_REGION=ga_sc
// in Vercel -> Project Settings -> Environment Variables (Preview only).
const _FORCE_REGION = import.meta.env.VITE_FORCE_REGION ?? "";

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
          .select("tier, region, subscription_status, trial_end, referral_end")
          .eq("id", user.id)
          .single();

        if (profileError || !profile) {
          // No profile yet — give Pro access so new users get full trial
          console.warn("[useRegionAccess] No user_profiles row — defaulting to trial.");
          setPermittedRegions([DEFAULT_REGION]);
          setRegion(DEFAULT_REGION);
          setDaysLeft(30);
          setIsExpired(false);
          setTier("trial");
          setIsPro(true);
          setLoading(false);
          return;
        }

        const permitted = profile.region ? [profile.region] : [DEFAULT_REGION];
        setPermittedRegions(permitted);
        setRegion(_FORCE_REGION || permitted[0]);

        // Use the actual tier column: "trial" | "standard" | "pro"
        const profileTier = profile.tier ?? "standard";
        setTier(profileTier);
        setIsPro(profileTier === "pro" || profileTier === "trial" || profileTier === "ambassador" || profileTier === "referral");

        // Trial countdown
        if (profileTier === "trial") {
          if (profile.trial_end) {
            const msLeft = new Date(profile.trial_end) - new Date();
            const days   = Math.max(0, Math.ceil(msLeft / 86400000));
            setDaysLeft(days);
            setIsExpired(days === 0);
            if (days === 0) setIsPro(false); // trial expired → downgrade to standard
          } else {
            setDaysLeft(30);
            setIsExpired(false);
          }
        } else if (profileTier === "ambassador") {
          // Ambassadors get permanent pro access — no expiry
          setDaysLeft(null);
          setIsExpired(false);
        } else if (profileTier === "referral") {
          // Redeemed an ambassador code — full Pro access for 365 days from redemption.
          // Computed client-side, same pattern as trial — no scheduled job flips this
          // back to "standard" in the DB when it lapses.
          if (profile.referral_end) {
            const msLeft = new Date(profile.referral_end) - new Date();
            const days   = Math.max(0, Math.ceil(msLeft / 86400000));
            setDaysLeft(days);
            setIsExpired(days === 0);
            if (days === 0) setIsPro(false);
          } else {
            setDaysLeft(365);
            setIsExpired(false);
          }
        } else if (profileTier === "pro" && profile.subscription_status === "cancelled") {
          // Only a real Pro subscriber can be "cancelled" -- standard (and any
          // other non-billing tier) has no subscription to cancel, so a stale
          // subscription_status value left over from unrelated testing must
          // never block them. This scoping is what confirm_standard_tier()
          // relies on staying correct.
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
