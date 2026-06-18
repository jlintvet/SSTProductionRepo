// Supabase Edge Function — notify-ambassador
// Sends an email to jlintvet@riploc.com when a new ambassador application is submitted.
// Deploy: npx supabase functions deploy notify-ambassador --project-ref upxerlzdgdbjkbjpuktn
// Secret:  npx supabase secrets set RESEND_API_KEY=re_xxx --project-ref upxerlzdgdbjkbjpuktn

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { name, email, boatName, location, phone, comments } = await req.json();

    const html = `
      <h2>New Riploc Ambassador Application</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
        <tr><td><strong>Name</strong></td><td>${name ?? "—"}</td></tr>
        <tr><td><strong>Email</strong></td><td>${email ?? "—"}</td></tr>
        <tr><td><strong>Boat Name</strong></td><td>${boatName ?? "—"}</td></tr>
        <tr><td><strong>Location</strong></td><td>${location ?? "—"}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${phone ?? "—"}</td></tr>
        <tr><td><strong>Comments</strong></td><td style="max-width:400px;white-space:pre-wrap">${comments ?? "—"}</td></tr>
      </table>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        from:    "Riploc <noreply@riploc.com>",
        to:      ["jlintvet@riploc.com"],
        subject: `Ambassador Application: ${name ?? "Unknown"}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend error: ${err}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
