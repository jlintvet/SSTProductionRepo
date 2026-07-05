// supabase/functions/admin-send-email/index.ts
// Lets the User Admin page (admin/user_admin.html) email a batch of users
// (e.g. everyone referred by a given ambassador) via Resend.
// Deploy: name the function exactly "admin-send-email", paste this, Deploy.
// Reuses the same RESEND_API_KEY secret as notify-ambassador; riploc.com is
// verified in Resend.
//
// SECURITY: unlike notify-ambassador (public form submit), this function can
// send arbitrary email to any address, so it must only run for admins. The
// admin page calls it with supabase.functions.invoke(), which forwards the
// caller's own access token in the Authorization header — we use that token
// to look up the caller's email via Supabase Auth and reject anyone not in
// ADMIN_EMAILS, mirroring the RLS checks in user-admin-policies.sql /
// ambassador-admin-policies.sql (auth.jwt() ->> 'email' in (...)).
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const FROM = "RipLoc <noreply@riploc.com>";
const ADMIN_EMAILS = ["jlintvet@gmail.com", "jlintvet@butterpayments.com"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.email || !ADMIN_EMAILS.includes(user.email)) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const b = await req.json();
    const recipients: string[] = Array.isArray(b.recipients) ? b.recipients.filter(Boolean) : [];
    const subject: string = (b.subject ?? "").trim();
    const bodyHtml: string = (b.bodyHtml ?? "").trim();
    if (!recipients.length) throw new Error("No recipients provided");
    if (!subject) throw new Error("Subject is required");
    if (!bodyHtml) throw new Error("Body is required");

    // Send individually (not one shared `to` array) so recipients can't see
    // each other's addresses.
    const results = await Promise.all(recipients.map(async (to) => {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: [to],
          reply_to: user.email,
          subject,
          html: bodyHtml,
        }),
      });
      if (!r.ok) return { to, ok: false, error: await r.text() };
      return { to, ok: true };
    }));

    const failed = results.filter(r => !r.ok);
    return new Response(JSON.stringify({ ok: failed.length === 0, sent: results.length - failed.length, failed }), {
      status: failed.length ? 207 : 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
