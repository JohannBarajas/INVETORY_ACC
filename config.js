// Supabase → Connect (or Project Settings → API Keys).
// The publishable key is safe to ship in a web page: Row Level Security in
// supabase/schema.sql is what keeps each business's data private.
export const SUPABASE_URL = "https://hbmyukpepkwrrjjhyzac.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_g-78dGKGAJ2clwQkZz2obw_pcAWVrLG";

// Customer catalog code (Settings → Customer catalog link, the part after ?c=).
// When set, the main link opens the catalog first; staff tap "Staff sign in". Leave "" to open on sign-in.
export const CATALOG_CODE = "7397c4ef";
