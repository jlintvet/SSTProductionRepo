// shareLocation.js — utilities for sharing saved fishing locations
import { supabase } from "@/lib/supabase";

// ── Share token helpers ──────────────────────────────────────────────────────

/**
 * Upload a map-teaser PNG to Supabase Storage (public bucket "share-images")
 * and insert a token row into shared_location_tokens.
 *
 * @param {object} location  - Saved location row from Supabase
 * @param {Blob|null} imageBlob - PNG blob from generateShareImage(), or null
 * @returns {Promise<{ token: string, shareUrl: string, imageUrl: string|null }>}
 */
export async function createShareToken(location, imageBlob = null) {
  const token = crypto.randomUUID();
  let imageUrl = null;

  // Upload map teaser image if provided
  if (imageBlob) {
    const filePath = `${token}.png`;
    const { error: uploadError } = await supabase.storage
      .from("share-images")
      .upload(filePath, imageBlob, {
        contentType: "image/png",
        cacheControl: "31536000",  // 1 year — content is static
        upsert: false,
      });

    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from("share-images")
        .getPublicUrl(filePath);
      imageUrl = urlData?.publicUrl ?? null;
    } else {
      console.warn("shareLocation: image upload failed", uploadError.message);
    }
  }

  // Build the public share URL (deep link into the app)
  const appOrigin = window.location.origin;
  const shareUrl  = `${appOrigin}/share/${token}`;

  // Insert token row — expires in 30 days
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await supabase
    .from("shared_location_tokens")
    .insert({
      token,
      location_data: {
        id:        location.id,
        name:      location.name,
        lat:       location.lat,
        lon:       location.lon,
        notes:     location.notes ?? null,
        image_url: imageUrl,
      },
      expires_at: expiresAt,
    });

  if (insertError) {
    throw new Error(`Failed to create share token: ${insertError.message}`);
  }

  return { token, shareUrl, imageUrl };
}

/**
 * Resolve a share token and return location_data, or null if expired/missing.
 * @param {string} token
 */
export async function resolveShareToken(token) {
  const { data, error } = await supabase
    .from("shared_location_tokens")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) return null;
  return data;
}

// ── Favorite contacts helpers ────────────────────────────────────────────────

export async function getFavoriteContacts() {
  const { data, error } = await supabase
    .from("favorite_contacts")
    .select("*")
    .order("nickname");
  if (error) throw error;
  return data ?? [];
}

export async function saveFavoriteContact(nickname, phoneNumber) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("favorite_contacts")
    .insert({ user_id: user.id, nickname, phone_number: phoneNumber })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFavoriteContact(id) {
  const { error } = await supabase
    .from("favorite_contacts")
    .delete()
    .eq("id", id);
  if (error) throw error;
}