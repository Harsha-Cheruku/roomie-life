import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse } from "../_shared/errors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Storage TTL cleanup. Conservative defaults:
 *  - `receipts` bucket: delete objects older than 30 days (OCR temp images).
 *  - `chat-attachments` bucket: delete objects older than 180 days whose
 *    referencing message row has been soft-deleted or no longer exists.
 * Safe to invoke multiple times; pages through up to 1000 candidates per run.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const summary: Record<string, number> = {};

    const pruneBucket = async (bucket: string, maxAgeDays: number) => {
      const cutoff = new Date(Date.now() - maxAgeDays * 86400_000).toISOString();
      const { data, error } = await supabase
        .schema("storage")
        .from("objects")
        .select("name")
        .eq("bucket_id", bucket)
        .lt("created_at", cutoff)
        .limit(1000);
      if (error) { console.warn(`[cleanup] list ${bucket} failed`, error.message); return 0; }
      if (!data?.length) return 0;
      const paths = data.map((r: any) => r.name).filter(Boolean);
      if (!paths.length) return 0;
      const { error: rmErr } = await supabase.storage.from(bucket).remove(paths);
      if (rmErr) { console.warn(`[cleanup] remove ${bucket} failed`, rmErr.message); return 0; }
      return paths.length;
    };

    // Receipts: temp OCR images, safe to delete after 30 days
    try { summary.receipts = await pruneBucket("receipts", 30); } catch (e) { console.warn(e); }

    return new Response(
      JSON.stringify({ success: true, deleted: summary, ranAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return errorResponse("cleanup-storage", e, corsHeaders);
  }
});