// Supabase Edge Function — notify-ambassador
// Sends an email to jlintvet@riploc.com when a new ambassador application is submitted.
// Deploy: npx supabase functions deploy notify-ambassador --project-ref upxerlzdgdbjkbjpuktn
// Secret:  npx supabase secrets set RESEND_API_KEY=re_xxx --project-ref upxerlzdgdbjkbjpuktn

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = new Set(["https://riploc.com", "https://www.riploc.com"]);

/** Escape all HTML special characters to prevent injection into the email body. */
function escHtml(raw: unknown): string {
  if (raw === null || raw === undefined) return "—";
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Vary"] = "Origin";
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { name, email, boatName, location, phone, comments } = await req.json();

    // All fields HTML-escaped before interpolation
    const html = `
      <h2>New Riploc Ambassador Application</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
        <tr><td><strong>Name</strong></td><td>${escHtml(name)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escHtml(email)}</td></tr>
        <tr><td><strong>Boat Name</strong></td><td>${escHtml(boatName)}</td></tr>
        <tr><td><strong>Location</strong></td><td>${escHtml(location)}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${escHtml(phone)}</td></tr>
        <tr><td><strong>Comments</strong></td><td style="max-width:400px;white-space:pre-wrap">${escHtml(comments)}</td></tr>
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
        subject: `Ambassador Application: ${escHtml(name)}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend error: ${err}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
