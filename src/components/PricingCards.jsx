// src/components/PricingCards.jsx
//
// Shared Standard/Pro pricing card UI. Used by both LandingPage.jsx (the
// marketing pricing section) and UpgradePage.jsx (the live /upgrade
// checkout page) so the two surfaces render the identical card -- same
// markup, same "rl-" classes -- not just the same feature copy (see
// src/data/pricingFeatures.js for the bullet lists themselves). Whatever
// page renders these must have already called injectRlGlobalCss() from
// src/styles/riplocBrandCss.js so the rl- classes resolve to something.

import React from "react";
import { STANDARD_FEATURES, PRO_FEATURES } from "@/data/pricingFeatures";

export function StandardPricingCard({ price, priceUnit, note, ctaLabel, onCta, ctaDisabled }) {
  return (
    <div className="rl-card free">
      <div className="rl-tier lt">Standard</div>
      <div className="rl-amt">
        <span className="rl-num lt">{price}</span>
        <span className="rl-per lt">&nbsp;{priceUnit}</span>
      </div>
      <div className="rl-pnote lt">{note}</div>
      <div className="rl-div lt" />
      <ul className="rl-feats">
        {STANDARD_FEATURES.map(f => (
          <li key={f} className="rl-feat-li lt"><span className="chk">✓</span>{f}</li>
        ))}
      </ul>
      <button className="rl-pcta lt" onClick={onCta} disabled={ctaDisabled}>{ctaLabel}</button>
    </div>
  );
}

// `children` renders whatever goes below the feature list on the Pro card --
// a single CTA button on the landing page, or a CTA button that expands into
// an inline auth form on the /upgrade page. Kept as children rather than a
// fixed prop shape since the two pages' CTA areas genuinely behave differently.
export function ProPricingCard({ badge, price, priceUnit, note, children }) {
  return (
    <div className="rl-card pro">
      {badge && <div className="rl-pbadge">{badge}</div>}
      <div className="rl-tier dk">Pro</div>
      <div className="rl-amt">
        <span className="rl-num dk">{price}</span>
        <span className="rl-per dk">&nbsp;{priceUnit}</span>
      </div>
      <div className="rl-pnote dk">{note}</div>
      <div className="rl-div dk" />
      <ul className="rl-feats">
        {PRO_FEATURES.map(f => (
          <li key={f} className="rl-feat-li dk"><span className="chk">✓</span>{f}</li>
        ))}
      </ul>
      {children}
    </div>
  );
}
