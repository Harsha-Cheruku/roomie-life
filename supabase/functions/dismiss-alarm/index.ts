import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate the user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Parse request
    const { trigger_id } = await req.json();
    if (!trigger_id) {
      return new Response(
        JSON.stringify({ error: "trigger_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use service role for atomic operations
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Fetch trigger + alarm in one query
    const { data: trigger, error: fetchErr } = await admin
      .from("alarm_triggers")
      .select("*, alarms!inner(*)")
      .eq("id", trigger_id)
      .single();

    if (fetchErr || !trigger) {
      return new Response(
        JSON.stringify({ error: "Trigger not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Already dismissed
    if (trigger.status !== "ringing") {
      return new Response(
        JSON.stringify({ success: true, already_dismissed: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const alarm = trigger.alarms as any;
    const isOwner = userId === alarm.created_by;

    // Check condition
    const conditionType = alarm.condition_type || "anyone_can_dismiss";
    const conditionValue = alarm.condition_value || 3;

    if (!isOwner) {
      if (conditionType === "owner_only") {
        return new Response(
          JSON.stringify({ error: "Only the alarm owner can dismiss" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (conditionType === "after_rings") {
        // Calculate ring count from elapsed time (5s per ring)
        const elapsedMs =
          Date.now() - new Date(trigger.triggered_at).getTime();
        const currentRings = Math.max(1, Math.floor(elapsedMs / 5000) + 1);
        if (currentRings < conditionValue) {
          return new Response(
            JSON.stringify({
              error: `Must wait ${conditionValue - currentRings} more rings`,
              current_rings: currentRings,
              required_rings: conditionValue,
            }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }

      if (conditionType === "multiple_ack") {
        // Insert acknowledgment
        await admin.from("alarm_acknowledgments").insert({
          trigger_id: trigger.id,
          user_id: userId,
        });

        // Count total acknowledgments
        const { count } = await admin
          .from("alarm_acknowledgments")
          .select("*", { count: "exact", head: true })
          .eq("trigger_id", trigger.id);

        if ((count || 0) < conditionValue) {
          return new Response(
            JSON.stringify({
              error: `Need ${conditionValue - (count || 0)} more acknowledgments`,
              current_acks: count || 0,
              required_acks: conditionValue,
            }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    }

    // Atomic dismiss — only update if still ringing
    const { data: updated, error: updateErr } = await admin
      .from("alarm_triggers")
      .update({
        status: "dismissed",
        dismissed_by: userId,
        dismissed_at: new Date().toISOString(),
      })
      .eq("id", trigger_id)
      .eq("status", "ringing")
      .select("id")
      .maybeSingle();

    if (updateErr) {
      console.error("Error dismissing trigger:", updateErr);
      return new Response(
        JSON.stringify({ error: "Failed to dismiss" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!updated) {
      return new Response(
        JSON.stringify({ success: true, already_dismissed: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, dismissed: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return errorResponse("dismiss-alarm", error, corsHeaders);
  }
});
