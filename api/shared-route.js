// api/shared-route.js
// Returns a shared saved route by its share_token.
// Uses service role key so RLS is bypassed (we dropped the public SELECT policy).
// GET /api/shared-route?token=<uuid>

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { token } = req.query;
  if (!token || typeof token !== "string" || token.length > 100) {
    return res.status(400).json({ error: "Invalid token" });
  }

  const { data, error } = await supabase
    .from("saved_routes")
    .select("id, name, waypoints, created_at, user_id")
    .eq("share_token", token)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Route not found" });
  }

  return res.status(200).json(data);
}
