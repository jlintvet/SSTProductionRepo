// src/pages/TermsPage.jsx
// Publicly accessible at /terms — no auth required.

import React from "react";

function Section({ number, title, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 10px", borderBottom: "1px solid #e2e8f0", paddingBottom: 6 }}>
        {number}. {title}
      </h2>
      <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

function P({ children }) {
  return <p style={{ margin: "0 0 10px" }}>{children}</p>;
}

function Warning({ children }) {
  return (
    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 12, color: "#991b1b", fontWeight: 600, lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <a href="/" style={{ fontSize: 13, color: "#0e7490", textDecoration: "none", fontWeight: 500 }}>
          &larr; Back to RipLoc
        </a>
        <span style={{ color: "#cbd5e1" }}>|</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>RipLoc</span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Title block */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", margin: "0 0 6px" }}>Terms and Conditions</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>RipLoc LLC &nbsp;&middot;&nbsp; Effective July 9, 2026 &nbsp;&middot;&nbsp; Version 1.0</p>
        </div>

        <Section number="1" title="Agreement to These Terms">
          <P>These Terms and Conditions (&ldquo;Terms&rdquo;) constitute a legally binding agreement between you and <strong>RipLoc LLC</strong>, a Virginia limited liability company (&ldquo;RipLoc,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), governing your access to and use of the RipLoc application, website, and all related services (collectively, the &ldquo;Service&rdquo;).</P>
          <P>By creating an account, checking the acceptance box at registration, or otherwise accessing or using the Service, you confirm that you have read, understood, and agree to be bound by these Terms. <strong>If you do not agree, do not create an account or use the Service.</strong></P>
          <P>Your acceptance is recorded electronically at the time of signup, including the date and time of acceptance, the version of these Terms in effect, and your IP address.</P>
        </Section>

        <Section number="2" title="Eligibility">
          <P>You must be at least <strong>18 years of age</strong> to use the Service. By creating an account, you represent and warrant that you are 18 or older and have the legal capacity to enter into a binding contract. RipLoc does not knowingly collect information from or direct the Service to persons under 18. If we learn that a user is under 18, we will terminate the account immediately.</P>
        </Section>

        <Section number="3" title="Maritime Safety Disclaimer">
          <Warning>
            WARNING: RipLoc provides oceanographic data, weather forecasts, and fishing information for general reference purposes ONLY. This information MUST NOT be used as the sole basis for decisions about offshore navigation, boating, diving, or any maritime activity. Conditions at sea can change rapidly. Always consult official NOAA forecasts, U.S. Coast Guard advisories, and qualified marine professionals before going offshore. You assume ALL risk associated with any decision made using the Service.
          </Warning>
          <P>RipLoc is not a maritime navigation service, a weather forecasting authority, or a substitute for professional seamanship judgment. Sea surface temperature (SST), marine weather forecasts, tide predictions, bathymetric charts, and all other data are provided as informational aids only. None of this constitutes a guarantee of conditions, fish presence, or safe passage.</P>
          <P>You expressly acknowledge that offshore and nearshore maritime activities carry inherent risks including but not limited to: injury, death, vessel damage, and property loss. RipLoc shall have no liability whatsoever for any injury, loss, or damage arising from your use of, or reliance on, any information provided by the Service.</P>
        </Section>

        <Section number="4" title="Data Accuracy Disclaimer">
          <P>All data displayed in the Service &mdash; including satellite-derived sea surface temperature (SST), chlorophyll concentration, ocean altimetry, VIIRS composite imagery, NOAA marine weather forecasts, NOAA CO-OPS tide predictions, and NWS forecasts &mdash; is sourced from third-party providers including NOAA, NASA, and other government agencies.</P>
          <P>RipLoc makes no representations or warranties regarding the accuracy, completeness, reliability, timeliness, or fitness for any particular purpose of any data displayed. Data may be delayed, incomplete, or unavailable due to cloud cover, satellite timing, processing latency, or third-party outages. <strong>The Service is provided &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE.&rdquo;</strong></P>
        </Section>

        <Section number="5" title="Subscriptions, Billing, and Cancellation">
          <P><strong>Auto-Renewal.</strong> Paid subscriptions automatically renew at the end of each billing cycle at the then-current rate unless you cancel before the renewal date. By purchasing a subscription, you authorize RipLoc to charge your payment method on a recurring basis until you cancel.</P>
          <P><strong>No Refunds.</strong> All subscription fees are non-refundable. There are no refunds or credits for partial periods, unused features, or account termination. If you cancel, you retain access through the end of your current paid period.</P>
          <P><strong>Price Changes.</strong> RipLoc reserves the right to change subscription pricing. We will provide at least 30 days&rsquo; advance notice of any price increase via email or in-app notification. Continued use after a price change constitutes acceptance of the new pricing.</P>
          <P><strong>Payment Processing.</strong> All payments are processed by Stripe, Inc. RipLoc does not store your full credit card number. You are responsible for maintaining valid payment information in your account.</P>
          <P><strong>Free Trials.</strong> If you receive a free trial, your subscription will automatically convert to a paid subscription at the end of the trial period unless you cancel before the trial ends.</P>
        </Section>

        <Section number="6" title="Ambassador and Referral Program">
          <P>RipLoc may offer an Ambassador Program and referral incentives at its sole discretion. Ambassador status and referral benefits have no cash value and are not transferable. RipLoc reserves the right to modify, suspend, or terminate the Ambassador Program or any referral benefit at any time, for any reason, including fraud, abuse, or violation of these Terms.</P>
          <P>Ambassador codes may not be used for self-referral or distributed in a manner that constitutes spam or misrepresentation. RipLoc may revoke Ambassador status and any accrued benefits if a code has been misused.</P>
        </Section>

        <Section number="7" title="Community Reports and User-Generated Content">
          <P><strong>Your Content.</strong> You retain ownership of User Content you submit (community pins, reports). By submitting, you grant RipLoc a non-exclusive, worldwide, royalty-free license to display, reproduce, and distribute that content within the Service.</P>
          <P><strong>Accuracy and Responsibility.</strong> You are solely responsible for the accuracy of User Content. You agree not to post false, misleading, or fabricated location or fishing data. Submitting false reports that could endanger others at sea may violate applicable law.</P>
          <P><strong>Moderation.</strong> RipLoc reserves the right to review, edit, or remove any User Content at any time without notice. Points awarded for community reports have no cash value, are not redeemable, and are not transferable.</P>
        </Section>

        <Section number="8" title="Account Suspension and Termination">
          <P>RipLoc reserves the right to suspend or permanently terminate your account, with or without notice, for any violation of these Terms, suspected fraud, abuse, or conduct harmful to the Service or other users. No subscription refund will be issued upon termination for cause.</P>
          <P>You may terminate your account at any time by contacting us at <strong>support@riploc.app</strong>.</P>
        </Section>

        <Section number="9" title="Intellectual Property">
          <P>All content, features, and functionality of the Service &mdash; including software, text, graphics, logos, and data visualizations &mdash; are owned by RipLoc LLC or its licensors and protected by applicable intellectual property laws. You may not copy, modify, distribute, sell, or create derivative works from any part of the Service without express written consent.</P>
        </Section>

        <Section number="10" title="Privacy and Data Collection">
          <P><strong>Account Information:</strong> Email address and display name provided at registration.</P>
          <P><strong>Preferences:</strong> Selected departure location and app settings stored in your user profile.</P>
          <P><strong>Payment Information:</strong> Subscription tier and billing history. Full card data is handled exclusively by Stripe and is not stored by RipLoc.</P>
          <P><strong>Acceptance Record:</strong> Date, time, IP address, and Terms version number recorded at acceptance, for legal compliance.</P>
          <P><strong>Usage Data:</strong> Standard server logs and analytics. We do not sell your personal information to third parties.</P>
        </Section>

        <Section number="11" title="U.S. State Privacy Rights">
          <P><strong>California (CCPA/CPRA):</strong> California residents have the right to know what personal information we collect, the right to delete it, the right to opt out of sale or sharing (we do not sell personal information), the right to correct inaccurate information, and the right to non-discrimination for exercising these rights.</P>
          <P><strong>Virginia (VCDPA), Colorado (CPA), Connecticut (CTDPA), and Similar States:</strong> Residents have rights including access to, correction of, deletion of, and portability of personal data, as well as the right to opt out of targeted advertising and profiling.</P>
          <P>To exercise any of the above rights, contact us at <strong>privacy@riploc.app</strong>. We will respond within the timeframe required by applicable law (generally 45 days). We may need to verify your identity before processing your request.</P>
        </Section>

        <Section number="12" title="Limitation of Liability">
          <P>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RIPLOC LLC, ITS MEMBERS, OFFICERS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING LOSS OF PROFITS, LOSS OF DATA, PERSONAL INJURY, DEATH, OR PROPERTY DAMAGE, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE OR RELIANCE ON ANY DATA PROVIDED THEREIN.</P>
          <P>RIPLOC&rsquo;S TOTAL CUMULATIVE LIABILITY SHALL NOT EXCEED THE GREATER OF (A) SUBSCRIPTION FEES PAID BY YOU IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100.00).</P>
        </Section>

        <Section number="13" title="Indemnification">
          <P>You agree to indemnify and hold harmless RipLoc LLC and its members, officers, employees, and agents from any claims, liabilities, damages, losses, and expenses (including attorneys&rsquo; fees) arising from: (a) your use of the Service; (b) your violation of these Terms; (c) your User Content; or (d) any maritime activity you undertake based on information obtained from the Service.</P>
        </Section>

        <Section number="14" title="Disclaimer of Warranties">
          <P>THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND. RIPLOC EXPRESSLY DISCLAIMS ALL IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. RIPLOC DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.</P>
        </Section>

        <Section number="15" title="Changes to These Terms">
          <P>RipLoc reserves the right to modify these Terms at any time. For material changes, we will notify you by email and/or in-app notice at least 14 days before changes take effect. Continued use of the Service after the effective date constitutes acceptance of the revised Terms.</P>
        </Section>

        <Section number="16" title="Governing Law and Dispute Resolution">
          <P>These Terms shall be governed by the laws of the Commonwealth of Virginia. Any dispute shall be resolved exclusively in the state or federal courts located in Virginia, and you consent to personal jurisdiction in those courts.</P>
          <P>WAIVER OF CLASS ACTION: TO THE EXTENT PERMITTED BY LAW, YOU AGREE THAT ANY DISPUTE WILL BE RESOLVED ONLY ON AN INDIVIDUAL BASIS AND NOT IN A CLASS, COLLECTIVE, OR REPRESENTATIVE PROCEEDING.</P>
        </Section>

        <Section number="17" title="General Provisions">
          <P><strong>Entire Agreement.</strong> These Terms and our Privacy Policy constitute the entire agreement between you and RipLoc regarding the Service.</P>
          <P><strong>Severability.</strong> If any provision is found unenforceable, it will be modified to the minimum extent necessary, and remaining provisions will continue in full force.</P>
          <P><strong>No Waiver.</strong> Failure to enforce any right or provision will not be deemed a waiver of that right.</P>
          <P><strong>Assignment.</strong> You may not assign your rights under these Terms. RipLoc may assign these Terms in connection with a merger, acquisition, or asset sale.</P>
        </Section>

        <Section number="18" title="Contact Information">
          <P><strong>RipLoc LLC</strong><br />General: <a href="mailto:support@riploc.app" style={{ color: "#0e7490" }}>support@riploc.app</a><br />Privacy: <a href="mailto:privacy@riploc.app" style={{ color: "#0e7490" }}>privacy@riploc.app</a><br />Virginia, United States</P>
        </Section>

        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 20, marginTop: 8, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
          RipLoc LLC &nbsp;&middot;&nbsp; Terms and Conditions v1.0 &nbsp;&middot;&nbsp; Effective July 9, 2026
        </div>
      </div>
    </div>
  );
}
